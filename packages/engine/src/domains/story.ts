import { binaryToBytes, concatBytes, encodeJsonString } from '../cst/doc.ts';
import { appendArrayItem, literal, resolve, type Op, type PathStep } from '../edit.ts';
import type { KeyMap } from '../keys/mapping.ts';
import type { SaveReader } from './reader.ts';
import presetsData from './story-data/presets.json' with { type: 'json' };

/**
 * Skip a chunk of story: rather than reverse-engineer what "complete" means for ~150
 * interlocking mission scripts ourselves, this uses the step values the community has already
 * mapped (okranger1777/nms-mission-progress, MIT — see THIRD_PARTY_NOTICES.md), which record the
 * `Progress` number each mission reaches once actually finished in-game.
 *
 * Never regresses anything: a mission already at or past its "complete" value is left alone, so
 * running this on a save that's ahead of one path but behind another only fills the gap.
 */

export interface StoryPreset {
  id: string;
  label: string;
  /** Raw mission id (e.g. `^ACT2_STEP10`) → the Progress value that means "done". */
  steps: Readonly<Record<string, number>>;
}

const DATA = presetsData as Record<string, Record<string, number>>;

export const STORY_PRESETS: readonly StoryPreset[] = [
  { id: 'artemis-atlas', label: 'Complete the Artemis + Atlas paths', steps: DATA['artemis-atlas'] ?? {} },
];

export function storyPreset(id: string): StoryPreset {
  const p = STORY_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown story preset: ${id}`);
  return p;
}

interface Entry {
  arrayIndex: number;
  progress: number;
}

function findEntry(r: SaveReader, missionProgressPath: readonly PathStep[], missionId: string): Entry | undefined {
  const n = r.count(missionProgressPath, r.player);
  for (let i = 0; i < n; i++) {
    const node = r.node([...missionProgressPath, i], r.player);
    if (r.text(['Mission'], node) === missionId) {
      return { arrayIndex: i, progress: Number(r.num(['Progress'], node) ?? Number.NEGATIVE_INFINITY) };
    }
  }
  return undefined;
}

function entryBytes(keys: KeyMap, missionId: string, progress: number): Uint8Array {
  const k = (name: string) => encodeJsonString(keys.style === 'plain' ? name : keys.key(name));
  const part = (name: string, valueBytes: Uint8Array) => concatBytes([k(name), binaryToBytes(':'), valueBytes]);
  const obj = (pairs: Uint8Array[]) => concatBytes([binaryToBytes('{'), ...pairs.flatMap((p, i) => (i ? [binaryToBytes(','), p] : [p])), binaryToBytes('}')]);
  return obj([
    part('Mission', literal.string(missionId)),
    part('Progress', literal.number(progress)),
    part('Seed', literal.number(0)),
    part('Data', literal.number(0)),
    part('Stat', literal.number(0)),
    part('Participants', binaryToBytes('[]')),
  ]);
}

/**
 * Advance every mission in the preset that isn't already there yet, and point `CurrentMissionID`
 * at the mission with the highest step number this preset just finished, so the game's next
 * autosave picks the story back up cleanly. Always call this against a NEW slot copy — see
 * docs/format/linked-data.md and packages/engine/src/merge — never the original save.
 */
export function applyStoryPreset(label: string, playerPath: readonly PathStep[], source: SaveReader, preset: StoryPreset): Op {
  const missionProgressPath = [...playerPath, 'MissionProgress'];
  const toAppend: Uint8Array[] = [];
  const toUpdate: { arrayIndex: number; progress: number }[] = [];
  let furthest: { id: string; progress: number } | undefined;

  for (const [missionId, targetProgress] of Object.entries(preset.steps)) {
    const existing = findEntry(source, ['MissionProgress'], missionId);
    if (!existing) {
      toAppend.push(entryBytes(source.keys, missionId, targetProgress));
    } else if (existing.progress < targetProgress) {
      toUpdate.push({ arrayIndex: existing.arrayIndex, progress: targetProgress });
    }
    if (!existing || existing.progress < targetProgress) {
      if (!furthest || targetProgress > furthest.progress) furthest = { id: missionId, progress: targetProgress };
    }
  }

  return {
    label,
    compile(doc, keys) {
      const splices = toUpdate.map((u) => {
        const node = resolve(doc, keys, [...missionProgressPath, u.arrayIndex, 'Progress']);
        return { start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes: literal.number(u.progress) };
      });
      for (const bytes of toAppend) {
        splices.push(...appendArrayItem(label, missionProgressPath, bytes).compile(doc, keys));
      }
      if (furthest) {
        const idNode = resolve(doc, keys, [...playerPath, 'CurrentMissionID']);
        splices.push({ start: doc.tree.start[idNode]!, end: doc.tree.end[idNode]!, bytes: literal.string(furthest.id) });
      }
      return splices;
    },
  };
}

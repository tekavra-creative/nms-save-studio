import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyStoryPreset,
  EditSession,
  finalizeNewSlot,
  KeyMap,
  randomUniversalId,
  SaveFile,
  SaveReader,
  slotFile,
  STORY_PRESETS,
  storyPreset,
  type MappingFile,
} from '@nss/engine';
import { listSlots, nextNewSlot, writeSlotFile, type SlotEntry } from '@nss/io';
import type { StoryPresetListEntryView, StoryPreviewView, WriteResultView } from '../shared/api.ts';
import { shortPlace } from './merge.ts';

interface StorySession {
  id: string;
  root: string;
  sourceSlot: number;
  sourceTitle: string;
  entry: SlotEntry;
  file: SaveFile;
  keys: KeyMap;
  session: EditSession;
  presetId: string;
  fromMissionId: string;
  toMissionId: string;
  filled: number;
}

const sessions = new Map<string, StorySession>();

function get(id: string): StorySession {
  const s = sessions.get(id);
  if (!s) throw new Error('This story-skip session was closed — open it again.');
  return s;
}

export function storyPresets(): StoryPresetListEntryView[] {
  return STORY_PRESETS.map((p) => ({ id: p.id, label: p.label, stepCount: Object.keys(p.steps).length }));
}

function view(s: StorySession): StoryPreviewView {
  return {
    storyId: s.id,
    root: s.root,
    sourceSlot: s.sourceSlot,
    sourceTitle: s.sourceTitle,
    presetId: s.presetId,
    fromMissionId: s.fromMissionId,
    toMissionId: s.toMissionId,
    filled: s.filled,
    newSlot: nextNewSlot(listSlots(s.root)) ?? null,
  };
}

export function openStoryPreview(mapping: MappingFile, root: string, sourceSlot: number, presetId: string): StoryPreviewView {
  const info = listSlots(root)[sourceSlot - 1];
  const entry = info?.latest;
  if (!entry) throw new Error(`Slot ${sourceSlot} is empty.`);
  const file = new SaveFile(
    new Uint8Array(readFileSync(join(root, entry.ref.dataName))),
    new Uint8Array(readFileSync(join(root, entry.ref.manifestName))),
    entry.ref.manifestSlotIndex,
  );
  const keys = KeyMap.forDoc(mapping, file.doc);
  const sourceTitle = entry.manifest?.saveName || shortPlace(entry.manifest?.saveSummary) || `Slot ${sourceSlot}`;
  // file.doc never changes — EditSession.apply() replaces its OWN internal doc, so reading
  // file.doc before and session.doc after gives us a clean "before vs. after" comparison.
  const before = new SaveReader(file.doc, keys);
  const fromMissionId = before.text(['CurrentMissionID'], before.player) ?? '';
  const preset = storyPreset(presetId);

  let filled = 0;
  for (const [missionId, target] of Object.entries(preset.steps)) {
    const n = before.count(['MissionProgress'], before.player);
    let had: number | undefined;
    for (let i = 0; i < n; i++) {
      const node = before.node(['MissionProgress', i], before.player);
      if (before.text(['Mission'], node) === missionId) {
        had = Number(before.num(['Progress'], node) ?? Number.NEGATIVE_INFINITY);
        break;
      }
    }
    if (had === undefined || had < target) filled++;
  }

  const session = new EditSession(file.doc, keys);
  session.apply(applyStoryPreset(`Preview: ${preset.label}`, before.playerPath, before, preset));
  const toMissionId = new SaveReader(session.doc, keys).text(['CurrentMissionID'], before.player) ?? fromMissionId;

  const s: StorySession = { id: crypto.randomUUID(), root, sourceSlot, sourceTitle, entry, file, keys, session, presetId, fromMissionId, toMissionId, filled };
  sessions.set(s.id, s);
  return view(s);
}

export async function writeStoryPreset(id: string, name: string): Promise<WriteResultView> {
  const s = get(id);
  const slot = nextNewSlot(listSlots(s.root));
  if (!slot) throw new Error('Every save slot is full — delete one in the game first.');
  const target = slotFile(slot, 'auto');
  const finalName = name.trim() || `${s.sourceTitle} — story skip`.slice(0, 120);
  const encoded = finalizeNewSlot(s.file, s.session, { target, name: finalName, universalId: randomUniversalId() });
  const base = process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/NMS Save Studio') : join(process.env['APPDATA'] ?? join(homedir(), 'AppData/Roaming'), 'NMS Save Studio');
  const res = await writeSlotFile({
    root: s.root,
    ref: target,
    encoded,
    expect: { data: null, meta: null },
    snapshotDir: join(base, 'Snapshots'),
    reason: `story-skip-${s.presetId}-from-${s.sourceSlot}`,
  });
  return { slot, file: target.dataName, name: finalName, snapshot: res.snapshot, bytes: res.verified.decompressedSize };
}

export function closeStoryPreview(id: string): void {
  sessions.delete(id);
}

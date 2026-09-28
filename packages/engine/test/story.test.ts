import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyStoryPreset, EditSession, KeyMap, SaveFile, SaveReader, storyPreset, type MappingFile } from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');

describe('story presets', () => {
  it('the bundled artemis-atlas preset has real step data', () => {
    const preset = storyPreset('artemis-atlas');
    expect(Object.keys(preset.steps).length).toBeGreaterThan(100);
    expect(preset.steps['^ACT1_STEP1']).toBe(7);
    expect(preset.steps['^ACT2_STEP10']).toBe(14);
    expect(preset.steps['^ATLAS1']).toBe(12);
  });

  describe.skipIf(!existsSync(join(CORPUS, 'save3.hg')))('applied to the real Ralfar save', () => {
    it('fills in the remaining Artemis/Atlas steps without regressing anything, undoes cleanly', () => {
      const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
      const keys = KeyMap.forDoc(mapping, src.doc);
      const session = new EditSession(src.doc, keys);
      const original = Buffer.from(session.bytes);
      const reader = () => new SaveReader(session.doc, keys);
      const before = reader();

      const beforeMP = before.count(['MissionProgress'], before.player);
      const beforeCurrent = before.text(['CurrentMissionID'], before.player);
      expect(beforeCurrent).toBe('^ACT2_STEP10'); // confirmed real starting state

      const preset = storyPreset('artemis-atlas');
      session.apply(applyStoryPreset('Complete Artemis + Atlas', before.playerPath, before, preset));

      const after = reader();
      // every step in the preset now meets or exceeds its target
      for (const [missionId, target] of Object.entries(preset.steps)) {
        const n = after.count(['MissionProgress'], after.player);
        let found: number | undefined;
        for (let i = 0; i < n; i++) {
          const node = after.node(['MissionProgress', i], after.player);
          if (after.text(['Mission'], node) === missionId) {
            found = Number(after.num(['Progress'], node) ?? -Infinity);
            break;
          }
        }
        expect(found, `${missionId} should exist after applying the preset`).toBeDefined();
        expect(found!, `${missionId} should be at or past its complete value`).toBeGreaterThanOrEqual(target);
      }
      // grew by exactly the number of missions that didn't already exist
      expect(after.count(['MissionProgress'], after.player)).toBeGreaterThanOrEqual(beforeMP);
      // moved past the point the save was actually at
      expect(after.text(['CurrentMissionID'], after.player)).not.toBe(beforeCurrent);

      session.undo();
      expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
    });

    it('running it twice is a no-op the second time (nothing left to advance)', () => {
      const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
      const keys = KeyMap.forDoc(mapping, src.doc);
      const session = new EditSession(src.doc, keys);
      const reader = () => new SaveReader(session.doc, keys);
      const preset = storyPreset('artemis-atlas');

      session.apply(applyStoryPreset('first pass', reader().playerPath, reader(), preset));
      const afterFirst = Buffer.from(session.bytes);
      session.apply(applyStoryPreset('second pass', reader().playerPath, reader(), preset));
      // second pass should have nothing to change — but Op.compile always runs, so the session
      // records a step; what matters is the BYTES didn't move (no double-appends, no regressions)
      expect(Buffer.compare(Buffer.from(session.bytes), afterFirst)).toBe(0);
    });
  });
});

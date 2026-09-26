import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EditSession,
  freeSlot,
  KeyMap,
  readOverview,
  SaveFile,
  SaveReader,
  shipCustomisationIndex,
  transferAsset,
  type MappingFile,
} from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');
const open = (name: string, slotIndex: number) =>
  new SaveFile(new Uint8Array(readFileSync(join(CORPUS, name))), new Uint8Array(readFileSync(join(CORPUS, `mf_${name}`))), slotIndex);

describe('customisation index map', () => {
  it('maps ship slots 0–5 to 3–8 and 6–11 to 17–22', () => {
    expect([0, 5, 6, 11].map(shipCustomisationIndex)).toEqual([3, 8, 17, 22]);
  });
});

describe.skipIf(!existsSync(join(CORPUS, 'save5.hg')))('asset transfer (real saves)', () => {
  it('copies the Explorer and Sentinel ships plus the multi-tool into Ralfar with every linked piece', () => {
    const target = open('save3.hg', 4);
    const source = open('save5.hg', 6);
    const keys = KeyMap.forDoc(mapping, target.doc);
    const sr = new SaveReader(source.doc, KeyMap.forDoc(mapping, source.doc));
    const session = new EditSession(target.doc, keys);
    const original = Buffer.from(target.doc.bytes);
    const reader = () => new SaveReader(session.doc, keys);

    const moved: [number, number][] = [];
    for (const srcSlot of [0, 1]) {
      const slot = freeSlot('ship', reader(), new Set(moved.map(([, t]) => t)));
      if (typeof slot !== 'number') throw new Error(slot.reason);
      session.apply(transferAsset('ship', sr, srcSlot, reader(), slot, `Bring ship ${srcSlot} → slot ${slot}`));
      moved.push([srcSlot, slot]);
    }
    const toolSlot = freeSlot('multitool', reader());
    if (typeof toolSlot !== 'number') throw new Error(toolSlot.reason);
    session.apply(transferAsset('multitool', sr, 0, reader(), toolSlot, 'Bring multi-tool'));

    const after = reader();
    const o = readOverview(after);
    expect(o.ships.map((s) => s.kind).sort()).toEqual(['Boundary Herald', 'Explorer', 'Fighter', 'Sentinel Interceptor']);
    expect(o.multitools).toHaveLength(2);
    // primary ship unchanged
    expect(o.ships.find((s) => s.primary)?.kind).toBe('Boundary Herald');
    // every linked piece is byte-identical to the source's
    for (const [s, t] of moved) {
      const same = (path: (string | number)[], a: number, b: number) =>
        Buffer.from(after.doc.span(after.node([...path.slice(0, -1), b], after.player))).equals(
          Buffer.from(sr.doc.span(sr.node([...path.slice(0, -1), a], sr.player))),
        );
      expect(same(['ShipOwnership', 0], s, t)).toBe(true);
      expect(same(['ShipUsesLegacyColours', 0], s, t)).toBe(true);
      expect(same(['CharacterCustomisationData', 0], shipCustomisationIndex(s), shipCustomisationIndex(t))).toBe(true);
    }
    // array lengths never change (parallel indices stay aligned)
    expect(after.count(['ShipOwnership'], after.player)).toBe(12);
    expect(after.count(['CharacterCustomisationData'], after.player)).toBe(26);

    while (session.canUndo) session.undo();
    expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENCY_CAP,
  EditSession,
  KeyMap,
  learnListItems,
  mergePortalGlyphs,
  mergeWordGroups,
  missingListItems,
  planCurrency,
  readKnowledge,
  SaveFile,
  SaveReader,
  setCurrency,
  type KnownList,
  type MappingFile,
} from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');
const open = (name: string, slotIndex: number) =>
  new SaveFile(new Uint8Array(readFileSync(join(CORPUS, name))), new Uint8Array(readFileSync(join(CORPUS, `mf_${name}`))), slotIndex);

describe.skipIf(!existsSync(join(CORPUS, 'save5.hg')))('merge knowledge + currencies (real saves)', () => {
  it('merges Space Anomaly knowledge and currencies into Ralfar, and undoes cleanly', () => {
    const target = open('save3.hg', 4);
    const source = open('save5.hg', 6);
    const keys = KeyMap.forDoc(mapping, target.doc);
    const tr = new SaveReader(target.doc, keys);
    const sr = new SaveReader(source.doc, KeyMap.forDoc(mapping, source.doc));
    const session = new EditSession(target.doc, keys);
    const before = readKnowledge(tr);
    const original = Buffer.from(target.doc.bytes);

    for (const field of ['Units', 'Nanites', 'Specials'] as const) {
      const plan = planCurrency(field, tr, sr, 'sum');
      expect(plan.result).toBe(plan.target + plan.source <= CURRENCY_CAP ? plan.target + plan.source : CURRENCY_CAP);
      session.apply(setCurrency(tr.playerPath, plan));
    }
    const lists: KnownList[] = ['KnownTech', 'KnownProducts', 'KnownSpecials', 'KnownRefinerRecipes'];
    const gained: Record<string, number> = {};
    for (const list of lists) {
      const items = missingListItems(list, new SaveReader(session.doc, keys), sr);
      gained[list] = items.length;
      session.apply(learnListItems(tr.playerPath, list, items, `Learn ${items.length} from ${list}`));
    }
    const words = mergeWordGroups(tr.playerPath, new SaveReader(session.doc, keys), sr);
    if (words) session.apply(words);
    const glyphs = mergePortalGlyphs(tr.playerPath, new SaveReader(session.doc, keys), sr);
    if (glyphs) session.apply(glyphs);

    const after = new SaveReader(session.doc, keys);
    const k = readKnowledge(after);
    expect(k.technology).toBe(before.technology + gained.KnownTech!);
    expect(k.products).toBe(before.products + gained.KnownProducts!);
    expect(k.portalGlyphs).toBe(16);
    expect(Number(after.num(['Nanites'], after.player))).toBe(4673 + 8060);
    // no duplicates were introduced
    for (const list of lists) {
      const raws = after.items([list], after.player).map((n) => after.doc.raw(n));
      expect(new Set(raws).size).toBe(raws.length);
    }
    // merging again is a no-op
    for (const list of lists) expect(missingListItems(list, after, sr)).toHaveLength(0);
    expect(mergeWordGroups(tr.playerPath, after, sr)).toBeUndefined();

    while (session.canUndo) session.undo();
    expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearSlot,
  EditSession,
  fillSlot,
  KeyMap,
  readContainer,
  SaveFile,
  SaveReader,
  setSlotAmount,
  setSlotItem,
  type MappingFile,
} from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');
const container = (keys: KeyMap) => keys.path('BaseContext', 'PlayerStateData', 'Inventory');

describe.skipIf(!existsSync(join(CORPUS, 'save3.hg')))('inventory (real save)', () => {
  it('reads the exosuit general inventory: real slots, positions, and unlocked-cell list', () => {
    const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
    const r = new SaveReader(src.doc, KeyMap.forDoc(mapping, src.doc));
    const c = readContainer(r, container(r.keys));
    expect(c.width).toBe(10);
    expect(c.height).toBe(12);
    expect(c.validCells.length).toBeGreaterThan(0);
    expect(c.slots.length).toBeGreaterThan(0);
    const first = c.slots[0]!;
    expect(first.id).toBe('^BP_SALVAGE');
    expect(first.invType).toBe('Product');
    expect(first.amount).toBe(11);
    expect(first.maxAmount).toBe(30);
    expect([first.x, first.y]).toEqual([1, 3]);
    // every occupied cell must actually be one of the unlocked cells
    const validSet = new Set(c.validCells.map(([x, y]) => `${x},${y}`));
    for (const s of c.slots) expect(validSet.has(`${s.x},${s.y}`)).toBe(true);
  });

  it('changes an existing slot amount, undoes cleanly', () => {
    const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
    const keys = KeyMap.forDoc(mapping, src.doc);
    const session = new EditSession(src.doc, keys);
    const original = Buffer.from(session.bytes);
    const before = readContainer(new SaveReader(session.doc, keys), container(keys)).slots[0]!;
    session.apply(setSlotAmount('set amount', container(keys), before.arrayIndex, 99));
    const after = readContainer(new SaveReader(session.doc, keys), container(keys)).slots[before.arrayIndex]!;
    expect(after.amount).toBe(99);
    expect(after.id).toBe(before.id); // untouched
    session.undo();
    expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
  });

  it('replaces an existing slot\'s item entirely, keeping its position', () => {
    const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
    const keys = KeyMap.forDoc(mapping, src.doc);
    const session = new EditSession(src.doc, keys);
    const before = readContainer(new SaveReader(session.doc, keys), container(keys)).slots[0]!;
    session.apply(setSlotItem('swap item', container(keys), before.arrayIndex, '^FUEL1', 'Substance', 500, 9999));
    const after = readContainer(new SaveReader(session.doc, keys), container(keys)).slots[before.arrayIndex]!;
    expect(after).toMatchObject({ id: '^FUEL1', invType: 'Substance', amount: 500, maxAmount: 9999, x: before.x, y: before.y });
  });

  it('fills an empty unlocked cell with a new item, and clears it back out, byte-identical after undo', () => {
    const src = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))), 4);
    const keys = KeyMap.forDoc(mapping, src.doc);
    const session = new EditSession(src.doc, keys);
    const original = Buffer.from(session.bytes);
    const reader = () => new SaveReader(session.doc, keys);
    const c0 = readContainer(reader(), container(keys));
    const occupied = new Set(c0.slots.map((s) => `${s.x},${s.y}`));
    const empty = c0.validCells.find(([x, y]) => !occupied.has(`${x},${y}`));
    expect(empty).toBeDefined();
    const [x, y] = empty!;

    session.apply(fillSlot('fill', container(keys), x, y, '^CARBON', 'Substance', 250, 9999));
    const c1 = readContainer(reader(), container(keys));
    expect(c1.slots).toHaveLength(c0.slots.length + 1);
    const placed = c1.slots.find((s) => s.x === x && s.y === y);
    expect(placed).toMatchObject({ id: '^CARBON', invType: 'Substance', amount: 250, maxAmount: 9999 });

    session.apply(clearSlot('clear', container(keys), placed!.arrayIndex));
    const c2 = readContainer(reader(), container(keys));
    expect(c2.slots).toHaveLength(c0.slots.length);
    expect(c2.slots.some((s) => s.x === x && s.y === y)).toBe(false);

    while (session.canUndo) session.undo();
    expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
  });
});

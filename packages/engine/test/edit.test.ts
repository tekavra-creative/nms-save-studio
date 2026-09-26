import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  appendArrayItem,
  binaryToBytes,
  bytesToBinary,
  decompressSave,
  EditSession,
  JsonDoc,
  KeyMap,
  literal,
  parseManifest,
  prepareSlotCopy,
  removeArrayItem,
  SaveFile,
  setMember,
  setNumber,
  setString,
  slotFile,
  splitPayload,
  type MappingFile,
  type Op,
} from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const plain: MappingFile = { libMBIN_version: 'test', Mapping: [] };
const doc = (s: string) => new JsonDoc(binaryToBytes(s));
const session = (s: string) => {
  const d = doc(s);
  return new EditSession(d, new KeyMap(plain, 'plain'));
};
const text = (e: EditSession) => bytesToBinary(e.bytes);

describe('edit session', () => {
  it('sets, appends, removes and adds members losslessly', () => {
    const e = session('{"Version":1,"a":[1,2,3],"b":{"x":"\xe9"},"n":18446744073709551615}');
    e.apply(setNumber('n', ['a', 1], 20));
    e.apply(appendArrayItem('push', ['a'], literal.number(4)));
    e.apply(removeArrayItem('drop first', ['a'], 0));
    e.apply(setMember('add y', ['b'], 'y', literal.boolean(true)));
    e.apply(setString('name', ['b', 'x'], 'caf\xc3\xa9'));
    expect(text(e)).toBe('{"Version":1,"a":[20,3,4],"b":{"x":"caf\xc3\xa9","y":true},"n":18446744073709551615}');
    expect(e.history).toHaveLength(5);
    while (e.canUndo) e.undo();
    expect(text(e)).toBe('{"Version":1,"a":[1,2,3],"b":{"x":"\xe9"},"n":18446744073709551615}');
    while (e.canRedo) e.redo();
    expect(text(e)).toBe('{"Version":1,"a":[20,3,4],"b":{"x":"caf\xc3\xa9","y":true},"n":18446744073709551615}');
  });

  it('removing the last/only items keeps valid JSON', () => {
    const e = session('{"Version":1,"a":[1,2]}');
    e.apply(removeArrayItem('last', ['a'], 1));
    e.apply(removeArrayItem('only', ['a'], 0));
    expect(text(e)).toBe('{"Version":1,"a":[]}');
    e.apply(appendArrayItem('into empty', ['a'], literal.string('z')));
    expect(text(e)).toBe('{"Version":1,"a":["z"]}');
  });

  it('any sequence of edits fully undoes to the original bytes', () => {
    const original = '{"Version":1,"list":[0,1,2,3,4,5],"obj":{"k":"v"}}';
    const opArb: fc.Arbitrary<(e: EditSession) => Op | undefined> = fc.oneof(
      fc.integer({ min: 0, max: 9 }).map((v) => (e: EditSession) => {
        const n = e.doc.childCount(e.doc.at(['list']));
        return n ? setNumber('set', ['list', v % n], v * 7) : undefined;
      }),
      fc.integer({ min: 0, max: 99 }).map((v) => () => appendArrayItem('push', ['list'], literal.number(v))),
      fc.integer({ min: 0, max: 9 }).map((i) => (e: EditSession) => {
        const n = e.doc.childCount(e.doc.at(['list']));
        return n ? removeArrayItem('pop', ['list'], i % n) : undefined;
      }),
      fc.string({ maxLength: 6 }).map((s) => () => setMember('member', ['obj'], 'k' + s.length, literal.string(s.replace(/[^\x20-\x7e]/g, '')))),
    );
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 25 }), (makers) => {
        const e = session(original);
        for (const make of makers) {
          const op = make(e);
          if (op) e.apply(op);
          new JsonDoc(e.bytes); // stays well-formed after every step
        }
        while (e.canUndo) e.undo();
        return text(e) === original;
      }),
      { numRuns: 300 },
    );
  });
});

const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');

describe.skipIf(!existsSync(join(CORPUS, 'save3.hg')))('slot copy (real save)', () => {
  it('copies Ralfar to slot 4 with a new identity and name; nothing else changes', () => {
    const src = new SaveFile(
      new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))),
      new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))),
      4,
    );
    const target = slotFile(4, 'auto');
    const id = 0x1122334455667788n;
    const { encoded, session } = prepareSlotCopy(src, mapping, { target, name: 'Studio Test', universalId: id, now: 1_790_000_000_000 });
    const m = parseManifest(encoded.manifest, target.manifestSlotIndex);
    expect(m.saveName).toBe('Studio Test');
    expect(m.saveSummary).toBe('In the Ralfar system');
    expect(Buffer.from(m.slotId).toString('hex')).toBe('8877665544332211');
    expect(m.timestamp).toBe(1_790_000_000);
    const out = new JsonDoc(splitPayload(decompressSave(encoded.data)).json);
    const k = KeyMap.forDoc(mapping, out);
    expect(out.string(out.at(k.path('CommonStateData', 'SaveUniversalId')))).toBe('0x1122334455667788');
    expect(out.string(out.at(k.path('CommonStateData', 'SaveName')))).toBe('Studio Test');
    // only the two edited values differ from the source
    const a = bytesToBinary(src.doc.bytes);
    const b = bytesToBinary(out.bytes);
    expect(b.length - a.length).toBe('Studio Test'.length);
    expect(session.history).toEqual(['Copy to slot 4 as “Studio Test”']);
    expect(m.decompressedSize).toBe(out.bytes.length + 1);
  });
});

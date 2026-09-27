import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  binaryToBytes,
  bytesToBinary,
  duplicateArrayItem,
  EditSession,
  getLeaf,
  JsonDoc,
  KeyMap,
  listChildren,
  removeArrayItem,
  SaveFile,
  searchTree,
  setLeaf,
  type MappingFile,
} from '../src/index.ts';

// Generic tree browser/editor: no ship/currency/knowledge assumptions anywhere. These tests use
// arbitrary JSON shapes on purpose, to prove the API doesn't quietly depend on NMS's schema.
const plain: MappingFile = { libMBIN_version: 'test', Mapping: [] };
const plainKeys = new KeyMap(plain, 'plain');
const doc = (s: string) => new JsonDoc(binaryToBytes(s));

describe('explorer: generic tree browsing', () => {
  it('lists object members with raw keys as names when nothing maps them', () => {
    const d = doc('{"widgets":7,"nested":{"a":1,"b":"x"},"tags":["p","q"]}');
    const rows = listChildren(d, plainKeys, []);
    expect(rows).toEqual([
      { key: 'widgets', name: 'widgets', kind: 'number', childCount: -1, preview: '7' },
      { key: 'nested', name: 'nested', kind: 'object', childCount: 2, preview: '{2}' },
      { key: 'tags', name: 'tags', kind: 'array', childCount: 2, preview: '[2]' },
    ]);
  });

  it('lists array items by numeric index, and walks nested paths of either shape', () => {
    const d = doc('{"tags":["p","q","r"]}');
    const rows = listChildren(d, plainKeys, ['tags']);
    expect(rows.map((r) => [r.key, r.preview])).toEqual([[0, 'p'], [1, 'q'], [2, 'r']]);
  });

  it('maps a raw key to a readable name when the mapping file knows it, arbitrary domain', () => {
    const mapping: MappingFile = { libMBIN_version: 'test', Mapping: [{ Key: 'xYz', Value: 'FavoriteColor' }] };
    const keys = new KeyMap(mapping, 'obfuscated');
    const d = doc('{"xYz":"teal","unk":1}');
    const rows = listChildren(d, keys, []);
    expect(rows).toEqual([
      { key: 'xYz', name: 'FavoriteColor', kind: 'string', childCount: -1, preview: 'teal' },
      { key: 'unk', name: 'unk', kind: 'number', childCount: -1, preview: '1' }, // unknown key: raw key shown as-is
    ]);
  });

  it('reads exact leaf values by kind, including a u64 beyond Number.MAX_SAFE_INTEGER', () => {
    const d = doc('{"s":"hi","n":3.5,"big":18446744073709551615,"t":true,"f":false,"z":null}');
    expect(getLeaf(d, ['s'])).toEqual({ kind: 'string', value: 'hi' });
    expect(getLeaf(d, ['n'])).toEqual({ kind: 'number', value: 3.5 });
    expect(getLeaf(d, ['big'])).toEqual({ kind: 'number', value: 18446744073709551615n });
    expect(getLeaf(d, ['t'])).toEqual({ kind: 'boolean', value: true });
    expect(getLeaf(d, ['f'])).toEqual({ kind: 'boolean', value: false });
    expect(getLeaf(d, ['z'])).toEqual({ kind: 'null', value: null });
  });

  it('edits a leaf in place, undoes and redoes, and refuses to change a field to a different kind', () => {
    const d = doc('{"any":{"count":5},"list":["a","b"]}');
    const e = new EditSession(d, plainKeys);
    e.apply(setLeaf('edit count', ['any', 'count'], 'number', '99'));
    e.apply(setLeaf('edit item', ['list', 1], 'string', 'z'));
    expect(bytesToBinary(e.bytes)).toBe('{"any":{"count":99},"list":["a","z"]}');
    expect(e.history).toEqual(['edit count', 'edit item']);
    e.undo();
    e.undo();
    expect(bytesToBinary(e.bytes)).toBe('{"any":{"count":5},"list":["a","b"]}');
    e.redo();
    e.redo();
    expect(bytesToBinary(e.bytes)).toBe('{"any":{"count":99},"list":["a","z"]}');
    expect(() => e.apply(setLeaf('bad', ['any', 'count'], 'string', 'nope'))).toThrow(/is number, not string/);
  });

  it('throws for a path that does not exist, and for browsing into a leaf', () => {
    const d = doc('{"a":1}');
    expect(() => listChildren(d, plainKeys, ['missing'])).toThrow(/path not found/);
    expect(() => listChildren(d, plainKeys, ['a'])).toThrow(/not a container/);
    expect(() => getLeaf(d, [])).toThrow(/not a leaf/);
  });

  it('duplicates an array item (object shape) as a template for a new entry, and removes it again', () => {
    const d = doc('{"list":[{"id":1,"tag":"a"},{"id":2,"tag":"b"}]}');
    const e = new EditSession(d, plainKeys);
    e.apply(duplicateArrayItem('dup', ['list'], 1));
    expect(bytesToBinary(e.bytes)).toBe('{"list":[{"id":1,"tag":"a"},{"id":2,"tag":"b"},{"id":2,"tag":"b"}]}');
    expect(listChildren(e.doc, plainKeys, ['list'])).toHaveLength(3);
    e.apply(removeArrayItem('rm', ['list'], 2));
    expect(bytesToBinary(e.bytes)).toBe('{"list":[{"id":1,"tag":"a"},{"id":2,"tag":"b"}]}');
    e.undo();
    e.undo();
    expect(bytesToBinary(e.bytes)).toBe('{"list":[{"id":1,"tag":"a"},{"id":2,"tag":"b"}]}');
  });

  it('duplicates the sole item into an array with one item, and into an empty array via append first', () => {
    const d = doc('{"list":["x"]}');
    const e = new EditSession(d, plainKeys);
    e.apply(duplicateArrayItem('dup', ['list'], 0));
    expect(bytesToBinary(e.bytes)).toBe('{"list":["x","x"]}');
  });

  it('search finds a match by name or by value, anywhere under the given root, across mixed kinds', () => {
    const mapping: MappingFile = { libMBIN_version: 'test', Mapping: [{ Key: 'nmz', Value: 'DiscoveryName' }] };
    const keys = new KeyMap(mapping, 'obfuscated');
    const d = doc('{"a":{"nmz":"Crimson Vale","b":[{"x":1},{"x":42}]},"c":"contains crimson too"}');
    const byName = searchTree(d, keys, [], 'discoveryname');
    expect(byName).toEqual([{ path: ['a', 'nmz'], name: 'DiscoveryName', kind: 'string', preview: 'Crimson Vale' }]);

    const byValue = searchTree(d, keys, [], 'crimson');
    expect(byValue.map((h) => h.path)).toEqual([['a', 'nmz'], ['c']]);

    const scoped = searchTree(d, keys, ['a', 'b'], '42');
    expect(scoped).toEqual([{ path: ['a', 'b', 1, 'x'], name: 'x', kind: 'number', preview: '42' }]);

    expect(searchTree(d, keys, [], '')).toEqual([]);
    expect(searchTree(d, keys, [], 'nope-nowhere')).toEqual([]);
  });

  it('search respects a limit so a broad query on a huge tree still returns quickly', () => {
    const items = Array.from({ length: 50 }, (_, i) => `{"v":${i}}`).join(',');
    const d = doc(`{"list":[${items}]}`);
    expect(searchTree(d, plainKeys, [], 'v', 5)).toHaveLength(5);
  });
});

const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');

describe.skipIf(!existsSync(join(CORPUS, 'save3.hg')))('explorer: real save (Ralfar)', () => {
  it('browses the root of a real save and edits an arbitrary leaf losslessly', () => {
    const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
    const src = new SaveFile(
      new Uint8Array(readFileSync(join(CORPUS, 'save3.hg'))),
      new Uint8Array(readFileSync(join(CORPUS, 'mf_save3.hg'))),
      4,
    );
    const keys = KeyMap.forDoc(mapping, src.doc);
    const root = listChildren(src.doc, keys, []);
    expect(root.length).toBeGreaterThan(5);
    // Every named row's readable name round-trips back through the mapping to its own raw key.
    for (const row of root) if (row.name !== row.key) expect(keys.key(row.name)).toBe(row.key);

    // TotalPlayTime: a real numeric field, nested two levels deep, not touched by any other feature.
    const path = keys.path('CommonStateData', 'TotalPlayTime');
    const before = getLeaf(src.doc, path);
    expect(before.kind).toBe('number');
    expect(typeof before.value).toBe('number');

    const e = new EditSession(src.doc, keys);
    e.apply(setLeaf('edit playtime', path, 'number', '99999'));
    expect(getLeaf(e.doc, path)).toEqual({ kind: 'number', value: 99999 });
    // nothing else in the tree moved
    const a = bytesToBinary(src.doc.bytes);
    const b = bytesToBinary(e.bytes);
    expect(b.length - a.length).toBe('99999'.length - String(before.value).length);
    e.undo();
    expect(bytesToBinary(e.bytes)).toBe(a);
  });
});

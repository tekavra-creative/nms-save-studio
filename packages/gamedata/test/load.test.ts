import { describe, expect, it } from 'vitest';
import { FactsPackError, countItems, parseFactsPack, validateFactsPack } from '../src/load.ts';
import { makePack } from './synthetic.ts';

describe('facts pack validation', () => {
  it('accepts a well-formed pack and round-trips through JSON', () => {
    const pack = parseFactsPack(JSON.stringify(makePack()));
    expect(pack.items['TESTSUB1']?.name).toBe('Test Alloy');
    expect(countItems(pack)).toEqual({ substance: 2, product: 2, technology: 1, procedural: 1 });
  });

  it('rejects a pack from another schema version', () => {
    expect(() => validateFactsPack({ ...makePack(), version: 999 })).toThrow(/unsupported version 999/);
  });

  it('rejects an item whose id does not match its key', () => {
    const pack = makePack();
    pack.items['TESTSUB1'] = { ...pack.items['TESTSUB1']!, id: 'OTHER' };
    expect(() => validateFactsPack(pack)).toThrow(FactsPackError);
  });

  it('rejects unknown kinds and wrong field types', () => {
    const bad = makePack();
    (bad.items['TESTSUB2'] as unknown as Record<string, unknown>)['kind'] = 'weapon';
    expect(() => validateFactsPack(bad)).toThrow(/unknown kind weapon/);
    const bad2 = makePack();
    (bad2.items['TESTPROD1'] as unknown as Record<string, unknown>)['value'] = '800';
    expect(() => validateFactsPack(bad2)).toThrow(/items\.TESTPROD1\.value/);
  });

  it('rejects non-string localisation text', () => {
    const bad = makePack({ strings: { KEY: 5 as unknown as string } });
    expect(() => validateFactsPack(bad)).toThrow(/strings\.KEY/);
  });

  it('reports invalid JSON as a FactsPackError', () => {
    expect(() => parseFactsPack('{"version": 1,')).toThrow(FactsPackError);
  });
});

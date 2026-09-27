import { describe, expect, it } from 'vitest';
import { displayText, fallbackLabel, lookupItem, lookupText, maxStackFor, parseItemId } from '../src/lookup.ts';
import { makePack } from './synthetic.ts';

const pack = makePack();

describe('parseItemId', () => {
  it('strips the caret and splits a procedural seed', () => {
    expect(parseItemId('^TESTPROC1#12345')).toEqual({ id: 'TESTPROC1', seed: '12345' });
    expect(parseItemId('TESTSUB1')).toEqual({ id: 'TESTSUB1' });
    expect(parseItemId('^TESTSUB1#')).toEqual({ id: 'TESTSUB1' });
  });
});

describe('lookupItem', () => {
  it('resolves a known id with or without the caret', () => {
    const a = lookupItem(pack, '^TESTSUB1');
    expect(a).toMatchObject({ id: 'TESTSUB1', kind: 'substance', name: 'Test Alloy', known: true });
    expect(lookupItem(pack, 'TESTSUB1').item).toBe(a.item);
  });

  it('keeps the seed of a procedural item', () => {
    expect(lookupItem(pack, '^TESTPROC1#777')).toMatchObject({ kind: 'procedural', name: 'Demo Beam Upgrade', seed: '777' });
  });

  it('falls back to a readable label for unknown ids', () => {
    expect(lookupItem(pack, '^TEST_UNKNOWN_PROD')).toEqual({
      id: 'TEST_UNKNOWN_PROD',
      kind: 'unknown',
      name: 'TEST_UNKNOWN_PROD',
      known: false,
    });
    expect(fallbackLabel('^')).toBe('^');
  });

  it('works with no pack at all', () => {
    expect(lookupItem(undefined, '^TESTSUB1')).toMatchObject({ kind: 'unknown', name: 'TESTSUB1', known: false });
  });
});

describe('lookupText / displayText', () => {
  it('resolves localisation keys found in saves', () => {
    expect(lookupText(pack, '^UI_TEST_SPECIES')).toBe('Imaginary Companion');
    expect(lookupText(pack, 'ui_test_species')).toBe('Imaginary Companion');
    expect(lookupText(pack, '^NOPE')).toBeUndefined();
  });

  it('displays keys, item ids, unknowns and plain text', () => {
    expect(displayText(pack, '^UI_TEST_SPECIES')).toBe('Imaginary Companion');
    expect(displayText(pack, '^TESTPROD1')).toBe('Sample Widget');
    expect(displayText(pack, '^MYSTERY_KEY')).toBe('MYSTERY_KEY');
    expect(displayText(pack, 'Jane Doe')).toBe('Jane Doe');
  });
});

describe('maxStackFor', () => {
  const item = (id: string) => pack.items[id]!;
  it('multiplies the base stack by the item multiplier', () => {
    expect(maxStackFor(pack, item('TESTPROD1'))).toBe(20);
    expect(maxStackFor(pack, item('TESTPROD1'), { inventory: 'Chest' })).toBe(40);
    expect(maxStackFor(pack, item('TESTSUB1'))).toBe(9999);
  });

  it('accepts an option or a preset name and falls back to Default inventory', () => {
    expect(maxStackFor(pack, item('TESTSUB1'), { option: 'Normal' })).toBe(500);
    expect(maxStackFor(pack, item('TESTSUB1'), { option: 'Survival', inventory: 'Ship' })).toBe(1000);
    expect(maxStackFor(pack, item('TESTSUB1'), { option: 'Normal', inventory: 'Vehicle' })).toBe(500);
  });

  it('technology never stacks', () => {
    expect(maxStackFor(pack, item('TESTTECH1'))).toBe(1);
  });
});

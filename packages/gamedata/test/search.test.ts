import { describe, expect, it } from 'vitest';
import { ItemSearch, normalise } from '../src/search.ts';
import { SYNTHETIC_ITEMS, manyItems } from './synthetic.ts';

describe('normalise', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalise('  Crème-Brûlée  #2 ')).toBe('creme brulee 2');
  });
});

describe('ItemSearch ranking', () => {
  const search = new ItemSearch(SYNTHETIC_ITEMS);
  const ids = (q: string, opts = {}) => search.search(q, opts).map((h) => h.item.id);

  it('puts exact and prefix matches first', () => {
    expect(ids('test alloy')[0]).toBe('TESTSUB1');
    expect(ids('samp')[0]).toBe('TESTPROD1');
  });

  it('matches word prefixes in any position', () => {
    expect(ids('wid')).toEqual(['TESTPROD1']);
    expect(ids('beam up')).toEqual(['TESTPROC1']);
  });

  it('matches ids, with or without the caret', () => {
    expect(ids('^TESTTECH1')[0]).toBe('TESTTECH1');
    expect(ids('testprod').sort()).toEqual(['TESTPROD1', 'TESTPROD2']);
  });

  it('falls back to subtitle and category, then loose in-order letters', () => {
    expect(ids('component')).toContain('TESTPROD1');
    expect(ids('smpl wdgt')[0]).toBe('TESTPROD1');
    expect(ids('smplwdgt')[0]).toBe('TESTPROD1');
    expect(ids('zqxv')).toEqual([]);
  });

  it('filters by kind and honours the limit', () => {
    expect(ids('test', { kinds: ['technology'] })).toEqual(['TESTTECH1']);
    expect(search.search('e', { limit: 2 })).toHaveLength(2);
    expect(search.search('   ')).toEqual([]);
  });
});

describe('ItemSearch speed', () => {
  it('answers a query over 5,000 items in well under 50 ms', () => {
    const search = new ItemSearch(manyItems(5000));
    expect(search.size).toBe(5000);
    const queries = ['brisk', 'coil', 'amber lens', 'mk 49', 'fake_1a', 'vlvt', 'series 3', 'zzz', 'q', 'lunar prism mk'];
    search.search('warm up');
    const times: number[] = [];
    for (let round = 0; round < 5; round++) {
      for (const q of queries) {
        const t = performance.now();
        search.search(q);
        times.push(performance.now() - t);
      }
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.log(`search p95 over 5000 items: ${p95.toFixed(2)} ms (max ${times.at(-1)!.toFixed(2)} ms)`);
    expect(p95).toBeLessThan(50);
  });
});

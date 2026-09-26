import { binaryToBytes, concatBytes, type Splice } from '../cst/doc.ts';
import { Kind } from '../cst/scan.ts';
import { EditError, numberBytes, resolve, type Op, type PathStep } from '../edit.ts';
import type { SaveReader } from '../domains/reader.ts';

/** Game counters are unsigned 32-bit; the game misbehaves above this. */
export const CURRENCY_CAP = 4_294_967_295n;

export type CurrencyField = 'Units' | 'Nanites' | 'Specials';
export type CurrencyMode = 'sum' | 'keep-target' | 'take-source' | 'max';

export interface CurrencyMergeResult {
  field: CurrencyField;
  target: bigint;
  source: bigint;
  result: bigint;
  capped: boolean;
}

const big = (v: number | bigint | undefined) => (v === undefined ? 0n : BigInt(v));

export function planCurrency(field: CurrencyField, target: SaveReader, source: SaveReader, mode: CurrencyMode): CurrencyMergeResult {
  const t = big(target.num([field], target.player));
  const s = big(source.num([field], source.player));
  let result = mode === 'sum' ? t + s : mode === 'take-source' ? s : mode === 'max' ? (t > s ? t : s) : t;
  const capped = result > CURRENCY_CAP;
  if (capped) result = CURRENCY_CAP;
  return { field, target: t, source: s, result, capped };
}

export function setCurrency(playerPath: readonly PathStep[], plan: CurrencyMergeResult): Op {
  return {
    label: `${plan.field === 'Specials' ? 'Quicksilver' : plan.field}: ${plan.target} → ${plan.result}`,
    compile(doc, keys) {
      const node = resolve(doc, keys, [...playerPath, plan.field]);
      return [{ start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes: numberBytes(plan.result) }];
    },
  };
}

export type KnownList = 'KnownTech' | 'KnownProducts' | 'KnownSpecials' | 'KnownRefinerRecipes';

/** Values present in the source list but missing from the target, as raw JSON bytes (lossless). */
export function missingListItems(list: KnownList, target: SaveReader, source: SaveReader): Uint8Array[] {
  const have = new Set(target.items([list], target.player).map((n) => target.doc.raw(n)));
  const out: Uint8Array[] = [];
  for (const n of source.items([list], source.player)) {
    const raw = source.doc.raw(n);
    if (!have.has(raw)) {
      have.add(raw);
      out.push(source.doc.span(n).slice());
    }
  }
  return out;
}

function appendMany(doc: import('../cst/doc.ts').JsonDoc, arr: number, items: Uint8Array[]): Splice {
  const close = doc.tree.end[arr]! - 1;
  const parts: Uint8Array[] = [];
  items.forEach((b, i) => {
    if (i > 0 || doc.childCount(arr) > 0) parts.push(binaryToBytes(','));
    parts.push(b);
  });
  return { start: close, end: close, bytes: concatBytes(parts) };
}

export function learnListItems(playerPath: readonly PathStep[], list: KnownList, items: Uint8Array[], label: string): Op {
  return {
    label,
    compile(doc, keys) {
      if (!items.length) return [];
      const arr = resolve(doc, keys, [...playerPath, list]);
      if (doc.kind(arr) !== Kind.Array) throw new EditError(`${list} is not a list`);
      return [appendMany(doc, arr, items)];
    },
  };
}

/** Word groups: {Group:"^TRA_GEK", Races:[bool×9]} — OR the race flags, append unknown groups. */
export function mergeWordGroups(playerPath: readonly PathStep[], target: SaveReader, source: SaveReader): Op | undefined {
  const k = target.keys;
  const groupKey = k.key('Group');
  const racesKey = k.key('Races');
  const tDoc = target.doc;
  const sDoc = source.doc;
  const byGroup = new Map<string, number>();
  for (const n of target.items(['KnownWordGroups'], target.player)) {
    const g = tDoc.child(n, groupKey);
    if (g >= 0) byGroup.set(tDoc.raw(g), n);
  }
  const updates: { groupRaw: string; races: boolean[] }[] = [];
  const appended: Uint8Array[] = [];
  let learned = 0;
  for (const n of source.items(['KnownWordGroups'], source.player)) {
    const g = sDoc.child(n, source.keys.key('Group'));
    const r = sDoc.child(n, source.keys.key('Races'));
    if (g < 0 || r < 0) continue;
    const sRaces = [...sDoc.children(r)].map((c) => sDoc.kind(c) === Kind.True);
    const existing = byGroup.get(sDoc.raw(g));
    if (existing === undefined) {
      appended.push(sDoc.span(n).slice());
      learned += sRaces.filter(Boolean).length;
      continue;
    }
    const tr = tDoc.child(existing, racesKey);
    const tRaces = [...tDoc.children(tr)].map((c) => tDoc.kind(c) === Kind.True);
    const merged = tRaces.map((v, i) => v || !!sRaces[i]);
    const gained = merged.filter((v, i) => v && !tRaces[i]).length;
    if (gained) {
      learned += gained;
      updates.push({ groupRaw: sDoc.raw(g), races: merged });
    }
  }
  if (!updates.length && !appended.length) return undefined;
  return {
    label: `Learn ${learned} word${learned === 1 ? '' : 's'}`,
    compile(doc, keys) {
      const arr = resolve(doc, keys, [...playerPath, 'KnownWordGroups']);
      const splices: Splice[] = [];
      for (const c of doc.children(arr)) {
        const g = doc.child(c, keys.key('Group'));
        const u = g >= 0 ? updates.find((x) => x.groupRaw === doc.raw(g)) : undefined;
        if (!u) continue;
        const r = doc.child(c, keys.key('Races'));
        splices.push({ start: doc.tree.start[r]!, end: doc.tree.end[r]!, bytes: binaryToBytes(`[${u.races.join(',')}]`) });
      }
      if (appended.length) splices.push(appendMany(doc, arr, appended));
      return splices;
    },
  };
}

/** Portal glyphs are a 16-bit mask; OR them together. */
export function mergePortalGlyphs(playerPath: readonly PathStep[], target: SaveReader, source: SaveReader): Op | undefined {
  const t = Number(target.num(['KnownPortalRunes'], target.player) ?? 0);
  const s = Number(source.num(['KnownPortalRunes'], source.player) ?? 0);
  const merged = (t | s) >>> 0;
  if (merged === t) return undefined;
  let gained = 0;
  for (let v = (merged & ~t) >>> 0; v; v &= v - 1) gained++;
  return {
    label: `Learn ${gained} portal glyph${gained === 1 ? '' : 's'}`,
    compile(doc, keys) {
      const node = resolve(doc, keys, [...playerPath, 'KnownPortalRunes']);
      return [{ start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes: numberBytes(merged) }];
    },
  };
}

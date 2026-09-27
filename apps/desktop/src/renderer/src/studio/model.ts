import type { AssetKind, ChangeView, CurrencyField, CurrencyMode, MergeStateView, OverviewView } from '../../../shared/api.ts';
import { SHIP_ART } from '../skins/types.ts';

export type CatId = 'ships' | 'tools' | 'pets' | 'currency' | 'knowledge';

export interface Cat {
  id: CatId;
  label: string;
  glyph: string;
  key: string;
  asset?: AssetKind;
  place: string;
}

export const CATS: readonly Cat[] = [
  { id: 'ships', label: 'Starships', glyph: 'g-starship', key: '1', asset: 'ship', place: 'bay' },
  { id: 'tools', label: 'Multi-tools', glyph: 'g-multitool', key: '2', asset: 'multitool', place: 'slot' },
  { id: 'pets', label: 'Companions', glyph: 'g-companion', key: '3', asset: 'companion', place: 'slot' },
  { id: 'currency', label: 'Currencies', glyph: 'g-currency', key: '4', place: '' },
  { id: 'knowledge', label: 'Knowledge', glyph: 'g-blueprint', key: '5', place: '' },
];

export const catById = (id: CatId): Cat => CATS.find((c) => c.id === id)!;

export interface Asset {
  /** Stable id used by drag + focus: "<asset>:<slot>". */
  id: string;
  slot: number;
  name: string;
  cls: string;
  rank: string | null;
  art: string;
}

export interface SourceItem extends Asset {
  changeId: number | null;
  status: 'ready' | 'staged' | 'present' | 'blocked';
  reason: string | null;
}

export interface Bay {
  slot: number;
  item: (Asset & { staged: boolean; changeId: number | null }) | null;
  next: boolean;
}

export interface Capacity {
  cap: number;
  own: number;
  staged: number;
  used: number;
  free: number;
}

export interface ValueRow {
  id: string;
  label: string;
  glyph: string;
  a: bigint;
  b: bigint;
  result: bigint;
  changeId: number | null;
  staged: boolean;
  gain: number;
  mode?: CurrencyMode;
  field?: CurrencyField;
}

export interface ChangeRow {
  id: number;
  glyph: string;
  verb: string;
  subject: string;
  detail: string;
  currency: { field: CurrencyField; mode: CurrencyMode } | null;
}

function assetsOf(o: OverviewView, kind: AssetKind): Asset[] {
  if (kind === 'ship') {
    return o.ships.map((s) => ({
      id: `ship:${s.index}`,
      slot: s.index,
      name: s.name || s.kind,
      cls: s.kind,
      rank: s.class,
      art: SHIP_ART[s.kind] ?? 's-fighter',
    }));
  }
  if (kind === 'multitool') {
    return o.multitools.map((m) => ({ id: `multitool:${m.index}`, slot: m.index, name: m.name || 'Multi-tool', cls: 'Multi-tool', rank: m.class, art: 'g-multitool' }));
  }
  return o.companions.map((c) => ({
    id: `companion:${c.index}`,
    slot: c.index,
    name: c.name || c.species.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()),
    cls: 'Companion',
    rank: null,
    art: 'g-companion',
  }));
}

function capacityOf(o: OverviewView, kind: AssetKind): number {
  return kind === 'ship' ? o.capacity.ships : kind === 'multitool' ? o.capacity.multitools : o.capacity.companions;
}

function assetChange(state: MergeStateView, kind: AssetKind, pred: (ref: { sourceSlot: number; targetSlot: number }) => boolean): ChangeView | undefined {
  return state.changes.find((c) => c.ref.kind === 'asset' && c.ref.asset === kind && pred(c.ref));
}

export function sourceItems(state: MergeStateView, cat: Cat): SourceItem[] {
  if (!cat.asset) return [];
  const kind = cat.asset;
  const free = capacity(state, cat).free;
  return assetsOf(state.source, kind).map((a) => {
    const ch = assetChange(state, kind, (r) => r.sourceSlot === a.slot);
    const skip = state.skipped.find((s) => s.asset === kind && s.sourceSlot === a.slot);
    if (ch) {
      if (ch.applied) return { ...a, changeId: ch.id, status: 'staged', reason: null };
      return { ...a, changeId: ch.id, status: free > 0 ? 'ready' : 'blocked', reason: free > 0 ? null : 'No room left.' };
    }
    if (skip) return { ...a, changeId: null, status: 'blocked', reason: skip.reason };
    return { ...a, changeId: null, status: 'present', reason: `Already in ${state.targetTitle}.` };
  });
}

export function bays(state: MergeStateView, cat: Cat): Bay[] {
  if (!cat.asset) return [];
  const kind = cat.asset;
  const cap = capacityOf(state.target, kind);
  const bySlot = new Map(assetsOf(state.target, kind).map((a) => [a.slot, a]));
  const out: Bay[] = [];
  let nextMarked = false;
  const nextFree = state.changes.find((c) => c.ref.kind === 'asset' && c.ref.asset === kind && !c.applied);
  const nextSlot = nextFree && nextFree.ref.kind === 'asset' ? nextFree.ref.targetSlot : -1;
  for (let i = 0; i < cap; i++) {
    const a = bySlot.get(i);
    if (a) {
      const ch = assetChange(state, kind, (r) => r.targetSlot === i);
      out.push({ slot: i, item: { ...a, staged: !!ch?.applied, changeId: ch?.id ?? null }, next: false });
    } else {
      const next = !nextMarked && (nextSlot === -1 ? true : i === nextSlot);
      if (next) nextMarked = true;
      out.push({ slot: i, item: null, next });
    }
  }
  return out;
}

export function capacity(state: MergeStateView, cat: Cat): Capacity {
  if (!cat.asset) return { cap: 0, own: 0, staged: 0, used: 0, free: 0 };
  const kind = cat.asset;
  const cap = capacityOf(state.target, kind);
  const own = assetsOf(state.targetBefore, kind).length;
  const used = assetsOf(state.target, kind).length;
  return { cap, own, staged: used - own, used, free: cap - used };
}

const CURRENCIES: { field: CurrencyField; label: string; key: 'units' | 'nanites' | 'quicksilver' }[] = [
  { field: 'Units', label: 'Units', key: 'units' },
  { field: 'Nanites', label: 'Nanites', key: 'nanites' },
  { field: 'Specials', label: 'Quicksilver', key: 'quicksilver' },
];

export function currencyRows(state: MergeStateView): ValueRow[] {
  return CURRENCIES.map(({ field, label, key }) => {
    const ch = state.changes.find((c) => c.ref.kind === 'currency' && c.ref.field === field);
    const mode = ch && ch.ref.kind === 'currency' ? ch.ref.mode : 'sum';
    return {
      id: field,
      label,
      glyph: 'g-currency',
      field,
      mode,
      a: BigInt(state.targetBefore[key]),
      b: BigInt(state.source[key]),
      result: BigInt(state.target[key]),
      changeId: ch?.id ?? null,
      staged: !!ch?.applied,
      gain: ch ? 1 : 0,
    };
  });
}

const KNOWLEDGE: { what: string; label: string; glyph: string; key: keyof OverviewView['knowledge'] }[] = [
  { what: 'blueprints', label: 'Blueprints', glyph: 'g-blueprint', key: 'products' },
  { what: 'technologies', label: 'Technologies', glyph: 'g-blueprint', key: 'technology' },
  { what: 'refiner recipes', label: 'Refiner recipes', glyph: 'g-blueprint', key: 'refinerRecipes' },
  { what: 'special items', label: 'Special items', glyph: 'g-blueprint', key: 'specials' },
  { what: 'words', label: 'Words', glyph: 'g-words', key: 'words' },
  { what: 'portal glyphs', label: 'Portal glyphs', glyph: 'g-words', key: 'portalGlyphs' },
];

export function knowledgeRows(state: MergeStateView): ValueRow[] {
  return KNOWLEDGE.map(({ what, label, glyph, key }) => {
    const ch = state.changes.find((c) => c.ref.kind === 'knowledge' && c.ref.what === what);
    const a = BigInt(state.targetBefore.knowledge[key]);
    const result = BigInt(state.target.knowledge[key]);
    const gain = ch && ch.ref.kind === 'knowledge' ? ch.ref.count || Number(result - a) || 1 : 0;
    return { id: what, label, glyph, a, b: BigInt(state.source.knowledge[key]), result, changeId: ch?.id ?? null, staged: !!ch?.applied, gain };
  });
}

const fmt = (n: bigint | string) => BigInt(n).toLocaleString();

export function changeRows(state: MergeStateView): ChangeRow[] {
  const all = new Map(state.changes.map((c) => [c.id, c]));
  return state.appliedOrder.flatMap((id): ChangeRow[] => {
    const c = all.get(id);
    if (!c) return [];
    const ref = c.ref;
    if (ref.kind === 'asset') {
      const src = assetsOf(state.source, ref.asset).find((a) => a.slot === ref.sourceSlot);
      const glyph = ref.asset === 'ship' ? 'g-starship' : ref.asset === 'multitool' ? 'g-multitool' : 'g-companion';
      const place = ref.asset === 'ship' ? 'bay' : 'slot';
      return [{
        id,
        glyph,
        verb: 'Bring',
        subject: src?.name ?? c.text.replace(/^Bring /, ''),
        detail: `${src?.cls ?? ''}${src?.rank ? ` · ${src.rank}` : ''} → ${place} ${ref.targetSlot + 1}`,
        currency: null,
      }];
    }
    if (ref.kind === 'currency') {
      const label = ref.field === 'Specials' ? 'Quicksilver' : ref.field;
      const verb = ref.mode === 'sum' ? 'Add' : ref.mode === 'take-source' ? 'Replace' : ref.mode === 'max' ? 'Keep higher' : 'Keep';
      const detail =
        ref.mode === 'sum'
          ? `${fmt(ref.from)} + ${fmt(ref.source)} = ${fmt(ref.to)}${ref.capped ? ' (game maximum)' : ''}`
          : `${fmt(ref.from)} → ${fmt(ref.to)}`;
      return [{ id, glyph: 'g-currency', verb, subject: label, detail, currency: { field: ref.field, mode: ref.mode } }];
    }
    return [{ id, glyph: ref.what === 'words' || ref.what === 'portal glyphs' ? 'g-words' : 'g-blueprint', verb: 'Learn', subject: c.text.replace(/^Learn /, ''), detail: '', currency: null }];
  });
}

export const shortNumber = (n: bigint): string => {
  const v = Number(n);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
};

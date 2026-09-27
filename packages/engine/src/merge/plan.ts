import type { Op } from '../edit.ts';
import { readCompanions, readMultitools, readShips } from '../domains/assets.ts';
import type { SaveReader } from '../domains/reader.ts';
import { freeSlot, isCorvette, transferAsset, transferBlockedReason, type AssetKind } from './assets.ts';
import {
  learnListItems,
  mergePortalGlyphs,
  mergeWordGroups,
  missingListItems,
  planCurrency,
  setCurrency,
  type CurrencyField,
  type CurrencyMode,
  type KnownList,
} from './known.ts';

export interface AssetPick {
  kind: AssetKind;
  sourceSlot: number;
}

export interface MergeOptions {
  /** Assets to bring over; omit to bring every asset the target doesn't already have. */
  assets?: AssetPick[];
  currencies?: CurrencyMode;
  knowledge?: boolean;
}

export type ChangeRef =
  | { kind: 'asset'; asset: AssetKind; sourceSlot: number; targetSlot: number }
  | { kind: 'currency'; field: CurrencyField; mode: CurrencyMode; from: string; to: string; capped: boolean }
  | { kind: 'knowledge'; what: string; count: number };

export interface ChangeLine {
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Currencies' | 'Knowledge';
  text: string;
  op: Op;
  ref: ChangeRef;
}

export interface SkippedLine {
  group: ChangeLine['group'];
  text: string;
  reason: string;
  asset?: AssetKind;
  sourceSlot?: number;
}

export interface MergePlan {
  changes: ChangeLine[];
  skipped: SkippedLine[];
}

const GROUP: Record<AssetKind, ChangeLine['group']> = { ship: 'Starships', multitool: 'Multi-tools', companion: 'Companions' };

function sameShip(target: SaveReader, source: SaveReader, sourceSlot: number): boolean {
  const s = source.node(['ShipOwnership', sourceSlot], source.player);
  const file = source.text(['Resource', 'Filename'], s);
  const seed = source.seed(['Resource', 'Seed'], s);
  return readShips(target).some((t) => {
    const n = target.node(['ShipOwnership', t.index], target.player);
    return target.text(['Resource', 'Filename'], n) === file && t.seed === seed;
  });
}

function defaultPicks(target: SaveReader, source: SaveReader): AssetPick[] {
  const picks: AssetPick[] = [];
  for (const s of readShips(source)) if (!sameShip(target, source, s.index)) picks.push({ kind: 'ship', sourceSlot: s.index });
  const targetToolSeeds = new Set(readMultitools(target).map((m) => m.seed));
  for (const m of readMultitools(source)) if (!targetToolSeeds.has(m.seed)) picks.push({ kind: 'multitool', sourceSlot: m.index });
  for (const c of readCompanions(source)) picks.push({ kind: 'companion', sourceSlot: c.index });
  return picks;
}

function assetLabel(kind: AssetKind, source: SaveReader, slot: number): string {
  if (kind === 'ship') {
    const s = readShips(source).find((x) => x.index === slot);
    return s ? `${s.name || s.kind} (${s.kind}, class ${s.class ?? '?'})` : `Starship ${slot + 1}`;
  }
  if (kind === 'multitool') {
    const m = readMultitools(source).find((x) => x.index === slot);
    return m ? `${m.name || 'Multi-tool'} (class ${m.class ?? '?'})` : `Multi-tool ${slot + 1}`;
  }
  const c = readCompanions(source).find((x) => x.index === slot);
  return c ? c.name || c.species : `Companion ${slot + 1}`;
}

export const CURRENCY_LABEL: Record<CurrencyField, string> = { Units: 'Units', Nanites: 'Nanites', Specials: 'Quicksilver' };

/** One currency line for a given mode, or undefined when the target value would not change. */
export function currencyChange(target: SaveReader, source: SaveReader, field: CurrencyField, mode: CurrencyMode): ChangeLine | undefined {
  const plan = planCurrency(field, target, source, mode);
  if (plan.result === plan.target) return undefined;
  const name = CURRENCY_LABEL[field];
  const text = `${name}: ${plan.target.toLocaleString()} → ${plan.result.toLocaleString()}${plan.capped ? ' (game maximum)' : ''}`;
  return {
    group: 'Currencies',
    text,
    op: setCurrency(target.playerPath, plan),
    ref: { kind: 'currency', field, mode, from: plan.target.toString(), to: plan.result.toString(), capped: plan.capped },
  };
}

/**
 * Build the list of changes that merge `source` into `target`. Nothing is applied — the caller
 * applies `changes[].op` to an EditSession (each line is its own undo step).
 */
export function planMerge(target: SaveReader, source: SaveReader, opts: MergeOptions = {}): MergePlan {
  const changes: ChangeLine[] = [];
  const skipped: SkippedLine[] = [];
  const taken: Record<AssetKind, Set<number>> = { ship: new Set(), multitool: new Set(), companion: new Set() };

  for (const pick of opts.assets ?? defaultPicks(target, source)) {
    const label = assetLabel(pick.kind, source, pick.sourceSlot);
    const group = GROUP[pick.kind];
    const blocked = transferBlockedReason(pick.kind, source, pick.sourceSlot);
    if (blocked) {
      skipped.push({ group, text: label, reason: blocked, asset: pick.kind, sourceSlot: pick.sourceSlot });
      continue;
    }
    const slot = freeSlot(pick.kind, target, taken[pick.kind]);
    if (typeof slot !== 'number') {
      skipped.push({ group, text: label, reason: slot.reason, asset: pick.kind, sourceSlot: pick.sourceSlot });
      continue;
    }
    taken[pick.kind].add(slot);
    const caution = pick.kind === 'ship' && isCorvette(source, pick.sourceSlot) ? ' (brings its build record — may not appear until you next dock at a Space Station)' : '';
    changes.push({
      group,
      text: `Bring ${label}${caution}`,
      op: transferAsset(pick.kind, source, pick.sourceSlot, target, slot, `Bring ${label}`),
      ref: { kind: 'asset', asset: pick.kind, sourceSlot: pick.sourceSlot, targetSlot: slot },
    });
  }

  const mode = opts.currencies ?? 'sum';
  if (mode !== 'keep-target') {
    for (const field of ['Units', 'Nanites', 'Specials'] as CurrencyField[]) {
      const line = currencyChange(target, source, field, mode);
      if (line) changes.push(line);
    }
  }

  if (opts.knowledge ?? true) {
    const lists: [KnownList, string][] = [
      ['KnownTech', 'technologies'],
      ['KnownProducts', 'blueprints'],
      ['KnownSpecials', 'special items'],
      ['KnownRefinerRecipes', 'refiner recipes'],
    ];
    for (const [list, noun] of lists) {
      const items = missingListItems(list, target, source);
      if (!items.length) continue;
      const text = `Learn ${items.length} ${noun}`;
      changes.push({
        group: 'Knowledge',
        text,
        op: learnListItems(target.playerPath, list, items, text),
        ref: { kind: 'knowledge', what: noun, count: items.length },
      });
    }
    const words = mergeWordGroups(target.playerPath, target, source);
    if (words) changes.push({ group: 'Knowledge', text: words.label, op: words, ref: { kind: 'knowledge', what: 'words', count: 0 } });
    const glyphs = mergePortalGlyphs(target.playerPath, target, source);
    if (glyphs) changes.push({ group: 'Knowledge', text: glyphs.label, op: glyphs, ref: { kind: 'knowledge', what: 'portal glyphs', count: 0 } });
  }

  return { changes, skipped };
}

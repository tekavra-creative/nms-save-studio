import type { Op } from '../edit.ts';
import { readCompanions, readMultitools, readShips } from '../domains/assets.ts';
import type { SaveReader } from '../domains/reader.ts';
import { freeSlot, transferAsset, transferBlockedReason, type AssetKind } from './assets.ts';
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

export interface ChangeLine {
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Currencies' | 'Knowledge';
  text: string;
  op: Op;
}

export interface SkippedLine {
  group: ChangeLine['group'];
  text: string;
  reason: string;
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
      skipped.push({ group, text: label, reason: blocked });
      continue;
    }
    const slot = freeSlot(pick.kind, target, taken[pick.kind]);
    if (typeof slot !== 'number') {
      skipped.push({ group, text: label, reason: slot.reason });
      continue;
    }
    taken[pick.kind].add(slot);
    changes.push({ group, text: `Bring ${label}`, op: transferAsset(pick.kind, source, pick.sourceSlot, target, slot, `Bring ${label}`) });
  }

  const mode = opts.currencies ?? 'sum';
  if (mode !== 'keep-target') {
    for (const field of ['Units', 'Nanites', 'Specials'] as CurrencyField[]) {
      const plan = planCurrency(field, target, source, mode);
      if (plan.result === plan.target) continue;
      const name = field === 'Specials' ? 'Quicksilver' : field;
      const text = `${name}: ${plan.target.toLocaleString()} → ${plan.result.toLocaleString()}${plan.capped ? ' (game maximum)' : ''}`;
      changes.push({ group: 'Currencies', text, op: setCurrency(target.playerPath, plan) });
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
      changes.push({ group: 'Knowledge', text, op: learnListItems(target.playerPath, list, items, text) });
    }
    const words = mergeWordGroups(target.playerPath, target, source);
    if (words) changes.push({ group: 'Knowledge', text: words.label, op: words });
    const glyphs = mergePortalGlyphs(target.playerPath, target, source);
    if (glyphs) changes.push({ group: 'Knowledge', text: glyphs.label, op: glyphs });
  }

  return { changes, skipped };
}

// ID → item, and localisation key → text, with a readable fallback for anything the pack does not
// know (a newer game build, a modded item, or no pack at all). Lookups never throw.
import type { FactsItem, FactsPack, ItemKind } from './types.ts';

export type LookupKind = ItemKind | 'unknown';

export interface ParsedId {
  /** ID without `^` and without a `#seed` suffix. */
  id: string;
  /** Procedural seed after `#`, e.g. `^UP_LASER1#12345` → `12345`. */
  seed?: string;
}

export interface ResolvedItem {
  /** Normalised ID (no `^`, no seed). */
  id: string;
  kind: LookupKind;
  /** Display name: the item's name, or a readable label made from the ID. */
  name: string;
  known: boolean;
  seed?: string;
  item?: FactsItem;
}

/** `^UP_LASER1#12345` → `{ id: 'UP_LASER1', seed: '12345' }`. */
export function parseItemId(raw: string): ParsedId {
  const bare = raw.trim().replace(/^\^+/, '');
  const hash = bare.indexOf('#');
  if (hash < 0) return { id: bare };
  const seed = bare.slice(hash + 1);
  return seed ? { id: bare.slice(0, hash), seed } : { id: bare.slice(0, hash) };
}

/** Readable label for an ID or key nobody could resolve: `^SENTFREI_PROD` → `SENTFREI_PROD`. */
export function fallbackLabel(raw: string): string {
  const { id } = parseItemId(raw);
  return id || raw.trim() || '(empty)';
}

/** Find an item. Unknown IDs resolve to `{ kind: 'unknown', name: <readable label> }`. */
export function lookupItem(pack: FactsPack | undefined, raw: string): ResolvedItem {
  const { id, seed } = parseItemId(raw);
  const item = pack ? (pack.items[id] ?? pack.items[id.toUpperCase()]) : undefined;
  const base = seed === undefined ? {} : { seed };
  if (item) return { id: item.id, kind: item.kind, name: item.name, known: true, item, ...base };
  return { id, kind: 'unknown', name: fallbackLabel(raw), known: false, ...base };
}

/** Localised text for a key (`^UI_GLOWPET_SPECIES` or `UI_GLOWPET_SPECIES`), or undefined. */
export function lookupText(pack: FactsPack | undefined, key: string): string | undefined {
  if (!pack) return undefined;
  const bare = key.trim().replace(/^\^+/, '');
  return pack.strings[bare] ?? pack.strings[bare.toUpperCase()];
}

/**
 * Text for any `^`-value found in a save: a localisation key, an item ID, or plain text. Always
 * returns something printable.
 */
export function displayText(pack: FactsPack | undefined, value: string): string {
  if (!value.startsWith('^')) return value;
  const text = lookupText(pack, value);
  if (text !== undefined && text !== '') return text;
  const item = lookupItem(pack, value);
  return item.name;
}

export interface StackQuery {
  /** Inventory kind as the game names it: `Personal`, `Ship`, `Freighter`, `Chest`, … */
  inventory?: string;
  /** Stack-limits option (`High`, `Normal`, `Low`) or a difficulty preset name (`Survival`). */
  option?: string;
}

/**
 * Stack size for an item in a given inventory: the option's base stack × the item's multiplier,
 * capped. Technology does not stack (1). Undefined when the pack has no stack table.
 */
export function maxStackFor(pack: FactsPack | undefined, item: FactsItem, query: StackQuery = {}): number | undefined {
  if (item.kind === 'technology' || item.kind === 'procedural') return 1;
  const limits = pack?.stackLimits;
  if (!limits) return item.maxStack;
  const wanted = query.option ?? limits.defaultOption;
  const option = limits.options[wanted] ?? limits.options[limits.presets[wanted] ?? ''] ?? limits.options[limits.defaultOption];
  if (!option) return item.maxStack;
  const inventory = query.inventory ?? 'Personal';
  const isSubstance = item.kind === 'substance';
  const table = isSubstance ? option.substance : option.product;
  const base = table[inventory] ?? table['Default'];
  if (base === undefined) return item.maxStack;
  const cap = isSubstance ? option.substanceCap : option.productCap;
  return Math.min(cap, base * (item.stackMultiplier ?? 1));
}

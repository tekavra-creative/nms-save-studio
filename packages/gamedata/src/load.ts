// Validate a facts pack before the app trusts it. The pack is produced locally by our own builder,
// but it is still a file on disk: a stale schema or a half-written file must fail loudly here, not
// as a blank item name three screens later.
import { FACTS_PACK_VERSION, ITEM_KINDS, type FactsPack, type ItemKind } from './types.ts';

export class FactsPackError extends Error {
  override name = 'FactsPackError';
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const KINDS = new Set<string>(ITEM_KINDS);

function fail(path: string, msg: string): never {
  throw new FactsPackError(`${path}: ${msg}`);
}

function str(o: Obj, key: string, path: string, optional = false): void {
  const v = o[key];
  if (v === undefined && optional) return;
  if (typeof v !== 'string') fail(`${path}.${key}`, `expected string, got ${typeof v}`);
}

function num(o: Obj, key: string, path: string): void {
  const v = o[key];
  if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) fail(`${path}.${key}`, 'expected number');
}

function bool(o: Obj, key: string, path: string): void {
  const v = o[key];
  if (v !== undefined && typeof v !== 'boolean') fail(`${path}.${key}`, 'expected boolean');
}

function numberRecord(v: unknown, path: string): void {
  if (!isObj(v)) fail(path, 'expected object');
  for (const [k, n] of Object.entries(v)) if (typeof n !== 'number') fail(`${path}.${k}`, 'expected number');
}

/** Check shape and version; returns the same object typed as a pack. Throws `FactsPackError`. */
export function validateFactsPack(value: unknown): FactsPack {
  if (!isObj(value)) fail('pack', 'expected an object');
  if (value['version'] !== FACTS_PACK_VERSION) {
    fail('pack.version', `unsupported version ${String(value['version'])} (expected ${FACTS_PACK_VERSION}); rebuild the facts pack`);
  }
  str(value, 'gameBuild', 'pack');
  str(value, 'fingerprint', 'pack');
  str(value, 'generatedAt', 'pack');
  str(value, 'language', 'pack');
  if (!isObj(value['generator'])) fail('pack.generator', 'expected object');
  numberRecord(value['counts'], 'pack.counts');

  const items = value['items'];
  if (!isObj(items)) fail('pack.items', 'expected object');
  for (const [key, item] of Object.entries(items)) {
    const p = `items.${key}`;
    if (!isObj(item)) fail(p, 'expected object');
    str(item, 'id', p);
    if (item['id'] !== key) fail(`${p}.id`, `does not match its key (${String(item['id'])})`);
    if (typeof item['kind'] !== 'string' || !KINDS.has(item['kind'])) fail(`${p}.kind`, `unknown kind ${String(item['kind'])}`);
    str(item, 'name', p);
    str(item, 'category', p);
    for (const k of ['subtitle', 'description', 'substanceCategory', 'rarity', 'template', 'iconPath', 'nameKey']) {
      str(item, k, p, true);
    }
    for (const k of ['value', 'stackMultiplier', 'maxStack', 'chargeAmount']) num(item, k, p);
    for (const k of ['chargeable', 'consumable', 'craftable', 'proceduralName']) bool(item, k, p);
  }

  const strings = value['strings'];
  if (!isObj(strings)) fail('pack.strings', 'expected object');
  for (const [k, s] of Object.entries(strings)) if (typeof s !== 'string') fail(`strings.${k}`, 'expected string');

  const stack = value['stackLimits'];
  if (stack !== undefined) {
    if (!isObj(stack) || !isObj(stack['options']) || !isObj(stack['presets'])) fail('pack.stackLimits', 'malformed');
    str(stack, 'defaultOption', 'pack.stackLimits');
    for (const [name, opt] of Object.entries(stack['options'])) {
      const p = `stackLimits.options.${name}`;
      if (!isObj(opt)) fail(p, 'expected object');
      num(opt, 'substanceCap', p);
      num(opt, 'productCap', p);
      numberRecord(opt['substance'], `${p}.substance`);
      numberRecord(opt['product'], `${p}.product`);
    }
  }

  const recipes = value['recipes'];
  if (recipes !== undefined && !Array.isArray(recipes)) fail('pack.recipes', 'expected array');
  return value as unknown as FactsPack;
}

/** Parse JSON text and validate it. */
export function parseFactsPack(text: string): FactsPack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new FactsPackError(`facts pack is not valid JSON: ${(err as Error).message}`);
  }
  return validateFactsPack(raw);
}

/** Item counts recomputed from the items themselves (the stored `counts` is informational). */
export function countItems(pack: Pick<FactsPack, 'items'>): Record<ItemKind, number> {
  const counts = Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Record<ItemKind, number>;
  for (const item of Object.values(pack.items)) counts[item.kind]++;
  return counts;
}

// Turn MBINCompiler's MXML for the game's reality tables into facts-pack records. Field names are the
// game's own (as MBINCompiler labels them); everything else here is ours.
import type { FactsItem, FactsRecipe, ItemKind, RecipeElement, StackLimitOption, StackLimits } from '@nss/gamedata';
import { boolProp, child, enumProp, numProp, prop, resourceFile, tableRows, type MxmlNode } from './mxml.ts';

/** Localisation key → English text (already cleaned). */
export type LocTable = Map<string, string>;

/**
 * Strip the game's inline markup: `<IMG>NAME<>` glyphs go entirely, colour tags (`<STELLAR>…<>`,
 * `<TECHNOLOGY>…<>`) keep their text. `%TOKENS%` stay. Whitespace is tidied, newlines kept.
 */
export function cleanText(s: string): string {
  return s
    .replace(/<IMG>[^<]*<>/g, '')
    .replace(/<[A-Za-z0-9_]*>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** Add every entry of one `cTkLocalisationTable` document (English column, US English fallback). */
export function readLocalisation(root: MxmlNode, into: LocTable): number {
  let n = 0;
  for (const row of tableRows(root)) {
    const id = prop(row, 'Id') ?? row.id;
    if (!id) continue;
    const text = prop(row, 'English') ?? prop(row, 'USEnglish');
    if (text === undefined) continue;
    into.set(id, cleanText(text));
    n++;
  }
  return n;
}

function textOf(loc: LocTable, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const t = loc.get(key) ?? loc.get(key.toUpperCase());
  return t === undefined || t === '' ? undefined : t;
}

function iconPath(row: MxmlNode, name = 'Icon'): string | undefined {
  const f = resourceFile(row, name);
  return f ? f.replaceAll('\\', '/').toLowerCase() : undefined;
}

/** Drop undefined fields (the pack schema uses exact optional properties). */
function compact<T extends object>(o: { [K in keyof T]: T[K] | undefined }): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

function names(row: MxmlNode, loc: LocTable, id: string) {
  const nameKey = prop(row, 'NameLower') ?? prop(row, 'Name');
  return {
    name: textOf(loc, prop(row, 'NameLower')) ?? textOf(loc, prop(row, 'Name')) ?? id,
    nameKey,
    subtitle: textOf(loc, prop(row, 'Subtitle')),
    description: textOf(loc, prop(row, 'Description')),
  };
}

export function extractSubstances(root: MxmlNode, loc: LocTable): FactsItem[] {
  return tableRows(root).flatMap((row) => {
    const id = prop(row, 'ID') ?? row.id;
    if (!id) return [];
    const cat = enumProp(row, 'Category') ?? 'Unknown';
    return [
      compact<FactsItem>({
        id,
        kind: 'substance',
        ...names(row, loc, id),
        category: cat,
        substanceCategory: cat,
        rarity: enumProp(row, 'Rarity'),
        value: numProp(row, 'BaseValue'),
        stackMultiplier: numProp(row, 'StackMultiplier'),
        iconPath: iconPath(row),
      }),
    ];
  });
}

function productFrom(row: MxmlNode, loc: LocTable, proceduralName: boolean): FactsItem | undefined {
  const id = prop(row, 'ID') ?? row.id;
  if (!id) return undefined;
  const n = names(row, loc, id);
  // Procedural products carry a name *format* (`%LOOTADJ% %LOOTNOUN%`); the subtitle is the
  // readable family name ("… Treasure") until a seed is known.
  const name = proceduralName ? (n.subtitle ?? n.name) : n.name;
  return compact<FactsItem>({
    id,
    kind: 'product',
    ...n,
    name,
    category: enumProp(row, 'Type') ?? 'Unknown',
    substanceCategory: enumProp(row, 'Category'),
    rarity: enumProp(row, 'Rarity'),
    value: numProp(row, 'BaseValue'),
    stackMultiplier: numProp(row, 'StackMultiplier'),
    consumable: boolProp(row, 'Consumable'),
    craftable: boolProp(row, 'IsCraftable'),
    proceduralName: proceduralName || undefined,
    iconPath: iconPath(row),
  });
}

/** `cGcProductTable` (also the base-part and customisation product tables, same row type). */
export function extractProducts(root: MxmlNode, loc: LocTable): FactsItem[] {
  return tableRows(root).flatMap((row) => productFrom(row, loc, false) ?? []);
}

/** `cGcProceduralProductTable`: one product template per loot family. */
export function extractProceduralProducts(root: MxmlNode, loc: LocTable): FactsItem[] {
  return tableRows(root).flatMap((fam) => productFrom(child(fam, 'Product') ?? fam, loc, true) ?? []);
}

export function extractTechnology(root: MxmlNode, loc: LocTable): FactsItem[] {
  return tableRows(root).flatMap((row) => {
    const id = prop(row, 'ID') ?? row.id;
    if (!id) return [];
    return [
      compact<FactsItem>({
        id,
        kind: 'technology',
        ...names(row, loc, id),
        category: enumProp(row, 'Category') ?? 'Unknown',
        rarity: enumProp(row, 'Rarity'),
        value: numProp(row, 'BaseValue'),
        chargeable: boolProp(row, 'Chargeable'),
        chargeAmount: numProp(row, 'ChargeAmount'),
        iconPath: iconPath(row),
      }),
    ];
  });
}

/** Procedural upgrades borrow their icon from the template technology (`T_LASER` …). */
export function extractProceduralTechnology(root: MxmlNode, loc: LocTable, tech: ReadonlyMap<string, FactsItem>): FactsItem[] {
  return tableRows(root).flatMap((row) => {
    const id = prop(row, 'ID') ?? row.id;
    if (!id) return [];
    const template = prop(row, 'Template');
    const base = template ? tech.get(template) : undefined;
    const nameKey = prop(row, 'Name');
    return [
      compact<FactsItem>({
        id,
        kind: 'procedural',
        name: textOf(loc, nameKey) ?? textOf(loc, prop(row, 'NameLower')) ?? id,
        nameKey,
        subtitle: textOf(loc, prop(row, 'Subtitle')),
        description: textOf(loc, prop(row, 'Description')),
        category: enumProp(row, 'Category') ?? 'Unknown',
        rarity: prop(row, 'Quality'),
        template,
        iconPath: base?.iconPath,
      }),
    ];
  });
}

function element(node: MxmlNode | undefined): RecipeElement | undefined {
  const id = prop(node, 'Id');
  if (!id) return undefined;
  return { id, type: enumProp(node, 'Type') ?? 'Unknown', amount: numProp(node, 'Amount') ?? 0 };
}

export function extractRecipes(root: MxmlNode, loc: LocTable): FactsRecipe[] {
  return tableRows(root).flatMap((row) => {
    const id = prop(row, 'Id') ?? row.id;
    const result = element(child(row, 'Result'));
    if (!id || !result) return [];
    return [
      {
        id,
        name: textOf(loc, prop(row, 'RecipeName')) ?? textOf(loc, prop(row, 'RecipeType')) ?? id,
        cooking: boolProp(row, 'Cooking') ?? false,
        seconds: numProp(row, 'TimeToMake') ?? 0,
        result,
        ingredients: (child(row, 'Ingredients')?.children ?? []).flatMap((c) => element(c) ?? []),
      },
    ];
  });
}

function numberMap(node: MxmlNode | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of node?.children ?? []) {
    const n = Number(c.value);
    if (c.name && Number.isFinite(n)) out[c.name] = n;
  }
  return out;
}

/** Inventory stack sizes per "stack limits" option, and which option each difficulty preset uses. */
export function extractStackLimits(root: MxmlNode): StackLimits | undefined {
  const data = child(root, 'InventoryStackLimitsOptionData');
  if (!data) return undefined;
  const options: Record<string, StackLimitOption> = {};
  for (const opt of data.children) {
    options[opt.name] = {
      substanceCap: numProp(opt, 'SubstanceStackLimit') ?? 9999,
      productCap: numProp(opt, 'ProductStackLimit') ?? 9999,
      substance: numberMap(child(opt, 'MaxSubstanceStackSizes')),
      product: numberMap(child(opt, 'MaxProductStackSizes')),
    };
  }
  const presets: Record<string, string> = {};
  for (const preset of child(root, 'Presets')?.children ?? []) {
    const option = enumProp(preset, 'InventoryStackLimits');
    if (option && preset.name !== 'Invalid') presets[preset.name] = option;
  }
  const defaultOption = presets['Normal'] ?? Object.keys(options)[0];
  if (!defaultOption) return undefined;
  return { options, presets, defaultOption };
}

/** Stack size in the exosuit under the default option; mirrors `maxStackFor` in @nss/gamedata. */
export function defaultMaxStack(item: FactsItem, limits: StackLimits | undefined): number | undefined {
  if (!limits || (item.kind !== 'substance' && item.kind !== 'product')) return undefined;
  const opt = limits.options[limits.defaultOption];
  if (!opt) return undefined;
  const table = item.kind === 'substance' ? opt.substance : opt.product;
  const base = table['Personal'] ?? table['Default'];
  if (base === undefined) return undefined;
  const cap = item.kind === 'substance' ? opt.substanceCap : opt.productCap;
  return Math.min(cap, base * (item.stackMultiplier ?? 1));
}

export interface MergeReport {
  /** IDs that appeared in more than one table; the first table wins. */
  duplicates: { id: string; kept: ItemKind; dropped: ItemKind }[];
}

/** Merge item lists in priority order into one ID-keyed record. */
export function mergeItems(lists: readonly FactsItem[][], limits: StackLimits | undefined): { items: Record<string, FactsItem>; report: MergeReport } {
  const items: Record<string, FactsItem> = {};
  const report: MergeReport = { duplicates: [] };
  for (const list of lists) {
    for (const item of list) {
      const prev = items[item.id];
      if (prev) {
        report.duplicates.push({ id: item.id, kept: prev.kind, dropped: item.kind });
        continue;
      }
      const maxStack = defaultMaxStack(item, limits);
      items[item.id] = maxStack === undefined ? item : { ...item, maxStack };
    }
  }
  return { items, report };
}

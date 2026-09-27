// The "facts pack": item names, categories, stack limits and icon paths for every item ID a save can
// hold, generated at build time from the user's OWN game install (see
// packages/data-forge/scripts/build-facts.ts). A pack is game data: it lives in the user's cache
// folder and is never committed or shipped.

/** Bump when the shape below changes in a way old readers cannot handle. */
export const FACTS_PACK_VERSION = 1;

export const ITEM_KINDS = ['substance', 'product', 'technology', 'procedural'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export interface FactsItem {
  /** Game ID without the save's `^` prefix, e.g. `FUEL1`. */
  id: string;
  kind: ItemKind;
  /** Display name in mixed case (the game's `NameLower` text, falling back to `Name`). */
  name: string;
  subtitle?: string;
  description?: string;
  /**
   * The table's own grouping: substances → substance category (`Fuel`, `Metal`, …); products →
   * product category (`Component`, `Consumable`, …); technology → technology category (`Suit`,
   * `Ship`, …); procedural → procedural category (`Mining`, `Combat`, …).
   */
  category: string;
  /** Substance category a product or substance belongs to (`Fuel`, `Catalyst`, …). */
  substanceCategory?: string;
  /** Substances/products: `Common`…; technology: shop rarity; procedural: quality (`Normal`, `Rare`, `Epic`, `Legendary`, `Illegal`, `Sentinel`). */
  rarity?: string;
  /** Base value in units. */
  value?: number;
  /** Multiplier applied to the inventory's base stack size. */
  stackMultiplier?: number;
  /** Stack size in the exosuit on the Normal preset (see `FactsPack.stackLimits`). */
  maxStack?: number;
  chargeable?: boolean;
  chargeAmount?: number;
  consumable?: boolean;
  craftable?: boolean;
  /** Procedural products (salvaged loot, fossils, …): the real name is generated from the seed. */
  proceduralName?: boolean;
  /** Procedural technology: the base technology it rolls from (`T_LASER`). */
  template?: string;
  /** Lower-case path of the icon inside the game's packs (`textures/ui/frontend/icons/…dds`). */
  iconPath?: string;
  /** Localisation key of the name, for later re-localisation. */
  nameKey?: string;
}

/** Base stack sizes for one "inventory stack limits" difficulty option. */
export interface StackLimitOption {
  substanceCap: number;
  productCap: number;
  /** Inventory kind (`Personal`, `Ship`, `Freighter`, `Chest`, …) → base substance stack. */
  substance: Record<string, number>;
  /** Inventory kind → base product stack. */
  product: Record<string, number>;
}

export interface StackLimits {
  /** Option name (`High`, `Normal`, `Low`) → limits. */
  options: Record<string, StackLimitOption>;
  /** Difficulty preset (`Normal`, `Survival`, …) → option name. */
  presets: Record<string, string>;
  /** Option used for `FactsItem.maxStack`. */
  defaultOption: string;
}

export interface RecipeElement {
  id: string;
  /** `Substance` | `Product` | `Technology`. */
  type: string;
  amount: number;
}

/** A refiner or cooking recipe. */
export interface FactsRecipe {
  id: string;
  name: string;
  cooking: boolean;
  seconds: number;
  result: RecipeElement;
  ingredients: RecipeElement[];
}

export interface FactsPack {
  version: typeof FACTS_PACK_VERSION;
  /** Steam build id when known, otherwise `fp-<fingerprint>`. */
  gameBuild: string;
  /** Hash of the size + mtime of every pack file the facts were read from. */
  fingerprint: string;
  generatedAt: string;
  /** External tool versions used to produce the pack. */
  generator: { mbinCompiler: string };
  language: string;
  counts: Record<ItemKind, number>;
  items: Record<string, FactsItem>;
  /** Localisation key → cleaned English text (keys as the game spells them, upper case). */
  strings: Record<string, string>;
  stackLimits?: StackLimits;
  recipes?: FactsRecipe[];
}

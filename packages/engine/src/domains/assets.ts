import type { SaveReader } from './reader.ts';

export type ItemClass = 'C' | 'B' | 'A' | 'S';

export interface InventorySummary {
  used: number;
  capacity: number;
  techUsed: number;
}

export interface ShipSummary {
  index: number;
  name: string;
  kind: string;
  model: string;
  seed: string | undefined;
  class: ItemClass | undefined;
  primary: boolean;
  cargo: InventorySummary;
}

export interface MultitoolSummary {
  index: number;
  name: string;
  kind: string;
  seed: string | undefined;
  class: ItemClass | undefined;
  active: boolean;
}

export interface CompanionSummary {
  index: number;
  name: string;
  species: string;
  hasEgg: boolean;
}

export interface Currencies {
  units: number | bigint;
  nanites: number | bigint;
  quicksilver: number | bigint;
}

export interface KnowledgeCounts {
  technology: number;
  products: number;
  specials: number;
  refinerRecipes: number;
  words: number;
  portalGlyphs: number;
}

// Most specific first: special hulls live under generic folders (e.g. FIGHTERS/SPOOKSHIP).
const SHIP_KINDS: [RegExp, string][] = [
  [/SPOOKSHIP/, 'Boundary Herald'],
  [/SENTINELSHIP/, 'Sentinel Interceptor'],
  [/BIOSHIP/, 'Living Ship'],
  [/SAILSHIP/, 'Solar'],
  [/CORVETTE|BIGGS/, 'Corvette'],
  [/S-CLASS|ROYAL/, 'Exotic'],
  [/SCIENTIFIC/, 'Explorer'],
  [/DROPSHIP/, 'Hauler'],
  [/SHUTTLE/, 'Shuttle'],
  [/FIGHTER/, 'Fighter'],
];

const TOOL_KINDS: [RegExp, string][] = [
  [/PISTOL/, 'Pistol'],
  [/RIFLE/, 'Rifle'],
  [/ROYAL/, 'Royal'],
  [/ALIEN|ATLAS/, 'Alien'],
  [/STAFF/, 'Staff'],
  [/SENTINEL/, 'Sentinel'],
  [/EXPERIMENTAL/, 'Experimental'],
];

function modelBase(filename: string): string {
  return filename.split('/').pop()?.replace(/\.SCENE\.MBIN$/i, '') ?? '';
}

function kindFrom(filename: string, table: [RegExp, string][], fallback: string): string {
  const upper = filename.toUpperCase();
  const base = modelBase(upper);
  for (const [re, label] of table) if (re.test(base)) return label;
  for (const [re, label] of table) if (re.test(upper)) return label;
  const folder = upper.split('/').slice(-2, -1)[0];
  return folder ? folder.charAt(0) + folder.slice(1).toLowerCase() : fallback;
}

function itemClass(r: SaveReader, from: number): ItemClass | undefined {
  const c = r.text(['Class', 'InventoryClass'], from);
  return c === 'C' || c === 'B' || c === 'A' || c === 'S' ? c : undefined;
}

function inventory(r: SaveReader, from: number): InventorySummary {
  const valid = r.count(['ValidSlotIndices'], from);
  return { used: r.count(['Slots'], from), capacity: valid, techUsed: 0 };
}

export function readShips(r: SaveReader): ShipSummary[] {
  const p = r.player;
  const primary = Number(r.num(['PrimaryShip'], p) ?? -1);
  const out: ShipSummary[] = [];
  r.items(['ShipOwnership'], p).forEach((n, index) => {
    const filename = r.text(['Resource', 'Filename'], n) ?? '';
    if (!filename) return;
    const inv = r.node(['Inventory'], n);
    const tech = r.node(['Inventory_TechOnly'], n);
    const cargo = inventory(r, inv);
    if (tech >= 0) cargo.techUsed = r.count(['Slots'], tech);
    out.push({
      index,
      name: r.text(['Name'], n) ?? '',
      kind: kindFrom(filename, SHIP_KINDS, 'Starship'),
      model: modelBase(filename),
      seed: r.seed(['Resource', 'Seed'], n),
      class: inv >= 0 ? itemClass(r, inv) : undefined,
      primary: index === primary,
      cargo,
    });
  });
  return out;
}

export function readMultitools(r: SaveReader): MultitoolSummary[] {
  const p = r.player;
  const active = Number(r.num(['ActiveMultioolIndex'], p) ?? -1);
  const out: MultitoolSummary[] = [];
  r.items(['Multitools'], p).forEach((n, index) => {
    const filename = r.text(['Resource', 'Filename'], n) ?? '';
    const seed = r.seed(['Seed'], n);
    if (!filename && !seed) return;
    const store = r.node(['Store'], n);
    out.push({
      index,
      name: r.text(['Name'], n) ?? '',
      kind: kindFrom(filename, TOOL_KINDS, 'Multi-tool'),
      seed,
      class: store >= 0 ? itemClass(r, store) : undefined,
      active: index === active,
    });
  });
  return out;
}

/** Strings starting with ^ are game localisation keys, not names the player typed. */
function displayName(text: string | undefined): string {
  return text && !text.startsWith('^') ? text : '';
}

function popcount(n: number): number {
  let c = 0;
  for (let v = n >>> 0; v; v &= v - 1) c++;
  return c;
}

export function readCompanions(r: SaveReader): CompanionSummary[] {
  const p = r.player;
  const eggs = r.items(['Eggs'], p);
  const out: CompanionSummary[] = [];
  r.items(['Pets'], p).forEach((n, index) => {
    const id = r.text(['CreatureID'], n) ?? '';
    if (!id || id === '^') return;
    const egg = eggs[index];
    const eggId = egg === undefined ? '' : r.text(['CreatureID'], egg) ?? '';
    out.push({
      index,
      name: displayName(r.text(['CustomName'], n)) || displayName(r.text(['CustomSpeciesName'], n)),
      species: id.replace(/^\^/, ''),
      hasEgg: !!eggId && eggId !== '^',
    });
  });
  return out;
}

export function readCurrencies(r: SaveReader): Currencies {
  const p = r.player;
  return {
    units: r.num(['Units'], p) ?? 0,
    nanites: r.num(['Nanites'], p) ?? 0,
    quicksilver: r.num(['Specials'], p) ?? 0,
  };
}

export function readKnowledge(r: SaveReader): KnowledgeCounts {
  const p = r.player;
  return {
    technology: r.count(['KnownTech'], p),
    products: r.count(['KnownProducts'], p),
    specials: r.count(['KnownSpecials'], p),
    refinerRecipes: r.count(['KnownRefinerRecipes'], p),
    words: r.count(['KnownWordGroups'], p) || r.count(['KnownWords'], p),
    portalGlyphs: popcount(Number(r.num(['KnownPortalRunes'], p) ?? 0)),
  };
}

export interface SaveOverview {
  context: 'BaseContext' | 'ExpeditionContext';
  platform: string | undefined;
  playTimeSeconds: number;
  currencies: Currencies;
  ships: ShipSummary[];
  multitools: MultitoolSummary[];
  companions: CompanionSummary[];
  knowledge: KnowledgeCounts;
  capacity: { ships: number; multitools: number; companions: number };
}

export function readOverview(r: SaveReader): SaveOverview {
  const p = r.player;
  return {
    context: r.context,
    platform: r.text(['Platform']),
    playTimeSeconds: Number(r.num(['CommonStateData', 'TotalPlayTime']) ?? 0),
    currencies: readCurrencies(r),
    ships: readShips(r),
    multitools: readMultitools(r),
    companions: readCompanions(r),
    knowledge: readKnowledge(r),
    capacity: {
      ships: r.count(['ShipOwnership'], p),
      multitools: r.count(['Multitools'], p),
      companions: r.count(['Pets'], p),
    },
  };
}

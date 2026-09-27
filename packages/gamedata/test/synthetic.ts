// A tiny made-up facts pack. Every name here is fictional; no game text is committed.
import { FACTS_PACK_VERSION, ITEM_KINDS, type FactsItem, type FactsPack, type ItemKind } from '../src/types.ts';

export const SYNTHETIC_ITEMS: FactsItem[] = [
  {
    id: 'TESTSUB1',
    kind: 'substance',
    name: 'Test Alloy',
    subtitle: 'Refined Test Element',
    category: 'Metal',
    substanceCategory: 'Metal',
    rarity: 'Common',
    value: 10,
    stackMultiplier: 1,
    maxStack: 9999,
    iconPath: 'textures/ui/frontend/icons/test/alloy.dds',
    nameKey: 'TEST_ALLOY_NAME_L',
  },
  {
    id: 'TESTSUB2',
    kind: 'substance',
    name: 'Mock Crystal',
    category: 'Catalyst',
    substanceCategory: 'Catalyst',
    rarity: 'Rare',
    value: 50,
    stackMultiplier: 1,
  },
  {
    id: 'TESTPROD1',
    kind: 'product',
    name: 'Sample Widget',
    subtitle: 'Crafted Test Component',
    description: 'A widget made for tests.',
    category: 'Component',
    substanceCategory: 'Catalyst',
    rarity: 'Common',
    value: 800,
    stackMultiplier: 2,
    maxStack: 20,
    craftable: true,
  },
  {
    id: 'TESTPROD2',
    kind: 'product',
    name: 'Placeholder Loot',
    category: 'Curiosity',
    proceduralName: true,
    stackMultiplier: 1,
  },
  {
    id: 'TESTTECH1',
    kind: 'technology',
    name: 'Example Shield',
    category: 'Suit',
    rarity: 'Always',
    chargeable: true,
    chargeAmount: 80,
  },
  {
    id: 'TESTPROC1',
    kind: 'procedural',
    name: 'Demo Beam Upgrade',
    category: 'Mining',
    rarity: 'Normal',
    template: 'TESTTECH1',
  },
];

export function makeItems(list: FactsItem[] = SYNTHETIC_ITEMS): Record<string, FactsItem> {
  return Object.fromEntries(list.map((i) => [i.id, structuredClone(i)]));
}

export function makePack(overrides: Partial<FactsPack> = {}): FactsPack {
  const items = overrides.items ?? makeItems();
  const counts = Object.fromEntries(ITEM_KINDS.map((k) => [k, 0])) as Record<ItemKind, number>;
  for (const i of Object.values(items)) counts[i.kind]++;
  return {
    version: FACTS_PACK_VERSION,
    gameBuild: 'test-build',
    fingerprint: '0123456789ab',
    generatedAt: '2026-01-01T00:00:00.000Z',
    generator: { mbinCompiler: 'test' },
    language: 'English',
    counts,
    items,
    strings: {
      UI_TEST_SPECIES: 'Imaginary Companion',
      TEST_ALLOY_NAME_L: 'Test Alloy',
    },
    stackLimits: {
      defaultOption: 'High',
      presets: { Normal: 'High', Survival: 'Normal' },
      options: {
        High: { substanceCap: 9999, productCap: 9999, substance: { Default: 9999, Personal: 9999 }, product: { Default: 5, Personal: 10, Chest: 20 } },
        Normal: { substanceCap: 9999, productCap: 9999, substance: { Default: 500, Personal: 500, Ship: 1000 }, product: { Default: 5, Personal: 10 } },
      },
    },
    ...overrides,
  };
}

const ADJ = ['Brisk', 'Quiet', 'Hollow', 'Bright', 'Dusky', 'Amber', 'Velvet', 'Rapid', 'Lunar', 'Coral'];
const NOUN = ['Gear', 'Shard', 'Coil', 'Lens', 'Cell', 'Plate', 'Seed', 'Spire', 'Valve', 'Prism'];
const KIND_CYCLE: ItemKind[] = ['product', 'product', 'product', 'technology', 'substance', 'procedural'];

/** `n` deterministic fake items for the search benchmark. */
export function manyItems(n: number): FactsItem[] {
  const out: FactsItem[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `FAKE_${i.toString(36).toUpperCase()}`,
      kind: KIND_CYCLE[i % KIND_CYCLE.length]!,
      name: `${ADJ[i % ADJ.length]} ${NOUN[Math.floor(i / ADJ.length) % NOUN.length]} Mk ${i}`,
      subtitle: `Series ${i % 17}`,
      category: `Group${i % 9}`,
    });
  }
  return out;
}

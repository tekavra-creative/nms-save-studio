import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { binaryToBytes, JsonDoc, KeyMap, readOverview, SaveFile, SaveReader, type MappingFile } from '../src/index.ts';

const mapping = JSON.parse(readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8')) as MappingFile;
const plain = (json: string) => {
  const doc = new JsonDoc(binaryToBytes(json));
  return new SaveReader(doc, new KeyMap({ libMBIN_version: 't', Mapping: [] }, 'plain'));
};

describe('asset readers (synthetic, plain keys)', () => {
  const save = JSON.stringify({
    Version: 4738,
    Platform: 'Mac|Final',
    ActiveContext: 'Main',
    CommonStateData: { TotalPlayTime: 3600 },
    BaseContext: {
      PlayerStateData: {
        Units: 18446744073709551615,
        Nanites: 12,
        Specials: 3,
        PrimaryShip: 1,
        ShipOwnership: [
          { Name: '', Resource: { Filename: '', Seed: [false, '0x0'] } },
          {
            Name: 'Halcyon Ferry',
            Resource: { Filename: 'MODELS/COMMON/SPACECRAFT/FIGHTERS/SPOOKSHIP/SPOOKSHIP.SCENE.MBIN', Seed: [true, '0xABC'] },
            Inventory: { Slots: [{}], ValidSlotIndices: [{}, {}], Class: { InventoryClass: 'S' } },
            Inventory_TechOnly: { Slots: [{}, {}, {}] },
          },
        ],
        Multitools: [{ Seed: [true, '0x1'], Resource: { Filename: 'MODELS/COMMON/WEAPONS/MULTITOOL/MULTITOOL.SCENE.MBIN' }, Store: { Class: { InventoryClass: 'B' } } }],
        ActiveMultioolIndex: 0,
        Pets: [{ CreatureID: '^STRIDERGLOW', CustomSpeciesName: '^UI_GLOWPET_SPECIES' }, { CreatureID: '^' }],
        Eggs: [{ CreatureID: '^' }, { CreatureID: '^' }],
        KnownTech: [1, 2],
        KnownProducts: [1],
        KnownPortalRunes: 65535,
      },
    },
  }).replace('18446744073709552000', '18446744073709551615');

  it('reads ships, tools, companions, currencies and knowledge by readable name', () => {
    const o = readOverview(plain(save));
    expect(o.currencies.units).toBe(18446744073709551615n);
    expect(o.ships).toHaveLength(1);
    expect(o.ships[0]).toMatchObject({ index: 1, name: 'Halcyon Ferry', kind: 'Boundary Herald', class: 'S', primary: true, seed: '0xABC' });
    expect(o.ships[0]!.cargo).toEqual({ used: 1, capacity: 2, techUsed: 3 });
    expect(o.multitools[0]).toMatchObject({ class: 'B', active: true });
    expect(o.companions).toEqual([{ index: 0, name: '', species: 'STRIDERGLOW', hasEgg: false }]);
    expect(o.knowledge).toMatchObject({ technology: 2, products: 1, portalGlyphs: 16 });
    expect(o.capacity).toEqual({ ships: 2, multitools: 1, companions: 2 });
  });
});

const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');

describe.skipIf(!existsSync(join(CORPUS, 'save5.hg')))('asset readers (real saves)', () => {
  it('reads the Space Anomaly save', () => {
    const s = new SaveFile(new Uint8Array(readFileSync(join(CORPUS, 'save5.hg'))), new Uint8Array(readFileSync(join(CORPUS, 'mf_save5.hg'))), 6);
    const o = readOverview(new SaveReader(s.doc, KeyMap.forDoc(mapping, s.doc)));
    expect(o.ships.map((x) => x.kind)).toEqual(['Explorer', 'Sentinel Interceptor', 'Boundary Herald']);
    expect(o.currencies.nanites).toBe(8060);
    expect(o.capacity.ships).toBe(12);
  });
});

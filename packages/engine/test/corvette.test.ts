import { describe, expect, it } from 'vitest';
import {
  binaryToBytes,
  EditSession,
  findCorvetteBase,
  isCorvette,
  JsonDoc,
  KeyMap,
  SaveReader,
  transferAsset,
  transferBlockedReason,
  type MappingFile,
} from '../src/index.ts';

/**
 * No real save in the corpus has ever built a corvette (confirmed against both of the golden
 * saves), so this is verified against a synthetic fixture built to the documented shape
 * (docs/format/linked-data.md), not against a real corvette save. Flag that to whoever next
 * touches this: re-verify against a real save the moment one exists.
 */
const plain: MappingFile = { libMBIN_version: 'test', Mapping: [] };
const keys = new KeyMap(plain, 'plain');
const reader = (json: string) => new SaveReader(new JsonDoc(binaryToBytes(json)), keys);

const SOURCE = JSON.stringify({
  Version: 1,
  BaseContext: {
    PlayerStateData: {
      ShipOwnership: [
        { Resource: { Filename: 'MODELS/COMMON/BUILDINGS/PLAYERSHIPBUILDINGPARTS/BIGGS_HULL.SCENE.MBIN', Seed: [true, '0xAA'] }, Name: 'My Corvette' },
        { Resource: { Filename: 'MODELS/COMMON/SPACECRAFT/FIGHTER.SCENE.MBIN', Seed: [true, '0xCC'] }, Name: 'Fighter' },
      ],
      ShipUsesLegacyColours: [false, false],
      CharacterCustomisationData: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3, note: 'corvette-custom' }, { n: 4 }],
      PrimaryShip: 1,
      PersistentPlayerBases: [
        { Name: 'Home Base', BaseType: { PersistentBaseTypes: 'HomePlanetBase' }, UserData: 0 },
        { Name: 'Corvette Base', BaseType: { PersistentBaseTypes: 'PlayerShipBase' }, UserData: 0 },
      ],
    },
  },
});

const TARGET = JSON.stringify({
  Version: 1,
  BaseContext: {
    PlayerStateData: {
      ShipOwnership: [
        { Resource: { Filename: '', Seed: [false, ''] } },
        { Resource: { Filename: 'MODELS/COMMON/SPACECRAFT/HAULER.SCENE.MBIN', Seed: [true, '0xBB'] }, Name: 'Existing Ship' },
      ],
      ShipUsesLegacyColours: [false, false],
      CharacterCustomisationData: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
      PrimaryShip: 1,
      PersistentPlayerBases: [{ Name: 'Target Home', BaseType: { PersistentBaseTypes: 'HomePlanetBase' }, UserData: 0 }],
    },
  },
});

describe('corvette transfer (synthetic fixture — see file header)', () => {
  it('detects a corvette by its BIGGS filename and finds its linked base', () => {
    const source = reader(SOURCE);
    expect(isCorvette(source, 0)).toBe(true);
    expect(isCorvette(source, 1)).toBe(false);
    const baseNode = findCorvetteBase(source, 0);
    expect(baseNode).toBeGreaterThanOrEqual(0);
    expect(source.text(['Name'], baseNode)).toBe('Corvette Base');
  });

  it('blocks moving the primary corvette, and blocks when no base is linked', () => {
    const primaryCorvette = JSON.parse(SOURCE);
    primaryCorvette.BaseContext.PlayerStateData.PrimaryShip = 0;
    expect(transferBlockedReason('ship', reader(JSON.stringify(primaryCorvette)), 0)).toMatch(/primary corvette/);

    const noBase = JSON.parse(SOURCE);
    noBase.BaseContext.PlayerStateData.PersistentPlayerBases = [noBase.BaseContext.PlayerStateData.PersistentPlayerBases[0]];
    expect(transferBlockedReason('ship', reader(JSON.stringify(noBase)), 0)).toMatch(/build record/);

    expect(transferBlockedReason('ship', reader(SOURCE), 0)).toBeUndefined();
    expect(transferBlockedReason('ship', reader(SOURCE), 1)).toBeUndefined(); // ordinary ship: untouched
  });

  it('moves the corvette ship AND its base record, patches UserData to the new slot, and undoes cleanly', () => {
    const source = reader(SOURCE);
    const targetDoc = new JsonDoc(binaryToBytes(TARGET));
    const session = new EditSession(targetDoc, keys);
    const original = Buffer.from(targetDoc.bytes);
    const targetReader = () => new SaveReader(session.doc, keys);

    session.apply(transferAsset('ship', source, 0, targetReader(), 0, 'Bring My Corvette'));

    const after = targetReader();
    expect(after.text(['ShipOwnership', 0, 'Name'], after.player)).toBe('My Corvette');
    expect(after.count(['PersistentPlayerBases'], after.player)).toBe(2);
    const newBase = findCorvetteBase(after, 0);
    expect(newBase).toBeGreaterThanOrEqual(0);
    expect(after.text(['Name'], newBase)).toBe('Corvette Base');
    expect(after.num(['UserData'], newBase)).toBe(0);
    // the pre-existing target base is untouched
    expect(after.text(['PersistentPlayerBases', 0, 'Name'], after.player)).toBe('Target Home');
    // array lengths for fixed-size parallel arrays never change (golden rule)
    expect(after.count(['ShipOwnership'], after.player)).toBe(2);
    expect(after.count(['CharacterCustomisationData'], after.player)).toBe(5);

    session.undo();
    expect(Buffer.compare(Buffer.from(session.bytes), original)).toBe(0);
  });
});

# Linked save data — what must move together

Facts learned from public sources (MBINCompiler structs, LGPL; NMSE and libNOM read for facts only,
no code copied). Pinned commits: MBINCompiler `0e81c91a`, NMSE `eb1ae1f3`, libNOM.io `652aabb0`.
Game: Cosmos, save version 4226.

## Golden rule
Never splice (insert/remove) a fixed-size asset array. Parallel arrays share indices; deleting shifts
every link. Empty a slot in place instead.

## CharacterCustomisationData (26 entries, by CustomisationDataTypeEnum)
0 Player · 1 Vehicle (Roamer) · 2 Weapon · 3–8 Ship 1–6 · 9 Nomad · 10 Colossus · 11 Pilgrim ·
12 Hovercraft · 13 Nautilon · 14 Minotaur · 15 Freighter · 16 Pet · 17–22 Ship 7–12 ·
23 Pirate freighter · 24 Skiff · 25 Fishing rod.
Ship slot i → customisation index `i < 6 ? i + 3 : i + 11`.

## Starship (ShipOwnership[12])
- Unit of transfer (mirrors the game's own ArchivedShipData): `ShipOwnership[i]` +
  `ShipUsesLegacyColours[i]` + `CharacterCustomisationData[ccd(i)]`.
- Empty slot: `Resource.Seed[0] == false` and `Resource.Filename == ""`.
- Don't change `PrimaryShip` unless moving the primary ship. Top-level `CurrentShip` /
  `ShipInventory` / `ShipLayout` mirror the primary ship — leave untouched.
- **Corvette** (`Resource.Filename` contains `BIGGS`): also a `PersistentPlayerBases` entry with
  `BaseType.PersistentBaseTypes == "PlayerShipBase"` and `UserData == ship index` → append that
  entry (never splice — it's a growable list, not one of the fixed-size arrays above) and rewrite
  its `UserData` to the new slot. Confirmed live in both real corpus saves: `PersistentPlayerBases`
  sits at `BaseContext.PlayerStateData.PersistentPlayerBases`, and a real entry's fields
  (`BaseType`, `UserData`, `Owner`, ...) match this doc exactly (`packages/engine/test/corvette.test.ts`
  header has the probe). Implemented in `packages/engine/src/merge/assets.ts`
  (`isCorvette`/`findCorvetteBase`, `transferAsset`). Blocked when the corvette is the source
  save's `PrimaryShip` (moving it risks corruption) or when no linked base is found.
  **Not yet verified against a real corvette save** — neither of the two saves in the golden
  corpus has ever built one, so this is tested only against a synthetic fixture built to this
  doc's shape. Re-verify with `nmsx` against a real corvette save before calling it fully proven,
  and the game may not render an imported corvette until the target account has built one itself.

## Multi-tool (Multitools[6])
Self-contained (own CustomisationData + UseLegacyColours). Empty: `Seed[0] == false`. Active tool
mirrors into `WeaponInventory` / `CurrentWeapon` — don't change `ActiveMultioolIndex`.

## Companion (Pets[30], Eggs[18])
- Unit: `Pets[i]` + `PetAccessoryCustomisation[i]`. Target slot must be `UnlockedPetSlots[j] == true`.
- Empty: `CreatureSeed[0] == false`.
- `PetBattleTeam.TeamMembers[].PetIndex` points into Pets — remap if moving within a save.
- Eggs are a separate 18-slot pool; inventory item `^EGG{n}` references egg slot n (1-based).

## Exocraft (VehicleOwnership[7], fixed by type)
0 Roamer · 1 Nomad · 2 Colossus · 3 Pilgrim · 4 (unused hovercraft) · 5 Nautilon · 6 Minotaur.
Moves only to the same index. `PrimaryVehicle` indexes this array.

## Freighter (singletons — one active freighter)
CurrentFreighter, CurrentFreighterNPC, Freighter inventories + layouts, CurrentFreighterHomeSystemSeed,
FreighterUniverseAddress, FreighterMatrix*, PlayerFreighterName, FreighterDismissed,
FreighterLastSpawnTime, FreighterEngineEffect, the `FreighterBase` base, FleetFrigates.
`FleetExpeditions[]` index into FleetFrigates — never reorder frigates during an expedition.
`FreighterFleet[8]` exists since Aug 2025 (population unverified).

## Ownership blocks {LID, UID, USN, PTK, TS}
Same Steam account → no rewrite. Other platform/account → set UID; set LID/USN/PTK when non-empty;
set Platform. Applies to discoveries, HomePlanetBase/FreighterBase, SettlementStatesV2, ByteBeat.
PTK values: ST, GX, XB, PS, NS.

# Handoff — NMS Save Studio

Native Mac (Windows not yet built) save editor for No Man's Sky. Electron + React 19 + TypeScript,
pnpm monorepo. Plan of record: `~/.claude/plans/valiant-jumping-newell.md` (milestones M0–M5).
Public repo: https://github.com/tekavra-creative/nms-save-studio (flipped public 2026-09-27).
Latest release: **v0.3.0**, notarized.

## What actually works today (2026-09-28)

- **Merge Studio** — drag ships/multi-tools/companions/currencies/knowledge between two saves,
  undo/redo, write to a new slot. Corvette transfer implemented but only verified against a
  synthetic fixture — neither save in the golden corpus has ever built one.
- **Raw Explorer** — browse/search/edit any field in any save, in-place write (same slot), guarded
  by fingerprint-check + snapshot + rollback. `packages/engine/src/explorer.ts`.
- **Inventory editor** — a tab inside Raw Explorer. Every container (exosuit x3, active
  ship/multi-tool, freighter x3, corvette storage, 10 base chests + 2 exotic +
  cooking/fishing/food), real item names/icons/search from the facts pack.
  `packages/engine/src/domains/inventory.ts`, `apps/desktop/src/renderer/src/explorer/InventoryGrid.tsx`.
- **Story-skip** — "Skip the story" on each save card: completes the Artemis + Atlas paths using
  okranger1777/nms-mission-progress's mission-completion data (MIT, credited). Always writes to a
  NEW slot. `packages/engine/src/domains/story.ts`.
- **Survival check** — "Check survival" button compares a merged/edited save against its source
  after a real play session.
- Three skins (Parhelion default, Drydock, Portolan), all with real per-skin CSS for every screen
  above — never a neutral/generic overlay (that was tried once for Raw Explorer/Inventory and
  Vikelas correctly called it out as bad UX; fixed).
- Mac build is **notarized** with a real Developer ID cert (only the Apple account's Account
  Holder can create that cert — automation can't; Vikelas did the one-time Xcode step).
  `apps/desktop/build/resign-nested-frameworks.cjs` fixes a real signing gotcha: Electron's bundled
  Squirrel/Mantle/ReactiveObjC frameworks need re-signing as whole BUNDLES, not just their inner
  binaries, or Gatekeeper (not notarization — that didn't catch it) rejects the app.

## Format facts the code depends on

- Slot N = `save(2N−1).hg` (auto) + `save(2N).hg` (manual); slot 1 = `save.hg`/`save2.hg`.
- Manifest slot index for XXTEA key: `save.hg`=2, `saveN.hg`=N+1.
- `CommonStateData.SaveUniversalId` / `SaveName` are the fields a slot copy must rewrite.
- `PersistentPlayerBases` lives at `BaseContext.PlayerStateData.PersistentPlayerBases` (confirmed
  against real saves) — a corvette is ALSO one of these entries, `BaseType.PersistentBaseTypes ==
  "PlayerShipBase"`, `UserData == ship slot index`.
- Inventory containers (`Inventory`, `ShipInventory`, `FreighterInventory`, `Chest1Inventory`, …)
  all share one shape: `Slots[]` (sparse — only occupied cells stored) + `ValidSlotIndices[]`
  (which grid cells are unlocked) + `Width`/`Height`. `Slots[i]` = `{Type:{InventoryType}, Id,
  Amount, MaxAmount, DamageFactor, FullyInstalled, AddedAutomatically, Index:{X,Y}}`.
- `MissionProgress[]` (554+ entries in a mid-game save) = `{Mission, Progress, Seed, Data, Stat,
  Participants}`. `Progress` is NOT a 0/1 flag — it's mission-internal state; "complete" values are
  documented per-mission by the community, not derivable from one save alone.
  `CurrentMissionID` is the game's own "where am I" pointer.
- Save JSON has raw non-UTF-8 bytes; never use `JSON.parse` or `TextDecoder('latin1')` (that label
  is windows-1252).

## Known gaps

- **Windows build**: never built or tested — needs Vikelas's Windows machine.
- **Corvette merge**: code exists, only synthetic-fixture-tested.
- Domain screens still missing: freighter/frigates/squadron, exocraft, bases/settlements,
  discoveries, milestones/reputation — Raw Explorer reaches all of these generically today.
- Story-skip only has one bundled preset ("Artemis + Atlas"); no Nexus/side-quest presets, no
  mission viewer.
- No auto-updater, no landing page beyond the GitHub repo/README.

## Next

1. Nexus/side-mission story presets, or a browsable mission viewer.
2. Domain-specific screens (freighter, bases, exocraft) with the same design-quality bar as
   Merge Studio / Inventory editor.
3. Windows build + signing (Azure Trusted Signing, ~$10/mo — needs Vikelas's go-ahead to spend).

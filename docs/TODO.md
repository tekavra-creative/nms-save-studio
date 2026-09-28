# TODO

## Facts pack
- [x] 5,235 items with names/icons from the user's own install (`packages/gamedata`, `data-forge` build-facts)
- [x] Use item names + icons in the UI (Inventory editor — knowledge lists still plain text)

## M0 Foundations
- [x] Repo, clean-room CLAUDE.md, private GitHub remote
- [x] Engine: LZ4, chunks, XXTEA manifest, lossless JSON, edit/undo, slot copy, diff
- [x] io: discovery, game-running check, safe write + rollback
- [x] nmsx CLI (list / copy-slot / diff)
- [x] Byte-identical round trip on all 5 real saves
- [ ] In-game: "Studio Test" (slot 4) shows its name and loads — **waiting on Vikelas**
- [x] Data-forge spike: HGPAK reader + icons render from the local install
- [x] 3 hero comps; Vikelas chose all three as switchable skins, Parhelion default

## M1 Merge Day
- [x] Asset readers + transfer ops (ships incl. linked colour/customisation, multitools, companions, corvettes) — corvette support verified against a synthetic fixture only, not a real corvette save (none in the corpus); re-verify when one exists
- [x] Linked-data map documented (`docs/format/linked-data.md`)
- [x] Electron shell (hardened, fuses, app:// + nms-icon:// protocols), engine in utilityProcess, typed IPC
- [x] Saves home + Merge Studio + Changes ledger (per-line revert, currency sum/keep/replace, undo/redo) + Write to a new slot
- [x] Skin system; Parhelion skin (default, fonts bundled)
- [x] "Ralfar + Anomaly" written to slot 5 via CLI — **waiting on Vikelas's in-game check**, then `nmsx survival --target 5 --source 3`
- [x] Drydock + Portolan skins
- [x] Full e2e suite across all skins (6/6)
- [x] Survival check in the app UI ("Check survival" button on the home screen)

## M2 Full editing (in progress — this is the "extensive save editing" ask)
- [x] Raw Explorer: generic browse + edit of any field in any save (`packages/engine/src/explorer.ts` + app screen, in-place write with the existing safe-write guard). This is the write-into-original-save path — no longer merge-only.
- [x] Inventory editor: real names/icons/search for every container (exosuit x3, active ship/tool, freighter x3, corvette storage, 10 base chests + 2 exotic + cooking/fishing/food) — same design quality as Merge Studio, in all 3 skins
- [ ] Domain screens for the rest (freighter/frigates/squadron, exocraft, bases/settlements, discoveries, milestones/reputation) — Raw Explorer covers these today, generically but plainly; these give each a purpose-built, friendlier UI
- [ ] Bulk actions (max-out a stack, unlock all tech, etc.) with preview before write

## M2 Story Day
- [x] Story-skip preset: complete the Artemis + Atlas paths without replaying, using
  okranger1777/nms-mission-progress's documented mission-completion values (MIT, credited).
  Always writes to a new slot. Verified against the real Ralfar save (never regresses a mission
  already past its complete value; running it twice is a real no-op).
- [ ] More presets (Nexus/community missions, individual side-story lines) — currently one bundled
  "Artemis + Atlas" preset covers the two main paths only
- [ ] Mission viewer (see what CurrentMissionID/the progress array actually mean, browseable)

## Discovered
- [ ] Survival check: re-read after a play session and report which edits stuck
- [ ] Read-only mode when save version is newer than the newest tested (4226)

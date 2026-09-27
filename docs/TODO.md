# TODO

## Facts pack
- [x] 5,235 items with names/icons from the user's own install (`packages/gamedata`, `data-forge` build-facts)
- [ ] Use item names + icons in the UI (knowledge lists, inventories)

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
- [x] Asset readers + transfer ops (ships incl. linked colour/customisation, multitools, companions); corvettes blocked with reason
- [x] Linked-data map documented (`docs/format/linked-data.md`)
- [x] Electron shell (hardened, fuses, app:// + nms-icon:// protocols), engine in utilityProcess, typed IPC
- [x] Saves home + Merge Studio + Changes ledger (per-line revert, currency sum/keep/replace, undo/redo) + Write to a new slot
- [x] Skin system; Parhelion skin (default, fonts bundled)
- [x] "Ralfar + Anomaly" written to slot 5 via CLI — **waiting on Vikelas's in-game check**, then `nmsx survival --target 5 --source 3`
- [ ] Drydock + Portolan skins (in progress)
- [ ] Full e2e suite across all skins
- [ ] Write-into-original-save option (currently always a new slot)
- [ ] Survival check in the app UI

## Discovered
- [ ] Survival check: re-read after a play session and report which edits stuck
- [ ] Read-only mode when save version is newer than the newest tested (4226)

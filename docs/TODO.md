# TODO

## M0 Foundations
- [x] Repo, clean-room CLAUDE.md, private GitHub remote
- [x] Engine: LZ4, chunks, XXTEA manifest, lossless JSON, edit/undo, slot copy, diff
- [x] io: discovery, game-running check, safe write + rollback
- [x] nmsx CLI (list / copy-slot / diff)
- [x] Byte-identical round trip on all 5 real saves
- [ ] In-game: "Studio Test" (slot 4) shows its name and loads — **waiting on Vikelas**
- [ ] Data-forge spike: HGPAK reader + one icon rendered (agent running)
- [ ] 3 Merge Studio hero comps + name candidates; Vikelas picks one (agent running)

## M1 Merge Day
- [ ] Domain adapters: ships (12 slots + linked arrays), multitools, pets/eggs, currencies, known lists
- [ ] Learn linked arrays with `nmsx diff` on real in-game changes
- [ ] Electron shell (hardened), engine host in utilityProcess, typed IPC
- [ ] Saves home + Merge Studio + Changes panel + Write
- [ ] Merge Space Anomaly assets into a new-slot copy of Ralfar; Vikelas loads it in-game

## Discovered
- [ ] Survival check: re-read after a play session and report which edits stuck
- [ ] Read-only mode when save version is newer than the newest tested (4226)

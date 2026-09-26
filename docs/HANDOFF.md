# Handoff — NMS Save Studio (codename)

Native Mac + Windows save editor for No Man's Sky. Headline features: merge two saves, story-skip,
full editing with undo and preview. Plan of record: `~/.claude/plans/valiant-jumping-newell.md`.

## State (2026-09-26, end of M0 engine work)

- `packages/engine` — pure TypeScript, zero runtime deps. LZ4 block codec (`src/codec/lz4.ts`),
  save chunk container (`src/codec/chunks.ts`), XXTEA manifest (`src/manifest/`), lossless JSON tree
  (`src/cst/scan.ts`, `src/cst/doc.ts`), undo/redo edits (`src/edit.ts`), slot copy
  (`src/ops/slot-copy.ts`), structural diff (`src/diff.ts`), key map (`src/keys/`).
- `packages/io` — Node-only disk layer: save-folder discovery, game-running check, slot listing,
  safe write transaction (`src/transaction.ts`).
- `tools/nmsx` — dev CLI: `node tools/nmsx/nmsx.ts list | copy-slot | diff`.
- Tests: `pnpm test` (engine 29, io 5). Real-save tests read `~/NMSCorpus` and skip if absent.

## Format facts the code depends on

- Slot N = `save(2N−1).hg` (auto) + `save(2N).hg` (manual); slot 1 = `save.hg`/`save2.hg`.
- Manifest slot index for XXTEA key: `save.hg`=2, `saveN.hg`=N+1.
- Manifest bytes 0x15C–0x163 = `CommonStateData.SaveUniversalId` (little-endian). A copied slot must
  get a new ID in both places or cross-save may treat it as the original.
- PS5-origin manifests carry junk after text terminators — text fields are rewritten only when
  changed.
- Save JSON has raw non-UTF-8 bytes; never use `JSON.parse` or `TextDecoder('latin1')` (that label
  is windows-1252).

## Live state on Vikelas's Mac

- Slot 2 = Ralfar, slot 3 = Space Anomaly (both untouched).
- Slot 4 = "Studio Test" (copy of Ralfar written by `nmsx copy-slot`, `save7.hg`) — awaiting his
  in-game check. Delete it in-game any time.
- Pre-write snapshot: `~/Library/Application Support/NMS Save Studio/Snapshots/`.
- Backup of the original folder: `~/Desktop/NMS_backup_20260926_1348/`.

## Next

1. His in-game check of "Studio Test" (M0 acceptance).
2. Merge worktree agents' branches: data-forge spike (HGPAK + icon) and Merge Studio hero comps.
3. M1: domain adapters (ships, multitools, pets, currencies, known lists) → Electron shell →
   Merge Studio.

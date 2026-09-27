# Changelog

## 2026-09-27 — v0.2.0: Inventory editor, notarized Mac build

### Added
- Real Inventory editor inside Raw Explorer (a "Fields"/"Inventories" tab, same session,
  undo/redo, Write): every container the app knows how to edit (exosuit x3, active
  ship/multi-tool, freighter x3, corvette storage, 10 base chests + 2 exotic +
  cooking/fishing/food), real item names/icons/search from the facts pack, click to change
  amount or item, click empty cells to add, remove to clear. Same design quality as Merge
  Studio, verified per-skin with screenshots.
- Real app icon (generated art, not the default Electron icon).

### Fixed
- Mac build is now actually notarized with a real Developer ID certificate, not ad-hoc signed.
  `spctl` now says "accepted, source=Notarized Developer ID" — previously Gatekeeper warned on
  every first launch. Also fixed a real signing bug along the way: Electron's bundled
  Squirrel/Mantle/ReactiveObjC frameworks came out of the normal signing pass still on
  Electron's own signature, which broke notarization until each framework BUNDLE (not just the
  binary inside it) was re-signed individually.

## 2026-09-27 — Corvette support in Merge Studio

### Added
- Moving a corvette between saves now works: its ship record moves like any other ship, and its
  linked `PersistentPlayerBases` entry moves with it, with `UserData` rewritten to the new slot.
  Blocked only when the corvette is the source save's primary ship, or its linked base can't be
  found. `packages/engine/src/merge/assets.ts` (`isCorvette`, `findCorvetteBase`), `merge/plan.ts`.

### Known limitation
- Verified against a synthetic fixture built to the documented format
  (`packages/engine/test/corvette.test.ts`), not against a real corvette save — neither save in
  the golden corpus has ever built one. Treat as unverified in practice until tested against one.

## 2026-09-27 — Raw Explorer (full editing, generic)

### Added
- Raw Explorer: a screen that browses and edits any field of any save, not a fixed list of
  categories. Reachable per save from the home screen ("Browse every field"). Writes go back into
  the same slot, guarded by the same fingerprint + snapshot + rollback path the safe write already had.
- Engine: `packages/engine/src/explorer.ts` — `listChildren`/`getLeaf`/`setLeaf`, path-based and
  schema-agnostic; unknown fields show their raw key, known fields show the mapped name.

### Fixed
- Layout bug found via e2e: the crumbs bar, field list and footer overlapped in the same CSS grid
  row, because the app shell's outer grid only defines 2 explicit rows — fixed by giving Raw
  Explorer one wrapper below the header instead of several siblings.

## 2026-09-27 — M1 Merge Studio

### Added
- Merge Studio in the desktop app: pick two saves, drag ships/multi-tools/companions into a copy, merge currencies (sum/keep/replace) and knowledge, revert any single line, undo/redo, write to a new slot after existing saves.
- Skin system with bundled fonts; Parhelion (default) skin ported from the design comp.
- Mac packaging (fuses, ad-hoc signing with Electron entitlements) and a packaged self-test.
- Facts pack: item names, descriptions, icons from the user's own game install.

### Fixed
- Packaged app was killed at launch (fuses invalidated the signature) → ad-hoc re-sign with entitlements.
- Interface failed to load from the package → served via an app:// protocol.
- New saves no longer reuse a recently deleted slot (Steam Cloud may still remember it).

## 2026-09-26 — M0 engine

### Added
- Save engine: LZ4 block codec, save chunk container, XXTEA manifest read/write, lossless JSON tree,
  undo/redo edit session, slot copy with a fresh cross-save identity, structural diff.
- Safe-write package: refuses while the game runs or when files changed since read; snapshots the
  whole save folder, writes atomically, verifies, rolls back on failure.
- `nmsx` developer CLI.

### Fixed
- Manifest re-serialization dropped junk bytes after text terminators in PS5-origin saves — text
  fields are now rewritten only when changed.
- Windows-1252 decoding (`TextDecoder('latin1')`) would have altered bytes 0x80–0x9F — replaced with
  byte-exact conversion.

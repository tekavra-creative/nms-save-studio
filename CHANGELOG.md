# Changelog

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

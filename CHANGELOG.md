# Changelog

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

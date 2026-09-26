# NMS Save Studio (codename)

Native macOS + Windows save editor for No Man's Sky. Electron + React 19 + TypeScript, pnpm monorepo.
Plan of record: `~/.claude/plans/valiant-jumping-newell.md` (milestones M0–M5).

## Clean-room rules (legal — mandatory)

- **Never read, open, grep or copy** anything under `~/Desktop/NMSSaveEditor/` or any other copy of
  goatfungus NMSSaveEditor. It has no license; its code and data files (items.xml, icons, templates)
  are off-limits.
- **Never copy code** from GPL/AGPL projects: libNOM.io, libNOM.map, NomNom, NMSE, NMSCD
  nms-save-web-editor, AssistantNMS. This repo is private; GPL code would force it public. File
  formats and facts may be reimplemented from their documentation.
- MIT/permissive sources may be used **with credit in `THIRD_PARTY_NOTICES.md`**: HGPAKtool,
  okranger1777/nms-mission-progress, bcdec.
- `mapping.json` (MBINCompiler, LGPL-3.0) is downloaded at runtime; a bundled fallback carries the
  LGPL notice.
- No Hello Games logos, fonts, icons or trademarks in branding. "for No Man's Sky" only as a
  description. Item icons are read at runtime from the user's own install, never committed.

## Data rules

- **Never commit real save files.** The golden corpus lives at `~/NMSCorpus` (`NMS_SAVE_CORPUS`
  env var); tests skip when it is absent. Committed fixtures are synthetic, fake names only
  (`Jane Doe`, `example.com`).
- Save data is **bytes**. Never `JSON.parse`/`TextDecoder('utf-8')` a save: it contains raw
  non-UTF-8 bytes, u64 numbers above 2^53, and integer-like keys whose order matters. Use the
  engine's lossless document (`packages/engine/src/cst`).

## Supply chain

- Install only via `sfw pnpm add -E <pkg>` (Socket Firewall, exact pins). `minimumReleaseAge` is
  3 days in `pnpm-workspace.yaml`. Build scripts allowed only for electron + esbuild.

## Layout

- `packages/engine` — zero-runtime-dependency save codec + lossless editor (Node + renderer-safe).
- `tools/` — dev CLIs (`nmsx` inspect/roundtrip, `savediff`).
- `apps/desktop` — Electron app (M1+).

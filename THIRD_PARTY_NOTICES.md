# Third-party notices

Formats and facts used by this project were learned from public community documentation. No code
from GPL/AGPL projects is included.

## Used or referenced under permissive licenses

- **HGPAKtool** — monkeyman192, MIT License. Reference for the HGPAK archive format.
  https://github.com/monkeyman192/HGPAKtool
  - Ported: the HGPAK v2 reader logic (header, file index, chunk table, manifest, chunk-to-file
    mapping) in `packages/data-forge/src/hgpak.ts`.
- **bcdec** — Sergii Kudlai (iOrange), dual MIT / Unlicense; used under MIT.
  https://github.com/iOrange/bcdec
  - Ported: BC1/BC2/BC3/BC4/BC5/BC7 block decoders and the BC7 partition tables in
    `packages/data-forge/src/dds.ts`.
- **nms-mission-progress** — okranger1777, MIT License. Story-step data (planned, M2).
  https://github.com/okranger1777/nms-mission-progress

## Data downloaded at runtime

- **mapping.json** — MBINCompiler release asset, monkeyman192 and contributors, LGPL-3.0.
  https://github.com/monkeyman192/MBINCompiler — downloaded by the app; any bundled fallback copy is
  distributed under LGPL-3.0, with source available from that repository.
- **MBINCompiler** — monkeyman192 and contributors, LGPL-3.0. https://github.com/monkeyman192/MBINCompiler
  Used only as an external build-time tool (`packages/data-forge/src/facts/mbincompiler.ts`): its
  release binary is downloaded on first use, sha256-verified, and run as a separate process to
  convert the user's own MBIN game files to MXML. It is never linked into or copied inside this
  repository, and no MBINCompiler code is distributed with the app.

## Trademarks

No Man's Sky is a trademark of Hello Games Ltd. This project is not affiliated with or endorsed by
Hello Games. Item names and icons are read from the user's own game installation.

## MIT License text (HGPAKtool, bcdec)

Copyright (c) 2024 monkeyman192 (HGPAKtool)
Copyright (c) 2022 Sergii Kudlai (bcdec)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

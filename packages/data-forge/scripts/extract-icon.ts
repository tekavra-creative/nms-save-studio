// Decode one DDS texture from a pak to PNG.
//   node packages/data-forge/scripts/extract-icon.ts <internal-path> <out.png> [--pak NMSARC.TexUI.pak]
// The PNG is game art from the user's own install: it is refused inside this repository.
import { writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDds } from '../src/dds.ts';
import { HgPak } from '../src/hgpak.ts';
import { defaultBanksDir } from '../src/install.ts';
import { encodePng } from '../src/png.ts';

const args = process.argv.slice(2);
const pakAt = args.indexOf('--pak');
const pakName = pakAt >= 0 ? args.splice(pakAt, 2)[1]! : 'NMSARC.TexUI.pak';
const [internal, outArg] = args;
if (!internal || !outArg) {
  console.error('usage: extract-icon.ts <internal-path> <out.png> [--pak NMSARC.TexUI.pak]');
  process.exit(2);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(outArg);
const rel = relative(repoRoot, out);
if (!isAbsolute(rel) && !rel.startsWith('..')) {
  console.error(`refusing to write game art inside the repo: ${out}`);
  process.exit(1);
}

const pakPath = pakName.includes('/') ? pakName : join(defaultBanksDir(), pakName);
const ms = (t: number) => `${(performance.now() - t).toFixed(1)} ms`;

let t = performance.now();
const pak = await HgPak.open(pakPath);
const tOpen = ms(t);
t = performance.now();
const dds = await pak.read(internal);
const tRead = ms(t);
await pak.close();
t = performance.now();
const img = decodeDds(dds);
const tDecode = ms(t);
t = performance.now();
const png = encodePng(img.width, img.height, img.data);
const tPng = ms(t);
await writeFile(out, png);

const i = img.info;
console.log(
  `${internal}\n  ${dds.length} B DDS · ${i.width}×${i.height} · ${i.format}${i.srgb ? ' sRGB' : ''} (${i.source})` +
    ` · ${i.mipCount} mips\n  open index ${tOpen} · extract ${tRead} · BC decode ${tDecode} · PNG ${tPng}\n  → ${out}`,
);

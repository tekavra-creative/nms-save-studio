import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeDds, defaultBanksDir, encodePng, HgPak, normalisePakPath } from '@nss/data-forge';

const ICON_PREFIX = 'textures/ui/frontend/icons/';
const PAK_NAME = 'NMSARC.TexUI.pak';

let pak: Promise<HgPak> | undefined;
let cacheDir: string | undefined;

/** Only real icon textures may be requested — nothing else inside the game's archives. */
export function validIconPath(path: string): string | undefined {
  const p = normalisePakPath(path);
  if (!p.startsWith(ICON_PREFIX) || !p.endsWith('.dds') || p.includes('..') || p.includes('\0')) return undefined;
  return p;
}

function openPak(): Promise<HgPak> {
  pak ??= HgPak.open(join(defaultBanksDir(), PAK_NAME)).catch((e: unknown) => {
    pak = undefined;
    throw e;
  });
  return pak;
}

function cacheFor(userData: string): string {
  if (cacheDir) return cacheDir;
  const st = statSync(join(defaultBanksDir(), PAK_NAME));
  const build = createHash('sha1').update(`${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 12);
  cacheDir = join(userData, 'icons', build);
  mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

/** PNG bytes for a game icon, decoded from the user's own install and cached on disk. */
export async function iconPng(path: string, userData: string): Promise<Uint8Array> {
  const p = validIconPath(path);
  if (!p) throw new Error('not an icon path');
  const file = join(cacheFor(userData), `${createHash('sha1').update(p).digest('hex')}.png`);
  if (existsSync(file)) return new Uint8Array(readFileSync(file));
  const archive = await openPak();
  const img = decodeDds(await archive.read(p));
  const png = encodePng(img.width, img.height, img.data);
  writeFileSync(file, png);
  return png;
}

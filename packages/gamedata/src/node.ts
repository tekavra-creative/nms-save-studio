// Node-only helpers: where packs live on disk and how to read one. Kept out of the main entry so the
// renderer can import `@nss/gamedata` without pulling in `node:fs`.
import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseFactsPack } from './load.ts';
import type { FactsPack } from './types.ts';

/** Root of everything we cache from the user's install. `NSS_CACHE_DIR` overrides it. */
export function nssCacheDir(): string {
  return process.env['NSS_CACHE_DIR'] || join(homedir(), '.cache', 'nss');
}

export function defaultFactsDir(): string {
  return join(nssCacheDir(), 'facts');
}

export function factsFileName(gameBuild: string): string {
  return `facts-${gameBuild.replace(/[^\w.-]+/g, '_')}.json`;
}

export async function loadFactsPackFile(path: string): Promise<FactsPack> {
  return parseFactsPack(await readFile(path, 'utf8'));
}

/**
 * The pack to use: `NSS_FACTS_PACK` if set, else the most recently written `facts-*.json` in the
 * facts folder. Undefined when there is none.
 */
export async function findFactsPack(dir = defaultFactsDir()): Promise<string | undefined> {
  const override = process.env['NSS_FACTS_PACK'];
  if (override) return override;
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => /^facts-.+\.json$/.test(n));
  } catch {
    return undefined;
  }
  let best: { path: string; mtime: number } | undefined;
  for (const n of names) {
    const path = join(dir, n);
    const { mtimeMs } = await stat(path);
    if (!best || mtimeMs > best.mtime) best = { path, mtime: mtimeMs };
  }
  return best?.path;
}

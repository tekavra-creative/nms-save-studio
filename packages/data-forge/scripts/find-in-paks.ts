// Search every .pak in a folder for entry paths containing any of the given substrings.
//   node packages/data-forge/scripts/find-in-paks.ts [banks-dir] <substring> [substring...] [--limit N]
// banks-dir defaults to the Mac Steam install (see ../src/install.ts).
import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { HgPak } from '../src/hgpak.ts';
import { defaultBanksDir } from '../src/install.ts';

const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : 20;
const firstIsDir = args[0] !== undefined && existsSync(args[0]) && statSync(args[0]).isDirectory();
const dir = firstIsDir ? args.shift()! : defaultBanksDir();
const needles = args.map((a) => a.toLowerCase());
if (!dir || needles.length === 0) {
  console.error('usage: find-in-paks.ts [banks-dir] <substring> [substring...] [--limit N]');
  process.exit(2);
}

const paks = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.pak')).sort();
const t0 = performance.now();
let totalEntries = 0;
for (const name of paks) {
  const pak = await HgPak.open(join(dir, name));
  totalEntries += pak.entries.length;
  const hits = pak.entries.filter((e) => needles.some((n) => e.path.includes(n)));
  if (hits.length) {
    console.log(`${name}  (${hits.length} hits)`);
    for (const e of hits.slice(0, limit)) console.log(`  ${String(e.size).padStart(10)}  ${e.path}`);
    if (hits.length > limit) console.log(`  … ${hits.length - limit} more`);
  }
  await pak.close();
}
console.error(
  `\nscanned ${paks.length} paks, ${totalEntries} entries in ${(performance.now() - t0).toFixed(0)} ms`,
);

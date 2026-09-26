// Extract one entry in memory and hex-dump its first bytes (nothing is written to disk).
//   node packages/data-forge/scripts/peek.ts <NMSARC.X.pak | /path/to.pak> <internal-path> [bytes=64]
import { join } from 'node:path';
import { HgPak } from '../src/hgpak.ts';
import { defaultBanksDir } from '../src/install.ts';

const [pakArg, internal, countArg] = process.argv.slice(2);
if (!pakArg || !internal) {
  console.error('usage: peek.ts <pak> <internal-path> [bytes=64]');
  process.exit(2);
}
const pakPath = pakArg.includes('/') ? pakArg : join(defaultBanksDir(), pakArg);
const count = Number(countArg ?? 64);

const t0 = performance.now();
const pak = await HgPak.open(pakPath);
const tOpen = performance.now() - t0;
const entry = pak.get(internal);
if (!entry) {
  console.error(`not found in ${pakArg}: ${internal}`);
  process.exit(1);
}
const t1 = performance.now();
const bytes = await pak.read(entry);
const tRead = performance.now() - t1;
await pak.close();

console.log(`${internal}  ${bytes.length} B  hash-ok=${pak.verifyHash(entry)}  open ${tOpen.toFixed(1)} ms · extract ${tRead.toFixed(1)} ms`);
for (let at = 0; at < Math.min(count, bytes.length); at += 16) {
  const row = bytes.subarray(at, Math.min(at + 16, count, bytes.length));
  const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  console.log(`${at.toString(16).padStart(6, '0')}  ${hex.padEnd(48)} ${ascii}`);
}

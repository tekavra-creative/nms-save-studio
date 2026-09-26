// List the entries of one HGPAK archive.
//   node packages/data-forge/scripts/list-pak.ts <file.pak> [substring-filter] [--limit N]
import { HgPak } from '../src/hgpak.ts';

const args = process.argv.slice(2);
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : Infinity;
const [pakPath, filter] = args;
if (!pakPath) {
  console.error('usage: list-pak.ts <file.pak> [substring-filter] [--limit N]');
  process.exit(2);
}

const t0 = performance.now();
const pak = await HgPak.open(pakPath);
const openMs = performance.now() - t0;
const needle = filter?.toLowerCase();
const hits = needle ? pak.entries.filter((e) => e.path.includes(needle)) : pak.entries;
let shown = 0;
for (const e of hits) {
  if (shown++ >= limit) break;
  console.log(`${String(e.size).padStart(10)}  ${e.path}`);
}
const h = pak.header;
console.error(
  `\n${hits.length} of ${pak.entries.length} entries · codec ${pak.codec} · chunk 0x${pak.chunkSize.toString(16)}` +
    ` · ${h.chunkCount} chunks · dataOffset 0x${h.dataOffset.toString(16)} · index opened in ${openMs.toFixed(1)} ms`,
);
await pak.close();

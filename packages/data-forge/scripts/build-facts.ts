// Build the facts pack (item names, categories, stacks, icons, English text) from the user's own
// No Man's Sky install.
//
//   node packages/data-forge/scripts/build-facts.ts [out-dir] [--banks <dir>] [--force] [--keep-work]
//
// out-dir defaults to ~/.cache/nss/facts/ and must be outside this repository: the pack is game data.
// Uses MBINCompiler (LGPL-3.0) as an external tool, downloaded into ~/.cache/nss/ on first run.
import { isAbsolute, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultFactsDir } from '@nss/gamedata/node';
import { buildFacts } from '../src/facts/build.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};

const force = flag('--force');
const keepWork = flag('--keep-work');
const banksDir = option('--banks');
if (args.some((a) => a.startsWith('--'))) {
  console.error('usage: build-facts.ts [out-dir] [--banks <dir>] [--force] [--keep-work]');
  process.exit(2);
}
const outDir = resolve(args[0] ?? defaultFactsDir());

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const rel = relative(repoRoot, outDir);
if (!isAbsolute(rel) && !rel.startsWith('..')) {
  console.error(`refusing to write game data inside the repo: ${outDir}`);
  process.exit(1);
}

const t0 = performance.now();
const result = await buildFacts({
  outDir,
  force,
  keepWork,
  log: (m) => console.error(`· ${m}`),
  ...(banksDir ? { banksDir } : {}),
});
const { pack } = result;
const ms = Math.round(performance.now() - t0);

console.log(`${result.cached ? 'cached' : 'built'}: ${result.path}`);
console.log(`game build ${pack.gameBuild} · fingerprint ${pack.fingerprint} · MBINCompiler ${pack.generator.mbinCompiler}`);
console.log(`items: ${Object.values(pack.counts).reduce((a, b) => a + b, 0)} (${Object.entries(pack.counts).map(([k, n]) => `${k} ${n}`).join(', ')})`);
console.log(`strings: ${Object.keys(pack.strings).length} · recipes: ${pack.recipes?.length ?? 0} · stack options: ${Object.keys(pack.stackLimits?.options ?? {}).join('/')}`);
if (!result.cached) {
  const r = result.report;
  console.log(`language files: ${r.languageFiles} · strings overridden by later files: ${r.overriddenStrings}`);
  console.log(`duplicate ids (first table kept): ${r.duplicates.length}${r.duplicates.length ? ` e.g. ${r.duplicates.slice(0, 5).map((d) => `${d.id} ${d.kept}>${d.dropped}`).join(', ')}` : ''}`);
  console.log(`timings ms: ${Object.entries(result.timings).map(([k, v]) => `${k} ${v}`).join(' · ')} · total ${ms}`);
} else {
  console.log(`total ${ms} ms`);
}

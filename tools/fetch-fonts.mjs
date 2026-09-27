#!/usr/bin/env node
// Download Google Fonts (all SIL OFL) as local woff2 files so the app never loads fonts from the network.
//   node tools/fetch-fonts.mjs <out-dir> "Family:ital,wght@0,400;1,300" ["Family2:wght@400;700"]
// Writes <out-dir>/<family>-<style>-<weight>.woff2 and <out-dir>/fonts.css (@font-face rules, latin subset).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, ...families] = process.argv.slice(2);
if (!outDir || !families.length) {
  console.error('usage: fetch-fonts.mjs <out-dir> "Family:axes" ...');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const url = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')}&display=swap`;
const css = await (await fetch(url, { headers: { 'user-agent': UA } })).text();
if (!css.includes('@font-face')) throw new Error(`no font-face rules returned for ${url}`);

const rules = [];
for (const block of css.split('/*').slice(1)) {
  const subset = block.slice(0, block.indexOf('*/')).trim();
  if (subset !== 'latin') continue;
  const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
  const style = /font-style:\s*(\w+)/.exec(block)?.[1];
  const weight = /font-weight:\s*([\d ]+)/.exec(block)?.[1]?.trim();
  const src = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
  if (!family || !style || !weight || !src) continue;
  const file = `${family.replace(/\s+/g, '')}-${style}-${weight.replace(/\s+/g, '_')}.woff2`;
  writeFileSync(join(outDir, file), new Uint8Array(await (await fetch(src)).arrayBuffer()));
  rules.push(
    `@font-face { font-family: '${family}'; font-style: ${style}; font-weight: ${weight}; font-display: block; src: url('./${file}') format('woff2');${range ? ` unicode-range: ${range};` : ''} }`,
  );
  console.log(file);
}
writeFileSync(join(outDir, 'fonts.css'), `/* SIL Open Font License 1.1 — downloaded from Google Fonts by tools/fetch-fonts.mjs */\n${rules.join('\n')}\n`);
console.log(`${rules.length} faces → ${join(outDir, 'fonts.css')}`);

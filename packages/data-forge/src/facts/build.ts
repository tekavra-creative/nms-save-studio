// Build a facts pack from the user's own install:
//   locate packs → fingerprint → extract the MBINs we need into the cache → MBINCompiler → MXML →
//   parse → facts-<gameBuild>.json in the output folder.
// Every file written here goes to the cache or the output folder, never the repository.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { FACTS_PACK_VERSION, ITEM_KINDS, countItems, type FactsItem, type FactsPack, type FactsRecipe, type ItemKind, type StackLimits } from '@nss/gamedata';
import { defaultFactsDir, factsFileName, nssCacheDir } from '@nss/gamedata/node';
import { HgPak } from '../hgpak.ts';
import { defaultBanksDir } from '../install.ts';
import {
  extractProceduralProducts,
  extractProceduralTechnology,
  extractProducts,
  extractRecipes,
  extractStackLimits,
  extractSubstances,
  extractTechnology,
  mergeItems,
  readLocalisation,
  type LocTable,
  type MergeReport,
} from './extract.ts';
import { convertToMxml, ensureMbinCompiler, type Log } from './mbincompiler.ts';
import { parseMxml } from './mxml.ts';

/** NMS's Steam app id (used only to read the install's build number). */
const STEAM_APP_ID = '275850';

/** Where each input lives. Tables are discovered by folder; templates decide how they are read. */
const TABLES_PAK = 'NMSARC.Precache.pak';
const TABLES_DIR = 'metadata/reality/tables/';
const LANGUAGE_PAK = 'NMSARC.Language.pak';
const LANGUAGE_FILE = /^language\/nms_[a-z0-9_]+_english\.mbin$/;
const DIFFICULTY_PAK = 'NMSARC.MetadataEtc.pak';
const DIFFICULTY_FILE = 'metadata/gamestate/difficultyconfig.mbin';
const SOURCE_PAKS = [TABLES_PAK, LANGUAGE_PAK, DIFFICULTY_PAK];

/** The main product table is read first so its entries win over later product tables. */
const PRIMARY_PRODUCT_TABLE = 'nms_reality_gcproducttable';

export interface BuildOptions {
  banksDir?: string;
  outDir?: string;
  cacheRoot?: string;
  /** Rebuild even if a matching pack exists. */
  force?: boolean;
  /** Keep the extracted MBIN/MXML work folder after a successful build. */
  keepWork?: boolean;
  log?: Log;
}

export interface BuildResult {
  path: string;
  pack: FactsPack;
  cached: boolean;
  timings: Record<string, number>;
  report: MergeReport & { tables: Record<string, string>; languageFiles: number; overriddenStrings: number };
}

export interface InstallId {
  gameBuild: string;
  fingerprint: string;
  steamBuildId?: string;
}

/** Hash of the size + mtime of the packs we read, plus the Steam build id when there is one. */
export async function identifyInstall(banksDir: string): Promise<InstallId> {
  const h = createHash('sha256');
  for (const name of SOURCE_PAKS) {
    const s = await stat(join(banksDir, name));
    h.update(`${name}:${s.size}:${Math.round(s.mtimeMs)}\n`);
  }
  const fingerprint = h.digest('hex').slice(0, 16);
  const steamBuildId = await steamBuild(banksDir);
  return steamBuildId
    ? { gameBuild: steamBuildId, fingerprint, steamBuildId }
    : { gameBuild: `fp-${fingerprint}`, fingerprint };
}

async function steamBuild(banksDir: string): Promise<string | undefined> {
  let dir = resolve(banksDir);
  for (let i = 0; i < 8; i++) {
    if (basename(dir).toLowerCase() === 'steamapps') {
      try {
        const acf = await readFile(join(dir, `appmanifest_${STEAM_APP_ID}.acf`), 'utf8');
        return /"buildid"\s+"(\d+)"/.exec(acf)?.[1];
      } catch {
        return undefined;
      }
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return undefined;
}

async function readTemplate(path: string): Promise<string | undefined> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    return /<Data\s+template="([^"]+)"/.exec(buf.subarray(0, bytesRead).toString('utf8'))?.[1];
  } finally {
    await fh.close();
  }
}

const mxmlPathFor = (mbin: string) => mbin.replace(/\.mbin$/i, '.MXML');

async function extractInputs(banksDir: string, work: string, log: Log): Promise<string[]> {
  const wanted: { pak: string; paths: string[] }[] = [];
  const tables = await HgPak.open(join(banksDir, TABLES_PAK));
  try {
    wanted.push({ pak: TABLES_PAK, paths: tables.entries.filter((e) => e.path.startsWith(TABLES_DIR) && e.path.endsWith('.mbin')).map((e) => e.path) });
  } finally {
    await tables.close();
  }
  const lang = await HgPak.open(join(banksDir, LANGUAGE_PAK));
  try {
    wanted.push({ pak: LANGUAGE_PAK, paths: lang.entries.filter((e) => LANGUAGE_FILE.test(e.path)).map((e) => e.path) });
  } finally {
    await lang.close();
  }
  wanted.push({ pak: DIFFICULTY_PAK, paths: [DIFFICULTY_FILE] });

  const out: string[] = [];
  for (const { pak: name, paths } of wanted) {
    const pak = await HgPak.open(join(banksDir, name));
    try {
      for (const p of paths) {
        const dest = join(work, p);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, await pak.read(p));
        out.push(p);
      }
    } finally {
      await pak.close();
    }
  }
  log(`extracted ${out.length} MBINs to ${work}`);
  return out;
}

async function parseFile(path: string) {
  return parseMxml(await readFile(path, 'utf8'));
}

/** Build (or reuse) the facts pack for the install at `banksDir`. */
export async function buildFacts(options: BuildOptions = {}): Promise<BuildResult> {
  const log = options.log ?? (() => {});
  const banksDir = options.banksDir ?? defaultBanksDir();
  const outDir = options.outDir ?? defaultFactsDir();
  const cacheRoot = options.cacheRoot ?? nssCacheDir();
  const timings: Record<string, number> = {};
  const lap = (name: string, t: number) => (timings[name] = Math.round(performance.now() - t));
  let t = performance.now();

  for (const name of SOURCE_PAKS) {
    if (!existsSync(join(banksDir, name))) throw new Error(`game pack not found: ${join(banksDir, name)} (set NMS_BANKS_DIR)`);
  }
  const install = await identifyInstall(banksDir);
  const outPath = join(outDir, factsFileName(install.gameBuild));

  const tool = await ensureMbinCompiler(cacheRoot, log);
  lap('tool', t);

  if (!options.force && existsSync(outPath)) {
    try {
      const prev = JSON.parse(await readFile(outPath, 'utf8')) as FactsPack;
      if (prev.version === FACTS_PACK_VERSION && prev.fingerprint === install.fingerprint && prev.generator?.mbinCompiler === tool.version) {
        log(`up to date: ${outPath}`);
        return { path: outPath, pack: prev, cached: true, timings, report: { duplicates: [], tables: {}, languageFiles: 0, overriddenStrings: 0 } };
      }
    } catch {
      // unreadable or stale: rebuild below
    }
  }

  // 1. Extract and convert (skipped when a previous run for this exact install finished).
  t = performance.now();
  const work = join(cacheRoot, 'gamedata', install.fingerprint);
  const marker = join(work, '.converted.json');
  let files: string[];
  const markerOk = existsSync(marker) && (JSON.parse(await readFile(marker, 'utf8')) as { tool?: string }).tool === tool.version;
  if (markerOk) {
    files = (JSON.parse(await readFile(marker, 'utf8')) as { files: string[] }).files;
    log(`reusing converted MXML in ${work}`);
  } else {
    await rm(work, { recursive: true, force: true });
    files = await extractInputs(banksDir, work, log);
    lap('extract', t);
    t = performance.now();
    await convertToMxml(tool, work, files);
    lap('convert', t);
    // Tables we do not use may fail to convert without harm; the item counts below catch a missing
    // core table. Language files are all required.
    const missing = files.filter((f) => !existsSync(join(work, mxmlPathFor(f))));
    const missingLang = missing.filter((f) => LANGUAGE_FILE.test(f) || f === DIFFICULTY_FILE);
    if (missingLang.length) {
      throw new Error(
        `MBINCompiler ${tool.version} could not read ${missingLang.join(', ')}. The game build is ` +
          `probably newer than the pinned MBINCompiler; update MBINCOMPILER_VERSION in src/facts/mbincompiler.ts.`,
      );
    }
    if (missing.length) log(`warning: ${missing.length} unused tables did not convert: ${missing.join(', ')}`);
    files = files.filter((f) => !missing.includes(f));
    await writeFile(marker, JSON.stringify({ tool: tool.version, files }));
  }

  // 2. Localisation first: every other table resolves its names through it.
  t = performance.now();
  const loc: LocTable = new Map();
  let overriddenStrings = 0;
  const langFiles = files.filter((f) => LANGUAGE_FILE.test(f)).sort();
  for (const f of langFiles) {
    const part: LocTable = new Map();
    readLocalisation(await parseFile(join(work, mxmlPathFor(f))), part);
    for (const [k, v] of part) {
      const prev = loc.get(k);
      if (prev !== undefined && prev !== v) overriddenStrings++;
      loc.set(k, v);
    }
  }
  lap('language', t);

  // 3. Tables, dispatched by the template MBINCompiler reports.
  t = performance.now();
  const byTemplate = new Map<string, string[]>();
  const tableTemplates: Record<string, string> = {};
  for (const f of files.filter((f) => f.startsWith(TABLES_DIR) || f === DIFFICULTY_FILE)) {
    const template = await readTemplate(join(work, mxmlPathFor(f)));
    if (!template) continue;
    tableTemplates[basename(f, '.mbin')] = template;
    byTemplate.set(template, [...(byTemplate.get(template) ?? []), f]);
  }
  // One document at a time (parsed trees for the product tables run to hundreds of MB together).
  const each = async <T>(template: string, read: (doc: ReturnType<typeof parseMxml>) => T[], first?: string): Promise<T[]> => {
    const list = [...(byTemplate.get(template) ?? [])].sort((a, b) => {
      if (first && a.includes(first)) return -1;
      if (first && b.includes(first)) return 1;
      return a.localeCompare(b);
    });
    const out: T[] = [];
    for (const f of list) out.push(...read(await parseFile(join(work, mxmlPathFor(f)))));
    return out;
  };

  const substances = await each('cGcSubstanceTable', (d) => extractSubstances(d, loc));
  const products = await each('cGcProductTable', (d) => extractProducts(d, loc), PRIMARY_PRODUCT_TABLE);
  const procProducts = await each('cGcProceduralProductTable', (d) => extractProceduralProducts(d, loc));
  const technology = await each('cGcTechnologyTable', (d) => extractTechnology(d, loc));
  const techById = new Map(technology.map((i) => [i.id, i] as const));
  const procTech = await each('cGcProceduralTechnologyTable', (d) => extractProceduralTechnology(d, loc, techById));
  const recipes: FactsRecipe[] = await each('cGcRecipeTable', (d) => extractRecipes(d, loc));
  const stackLimits: StackLimits | undefined = (await each('cGcDifficultyConfig', (d) => [extractStackLimits(d)]))[0];
  lap('tables', t);

  const lists: FactsItem[][] = [substances, products, procProducts, technology, procTech];
  const { items, report } = mergeItems(lists, stackLimits);
  const counts: Record<ItemKind, number> = countItems({ items });
  for (const k of ITEM_KINDS) if (counts[k] === 0) throw new Error(`no ${k} items were read; the table layout may have changed`);

  const strings: Record<string, string> = {};
  for (const k of [...loc.keys()].sort()) strings[k] = loc.get(k)!;

  const pack: FactsPack = {
    version: FACTS_PACK_VERSION,
    gameBuild: install.gameBuild,
    fingerprint: install.fingerprint,
    generatedAt: new Date().toISOString(),
    generator: { mbinCompiler: tool.version },
    language: 'English',
    counts,
    items,
    strings,
    ...(stackLimits ? { stackLimits } : {}),
    recipes,
  };

  t = performance.now();
  await mkdir(outDir, { recursive: true });
  const tmp = `${outPath}.partial`;
  await writeFile(tmp, JSON.stringify(pack));
  await rename(tmp, outPath);
  lap('write', t);
  if (!options.keepWork) await rm(work, { recursive: true, force: true });

  return {
    path: outPath,
    pack,
    cached: false,
    timings,
    report: { ...report, tables: tableTemplates, languageFiles: langFiles.length, overriddenStrings },
  };
}

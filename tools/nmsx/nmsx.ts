#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  diffDocs,
  KeyMap,
  parseSaveFileName,
  prepareSlotCopy,
  randomUniversalId,
  SaveFile,
  slotFile,
  type MappingFile,
  type SaveKind,
} from '@nss/engine';
import { findSaveRoots, firstEmptySlot, listSlots, writeSlotFile, type SlotEntry } from '@nss/io';

const mapping = JSON.parse(
  readFileSync(new URL('../../packages/engine/src/keys/mapping.fallback.json', import.meta.url), 'utf8'),
) as MappingFile;
const SNAPSHOTS = join(homedir(), 'Library/Application Support/NMS Save Studio/Snapshots');

const u8 = (p: string) => new Uint8Array(readFileSync(p));

function fmtPlay(seconds: bigint): string {
  const s = Number(seconds);
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

function defaultRoot(given?: string): string {
  if (given) return given;
  const roots = findSaveRoots();
  if (roots.length !== 1) throw new Error(`found ${roots.length} save folders; pass --root`);
  return roots[0]!.path;
}

function openEntry(root: string, e: SlotEntry): SaveFile {
  return new SaveFile(u8(join(root, e.ref.dataName)), u8(join(root, e.ref.manifestName)), e.ref.manifestSlotIndex);
}

function openFile(path: string): SaveFile {
  const ref = parseSaveFileName(basename(path));
  if (!ref) throw new Error(`not a save file: ${path}`);
  return new SaveFile(u8(path), u8(join(dirname(path), ref.manifestName)), ref.manifestSlotIndex);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      from: { type: 'string' },
      kind: { type: 'string', default: 'latest' },
      to: { type: 'string', default: 'empty' },
      name: { type: 'string' },
      limit: { type: 'string', default: '200' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  if (cmd === 'list') {
    const root = defaultRoot(values.root);
    console.log(`Save folder: ${root}\n`);
    for (const s of listSlots(root)) {
      if (!s.auto && !s.manual) continue;
      const m = s.latest?.manifest;
      const title = m?.saveName || '(unnamed)';
      console.log(`Slot ${s.slot}: ${title} — ${m?.saveSummary ?? '?'} · ${m ? fmtPlay(m.totalPlayTime) : '?'} · save version ${m?.baseVersion ?? '?'}`);
      for (const e of [s.auto, s.manual]) {
        if (!e) continue;
        const when = e.manifest ? new Date(e.manifest.timestamp * 1000).toLocaleString() : e.manifestError;
        const mark = e === s.latest ? '  ← game loads this' : '';
        console.log(`   ${e.ref.kind.padEnd(6)} ${e.ref.dataName.padEnd(10)} ${when}${mark}`);
      }
    }
    return;
  }

  if (cmd === 'copy-slot') {
    const root = defaultRoot(values.root);
    const slots = listSlots(root);
    const from = Number(values.from);
    const src = slots[from - 1];
    const entry = values.kind === 'latest' ? src?.latest : src?.[values.kind as SaveKind];
    if (!entry) throw new Error(`slot ${values.from} (${values.kind}) has no save`);
    const toSlot = values.to === 'empty' ? firstEmptySlot(slots) : Number(values.to);
    if (!toSlot) throw new Error('no empty slot');
    const target = slots[toSlot - 1]!;
    if (target.auto || target.manual) throw new Error(`slot ${toSlot} is not empty — copy-slot only writes into empty slots`);
    const name = values.name ?? `Copy of slot ${from}`;
    const ref = slotFile(toSlot, 'auto');
    const { encoded, session } = prepareSlotCopy(openEntry(root, entry), mapping, { target: ref, name, universalId: randomUniversalId() });
    console.log(`${session.history.join('; ')} → ${ref.dataName} (+ ${ref.manifestName})`);
    if (values['dry-run']) return console.log('dry run — nothing written');
    const res = await writeSlotFile({ root, ref, encoded, expect: { data: null, meta: null }, snapshotDir: SNAPSHOTS, reason: `copy-slot-${from}-to-${toSlot}` });
    console.log(`written + verified (${res.verified.decompressedSize} bytes). Snapshot of the folder before writing: ${res.snapshot}`);
    return;
  }

  if (cmd === 'diff') {
    const [pa, pb] = positionals;
    if (!pa || !pb) throw new Error('usage: nmsx diff <saveA.hg> <saveB.hg>');
    const a = openFile(pa);
    const b = openFile(pb);
    const entries = diffDocs(a.doc, b.doc, KeyMap.forDoc(mapping, a.doc), KeyMap.forDoc(mapping, b.doc), { limit: Number(values.limit) });
    for (const e of entries) {
      const sym = e.kind === 'added' ? '+' : e.kind === 'removed' ? '-' : '~';
      console.log(`${sym} ${e.path}${e.a !== undefined ? `  A=${e.a}` : ''}${e.b !== undefined ? `  B=${e.b}` : ''}`);
    }
    console.log(`\n${entries.length} difference(s)${entries.length >= Number(values.limit) ? ' (limit reached)' : ''}`);
    return;
  }

  console.log(`nmsx — No Man's Sky save tool (NMS Save Studio dev CLI)
  list [--root <st_folder>]
  copy-slot --from <slot> [--kind latest|auto|manual] [--to <slot>|empty] --name "<name>" [--dry-run]
  diff <saveA.hg> <saveB.hg> [--limit N]`);
}

main(process.argv.slice(2)).catch((e: Error) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});

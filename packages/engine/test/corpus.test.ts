import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compressSave,
  decompressSave,
  JsonDoc,
  KeyMap,
  parseManifest,
  parseSaveFileName,
  SaveFile,
  serializeManifest,
  type MappingFile,
} from '../src/index.ts';

const CORPUS = process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus');
const mapping = JSON.parse(
  readFileSync(new URL('../src/keys/mapping.fallback.json', import.meta.url), 'utf8'),
) as MappingFile;

function corpusSaves(): { dir: string; name: string }[] {
  if (!existsSync(CORPUS)) return [];
  const out: { dir: string; name: string }[] = [];
  for (const set of readdirSync(CORPUS)) {
    const dir = join(CORPUS, set);
    for (const name of readdirSync(dir)) {
      if (/^save\d*\.hg$/.test(name) && existsSync(join(dir, `mf_${name}`))) out.push({ dir, name });
    }
  }
  return out;
}

const saves = corpusSaves();
const u8 = (p: string) => new Uint8Array(readFileSync(p));

describe.skipIf(saves.length === 0)('golden corpus (real saves, never committed)', () => {
  it.each(saves)('$name: payload round-trips byte-identical through our compressor', ({ dir, name }) => {
    const payload = decompressSave(u8(join(dir, name)));
    const again = decompressSave(compressSave(payload));
    expect(again.length).toBe(payload.length);
    expect(Buffer.compare(Buffer.from(again), Buffer.from(payload))).toBe(0);
  });

  it.each(saves)('$name: manifest decrypts, matches data, and re-encrypts byte-identical', ({ dir, name }) => {
    const ref = parseSaveFileName(name)!;
    const enc = u8(join(dir, `mf_${name}`));
    const m = parseManifest(enc, ref.manifestSlotIndex);
    const payload = decompressSave(u8(join(dir, name)));
    expect(m.decompressedSize).toBe(payload.length);
    expect(m.compressedSize).toBe(readFileSync(join(dir, name)).length);
    expect(Buffer.compare(Buffer.from(serializeManifest(m, ref.manifestSlotIndex)), Buffer.from(enc))).toBe(0);
  });

  it.each(saves)('$name: lossless document scans the whole file', ({ dir, name }) => {
    const ref = parseSaveFileName(name)!;
    const save = new SaveFile(u8(join(dir, name)), u8(join(dir, `mf_${name}`)), ref.manifestSlotIndex);
    const doc = save.doc;
    expect(doc.tree.end[0]).toBe(doc.bytes.length);
    const keys = KeyMap.forDoc(mapping, doc);
    const version = doc.number(doc.at(keys.path('Version')));
    expect(Number(version) - 512).toBe(save.manifest.baseVersion);
    const encoded = save.encode();
    expect(Buffer.compare(Buffer.from(decompressSave(encoded.data)), Buffer.from(save.payload))).toBe(0);
    const m2 = parseManifest(encoded.manifest, ref.manifestSlotIndex);
    expect(m2.saveSummary).toBe(save.manifest.saveSummary);
    expect(m2.decompressedSize).toBe(save.payload.length);
  });

  it('reads known values from the Ralfar autosave', () => {
    const hit = saves.find((s) => s.name === 'save3.hg');
    if (!hit) return;
    const save = new SaveFile(u8(join(hit.dir, 'save3.hg')), u8(join(hit.dir, 'mf_save3.hg')), 4);
    const doc = save.doc;
    const k = KeyMap.forDoc(mapping, doc);
    const psd = doc.at(k.path('BaseContext', 'PlayerStateData'));
    expect(psd).toBeGreaterThan(0);
    expect(doc.number(doc.at(k.path('Units'), psd))).toBe(24214830);
    expect(save.manifest.saveSummary).toBe('In the Ralfar system');
  });
});

describe('scan performance', () => {
  it.skipIf(saves.length === 0)('scans the largest save in under 400 ms', () => {
    const largest = saves
      .map((s) => ({ ...s, size: readFileSync(join(s.dir, s.name)).length }))
      .sort((a, b) => b.size - a.size)[0]!;
    const payload = decompressSave(u8(join(largest.dir, largest.name)));
    const t0 = performance.now();
    const doc = new JsonDoc(payload.subarray(0, payload.lastIndexOf(0x7d) + 1));
    const ms = performance.now() - t0;
    console.log(`scanned ${payload.length} bytes → ${doc.tree.count} nodes in ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(400);
  });
});

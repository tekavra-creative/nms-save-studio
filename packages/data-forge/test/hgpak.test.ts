import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HgPak, HgPakError, hashPakPath, parseHeader } from '../src/hgpak.ts';
import { buildPak, type BuildOptions, type SyntheticFile } from './synthetic.ts';

const dir = mkdtempSync(join(tmpdir(), 'nss-hgpak-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function writePak(files: SyntheticFile[], opts: BuildOptions): string {
  const path = join(dir, `t${n++}.pak`);
  writeFileSync(path, buildPak(files, opts));
  return path;
}

const text = (s: string) => new TextEncoder().encode(s);
// Deterministic pseudo-random bytes (incompressible) for the raw-chunk path.
function noise(len: number, seed: number): Uint8Array {
  const out = new Uint8Array(len);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < len; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

const files: SyntheticFile[] = [
  { path: 'metadata/example/first.mbin', data: text('first file contents '.repeat(20)) },
  { path: 'textures/ui/example/icon.dds', data: noise(700, 7) },
  { path: 'language/example_english.mbin', data: text('Jane Doe was here. '.repeat(40)) },
  { path: 'empty.bin', data: new Uint8Array(0) },
  { path: 'tail/last.bin', data: text('the end') },
];

describe('hgpak', () => {
  for (const opts of [
    { compress: 'lz4', chunkSize: 256 },
    { compress: 'zstd', chunkSize: 256 },
    { compress: false, chunkSize: 256 },
  ] as BuildOptions[]) {
    it(`round-trips every entry (${opts.compress || 'uncompressed'})`, async () => {
      const pak = await HgPak.open(writePak(files, opts), { chunkSize: opts.chunkSize });
      try {
        expect(pak.header.version).toBe(2);
        expect(pak.header.fileCount).toBe(files.length + 1);
        expect(pak.codec).toBe(opts.compress || 'none');
        expect(pak.entries.map((e) => e.path)).toEqual(files.map((f) => f.path));
        for (const f of files) {
          const entry = pak.get(f.path)!;
          expect(entry.size).toBe(f.data.length);
          expect(pak.verifyHash(entry)).toBe(true);
          expect(await pak.read(entry)).toEqual(f.data);
        }
      } finally {
        await pak.close();
      }
    });
  }

  it('reads entries spanning many chunks, including raw-stored chunks', async () => {
    const bytes = buildPak(files, { compress: 'lz4', chunkSize: 64 });
    const h = parseHeader(bytes);
    const table = new DataView(bytes.buffer, 0x30 + 0x20 * h.fileCount, 8 * h.chunkCount);
    const sizes = Array.from({ length: h.chunkCount }, (_, i) => Number(table.getBigUint64(i * 8, true)));
    expect(sizes.filter((s) => s === 64).length).toBeGreaterThan(5); // incompressible → stored raw
    expect(sizes.some((s) => s < 64)).toBe(true); // and some genuinely compressed
    const path = join(dir, `t${n++}.pak`);
    writeFileSync(path, bytes);
    const pak = await HgPak.open(path, { chunkSize: 64 });
    try {
      expect(pak.header.chunkCount).toBeGreaterThan(20);
      expect(await pak.read('TEXTURES\\UI\\EXAMPLE\\ICON.DDS')).toEqual(files[1]!.data);
      // read out of order to exercise the chunk cache eviction
      for (const f of [...files].reverse()) expect(await pak.read(f.path)).toEqual(f.data);
    } finally {
      await pak.close();
    }
  });

  it('sniffs the codec from the first chunk', async () => {
    const pak = await HgPak.open(writePak(files, { compress: 'zstd', chunkSize: 0x10000 }));
    try {
      expect(pak.codec).toBe('zstd');
      expect(pak.chunkSize).toBe(0x10000);
      expect(await pak.read(files[2]!.path)).toEqual(files[2]!.data);
    } finally {
      await pak.close();
    }
  });

  it('hashes paths case- and separator-insensitively', () => {
    expect(hashPakPath('A\\B.DDS')).toEqual(hashPakPath('a/b.dds'));
    expect(Buffer.from(hashPakPath('a/b.dds')).toString('hex')).toHaveLength(32);
  });

  it('rejects non-HGPAK data and other versions', () => {
    expect(() => parseHeader(new Uint8Array(0x30))).toThrow(HgPakError);
    const bytes = buildPak(files, { compress: false, chunkSize: 256 });
    bytes[0x08] = 3;
    expect(() => parseHeader(bytes)).toThrow(/version 3/);
  });

  it('reports unknown paths', async () => {
    const pak = await HgPak.open(writePak(files, { compress: 'lz4', chunkSize: 256 }), { chunkSize: 256 });
    try {
      expect(pak.get('nope')).toBeUndefined();
      await expect(pak.read('nope')).rejects.toThrow(HgPakError);
    } finally {
      await pak.close();
    }
  });
});

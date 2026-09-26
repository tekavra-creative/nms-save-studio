// HGPAK v2 archive reader (No Man's Sky game data, 2024+ "Worlds" era and later).
//
// Layout learned from HGPAKtool by monkeyman192 (MIT) — see THIRD_PARTY_NOTICES.md.
//
//   0x00  8   magic "HGPAK\0\0\0"
//   0x08  u64 version (2)
//   0x10  u64 fileCount   (entry 0 is the filename manifest)
//   0x18  u64 chunkCount
//   0x20  u8  isCompressed, 7 bytes padding
//   0x28  u64 dataOffset  (absolute file offset of the first chunk)
//   0x30  fileCount × { 16-byte md5(lowercase posix path), u64 startOffset, u64 decompressedSize }
//         chunkCount × u64 compressedChunkSize   (only when isCompressed)
//   dataOffset: chunks, each starting on a 16-byte boundary.
//
// When compressed, every file lives in one contiguous *decompressed* stream split into fixed-size
// chunks (Mac: LZ4 block, 128 KiB; Windows/Linux: zstd frame, 64 KiB). A file's decompressed position
// is `startOffset - dataOffset`. A chunk whose compressed size equals the chunk size may be stored raw.
// Entry 0 decompresses to the CRLF-separated list of the other entries' paths, in index order.
//
// Reads use a file handle and only touch the bytes they need: packs are up to several GB.

import { createHash } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import { zstdDecompressSync } from 'node:zlib';
import { decodeBlock } from '@nss/engine';

export const HGPAK_MAGIC = 'HGPAK';
export const HGPAK_VERSION = 2;
const HEADER_SIZE = 0x30;
const FILE_INFO_SIZE = 0x20;
const LZ4_CHUNK_SIZE = 0x20000;
const ZSTD_CHUNK_SIZE = 0x10000;
const ZSTD_MAGIC = 0xfd2fb528;
const CHUNK_CACHE_LIMIT = 16;

export type PakCodec = 'lz4' | 'zstd' | 'none';

export class HgPakError extends Error {
  override name = 'HgPakError';
}

export interface PakHeader {
  version: number;
  fileCount: number;
  chunkCount: number;
  isCompressed: boolean;
  dataOffset: number;
}

export interface PakEntry {
  /** Lower-case forward-slash path as stored in the manifest. */
  path: string;
  /** Decompressed size in bytes. */
  size: number;
  /** Compressed paks: offset in the decompressed stream. Uncompressed paks: absolute file offset. */
  offset: number;
  /** md5 of the normalised path, as stored in the file index. */
  hash: Uint8Array;
}

export interface OpenOptions {
  /** Force the chunk codec instead of sniffing the first chunk. */
  codec?: PakCodec;
  /** Force the decompressed chunk size. */
  chunkSize?: number;
}

function u64(view: DataView, at: number): number {
  const v = view.getBigUint64(at, true);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new HgPakError(`u64 too large at 0x${at.toString(16)}`);
  return Number(v);
}

const roundUp16 = (n: number): number => (n + 15) & ~15;

/** Hash a pak path the way the game indexes it: md5 of the lower-case forward-slash path. */
export function hashPakPath(path: string): Uint8Array {
  return new Uint8Array(createHash('md5').update(normalisePakPath(path), 'utf8').digest());
}

export function normalisePakPath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase();
}

export function parseHeader(bytes: Uint8Array): PakHeader {
  if (bytes.length < HEADER_SIZE) throw new HgPakError('file too small for an HGPAK header');
  const magic = String.fromCharCode(...bytes.subarray(0, 5));
  if (magic !== HGPAK_MAGIC) throw new HgPakError('not an HGPAK file (bad magic)');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = u64(view, 0x08);
  if (version !== HGPAK_VERSION) throw new HgPakError(`unsupported HGPAK version ${version}`);
  return {
    version,
    fileCount: u64(view, 0x10),
    chunkCount: u64(view, 0x18),
    isCompressed: bytes[0x20] !== 0,
    dataOffset: u64(view, 0x28),
  };
}

async function readAt(fh: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buf = new Uint8Array(length);
  let got = 0;
  while (got < length) {
    const { bytesRead } = await fh.read(buf, got, length - got, position + got);
    if (bytesRead === 0) throw new HgPakError(`unexpected EOF reading ${length} bytes at ${position}`);
    got += bytesRead;
  }
  return buf;
}

export class HgPak {
  readonly path: string;
  readonly header: PakHeader;
  readonly codec: PakCodec;
  readonly chunkSize: number;
  #entries: readonly PakEntry[] = [];
  #byPath = new Map<string, PakEntry>();
  #fh: FileHandle;
  #chunkSizes: Float64Array;
  #chunkOffsets: Float64Array;
  #streamSize: number;
  #cache = new Map<number, Uint8Array>();

  private constructor(
    path: string,
    fh: FileHandle,
    header: PakHeader,
    codec: PakCodec,
    chunkSize: number,
    chunkSizes: Float64Array,
    streamSize: number,
  ) {
    this.path = path;
    this.#fh = fh;
    this.header = header;
    this.codec = codec;
    this.chunkSize = chunkSize;
    this.#chunkSizes = chunkSizes;
    this.#chunkOffsets = new Float64Array(chunkSizes.length);
    let at = header.dataOffset;
    for (let i = 0; i < chunkSizes.length; i++) {
      this.#chunkOffsets[i] = at;
      at += roundUp16(chunkSizes[i]!);
    }
    this.#streamSize = streamSize;
  }

  /** Entries 1..n in index order (entry 0, the manifest, is not listed). */
  get entries(): readonly PakEntry[] {
    return this.#entries;
  }

  static async open(path: string, options: OpenOptions = {}): Promise<HgPak> {
    const fh = await open(path, 'r');
    try {
      return await HgPak.#parse(path, fh, options);
    } catch (err) {
      await fh.close();
      throw err;
    }
  }

  static async #parse(path: string, fh: FileHandle, options: OpenOptions): Promise<HgPak> {
    const header = parseHeader(await readAt(fh, 0, HEADER_SIZE));
    if (header.fileCount < 1) throw new HgPakError('pak has no manifest entry');
    const indexBytes = await readAt(fh, HEADER_SIZE, header.fileCount * FILE_INFO_SIZE);
    const iv = new DataView(indexBytes.buffer);
    const infos: { hash: Uint8Array; start: number; size: number }[] = [];
    for (let i = 0; i < header.fileCount; i++) {
      const at = i * FILE_INFO_SIZE;
      infos.push({ hash: indexBytes.slice(at, at + 16), start: u64(iv, at + 16), size: u64(iv, at + 24) });
    }

    const chunkSizes = new Float64Array(header.isCompressed ? header.chunkCount : 0);
    if (header.isCompressed && header.chunkCount > 0) {
      const cb = await readAt(fh, HEADER_SIZE + header.fileCount * FILE_INFO_SIZE, header.chunkCount * 8);
      const cv = new DataView(cb.buffer);
      for (let i = 0; i < header.chunkCount; i++) chunkSizes[i] = u64(cv, i * 8);
    }

    let codec: PakCodec = 'none';
    let chunkSize = options.chunkSize ?? LZ4_CHUNK_SIZE;
    if (header.isCompressed) {
      if (options.codec) codec = options.codec;
      else if (header.chunkCount > 0) {
        const head = await readAt(fh, header.dataOffset, 4);
        const magic = (head[0]! | (head[1]! << 8) | (head[2]! << 16) | (head[3]! << 24)) >>> 0;
        codec = magic === ZSTD_MAGIC ? 'zstd' : 'lz4';
      } else codec = 'lz4';
      chunkSize = options.chunkSize ?? (codec === 'zstd' ? ZSTD_CHUNK_SIZE : LZ4_CHUNK_SIZE);
    }

    const base = header.isCompressed ? header.dataOffset : 0;
    let streamSize = 0;
    for (const info of infos) streamSize = Math.max(streamSize, info.start - base + info.size);

    const pak = new HgPak(path, fh, header, codec, chunkSize, chunkSizes, streamSize);
    const manifestInfo = infos[0]!;
    const manifest = await pak.#readRange(manifestInfo.start - base, manifestInfo.size);
    const names = new TextDecoder('utf-8').decode(manifest).replace(/(\r\n)+$/, '').split('\r\n');
    if (names.length !== header.fileCount - 1) {
      throw new HgPakError(`manifest lists ${names.length} names, index has ${header.fileCount - 1} entries`);
    }
    pak.#entries = names.map((name, i) => {
      const info = infos[i + 1]!;
      return { path: name, size: info.size, offset: info.start - base, hash: info.hash };
    });
    pak.#byPath = new Map(pak.#entries.map((e) => [e.path, e]));
    return pak;
  }

  get(path: string): PakEntry | undefined {
    return this.#byPath.get(normalisePakPath(path));
  }

  /** Extract one entry's bytes. */
  async read(entryOrPath: PakEntry | string): Promise<Uint8Array> {
    const entry = typeof entryOrPath === 'string' ? this.get(entryOrPath) : entryOrPath;
    if (!entry) throw new HgPakError(`not in pak: ${String(entryOrPath)}`);
    return this.#readRange(entry.offset, entry.size);
  }

  /** Confirm the stored md5 matches the path (cheap integrity check of the manifest/index pairing). */
  verifyHash(entry: PakEntry): boolean {
    const h = hashPakPath(entry.path);
    return h.every((b, i) => b === entry.hash[i]);
  }

  async close(): Promise<void> {
    this.#cache.clear();
    await this.#fh.close();
  }

  async #readRange(offset: number, size: number): Promise<Uint8Array> {
    if (size === 0) return new Uint8Array(0);
    if (!this.header.isCompressed) return readAt(this.#fh, offset, size);
    const out = new Uint8Array(size);
    const cs = this.chunkSize;
    const first = Math.floor(offset / cs);
    const last = Math.floor((offset + size - 1) / cs);
    let written = 0;
    for (let c = first; c <= last; c++) {
      const chunk = await this.#chunk(c);
      const from = c === first ? offset - c * cs : 0;
      const take = Math.min(chunk.length - from, size - written);
      if (take <= 0) throw new HgPakError(`chunk ${c} too short for range`);
      out.set(chunk.subarray(from, from + take), written);
      written += take;
    }
    return out;
  }

  async #chunk(index: number): Promise<Uint8Array> {
    const hit = this.#cache.get(index);
    if (hit) {
      this.#cache.delete(index);
      this.#cache.set(index, hit);
      return hit;
    }
    if (index >= this.#chunkSizes.length) throw new HgPakError(`chunk ${index} out of range`);
    const raw = await readAt(this.#fh, this.#chunkOffsets[index]!, this.#chunkSizes[index]!);
    const decoded = this.#decode(raw, index);
    this.#cache.set(index, decoded);
    if (this.#cache.size > CHUNK_CACHE_LIMIT) this.#cache.delete(this.#cache.keys().next().value!);
    return decoded;
  }

  #decode(raw: Uint8Array, index: number): Uint8Array {
    const cs = this.chunkSize;
    const isLast = index === this.#chunkSizes.length - 1;
    // The final chunk holds only what is left of the stream; entries are 16-byte aligned, so the
    // packer may have padded past the last entry's end.
    const tail = Math.max(0, this.#streamSize - index * cs);
    const candidates = isLast ? [...new Set([Math.min(cs, tail), Math.min(cs, roundUp16(tail)), cs])] : [cs];
    if (this.codec === 'zstd') {
      try {
        return new Uint8Array(zstdDecompressSync(raw));
      } catch (err) {
        if (raw.length === cs) return raw;
        throw new HgPakError(`zstd chunk ${index}: ${(err as Error).message}`);
      }
    }
    let lastErr: unknown;
    for (const expected of candidates) {
      try {
        return decodeBlock(raw, expected);
      } catch (err) {
        lastErr = err;
      }
    }
    if (raw.length === cs) return raw; // stored uncompressed
    throw new HgPakError(`lz4 chunk ${index}: ${(lastErr as Error).message}`);
  }
}

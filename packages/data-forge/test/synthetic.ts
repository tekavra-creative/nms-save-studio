// Builders for synthetic HGPAK archives and DDS files. No game data is used anywhere in the tests.
import { encodeBlock } from '@nss/engine';
import { zstdCompressSync } from 'node:zlib';
import { hashPakPath } from '../src/hgpak.ts';

export interface SyntheticFile {
  path: string;
  data: Uint8Array;
}

export interface BuildOptions {
  compress: 'lz4' | 'zstd' | false;
  chunkSize: number;
}

const roundUp16 = (n: number): number => (n + 15) & ~15;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Pack files the way HGPAK v2 does: manifest first, 16-byte aligned entries, fixed-size chunks. */
export function buildPak(files: SyntheticFile[], opts: BuildOptions): Uint8Array {
  const manifest = new TextEncoder().encode(files.map((f) => `${f.path}\r\n`).join(''));
  const all = [{ path: 'synthetic.pak.manifest', data: manifest }, ...files];

  // Decompressed stream: every entry starts on a 16-byte boundary.
  const starts: number[] = [];
  let streamLen = 0;
  for (const f of all) {
    starts.push(streamLen);
    streamLen += roundUp16(f.data.length);
  }
  const stream = new Uint8Array(streamLen);
  all.forEach((f, i) => stream.set(f.data, starts[i]!));

  const chunks: Uint8Array[] = [];
  if (opts.compress) {
    for (let at = 0; at < streamLen; at += opts.chunkSize) {
      const plain = stream.subarray(at, Math.min(at + opts.chunkSize, streamLen));
      const packed = opts.compress === 'zstd' ? new Uint8Array(zstdCompressSync(plain)) : encodeBlock(plain);
      // A full chunk that does not shrink is stored raw, as the game's packer does.
      chunks.push(plain.length === opts.chunkSize && packed.length >= opts.chunkSize ? plain.slice() : packed);
    }
  }

  const fileCount = all.length;
  const chunkCount = chunks.length;
  const dataOffset = roundUp16(0x30 + 0x20 * fileCount + (opts.compress ? 8 * chunkCount : 0));

  const head = new Uint8Array(dataOffset);
  const v = new DataView(head.buffer);
  head.set(new TextEncoder().encode('HGPAK'), 0);
  v.setBigUint64(0x08, 2n, true);
  v.setBigUint64(0x10, BigInt(fileCount), true);
  v.setBigUint64(0x18, BigInt(chunkCount), true);
  head[0x20] = opts.compress ? 1 : 0;
  v.setBigUint64(0x28, BigInt(dataOffset), true);
  all.forEach((f, i) => {
    const at = 0x30 + i * 0x20;
    head.set(hashPakPath(f.path), at);
    v.setBigUint64(at + 16, BigInt(dataOffset + starts[i]!), true);
    v.setBigUint64(at + 24, BigInt(f.data.length), true);
  });
  if (!opts.compress) return concat([head, stream]);

  chunks.forEach((c, i) => v.setBigUint64(0x30 + 0x20 * fileCount + i * 8, BigInt(c.length), true));
  const body = chunks.map((c) => {
    const padded = new Uint8Array(roundUp16(c.length));
    padded.set(c);
    return padded;
  });
  return concat([head, ...body]);
}

/** Build a DDS file: legacy FourCC header, or a DX10 header when `dxgi` is given. */
export function buildDds(width: number, height: number, pixels: Uint8Array, fourcc: string, dxgi?: number): Uint8Array {
  const headerLen = 128 + (dxgi === undefined ? 0 : 20);
  const out = new Uint8Array(headerLen + pixels.length);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode('DDS '), 0);
  v.setUint32(4, 124, true);
  v.setUint32(8, 0x1007, true); // CAPS | HEIGHT | WIDTH | PIXELFORMAT
  v.setUint32(12, height, true);
  v.setUint32(16, width, true);
  v.setUint32(28, 1, true);
  v.setUint32(76, 32, true);
  v.setUint32(80, 0x4, true); // DDPF_FOURCC
  out.set(new TextEncoder().encode(fourcc), 84);
  if (dxgi !== undefined) {
    v.setUint32(128, dxgi, true);
    v.setUint32(132, 3, true); // TEXTURE2D
    v.setUint32(140, 1, true); // arraySize
  }
  out.set(pixels, headerLen);
  return out;
}

/** LSB-first bit writer for hand-assembling BC7 blocks. */
export function bitWriter(): { put(value: number, bits: number): void; bytes(): Uint8Array } {
  const block = new Uint8Array(16);
  let pos = 0;
  return {
    put(value, bits) {
      for (let i = 0; i < bits; i++, pos++) if ((value >> i) & 1) block[pos >> 3]! |= 1 << (pos & 7);
    },
    bytes() {
      if (pos !== 128) throw new Error(`BC7 block has ${pos} bits, expected 128`);
      return block;
    },
  };
}

import { decodeBlock, encodeBlock } from './lz4.ts';

export const CHUNK_MAGIC = 0xfeeda1e5;
export const CHUNK_MAX = 0x80000;
const HEADER = 16;

export class SaveFormatError extends Error {
  override name = 'SaveFormatError';
}

export function isChunked(file: Uint8Array): boolean {
  if (file.length < HEADER) return false;
  return new DataView(file.buffer, file.byteOffset, 4).getUint32(0, true) === CHUNK_MAGIC;
}

/** Decompress a save*.hg file into its raw payload (JSON bytes + trailing NUL, exactly as stored). */
export function decompressSave(file: Uint8Array): Uint8Array {
  if (!isChunked(file)) {
    if (file[0] === 0x7b) return file.slice();
    throw new SaveFormatError('not a No Man\'s Sky save: missing chunk magic');
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const parts: Uint8Array[] = [];
  let total = 0;
  let p = 0;
  while (p < file.length) {
    if (p + HEADER > file.length) throw new SaveFormatError(`truncated chunk header at ${p}`);
    const magic = view.getUint32(p, true);
    if (magic !== CHUNK_MAGIC) throw new SaveFormatError(`bad chunk magic at ${p}`);
    const comp = view.getUint32(p + 4, true);
    const decomp = view.getUint32(p + 8, true);
    if (decomp > CHUNK_MAX) throw new SaveFormatError(`chunk too large at ${p}`);
    p += HEADER;
    if (p + comp > file.length) throw new SaveFormatError(`truncated chunk body at ${p}`);
    parts.push(decodeBlock(file.subarray(p, p + comp), decomp));
    total += decomp;
    p += comp;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

/** Compress a raw payload into save*.hg chunk format. */
export function compressSave(payload: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const sizes: number[] = [];
  for (let off = 0; off < payload.length; off += CHUNK_MAX) {
    const slice = payload.subarray(off, Math.min(off + CHUNK_MAX, payload.length));
    blocks.push(encodeBlock(slice));
    sizes.push(slice.length);
  }
  const total = blocks.reduce((n, b) => n + HEADER + b.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let p = 0;
  blocks.forEach((block, i) => {
    view.setUint32(p, CHUNK_MAGIC, true);
    view.setUint32(p + 4, block.length, true);
    view.setUint32(p + 8, sizes[i]!, true);
    view.setUint32(p + 12, 0, true);
    out.set(block, p + HEADER);
    p += HEADER + block.length;
  });
  return out;
}

/** Split a payload into its JSON bytes and the trailing NUL padding the game appends. */
export function splitPayload(payload: Uint8Array): { json: Uint8Array; trailer: Uint8Array } {
  let end = payload.length;
  while (end > 0 && payload[end - 1] === 0) end--;
  return { json: payload.subarray(0, end), trailer: payload.subarray(end) };
}

export function joinPayload(json: Uint8Array, trailer: Uint8Array = new Uint8Array([0])): Uint8Array {
  const out = new Uint8Array(json.length + trailer.length);
  out.set(json, 0);
  out.set(trailer, json.length);
  return out;
}

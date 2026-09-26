const MIN_MATCH = 4;
const LAST_LITERALS = 5;
const MF_LIMIT = 12;
const HASH_LOG = 16;
const MAX_OFFSET = 0xffff;

export class Lz4Error extends Error {
  override name = 'Lz4Error';
}

export function decodeBlock(src: Uint8Array, expectedSize: number): Uint8Array {
  const dst = new Uint8Array(expectedSize);
  let sp = 0;
  let dp = 0;
  const sEnd = src.length;
  while (sp < sEnd) {
    const token = src[sp++]!;
    let lit = token >>> 4;
    if (lit === 15) {
      let b: number;
      do {
        if (sp >= sEnd) throw new Lz4Error('truncated literal length');
        b = src[sp++]!;
        lit += b;
      } while (b === 255);
    }
    if (sp + lit > sEnd || dp + lit > expectedSize) throw new Lz4Error('literal overrun');
    dst.set(src.subarray(sp, sp + lit), dp);
    sp += lit;
    dp += lit;
    if (sp >= sEnd) break;
    if (sp + 2 > sEnd) throw new Lz4Error('truncated offset');
    const offset = src[sp]! | (src[sp + 1]! << 8);
    sp += 2;
    if (offset === 0 || offset > dp) throw new Lz4Error(`bad offset ${offset} at ${dp}`);
    let len = token & 15;
    if (len === 15) {
      let b: number;
      do {
        if (sp >= sEnd) throw new Lz4Error('truncated match length');
        b = src[sp++]!;
        len += b;
      } while (b === 255);
    }
    len += MIN_MATCH;
    if (dp + len > expectedSize) throw new Lz4Error('match overrun');
    let from = dp - offset;
    if (offset >= len) {
      dst.copyWithin(dp, from, from + len);
      dp += len;
    } else {
      for (let i = 0; i < len; i++) dst[dp++] = dst[from++]!;
    }
  }
  if (dp !== expectedSize) throw new Lz4Error(`size mismatch: got ${dp}, expected ${expectedSize}`);
  return dst;
}

function hash4(src: Uint8Array, i: number): number {
  const v = (src[i]! | (src[i + 1]! << 8) | (src[i + 2]! << 16) | (src[i + 3]! << 24)) >>> 0;
  return Math.imul(v, 2654435761) >>> (32 - HASH_LOG);
}

class ByteSink {
  buf: Uint8Array;
  length = 0;
  constructor(capacity: number) {
    this.buf = new Uint8Array(capacity);
  }
  push(...bytes: number[]): void {
    for (const b of bytes) this.buf[this.length++] = b;
  }
  copy(src: Uint8Array, from: number, to: number): void {
    this.buf.set(src.subarray(from, to), this.length);
    this.length += to - from;
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

function writeLength(out: ByteSink, n: number): void {
  while (n >= 255) {
    out.push(255);
    n -= 255;
  }
  out.push(n);
}

export function maxEncodedSize(n: number): number {
  return n + Math.ceil(n / 255) + 16;
}

export function encodeBlock(src: Uint8Array): Uint8Array {
  const n = src.length;
  const out = new ByteSink(maxEncodedSize(n));
  let anchor = 0;
  if (n >= MF_LIMIT + 1) {
    const table = new Int32Array(1 << HASH_LOG).fill(-1);
    const matchLimit = n - LAST_LITERALS;
    const searchLimit = n - MF_LIMIT;
    let ip = 0;
    while (ip < searchLimit) {
      const h = hash4(src, ip);
      const ref = table[h]!;
      table[h] = ip;
      if (
        ref < 0 ||
        ip - ref > MAX_OFFSET ||
        src[ref] !== src[ip] ||
        src[ref + 1] !== src[ip + 1] ||
        src[ref + 2] !== src[ip + 2] ||
        src[ref + 3] !== src[ip + 3]
      ) {
        ip++;
        continue;
      }
      let len = MIN_MATCH;
      while (ip + len < matchLimit && src[ref + len] === src[ip + len]) len++;
      const lit = ip - anchor;
      const tokenIdx = out.length;
      out.push(0);
      let token = 0;
      if (lit >= 15) {
        token = 0xf0;
        writeLength(out, lit - 15);
      } else token = lit << 4;
      out.copy(src, anchor, ip);
      const off = ip - ref;
      out.push(off & 0xff, off >>> 8);
      const ml = len - MIN_MATCH;
      if (ml >= 15) {
        token |= 15;
        writeLength(out, ml - 15);
      } else token |= ml;
      out.buf[tokenIdx] = token;
      for (let k = ip + 1; k < ip + len && k < searchLimit; k++) table[hash4(src, k)] = k;
      ip += len;
      anchor = ip;
    }
  }
  const lit = n - anchor;
  if (lit >= 15) {
    out.push(0xf0);
    writeLength(out, lit - 15);
  } else out.push(lit << 4);
  out.copy(src, anchor, n);
  return out.result();
}

import { JsonTree, Kind, scan } from './scan.ts';

/** Bytes → "binary string" where each char code is one byte (0–255). Lossless both ways. */
export function bytesToBinary(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

export function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) throw new Error('binaryToBytes: char outside byte range');
    out[i] = c;
  }
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface Splice {
  start: number;
  end: number;
  bytes: Uint8Array;
}

/** Apply non-overlapping splices (any order) to bytes. */
export function applySplices(bytes: Uint8Array, splices: readonly Splice[]): Uint8Array {
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) throw new Error('overlapping splices');
    parts.push(bytes.subarray(cursor, s.start), s.bytes);
    cursor = s.end;
  }
  parts.push(bytes.subarray(cursor));
  return concatBytes(parts);
}

/** Inverse of a splice set, expressed against the post-splice bytes. */
export function invertSplices(before: Uint8Array, splices: readonly Splice[]): Splice[] {
  const sorted = [...splices].sort((a, b) => a.start - b.start);
  let shift = 0;
  return sorted.map((s) => {
    const start = s.start + shift;
    const inv = { start, end: start + s.bytes.length, bytes: before.slice(s.start, s.end) };
    shift += s.bytes.length - (s.end - s.start);
    return inv;
  });
}

/**
 * Read-only lossless view over a JSON document's bytes.
 * Node ids index into the scanned tree; they are invalidated by any edit (re-open the doc).
 */
export class JsonDoc {
  readonly bytes: Uint8Array;
  readonly tree: JsonTree;
  #keyCache = new Map<number, string>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.tree = scan(bytes);
  }

  get root(): number {
    return 0;
  }

  kind(node: number): Kind {
    return this.tree.kind[node] as Kind;
  }

  span(node: number): Uint8Array {
    return this.bytes.subarray(this.tree.start[node]!, this.tree.end[node]!);
  }

  raw(node: number): string {
    return bytesToBinary(this.span(node));
  }

  /** Member key (unquoted, binary string) or undefined for array items / root. */
  key(node: number): string | undefined {
    const ks = this.tree.keyStart[node]!;
    if (ks < 0) return undefined;
    let k = this.#keyCache.get(node);
    if (k === undefined) {
      k = unescapeJsonString(this.bytes.subarray(ks + 1, this.tree.keyEnd[node]! - 1));
      this.#keyCache.set(node, k);
    }
    return k;
  }

  childCount(node: number): number {
    return this.tree.childCount[node]!;
  }

  *children(node: number): Generator<number> {
    for (let c = this.tree.firstChild[node]!; c >= 0; c = this.tree.nextSibling[c]!) yield c;
  }

  /** Object member by key, or array item by index. */
  child(node: number, keyOrIndex: string | number): number {
    const k = this.tree.kind[node];
    if (typeof keyOrIndex === 'number') {
      if (k !== Kind.Array) return -1;
      let i = 0;
      for (let c = this.tree.firstChild[node]!; c >= 0; c = this.tree.nextSibling[c]!) {
        if (i++ === keyOrIndex) return c;
      }
      return -1;
    }
    if (k !== Kind.Object) return -1;
    for (let c = this.tree.firstChild[node]!; c >= 0; c = this.tree.nextSibling[c]!) {
      if (this.#keyEquals(c, keyOrIndex)) return c;
    }
    return -1;
  }

  #keyEquals(node: number, key: string): boolean {
    const ks = this.tree.keyStart[node]! + 1;
    const ke = this.tree.keyEnd[node]! - 1;
    if (ke - ks === key.length) {
      for (let i = 0; i < key.length; i++) {
        const b = this.bytes[ks + i]!;
        if (b === 0x5c) return this.key(node) === key;
        if (b !== key.charCodeAt(i)) return false;
      }
      return true;
    }
    return this.bytes.subarray(ks, ke).includes(0x5c) && this.key(node) === key;
  }

  /** Walk a path of keys/indices; -1 if any step is missing. */
  at(path: readonly (string | number)[], from = 0): number {
    let n = from;
    for (const step of path) {
      n = this.child(n, step);
      if (n < 0) return -1;
    }
    return n;
  }

  /** String value as a binary string (one char per byte after unescaping). */
  string(node: number): string {
    if (this.tree.kind[node] !== Kind.String) throw new Error('not a string node');
    return unescapeJsonString(this.bytes.subarray(this.tree.start[node]! + 1, this.tree.end[node]! - 1));
  }

  /** Numeric value; integers beyond ±2^53 come back as bigint, raw text preserved elsewhere. */
  number(node: number): number | bigint {
    if (this.tree.kind[node] !== Kind.Number) throw new Error('not a number node');
    const t = this.raw(node);
    if (/^-?\d+$/.test(t)) {
      const b = BigInt(t);
      return b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER) ? b : Number(b);
    }
    return Number(t);
  }

  boolean(node: number): boolean {
    const k = this.tree.kind[node];
    if (k === Kind.True) return true;
    if (k === Kind.False) return false;
    throw new Error('not a boolean node');
  }

  /** Byte range of a member including its key (for splicing whole members). */
  memberSpan(node: number): { start: number; end: number } {
    const ks = this.tree.keyStart[node]!;
    return { start: ks >= 0 ? ks : this.tree.start[node]!, end: this.tree.end[node]! };
  }
}

/** JSON string body (no quotes) → binary string. \uXXXX > 0xFF becomes UTF-8 bytes. */
export function unescapeJsonString(body: Uint8Array): string {
  if (!body.includes(0x5c)) return bytesToBinary(body);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const b = body[i]!;
    if (b !== 0x5c) {
      out += String.fromCharCode(b);
      continue;
    }
    const e = body[++i]!;
    switch (e) {
      case 0x22: out += '"'; break;
      case 0x5c: out += '\\'; break;
      case 0x2f: out += '/'; break;
      case 0x62: out += '\b'; break;
      case 0x66: out += '\f'; break;
      case 0x6e: out += '\n'; break;
      case 0x72: out += '\r'; break;
      case 0x74: out += '\t'; break;
      case 0x75: {
        const cp = parseInt(bytesToBinary(body.subarray(i + 1, i + 5)), 16);
        i += 4;
        if (cp <= 0xff) out += String.fromCharCode(cp);
        else out += bytesToBinary(new TextEncoder().encode(String.fromCharCode(cp)));
        break;
      }
      default:
        out += String.fromCharCode(e);
    }
  }
  return out;
}

/** Binary string → JSON string literal bytes (with quotes). Bytes ≥ 0x80 are written raw. */
export function encodeJsonString(binary: string): Uint8Array {
  let s = '"';
  for (let i = 0; i < binary.length; i++) {
    const c = binary.charCodeAt(i);
    if (c === 0x22) s += '\\"';
    else if (c === 0x5c) s += '\\\\';
    else if (c === 0x0a) s += '\\n';
    else if (c === 0x0d) s += '\\r';
    else if (c === 0x09) s += '\\t';
    else if (c < 0x20) s += '\\u' + c.toString(16).padStart(4, '0');
    else s += binary[i];
  }
  s += '"';
  return binaryToBytes(s);
}

/** Display helper: binary string → readable text (UTF-8 if valid, else hex escapes for odd bytes). */
export function binaryToDisplay(binary: string): string {
  const bytes = binaryToBytes(binary);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return binary.replace(/[\x80-\xff]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  }
}

export function textToBinary(text: string): string {
  return bytesToBinary(new TextEncoder().encode(text));
}

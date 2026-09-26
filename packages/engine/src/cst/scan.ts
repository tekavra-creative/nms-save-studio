export const Kind = {
  Object: 1,
  Array: 2,
  String: 3,
  Number: 4,
  True: 5,
  False: 6,
  Null: 7,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export class JsonScanError extends Error {
  override name = 'JsonScanError';
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} at byte ${offset}`);
    this.offset = offset;
  }
}

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const LBRACE = 0x7b;
const RBRACE = 0x7d;
const LBRACKET = 0x5b;
const RBRACKET = 0x5d;

function isWs(b: number): boolean {
  return b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;
}

function isNumChar(b: number): boolean {
  return (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x2b || b === 0x2e || b === 0x65 || b === 0x45;
}

/**
 * Lossless JSON tree over raw bytes. Nodes live in parallel typed arrays; node 0 is the root.
 * Byte spans are half-open [start, end). Keys are recorded on the member value node, quotes included.
 */
export class JsonTree {
  count = 0;
  kind: Uint8Array;
  start: Uint32Array;
  end: Uint32Array;
  parent: Int32Array;
  firstChild: Int32Array;
  lastChild: Int32Array;
  nextSibling: Int32Array;
  keyStart: Int32Array;
  keyEnd: Int32Array;
  childCount: Uint32Array;
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array, capacity: number) {
    this.bytes = bytes;
    this.kind = new Uint8Array(capacity);
    this.start = new Uint32Array(capacity);
    this.end = new Uint32Array(capacity);
    this.parent = new Int32Array(capacity);
    this.firstChild = new Int32Array(capacity);
    this.lastChild = new Int32Array(capacity);
    this.nextSibling = new Int32Array(capacity);
    this.keyStart = new Int32Array(capacity);
    this.keyEnd = new Int32Array(capacity);
    this.childCount = new Uint32Array(capacity);
  }

  grow(): void {
    const cap = this.kind.length * 2;
    const g = <T extends Uint8Array | Uint32Array | Int32Array>(a: T): T => {
      const b = new (a.constructor as new (n: number) => T)(cap);
      b.set(a);
      return b;
    };
    this.kind = g(this.kind);
    this.start = g(this.start);
    this.end = g(this.end);
    this.parent = g(this.parent);
    this.firstChild = g(this.firstChild);
    this.lastChild = g(this.lastChild);
    this.nextSibling = g(this.nextSibling);
    this.keyStart = g(this.keyStart);
    this.keyEnd = g(this.keyEnd);
    this.childCount = g(this.childCount);
  }

  add(kind: Kind, start: number, parent: number, keyStart: number, keyEnd: number): number {
    if (this.count >= this.kind.length) this.grow();
    const id = this.count++;
    this.kind[id] = kind;
    this.start[id] = start;
    this.end[id] = start;
    this.parent[id] = parent;
    this.firstChild[id] = -1;
    this.lastChild[id] = -1;
    this.nextSibling[id] = -1;
    this.keyStart[id] = keyStart;
    this.keyEnd[id] = keyEnd;
    this.childCount[id] = 0;
    if (parent >= 0) {
      const last = this.lastChild[parent]!;
      if (last < 0) this.firstChild[parent] = id;
      else this.nextSibling[last] = id;
      this.lastChild[parent] = id;
      this.childCount[parent]!++;
    }
    return id;
  }
}

function skipString(bytes: Uint8Array, p: number): number {
  // p points at the opening quote; returns index just past the closing quote.
  const n = bytes.length;
  p++;
  while (p < n) {
    const b = bytes[p]!;
    if (b === QUOTE) return p + 1;
    if (b === BACKSLASH) p += 2;
    else p++;
  }
  throw new JsonScanError('unterminated string', p);
}

export function scan(bytes: Uint8Array, start = 0, stop = bytes.length): JsonTree {
  const tree = new JsonTree(bytes, Math.max(64, (stop - start) >>> 4));
  const n = stop;
  let p = start;
  // container stack: node ids of open containers
  const stack: number[] = [];
  let pendingKeyStart = -1;
  let pendingKeyEnd = -1;
  let expectValue = true;
  let rootDone = false;

  const skipWs = () => {
    while (p < n && isWs(bytes[p]!)) p++;
  };

  const top = () => (stack.length ? stack[stack.length - 1]! : -1);

  while (true) {
    skipWs();
    if (p >= n) break;
    const b = bytes[p]!;
    const parent = top();

    if (expectValue) {
      if (rootDone && parent < 0) throw new JsonScanError('trailing content', p);
      if (parent >= 0 && tree.kind[parent] === Kind.Object && pendingKeyStart < 0) {
        // expecting a key (or end of object)
        if (b === RBRACE) {
          if (tree.childCount[parent] !== 0) throw new JsonScanError('trailing comma', p);
          tree.end[parent] = ++p;
          stack.pop();
          expectValue = false;
          if (!stack.length) rootDone = true;
          continue;
        }
        if (b !== QUOTE) throw new JsonScanError('expected key', p);
        pendingKeyStart = p;
        p = skipString(bytes, p);
        pendingKeyEnd = p;
        skipWs();
        if (bytes[p] !== COLON) throw new JsonScanError('expected colon', p);
        p++;
        continue;
      }
      if (b === RBRACKET && parent >= 0 && tree.kind[parent] === Kind.Array && tree.childCount[parent] === 0) {
        tree.end[parent] = ++p;
        stack.pop();
        expectValue = false;
        if (!stack.length) rootDone = true;
        continue;
      }
      const ks = pendingKeyStart;
      const ke = pendingKeyEnd;
      pendingKeyStart = -1;
      pendingKeyEnd = -1;
      if (b === LBRACE || b === LBRACKET) {
        const id = tree.add(b === LBRACE ? Kind.Object : Kind.Array, p, parent, ks, ke);
        stack.push(id);
        p++;
        expectValue = true;
        continue;
      }
      let id: number;
      if (b === QUOTE) {
        id = tree.add(Kind.String, p, parent, ks, ke);
        p = skipString(bytes, p);
      } else if (b === 0x74 /* t */) {
        id = tree.add(Kind.True, p, parent, ks, ke);
        p += 4;
      } else if (b === 0x66 /* f */) {
        id = tree.add(Kind.False, p, parent, ks, ke);
        p += 5;
      } else if (b === 0x6e /* n */) {
        id = tree.add(Kind.Null, p, parent, ks, ke);
        p += 4;
      } else if (isNumChar(b)) {
        id = tree.add(Kind.Number, p, parent, ks, ke);
        while (p < n && isNumChar(bytes[p]!)) p++;
      } else {
        throw new JsonScanError(`unexpected byte 0x${b.toString(16)}`, p);
      }
      tree.end[id] = p;
      expectValue = false;
      if (parent < 0) rootDone = true;
      continue;
    }

    // after a value: comma or close
    if (parent < 0) throw new JsonScanError('trailing content', p);
    if (b === COMMA) {
      p++;
      expectValue = true;
      continue;
    }
    const k = tree.kind[parent];
    if ((b === RBRACE && k === Kind.Object) || (b === RBRACKET && k === Kind.Array)) {
      tree.end[parent] = ++p;
      stack.pop();
      if (!stack.length) rootDone = true;
      continue;
    }
    throw new JsonScanError('expected comma or close', p);
  }
  if (stack.length) throw new JsonScanError('unterminated container', p);
  if (!rootDone) throw new JsonScanError('empty document', p);
  return tree;
}

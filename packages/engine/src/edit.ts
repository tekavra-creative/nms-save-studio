import { applySplices, binaryToBytes, concatBytes, encodeJsonString, invertSplices, JsonDoc, type Splice } from './cst/doc.ts';
import { Kind } from './cst/scan.ts';
import type { KeyMap } from './keys/mapping.ts';

export type PathStep = string | number;

export class EditError extends Error {
  override name = 'EditError';
}

/** A semantic change. `compile` turns it into byte splices against the current document. */
export interface Op {
  readonly label: string;
  compile(doc: JsonDoc, keys: KeyMap): Splice[];
}

interface HistoryEntry {
  op: Op;
  forward: Splice[];
  inverse: Splice[];
}

/** Holds a document's bytes and an undo/redo history of semantic operations. */
export class EditSession {
  #doc: JsonDoc;
  readonly keys: KeyMap;
  readonly #done: HistoryEntry[] = [];
  #undone: HistoryEntry[] = [];

  constructor(doc: JsonDoc, keys: KeyMap) {
    this.#doc = doc;
    this.keys = keys;
  }

  get doc(): JsonDoc {
    return this.#doc;
  }

  get bytes(): Uint8Array {
    return this.#doc.bytes;
  }

  get history(): readonly string[] {
    return this.#done.map((h) => h.op.label);
  }

  get canUndo(): boolean {
    return this.#done.length > 0;
  }

  get canRedo(): boolean {
    return this.#undone.length > 0;
  }

  apply(op: Op): void {
    const before = this.#doc.bytes;
    const forward = op.compile(this.#doc, this.keys);
    if (!forward.length) return;
    const after = applySplices(before, forward);
    const next = new JsonDoc(after);
    this.#done.push({ op, forward, inverse: invertSplices(before, forward) });
    this.#undone = [];
    this.#doc = next;
  }

  undo(): string | undefined {
    const h = this.#done.pop();
    if (!h) return undefined;
    this.#doc = new JsonDoc(applySplices(this.#doc.bytes, h.inverse));
    this.#undone.push(h);
    return h.op.label;
  }

  redo(): string | undefined {
    const h = this.#undone.pop();
    if (!h) return undefined;
    this.#doc = new JsonDoc(applySplices(this.#doc.bytes, h.forward));
    this.#done.push(h);
    return h.op.label;
  }
}

// ---------- path + value helpers ----------

export function resolve(doc: JsonDoc, keys: KeyMap, path: readonly PathStep[]): number {
  const node = doc.at(path.map((s) => (typeof s === 'number' ? s : keys.key(s))));
  if (node < 0) throw new EditError(`path not found: ${path.join('.')}`);
  return node;
}

function nodeSplice(doc: JsonDoc, node: number, bytes: Uint8Array): Splice {
  return { start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes };
}

export function numberBytes(value: number | bigint | string): Uint8Array {
  const text = typeof value === 'string' ? value : value.toString();
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) throw new EditError(`not a JSON number: ${text}`);
  return binaryToBytes(text);
}

export const literal = {
  string: (binary: string) => encodeJsonString(binary),
  number: numberBytes,
  boolean: (b: boolean) => binaryToBytes(b ? 'true' : 'false'),
  raw: (bytes: Uint8Array) => bytes,
};

// ---------- primitive ops ----------

export function setValue(label: string, path: readonly PathStep[], bytes: Uint8Array): Op {
  return {
    label,
    compile(doc, keys) {
      const node = resolve(doc, keys, path);
      new JsonDoc(bytes); // validates the replacement is one well-formed JSON value
      return [nodeSplice(doc, node, bytes)];
    },
  };
}

export function setNumber(label: string, path: readonly PathStep[], value: number | bigint | string): Op {
  return setValue(label, path, numberBytes(value));
}

export function setString(label: string, path: readonly PathStep[], binary: string): Op {
  return setValue(label, path, encodeJsonString(binary));
}

/** Replace item `index` of an array. */
export function setArrayItem(label: string, arrayPath: readonly PathStep[], index: number, bytes: Uint8Array): Op {
  return setValue(label, [...arrayPath, index], bytes);
}

/** Append a value to an array (lossless: only inserts bytes before the closing bracket). */
export function appendArrayItem(label: string, arrayPath: readonly PathStep[], bytes: Uint8Array): Op {
  return {
    label,
    compile(doc, keys) {
      const arr = resolve(doc, keys, arrayPath);
      if (doc.kind(arr) !== Kind.Array) throw new EditError(`not an array: ${arrayPath.join('.')}`);
      const close = doc.tree.end[arr]! - 1;
      const sep = doc.childCount(arr) > 0 ? binaryToBytes(',') : new Uint8Array(0);
      return [{ start: close, end: close, bytes: concatBytes([sep, bytes]) }];
    },
  };
}

/** Remove array item `index`, including one adjacent comma. */
export function removeArrayItem(label: string, arrayPath: readonly PathStep[], index: number): Op {
  return {
    label,
    compile(doc, keys) {
      const arr = resolve(doc, keys, arrayPath);
      const item = doc.child(arr, index);
      if (item < 0) throw new EditError(`no item ${index} in ${arrayPath.join('.')}`);
      const count = doc.childCount(arr);
      let start = doc.tree.start[item]!;
      let end = doc.tree.end[item]!;
      if (count > 1) {
        if (index < count - 1) end = doc.tree.start[doc.child(arr, index + 1)]!;
        else start = doc.tree.end[doc.child(arr, index - 1)]!;
      }
      return [{ start, end, bytes: new Uint8Array(0) }];
    },
  };
}

/** Add or replace an object member. New members are appended at the end of the object. */
export function setMember(label: string, objectPath: readonly PathStep[], name: string, bytes: Uint8Array): Op {
  return {
    label,
    compile(doc, keys) {
      const obj = resolve(doc, keys, objectPath);
      if (doc.kind(obj) !== Kind.Object) throw new EditError(`not an object: ${objectPath.join('.')}`);
      const key = keys.key(name);
      const existing = doc.child(obj, key);
      if (existing >= 0) return [nodeSplice(doc, existing, bytes)];
      const close = doc.tree.end[obj]! - 1;
      const sep = doc.childCount(obj) > 0 ? ',' : '';
      return [{ start: close, end: close, bytes: concatBytes([binaryToBytes(sep), encodeJsonString(key), binaryToBytes(':'), bytes]) }];
    },
  };
}

/** Several ops applied as one undo step (their splices must not overlap). */
export function batch(label: string, ops: readonly Op[]): Op {
  return {
    label,
    compile(doc, keys) {
      return ops.flatMap((op) => op.compile(doc, keys));
    },
  };
}

/** Copy a value's raw bytes from another document (lossless transplant). */
export function transplant(from: JsonDoc, node: number): Uint8Array {
  return from.span(node).slice();
}

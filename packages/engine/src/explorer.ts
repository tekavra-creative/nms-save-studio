import { binaryToBytes, binaryToDisplay, concatBytes, JsonDoc } from './cst/doc.ts';
import { EditError, literal, type Op, type PathStep } from './edit.ts';
import { Kind } from './cst/scan.ts';
import type { KeyMap } from './keys/mapping.ts';

/**
 * Generic, schema-agnostic browser + editor over a save's whole JSON tree.
 * Every function here takes a `path` of raw keys/indices as already stored in the file — it
 * knows nothing about ships, currencies, or any other domain. It works identically for any
 * node in any save, so it never needs updating when a new field, category, or save shape shows up.
 */

export type LeafKind = 'string' | 'number' | 'boolean' | 'null';

export interface NodeSummary {
  /** Raw key (object member) or array index this node sits at under its parent. */
  key: string | number;
  /** Human name from the mapping file, when known; otherwise the raw key is shown as-is. */
  name: string;
  kind: 'object' | 'array' | LeafKind;
  /** Object/array: how many children. Leaf: -1. */
  childCount: number;
  /** Short read-only preview for the row (leaf value, or "{3}" / "[12]" for containers). */
  preview: string;
}

function kindOf(k: Kind): NodeSummary['kind'] {
  switch (k) {
    case Kind.Object: return 'object';
    case Kind.Array: return 'array';
    case Kind.String: return 'string';
    case Kind.Number: return 'number';
    case Kind.True:
    case Kind.False: return 'boolean';
    case Kind.Null: return 'null';
  }
}

function preview(doc: JsonDoc, node: number, kind: NodeSummary['kind']): string {
  switch (kind) {
    case 'object': return `{${doc.childCount(node)}}`;
    case 'array': return `[${doc.childCount(node)}]`;
    case 'string': {
      const s = binaryToDisplay(doc.string(node));
      return s.length > 120 ? `${s.slice(0, 120)}…` : s;
    }
    case 'number': return String(doc.number(node));
    case 'boolean': return String(doc.boolean(node));
    case 'null': return 'null';
  }
}

function summarize(doc: JsonDoc, node: number, key: string | number, keys: KeyMap): NodeSummary {
  const kind = kindOf(doc.kind(node));
  return {
    key,
    name: typeof key === 'number' ? String(key) : (keys.name(key) ?? key),
    kind,
    childCount: kind === 'object' || kind === 'array' ? doc.childCount(node) : -1,
    preview: preview(doc, node, kind),
  };
}

/** List the direct children of the node at `path` (root = `[]`). Throws if the path doesn't resolve. */
export function listChildren(doc: JsonDoc, keys: KeyMap, path: readonly PathStep[]): NodeSummary[] {
  const node = path.length === 0 ? doc.root : resolvePlain(doc, path);
  const kind = doc.kind(node);
  if (kind !== Kind.Object && kind !== Kind.Array) throw new EditError(`not a container: ${path.join('/')}`);
  const out: NodeSummary[] = [];
  let i = 0;
  for (const child of doc.children(node)) {
    const key = kind === Kind.Array ? i++ : doc.key(child)!;
    out.push(summarize(doc, child, key, keys));
  }
  return out;
}

/** Resolve a path of RAW keys/indices (no name→key translation — the explorer walks the file as-is). */
function resolvePlain(doc: JsonDoc, path: readonly PathStep[]): number {
  const node = doc.at(path);
  if (node < 0) throw new EditError(`path not found: ${path.join('/')}`);
  return node;
}

export interface LeafValue {
  kind: LeafKind;
  value: string | number | bigint | boolean | null;
}

/** Read a leaf's exact value (root or non-leaf paths throw — browse with `listChildren` first). */
export function getLeaf(doc: JsonDoc, path: readonly PathStep[]): LeafValue {
  const node = resolvePlain(doc, path);
  const kind = kindOf(doc.kind(node));
  switch (kind) {
    case 'string': return { kind, value: binaryToDisplay(doc.string(node)) };
    case 'number': return { kind, value: doc.number(node) };
    case 'boolean': return { kind, value: doc.boolean(node) };
    case 'null': return { kind, value: null };
    default: throw new EditError(`not a leaf: ${path.join('/')} is a ${kind}`);
  }
}

/**
 * Build an edit that sets a leaf to a new value of the SAME kind it already has (the explorer
 * never changes a field's type — that is what keeps it safe to point at data nobody has mapped).
 * `raw` is the text the person typed; it is parsed according to the leaf's current kind.
 */
export function setLeaf(label: string, path: readonly PathStep[], kind: LeafKind, raw: string): Op {
  return {
    label,
    compile(doc) {
      const node = resolvePlain(doc, path);
      const actual = kindOf(doc.kind(node));
      if (actual !== kind) throw new EditError(`${path.join('/')} is ${actual}, not ${kind}`);
      const bytes =
        kind === 'string' ? literal.string(raw)
        : kind === 'number' ? literal.number(raw)
        : kind === 'boolean' ? literal.boolean(raw === 'true')
        : literal.raw(new TextEncoder().encode('null'));
      return [{ start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes }];
    },
  };
}

/**
 * Duplicate an existing array item and append the copy at the end — the safe way to "add" a new
 * item when nothing here knows the shape a blank one should have (an inventory slot, a discovery
 * entry, a base object all have different shapes). The person edits the copy's fields afterward.
 */
export function duplicateArrayItem(label: string, arrayPath: readonly PathStep[], index: number): Op {
  return {
    label,
    compile(doc) {
      const arr = resolvePlain(doc, arrayPath);
      if (doc.kind(arr) !== Kind.Array) throw new EditError(`not an array: ${arrayPath.join('/')}`);
      const item = doc.child(arr, index);
      if (item < 0) throw new EditError(`no item ${index} in ${arrayPath.join('/')}`);
      const bytes = doc.span(item).slice();
      const close = doc.tree.end[arr]! - 1;
      const sep = doc.childCount(arr) > 0 ? binaryToBytes(',') : new Uint8Array(0);
      return [{ start: close, end: close, bytes: concatBytes([sep, bytes]) }];
    },
  };
}

export interface SearchHit {
  path: PathStep[];
  name: string;
  kind: NodeSummary['kind'];
  preview: string;
}

/**
 * Depth-first search for object keys or leaf values whose text contains `query` (case-insensitive).
 * Bounded by `limit` so a broad query on a huge save still returns quickly. Schema-agnostic: it
 * walks whatever is actually there, matching on the mapped name (or raw key) and the leaf preview.
 */
export function searchTree(doc: JsonDoc, keys: KeyMap, from: readonly PathStep[], query: string, limit = 200): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchHit[] = [];
  const root = from.length === 0 ? doc.root : resolvePlain(doc, from);

  function walk(node: number, path: PathStep[]): void {
    if (out.length >= limit) return;
    const kind = doc.kind(node);
    if (kind !== Kind.Object && kind !== Kind.Array) return;
    let i = 0;
    for (const child of doc.children(node)) {
      if (out.length >= limit) return;
      const key = kind === Kind.Array ? i++ : doc.key(child)!;
      const s = summarize(doc, child, key, keys);
      const childPath = [...path, key];
      if (s.name.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)) {
        out.push({ path: childPath, name: s.name, kind: s.kind, preview: s.preview });
      }
      walk(child, childPath);
    }
  }

  walk(root, [...from]);
  return out;
}

import { binaryToDisplay, type JsonDoc } from './cst/doc.ts';
import { Kind } from './cst/scan.ts';
import type { KeyMap } from './keys/mapping.ts';

export interface DiffEntry {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  a?: string;
  b?: string;
}

export interface DiffOptions {
  limit?: number;
  maxValueLength?: number;
}

/** Structural diff of two save documents, reported by readable path (e.g. PlayerStateData.Units). */
export function diffDocs(a: JsonDoc, b: JsonDoc, keysA: KeyMap, keysB: KeyMap = keysA, opts: DiffOptions = {}): DiffEntry[] {
  const limit = opts.limit ?? 500;
  const maxLen = opts.maxValueLength ?? 80;
  const out: DiffEntry[] = [];
  const show = (doc: JsonDoc, n: number) => {
    const raw = doc.kind(n) === Kind.String ? JSON.stringify(binaryToDisplay(doc.string(n))) : binaryToDisplay(doc.raw(n));
    return raw.length > maxLen ? raw.slice(0, maxLen - 1) + '…' : raw;
  };
  const label = (keys: KeyMap, k: string) => keys.name(k) ?? `⟨${k}⟩`;

  const walk = (na: number, nb: number, path: string): void => {
    if (out.length >= limit) return;
    const ka = a.kind(na);
    const kb = b.kind(nb);
    if (ka !== kb || (ka !== Kind.Object && ka !== Kind.Array)) {
      const sa = a.span(na);
      const sb = b.span(nb);
      if (sa.length !== sb.length || !sa.every((x, i) => x === sb[i])) out.push({ path, kind: 'changed', a: show(a, na), b: show(b, nb) });
      return;
    }
    if (ka === Kind.Array) {
      const ca = [...a.children(na)];
      const cb = [...b.children(nb)];
      const n = Math.max(ca.length, cb.length);
      for (let i = 0; i < n && out.length < limit; i++) {
        const p = `${path}[${i}]`;
        if (i >= ca.length) out.push({ path: p, kind: 'added', b: show(b, cb[i]!) });
        else if (i >= cb.length) out.push({ path: p, kind: 'removed', a: show(a, ca[i]!) });
        else walk(ca[i]!, cb[i]!, p);
      }
      return;
    }
    const mb = new Map<string, number>();
    for (const c of b.children(nb)) mb.set(label(keysB, b.key(c)!), c);
    for (const c of a.children(na)) {
      if (out.length >= limit) return;
      const name = label(keysA, a.key(c)!);
      const p = path ? `${path}.${name}` : name;
      const other = mb.get(name);
      if (other === undefined) out.push({ path: p, kind: 'removed', a: show(a, c) });
      else {
        walk(c, other, p);
        mb.delete(name);
      }
    }
    for (const [name, c] of mb) {
      if (out.length >= limit) return;
      out.push({ path: path ? `${path}.${name}` : name, kind: 'added', b: show(b, c) });
    }
  };
  walk(a.root, b.root, '');
  return out;
}

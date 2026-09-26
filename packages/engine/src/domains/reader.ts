import { binaryToDisplay, type JsonDoc } from '../cst/doc.ts';
import { Kind } from '../cst/scan.ts';
import type { KeyMap } from '../keys/mapping.ts';
import type { PathStep } from '../edit.ts';

/** Readable-name accessors over a save document. Missing fields return undefined, never throw. */
export class SaveReader {
  readonly doc: JsonDoc;
  readonly keys: KeyMap;

  constructor(doc: JsonDoc, keys: KeyMap) {
    this.doc = doc;
    this.keys = keys;
  }

  node(path: readonly PathStep[], from = this.doc.root): number {
    return this.doc.at(path.map((s) => (typeof s === 'number' ? s : this.keys.key(s))), from);
  }

  /** The active PlayerStateData (normal game vs expedition context). */
  get context(): 'BaseContext' | 'ExpeditionContext' {
    const active = this.text(['ActiveContext']);
    if (active === 'Season' && this.node(['ExpeditionContext']) >= 0) return 'ExpeditionContext';
    return this.node(['BaseContext']) >= 0 ? 'BaseContext' : 'ExpeditionContext';
  }

  get playerPath(): PathStep[] {
    return [this.context, 'PlayerStateData'];
  }

  get player(): number {
    return this.node(this.playerPath);
  }

  text(path: readonly PathStep[], from = this.doc.root): string | undefined {
    const n = this.node(path, from);
    return n >= 0 && this.doc.kind(n) === Kind.String ? binaryToDisplay(this.doc.string(n)) : undefined;
  }

  num(path: readonly PathStep[], from = this.doc.root): number | bigint | undefined {
    const n = this.node(path, from);
    return n >= 0 && this.doc.kind(n) === Kind.Number ? this.doc.number(n) : undefined;
  }

  bool(path: readonly PathStep[], from = this.doc.root): boolean | undefined {
    const n = this.node(path, from);
    const k = n >= 0 ? this.doc.kind(n) : -1;
    return k === Kind.True ? true : k === Kind.False ? false : undefined;
  }

  count(path: readonly PathStep[], from = this.doc.root): number {
    const n = this.node(path, from);
    return n >= 0 ? this.doc.childCount(n) : 0;
  }

  items(path: readonly PathStep[], from = this.doc.root): number[] {
    const n = this.node(path, from);
    return n >= 0 && this.doc.kind(n) === Kind.Array ? [...this.doc.children(n)] : [];
  }

  /** Seed tuples look like [true, "0x23E8BBE693"]; returns the hex text when the seed is set. */
  seed(path: readonly PathStep[], from = this.doc.root): string | undefined {
    const n = this.node(path, from);
    if (n < 0 || this.doc.kind(n) !== Kind.Array) return undefined;
    const set = this.doc.child(n, 0);
    const val = this.doc.child(n, 1);
    if (set < 0 || val < 0 || this.doc.kind(set) !== Kind.True) return undefined;
    return this.doc.kind(val) === Kind.String ? this.doc.string(val) : this.doc.raw(val);
  }
}

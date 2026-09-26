import type { JsonDoc } from '../cst/doc.ts';

export interface MappingFile {
  libMBIN_version: string;
  Mapping: { Key: string; Value: string }[];
}

export type KeyStyle = 'obfuscated' | 'plain';

/** Translates readable field names ↔ the 3-char keys a save file actually uses. */
export class KeyMap {
  readonly version: string;
  readonly style: KeyStyle;
  readonly #toKey = new Map<string, string>();
  readonly #toName = new Map<string, string>();

  constructor(file: MappingFile, style: KeyStyle) {
    this.version = file.libMBIN_version;
    this.style = style;
    for (const { Key, Value } of file.Mapping) {
      this.#toName.set(Key, Value);
      if (!this.#toKey.has(Value)) this.#toKey.set(Value, Key);
    }
  }

  static forDoc(file: MappingFile, doc: JsonDoc): KeyMap {
    return new KeyMap(file, detectStyle(doc));
  }

  /** Readable name → key used in this file. Unknown names pass through unchanged. */
  key(name: string): string {
    if (this.style === 'plain') return name;
    return this.#toKey.get(name) ?? name;
  }

  /** File key → readable name, or undefined when the mapping doesn't know it (newer game). */
  name(key: string): string | undefined {
    if (this.style === 'plain') return key;
    return this.#toName.get(key);
  }

  has(name: string): boolean {
    return this.style === 'plain' || this.#toKey.has(name);
  }

  path(...names: (string | number)[]): (string | number)[] {
    return names.map((n) => (typeof n === 'number' ? n : this.key(n)));
  }
}

export function detectStyle(doc: JsonDoc): KeyStyle {
  if (doc.child(doc.root, 'F2P') >= 0) return 'obfuscated';
  if (doc.child(doc.root, 'Version') >= 0) return 'plain';
  throw new Error('unrecognised save: no Version field');
}

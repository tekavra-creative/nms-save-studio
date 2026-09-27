// Ranked name search over a few thousand items. No dependencies: a precomputed normalised index and
// a tiered score (exact > prefix > word-prefix > substring > ID > subtitle/category > in-order
// letters), so typing "ferr" finds Ferrite Dust before anything that merely contains an f, e, r, r.
import type { FactsItem, ItemKind } from './types.ts';

export interface SearchOptions {
  limit?: number;
  kinds?: readonly ItemKind[];
}

export interface SearchHit {
  item: FactsItem;
  score: number;
}

interface Entry {
  item: FactsItem;
  name: string;
  words: string[];
  id: string;
  extra: string;
}

/** Lower case, accents stripped, anything that is not a letter or digit becomes one space. */
export function normalise(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isSubsequence(needle: string, hay: string): number {
  // Returns a density score (0 = no match): tighter matches score higher.
  let at = -1;
  let first = -1;
  for (const ch of needle) {
    if (ch === ' ') continue;
    at = hay.indexOf(ch, at + 1);
    if (at < 0) return 0;
    if (first < 0) first = at;
  }
  const span = at - first + 1;
  return span > 0 ? needle.replaceAll(' ', '').length / span : 0;
}

function scoreEntry(e: Entry, q: string, qWords: string[], qId: string): number {
  if (e.name === q) return 1000;
  if (e.id === qId) return 950;
  if (e.name.startsWith(q)) return 800 - Math.min(e.name.length - q.length, 99);
  const everyWordIsPrefix = qWords.every((w) => e.words.some((ew) => ew.startsWith(w)));
  if (everyWordIsPrefix) return 600 - Math.min(e.name.length, 99);
  const at = e.name.indexOf(q);
  if (at >= 0) return 400 - Math.min(at, 99);
  if (qWords.every((w) => e.name.includes(w))) return 350 - Math.min(e.name.length, 99);
  if (e.id.includes(qId)) return 300 - Math.min(e.id.length - qId.length, 99);
  if (qWords.every((w) => e.extra.includes(w) || e.name.includes(w))) return 150;
  if (q.length >= 3) {
    const density = isSubsequence(q, e.name);
    if (density >= 0.34) return Math.round(50 * density);
  }
  return 0;
}

export class ItemSearch {
  readonly #entries: Entry[];

  constructor(items: Iterable<FactsItem>) {
    this.#entries = [];
    for (const item of items) {
      const name = normalise(item.name);
      this.#entries.push({
        item,
        name,
        words: name.split(' ').filter(Boolean),
        id: normalise(item.id).replaceAll(' ', '_'),
        extra: normalise(`${item.subtitle ?? ''} ${item.category} ${item.substanceCategory ?? ''}`),
      });
    }
  }

  get size(): number {
    return this.#entries.length;
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const q = normalise(query.replace(/^\^+/, ''));
    if (!q) return [];
    const qWords = q.split(' ');
    const qId = q.replaceAll(' ', '_');
    const kinds = options.kinds ? new Set<ItemKind>(options.kinds) : undefined;
    const hits: SearchHit[] = [];
    for (const e of this.#entries) {
      if (kinds && !kinds.has(e.item.kind)) continue;
      const score = scoreEntry(e, q, qWords, qId);
      if (score > 0) hits.push({ item: e.item, score });
    }
    hits.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id));
    return hits.slice(0, options.limit ?? 50);
  }
}

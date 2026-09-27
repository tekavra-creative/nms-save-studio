// Item facts (names, icons, search) for the inventory editor. The pack is built once from the
// user's own game install (packages/data-forge/scripts/build-facts.ts) and cached on disk — this
// just finds and loads it, lazily, and builds the search index once.
import { findFactsPack, loadFactsPackFile } from '@nss/gamedata/node';
import { ItemSearch, lookupItem, maxStackFor, type FactsPack, type ItemKind } from '@nss/gamedata';

let packPromise: Promise<FactsPack | undefined> | undefined;
let search: ItemSearch | undefined;

async function pack(): Promise<FactsPack | undefined> {
  packPromise ??= (async () => {
    const path = await findFactsPack();
    if (!path) return undefined;
    try {
      return await loadFactsPackFile(path);
    } catch {
      return undefined;
    }
  })();
  return packPromise;
}

async function searcher(): Promise<ItemSearch | undefined> {
  const p = await pack();
  if (!p) return undefined;
  search ??= new ItemSearch(Object.values(p.items));
  return search;
}

export interface ItemInfoView {
  id: string;
  name: string;
  known: boolean;
  kind: ItemKind | 'unknown';
  iconPath?: string;
  rarity?: string;
}

/** NMS's own `InventoryType` string for an item kind — the game distinguishes stacking rules by this. */
const INVENTORY_TYPE: Record<ItemKind, string> = { substance: 'Substance', product: 'Product', technology: 'Technology', procedural: 'Product' };

/** Unrecognised items (no facts pack, or an ID it doesn't know) default to 'Product' — the common case. */
export function inventoryTypeFor(kind: ItemKind | 'unknown'): string {
  return kind === 'unknown' ? 'Product' : INVENTORY_TYPE[kind];
}

export async function resolveItem(rawId: string): Promise<ItemInfoView> {
  const p = await pack();
  const r = lookupItem(p, rawId);
  const out: ItemInfoView = { id: r.id, name: r.name, known: r.known, kind: r.kind };
  if (r.item?.iconPath) out.iconPath = r.item.iconPath;
  if (r.item?.rarity) out.rarity = r.item.rarity;
  return out;
}

export async function searchItems(query: string, limit = 40): Promise<{ id: string; name: string; kind: ItemKind; iconPath?: string; rarity?: string }[]> {
  const s = await searcher();
  if (!s) return [];
  return s.search(query, { limit }).map((h) => {
    const out: { id: string; name: string; kind: ItemKind; iconPath?: string; rarity?: string } = { id: h.item.id, name: h.item.name, kind: h.item.kind };
    if (h.item.iconPath) out.iconPath = h.item.iconPath;
    if (h.item.rarity) out.rarity = h.item.rarity;
    return out;
  });
}

export async function maxStackForItem(rawId: string, inventoryKind: string): Promise<number> {
  const p = await pack();
  const r = lookupItem(p, rawId);
  if (!r.item) return 9999;
  return maxStackFor(p, r.item, { inventory: inventoryKind }) ?? r.item.maxStack ?? 9999;
}

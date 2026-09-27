import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clearSlot,
  duplicateArrayItem,
  EditSession,
  fillSlot,
  getLeaf,
  KeyMap,
  Kind,
  listChildren,
  readContainer,
  removeArrayItem,
  SaveFile,
  SaveReader,
  searchTree,
  setLeaf,
  setSlotAmount,
  setSlotItem,
  type LeafKind,
  type LeafValue,
  type MappingFile,
  type PathStep,
} from '@nss/engine';
import { fingerprint, listSlots, writeSlotFile, type SlotEntry } from '@nss/io';
import type {
  ContainerListEntryView,
  ContainerView,
  ExplorerStateView,
  ItemSearchHitView,
  LeafValueView,
  NodeSummaryView,
  PathStepView,
  SearchHitView,
  InvSlotView,
  WriteResultView,
} from '../shared/api.ts';
import { inventoryTypeFor, maxStackForItem, resolveItem, searchItems } from './items.ts';
import { shortPlace } from './merge.ts';

/** Every container this app knows how to edit, and the readable label the picker shows. Filtered
 * per-save to whichever of these actually exist (no freighter, no corvette, etc.). */
const CONTAINERS: readonly { key: string; label: string; path: readonly string[]; kind: string }[] = [
  { key: 'suit', label: 'Exosuit — General', path: ['Inventory'], kind: 'Personal' },
  { key: 'suit-tech', label: 'Exosuit — Technology', path: ['Inventory_TechOnly'], kind: 'Personal' },
  { key: 'suit-cargo', label: 'Exosuit — Cargo', path: ['Inventory_Cargo'], kind: 'Personal' },
  { key: 'ship', label: 'Starship (active) — General', path: ['ShipInventory'], kind: 'Ship' },
  { key: 'multitool', label: 'Multi-tool (active)', path: ['WeaponInventory'], kind: 'Weapon' },
  { key: 'freighter', label: 'Freighter — General', path: ['FreighterInventory'], kind: 'Freighter' },
  { key: 'freighter-tech', label: 'Freighter — Technology', path: ['FreighterInventory_TechOnly'], kind: 'Freighter' },
  { key: 'freighter-cargo', label: 'Freighter — Cargo', path: ['FreighterInventory_Cargo'], kind: 'Freighter' },
  { key: 'corvette', label: 'Corvette Storage', path: ['CorvetteStorageInventory'], kind: 'Freighter' },
  ...Array.from({ length: 10 }, (_, i) => ({ key: `chest${i + 1}`, label: `Base Storage Container ${i + 1}`, path: [`Chest${i + 1}Inventory`], kind: 'Chest' })),
  { key: 'chest-magic', label: 'Base Storage Container (Exotic) 1', path: ['ChestMagicInventory'], kind: 'Chest' },
  { key: 'chest-magic-2', label: 'Base Storage Container (Exotic) 2', path: ['ChestMagic2Inventory'], kind: 'Chest' },
  { key: 'cooking', label: 'Cooking Ingredients', path: ['CookingIngredientsInventory'], kind: 'Chest' },
  { key: 'fish-platform', label: 'Fish Tank', path: ['FishPlatformInventory'], kind: 'Chest' },
  { key: 'fish-bait', label: 'Bait Box', path: ['FishBaitBoxInventory'], kind: 'Chest' },
  { key: 'food-unit', label: 'Food Processing Unit', path: ['FoodUnitInventory'], kind: 'Chest' },
];

function findContainer(key: string) {
  const c = CONTAINERS.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown inventory container: ${key}`);
  return c;
}

interface ExplorerSession {
  id: string;
  root: string;
  slot: number;
  title: string;
  entry: SlotEntry;
  file: SaveFile;
  keys: KeyMap;
  session: EditSession;
  path: PathStep[];
}

const sessions = new Map<string, ExplorerSession>();

function get(id: string): ExplorerSession {
  const s = sessions.get(id);
  if (!s) throw new Error('This explorer session was closed — open the save again.');
  return s;
}

function toNodeView(n: ReturnType<typeof listChildren>[number]): NodeSummaryView {
  return { key: n.key, name: n.name, kind: n.kind, childCount: n.childCount, preview: n.preview };
}

function view(s: ExplorerSession): ExplorerStateView {
  return {
    explorerId: s.id,
    root: s.root,
    slot: s.slot,
    title: s.title,
    canUndo: s.session.canUndo,
    canRedo: s.session.canRedo,
    path: s.path as PathStepView[],
    isArray: s.session.doc.kind(s.session.doc.at(s.path)) === Kind.Array,
    children: listChildren(s.session.doc, s.keys, s.path).map(toNodeView),
  };
}

export function openExplorer(mapping: MappingFile, root: string, slot: number): ExplorerStateView {
  const info = listSlots(root)[slot - 1];
  const entry = info?.latest;
  if (!entry) throw new Error(`Slot ${slot} is empty.`);
  const file = new SaveFile(
    new Uint8Array(readFileSync(join(root, entry.ref.dataName))),
    new Uint8Array(readFileSync(join(root, entry.ref.manifestName))),
    entry.ref.manifestSlotIndex,
  );
  const keys = KeyMap.forDoc(mapping, file.doc);
  const title = entry.manifest?.saveName || shortPlace(entry.manifest?.saveSummary) || `Slot ${slot}`;
  const s: ExplorerSession = { id: crypto.randomUUID(), root, slot, title, entry, file, keys, session: new EditSession(file.doc, keys), path: [] };
  sessions.set(s.id, s);
  return view(s);
}

export function explorerList(id: string, path: PathStepView[]): ExplorerStateView {
  const s = get(id);
  s.path = path as PathStep[];
  return view(s);
}

export function explorerGetLeaf(id: string, path: PathStepView[]): LeafValueView {
  const s = get(id);
  const leaf: LeafValue = getLeaf(s.session.doc, path as PathStep[]);
  return { kind: leaf.kind, value: typeof leaf.value === 'bigint' ? leaf.value.toString() : leaf.value };
}

export function explorerSetLeaf(id: string, path: PathStepView[], kind: LeafValueView['kind'], raw: string): ExplorerStateView {
  const s = get(id);
  const name = `Edit ${path[path.length - 1]}`;
  s.session.apply(setLeaf(name, path as PathStep[], kind as LeafKind, raw));
  return view(s);
}

export function explorerDuplicateItem(id: string, arrayPath: PathStepView[], index: number): ExplorerStateView {
  const s = get(id);
  s.session.apply(duplicateArrayItem(`Duplicate item ${index}`, arrayPath as PathStep[], index));
  return view(s);
}

export function explorerRemoveItem(id: string, arrayPath: PathStepView[], index: number): ExplorerStateView {
  const s = get(id);
  s.session.apply(removeArrayItem(`Remove item ${index}`, arrayPath as PathStep[], index));
  return view(s);
}

export function explorerSearch(id: string, query: string): SearchHitView[] {
  const s = get(id);
  return searchTree(s.session.doc, s.keys, [], query).map((h) => ({ path: h.path as PathStepView[], name: h.name, kind: h.kind, preview: h.preview }));
}

export function explorerUndo(id: string): ExplorerStateView {
  get(id).session.undo();
  return view(get(id));
}

export function explorerRedo(id: string): ExplorerStateView {
  get(id).session.redo();
  return view(get(id));
}

/** Writes back into the SAME slot/file it was opened from, guarded so a concurrent change (the game, Steam Cloud) since open() refuses the write. */
export async function writeExplorer(id: string): Promise<WriteResultView> {
  const s = get(id);
  if (!s.session.canUndo) throw new Error('No edits to write yet.');
  const encoded = s.file.encode(s.session.bytes);
  const base = process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/NMS Save Studio') : join(process.env['APPDATA'] ?? join(homedir(), 'AppData/Roaming'), 'NMS Save Studio');
  const res = await writeSlotFile({
    root: s.root,
    ref: s.entry.ref,
    encoded,
    expect: { data: s.entry.data, meta: s.entry.meta },
    snapshotDir: join(base, 'Snapshots'),
    reason: `explorer-slot-${s.slot}`,
  });
  // re-fingerprint so a second write in the same session (after this one lands) still checks cleanly
  s.entry = { ...s.entry, data: fingerprint(res.dataPath), meta: fingerprint(res.manifestPath) };
  return { slot: s.slot, file: s.entry.ref.dataName, name: s.title, snapshot: res.snapshot, bytes: res.verified.decompressedSize };
}

export function closeExplorer(id: string): void {
  sessions.delete(id);
}

function reader(s: ExplorerSession): SaveReader {
  return new SaveReader(s.session.doc, s.keys);
}

export async function inventoryContainers(id: string): Promise<ContainerListEntryView[]> {
  const s = get(id);
  const r = reader(s);
  const out: ContainerListEntryView[] = [];
  for (const c of CONTAINERS) {
    const full = [...r.playerPath, ...c.path];
    if (r.node(full) < 0) continue;
    const view = readContainer(r, full);
    out.push({ key: c.key, label: c.label, used: view.slots.length, capacity: view.validCells.length });
  }
  return out;
}

async function containerView(s: ExplorerSession, key: string): Promise<ContainerView> {
  const c = findContainer(key);
  const r = reader(s);
  const raw = readContainer(r, [...r.playerPath, ...c.path]);
  const slots: InvSlotView[] = await Promise.all(
    raw.slots.map(async (slot): Promise<InvSlotView> => ({
      arrayIndex: slot.arrayIndex,
      x: slot.x,
      y: slot.y,
      amount: slot.amount,
      maxAmount: slot.maxAmount,
      item: await resolveItem(slot.id),
    })),
  );
  return { key: c.key, label: c.label, width: raw.width, height: raw.height, validCells: raw.validCells, slots };
}

export async function inventoryOpen(id: string, key: string): Promise<ContainerView> {
  return containerView(get(id), key);
}

export async function inventorySetAmount(id: string, key: string, arrayIndex: number, amount: number): Promise<ContainerView> {
  const s = get(id);
  const c = findContainer(key);
  const r = reader(s);
  s.session.apply(setSlotAmount(`Set amount`, [...r.playerPath, ...c.path], arrayIndex, amount));
  return containerView(s, key);
}

export async function inventorySetItem(id: string, key: string, arrayIndex: number, itemId: string, amount: number): Promise<ContainerView> {
  const s = get(id);
  const c = findContainer(key);
  const r = reader(s);
  const info = await resolveItem(itemId);
  const invType = inventoryTypeFor(info.kind);
  const maxAmount = await maxStackForItem(itemId, c.kind);
  s.session.apply(setSlotItem(`Set item`, [...r.playerPath, ...c.path], arrayIndex, itemId, invType, Math.min(amount, maxAmount), maxAmount));
  return containerView(s, key);
}

export async function inventoryFillSlot(id: string, key: string, x: number, y: number, itemId: string, amount: number): Promise<ContainerView> {
  const s = get(id);
  const c = findContainer(key);
  const r = reader(s);
  const info = await resolveItem(itemId);
  const invType = inventoryTypeFor(info.kind);
  const maxAmount = await maxStackForItem(itemId, c.kind);
  s.session.apply(fillSlot(`Add item`, [...r.playerPath, ...c.path], x, y, itemId, invType, Math.min(amount, maxAmount), maxAmount));
  return containerView(s, key);
}

export async function inventoryClearSlot(id: string, key: string, arrayIndex: number): Promise<ContainerView> {
  const s = get(id);
  const c = findContainer(key);
  const r = reader(s);
  s.session.apply(clearSlot(`Remove item`, [...r.playerPath, ...c.path], arrayIndex));
  return containerView(s, key);
}

export async function itemSearch(query: string): Promise<ItemSearchHitView[]> {
  return searchItems(query);
}

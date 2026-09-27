// The only surface the renderer can reach. Everything is plain, serializable data.

export interface SaveRootView {
  path: string;
  store: 'steam' | 'gog';
  accountId: string;
}

export interface RestorePointView {
  kind: 'auto' | 'manual';
  file: string;
  name: string;
  summary: string;
  playTimeSeconds: number;
  savedAt: number;
  saveVersion: number;
  loadsInGame: boolean;
}

export interface SlotView {
  slot: number;
  title: string;
  summary: string;
  restorePoints: RestorePointView[];
}

export interface ShipView {
  index: number;
  name: string;
  kind: string;
  class: string | null;
  primary: boolean;
  cargoUsed: number;
  cargoCapacity: number;
}

export interface OverviewView {
  platform: string | null;
  playTimeSeconds: number;
  units: string;
  nanites: string;
  quicksilver: string;
  ships: ShipView[];
  multitools: { index: number; name: string; class: string | null; active: boolean }[];
  companions: { index: number; name: string; species: string }[];
  knowledge: { technology: number; products: number; specials: number; refinerRecipes: number; words: number; portalGlyphs: number };
  capacity: { ships: number; multitools: number; companions: number };
}

export type AssetKind = 'ship' | 'multitool' | 'companion';
export type CurrencyField = 'Units' | 'Nanites' | 'Specials';
export type CurrencyMode = 'sum' | 'keep-target' | 'take-source' | 'max';

export type ChangeRefView =
  | { kind: 'asset'; asset: AssetKind; sourceSlot: number; targetSlot: number }
  | { kind: 'currency'; field: CurrencyField; mode: CurrencyMode; from: string; to: string; source: string; capped: boolean }
  | { kind: 'knowledge'; what: string; count: number };

export interface ChangeView {
  id: number;
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Currencies' | 'Knowledge';
  text: string;
  applied: boolean;
  ref: ChangeRefView;
}

export interface MergeStateView {
  mergeId: string;
  targetSlot: number;
  sourceSlot: number;
  targetTitle: string;
  sourceTitle: string;
  /** Slot a Write will create (writes never touch the original saves); null when every slot is full. */
  newSlot: number | null;
  targetMeta: string;
  sourceMeta: string;
  /** Target as it will be written (with applied changes). */
  target: OverviewView;
  /** Target as it is on disk now. */
  targetBefore: OverviewView;
  source: OverviewView;
  changes: ChangeView[];
  /** Change ids in the order they were applied. */
  appliedOrder: number[];
  skipped: { group: ChangeView['group']; text: string; reason: string; asset?: AssetKind; sourceSlot?: number }[];
  canUndo: boolean;
  canRedo: boolean;
}

export interface ItemInfoView {
  id: string;
  name: string;
  known: boolean;
  kind: 'substance' | 'product' | 'technology' | 'procedural' | 'unknown';
  iconPath?: string;
  rarity?: string;
}

export interface InvSlotView {
  arrayIndex: number;
  x: number;
  y: number;
  amount: number;
  maxAmount: number;
  item: ItemInfoView;
}

export interface ContainerView {
  key: string;
  label: string;
  width: number;
  height: number;
  validCells: [number, number][];
  slots: InvSlotView[];
}

export interface ContainerListEntryView {
  key: string;
  label: string;
  used: number;
  capacity: number;
}

export interface ItemSearchHitView {
  id: string;
  name: string;
  kind: 'substance' | 'product' | 'technology' | 'procedural';
  iconPath?: string;
  rarity?: string;
}

export interface SurvivalCheckView {
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Knowledge';
  text: string;
  survived: boolean;
}

export interface SurvivalReportView {
  mergedTitle: string;
  sourceTitle: string;
  checks: SurvivalCheckView[];
  survived: number;
  total: number;
}

export interface WriteResultView {
  slot: number;
  file: string;
  name: string;
  snapshot: string;
  bytes: number;
}

export type PathStepView = string | number;
export type LeafKindView = 'string' | 'number' | 'boolean' | 'null';

/** A node's raw key/index plus its readable name (mapped when known, raw key otherwise) and preview. */
export interface NodeSummaryView {
  key: PathStepView;
  name: string;
  kind: 'object' | 'array' | LeafKindView;
  /** Object/array: child count. Leaf: -1. */
  childCount: number;
  preview: string;
}

/** A leaf's exact value. Numbers past Number.MAX_SAFE_INTEGER arrive as a decimal string. */
export interface LeafValueView {
  kind: LeafKindView;
  value: string | number | boolean | null;
}

export interface SearchHitView {
  path: PathStepView[];
  name: string;
  kind: 'object' | 'array' | LeafKindView;
  preview: string;
}

export interface ExplorerStateView {
  explorerId: string;
  root: string;
  slot: number;
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  /** The path just browsed/edited (for the caller's own confirmation — the app tracks its own breadcrumb). */
  path: PathStepView[];
  /** Whether the container AT `path` is an array (its rows can be duplicated/removed) or an object. */
  isArray: boolean;
  children: NodeSummaryView[];
}

export interface StudioApi {
  listRoots(): Promise<SaveRootView[]>;
  listSlots(root: string): Promise<SlotView[]>;
  overview(root: string, slot: number): Promise<OverviewView>;
  gameRunning(): Promise<boolean>;
  openMerge(root: string, targetSlot: number, sourceSlot: number): Promise<MergeStateView>;
  applyChanges(mergeId: string, changeIds: number[]): Promise<MergeStateView>;
  revertChange(mergeId: string, changeId: number): Promise<MergeStateView>;
  setCurrencyMode(mergeId: string, field: CurrencyField, mode: CurrencyMode): Promise<MergeStateView>;
  undo(mergeId: string): Promise<MergeStateView>;
  redo(mergeId: string): Promise<MergeStateView>;
  writeMerge(mergeId: string, name: string): Promise<WriteResultView>;
  closeMerge(mergeId: string): Promise<void>;
  openExplorer(root: string, slot: number): Promise<ExplorerStateView>;
  explorerList(explorerId: string, path: PathStepView[]): Promise<ExplorerStateView>;
  explorerGetLeaf(explorerId: string, path: PathStepView[]): Promise<LeafValueView>;
  explorerSetLeaf(explorerId: string, path: PathStepView[], kind: LeafKindView, raw: string): Promise<ExplorerStateView>;
  explorerDuplicateItem(explorerId: string, arrayPath: PathStepView[], index: number): Promise<ExplorerStateView>;
  explorerRemoveItem(explorerId: string, arrayPath: PathStepView[], index: number): Promise<ExplorerStateView>;
  explorerSearch(explorerId: string, query: string): Promise<SearchHitView[]>;
  explorerUndo(explorerId: string): Promise<ExplorerStateView>;
  explorerRedo(explorerId: string): Promise<ExplorerStateView>;
  writeExplorer(explorerId: string): Promise<WriteResultView>;
  closeExplorer(explorerId: string): Promise<void>;
  survivalCheck(root: string, mergedSlot: number, sourceSlot: number): Promise<SurvivalReportView>;
  inventoryContainers(explorerId: string): Promise<ContainerListEntryView[]>;
  inventoryOpen(explorerId: string, containerKey: string): Promise<ContainerView>;
  inventorySetAmount(explorerId: string, containerKey: string, arrayIndex: number, amount: number): Promise<ContainerView>;
  inventorySetItem(explorerId: string, containerKey: string, arrayIndex: number, itemId: string, amount: number): Promise<ContainerView>;
  inventoryFillSlot(explorerId: string, containerKey: string, x: number, y: number, itemId: string, amount: number): Promise<ContainerView>;
  inventoryClearSlot(explorerId: string, containerKey: string, arrayIndex: number): Promise<ContainerView>;
  itemSearch(query: string): Promise<ItemSearchHitView[]>;
}

export type EngineRequest =
  | { op: 'listRoots' }
  | { op: 'listSlots'; root: string }
  | { op: 'overview'; root: string; slot: number }
  | { op: 'gameRunning' }
  | { op: 'openMerge'; root: string; targetSlot: number; sourceSlot: number }
  | { op: 'applyChanges'; mergeId: string; changeIds: number[] }
  | { op: 'revertChange'; mergeId: string; changeId: number }
  | { op: 'setCurrencyMode'; mergeId: string; field: CurrencyField; mode: CurrencyMode }
  | { op: 'undo'; mergeId: string }
  | { op: 'redo'; mergeId: string }
  | { op: 'writeMerge'; mergeId: string; name: string }
  | { op: 'closeMerge'; mergeId: string }
  | { op: 'openExplorer'; root: string; slot: number }
  | { op: 'explorerList'; explorerId: string; path: PathStepView[] }
  | { op: 'explorerGetLeaf'; explorerId: string; path: PathStepView[] }
  | { op: 'explorerSetLeaf'; explorerId: string; path: PathStepView[]; kind: LeafKindView; raw: string }
  | { op: 'explorerDuplicateItem'; explorerId: string; arrayPath: PathStepView[]; index: number }
  | { op: 'explorerRemoveItem'; explorerId: string; arrayPath: PathStepView[]; index: number }
  | { op: 'explorerSearch'; explorerId: string; query: string }
  | { op: 'explorerUndo'; explorerId: string }
  | { op: 'explorerRedo'; explorerId: string }
  | { op: 'writeExplorer'; explorerId: string }
  | { op: 'closeExplorer'; explorerId: string }
  | { op: 'survivalCheck'; root: string; mergedSlot: number; sourceSlot: number }
  | { op: 'inventoryContainers'; explorerId: string }
  | { op: 'inventoryOpen'; explorerId: string; containerKey: string }
  | { op: 'inventorySetAmount'; explorerId: string; containerKey: string; arrayIndex: number; amount: number }
  | { op: 'inventorySetItem'; explorerId: string; containerKey: string; arrayIndex: number; itemId: string; amount: number }
  | { op: 'inventoryFillSlot'; explorerId: string; containerKey: string; x: number; y: number; itemId: string; amount: number }
  | { op: 'inventoryClearSlot'; explorerId: string; containerKey: string; arrayIndex: number }
  | { op: 'itemSearch'; query: string }
  // internal only (served to the renderer via the nms-icon:// protocol, never callable directly)
  | { op: 'icon'; path: string };

export const ENGINE_OPS: readonly EngineRequest['op'][] = [
  'listRoots',
  'listSlots',
  'overview',
  'gameRunning',
  'openMerge',
  'applyChanges',
  'revertChange',
  'setCurrencyMode',
  'undo',
  'redo',
  'writeMerge',
  'closeMerge',
  'openExplorer',
  'explorerList',
  'explorerGetLeaf',
  'explorerSetLeaf',
  'explorerDuplicateItem',
  'explorerRemoveItem',
  'explorerSearch',
  'explorerUndo',
  'explorerRedo',
  'writeExplorer',
  'closeExplorer',
  'survivalCheck',
  'inventoryContainers',
  'inventoryOpen',
  'inventorySetAmount',
  'inventorySetItem',
  'inventoryFillSlot',
  'inventoryClearSlot',
  'itemSearch',
];

export const API_CHANNEL = 'studio:call';

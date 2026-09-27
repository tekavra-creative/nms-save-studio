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

export interface WriteResultView {
  slot: number;
  file: string;
  name: string;
  snapshot: string;
  bytes: number;
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
];

export const API_CHANNEL = 'studio:call';

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
  knowledge: { technology: number; products: number; words: number; portalGlyphs: number };
  capacity: { ships: number; multitools: number; companions: number };
}

export interface ChangeView {
  id: number;
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Currencies' | 'Knowledge';
  text: string;
  applied: boolean;
}

export interface MergeStateView {
  mergeId: string;
  targetSlot: number;
  sourceSlot: number;
  target: OverviewView;
  source: OverviewView;
  changes: ChangeView[];
  skipped: { group: ChangeView['group']; text: string; reason: string }[];
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
  | { op: 'undo'; mergeId: string }
  | { op: 'redo'; mergeId: string }
  | { op: 'writeMerge'; mergeId: string; name: string }
  | { op: 'closeMerge'; mergeId: string };

export const ENGINE_OPS: readonly EngineRequest['op'][] = [
  'listRoots',
  'listSlots',
  'overview',
  'gameRunning',
  'openMerge',
  'applyChanges',
  'undo',
  'redo',
  'writeMerge',
  'closeMerge',
];

export const API_CHANNEL = 'studio:call';

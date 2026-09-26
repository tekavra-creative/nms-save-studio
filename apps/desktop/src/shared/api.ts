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

export interface StudioApi {
  listRoots(): Promise<SaveRootView[]>;
  listSlots(root: string): Promise<SlotView[]>;
  overview(root: string, slot: number): Promise<OverviewView>;
  gameRunning(): Promise<boolean>;
}

export type EngineRequest =
  | { op: 'listRoots' }
  | { op: 'listSlots'; root: string }
  | { op: 'overview'; root: string; slot: number }
  | { op: 'gameRunning' };

export const API_CHANNEL = 'studio:call';

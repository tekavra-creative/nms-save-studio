import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  EditSession,
  finalizeNewSlot,
  KeyMap,
  planMerge,
  randomUniversalId,
  SaveFile,
  SaveReader,
  slotFile,
  type MappingFile,
  type MergePlan,
} from '@nss/engine';
import { firstEmptySlot, listSlots, writeSlotFile, type SlotEntry } from '@nss/io';
import type { MergeStateView, WriteResultView } from '../shared/api.ts';
import { toOverviewView } from './views.ts';

interface MergeSession {
  id: string;
  root: string;
  targetSlot: number;
  sourceSlot: number;
  target: SaveFile;
  session: EditSession;
  keys: KeyMap;
  source: SaveReader;
  plan: MergePlan;
  /** Plan change indices in the order they were applied (mirrors the undo stack). */
  applied: number[];
  undone: number[];
}

const sessions = new Map<string, MergeSession>();

function open(root: string, e: SlotEntry): SaveFile {
  return new SaveFile(new Uint8Array(readFileSync(join(root, e.ref.dataName))), new Uint8Array(readFileSync(join(root, e.ref.manifestName))), e.ref.manifestSlotIndex);
}

function view(m: MergeSession): MergeStateView {
  const reader = new SaveReader(m.session.doc, m.keys);
  return {
    mergeId: m.id,
    targetSlot: m.targetSlot,
    sourceSlot: m.sourceSlot,
    target: toOverviewView(reader),
    source: toOverviewView(m.source),
    changes: m.plan.changes.map((c, i) => ({ id: i, group: c.group, text: c.text, applied: m.applied.includes(i) })),
    skipped: m.plan.skipped,
    canUndo: m.session.canUndo,
    canRedo: m.session.canRedo,
  };
}

function get(id: string): MergeSession {
  const m = sessions.get(id);
  if (!m) throw new Error('merge session expired — reopen the saves');
  return m;
}

export function openMerge(mapping: MappingFile, root: string, targetSlot: number, sourceSlot: number): MergeStateView {
  const slots = listSlots(root);
  const t = slots[targetSlot - 1]?.latest;
  const s = slots[sourceSlot - 1]?.latest;
  if (!t || !s) throw new Error('both saves must exist');
  if (targetSlot === sourceSlot) throw new Error('pick two different saves');
  const target = open(root, t);
  const sourceSave = open(root, s);
  const keys = KeyMap.forDoc(mapping, target.doc);
  const source = new SaveReader(sourceSave.doc, KeyMap.forDoc(mapping, sourceSave.doc));
  const plan = planMerge(new SaveReader(target.doc, keys), source);
  const id = crypto.randomUUID();
  const m: MergeSession = { id, root, targetSlot, sourceSlot, target, session: new EditSession(target.doc, keys), keys, source, plan, applied: [], undone: [] };
  sessions.set(id, m);
  return view(m);
}

export function applyChanges(id: string, changeIds: number[]): MergeStateView {
  const m = get(id);
  for (const cid of changeIds) {
    if (m.applied.includes(cid)) continue;
    const change = m.plan.changes[cid];
    if (!change) throw new Error(`unknown change ${cid}`);
    m.session.apply(change.op);
    m.applied.push(cid);
    m.undone = [];
  }
  return view(m);
}

export function undo(id: string): MergeStateView {
  const m = get(id);
  if (m.session.undo() !== undefined) m.undone.push(m.applied.pop()!);
  return view(m);
}

export function redo(id: string): MergeStateView {
  const m = get(id);
  if (m.session.redo() !== undefined) m.applied.push(m.undone.pop()!);
  return view(m);
}

export async function writeMerge(id: string, name: string): Promise<WriteResultView> {
  const m = get(id);
  if (!m.applied.length) throw new Error('nothing to write yet');
  const slots = listSlots(m.root);
  const slot = firstEmptySlot(slots);
  if (!slot) throw new Error('every save slot is full — free one in the game first');
  const ref = slotFile(slot, 'auto');
  // finalize on a throwaway session so the user's undo history stays intact
  const scratch = new EditSession(m.session.doc, m.keys);
  const encoded = finalizeNewSlot(m.target, scratch, { target: ref, name: name.trim() || 'Merged save', universalId: randomUniversalId() });
  const snapshotDir = join(homedir(), process.platform === 'darwin' ? 'Library/Application Support/NMS Save Studio/Snapshots' : 'AppData/Roaming/NMS Save Studio/Snapshots');
  const res = await writeSlotFile({ root: m.root, ref, encoded, expect: { data: null, meta: null }, snapshotDir, reason: `merge-${m.sourceSlot}-into-${m.targetSlot}` });
  return { slot, file: ref.dataName, name: name.trim() || 'Merged save', snapshot: res.snapshot, bytes: res.verified.decompressedSize };
}

export function closeMerge(id: string): void {
  sessions.delete(id);
}

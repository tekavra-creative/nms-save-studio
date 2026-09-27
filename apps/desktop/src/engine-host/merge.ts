import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  currencyChange,
  EditSession,
  finalizeNewSlot,
  KeyMap,
  planMerge,
  randomUniversalId,
  SaveFile,
  SaveReader,
  slotFile,
  type ChangeLine,
  type CurrencyField,
  type CurrencyMode,
  type MappingFile,
  type MergePlan,
} from '@nss/engine';
import { firstEmptySlot, listSlots, writeSlotFile, type SlotEntry } from '@nss/io';
import type { ChangeView, MergeStateView, WriteResultView } from '../shared/api.ts';
import { toOverviewView } from './views.ts';

interface State {
  applied: number[];
  modes: Partial<Record<CurrencyField, CurrencyMode>>;
}

interface MergeSession {
  id: string;
  root: string;
  targetSlot: number;
  sourceSlot: number;
  targetTitle: string;
  sourceTitle: string;
  target: SaveFile;
  keys: KeyMap;
  source: SaveReader;
  plan: MergePlan;
  state: State;
  undoStack: State[];
  redoStack: State[];
  session: EditSession;
}

const sessions = new Map<string, MergeSession>();

function open(root: string, e: SlotEntry): SaveFile {
  return new SaveFile(new Uint8Array(readFileSync(join(root, e.ref.dataName))), new Uint8Array(readFileSync(join(root, e.ref.manifestName))), e.ref.manifestSlotIndex);
}

const clone = (s: State): State => ({ applied: [...s.applied], modes: { ...s.modes } });

/** The change as it currently stands (currency lines depend on the chosen mode). */
function lineFor(m: MergeSession, id: number): ChangeLine | undefined {
  const base = m.plan.changes[id];
  if (!base) return undefined;
  if (base.ref.kind !== 'currency') return base;
  const mode = m.state.modes[base.ref.field] ?? base.ref.mode;
  if (mode === base.ref.mode) return base;
  return currencyChange(new SaveReader(m.target.doc, m.keys), m.source, base.ref.field, mode);
}

function rebuild(m: MergeSession): void {
  const session = new EditSession(m.target.doc, m.keys);
  for (const id of m.state.applied) {
    const line = lineFor(m, id);
    if (line) session.apply(line.op);
  }
  m.session = session;
}

function commit(m: MergeSession, next: State): void {
  m.undoStack.push(clone(m.state));
  m.redoStack = [];
  m.state = next;
  rebuild(m);
}

function changeView(m: MergeSession, id: number): ChangeView {
  const base = m.plan.changes[id]!;
  const line = lineFor(m, id);
  const ref = base.ref;
  const mode = ref.kind === 'currency' ? (m.state.modes[ref.field] ?? ref.mode) : undefined;
  return {
    id,
    group: base.group,
    text: line?.text ?? `${base.text.split(':')[0]}: unchanged`,
    applied: m.state.applied.includes(id),
    ref:
      ref.kind === 'asset'
        ? { kind: 'asset', asset: ref.asset, sourceSlot: ref.sourceSlot, targetSlot: ref.targetSlot }
        : ref.kind === 'currency'
          ? {
              kind: 'currency',
              field: ref.field,
              mode: mode!,
              from: ref.from,
              to: line?.ref.kind === 'currency' ? line.ref.to : ref.from,
              source: ref.kind === 'currency' ? String(m.source.num([ref.field], m.source.player) ?? 0) : '0',
              capped: line?.ref.kind === 'currency' ? line.ref.capped : false,
            }
          : { kind: 'knowledge', what: ref.what, count: ref.count },
  };
}

function view(m: MergeSession): MergeStateView {
  return {
    mergeId: m.id,
    targetSlot: m.targetSlot,
    sourceSlot: m.sourceSlot,
    targetTitle: m.targetTitle,
    sourceTitle: m.sourceTitle,
    target: toOverviewView(new SaveReader(m.session.doc, m.keys)),
    targetBefore: toOverviewView(new SaveReader(m.target.doc, m.keys)),
    source: toOverviewView(m.source),
    changes: m.plan.changes.map((_, i) => changeView(m, i)),
    appliedOrder: [...m.state.applied],
    skipped: m.plan.skipped,
    canUndo: m.undoStack.length > 0,
    canRedo: m.redoStack.length > 0,
  };
}

function get(id: string): MergeSession {
  const m = sessions.get(id);
  if (!m) throw new Error('This merge was closed — open the two saves again.');
  return m;
}

export function openMerge(mapping: MappingFile, root: string, targetSlot: number, sourceSlot: number): MergeStateView {
  if (targetSlot === sourceSlot) throw new Error('Pick two different saves.');
  const slots = listSlots(root);
  const t = slots[targetSlot - 1]?.latest;
  const s = slots[sourceSlot - 1]?.latest;
  if (!t || !s) throw new Error('Both saves must exist.');
  const target = open(root, t);
  const sourceSave = open(root, s);
  const keys = KeyMap.forDoc(mapping, target.doc);
  const source = new SaveReader(sourceSave.doc, KeyMap.forDoc(mapping, sourceSave.doc));
  const plan = planMerge(new SaveReader(target.doc, keys), source);
  const title = (e: SlotEntry) => e.manifest?.saveName || e.manifest?.saveSummary || `Slot ${e.ref.slot}`;
  const m: MergeSession = {
    id: crypto.randomUUID(),
    root,
    targetSlot,
    sourceSlot,
    targetTitle: title(t),
    sourceTitle: title(s),
    target,
    keys,
    source,
    plan,
    state: { applied: [], modes: {} },
    undoStack: [],
    redoStack: [],
    session: new EditSession(target.doc, keys),
  };
  sessions.set(m.id, m);
  return view(m);
}

export function applyChanges(id: string, changeIds: number[]): MergeStateView {
  const m = get(id);
  const add = changeIds.filter((c) => m.plan.changes[c] && !m.state.applied.includes(c));
  if (!add.length) return view(m);
  m.undoStack.push(clone(m.state));
  m.redoStack = [];
  for (const c of add) {
    const line = lineFor(m, c);
    if (line) m.session.apply(line.op);
    m.state.applied.push(c);
  }
  return view(m);
}

export function revertChange(id: string, changeId: number): MergeStateView {
  const m = get(id);
  if (!m.state.applied.includes(changeId)) return view(m);
  const next = clone(m.state);
  next.applied = next.applied.filter((c) => c !== changeId);
  commit(m, next);
  return view(m);
}

export function setCurrencyMode(id: string, field: CurrencyField, mode: CurrencyMode): MergeStateView {
  const m = get(id);
  const next = clone(m.state);
  next.modes[field] = mode;
  commit(m, next);
  return view(m);
}

export function undo(id: string): MergeStateView {
  const m = get(id);
  const prev = m.undoStack.pop();
  if (prev) {
    m.redoStack.push(clone(m.state));
    m.state = prev;
    rebuild(m);
  }
  return view(m);
}

export function redo(id: string): MergeStateView {
  const m = get(id);
  const next = m.redoStack.pop();
  if (next) {
    m.undoStack.push(clone(m.state));
    m.state = next;
    rebuild(m);
  }
  return view(m);
}

export async function writeMerge(id: string, name: string): Promise<WriteResultView> {
  const m = get(id);
  if (!m.state.applied.length) throw new Error('Nothing to write yet.');
  const slot = firstEmptySlot(listSlots(m.root));
  if (!slot) throw new Error('Every save slot is full — delete one in the game first.');
  const ref = slotFile(slot, 'auto');
  const finalName = name.trim() || `${m.targetTitle} + ${m.sourceTitle}`.slice(0, 120);
  const scratch = new EditSession(m.session.doc, m.keys);
  const encoded = finalizeNewSlot(m.target, scratch, { target: ref, name: finalName, universalId: randomUniversalId() });
  const base = process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/NMS Save Studio') : join(process.env['APPDATA'] ?? join(homedir(), 'AppData/Roaming'), 'NMS Save Studio');
  const res = await writeSlotFile({ root: m.root, ref, encoded, expect: { data: null, meta: null }, snapshotDir: join(base, 'Snapshots'), reason: `merge-${m.sourceSlot}-into-${m.targetSlot}` });
  return { slot, file: ref.dataName, name: finalName, snapshot: res.snapshot, bytes: res.verified.decompressedSize };
}

export function closeMerge(id: string): void {
  sessions.delete(id);
}

export type SaveKind = 'auto' | 'manual';

export interface SlotFileRef {
  slot: number;
  kind: SaveKind;
  dataName: string;
  manifestName: string;
  manifestSlotIndex: number;
}

export const MAX_SLOTS = 15;

/** Slot N (1-based) ⇒ save(2N−1).hg is Auto, save(2N).hg is Manual; slot 1 uses save.hg/save2.hg. */
export function slotFile(slot: number, kind: SaveKind): SlotFileRef {
  if (slot < 1 || slot > MAX_SLOTS) throw new Error(`slot out of range: ${slot}`);
  const n = (slot - 1) * 2 + (kind === 'auto' ? 1 : 2);
  const dataName = n === 1 ? 'save.hg' : `save${n}.hg`;
  return { slot, kind, dataName, manifestName: `mf_${dataName}`, manifestSlotIndex: n + 1 };
}

export function parseSaveFileName(name: string): SlotFileRef | undefined {
  const m = /^(?:mf_)?save(\d*)\.hg$/i.exec(name);
  if (!m) return undefined;
  const n = m[1] ? Number(m[1]) : 1;
  if (n < 1 || n > MAX_SLOTS * 2) return undefined;
  return slotFile(Math.ceil(n / 2), n % 2 === 1 ? 'auto' : 'manual');
}

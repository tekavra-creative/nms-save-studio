import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_SLOTS, parseManifest, slotFile, type Manifest, type SaveKind, type SlotFileRef } from '@nss/engine';

export interface Fingerprint {
  size: number;
  mtimeMs: number;
  sha256: string;
}

export interface SlotEntry {
  ref: SlotFileRef;
  manifest: Manifest | undefined;
  manifestError?: string;
  data: Fingerprint;
  meta: Fingerprint;
}

export interface SlotInfo {
  slot: number;
  auto?: SlotEntry;
  manual?: SlotEntry;
  /** The file the game loads for this slot: whichever of auto/manual has the newer manifest timestamp. */
  latest?: SlotEntry;
}

export function fingerprint(path: string): Fingerprint {
  const st = statSync(path);
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { size: st.size, mtimeMs: st.mtimeMs, sha256 };
}

function entry(root: string, slot: number, kind: SaveKind): SlotEntry | undefined {
  const ref = slotFile(slot, kind);
  const dataPath = join(root, ref.dataName);
  const metaPath = join(root, ref.manifestName);
  if (!existsSync(dataPath) || !existsSync(metaPath)) return undefined;
  let manifest: Manifest | undefined;
  let manifestError: string | undefined;
  try {
    manifest = parseManifest(new Uint8Array(readFileSync(metaPath)), ref.manifestSlotIndex);
  } catch (e) {
    manifestError = (e as Error).message;
  }
  const out: SlotEntry = { ref, manifest, data: fingerprint(dataPath), meta: fingerprint(metaPath) };
  if (manifestError) out.manifestError = manifestError;
  return out;
}

export function listSlots(root: string): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const auto = entry(root, slot, 'auto');
    const manual = entry(root, slot, 'manual');
    const info: SlotInfo = { slot };
    if (auto) info.auto = auto;
    if (manual) info.manual = manual;
    const ts = (e?: SlotEntry) => e?.manifest?.timestamp ?? -1;
    const latest = ts(auto) >= ts(manual) ? auto ?? manual : manual;
    if (latest) info.latest = latest;
    out.push(info);
  }
  return out;
}

export function firstEmptySlot(slots: SlotInfo[]): number | undefined {
  return slots.find((s) => !s.auto && !s.manual)?.slot;
}

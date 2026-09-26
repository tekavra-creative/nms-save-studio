import { textToBinary } from '../cst/doc.ts';
import { EditSession, setString, batch } from '../edit.ts';
import { KeyMap, type MappingFile } from '../keys/mapping.ts';
import type { EncodedSave, SaveFile } from '../save.ts';
import type { SlotFileRef } from '../slots.ts';

/** SaveUniversalId is the cross-save identity; the manifest stores the same 64-bit value little-endian. */
export function formatUniversalId(id: bigint): string {
  return '0x' + id.toString(16).toUpperCase().padStart(16, '0');
}

export function universalIdBytes(id: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, id, true);
  return out;
}

export function randomUniversalId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): bigint {
  const b = random(8);
  const id = new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0, true);
  return id === 0n ? 1n : id;
}

export interface SlotCopyOptions {
  target: SlotFileRef;
  name: string;
  universalId: bigint;
  now?: number;
}

/**
 * Prepare a copy of `source` for an empty slot: new cross-save identity, new display name,
 * manifest re-keyed for the target file. Pure — the caller writes the result.
 */
export function prepareSlotCopy(source: SaveFile, mapping: MappingFile, opts: SlotCopyOptions): { encoded: EncodedSave; session: EditSession } {
  const keys = KeyMap.forDoc(mapping, source.doc);
  const session = new EditSession(source.doc, keys);
  session.apply(
    batch(`Copy to slot ${opts.target.slot} as “${opts.name}”`, [
      setString('New cross-save identity', ['CommonStateData', 'SaveUniversalId'], formatUniversalId(opts.universalId)),
      setString('Rename save', ['CommonStateData', 'SaveName'], textToBinary(opts.name)),
    ]),
  );
  const encoded = source.encode(session.bytes, {
    manifestSlotIndex: opts.target.manifestSlotIndex,
    patch: {
      saveName: opts.name,
      slotId: universalIdBytes(opts.universalId),
      timestamp: Math.floor((opts.now ?? Date.now()) / 1000),
    },
  });
  return { encoded, session };
}

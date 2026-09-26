import { compressSave, decompressSave, joinPayload, splitPayload } from './codec/chunks.ts';
import { JsonDoc } from './cst/doc.ts';
import { parseManifest, serializeManifest, type Manifest } from './manifest/layout.ts';

export interface EncodedSave {
  data: Uint8Array;
  manifest: Uint8Array;
}

/** One save file (data + manifest) decoded into a lossless document. */
export class SaveFile {
  readonly payload: Uint8Array;
  readonly trailer: Uint8Array;
  readonly doc: JsonDoc;
  readonly manifest: Manifest;
  readonly manifestSlotIndex: number;

  constructor(data: Uint8Array, manifestBytes: Uint8Array, manifestSlotIndex: number) {
    this.manifestSlotIndex = manifestSlotIndex;
    this.payload = decompressSave(data);
    const { json, trailer } = splitPayload(this.payload);
    this.trailer = trailer.length ? trailer.slice() : new Uint8Array([0]);
    this.doc = new JsonDoc(json.slice());
    this.manifest = parseManifest(manifestBytes, manifestSlotIndex);
  }

  /**
   * Encode JSON bytes back into data + manifest for a (possibly different) slot.
   * Manifest sizes are recomputed; callers pass updated display fields via `patch`.
   */
  encode(
    json: Uint8Array = this.doc.bytes,
    target: { manifestSlotIndex?: number; patch?: Partial<Omit<Manifest, 'raw'>> } = {},
  ): EncodedSave {
    const payload = joinPayload(json, this.trailer);
    const data = compressSave(payload);
    const slotIndex = target.manifestSlotIndex ?? this.manifestSlotIndex;
    const m: Manifest = {
      ...this.manifest,
      ...target.patch,
      decompressedSize: payload.length,
      compressedSize: data.length,
      raw: this.manifest.raw,
    };
    return { data, manifest: serializeManifest(m, slotIndex) };
  }
}

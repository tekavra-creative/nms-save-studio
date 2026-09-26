import { decryptManifest, encryptManifest } from './xxtea.ts';

export const MANIFEST_MAGIC = 0xeeeeeebe;
export const MANIFEST_FORMAT_4 = 0x7d4;
export const MANIFEST_SIZE_4 = 432;

const OFF = {
  magic: 0x00,
  format: 0x04,
  decompressedSize: 0x38,
  compressedSize: 0x3c,
  profileHash: 0x40,
  baseVersion: 0x44,
  gameMode: 0x48,
  season: 0x4a,
  totalPlayTime: 0x4c,
  decompressedSize2: 0x54,
  saveName: 0x58,
  saveSummary: 0xd8,
  difficulty: 0x158,
  slotId: 0x15c,
  timestamp: 0x164,
  format2: 0x168,
  difficultyTag: 0x16c,
} as const;

const TEXT_LEN = 128;
const TAG_LEN = 64;

export interface Manifest {
  format: number;
  decompressedSize: number;
  compressedSize: number;
  baseVersion: number;
  gameMode: number;
  season: number;
  totalPlayTime: bigint;
  saveName: string;
  saveSummary: string;
  difficulty: number;
  slotId: Uint8Array;
  timestamp: number;
  difficultyTag: string;
  /** Decrypted bytes as read — fields we do not model are preserved from here on write. */
  raw: Uint8Array;
}

/** File name → manifest encryption slot index (accountdata=1, save.hg=2, saveN.hg=N+1). */
export function manifestSlotIndex(dataFileName: string): number {
  const base = dataFileName.replace(/^mf_/, '').toLowerCase();
  if (base === 'accountdata.hg') return 1;
  if (base === 'save.hg') return 2;
  const m = /^save(\d+)\.hg$/.exec(base);
  if (!m) throw new Error(`not a save file name: ${dataFileName}`);
  return Number(m[1]) + 1;
}

function readCString(bytes: Uint8Array, off: number, len: number): string {
  const slice = bytes.subarray(off, off + len);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end < 0 ? slice : slice.subarray(0, end));
}

/** Rewrites a text field only when its value changed, so bytes after the terminator survive. */
function writeCString(bytes: Uint8Array, off: number, len: number, value: string): void {
  if (readCString(bytes, off, len) === value) return;
  const enc = new TextEncoder().encode(value);
  if (enc.length >= len) throw new Error(`text too long for manifest field (${enc.length} ≥ ${len} bytes)`);
  bytes.fill(0, off, off + len);
  bytes.set(enc, off);
}

export function parseManifest(encrypted: Uint8Array, slotIndex: number): Manifest {
  if (encrypted.length !== MANIFEST_SIZE_4) {
    throw new Error(`unsupported manifest size ${encrypted.length} (expected ${MANIFEST_SIZE_4})`);
  }
  const raw = decryptManifest(encrypted, slotIndex);
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (v.getUint32(OFF.magic, true) !== MANIFEST_MAGIC) {
    throw new Error('manifest did not decrypt (wrong slot index or corrupt file)');
  }
  return {
    format: v.getUint32(OFF.format, true),
    decompressedSize: v.getUint32(OFF.decompressedSize, true),
    compressedSize: v.getUint32(OFF.compressedSize, true),
    baseVersion: v.getUint32(OFF.baseVersion, true),
    gameMode: v.getUint16(OFF.gameMode, true),
    season: v.getUint16(OFF.season, true),
    totalPlayTime: v.getBigUint64(OFF.totalPlayTime, true),
    saveName: readCString(raw, OFF.saveName, TEXT_LEN),
    saveSummary: readCString(raw, OFF.saveSummary, TEXT_LEN),
    difficulty: v.getUint32(OFF.difficulty, true),
    slotId: raw.slice(OFF.slotId, OFF.slotId + 8),
    timestamp: v.getUint32(OFF.timestamp, true),
    difficultyTag: readCString(raw, OFF.difficultyTag, TAG_LEN),
    raw,
  };
}

export function serializeManifest(m: Manifest, slotIndex: number): Uint8Array {
  const raw = m.raw.slice();
  const v = new DataView(raw.buffer);
  v.setUint32(OFF.magic, MANIFEST_MAGIC, true);
  v.setUint32(OFF.format, m.format, true);
  v.setUint32(OFF.decompressedSize, m.decompressedSize, true);
  v.setUint32(OFF.compressedSize, m.compressedSize, true);
  v.setUint32(OFF.baseVersion, m.baseVersion, true);
  v.setUint16(OFF.gameMode, m.gameMode, true);
  v.setUint16(OFF.season, m.season, true);
  v.setBigUint64(OFF.totalPlayTime, m.totalPlayTime, true);
  v.setUint32(OFF.decompressedSize2, m.decompressedSize, true);
  writeCString(raw, OFF.saveName, TEXT_LEN, m.saveName);
  writeCString(raw, OFF.saveSummary, TEXT_LEN, m.saveSummary);
  v.setUint32(OFF.difficulty, m.difficulty, true);
  raw.set(m.slotId.subarray(0, 8), OFF.slotId);
  v.setUint32(OFF.timestamp, m.timestamp, true);
  v.setUint32(OFF.format2, m.format, true);
  writeCString(raw, OFF.difficultyTag, TAG_LEN, m.difficultyTag);
  return encryptManifest(raw, slotIndex);
}

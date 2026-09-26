const DELTA = 0x9e3779b9;
const KEY_SEED = 'NAESEVADNAYRTNRG';

export function manifestKey(slotIndex: number): Uint32Array {
  const seed = new TextEncoder().encode(KEY_SEED);
  const view = new DataView(seed.buffer);
  const key = new Uint32Array(4);
  const x = (slotIndex ^ 0x1422cb8c) >>> 0;
  const rot = ((x << 13) | (x >>> 19)) >>> 0;
  key[0] = (Math.imul(rot, 5) + 0xe6546b64) >>> 0;
  for (let i = 1; i < 4; i++) key[i] = view.getUint32(i * 4, true);
  return key;
}

function mx(sum: number, y: number, z: number, p: number, e: number, k: Uint32Array): number {
  return (((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (k[(p & 3) ^ e]! ^ z))) >>> 0);
}

export function xxteaDecrypt(words: Uint32Array, key: Uint32Array): void {
  const n = words.length;
  let rounds = 6 + Math.floor(52 / n);
  let sum = Math.imul(rounds, DELTA) >>> 0;
  let y = words[0]!;
  let z: number;
  while (rounds-- > 0) {
    const e = (sum >>> 2) & 3;
    let p: number;
    for (p = n - 1; p > 0; p--) {
      z = words[p - 1]!;
      y = words[p] = (words[p]! - mx(sum, y, z, p, e, key)) >>> 0;
    }
    z = words[n - 1]!;
    y = words[0] = (words[0]! - mx(sum, y, z, 0, e, key)) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
}

export function xxteaEncrypt(words: Uint32Array, key: Uint32Array): void {
  const n = words.length;
  let rounds = 6 + Math.floor(52 / n);
  let sum = 0;
  let z = words[n - 1]!;
  let y: number;
  while (rounds-- > 0) {
    sum = (sum + DELTA) >>> 0;
    const e = (sum >>> 2) & 3;
    let p: number;
    for (p = 0; p < n - 1; p++) {
      y = words[p + 1]!;
      z = words[p] = (words[p]! + mx(sum, y, z, p, e, key)) >>> 0;
    }
    y = words[0]!;
    z = words[n - 1] = (words[n - 1]! + mx(sum, y, z, n - 1, e, key)) >>> 0;
  }
}

function toWords(bytes: Uint8Array): Uint32Array {
  if (bytes.length % 4 !== 0) throw new Error('manifest length must be a multiple of 4');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint32(i * 4, true);
  return out;
}

function toBytes(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  words.forEach((w, i) => view.setUint32(i * 4, w, true));
  return out;
}

export function decryptManifest(bytes: Uint8Array, slotIndex: number): Uint8Array {
  const words = toWords(bytes);
  xxteaDecrypt(words, manifestKey(slotIndex));
  return toBytes(words);
}

export function encryptManifest(bytes: Uint8Array, slotIndex: number): Uint8Array {
  const words = toWords(bytes);
  xxteaEncrypt(words, manifestKey(slotIndex));
  return toBytes(words);
}

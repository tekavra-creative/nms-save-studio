// DDS container parsing + block-compressed texture decoding to RGBA8.
//
// Block decoders are a TypeScript port of bcdec by Sergii Kudlai (iOrange/bcdec), used under its MIT
// licence (dual MIT / Unlicense) — see THIRD_PARTY_NOTICES.md. Only the top mip level is decoded.

export class DdsError extends Error {
  override name = 'DdsError';
}

export type DdsFormat = 'BC1' | 'BC2' | 'BC3' | 'BC4' | 'BC5' | 'BC7' | 'RGBA8' | 'BGRA8';

export interface DdsInfo {
  width: number;
  height: number;
  mipCount: number;
  format: DdsFormat;
  srgb: boolean;
  /** FourCC string, or `DX10:<dxgiFormat>`, for diagnostics. */
  source: string;
  /** Byte offset of the top mip's pixel data. */
  dataOffset: number;
  arraySize: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel, straight (non-premultiplied) alpha. */
  data: Uint8Array;
}

const DDS_MAGIC = 0x20534444; // 'DDS '
const HEADER_END = 128;
const DX10_HEADER_SIZE = 20;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;

const fourCC = (s: string): number =>
  (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0;

const FOURCC_FORMATS = new Map<number, DdsFormat>([
  [fourCC('DXT1'), 'BC1'],
  [fourCC('DXT2'), 'BC2'],
  [fourCC('DXT3'), 'BC2'],
  [fourCC('DXT4'), 'BC3'],
  [fourCC('DXT5'), 'BC3'],
  [fourCC('ATI1'), 'BC4'],
  [fourCC('BC4U'), 'BC4'],
  [fourCC('ATI2'), 'BC5'],
  [fourCC('BC5U'), 'BC5'],
]);

// DXGI_FORMAT values → [format, srgb]
const DXGI_FORMATS = new Map<number, [DdsFormat, boolean]>([
  [28, ['RGBA8', false]],
  [29, ['RGBA8', true]],
  [70, ['BC1', false]],
  [71, ['BC1', false]],
  [72, ['BC1', true]],
  [73, ['BC2', false]],
  [74, ['BC2', false]],
  [75, ['BC2', true]],
  [76, ['BC3', false]],
  [77, ['BC3', false]],
  [78, ['BC3', true]],
  [79, ['BC4', false]],
  [80, ['BC4', false]],
  [82, ['BC5', false]],
  [83, ['BC5', false]],
  [87, ['BGRA8', false]],
  [91, ['BGRA8', true]],
  [97, ['BC7', false]],
  [98, ['BC7', false]],
  [99, ['BC7', true]],
]);

const BLOCK_BYTES: Record<DdsFormat, number> = {
  BC1: 8,
  BC2: 16,
  BC3: 16,
  BC4: 8,
  BC5: 16,
  BC7: 16,
  RGBA8: 0,
  BGRA8: 0,
};

export function parseDds(bytes: Uint8Array): DdsInfo {
  if (bytes.length < HEADER_END) throw new DdsError('too small for a DDS header');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== DDS_MAGIC) throw new DdsError('not a DDS file (bad magic)');
  if (v.getUint32(4, true) !== 124) throw new DdsError('bad DDS header size');
  const height = v.getUint32(12, true);
  const width = v.getUint32(16, true);
  const mipCount = Math.max(1, v.getUint32(28, true));
  const pfFlags = v.getUint32(80, true);
  const cc = v.getUint32(84, true);
  const ccText = String.fromCharCode(...bytes.subarray(84, 88));

  if (pfFlags & DDPF_FOURCC) {
    if (ccText === 'DX10') {
      if (bytes.length < HEADER_END + DX10_HEADER_SIZE) throw new DdsError('truncated DX10 header');
      const dxgi = v.getUint32(128, true);
      const known = DXGI_FORMATS.get(dxgi);
      if (!known) throw new DdsError(`unsupported DXGI format ${dxgi}`);
      return {
        width,
        height,
        mipCount,
        format: known[0],
        srgb: known[1],
        source: `DX10:${dxgi}`,
        dataOffset: HEADER_END + DX10_HEADER_SIZE,
        arraySize: Math.max(1, v.getUint32(140, true)),
      };
    }
    const format = FOURCC_FORMATS.get(cc);
    if (!format) throw new DdsError(`unsupported FourCC ${JSON.stringify(ccText)}`);
    return { width, height, mipCount, format, srgb: false, source: ccText, dataOffset: HEADER_END, arraySize: 1 };
  }
  if (pfFlags & DDPF_RGB && v.getUint32(88, true) === 32) {
    const rMask = v.getUint32(92, true);
    const format: DdsFormat | undefined = rMask === 0xff ? 'RGBA8' : rMask === 0xff0000 ? 'BGRA8' : undefined;
    if (format) return { width, height, mipCount, format, srgb: false, source: 'RGB32', dataOffset: HEADER_END, arraySize: 1 };
  }
  throw new DdsError(`unsupported pixel format (flags 0x${pfFlags.toString(16)})`);
}

/** Bytes occupied by the top mip level. */
export function topMipBytes(info: DdsInfo): number {
  const bb = BLOCK_BYTES[info.format];
  if (bb === 0) return info.width * info.height * 4;
  return Math.ceil(info.width / 4) * Math.ceil(info.height / 4) * bb;
}

/** Decode the top mip level of a DDS file to RGBA8. */
export function decodeDds(bytes: Uint8Array): RgbaImage & { info: DdsInfo } {
  const info = parseDds(bytes);
  const need = topMipBytes(info);
  if (info.dataOffset + need > bytes.length) throw new DdsError('truncated pixel data');
  const img = decodeSurface(bytes.subarray(info.dataOffset, info.dataOffset + need), info.width, info.height, info.format);
  return { ...img, info };
}

export function decodeSurface(src: Uint8Array, width: number, height: number, format: DdsFormat): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  if (format === 'RGBA8' || format === 'BGRA8') {
    data.set(src.subarray(0, data.length));
    if (format === 'BGRA8') {
      for (let i = 0; i < data.length; i += 4) {
        const b = data[i]!;
        data[i] = data[i + 2]!;
        data[i + 2] = b;
      }
    }
    return { width, height, data };
  }
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);
  const blockBytes = BLOCK_BYTES[format];
  const tile = new Uint8Array(64); // one decoded 4×4 block, RGBA
  let at = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      decodeBlockRgba(src, at, format, tile);
      at += blockBytes;
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y;
        if (py >= height) break;
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          if (px >= width) break;
          const d = (py * width + px) * 4;
          const s = (y * 4 + x) * 4;
          data[d] = tile[s]!;
          data[d + 1] = tile[s + 1]!;
          data[d + 2] = tile[s + 2]!;
          data[d + 3] = tile[s + 3]!;
        }
      }
    }
  }
  return { width, height, data };
}

/** Decode one compressed block at `src[at]` into `out` (64 bytes: 4×4 RGBA, row-major). */
export function decodeBlockRgba(src: Uint8Array, at: number, format: DdsFormat, out: Uint8Array): void {
  switch (format) {
    case 'BC1':
      colorBlock(src, at, out, false);
      return;
    case 'BC2':
      colorBlock(src, at + 8, out, true);
      sharpAlpha(src, at, out);
      return;
    case 'BC3':
      colorBlock(src, at + 8, out, true);
      smoothAlpha(src, at, out, 3);
      return;
    case 'BC4':
      smoothAlpha(src, at, out, 0);
      for (let i = 0; i < 64; i += 4) {
        out[i + 1] = out[i]!;
        out[i + 2] = out[i]!;
        out[i + 3] = 255;
      }
      return;
    case 'BC5':
      smoothAlpha(src, at, out, 0);
      smoothAlpha(src, at + 8, out, 1);
      for (let i = 0; i < 64; i += 4) {
        out[i + 2] = 0;
        out[i + 3] = 255;
      }
      return;
    case 'BC7':
      bc7Block(src, at, out);
      return;
    default:
      throw new DdsError(`${format} is not block-compressed`);
  }
}

const u16 = (s: Uint8Array, at: number): number => s[at]! | (s[at + 1]! << 8);

// ---- BC1 colour block (also the colour half of BC2/BC3) -------------------------------------------

function colorBlock(src: Uint8Array, at: number, out: Uint8Array, onlyOpaque: boolean): void {
  const c0 = u16(src, at);
  const c1 = u16(src, at + 2);
  const r0 = (c0 >> 11) & 0x1f;
  const g0 = (c0 >> 5) & 0x3f;
  const b0 = c0 & 0x1f;
  const r1 = (c1 >> 11) & 0x1f;
  const g1 = (c1 >> 5) & 0x3f;
  const b1 = c1 & 0x1f;
  // palette as 4 × [r, g, b, a]
  const p = [
    (r0 * 527 + 23) >> 6, (g0 * 259 + 33) >> 6, (b0 * 527 + 23) >> 6, 255,
    (r1 * 527 + 23) >> 6, (g1 * 259 + 33) >> 6, (b1 * 527 + 23) >> 6, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
  ];
  if (c0 > c1 || onlyOpaque) {
    p[8] = ((2 * r0 + r1) * 351 + 61) >> 7;
    p[9] = ((2 * g0 + g1) * 2763 + 1039) >> 11;
    p[10] = ((2 * b0 + b1) * 351 + 61) >> 7;
    p[12] = ((r0 + r1 * 2) * 351 + 61) >> 7;
    p[13] = ((g0 + g1 * 2) * 2763 + 1039) >> 11;
    p[14] = ((b0 + b1 * 2) * 351 + 61) >> 7;
  } else {
    p[8] = ((r0 + r1) * 1053 + 125) >> 8;
    p[9] = ((g0 + g1) * 4145 + 1019) >> 11;
    p[10] = ((b0 + b1) * 1053 + 125) >> 8;
    p[15] = 0; // transparent black
  }
  let idx = (src[at + 4]! | (src[at + 5]! << 8) | (src[at + 6]! << 16) | (src[at + 7]! << 24)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const c = (idx & 3) * 4;
    idx >>>= 2;
    const o = i * 4;
    out[o] = p[c]!;
    out[o + 1] = p[c + 1]!;
    out[o + 2] = p[c + 2]!;
    out[o + 3] = p[c + 3]!;
  }
}

// ---- BC2 explicit 4-bit alpha --------------------------------------------------------------------

function sharpAlpha(src: Uint8Array, at: number, out: Uint8Array): void {
  for (let row = 0; row < 4; row++) {
    const a = u16(src, at + row * 2);
    for (let x = 0; x < 4; x++) out[(row * 4 + x) * 4 + 3] = ((a >> (4 * x)) & 0x0f) * 17;
  }
}

// ---- BC3 alpha / BC4 / BC5 channel: 2 endpoints + 16 × 3-bit indices -----------------------------

function smoothAlpha(src: Uint8Array, at: number, out: Uint8Array, channel: number): void {
  const a0 = src[at]!;
  const a1 = src[at + 1]!;
  const pal = [a0, a1, 0, 0, 0, 0, 0, 0];
  if (a0 > a1) {
    for (let k = 1; k <= 6; k++) pal[k + 1] = Math.trunc(((7 - k) * a0 + k * a1) / 7);
  } else {
    for (let k = 1; k <= 4; k++) pal[k + 1] = Math.trunc(((5 - k) * a0 + k * a1) / 5);
    pal[6] = 0;
    pal[7] = 255;
  }
  // 48 bits of indices: split into two 24-bit halves to stay within 32-bit integer maths.
  let lo = src[at + 2]! | (src[at + 3]! << 8) | (src[at + 4]! << 16);
  let hi = src[at + 5]! | (src[at + 6]! << 8) | (src[at + 7]! << 16);
  for (let i = 0; i < 16; i++) {
    let sel: number;
    if (i < 8) {
      sel = lo & 7;
      lo >>= 3;
    } else {
      sel = hi & 7;
      hi >>= 3;
    }
    out[i * 4 + channel] = pal[sel]!;
  }
}

// ---- BC7 ------------------------------------------------------------------------------------------

// Partition shapes, one string per partition, one char per texel (row-major). The digit is the
// subset; a letter marks that subset's anchor ("fix-up") texel: a = subset 0, b = 1, c = 2.
// Values from the BC7 specification, transcribed from bcdec's tables.
const P2 = [
  'a01100110011001b', 'a00100010001000b', 'a11101110111011b', 'a00100110011011b',
  'a00000010001001b', 'a01101110111111b', 'a00100110111111b', 'a00000010011011b',
  'a00000000001001b', 'a01101111111111b', 'a00000010111111b', 'a00000000001011b',
  'a00101111111111b', 'a00000001111111b', 'a00011111111111b', 'a00000000000111b',
  'a00010001110111b', 'a1b1000100000000', 'a0000000b0001110', 'a1b1001100010000',
  'a0b1000100000000', 'a0001000b1001110', 'a0000000b0001100', 'a11100110011000b',
  'a0b1000100010000', 'a0001000b0001100', 'a1b0011001100110', 'a0b1011001101100',
  'a0010111b1101000', 'a0001111b1110000', 'a1b1000110001110', 'a0b1100110011100',
  'a10101010101010b', 'a00011110000111b', 'a10110b001011010', 'a0110011b1001100',
  'a0b1110000111100', 'a1010101b0101010', 'a11010010110100b', 'a10110101010010b',
  'a1b1001111001110', 'a0010011b1001000', 'a0b1001001001100', 'a0b1101111011100',
  'a1b0100110010110', 'a01111001100001b', 'a11001101001100b', 'a00001b001100000',
  'a10011b001000000', 'a0b0011100100000', 'a00000b001110010', 'a0000100b1100100',
  'a11011001001001b', 'a01101101100100b', 'a1b0001110011100', 'a0b1100111000110',
  'a11011001100100b', 'a11000110011100b', 'a11111101000000b', 'a00110001110011b',
  'a00011110011001b', 'a0b1001111110000', 'a0b0001011101110', 'a10001000111011b',
];
const P3 = [
  'a01b00110221222c', 'a00b0011c2112221', 'a0002001c211221b', 'a22c00220011011b',
  'a0000000b122112c', 'a01b00110022002c', 'a02c00221111111b', 'a0110011c211221b',
  'a0000000b111222c', 'a0001111b111222c', 'a00011b12222222c', 'a01200b20012001c',
  'a11201b20112011c', 'a1220b220122012c', 'a01b01121122122c', 'a01b2001c2002220',
  'a00b00110112112c', 'a11b0011c0012200', 'a0001122b122112c', 'a02c00220022111b',
  'a11b01110222022c', 'a00b0001c2212221', 'a00000b10122012c', 'a0001100c2b02210',
  'a12c0b2200110000', 'a0120012b122222c', 'a11012c1b2210110', 'a00001b012c11221',
  'a0221102b102002c', 'a1100b102002222c', 'a011012201c2001b', 'a0002000c211222b',
  'a0000002b122122c', 'a22c00220012001b', 'a01b00120022022c', 'a1200b2001c00120',
  'a00011b122c20000', 'a1201201c0b20120', 'a1202012bc010120', 'a011220011c2001b',
  'a01111c22200001b', 'a10b01012222222c', 'a0000000c121212b', 'a0221b220022112c',
  'a02c00110022001b', 'a22012c10220122b', 'a10122c22222010b', 'a0002121c121212b',
  'a10b01010101222c', 'a22c01110222011b', 'a0021b120002111c', 'a0002b122112211c',
  'a2220b110111022c', 'a0021112b112000c', 'a1100b100110222c', 'a000000021b2211c',
  'a1100b102222222c', 'a022001100b1002c', 'a0221122b122002c', 'a000000000002b1c',
  'a00c00010002000b', 'a22212220222b22c', 'a10b22222222222c', 'a11b2011c2012220',
];
const P1 = 'a000000000000000';

const W2 = [0, 21, 43, 64];
const W3 = [0, 9, 18, 27, 37, 46, 55, 64];
const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const COLOR_BITS = [4, 6, 5, 7, 5, 7, 7, 5];
const ALPHA_BITS = [0, 0, 0, 0, 6, 8, 7, 5];
const MODE_HAS_PBITS = 0b11001011;

const lerp = (a: number, b: number, w: number[], i: number): number => (a * (64 - w[i]!) + b * w[i]! + 32) >> 6;

function subsetAt(shape: string, i: number): number {
  const c = shape.charCodeAt(i);
  return c >= 97 ? c - 97 : c - 48;
}
const isAnchor = (shape: string, i: number): boolean => shape.charCodeAt(i) >= 97;

function bc7Block(src: Uint8Array, at: number, out: Uint8Array): void {
  let pos = 0; // bit cursor within the 128-bit little-endian block
  const bits = (n: number): number => {
    const byte = at + (pos >>> 3);
    const word = (src[byte] ?? 0) | ((src[byte + 1] ?? 0) << 8) | ((src[byte + 2] ?? 0) << 16);
    const v = (word >>> (pos & 7)) & ((1 << n) - 1);
    pos += n;
    return v;
  };

  let mode = 0;
  while (mode < 8 && bits(1) === 0) mode++;
  if (mode >= 8) {
    out.fill(0);
    return;
  }

  let numPartitions = 1;
  let partition = 0;
  if (mode === 0 || mode === 1 || mode === 2 || mode === 3 || mode === 7) {
    numPartitions = mode === 0 || mode === 2 ? 3 : 2;
    partition = bits(mode === 0 ? 4 : 6);
  }
  const numEndpoints = numPartitions * 2;
  let rotation = 0;
  let indexSelection = 0;
  if (mode === 4 || mode === 5) {
    rotation = bits(2);
    if (mode === 4) indexSelection = bits(1);
  }

  const ep: number[][] = [];
  for (let j = 0; j < numEndpoints; j++) ep.push([0, 0, 0, 0]);
  for (let c = 0; c < 3; c++) for (let j = 0; j < numEndpoints; j++) ep[j]![c] = bits(COLOR_BITS[mode]!);
  if (ALPHA_BITS[mode]! > 0) for (let j = 0; j < numEndpoints; j++) ep[j]![3] = bits(ALPHA_BITS[mode]!);

  const hasP = (MODE_HAS_PBITS >> mode) & 1;
  if (mode === 0 || mode === 1 || mode === 3 || mode === 6 || mode === 7) {
    for (const e of ep) for (let c = 0; c < 4; c++) e[c]! <<= 1;
    if (mode === 1) {
      const p0 = bits(1);
      const p1 = bits(1);
      for (let c = 0; c < 3; c++) {
        ep[0]![c]! |= p0;
        ep[1]![c]! |= p0;
        ep[2]![c]! |= p1;
        ep[3]![c]! |= p1;
      }
    } else if (hasP) {
      for (const e of ep) {
        const p = bits(1);
        for (let c = 0; c < 4; c++) e[c]! |= p;
      }
    }
  }
  for (const e of ep) {
    let prec = COLOR_BITS[mode]! + hasP;
    for (let c = 0; c < 3; c++) {
      e[c] = e[c]! << (8 - prec);
      e[c] = e[c]! | (e[c]! >> prec);
    }
    prec = ALPHA_BITS[mode]! + hasP;
    e[3] = e[3]! << (8 - prec);
    e[3] = e[3]! | (e[3]! >> prec);
    if (!ALPHA_BITS[mode]) e[3] = 0xff;
  }

  const indexBits = mode === 0 || mode === 1 ? 3 : mode === 6 ? 4 : 2;
  const indexBits2 = mode === 4 ? 3 : mode === 5 ? 2 : 0;
  const w1 = indexBits === 2 ? W2 : indexBits === 3 ? W3 : W4;
  const w2 = indexBits2 === 2 ? W2 : W3;
  const shape = numPartitions === 1 ? P1 : numPartitions === 2 ? P2[partition]! : P3[partition]!;

  const idx = new Array<number>(16);
  for (let i = 0; i < 16; i++) idx[i] = bits(isAnchor(shape, i) ? indexBits - 1 : indexBits);

  for (let i = 0; i < 16; i++) {
    const s = subsetAt(shape, i);
    const e0 = ep[s * 2]!;
    const e1 = ep[s * 2 + 1]!;
    const index = idx[i]!;
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    if (!indexBits2) {
      r = lerp(e0[0]!, e1[0]!, w1, index);
      g = lerp(e0[1]!, e1[1]!, w1, index);
      b = lerp(e0[2]!, e1[2]!, w1, index);
      a = lerp(e0[3]!, e1[3]!, w1, index);
    } else {
      const index2 = bits(i === 0 ? indexBits2 - 1 : indexBits2);
      if (!indexSelection) {
        r = lerp(e0[0]!, e1[0]!, w1, index);
        g = lerp(e0[1]!, e1[1]!, w1, index);
        b = lerp(e0[2]!, e1[2]!, w1, index);
        a = lerp(e0[3]!, e1[3]!, w2, index2);
      } else {
        r = lerp(e0[0]!, e1[0]!, w2, index2);
        g = lerp(e0[1]!, e1[1]!, w2, index2);
        b = lerp(e0[2]!, e1[2]!, w2, index2);
        a = lerp(e0[3]!, e1[3]!, w1, index);
      }
    }
    if (rotation === 1) [a, r] = [r, a];
    else if (rotation === 2) [a, g] = [g, a];
    else if (rotation === 3) [a, b] = [b, a];
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
}

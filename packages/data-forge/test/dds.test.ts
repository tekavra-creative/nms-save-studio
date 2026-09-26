import { describe, expect, it } from 'vitest';
import { decodeBlockRgba, decodeDds, DdsError, parseDds } from '../src/dds.ts';
import { bitWriter, buildDds } from './synthetic.ts';

const px = (out: Uint8Array, i: number) => [...out.subarray(i * 4, i * 4 + 4)];
const RED565 = [0x00, 0xf8]; // 0xF800 little-endian
const BLUE565 = [0x1f, 0x00]; // 0x001F
const GREEN565 = [0xe0, 0x07]; // 0x07E0

// Row r uses palette index r for all four texels: 0x00, 0x55, 0xAA, 0xFF.
const ROW_INDICES = [0x00, 0x55, 0xaa, 0xff];

describe('BC1', () => {
  it('decodes the 4-colour palette (c0 > c1) with exact interpolation', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([...RED565, ...BLUE565, ...ROW_INDICES]), 0, 'BC1', out);
    expect(px(out, 0)).toEqual([255, 0, 0, 255]);
    expect(px(out, 4)).toEqual([0, 0, 255, 255]);
    expect(px(out, 8)).toEqual([170, 0, 85, 255]); // 2/3 red + 1/3 blue
    expect(px(out, 12)).toEqual([85, 0, 170, 255]);
    expect(px(out, 15)).toEqual([85, 0, 170, 255]);
  });

  it('decodes the 3-colour + transparent palette (c0 <= c1)', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([...BLUE565, ...RED565, ...ROW_INDICES]), 0, 'BC1', out);
    expect(px(out, 0)).toEqual([0, 0, 255, 255]);
    expect(px(out, 4)).toEqual([255, 0, 0, 255]);
    expect(px(out, 8)).toEqual([128, 0, 128, 255]); // midpoint
    expect(px(out, 12)).toEqual([0, 0, 0, 0]); // transparent black
  });

  it('expands 565 green to full 255', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([...GREEN565, 0, 0, 0, 0, 0, 0]), 0, 'BC1', out);
    expect(px(out, 0)).toEqual([0, 255, 0, 255]);
  });
});

describe('BC3 / BC4 / BC5', () => {
  // alpha endpoints 255, 0 → 8-value palette; texel i gets palette index (i & 7).
  // 3-bit indices 0..7,0..7 packed LSB-first: 0b111_110_101_100_011_010_001_000 = 0xFAC688 per 8 texels.
  const ALPHA = [255, 0, 0x88, 0xc6, 0xfa, 0x88, 0xc6, 0xfa];
  const RAMP = [255, 0, 218, 182, 145, 109, 72, 36];

  it('BC3 interpolates alpha and keeps colour opaque-mode', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([...ALPHA, ...BLUE565, ...RED565, 0, 0, 0, 0]), 0, 'BC3', out);
    for (let i = 0; i < 16; i++) expect(out[i * 4 + 3]).toBe(RAMP[i & 7]);
    expect(px(out, 0).slice(0, 3)).toEqual([0, 0, 255]); // BC3 never uses the BC1 transparent mode
  });

  it('BC3 uses the 6-value alpha palette with 0/255 extremes when a0 <= a1', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([0, 255, 0x88, 0xc6, 0xfa, 0x88, 0xc6, 0xfa, 0, 0, 0, 0, 0, 0, 0, 0]), 0, 'BC3', out);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => out[i * 4 + 3])).toEqual([0, 255, 51, 102, 153, 204, 0, 255]);
  });

  it('BC4 decodes a single channel to grey', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array(ALPHA), 0, 'BC4', out);
    expect(px(out, 2)).toEqual([218, 218, 218, 255]);
  });

  it('BC5 decodes two independent channels into R and G', () => {
    const out = new Uint8Array(64);
    decodeBlockRgba(new Uint8Array([...ALPHA, 10, 10, 0, 0, 0, 0, 0, 0]), 0, 'BC5', out);
    expect(px(out, 1)).toEqual([0, 10, 0, 255]);
  });
});

/** BC7 mode 6: 1 subset, 7-bit RGBA endpoints + 1 p-bit each, 4-bit indices (anchor texel 0 has 3). */
function bc7Mode6(e0: number[], e1: number[], p0: number, p1: number, indices: number[]): Uint8Array {
  const w = bitWriter();
  w.put(1 << 6, 7); // mode 6
  for (let c = 0; c < 4; c++) {
    w.put(e0[c]!, 7);
    w.put(e1[c]!, 7);
  }
  w.put(p0, 1);
  w.put(p1, 1);
  indices.forEach((ix, i) => w.put(ix, i === 0 ? 3 : 4));
  return w.bytes();
}

describe('BC7', () => {
  it('decodes a mode 6 block (endpoints, p-bits, 4-bit weights)', () => {
    const indices = new Array<number>(16).fill(0);
    indices[5] = 8;
    indices[15] = 15;
    const out = new Uint8Array(64);
    decodeBlockRgba(bc7Mode6([127, 0, 0, 127], [0, 0, 127, 127], 1, 0, indices), 0, 'BC7', out);
    expect(px(out, 0)).toEqual([255, 1, 1, 255]);
    expect(px(out, 15)).toEqual([0, 0, 254, 254]);
    // weight[8] = 34: (a*30 + b*34 + 32) >> 6
    expect(px(out, 5)).toEqual([120, 0, 135, 254]);
  });

  it('treats a reserved mode byte as transparent black', () => {
    const out = new Uint8Array(64).fill(9);
    decodeBlockRgba(new Uint8Array(16), 0, 'BC7', out);
    expect(out.every((b) => b === 0)).toBe(true);
  });
});

describe('DDS container', () => {
  it('parses a legacy DXT1 header and crops non-multiple-of-4 sizes', () => {
    const block = [...RED565, ...BLUE565, 0, 0, 0, 0];
    const dds = buildDds(5, 3, new Uint8Array([...block, ...block]), 'DXT1');
    const img = decodeDds(dds);
    expect(img.info).toMatchObject({ format: 'BC1', width: 5, height: 3, source: 'DXT1', dataOffset: 128 });
    expect(img.data.length).toBe(5 * 3 * 4);
    expect([...img.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('parses a DX10 header (BC7 UNORM_SRGB)', () => {
    const dds = buildDds(4, 4, bc7Mode6([127, 127, 127, 127], [0, 0, 0, 0], 1, 0, new Array(16).fill(0)), 'DX10', 99);
    const info = parseDds(dds);
    expect(info).toMatchObject({ format: 'BC7', srgb: true, source: 'DX10:99', dataOffset: 148 });
    expect([...decodeDds(dds).data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('rejects bad magic, unknown formats and truncated data', () => {
    expect(() => parseDds(new Uint8Array(128))).toThrow(DdsError);
    expect(() => parseDds(buildDds(4, 4, new Uint8Array(8), 'ZZZZ'))).toThrow(/FourCC/);
    expect(() => decodeDds(buildDds(8, 8, new Uint8Array(8), 'DXT1'))).toThrow(/truncated/);
  });
});

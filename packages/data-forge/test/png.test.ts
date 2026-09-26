import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/png.ts';

describe('png', () => {
  it('writes a valid RGBA8 PNG whose IDAT inflates back to the pixels', () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40]);
    const png = encodePng(2, 2, rgba);
    const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const chunks: { type: string; body: Uint8Array }[] = [];
    for (let at = 8; at < png.length; ) {
      const len = v.getUint32(at);
      const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
      const body = png.subarray(at + 8, at + 8 + len);
      expect(v.getUint32(at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)) >>> 0);
      chunks.push({ type, body });
      at += 12 + len;
    }
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = new DataView(chunks[0]!.body.buffer, chunks[0]!.body.byteOffset, 13);
    expect([ihdr.getUint32(0), ihdr.getUint32(4), ihdr.getUint8(8), ihdr.getUint8(9)]).toEqual([2, 2, 8, 6]);

    const raw = new Uint8Array(inflateSync(chunks[1]!.body));
    expect([...raw]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
  });

  it('rejects a buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow();
  });
});

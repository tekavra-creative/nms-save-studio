import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applySplices,
  bytesToBinary,
  binaryToBytes,
  compressSave,
  decodeBlock,
  decompressSave,
  decryptManifest,
  encodeBlock,
  encodeJsonString,
  encryptManifest,
  invertSplices,
  JsonDoc,
  Kind,
  unescapeJsonString,
} from '../src/index.ts';

const eq = (a: Uint8Array, b: Uint8Array) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

describe('lz4', () => {
  it('round-trips arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 5000 }), (src) => eq(decodeBlock(encodeBlock(src), src.length), src)),
      { numRuns: 300 },
    );
  });
  it('round-trips repetitive bytes (exercises long matches and overlap copies)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 3000 }), (unit, reps) => {
        const src = new Uint8Array(unit.length * reps);
        for (let i = 0; i < reps; i++) src.set(unit, i * unit.length);
        return eq(decodeBlock(encodeBlock(src), src.length), src);
      }),
      { numRuns: 200 },
    );
  });
  it('chunks payloads across the 512 KiB boundary', () => {
    const big = new Uint8Array(0x80000 * 2 + 1234).map((_, i) => (i * 31) & 0x7f);
    expect(eq(decompressSave(compressSave(big)), big)).toBe(true);
  });
});

describe('xxtea manifest', () => {
  it('encrypt/decrypt are inverse for any 432-byte block and slot', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 432, maxLength: 432 }), fc.integer({ min: 1, max: 31 }), (b, slot) =>
        eq(decryptManifest(encryptManifest(b, slot), slot), b),
      ),
      { numRuns: 100 },
    );
  });
});

// JSON with raw high bytes inside strings, integer-like keys and big integers.
const rawString = fc
  .uint8Array({ maxLength: 12 })
  .map((b) => encodeJsonString(bytesToBinary(b)));
const bigNumber = fc
  .oneof(fc.bigInt({ min: -(2n ** 64n), max: 2n ** 64n }).map(String), fc.double({ noNaN: true, noDefaultInfinity: true }).map(String))
  .map((s) => binaryToBytes(s));
const leaf = fc.oneof(rawString, bigNumber, fc.constantFrom('true', 'false', 'null').map(binaryToBytes));
const join = (parts: Uint8Array[], sep: string) => {
  const out: number[] = [];
  parts.forEach((p, i) => {
    if (i) out.push(sep.charCodeAt(0));
    out.push(...p);
  });
  return Uint8Array.from(out);
};
const { json } = fc.letrec((tie) => ({
  json: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leaf, tie('arr'), tie('obj')),
  arr: fc.array(tie('json') as fc.Arbitrary<Uint8Array>, { maxLength: 5 }).map((xs) =>
    Uint8Array.from([0x5b, ...join(xs, ','), 0x5d]),
  ),
  obj: fc
    .array(fc.tuple(fc.oneof(rawString, fc.nat(99).map((n) => encodeJsonString(String(n)))), tie('json') as fc.Arbitrary<Uint8Array>), {
      maxLength: 5,
    })
    .map((kvs) => Uint8Array.from([0x7b, ...join(kvs.map(([k, v]) => Uint8Array.from([...k, 0x3a, ...v])), ','), 0x7d])),
}));

describe('lossless document', () => {
  it('scans random JSON with raw bytes and covers every byte', () => {
    fc.assert(
      fc.property(json as fc.Arbitrary<Uint8Array>, (bytes) => {
        const doc = new JsonDoc(bytes);
        return doc.tree.start[0] === 0 && doc.tree.end[0] === bytes.length;
      }),
      { numRuns: 400 },
    );
  });

  it('string decode/encode is lossless for every byte value', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (b) => {
        const bin = bytesToBinary(b);
        const lit = encodeJsonString(bin);
        return unescapeJsonString(lit.subarray(1, lit.length - 1)) === bin;
      }),
    );
  });

  it('big integers keep full precision', () => {
    const doc = new JsonDoc(binaryToBytes('{"a":18446744073709551615,"b":-9007199254740993,"c":1.50}'));
    expect(doc.number(doc.child(0, 'a'))).toBe(18446744073709551615n);
    expect(doc.number(doc.child(0, 'b'))).toBe(-9007199254740993n);
    expect(doc.raw(doc.child(0, 'c'))).toBe('1.50');
    expect(doc.kind(doc.child(0, 'c'))).toBe(Kind.Number);
  });

  it('splices then inverse splices restore the original bytes', () => {
    fc.assert(
      fc.property(json as fc.Arbitrary<Uint8Array>, fc.uint8Array({ maxLength: 20 }), (bytes, repl) => {
        const doc = new JsonDoc(bytes);
        const target = doc.tree.count > 1 ? 1 : 0;
        const s = [{ start: doc.tree.start[target]!, end: doc.tree.end[target]!, bytes: repl }];
        const after = applySplices(bytes, s);
        return eq(applySplices(after, invertSplices(bytes, s)), bytes);
      }),
      { numRuns: 300 },
    );
  });
});

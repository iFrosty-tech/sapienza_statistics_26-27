/**
 * SHA-256 against the FIPS 180-4 / NIST example vectors, and the byte helpers
 * the hash experiments rely on.
 *
 * Vectors: NIST, "Descriptions of SHA-256, SHA-384, and SHA-512" examples
 * (https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines/example-values),
 * also reproduced in RFC 6234, section 8.5.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, sha256Hex } from '../src/lib/sha256.js';
import {
  bytesToHex,
  hexToBytes,
  utf8Bytes,
  hammingWeight,
  hammingDistance,
  bitAt,
  flipBit,
  bytesToBigInt,
  bigIntToBytes,
} from '../src/lib/bytes.js';

test('sha256 of the empty message', () => {
  assert.equal(sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('sha256("abc")', () => {
  assert.equal(sha256Hex(utf8Bytes('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('sha256 of the two-block NIST message', () => {
  assert.equal(
    sha256Hex(utf8Bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('sha256 of one million "a"', () => {
  const million = new Uint8Array(1_000_000).fill(0x61);
  assert.equal(sha256Hex(million), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('sha256 handles the padding boundary (55, 56, 63, 64 byte messages)', () => {
  // Reference values computed with Node's crypto module; they pin the padding
  // rules where a message either fits in one block or forces a second one.
  const { createHash } = require_crypto();
  for (const len of [55, 56, 63, 64, 65, 119, 120]) {
    const m = new Uint8Array(len).map((_, i) => i & 0xff);
    const expected = createHash('sha256').update(m).digest('hex');
    assert.equal(sha256Hex(m), expected, `length ${len}`);
  }
});

function require_crypto() {
  // node:crypto is only used here, to cross-check the from-scratch implementation.
  return process.getBuiltinModule('node:crypto');
}

test('sha256 returns a fresh 32-byte Uint8Array', () => {
  const d = sha256(utf8Bytes('abc'));
  assert.ok(d instanceof Uint8Array);
  assert.equal(d.length, 32);
  assert.equal(bytesToHex(d), sha256Hex(utf8Bytes('abc')));
});

test('hex helpers round-trip and reject odd input', () => {
  const bytes = hexToBytes('00ff10AB');
  assert.deepEqual([...bytes], [0, 255, 16, 171]);
  assert.equal(bytesToHex(bytes), '00ff10ab');
  assert.throws(() => hexToBytes('abc'));
  assert.throws(() => hexToBytes('zz'));
});

test('utf8Bytes encodes multi-byte characters', () => {
  assert.deepEqual([...utf8Bytes('é')], [0xc3, 0xa9]);
});

test('Hamming weight and distance', () => {
  assert.equal(hammingWeight(new Uint8Array([0b10110000, 0xff, 0])), 11);
  assert.equal(hammingDistance(new Uint8Array([0xff, 0x00]), new Uint8Array([0x0f, 0x01])), 5);
  assert.throws(() => hammingDistance(new Uint8Array(1), new Uint8Array(2)));
});

test('bit indexing is little-endian within each byte', () => {
  const b = new Uint8Array([0b00000001, 0b10000000]);
  assert.equal(bitAt(b, 0), 1);
  assert.equal(bitAt(b, 1), 0);
  assert.equal(bitAt(b, 15), 1);
  const flipped = flipBit(b, 15);
  assert.equal(bitAt(flipped, 15), 0);
  assert.equal(bitAt(b, 15), 1, 'flipBit must not mutate its input');
});

test('big-integer conversions in both byte orders', () => {
  const be = bigIntToBytes(0x0102n, 4, 'be');
  assert.deepEqual([...be], [0, 0, 1, 2]);
  const le = bigIntToBytes(0x0102n, 4, 'le');
  assert.deepEqual([...le], [2, 1, 0, 0]);
  assert.equal(bytesToBigInt(be, 'be'), 0x0102n);
  assert.equal(bytesToBigInt(le, 'le'), 0x0102n);
  assert.throws(() => bigIntToBytes(0x1ffn, 1, 'be'), /fit/);
});

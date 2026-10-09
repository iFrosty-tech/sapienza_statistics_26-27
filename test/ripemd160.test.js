/**
 * RIPEMD-160 against the test vectors published by its designers, and a
 * cross-check against node:crypto on seeded random inputs.
 *
 * Vectors: A. Bosselaers, "The hash function RIPEMD-160", test-vector table
 * (https://homes.esat.kuleuven.be/~bosselae/ripemd160.html).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ripemd160, ripemd160Hex } from '../src/lib/ripemd160.js';
import { utf8Bytes } from '../src/lib/bytes.js';
import { createRandom } from '../src/lib/random.js';

const VECTORS = [
  ['', '9c1185a5c5e9fc54612808977ee8f548b2258d31'],
  ['a', '0bdc9d2d256b3ee9daae347be6f4dc835a467ffe'],
  ['abc', '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc'],
  ['message digest', '5d0689ef49d2fae572b881b123a85ffa21595f36'],
  ['abcdefghijklmnopqrstuvwxyz', 'f71c27109c692c1b56bbdceb5b9d2865b3708dbc'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '12a053384a9c0c88e405a06c27dcf49ada62eb2b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'b0e20b6e3116640286ed3a87a5713079b21f5189'],
  ['1234567890'.repeat(8), '9b752e45573d4b39f4dbd3323cab82bf63326bfb'],
];

for (const [message, digest] of VECTORS) {
  test(`ripemd160(${JSON.stringify(message.length > 20 ? `${message.slice(0, 17)}...` : message)})`, () => {
    assert.equal(ripemd160Hex(utf8Bytes(message)), digest);
  });
}

test('ripemd160 of one million "a"', () => {
  assert.equal(ripemd160Hex(new Uint8Array(1_000_000).fill(0x61)), '52783243c1697bdbe16d37f97f68f08325dc1528');
});

test('ripemd160 agrees with node:crypto across the padding boundaries', () => {
  const rnd = createRandom(160);
  for (const length of [0, 1, 33, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const message = rnd.bytes(length);
    assert.equal(ripemd160Hex(message), createHash('ripemd160').update(message).digest('hex'), `length ${length}`);
  }
  assert.equal(ripemd160(new Uint8Array(0)).length, 20);
});

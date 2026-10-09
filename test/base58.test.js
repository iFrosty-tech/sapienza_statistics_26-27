/**
 * Base58 and Base58Check.
 *
 * Vectors: Bitcoin Core, src/test/data/base58_encode_decode.json
 * (https://raw.githubusercontent.com/bitcoin/bitcoin/master/src/test/data/base58_encode_decode.json),
 * stored unmodified in test/fixtures/base58-encode-decode.json. Base58Check is
 * further exercised by every extended key of the BIP-32 vectors (bip32.test.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASE58_ALPHABET,
  base58Encode,
  base58Decode,
  base58CheckEncode,
  base58CheckDecode,
} from '../src/lib/base58.js';
import { bytesToHex, hexToBytes } from '../src/lib/bytes.js';
import { sha256 } from '../src/lib/sha256.js';
import { createRandom } from '../src/lib/random.js';

const VECTORS = JSON.parse(readFileSync(new URL('./fixtures/base58-encode-decode.json', import.meta.url), 'utf8'));

test('the alphabet omits 0, O, I and l', () => {
  assert.equal(BASE58_ALPHABET.length, 58);
  for (const c of '0OIl') assert.equal(BASE58_ALPHABET.includes(c), false);
});

test('Bitcoin Core base58 encode/decode vectors', () => {
  assert.equal(VECTORS.length, 21);
  for (const [hex, encoded] of VECTORS) {
    assert.equal(base58Encode(hexToBytes(hex)), encoded, hex);
    assert.equal(bytesToHex(base58Decode(encoded)), hex.toLowerCase(), encoded);
  }
});

test('base58Decode rejects characters outside the alphabet', () => {
  for (const bad of ['0', 'O', 'I', 'l', '1 1', '+']) assert.throws(() => base58Decode(bad), /character/);
});

test('Base58Check appends the first four bytes of the double SHA-256', () => {
  const rnd = createRandom(58);
  for (const length of [0, 1, 20, 21, 78]) {
    const payload = rnd.bytes(length);
    const encoded = base58CheckEncode(payload);
    const raw = base58Decode(encoded);
    assert.equal(bytesToHex(raw.subarray(length)), bytesToHex(sha256(sha256(payload)).subarray(0, 4)));
    assert.equal(bytesToHex(base58CheckDecode(encoded)), bytesToHex(payload));
  }
});

test('base58CheckDecode rejects a corrupted checksum and a too-short string', () => {
  const encoded = base58CheckEncode(hexToBytes('00010203'));
  const last = encoded.at(-1);
  const corrupted = encoded.slice(0, -1) + (last === '2' ? '3' : '2');
  assert.throws(() => base58CheckDecode(corrupted), /checksum/);
  assert.throws(() => base58CheckDecode('111'), /short/);
});

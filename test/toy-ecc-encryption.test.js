/**
 * The toy hashed EC-ElGamal scheme of src/lib/toy-ecc-encryption.js on
 * secp256k1: key generation with a restricted private key, encryption and
 * decryption round trips, detection of a wrong key or a tampered ciphertext,
 * the step trace used by the page, and determinism under an injected source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOY_KEY_BITS,
  SCHEME,
  DecryptionError,
  systemRandom,
  randomKeyInRange,
  randomScalar,
  generateKeyPair,
  parsePoint,
  deriveKeystream,
  encrypt,
  encryptTrace,
  decrypt,
  decryptTrace,
  decryptWithSharedPoint,
} from '../src/lib/toy-ecc-encryption.js';
import { G, N, mul, isOnCurve, equals, compress } from '../src/lib/secp256k1.js';
import { createRandom } from '../src/lib/random.js';
import { bytesToHex, utf8Bytes } from '../src/lib/bytes.js';

const constantSource = (byte) => ({ bytes: (n) => new Uint8Array(n).fill(byte) });
const MESSAGE = 'Greetings at dawn. A plaintext longer than one Keccak block, with accents: cafe, uber.';

test('the default key size is a small, browser-searchable range', () => {
  assert.ok(Number.isInteger(TOY_KEY_BITS));
  assert.ok(TOY_KEY_BITS >= 16 && TOY_KEY_BITS <= 24);
  assert.equal(typeof SCHEME, 'string');
});

test('restricted private keys are uniform on [1, 2^bits], inclusive at both ends', () => {
  assert.equal(randomKeyInRange(12, constantSource(0x00)), 1n);
  assert.equal(randomKeyInRange(12, constantSource(0xff)), 4096n);
  assert.equal(randomKeyInRange(1, constantSource(0xff)), 2n);
  const rnd = createRandom(3);
  for (let i = 0; i < 200; i += 1) {
    const k = randomKeyInRange(10, rnd);
    assert.ok(k >= 1n && k <= 1024n);
  }
  assert.throws(() => randomKeyInRange(0, rnd), RangeError);
  assert.throws(() => randomKeyInRange(256, rnd), RangeError);
});

test('full-range scalars lie in [1, n - 1]', () => {
  for (let i = 0; i < 20; i += 1) {
    const r = randomScalar(systemRandom);
    assert.ok(r >= 1n && r < N);
  }
  let calls = 0;
  const mixed = { bytes: (n) => new Uint8Array(n).fill(calls++ === 0 ? 0xff : 0x01) };
  assert.equal(randomScalar(mixed), BigInt(`0x${'01'.repeat(32)}`));
});

test('generateKeyPair returns Q = kG with k in the restricted range', () => {
  const pair = generateKeyPair({ bits: 16, random: createRandom(11) });
  assert.equal(pair.bits, 16);
  assert.ok(pair.privateKey >= 1n && pair.privateKey <= 65536n);
  assert.ok(equals(pair.publicKey, mul(G, pair.privateKey)));
  assert.ok(isOnCurve(pair.publicKey));
  assert.equal(pair.publicKeyHex, bytesToHex(compress(pair.publicKey)));
  assert.ok(Object.isFrozen(pair));
  const again = generateKeyPair({ bits: 16, random: createRandom(11) });
  assert.equal(again.privateKey, pair.privateKey);
  assert.equal(generateKeyPair().bits, TOY_KEY_BITS);
});

test('parsePoint accepts points, compressed hex and compressed bytes', () => {
  const Q = mul(G, 12345n);
  const hex = bytesToHex(compress(Q));
  assert.ok(equals(parsePoint(Q), Q));
  assert.ok(equals(parsePoint(hex), Q));
  assert.ok(equals(parsePoint(compress(Q)), Q));
  assert.throws(() => parsePoint({ x: Q.x, y: Q.y + 1n }), /not on the curve/);
  assert.throws(() => parsePoint(null), /infinity/);
});

test('the keystream is Keccak-256 in counter mode and has the requested length', () => {
  const S = mul(G, 99n);
  const ks = deriveKeystream(S, 70);
  assert.equal(ks.length, 70);
  assert.deepEqual(deriveKeystream(S, 32), ks.subarray(0, 32));
  assert.notDeepEqual(ks.subarray(0, 32), ks.subarray(32, 64));
  assert.notDeepEqual(deriveKeystream(mul(G, 100n), 32), ks.subarray(0, 32));
});

test('a UTF-8 message survives encryption and decryption', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 20, random: createRandom(5) });
  const ciphertext = encrypt(MESSAGE, publicKey);
  assert.equal(ciphertext.scheme, SCHEME);
  assert.equal(ciphertext.encoding, 'utf8');
  assert.match(ciphertext.R, /^0[23][0-9a-f]{64}$/);
  assert.equal(ciphertext.c.length, 2 * utf8Bytes(MESSAGE).length);
  assert.match(ciphertext.tag, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(ciphertext));
  assert.equal(decrypt(ciphertext, privateKey), MESSAGE);
  assert.equal(decrypt(JSON.parse(JSON.stringify(ciphertext)), privateKey), MESSAGE);
  assert.equal(decrypt(encrypt('', publicKey), privateKey), '');
});

test('a raw byte message can be encrypted and recovered as bytes', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 18, random: createRandom(8) });
  const bytes = createRandom(21).bytes(200);
  const ciphertext = encrypt(bytes, publicKey);
  assert.equal(ciphertext.encoding, 'bytes');
  assert.deepEqual(decrypt(ciphertext, privateKey), bytes);
});

test('encryption with an injected source is deterministic', () => {
  const { publicKey } = generateKeyPair({ bits: 18, random: createRandom(5) });
  const a = encrypt(MESSAGE, publicKey, { random: createRandom(777) });
  const b = encrypt(MESSAGE, publicKey, { random: createRandom(777) });
  assert.deepEqual(a, b);
  const c = encrypt(MESSAGE, publicKey, { random: createRandom(778) });
  assert.notEqual(a.R, c.R);
});

test('R and the shared secret S lie on the curve', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 18, random: createRandom(9) });
  const trace = encryptTrace(MESSAGE, publicKey, { random: createRandom(1) });
  assert.ok(isOnCurve(trace.R));
  assert.ok(isOnCurve(trace.S));
  assert.ok(equals(trace.S, mul(trace.R, privateKey)));
  assert.ok(equals(trace.R, mul(G, trace.ephemeral)));
  assert.ok(trace.keystream.length >= utf8Bytes(MESSAGE).length);
  const dec = decryptTrace(trace.ciphertext, privateKey);
  assert.ok(equals(dec.S, trace.S));
  assert.deepEqual(dec.keystream, trace.keystream);
  assert.equal(dec.message, MESSAGE);
});

test('a wrong key or a tampered ciphertext is rejected by the tag', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 18, random: createRandom(5) });
  const wrong = privateKey + 1n;
  const ciphertext = encrypt(MESSAGE, publicKey);
  assert.throws(() => decrypt(ciphertext, wrong), DecryptionError);
  const flipped = { ...ciphertext, c: `ff${ciphertext.c.slice(2)}` };
  assert.throws(() => decrypt(flipped, privateKey), DecryptionError);
  const badTag = { ...ciphertext, tag: `${ciphertext.tag.slice(0, -2)}00` };
  assert.throws(() => decrypt(badTag, privateKey), DecryptionError);
});

test('decryptWithSharedPoint recovers the message from S alone (no private key)', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 18, random: createRandom(5) });
  const ciphertext = encrypt(MESSAGE, publicKey);
  const S = mul(parsePoint(ciphertext.R), privateKey);
  assert.equal(decryptWithSharedPoint(ciphertext, S), MESSAGE);
});

test('a restricted ephemeral is honoured and recorded', () => {
  const { publicKey } = generateKeyPair({ bits: 18, random: createRandom(5) });
  const trace = encryptTrace(MESSAGE, publicKey, { ephemeralBits: 16, random: createRandom(2) });
  assert.equal(trace.ephemeralBits, 16);
  assert.ok(trace.ephemeral >= 1n && trace.ephemeral <= 65536n);
});

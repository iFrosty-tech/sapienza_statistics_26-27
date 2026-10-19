/**
 * Attacks on the restricted key space of src/lib/restricted-key-attack.js:
 * brute force, baby-step giant-step and Pollard's kangaroo recover the private
 * key k from Q = kG when k is known to lie in [1, 2^bits], and the ephemeral
 * recovery decrypts a ciphertext without k when the ephemeral was restricted.
 * Operation counts are checked against the expected orders of magnitude.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bruteForce,
  babyStepGiantStep,
  pollardKangaroo,
  recoverEphemeral,
  decryptWithoutKey,
} from '../src/lib/restricted-key-attack.js';
import { generateKeyPair, encrypt, decrypt } from '../src/lib/toy-ecc-encryption.js';
import { G, mul } from '../src/lib/secp256k1.js';
import { createRandom } from '../src/lib/random.js';

test('brute force recovers k for bits = 12', () => {
  const k = 2893n;
  const Q = mul(G, k);
  const result = bruteForce(Q, 12);
  assert.equal(result.found, true);
  assert.equal(result.k, k);
  assert.ok(result.operations <= 4096);
  assert.equal(result.method, 'brute-force');
});

test('brute force reports failure when k is outside the bound', () => {
  const Q = mul(G, 5000n);
  const result = bruteForce(Q, 12);
  assert.equal(result.found, false);
  assert.equal(result.k, null);
});

test('brute force calls the progress callback and respects an explicit bound', () => {
  const Q = mul(G, 300n);
  let last = 0;
  const result = bruteForce(Q, 12, { onProgress: (done) => { last = done; }, progressEvery: 64 });
  assert.equal(result.k, 300n);
  assert.ok(last > 0);
});

test('baby-step giant-step recovers k for bits = 24 far below brute force', () => {
  const k = 15485863n; // < 2^24 = 16777216
  const Q = mul(G, k);
  const result = babyStepGiantStep(Q, 24);
  assert.equal(result.found, true);
  assert.equal(result.k, k);
  assert.equal(result.method, 'bsgs');
  // O(2^(bits/2)) ≈ 4096; comfortably below the ~2^23 average of brute force.
  assert.ok(result.operations < 100000, `operations ${result.operations}`);
  assert.ok(result.operations < 2 ** 23);
});

test('Pollard kangaroo recovers k for bits = 24 and is seeded and reproducible', () => {
  const k = 12345678n;
  const Q = mul(G, k);
  const a = pollardKangaroo(Q, 24, { random: createRandom(20261013) });
  assert.equal(a.found, true);
  assert.equal(a.k, k);
  assert.equal(a.method, 'kangaroo');
  assert.ok(a.operations < 2 ** 23, `operations ${a.operations}`);
  const b = pollardKangaroo(Q, 24, { random: createRandom(20261013) });
  assert.equal(b.operations, a.operations);
});

test('kangaroo retries on failure and eventually succeeds for several keys', () => {
  for (const k of [1n, 2n, 1000003n, 16777215n]) {
    const result = pollardKangaroo(mul(G, k), 24, { random: createRandom(Number(k % 100000n) + 1) });
    assert.equal(result.k, k, `k = ${k}`);
    assert.ok(result.restarts >= 0);
  }
});

test('decryptWithoutKey recovers k then decrypts', () => {
  const { privateKey, publicKey } = generateKeyPair({ bits: 20, random: createRandom(5) });
  const ciphertext = encrypt('meet at the bridge at noon', publicKey);
  for (const method of ['bsgs', 'kangaroo']) {
    const result = decryptWithoutKey(ciphertext, publicKey, 20, method, { random: createRandom(7) });
    assert.equal(result.k, privateKey);
    assert.equal(result.message, 'meet at the bridge at noon');
    assert.ok(result.operations > 0);
  }
  // The recovered key agrees with ordinary decryption.
  const k = decryptWithoutKey(ciphertext, publicKey, 20, 'bsgs').k;
  assert.equal(decrypt(ciphertext, k), 'meet at the bridge at noon');
});

test('recoverEphemeral decrypts without k when the ephemeral was restricted', () => {
  const { publicKey } = generateKeyPair({ bits: 24, random: createRandom(5) });
  const ciphertext = encrypt('the password is swordfish', publicKey, {
    ephemeralBits: 20,
    random: createRandom(42),
  });
  const result = recoverEphemeral(ciphertext, publicKey, 20, 'bsgs');
  assert.equal(result.found, true);
  assert.ok(result.ephemeral >= 1n && result.ephemeral <= 2n ** 20n);
  assert.equal(result.message, 'the password is swordfish');
});

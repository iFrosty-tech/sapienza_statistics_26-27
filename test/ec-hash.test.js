/**
 * The toy elliptic-curve hash H(m) = x(Σ_i b_i · G_i), in its two generator
 * families, and the structural properties the homework demonstrates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DST,
  ecHash,
  ecHashPoint,
  scalarGenerator,
  pedersenGenerator,
  hashToCurveTryAndIncrement,
  scalarOf,
  messageFromScalar,
  scalarCollisionMessages,
} from '../src/lib/ec-hash.js';
import { G, N, INFINITY, mul, add, equals, isOnCurve } from '../src/lib/secp256k1.js';
import { bytesToBigInt, bytesToHex, hammingDistance, flipBit, utf8Bytes } from '../src/lib/bytes.js';
import { createRandom } from '../src/lib/random.js';

const rnd = createRandom(20261008);

test('the domain separation tag is fixed', () => {
  assert.equal(DST, 'secp256k1-toy-hash/generator/v1');
});

test('scalar generators are G_i = 2^(8i) · G', () => {
  assert.ok(equals(scalarGenerator(0), G));
  assert.ok(equals(scalarGenerator(1), mul(G, 256n)));
  assert.ok(equals(scalarGenerator(5), mul(G, 2n ** 40n)));
});

test('scalar variant equals x(int_LE(m) · G)', () => {
  for (let trial = 0; trial < 8; trial += 1) {
    const length = 1 + rnd.int(40);
    const m = rnd.bytes(length);
    const k = bytesToBigInt(m, 'le');
    const expected = mul(G, k);
    const { point, digest } = ecHash(m, { variant: 'scalar' });
    assert.ok(equals(point, expected));
    assert.equal(bytesToHex(digest), expected.x.toString(16).padStart(64, '0'));
    assert.equal(scalarOf(m), k % N);
  }
});

test('digest is 32 bytes, big-endian x, and the all-zero message maps to ∞ → 0^256', () => {
  for (const variant of ['scalar', 'pedersen']) {
    const zero = new Uint8Array(7);
    const { point, digest } = ecHash(zero, { variant });
    assert.ok(equals(point, INFINITY));
    assert.equal(digest.length, 32);
    assert.ok(digest.every((b) => b === 0));
    const one = ecHash(new Uint8Array([1]), { variant });
    assert.equal(one.digest.length, 32);
    assert.ok(isOnCurve(one.point));
  }
  assert.throws(() => ecHash(new Uint8Array(0), { variant: 'scalar' }), /empty/i);
  assert.throws(() => ecHash(new Uint8Array(1), { variant: 'md5' }), /variant/i);
});

test('structural collision of the scalar variant: H(n − k) = H(k)', () => {
  const m = rnd.bytes(32);
  const k = scalarOf(m);
  const twin = messageFromScalar(N - k, 32);
  assert.equal(bytesToHex(ecHash(twin, { variant: 'scalar' }).digest), bytesToHex(ecHash(m, { variant: 'scalar' }).digest));
  assert.notEqual(bytesToHex(twin), bytesToHex(m));
});

test('scalarCollisionMessages returns colliding messages of the requested length', () => {
  const m = rnd.bytes(32);
  const { negation, wrap } = scalarCollisionMessages(m);
  assert.ok(negation instanceof Uint8Array && negation.length === 32);
  assert.equal(bytesToHex(ecHash(negation, { variant: 'scalar' }).digest), bytesToHex(ecHash(m, { variant: 'scalar' }).digest));
  assert.ok(wrap instanceof Uint8Array && wrap.length === 33, 'k + n needs one extra byte');
  assert.equal(bytesToHex(ecHash(wrap, { variant: 'scalar' }).digest), bytesToHex(ecHash(m, { variant: 'scalar' }).digest));

  const short = utf8Bytes('hi');
  const r = scalarCollisionMessages(short, { length: 2 });
  assert.equal(r.negation, null, 'n − k does not fit in 2 bytes');
  assert.equal(r.wrap, null);
  const padded = scalarCollisionMessages(short);
  assert.equal(padded.negation.length, 32);
  assert.equal(bytesToHex(ecHash(padded.negation, { variant: 'scalar' }).digest), bytesToHex(ecHash(short, { variant: 'scalar' }).digest));
});

test('Pedersen generators are on the curve, distinct, deterministic and independent of G', () => {
  const gens = Array.from({ length: 40 }, (_, i) => pedersenGenerator(i));
  for (const g of gens) assert.ok(isOnCurve(g) && g.y % 2n === 0n);
  const keys = new Set(gens.map((g) => g.x.toString(16)));
  assert.equal(keys.size, 40);
  assert.ok(!gens.some((g) => equals(g, G)));
  assert.ok(equals(pedersenGenerator(3), gens[3]));
  const { point, counter } = hashToCurveTryAndIncrement(DST, 0);
  assert.ok(equals(point, gens[0]));
  assert.ok(Number.isInteger(counter) && counter >= 0);
});

test('Pedersen variant is homomorphic when no byte overflows', () => {
  const a = rnd.bytes(16).map((b) => b >> 1);
  const b = rnd.bytes(16).map((v) => v >> 1);
  const sum = a.map((v, i) => v + b[i]);
  const left = add(ecHashPoint(a, 'pedersen'), ecHashPoint(b, 'pedersen'));
  assert.ok(equals(left, ecHashPoint(sum, 'pedersen')));
});

test('the two variants differ and both show avalanche on a single bit flip', () => {
  for (let trial = 0; trial < 6; trial += 1) {
    const m = rnd.bytes(32);
    const i = rnd.int(256);
    const m2 = flipBit(m, i);
    for (const variant of ['scalar', 'pedersen']) {
      const d = hammingDistance(ecHash(m, { variant }).digest, ecHash(m2, { variant }).digest);
      assert.ok(d >= 64 && d <= 192, `${variant}: distance ${d}`);
    }
    assert.notEqual(bytesToHex(ecHash(m, { variant: 'scalar' }).digest), bytesToHex(ecHash(m, { variant: 'pedersen' }).digest));
  }
});

test('messages longer than 32 bytes use more generators', () => {
  const m = rnd.bytes(70);
  const h = ecHash(m, { variant: 'pedersen' });
  assert.ok(isOnCurve(h.point));
  const s = ecHash(m, { variant: 'scalar' });
  assert.ok(equals(s.point, mul(G, bytesToBigInt(m, 'le'))));
});

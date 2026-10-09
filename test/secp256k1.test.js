/**
 * secp256k1 arithmetic against published values.
 *
 * Curve parameters: Certicom Research, "SEC 2: Recommended Elliptic Curve
 * Domain Parameters", version 2.0 (2010), section 2.4.1,
 * https://www.secg.org/sec2-v2.pdf
 *
 * Small multiples 2G and 3G are the values reproduced throughout the Bitcoin
 * literature. The two large-scalar vectors are published worked examples:
 *   (a) Bitcoin Wiki, "Technical background of version 1 Bitcoin addresses",
 *       https://en.bitcoin.it/wiki/Technical_background_of_version_1_Bitcoin_addresses
 *       private key 18e14a7b… → compressed public key 0250863a…
 *   (b) A. M. Antonopoulos and D. A. Harding, "Mastering Bitcoin", 3rd ed.,
 *       chapter 4, https://github.com/bitcoinbook/bitcoinbook/blob/develop/ch04_keys.adoc
 *       private key 1E99423A… → public key (F028892B…, 07CF33DA…)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  P,
  N,
  G,
  INFINITY,
  mod,
  inv,
  sqrt,
  isOnCurve,
  negate,
  equals,
  add,
  double,
  mul,
  compress,
  decompress,
  multiplesTable,
  batchInverse,
} from '../src/lib/secp256k1.js';
import { bytesToHex, hexToBytes } from '../src/lib/bytes.js';

const hex = (x) => x.toString(16).padStart(64, '0');
const point = (x, y) => ({ x: BigInt(`0x${x}`), y: BigInt(`0x${y}`) });

const TWO_G = point(
  'C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5',
  '1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52A',
);
const THREE_G = point(
  'F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
  '388F7B0F632DE8140FE337E62A37F3566500A99934C2231B6CB9FD7584B8E672',
);

test('curve constants match SEC 2 v2.0', () => {
  assert.equal(P, 2n ** 256n - 2n ** 32n - 977n);
  assert.equal(hex(N), 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
  assert.equal(hex(G.x), '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  assert.equal(hex(G.y), '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8');
  assert.equal(P % 4n, 3n, 'sqrt by exponentiation needs p ≡ 3 (mod 4)');
});

test('field helpers: mod, inv, sqrt', () => {
  assert.equal(mod(-1n), P - 1n);
  assert.equal(mod(P + 5n), 5n);
  for (const a of [1n, 2n, 3n, 12345678901234567890n, P - 1n]) {
    assert.equal(mod(a * inv(a)), 1n, `inverse of ${a}`);
  }
  assert.throws(() => inv(0n));
  const r = sqrt(4n);
  assert.ok(r === 2n || r === P - 2n);
  assert.equal(sqrt(3n), null, '3 is not a quadratic residue mod p');
  const rhs = mod(G.x ** 3n + 7n);
  const y = sqrt(rhs);
  assert.ok(y === G.y || y === P - G.y);
});

test('batch inversion agrees with single inversions', () => {
  const xs = [1n, 2n, 3n, 77777n, P - 1n, 123456789n];
  const invs = batchInverse(xs);
  xs.forEach((x, i) => assert.equal(invs[i], inv(x)));
});

test('G is on the curve, INFINITY is the identity', () => {
  assert.ok(isOnCurve(G));
  assert.ok(isOnCurve(INFINITY));
  assert.ok(!isOnCurve({ x: G.x, y: G.y + 1n }));
  assert.ok(equals(add(G, INFINITY), G));
  assert.ok(equals(add(INFINITY, G), G));
  assert.ok(equals(add(G, negate(G)), INFINITY));
  assert.ok(equals(mul(G, 0n), INFINITY));
  assert.ok(equals(mul(INFINITY, 12345n), INFINITY));
});

test('2G and 3G match the published values', () => {
  assert.ok(equals(double(G), TWO_G));
  assert.ok(equals(add(G, G), TWO_G));
  assert.ok(equals(mul(G, 2n), TWO_G));
  assert.ok(equals(add(TWO_G, G), THREE_G));
  assert.ok(equals(mul(G, 3n), THREE_G));
  assert.ok(isOnCurve(TWO_G) && isOnCurve(THREE_G));
});

test('the group order: n·G = ∞ and (n − 1)·G = −G', () => {
  assert.ok(equals(mul(G, N), INFINITY));
  assert.ok(equals(mul(G, N - 1n), negate(G)));
  assert.ok(equals(mul(G, N + 1n), G), 'scalars reduce modulo n');
  assert.ok(equals(mul(G, -1n), negate(G)), 'negative scalars multiply the negated point');
});

test('group laws hold on random scalars', () => {
  const scalars = [7n, 0x1234567890abcdefn, N / 3n, N - 12345n, 2n ** 200n + 99n];
  for (const a of scalars) {
    for (const b of scalars) {
      const aG = mul(G, a);
      const bG = mul(G, b);
      assert.ok(equals(add(aG, bG), add(bG, aG)), 'commutativity');
      assert.ok(equals(add(aG, bG), mul(G, a + b)), 'homomorphism (a + b)G = aG + bG');
      assert.ok(equals(mul(aG, b), mul(bG, a)), 'b(aG) = a(bG)');
    }
    const c = 0xdeadbeefn;
    assert.ok(equals(add(add(mul(G, a), mul(G, c)), mul(G, 5n)), add(mul(G, a), add(mul(G, c), mul(G, 5n)))), 'associativity');
  }
});

test('published vector (a): Bitcoin Wiki private key → compressed public key', () => {
  const k = BigInt('0x18e14a7b6a307f426a94f8114701e7c8e774e7f9a47e2c2035db29a206321725');
  const K = mul(G, k);
  assert.equal(hex(K.x), '50863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352');
  assert.equal(K.y % 2n, 0n, 'the wiki shows prefix 02, so y is even');
  assert.equal(bytesToHex(compress(K)), '0250863ad64a87ae8a2fe83c1af1a8403cb53f53e486d8511dad8a04887e5b2352');
});

test('published vector (b): Mastering Bitcoin private key → public key', () => {
  const k = BigInt('0x1E99423A4ED27608A15A2616A2B0E9E52CED330AC530EDCC32C8FFC6A526AEDD');
  const K = mul(G, k);
  assert.equal(hex(K.x), 'f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a');
  assert.equal(hex(K.y), '07cf33da18bd734c600b96a72bbc4749d5141c90ec8ac328ae52ddfe2e505bdb');
  assert.equal(bytesToHex(compress(K)), '03f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a');
});

test('compressed encoding round-trips through decompression', () => {
  for (const k of [1n, 2n, 3n, 0xabcdefn, N - 7n]) {
    const Q = mul(G, k);
    const enc = compress(Q);
    assert.equal(enc.length, 33);
    assert.ok(enc[0] === 2 || enc[0] === 3);
    assert.ok(equals(decompress(enc), Q));
  }
  assert.throws(() => decompress(hexToBytes('02' + '00'.repeat(32))), /not on the curve|no square root/i);
  assert.throws(() => decompress(new Uint8Array(10)));
});

test('multiplesTable lists 0·Q … 255·Q as affine points', () => {
  const Q = mul(G, 0x9999n);
  const table = multiplesTable(Q, 256);
  assert.equal(table.length, 256);
  assert.ok(equals(table[0], INFINITY));
  assert.ok(equals(table[1], Q));
  for (const i of [2, 3, 17, 100, 255]) {
    assert.ok(equals(table[i], mul(Q, BigInt(i))), `entry ${i}`);
    assert.ok(isOnCurve(table[i]));
  }
});

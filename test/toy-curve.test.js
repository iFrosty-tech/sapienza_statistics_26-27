/**
 * Short-Weierstrass arithmetic of src/lib/toy-curve.js.
 *
 * The toy curve y² = x³ + 7 over F_17 is the example of homework 1: its points,
 * the orders of its points and the multiples of G = (1, 5) were computed by hand
 * from the chord-and-tangent formulas and checked by exhaustive enumeration.
 * The curve y² = x³ + 2x + 2 over F_17 (group order 19, 2·(5, 1) = (6, 3)) is the
 * worked example of C. Paar and J. Pelzl, "Understanding Cryptography" (2010),
 * section 9.2, and exercises the coefficient a. Group orders of y² = x³ + 7 for
 * p = 1031 and p = 1051 come from exhaustive counts. The secp256k1 checks compare
 * against the independent Jacobian implementation in src/lib/secp256k1.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineCurve,
  TOY_CURVE,
  TOY_BASE,
  TOY_PRIVATE_KEY,
  SECP256K1,
  SECP256K1_G,
  SECP256K1_N,
  mod,
  inverse,
  isOnCurve,
  negate,
  equals,
  add,
  double,
  addStep,
  points,
  groupOrder,
  orderOf,
  subgroup,
  multiplyByRepeatedAddition,
  multiplyByDoubleAndAdd,
  multiply,
  formatPoint,
  bitLength,
} from '../src/lib/toy-curve.js';
import { P as SECP_P, N as SECP_N, G as SECP_G, mul as secpMul, equals as secpEquals } from '../src/lib/secp256k1.js';

const pt = (x, y) => ({ x: BigInt(x), y: BigInt(y) });
const T = TOY_CURVE;
const G = TOY_BASE;

const TOY_POINTS = [
  '(1, 5)', '(1, 12)', '(2, 7)', '(2, 10)', '(3, 0)', '(5, 8)', '(5, 9)', '(6, 6)', '(6, 11)',
  '(8, 3)', '(8, 14)', '(10, 2)', '(10, 15)', '(12, 1)', '(12, 16)', '(15, 4)', '(15, 13)',
];

const TOY_ORDERS = {
  9: ['(1, 5)', '(1, 12)', '(2, 7)', '(2, 10)', '(12, 1)', '(12, 16)'],
  18: ['(6, 6)', '(6, 11)', '(10, 2)', '(10, 15)', '(15, 4)', '(15, 13)'],
  6: ['(8, 3)', '(8, 14)'],
  3: ['(5, 8)', '(5, 9)'],
  2: ['(3, 0)'],
};

/** G, 2G, …, 8G for G = (1, 5); 9G = O. */
const ASSIGNMENT_MULTIPLES = ['(1, 5)', '(2, 10)', '(5, 9)', '(12, 1)', '(12, 16)', '(5, 8)', '(2, 7)', '(1, 12)'];

test('defineCurve reduces and freezes the parameters and rejects singular curves', () => {
  assert.equal(T.p, 17n);
  assert.equal(T.a, 0n);
  assert.equal(T.b, 7n);
  assert.ok(Object.isFrozen(T));
  assert.equal(typeof T.name, 'string');
  const reduced = defineCurve({ p: 17n, a: -15n, b: 24n });
  assert.equal(reduced.a, 2n);
  assert.equal(reduced.b, 7n);
  assert.equal(defineCurve({ p: 17n, b: 7n }).a, 0n, 'a defaults to 0');
  assert.throws(() => defineCurve({ p: 17n, a: 0n, b: 0n }), RangeError, '4a³ + 27b² ≡ 0 is singular');
  assert.throws(() => defineCurve({ p: 3n, b: 1n }), RangeError);
  assert.throws(() => defineCurve({ p: 17, b: 7n }), TypeError);
  assert.equal(TOY_PRIVATE_KEY, 6n);
  assert.ok(Object.isFrozen(G));
});

test('field helpers: mod and inverse', () => {
  assert.equal(mod(T, -1n), 16n);
  assert.equal(mod(T, 35n), 1n);
  assert.equal(inverse(T, 2n), 9n);
  for (let v = 1n; v < 17n; v += 1n) assert.equal(mod(T, v * inverse(T, v)), 1n, `inverse of ${v}`);
  assert.equal(inverse(T, -1n), 16n);
  assert.throws(() => inverse(T, 0n), RangeError);
  assert.throws(() => inverse(T, 34n), RangeError);
  assert.throws(() => inverse(defineCurve({ p: 15n, b: 7n }), 6n), RangeError, 'gcd(6, 15) = 3');
});

test('the toy curve has 17 affine points and a group of order 18', () => {
  const all = points(T);
  assert.deepEqual(all.map(formatPoint), TOY_POINTS);
  assert.equal(groupOrder(T), 18n);
  for (const P of all) assert.ok(isOnCurve(T, P));
  assert.ok(isOnCurve(T, null), 'O is on every curve');
  assert.ok(!isOnCurve(T, pt(1, 6)));
  assert.ok(!isOnCurve(T, pt(18, 5)), 'coordinates must lie in [0, p)');
  assert.ok(!isOnCurve(T, pt(1, -12)));
});

test('the order of every point of the toy curve', () => {
  const found = {};
  for (const P of points(T)) (found[orderOf(T, P)] ??= []).push(formatPoint(P));
  assert.deepEqual(found, TOY_ORDERS);
  assert.equal(orderOf(T, null), 1n);
  for (const [n, list] of Object.entries(TOY_ORDERS)) {
    for (const text of list) {
      const [x, y] = text.slice(1, -1).split(', ');
      assert.equal(subgroup(T, pt(x, y)).length, Number(n) - 1, `subgroup of ${text}`);
    }
  }
  assert.deepEqual(subgroup(T, null), []);
});

test('the assignment sequence: G = (1, 5), 6G = (5, 8), 9G = O', () => {
  assert.deepEqual(subgroup(T, G).map(formatPoint), ASSIGNMENT_MULTIPLES);
  const { result, steps } = multiplyByRepeatedAddition(T, G, TOY_PRIVATE_KEY);
  assert.equal(formatPoint(result), '(5, 8)');
  assert.equal(steps.length, 5, 'k − 1 additions');
  assert.deepEqual(steps.map((s) => formatPoint(s.result)), ASSIGNMENT_MULTIPLES.slice(1, 6));
  assert.equal(formatPoint(multiply(T, G, TOY_PRIVATE_KEY)), '(5, 8)');
  assert.equal(multiply(T, G, 9n), null);
  assert.equal(multiplyByRepeatedAddition(T, G, 9n).result, null);
  assert.equal(formatPoint(multiply(T, G, 10n)), '(1, 5)', '10G = G');
});

test('doubling G: slope 2, intercept 3, third point (2, 7), sum (2, 10)', () => {
  const record = addStep(T, G, G);
  assert.equal(record.kind, 'double');
  assert.equal(record.lambda, 2n);
  assert.equal(record.nu, 3n);
  assert.equal(formatPoint(record.third), '(2, 7)');
  assert.equal(formatPoint(record.result), '(2, 10)');
  assert.equal(record.P, G);
  assert.equal(record.Q, G);
  assert.ok(equals(double(T, G), pt(2, 10)));
});

test('every addStep record on the toy curve is geometrically consistent', () => {
  const all = points(T);
  for (const P of all) {
    for (const Q of all) {
      const r = addStep(T, P, Q);
      const label = `${formatPoint(P)} + ${formatPoint(Q)}`;
      assert.ok(equals(r.result, add(T, P, Q)), label);
      assert.ok(equals(add(T, P, Q), add(T, Q, P)), `${label} commutes`);
      assert.ok(isOnCurve(T, r.result), label);
      assert.equal(r.kind, equals(P, Q) ? 'double' : equals(P, negate(T, Q)) ? 'inverse' : 'add', label);
      if (r.lambda === null) {
        assert.deepEqual(r.line, { vertical: true, x: P.x }, label);
        assert.equal(P.x, Q.x, label);
        assert.equal(r.nu, null);
        assert.equal(r.third, null, 'a vertical line meets the curve again at O');
        assert.equal(r.result, null, label);
        continue;
      }
      assert.equal(r.line.length, 17, `${label}: p lattice points`);
      r.line.forEach((L, x) => {
        assert.equal(L.x, BigInt(x));
        assert.equal(L.y, mod(T, r.lambda * L.x + r.nu));
      });
      const onLine = (R) => r.line.some((L) => equals(L, R));
      assert.ok(onLine(P) && onLine(Q), `${label}: the line passes through P and Q`);
      assert.ok(isOnCurve(T, r.third), `${label}: third point on the curve`);
      assert.ok(onLine(r.third), `${label}: third point on the line`);
      assert.ok(equals(r.result, negate(T, r.third)), `${label}: P + Q = −R′`);
    }
  }
});

test('special cases: P + (−P), doubling (3, 0), and the identity O', () => {
  const inv = addStep(T, G, negate(T, G));
  assert.equal(inv.kind, 'inverse');
  assert.equal(inv.lambda, null);
  assert.deepEqual(inv.line, { vertical: true, x: 1n });
  assert.equal(inv.result, null);
  assert.equal(add(T, G, negate(T, G)), null);

  const tangent = addStep(T, pt(3, 0), pt(3, 0));
  assert.equal(tangent.kind, 'double');
  assert.equal(tangent.lambda, null, 'vertical tangent at y = 0');
  assert.deepEqual(tangent.line, { vertical: true, x: 3n });
  assert.equal(tangent.result, null);
  assert.equal(double(T, pt(3, 0)), null);

  const left = addStep(T, null, G);
  assert.equal(left.kind, 'identity');
  assert.equal(left.result, G);
  assert.equal(left.line, null);
  assert.equal(left.lambda, null);
  assert.equal(add(T, G, null), G);
  assert.equal(addStep(T, null, null).result, null);
  assert.equal(double(T, null), null);
  assert.equal(negate(T, null), null);
  assert.deepEqual(negate(T, G), pt(1, 12));
  assert.ok(equals(null, null));
  assert.ok(!equals(G, null));
});

test('repeated addition, double-and-add and multiply agree for k = 0 … 40 on every point', () => {
  for (const P of [...points(T), null]) {
    const cycle = P === null ? [] : subgroup(T, P);
    const n = BigInt(cycle.length + 1);
    for (let k = 0n; k <= 40n; k += 1n) {
      const expected = k % n === 0n ? null : cycle[Number(k % n) - 1];
      const repeated = multiplyByRepeatedAddition(T, P, k);
      const label = `${k}·${formatPoint(P)}`;
      assert.ok(equals(repeated.result, expected), `${label} by repeated addition`);
      assert.equal(repeated.steps.length, k === 0n ? 0 : Number(k) - 1);
      assert.ok(equals(multiplyByDoubleAndAdd(T, P, k).result, expected), `${label} by double-and-add`);
      assert.ok(equals(multiply(T, P, k), expected), `${label} by multiply`);
    }
  }
});

test('double-and-add convention: leading bit loads G, later bits double then add', () => {
  const six = multiplyByDoubleAndAdd(T, G, 6n);
  assert.equal(six.bits, '110');
  assert.deepEqual(six.steps.map((s) => s.op), ['double', 'add', 'double']);
  assert.deepEqual(six.steps.map((s) => s.bitIndex), [1, 1, 2]);
  assert.deepEqual(six.steps.map((s) => s.bit), [1, 1, 0]);
  assert.deepEqual(six.steps.map((s) => s.index), [2n, 3n, 6n]);
  assert.deepEqual(six.steps.map((s) => formatPoint(s.record.result)), ['(2, 10)', '(5, 9)', '(5, 8)']);
  assert.deepEqual(six.steps.map((s) => s.record.kind), ['double', 'add', 'double']);
  assert.equal(formatPoint(six.result), '(5, 8)');

  const one = multiplyByDoubleAndAdd(T, G, 1n);
  assert.equal(one.bits, '1');
  assert.deepEqual(one.steps, []);
  assert.equal(one.result, G);

  const zero = multiplyByDoubleAndAdd(T, G, 0n);
  assert.equal(zero.bits, '0');
  assert.deepEqual(zero.steps, []);
  assert.equal(zero.result, null);

  for (const k of [2n, 7n, 37n, 1234n, 2n ** 40n + 5n]) {
    const { bits, steps } = multiplyByDoubleAndAdd(T, G, k);
    const ones = [...bits].filter((b) => b === '1').length;
    assert.equal(steps.length, bits.length - 1 + ones - 1, `${k}: ⌊log₂k⌋ doublings + popcount − 1 additions`);
    assert.equal(steps.at(-1).index, k);
  }
});

test('the order option reduces the scalar; invalid scalars are rejected', () => {
  const reduced = multiplyByDoubleAndAdd(T, G, 15n, { order: 9n });
  assert.equal(reduced.bits, '110');
  assert.equal(formatPoint(reduced.result), '(5, 8)');
  assert.equal(formatPoint(multiplyByDoubleAndAdd(T, G, -3n, { order: 9n }).result), '(5, 8)');
  assert.equal(formatPoint(multiply(T, G, -3n, { order: 9n })), '(5, 8)');
  assert.equal(formatPoint(multiplyByRepeatedAddition(T, G, 6).result), '(5, 8)', 'numbers are accepted');
  assert.throws(() => multiplyByRepeatedAddition(T, G, 1_000_001n), RangeError);
  assert.throws(() => multiplyByRepeatedAddition(T, G, -1n), RangeError);
  assert.throws(() => multiplyByDoubleAndAdd(T, G, -1n), RangeError);
  assert.throws(() => multiply(T, G, -1n), RangeError);
});

test('the coefficient a: y² = x³ + 2x + 2 over F_17 (Paar and Pelzl)', () => {
  const E = defineCurve({ p: 17n, a: 2n, b: 2n });
  const P = pt(5, 1);
  assert.ok(isOnCurve(E, P));
  assert.equal(addStep(E, P, P).lambda, 13n);
  assert.deepEqual(double(E, P), pt(6, 3));
  assert.equal(groupOrder(E), 19n);
  assert.equal(orderOf(E, P), 19n);
  assert.deepEqual(multiply(E, P, 18n), pt(5, 16));
  for (const Q of points(E)) assert.equal(orderOf(E, Q), 19n, 'prime order: every point generates');
});

test('group orders of y² = x³ + 7 on two medium fields', () => {
  assert.equal(groupOrder(defineCurve({ p: 1031n, b: 7n })), 1032n, 'p ≡ 2 (mod 3): supersingular, p + 1');
  assert.equal(groupOrder(defineCurve({ p: 1051n, b: 7n })), 1093n, 'prime order');
  const E = defineCurve({ p: 1051n, b: 7n });
  assert.equal(orderOf(E, points(E)[0]), 1093n);
});

test('lines over large fields carry no lattice points; enumeration is refused', () => {
  const r = addStep(SECP256K1, SECP256K1_G, SECP256K1_G);
  assert.equal(r.kind, 'double');
  assert.equal(r.line, null);
  assert.ok(isOnCurve(SECP256K1, r.third));
  assert.throws(() => points(SECP256K1), RangeError);
  assert.throws(() => groupOrder(SECP256K1), RangeError);
  assert.throws(() => orderOf(SECP256K1, SECP256K1_G), RangeError);
  assert.throws(() => subgroup(SECP256K1, SECP256K1_G), RangeError);
});

test('secp256k1: multiply agrees with the Jacobian implementation', () => {
  assert.equal(SECP256K1.p, SECP_P);
  assert.equal(SECP256K1.a, 0n);
  assert.equal(SECP256K1.b, 7n);
  assert.equal(SECP256K1_N, SECP_N);
  assert.ok(secpEquals(SECP256K1_G, SECP_G));
  const scalars = [
    1n,
    2n,
    3n,
    0xdeadbeefcafebabe0123456789abcdefn,
    2n ** 255n + 12345n,
    SECP256K1_N - 1n,
    0x18e14a7b6a307f426a94f8114701e7c8e774e7f9a47e2c2035db29a206321725n,
    0x9f2c4a1e7b3d5f608a1c2e4b6d8f0a3c5e7f9b1d3a5c7e902b4d6f8a0c1e3f57n,
  ];
  for (const k of scalars) {
    const Q = multiply(SECP256K1, SECP256K1_G, k);
    assert.ok(secpEquals(Q, secpMul(SECP_G, k)), `k = 0x${k.toString(16)}`);
    assert.ok(isOnCurve(SECP256K1, Q));
  }
  assert.ok(equals(multiply(SECP256K1, SECP256K1_G, SECP256K1_N - 1n), negate(SECP256K1, SECP256K1_G)));
  assert.equal(multiply(SECP256K1, SECP256K1_G, SECP256K1_N), null, 'n·G = O');

  const k = 2n ** 255n + 12345n;
  const traced = multiplyByDoubleAndAdd(SECP256K1, SECP256K1_G, k);
  assert.equal(traced.bits.length, 256);
  assert.ok(secpEquals(traced.result, secpMul(SECP_G, k)));
  assert.equal(traced.steps.filter((s) => s.op === 'double').length, 255);
  assert.equal(formatPoint(multiplyByDoubleAndAdd(SECP256K1, SECP256K1_G, SECP256K1_N + 6n, { order: SECP256K1_N }).result),
    formatPoint(multiply(SECP256K1, SECP256K1_G, 6n)));
});

test('formatPoint and bitLength', () => {
  assert.equal(formatPoint(null), 'O');
  assert.equal(formatPoint(pt(5, 8)), '(5, 8)');
  assert.equal(bitLength(0n), 0);
  assert.equal(bitLength(1n), 1);
  assert.equal(bitLength(6n), 3);
  assert.equal(bitLength(2n ** 255n), 256);
  assert.equal(bitLength(SECP256K1_N), 256);
});

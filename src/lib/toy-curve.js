/**
 * Elliptic curves in short Weierstrass form y² = x³ + a·x + b over a prime
 * field F_p, in affine coordinates with BigInt arithmetic.
 *
 * The module serves the toy example of homework 1 (y² = x³ + 7 over F₁₇,
 * base point G = (1, 5), private key k = 6) and everything built on it: a
 * record of each group operation (slope, line mod p, third intersection,
 * reflection) for the figures and the slowed-down animation, the two
 * scalar-multiplication methods, and exhaustive point listings for small
 * fields. The same functions run unchanged on secp256k1.
 *
 * Representation
 *   - A curve is a frozen object { name, p, a, b } built by defineCurve.
 *   - Field elements are BigInt values in [0, p).
 *   - Affine points are plain objects { x, y }; the point at infinity O,
 *     identity of the group, is null (the convention of secp256k1.js).
 *
 * Teaching code: one field inversion per group operation and no constant-time
 * guarantees. It must not be used to handle real keys.
 */

import { P as SECP_P, N as SECP_N, A as SECP_A, B as SECP_B, G as SECP_G } from './secp256k1.js';

/** Largest p for which points, groupOrder, orderOf and subgroup run exhaustively. */
export const EXHAUSTIVE_LIMIT = 2n ** 20n;

/** Largest p for which addStep lists the p lattice points of the line. */
export const LINE_POINTS_LIMIT = 257n;

/** Largest scalar accepted by multiplyByRepeatedAddition, which loops k − 1 times. */
export const REPEATED_ADDITION_LIMIT = 1_000_000n;

const reduce = (v, m) => {
  const r = v % m;
  return r < 0n ? r + m : r;
};

/* ------------------------------------------------------------------------ */
/* Curves                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * The curve y² = x³ + a·x + b over F_p. The coefficients are reduced modulo p
 * and the curve must be non-singular, 4a³ + 27b² ≢ 0 (mod p). The primality
 * of p is assumed, not tested.
 * @param {{ p: bigint, a?: bigint, b: bigint, name?: string }} params
 * @returns {Readonly<{ name: string, p: bigint, a: bigint, b: bigint }>}
 */
export function defineCurve({ p, a = 0n, b, name }) {
  if (typeof p !== 'bigint' || typeof a !== 'bigint' || typeof b !== 'bigint') {
    throw new TypeError('p, a and b must be BigInt values');
  }
  if (p <= 3n) throw new RangeError('p must be a prime greater than 3');
  const [ra, rb] = [reduce(a, p), reduce(b, p)];
  if (reduce(4n * ra ** 3n + 27n * rb ** 2n, p) === 0n) {
    throw new RangeError('singular curve: 4a³ + 27b² ≡ 0 (mod p)');
  }
  const linear = ra === 0n ? '' : ` + ${ra}x`;
  return Object.freeze({ name: name ?? `y^2 = x^3${linear} + ${rb} over F_${p}`, p, a: ra, b: rb });
}

/** The toy curve of the assignment: y² = x³ + 7 over F₁₇ (18 points, cyclic). */
export const TOY_CURVE = defineCurve({ p: 17n, a: 0n, b: 7n });

/** The base point G = (1, 5) of the assignment, of order 9. */
export const TOY_BASE = Object.freeze({ x: 1n, y: 5n });

/** The private key k = 6 of the assignment; 6G = (5, 8) is the toy public key. */
export const TOY_PRIVATE_KEY = 6n;

/** secp256k1 (SEC 2, section 2.4.1), with its base point and the order of G. */
export const SECP256K1 = defineCurve({ p: SECP_P, a: SECP_A, b: SECP_B, name: 'secp256k1' });
export const SECP256K1_G = SECP_G;
export const SECP256K1_N = SECP_N;

/* ------------------------------------------------------------------------ */
/* Field and point helpers                                                   */
/* ------------------------------------------------------------------------ */

/** Least non-negative residue of v modulo p. */
export function mod(curve, v) {
  return reduce(v, curve.p);
}

/**
 * Multiplicative inverse of v modulo p by the extended Euclidean algorithm.
 * @throws {RangeError} when v ≡ 0 (mod p), or v is not invertible (p not prime)
 */
export function inverse(curve, v) {
  const { p } = curve;
  let [r0, r1] = [reduce(v, p), p];
  if (r0 === 0n) throw new RangeError('0 has no multiplicative inverse');
  let [s0, s1] = [1n, 0n];
  // Invariant: r0 ≡ s0·v and r1 ≡ s1·v (mod p).
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new RangeError(`${v} is not invertible modulo ${p}`);
  return reduce(s0, p);
}

/** True when P is O, or has coordinates in [0, p) satisfying the curve equation. */
export function isOnCurve(curve, P) {
  if (P === null) return true;
  const { p, a, b } = curve;
  const { x, y } = P;
  if (x < 0n || x >= p || y < 0n || y >= p) return false;
  return (y * y) % p === (x * x * x + a * x + b) % p;
}

/** The inverse −P = (x, −y); −O = O. */
export function negate(curve, P) {
  return P === null ? null : { x: P.x, y: reduce(-P.y, curve.p) };
}

/** Equality of points, O included. */
export function equals(P, Q) {
  if (P === null || Q === null) return P === Q;
  return P.x === Q.x && P.y === Q.y;
}

/** "(x, y)", or "O" for the point at infinity. */
export function formatPoint(P) {
  return P === null ? 'O' : `(${P.x}, ${P.y})`;
}

/** Number of binary digits of a non-negative integer (0 for 0). */
export function bitLength(k) {
  const v = BigInt(k);
  if (v < 0n) throw new RangeError('bitLength needs a non-negative integer');
  return v === 0n ? 0 : v.toString(2).length;
}

/* ------------------------------------------------------------------------ */
/* The group law                                                             */
/* ------------------------------------------------------------------------ */

/*
 * The chord-and-tangent construction shared by add and addStep: the line
 * y = λx + ν through P and Q (the tangent when P = Q; λ = null when it is
 * vertical), its third intersection R′ with the curve, and P + Q = −R′.
 */
function chordAndTangent(curve, P, Q) {
  if (P === null || Q === null) {
    return { kind: 'identity', lambda: null, nu: null, third: null, result: P === null ? Q : P };
  }
  const { p, a } = curve;
  const kind = equals(P, Q) ? 'double' : 'add';
  if (P.x === Q.x && reduce(P.y + Q.y, p) === 0n) {
    // Vertical line x = P.x: it meets the curve again only at O, so P + Q = −O = O.
    return { kind: kind === 'double' ? 'double' : 'inverse', lambda: null, nu: null, third: null, result: null };
  }
  const lambda = kind === 'double'
    ? reduce((3n * P.x * P.x + a) * inverse(curve, 2n * P.y), p)
    : reduce((Q.y - P.y) * inverse(curve, Q.x - P.x), p);
  const nu = reduce(P.y - lambda * P.x, p);
  const x3 = reduce(lambda * lambda - P.x - Q.x, p);
  const third = { x: x3, y: reduce(lambda * x3 + nu, p) };
  return { kind, lambda, nu, third, result: { x: x3, y: reduce(-third.y, p) } };
}

/** P + Q by the chord-and-tangent rule. */
export function add(curve, P, Q) {
  return chordAndTangent(curve, P, Q).result;
}

/** 2P, the tangent case of add. */
export function double(curve, P) {
  return add(curve, P, P);
}

/**
 * One group operation P + Q with every quantity of the chord-and-tangent rule.
 *   kind    'add' (P ≠ ±Q), 'double' (P = Q), 'inverse' (P = −Q ≠ Q), or
 *           'identity' (P or Q is O: nothing to draw).
 *   lambda  slope of the line y = λx + ν (mod p) through P and Q (the tangent
 *   nu      when doubling); both null for a vertical line and for 'identity'.
 *   third   the third intersection R′ = (x₃, λx₃ + ν) of the line with the
 *           curve; O (null) for a vertical line. result = P + Q = −R′.
 *   line    non-vertical: its p lattice points (x, λx + ν mod p), x = 0 … p − 1,
 *           when p ≤ LINE_POINTS_LIMIT, otherwise null; vertical:
 *           { vertical: true, x }; 'identity': null.
 * @returns {{ kind: string, P: object|null, Q: object|null, lambda: bigint|null,
 *   nu: bigint|null, third: object|null, result: object|null, line: object[]|object|null }}
 */
export function addStep(curve, P, Q) {
  const { kind, lambda, nu, third, result } = chordAndTangent(curve, P, Q);
  let line = null;
  if (kind !== 'identity') {
    line = lambda === null ? { vertical: true, x: P.x } : latticeLine(curve, lambda, nu);
  }
  return { kind, P, Q, lambda, nu, third, result, line };
}

function latticeLine(curve, lambda, nu) {
  const { p } = curve;
  if (p > LINE_POINTS_LIMIT) return null;
  const out = [];
  for (let x = 0n; x < p; x += 1n) out.push({ x, y: reduce(lambda * x + nu, p) });
  return out;
}

/* ------------------------------------------------------------------------ */
/* Exhaustive enumeration (small fields)                                     */
/* ------------------------------------------------------------------------ */

function assertEnumerable(curve) {
  if (curve.p > EXHAUSTIVE_LIMIT) {
    throw new RangeError(`exhaustive enumeration needs p ≤ 2^20, not a ${bitLength(curve.p)}-bit prime`);
  }
}

/**
 * All affine points, sorted by x and then by y. A table of square roots is
 * built once, so the cost is O(p); with p ≤ 2^20 every intermediate value is
 * an exact double-precision integer.
 * @throws {RangeError} when p > EXHAUSTIVE_LIMIT
 */
export function points(curve) {
  assertEnumerable(curve);
  const [p, a, b] = [curve.p, curve.a, curve.b].map(Number);
  // root[s] is the square root of s in [0, (p − 1) / 2], or −1 if s is not a square.
  const root = new Int32Array(p).fill(-1);
  for (let y = 0; y <= (p - 1) / 2; y += 1) root[(y * y) % p] = y;
  const out = [];
  for (let x = 0; x < p; x += 1) {
    const r = root[(((x * x) % p) * x + a * x + b) % p];
    if (r < 0) continue;
    out.push({ x: BigInt(x), y: BigInt(r) });
    if (r > 0) out.push({ x: BigInt(x), y: BigInt(p - r) });
  }
  return out;
}

/** #E(F_p): the affine points plus O. */
export function groupOrder(curve) {
  return BigInt(points(curve).length) + 1n;
}

/*
 * G, 2G, 3G, … up to the last multiple before O. Hasse's theorem bounds every
 * order by p + 1 + 2√p, which stops the walk if p is not prime or G is not on
 * the curve.
 */
function* multiplesOf(curve, G) {
  assertEnumerable(curve);
  const bound = curve.p + 1n + 2n * BigInt(Math.ceil(Math.sqrt(Number(curve.p))));
  let count = 0n;
  for (let acc = G; acc !== null; acc = add(curve, acc, G)) {
    count += 1n;
    if (count >= bound) throw new RangeError('no order within the Hasse bound: is p prime and G on the curve?');
    yield acc;
  }
}

/** The order of P: the least n ≥ 1 with nP = O, by repeated addition. */
export function orderOf(curve, P) {
  let n = 1n;
  for (const _ of multiplesOf(curve, P)) n += 1n;
  return n;
}

/** The cyclic subgroup generated by G without O: [G, 2G, …, (n − 1)G]. */
export function subgroup(curve, G) {
  return [...multiplesOf(curve, G)];
}

/* ------------------------------------------------------------------------ */
/* Scalar multiplication                                                     */
/* ------------------------------------------------------------------------ */

function toScalar(k, order) {
  let scalar = BigInt(k);
  if (order !== undefined) scalar = reduce(scalar, BigInt(order));
  if (scalar < 0n) throw new RangeError('the scalar k must be non-negative');
  return scalar;
}

/**
 * kG by repeated addition: 2G = G + G, 3G = 2G + G, …, k − 1 group
 * operations; steps[i] is the addStep record that produces (i + 2)G.
 * @param {bigint|number} k  0 ≤ k ≤ REPEATED_ADDITION_LIMIT (0G = O, no steps)
 */
export function multiplyByRepeatedAddition(curve, G, k) {
  const scalar = toScalar(k);
  if (scalar > REPEATED_ADDITION_LIMIT) {
    throw new RangeError('repeated addition is limited to k ≤ 1,000,000: use double-and-add');
  }
  if (scalar === 0n) return { result: null, steps: [] };
  const steps = [];
  let acc = G;
  for (let i = 2n; i <= scalar; i += 1n) {
    const record = addStep(curve, acc, G);
    steps.push(record);
    acc = record.result;
  }
  return { result: acc, steps };
}

/**
 * kG by the left-to-right binary method (double-and-add).
 *
 * Convention: bits is the binary expansion of k, most significant bit first.
 * Its leading 1 loads G into the accumulator without a group operation; every
 * later bit doubles the accumulator and, when it is 1, then adds G. Each step
 * is { bitIndex, bit, op, index, record }: bitIndex is the position of the bit
 * in bits (0 = most significant), bit is 0 or 1, op is 'double' or 'add',
 * index is the multiple of G held after the step, record the addStep record.
 * Example: k = 6 = 110₂ gives double (2G), add (3G), double (6G).
 * The scalar is not reduced unless options.order is given (then k may be negative).
 * @param {bigint|number} k
 * @param {{ order?: bigint }} [options]
 * @returns {{ result: object|null, bits: string, steps: object[] }}
 */
export function multiplyByDoubleAndAdd(curve, G, k, { order } = {}) {
  const scalar = toScalar(k, order);
  const bits = scalar.toString(2);
  const steps = [];
  if (scalar === 0n) return { result: null, bits, steps };
  let acc = G;
  let index = 1n;
  for (let bitIndex = 1; bitIndex < bits.length; bitIndex += 1) {
    const bit = Number(bits[bitIndex]);
    let record = addStep(curve, acc, acc);
    index *= 2n;
    steps.push({ bitIndex, bit, op: 'double', index, record });
    acc = record.result;
    if (bit === 1) {
      record = addStep(curve, acc, G);
      index += 1n;
      steps.push({ bitIndex, bit, op: 'add', index, record });
      acc = record.result;
    }
  }
  return { result: acc, bits, steps };
}

/**
 * kG by double-and-add without records: the fast path.
 * @param {bigint|number} k  non-negative, or any integer when options.order is given
 * @param {{ order?: bigint }} [options]
 */
export function multiply(curve, G, k, { order } = {}) {
  const scalar = toScalar(k, order);
  let acc = null;
  for (const bit of scalar.toString(2)) {
    acc = double(curve, acc);
    if (bit === '1') acc = add(curve, acc, G);
  }
  return acc;
}

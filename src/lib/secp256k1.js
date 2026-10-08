/**
 * Arithmetic on the elliptic curve secp256k1, written from the definitions.
 *
 * The curve is y² = x³ + 7 over the prime field F_p with
 *   p = 2^256 − 2^32 − 977,
 * and the base point G generates a cyclic group of prime order n (cofactor 1).
 * Parameters are those of Certicom Research, "SEC 2: Recommended Elliptic
 * Curve Domain Parameters", version 2.0, section 2.4.1.
 *
 * Representation
 *   - Field elements are BigInt values in [0, p).
 *   - Affine points are plain objects { x, y }; the point at infinity (the
 *     group identity) is the constant INFINITY (null).
 *   - Internally, additions and multiplications use Jacobian coordinates
 *     (X, Y, Z) with x = X / Z², y = Y / Z³, so that a chain of operations
 *     costs a single field inversion at the end. Z = 0 encodes infinity.
 *
 * This is teaching code: readable formulas, no constant-time guarantees and
 * no side-channel protection. It must not be used to handle real keys.
 */

import { bigIntToBytes, bytesToBigInt } from './bytes.js';

/** Field prime p = 2^256 − 2^32 − 977. */
export const P = 2n ** 256n - 2n ** 32n - 977n;

/** Order n of the base point G. */
export const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Curve coefficients of y² = x³ + A·x + B. */
export const A = 0n;
export const B = 7n;

/** Base point G. */
export const G = Object.freeze({
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
});

/** The point at infinity, identity of the group. */
export const INFINITY = null;

/* ------------------------------------------------------------------------ */
/* Field arithmetic                                                          */
/* ------------------------------------------------------------------------ */

/** Least non-negative residue of a modulo m (default: the field prime). */
export function mod(a, m = P) {
  const r = a % m;
  return r < 0n ? r + m : r;
}

/**
 * Multiplicative inverse modulo m by the extended Euclidean algorithm.
 * @throws when a ≡ 0 (mod m)
 */
export function inv(a, m = P) {
  let r0 = mod(a, m);
  if (r0 === 0n) throw new Error('zero has no inverse');
  let r1 = m;
  // Invariant: r0 = s0·a (mod m) and r1 = s1·a (mod m).
  let s0 = 1n;
  let s1 = 0n;
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error('element is not invertible');
  return mod(s0, m);
}

/** Modular exponentiation by square-and-multiply. */
export function powMod(base, exponent, m = P) {
  let result = 1n;
  let b = mod(base, m);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

/**
 * A square root of a modulo p, or null when a is not a quadratic residue.
 * Because p ≡ 3 (mod 4), the candidate root is a^((p + 1) / 4); it is a root
 * exactly when a is a square (Euler's criterion).
 */
export function sqrt(a) {
  const candidate = powMod(a, (P + 1n) / 4n);
  return (candidate * candidate) % P === mod(a) ? candidate : null;
}

/**
 * Inverses of several field elements with one inversion (Montgomery's trick):
 * multiply prefixes, invert the total product once, then peel the prefixes.
 * @param {bigint[]} values non-zero field elements
 * @returns {bigint[]}
 */
export function batchInverse(values) {
  const prefix = new Array(values.length);
  let acc = 1n;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === 0n) throw new Error('zero has no inverse');
    prefix[i] = acc;
    acc = (acc * values[i]) % P;
  }
  let invAcc = inv(acc);
  const out = new Array(values.length);
  for (let i = values.length - 1; i >= 0; i -= 1) {
    out[i] = (invAcc * prefix[i]) % P;
    invAcc = (invAcc * values[i]) % P;
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Affine points                                                             */
/* ------------------------------------------------------------------------ */

/** True when the point is INFINITY or satisfies y² = x³ + 7 with coordinates in [0, p). */
export function isOnCurve(point) {
  if (point === INFINITY) return true;
  const { x, y } = point;
  if (x < 0n || x >= P || y < 0n || y >= P) return false;
  return (y * y) % P === (x * x * x + A * x + B) % P;
}

/** The additive inverse −Q = (x, −y). */
export function negate(point) {
  if (point === INFINITY) return INFINITY;
  return { x: point.x, y: mod(-point.y) };
}

/** Equality of affine points. */
export function equals(a, b) {
  if (a === INFINITY || b === INFINITY) return a === b;
  return a.x === b.x && a.y === b.y;
}

/* ------------------------------------------------------------------------ */
/* Jacobian coordinates                                                      */
/* ------------------------------------------------------------------------ */

/** Jacobian representation of the point at infinity. */
export const JACOBIAN_INFINITY = Object.freeze({ X: 1n, Y: 1n, Z: 0n });

/** Lifts an affine point to Jacobian coordinates (Z = 1). */
export function toJacobian(point) {
  if (point === INFINITY) return JACOBIAN_INFINITY;
  return { X: point.x, Y: point.y, Z: 1n };
}

/** Projects a Jacobian point back to affine coordinates with one inversion. */
export function jacobianToAffine(j) {
  if (j.Z === 0n) return INFINITY;
  const zInv = inv(j.Z);
  const zInv2 = (zInv * zInv) % P;
  return { x: (j.X * zInv2) % P, y: (j.Y * zInv2 * zInv) % P };
}

/**
 * Doubling in Jacobian coordinates for a curve with A = 0
 * (formula "dbl-2009-l" of the Explicit-Formulas Database).
 */
export function jacobianDouble(j) {
  if (j.Z === 0n || j.Y === 0n) return JACOBIAN_INFINITY;
  const { X, Y, Z } = j;
  const a = (X * X) % P;
  const b = (Y * Y) % P;
  const c = (b * b) % P;
  const d = mod(2n * ((X + b) * (X + b) - a - c));
  const e = (3n * a) % P;
  const f = (e * e) % P;
  const X3 = mod(f - 2n * d);
  const Y3 = mod(e * (d - X3) - 8n * c);
  const Z3 = (2n * Y * Z) % P;
  return { X: X3, Y: Y3, Z: Z3 };
}

/** Addition of two Jacobian points (general case, with the degenerate cases handled). */
export function jacobianAdd(j1, j2) {
  if (j1.Z === 0n) return j2;
  if (j2.Z === 0n) return j1;
  const Z1Z1 = (j1.Z * j1.Z) % P;
  const Z2Z2 = (j2.Z * j2.Z) % P;
  const U1 = (j1.X * Z2Z2) % P;
  const U2 = (j2.X * Z1Z1) % P;
  const S1 = (j1.Y * Z2Z2 * j2.Z) % P;
  const S2 = (j2.Y * Z1Z1 * j1.Z) % P;
  if (U1 === U2) {
    // Same x: either the same point (double it) or opposite points (infinity).
    return S1 === S2 ? jacobianDouble(j1) : JACOBIAN_INFINITY;
  }
  const H = mod(U2 - U1);
  const R = mod(S2 - S1);
  const HH = (H * H) % P;
  const HHH = (HH * H) % P;
  const V = (U1 * HH) % P;
  const X3 = mod(R * R - HHH - 2n * V);
  const Y3 = mod(R * (V - X3) - S1 * HHH);
  const Z3 = (H * j1.Z * j2.Z) % P;
  return { X: X3, Y: Y3, Z: Z3 };
}

/**
 * Mixed addition: a Jacobian point plus an affine point (Z2 = 1). This is the
 * operation the toy hash performs once per message byte, so it is the one
 * worth keeping cheap.
 */
export function jacobianAddAffine(j, point) {
  if (point === INFINITY) return j;
  if (j.Z === 0n) return toJacobian(point);
  const Z1Z1 = (j.Z * j.Z) % P;
  const U2 = (point.x * Z1Z1) % P;
  const S2 = (point.y * Z1Z1 * j.Z) % P;
  if (j.X === U2) {
    return j.Y === S2 ? jacobianDouble(j) : JACOBIAN_INFINITY;
  }
  const H = mod(U2 - j.X);
  const R = mod(S2 - j.Y);
  const HH = (H * H) % P;
  const HHH = (HH * H) % P;
  const V = (j.X * HH) % P;
  const X3 = mod(R * R - HHH - 2n * V);
  const Y3 = mod(R * (V - X3) - j.Y * HHH);
  const Z3 = (H * j.Z) % P;
  return { X: X3, Y: Y3, Z: Z3 };
}

/* ------------------------------------------------------------------------ */
/* Group operations on affine points                                         */
/* ------------------------------------------------------------------------ */

/** Sum of two affine points. */
export function add(a, b) {
  return jacobianToAffine(jacobianAddAffine(toJacobian(a), b));
}

/** 2·Q. */
export function double(point) {
  return jacobianToAffine(jacobianDouble(toJacobian(point)));
}

/**
 * Scalar multiplication k·Q by the double-and-add method, scanning the bits
 * of k from the most significant one. Scalars are reduced modulo n, since
 * n·Q = ∞ for every point of the group; negative scalars act on −Q.
 * @param {{x: bigint, y: bigint} | null} point
 * @param {bigint} k
 */
export function mul(point, k) {
  let scalar = mod(k, N);
  if (point === INFINITY || scalar === 0n) return INFINITY;
  let acc = JACOBIAN_INFINITY;
  for (let bit = scalar.toString(2).length - 1; bit >= 0; bit -= 1) {
    acc = jacobianDouble(acc);
    if ((scalar >> BigInt(bit)) & 1n) acc = jacobianAddAffine(acc, point);
  }
  return jacobianToAffine(acc);
}

/**
 * The table [0·Q, 1·Q, …, (count − 1)·Q] of affine points, built with
 * successive mixed additions and a single batched inversion at the end.
 * The toy hash keeps one such table per message byte position.
 * @param {{x: bigint, y: bigint} | null} point
 * @param {number} [count=256]
 */
export function multiplesTable(point, count = 256) {
  const jacobians = new Array(count);
  jacobians[0] = JACOBIAN_INFINITY;
  for (let i = 1; i < count; i += 1) jacobians[i] = jacobianAddAffine(jacobians[i - 1], point);

  const finite = [];
  for (let i = 0; i < count; i += 1) if (jacobians[i].Z !== 0n) finite.push(i);
  const zInverses = batchInverse(finite.map((i) => jacobians[i].Z));

  const table = new Array(count).fill(INFINITY);
  finite.forEach((i, k) => {
    const zInv = zInverses[k];
    const zInv2 = (zInv * zInv) % P;
    table[i] = { x: (jacobians[i].X * zInv2) % P, y: (jacobians[i].Y * zInv2 * zInv) % P };
  });
  return table;
}

/* ------------------------------------------------------------------------ */
/* Encoding                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * SEC 1 compressed encoding: one parity byte (0x02 for even y, 0x03 for odd y)
 * followed by the 32-byte big-endian x-coordinate.
 */
export function compress(point) {
  if (point === INFINITY) throw new Error('the point at infinity has no compressed encoding');
  const out = new Uint8Array(33);
  out[0] = point.y % 2n === 0n ? 0x02 : 0x03;
  out.set(bigIntToBytes(point.x, 32, 'be'), 1);
  return out;
}

/** Recovers the affine point from its compressed encoding. */
export function decompress(bytes) {
  if (bytes.length !== 33 || (bytes[0] !== 0x02 && bytes[0] !== 0x03)) {
    throw new Error('expected 33 bytes starting with 0x02 or 0x03');
  }
  const x = bytesToBigInt(bytes.subarray(1), 'be');
  if (x >= P) throw new Error('x-coordinate is not a field element');
  const y = sqrt(mod(x * x * x + A * x + B));
  if (y === null) throw new Error('x-coordinate is not on the curve: no square root');
  const wantOdd = bytes[0] === 0x03;
  return { x, y: (y % 2n === 1n) === wantOdd ? y : mod(-y) };
}

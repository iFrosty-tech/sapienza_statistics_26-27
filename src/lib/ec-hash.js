/**
 * A toy hash function built on secp256k1.
 *
 * For a message of bytes b_0, b_1, …, b_{L−1} and a family of curve points
 * (generators) G_0, G_1, …, the hash is the x-coordinate of the point
 *
 *     H(m) = x( Σ_i b_i · G_i ),
 *
 * written as 32 big-endian bytes. The point at infinity (reached only by the
 * all-zero message) is mapped to the all-zero digest.
 *
 * Two generator families share this single definition:
 *
 *   scalar    G_i = 2^(8i) · G.  Then Σ b_i · 2^(8i) · G = k · G with
 *             k = int_LE(m): the message is read as a little-endian integer and
 *             the digest is the x-coordinate of the public key of private key k,
 *             exactly the map Bitcoin uses to derive public keys. It is one-way
 *             (discrete logarithm problem) but has trivial second preimages:
 *             H(k) = H(n − k) because k·G and (n − k)·G = −k·G share their x,
 *             and H(k) = H(k + n) because n·G = ∞.
 *
 *   pedersen  G_i are "nothing-up-my-sleeve" points obtained by hashing the
 *             index to the curve, so no discrete-log relation between them is
 *             known. This is the hash of Pedersen (1991) with 8-bit chunks:
 *             a collision Σ b_i G_i = Σ b'_i G_i would reveal a non-trivial
 *             linear relation among the generators, hence a discrete logarithm.
 *             It remains additively homomorphic, so it is collision resistant
 *             without behaving like a random oracle.
 *
 * Implementation: for every byte position i a table of the 256 multiples
 * 0·G_i … 255·G_i is precomputed once, and hashing a message costs one mixed
 * point addition per non-zero byte plus one field inversion.
 */

import {
  G,
  N,
  P,
  INFINITY,
  JACOBIAN_INFINITY,
  jacobianAddAffine,
  jacobianToAffine,
  mod,
  mul,
  multiplesTable,
  sqrt,
} from './secp256k1.js';
import { sha256 } from './sha256.js';
import { bigIntToBytes, bytesToBigInt, concatBytes, utf8Bytes } from './bytes.js';

/** Domain separation tag used to derive the Pedersen generators. */
export const DST = 'secp256k1-toy-hash/generator/v1';

/** The generator families implemented. */
export const VARIANTS = Object.freeze(['scalar', 'pedersen']);

const u32be = (n) => bigIntToBytes(BigInt(n), 4, 'be');

/**
 * Hash-to-curve by "try and increment": hash (label, index, counter) with
 * SHA-256, read the digest as a candidate x-coordinate, and accept the first
 * candidate that lies on the curve, choosing the root y of even parity.
 * Each attempt succeeds with probability about 1/2, so the expected number of
 * SHA-256 calls is two. The method is deterministic and public, so nobody
 * knows a discrete logarithm of the resulting point with respect to G.
 * (A constant-time encoding such as RFC 9380 is the production alternative;
 * timing is irrelevant here because the inputs are public indices.)
 * @param {string} label domain separation tag
 * @param {number} index generator index
 * @returns {{ point: {x: bigint, y: bigint}, counter: number }}
 */
export function hashToCurveTryAndIncrement(label, index) {
  const prefix = utf8Bytes(label);
  for (let counter = 0; ; counter += 1) {
    const candidate = bytesToBigInt(sha256(concatBytes(prefix, u32be(index), u32be(counter))), 'be');
    if (candidate >= P) continue;
    const y = sqrt(mod(candidate ** 3n + 7n));
    if (y === null) continue;
    return { point: { x: candidate, y: y % 2n === 0n ? y : P - y }, counter };
  }
}

const scalarGenerators = [];
const pedersenGenerators = [];

/** G_i = 2^(8i) · G for the scalar family. */
export function scalarGenerator(i) {
  if (scalarGenerators[i] === undefined) scalarGenerators[i] = mul(G, 1n << BigInt(8 * i));
  return scalarGenerators[i];
}

/** G_i = HashToCurve(DST, i) for the Pedersen family. */
export function pedersenGenerator(i) {
  if (pedersenGenerators[i] === undefined) pedersenGenerators[i] = hashToCurveTryAndIncrement(DST, i).point;
  return pedersenGenerators[i];
}

/** The i-th generator of a family. */
export function generator(variant, i) {
  if (variant === 'scalar') return scalarGenerator(i);
  if (variant === 'pedersen') return pedersenGenerator(i);
  throw new Error(`unknown variant "${variant}"; expected one of ${VARIANTS.join(', ')}`);
}

const tables = { scalar: [], pedersen: [] };

/** The precomputed multiples 0·G_i … 255·G_i, built on first use. */
export function generatorTable(variant, i) {
  const family = tables[variant];
  if (family === undefined) throw new Error(`unknown variant "${variant}"; expected one of ${VARIANTS.join(', ')}`);
  if (family[i] === undefined) family[i] = multiplesTable(generator(variant, i), 256);
  return family[i];
}

/**
 * The curve point Σ_i b_i · G_i of a message.
 * @param {Uint8Array} bytes non-empty message
 * @param {'scalar' | 'pedersen'} variant
 * @returns {{x: bigint, y: bigint} | null}
 */
export function ecHashPoint(bytes, variant = 'scalar') {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown variant "${variant}"; expected one of ${VARIANTS.join(', ')}`);
  if (bytes.length === 0) throw new Error('the toy hash needs a non-empty message');
  let acc = JACOBIAN_INFINITY;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b !== 0) acc = jacobianAddAffine(acc, generatorTable(variant, i)[b]);
  }
  return jacobianToAffine(acc);
}

/** The 32-byte digest of a point: its x-coordinate, or zeros for ∞. */
export function digestOfPoint(point) {
  return point === INFINITY ? new Uint8Array(32) : bigIntToBytes(point.x, 32, 'be');
}

/**
 * The toy hash.
 * @param {Uint8Array} bytes non-empty message
 * @param {{ variant?: 'scalar' | 'pedersen' }} [options]
 * @returns {{ variant: string, point: {x: bigint, y: bigint} | null, digest: Uint8Array }}
 */
export function ecHash(bytes, { variant = 'scalar' } = {}) {
  const point = ecHashPoint(bytes, variant);
  return { variant, point, digest: digestOfPoint(point) };
}

/** The scalar k = int_LE(m) mod n that the scalar variant multiplies G by. */
export function scalarOf(bytes) {
  return bytesToBigInt(bytes, 'le') % N;
}

/** The little-endian message of a given length whose scalar is k. */
export function messageFromScalar(k, length) {
  return bigIntToBytes(k, length, 'le');
}

/**
 * Messages that collide with `bytes` under the scalar variant for structural
 * reasons, not by chance:
 *   negation  encodes n − k, whose point is −k·G (same x);
 *   wrap      encodes int_LE(m) + n, whose point is k·G again (n·G = ∞).
 * Each is encoded little-endian in `length` bytes (default: the message length,
 * widened to 32 bytes for the negation and 33 for the wrap so that they fit);
 * null when the value does not fit the requested length.
 * @param {Uint8Array} bytes
 * @param {{ length?: number }} [options]
 */
export function scalarCollisionMessages(bytes, { length } = {}) {
  const raw = bytesToBigInt(bytes, 'le');
  const k = raw % N;
  const encode = (value, minLength) => {
    const len = length ?? Math.max(bytes.length, minLength);
    if (value >> BigInt(8 * len) !== 0n) return null;
    return bigIntToBytes(value, len, 'le');
  };
  return {
    scalar: k,
    negation: encode(mod(N - k, N), 32),
    wrap: encode(raw + N, 33),
  };
}

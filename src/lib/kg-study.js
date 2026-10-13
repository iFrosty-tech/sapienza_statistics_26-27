/**
 * The statistical study of homework 01: the map k ↦ Q = kG on elliptic curves
 * y² = x³ + 7, from the toy curve over F₁₇ to secp256k1, with Keccak-256 of
 * the same private keys as the hash-function baseline.
 *
 * Experiments (the E-numbers of the page)
 *   E1 coordinate distribution    E5 input–output correlation
 *   E2 value frequency (occupancy) E6 avalanche, SAC and related outputs
 *   E3 bit distribution            E7 cost of inverting k ↦ kG (ECDLP)
 *   E4 apparent uniformity         E8 cost of computing kG (double-and-add)
 *
 * Small and medium curves (the LADDER) are enumerated exhaustively over
 * k = 1, …, n − 1: their results are exact population values, not samples.
 * secp256k1 is sampled: N private keys drawn uniformly from [1, n − 1] by
 * rejection sampling from the seeded generator of random.js, so that every
 * figure is reproducible from its seed. That generator is statistical, not
 * cryptographic: real keys must come from a cryptographically secure source.
 *
 * Every experiment is a pure function returning plain data ready for charts
 * and JSON (a module-level cache of precomputed multiples of G is the only
 * state). Conventions: bit 0 of an integer is its least significant bit;
 * p-values are named pValue, so that p always denotes the field prime;
 * BigInt values that cross JSON are written as decimal strings.
 *
 * Teaching code: no constant-time guarantees. It must not handle real keys.
 */

import { createRandom } from './random.js';
import { keccak256 } from './keccak.js';
import { bigIntToBytes, bytesToBigInt } from './bytes.js';
import { linearFit } from './normal.js';
import {
  G as SECP_G,
  N as ORDER,
  P as SECP_P,
  JACOBIAN_INFINITY,
  batchInverse,
  double as secpDouble,
  jacobianAddAffine,
  jacobianToAffine,
  mod as secpMod,
  negate as secpNegate,
  toJacobian,
} from './secp256k1.js';
import { TOY_BASE, TOY_CURVE, TOY_PRIVATE_KEY, formatPoint, multiplyByDoubleAndAdd, multiplyByRepeatedAddition } from './toy-curve.js';
import {
  binnedBinomialChiSquare,
  binomialPmfTable,
  chiSquareGoodnessOfFit,
  chiSquareSf,
  fisherZTest,
  monobitFromCounts,
  pearson,
  poissonBinomialPmf,
  poissonPmf,
  pooledChiSquare,
  spearman,
  zScore,
} from './stats.js';

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

const sum = (xs) => {
  let s = 0;
  for (const x of xs) s += x;
  return s;
};

/* Mean and sample standard deviation of a variable given its histogram of counts. */
function momentsOfCounts(counts) {
  const total = sum(counts);
  let mean = 0;
  counts.forEach((c, k) => (mean += k * c));
  mean /= total;
  let ss = 0;
  counts.forEach((c, k) => (ss += c * (k - mean) ** 2));
  return { mean, sd: total > 1 ? Math.sqrt(ss / (total - 1)) : 0 };
}

/* Linear-interpolation quantile (type 7 of Hyndman and Fan) of a sorted array. */
function quantile(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}

function describe(values) {
  const s = [...values].sort((a, b) => a - b);
  return { mean: sum(s) / s.length, min: s[0], q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1] };
}

/* Number of 1 bits of a 32-bit integer. */
function popcount(v) {
  let w = v - ((v >>> 1) & 0x55555555);
  w = (w & 0x33333333) + ((w >>> 2) & 0x33333333);
  return Math.imul((w + (w >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/* Hexadecimal digits: value of each character code, and the set bits of each nibble and byte. */
const HEX_VALUE = new Int8Array(128).fill(-1);
for (let d = 0; d < 16; d += 1) HEX_VALUE[d.toString(16).charCodeAt(0)] = d;
const BITS_OF = Array.from({ length: 256 }, (_, v) => [0, 1, 2, 3, 4, 5, 6, 7].filter((t) => (v >> t) & 1));
const NIBBLE_POPCOUNT = BITS_OF.slice(0, 16).map((b) => b.length);

/* Number of 1 bits of a non-negative BigInt. */
function popcountBig(v) {
  const hex = v.toString(16);
  let w = 0;
  for (let i = 0; i < hex.length; i += 1) w += NIBBLE_POPCOUNT[HEX_VALUE[hex.charCodeAt(i)]];
  return w;
}

/* Adds 1 to counts[offset + j] for every set bit j < limit of a non-negative BigInt. */
function tallyBits(counts, offset, v, limit = Infinity) {
  const hex = v.toString(16);
  const last = hex.length - 1;
  for (let c = 0; c <= last; c += 1) {
    const nibble = HEX_VALUE[hex.charCodeAt(last - c)];
    if (nibble === 0) continue;
    for (const t of BITS_OF[nibble]) {
      const j = 4 * c + t;
      if (j < limit) counts[offset + j] += 1;
    }
  }
}

/* a / b for BigInt values as a double, with 64 extra bits of quotient precision. */
const ratio = (a, b) => Number((a << 64n) / b) / 2 ** 64;

/* Number of binary digits of a positive integer. */
const bitLength = (n) => n.toString(2).length;

/**
 * A sub-seed for one part of the study: the seed XOR the 32-bit FNV-1a hash
 * of a label, so that the key sample, the bit flips and the discrete-log
 * targets use distinct generator streams derived from one reported seed.
 * @param {number} seed
 * @param {string} label
 */
export function deriveSeed(seed, label) {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i += 1) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (seed ^ h) >>> 0;
}

/** Primality by trial division (for the small integers of the study). */
export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let d = 5; d * d <= n; d += 6) if (n % d === 0 || n % (d + 2) === 0) return false;
  return true;
}

/** Prime factorisation by trial division: [{ prime, exponent }] in increasing order. */
export function factorize(n) {
  const out = [];
  let m = n;
  for (let d = 2; d * d <= m; d += d === 2 ? 1 : 2) {
    let e = 0;
    while (m % d === 0) {
      m /= d;
      e += 1;
    }
    if (e > 0) out.push({ prime: d, exponent: e });
  }
  if (m > 1) out.push({ prime: m, exponent: 1 });
  return out;
}

/* ------------------------------------------------------------------------ */
/* Small curves: a Number-arithmetic fast path                               */
/* ------------------------------------------------------------------------ */

/*
 * For p < 2^26 every product of two residues is below 2^52 and therefore an
 * exact double, so the affine group law runs on plain numbers, much faster
 * than on BigInt. The tests check it against src/lib/toy-curve.js. Points are
 * { x, y } with Number coordinates; null is the point at infinity O.
 */
const FAST_LIMIT = 2 ** 26;

const nmod = (v, p) => {
  const r = v % p;
  return r < 0 ? r + p : r;
};

function ninv(v, p) {
  let r0 = nmod(v, p);
  if (r0 === 0) throw new RangeError('0 has no inverse');
  let r1 = p;
  let s0 = 1;
  let s1 = 0;
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    const r2 = r0 - q * r1;
    r0 = r1;
    r1 = r2;
    const s2 = s0 - q * s1;
    s0 = s1;
    s1 = s2;
  }
  return nmod(s0, p);
}

function fastCurve({ p, a = 0, b = 7 }) {
  if (!Number.isInteger(p) || p <= 3 || p >= FAST_LIMIT) throw new RangeError('the fast path needs a prime 3 < p < 2^26');
  return { p, a: nmod(a, p), b: nmod(b, p) };
}

function nadd(c, P, Q) {
  if (P === null) return Q;
  if (Q === null) return P;
  const { p } = c;
  let lambda;
  if (P.x === Q.x) {
    if (nmod(P.y + Q.y, p) === 0) return null;
    lambda = nmod(nmod(3 * nmod(P.x * P.x, p) + c.a, p) * ninv(2 * P.y, p), p);
  } else {
    lambda = nmod(nmod(Q.y - P.y, p) * ninv(Q.x - P.x, p), p);
  }
  const x = nmod(lambda * lambda - P.x - Q.x, p);
  return { x, y: nmod(lambda * (P.x - x) - P.y, p) };
}

/* kP by double-and-add, for a non-negative integer k. */
function nmul(c, P, k) {
  let acc = null;
  let base = P;
  for (let e = k; e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) acc = nadd(c, acc, base);
    base = nadd(c, base, base);
  }
  return acc;
}

const rhs = (c, x) => nmod(nmod(x * x, c.p) * x + c.a * x + c.b, c.p);

/* All affine points sorted by x, then y (O(p) with a table of square roots). */
function enumeratePoints(c) {
  const { p } = c;
  const root = new Int32Array(p).fill(-1);
  for (let y = 0; y <= (p - 1) / 2; y += 1) root[(y * y) % p] = y;
  const out = [];
  for (let x = 0; x < p; x += 1) {
    const r = root[rhs(c, x)];
    if (r < 0) continue;
    out.push({ x, y: r });
    if (r > 0) out.push({ x, y: p - r });
  }
  return out;
}

/* #E(F_p) = 1 + Σ_x (1 + χ(x³ + ax + b)), χ the quadratic character. */
function countPoints(c) {
  const { p } = c;
  const square = new Uint8Array(p);
  for (let y = 1; y <= (p - 1) / 2; y += 1) square[(y * y) % p] = 1;
  let count = 1;
  for (let x = 0; x < p; x += 1) {
    const v = rhs(c, x);
    count += v === 0 ? 1 : 2 * square[v];
  }
  return count;
}

/* The order of P in a group of known order: strip each prime factor while the cofactor multiple stays O. */
function orderOfPoint(c, P, groupOrder, factors = factorize(groupOrder)) {
  let order = groupOrder;
  for (const { prime } of factors) {
    while (order % prime === 0 && nmul(c, P, order / prime) === null) order /= prime;
  }
  return order;
}

/* ------------------------------------------------------------------------ */
/* The curve ladder                                                          */
/* ------------------------------------------------------------------------ */

const LADDER_SPEC = [
  {
    id: 'T17',
    label: 'y² = x³ + 7 over F₁₇',
    p: 17,
    role: 'the toy curve of the assignment',
    bases: [
      { key: 'T17', name: 'assignment base point', rule: 'first' },
      { key: 'T17g', name: 'generator of the whole group', rule: 'maximal' },
    ],
  },
  {
    id: 'S1031',
    label: 'y² = x³ + 7 over F₁₀₃₁',
    p: 1031,
    role: 'supersingular contrast: p ≡ 2 (mod 3), #E = p + 1',
    bases: [{ key: 'S1031', name: 'first point of maximal order', rule: 'maximal' }],
  },
  {
    id: 'O1051',
    label: 'y² = x³ + 7 over F₁₀₅₁',
    p: 1051,
    role: 'prime group order, like secp256k1',
    bases: [{ key: 'O1051', name: 'first affine point', rule: 'first' }],
  },
  {
    id: 'O16477',
    label: 'y² = x³ + 7 over F₁₆₄₇₇',
    p: 16477,
    role: 'prime group order, larger',
    bases: [{ key: 'O16477', name: 'first affine point', rule: 'first' }],
  },
];

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function buildEntry(spec) {
  const c = fastCurve({ p: spec.p });
  const points = enumeratePoints(c);
  const groupOrder = points.length + 1;
  const factors = factorize(groupOrder);
  const first = { point: points[0], n: orderOfPoint(c, points[0], groupOrder, factors) };
  // First point, in (x, y) order, of maximal order (a generator when the group is cyclic).
  let maximal = first;
  for (const point of points) {
    if (maximal.n === groupOrder) break;
    const n = orderOfPoint(c, point, groupOrder, factors);
    if (n > maximal.n) maximal = { point, n };
  }
  const bases = spec.bases.map(({ key, name, rule }) => {
    const chosen = rule === 'first' ? first : maximal;
    return { key, name, x: chosen.point.x, y: chosen.point.y, n: chosen.n };
  });
  return {
    id: spec.id,
    label: spec.label,
    p: spec.p,
    a: 0,
    b: 7,
    pMod3: spec.p % 3,
    groupOrder,
    cyclic: maximal.n === groupOrder,
    base: { x: bases[0].x, y: bases[0].y },
    n: bases[0].n,
    bits: bitLength(spec.p - 1),
    role: spec.role,
    bases,
  };
}

/**
 * The small and medium curves y² = x³ + 7 of the study, enumerated
 * exhaustively. Group orders, base points and their orders are computed at
 * load time (a few milliseconds), not hard-coded. Each entry is
 * { id, label, p, a, b, pMod3, groupOrder, cyclic, base, n, bits, role, bases }:
 * base and n describe the primary base point (bases[0]); bits = ⌈log₂ p⌉ is
 * the width of a coordinate. T17 has two bases: the assignment's G = (1, 5)
 * of order 9 and the generator (6, 6) of order 18.
 */
export const LADDER = deepFreeze(LADDER_SPEC.map(buildEntry));

/**
 * The cyclic subgroup generated by a base point, as two coordinate arrays:
 * xs[k − 1], ys[k − 1] are the coordinates of kG for k = 1, …, n − 1.
 * @param {object} entry a LADDER entry
 * @param {{ x: number|bigint, y: number|bigint, key?: string }} [base] default entry.base
 * @returns {{ id: string, key: string, p: number, base: { x: number, y: number }, n: number, xs: Int32Array, ys: Int32Array }}
 */
export function orbit(entry, base = entry.base) {
  const c = fastCurve(entry);
  const G = { x: Number(base.x), y: Number(base.y) };
  if (nmod(G.y * G.y, c.p) !== rhs(c, G.x)) throw new RangeError(`(${G.x}, ${G.y}) is not on the curve`);
  const xs = [];
  const ys = [];
  const hasse = c.p + 1 + 2 * Math.ceil(Math.sqrt(c.p));
  for (let P = G; P !== null; P = nadd(c, P, G)) {
    xs.push(P.x);
    ys.push(P.y);
    if (xs.length >= hasse) throw new RangeError('no order within the Hasse bound');
  }
  return { id: entry.id, key: base.key ?? entry.id, p: c.p, base: G, n: xs.length + 1, xs: Int32Array.from(xs), ys: Int32Array.from(ys) };
}

/* ------------------------------------------------------------------------ */
/* E1 coordinate distribution                                                */
/* ------------------------------------------------------------------------ */

/**
 * Histogram of integer values on [0, p) in `bins` bins, against the uniform
 * law on the integers of [0, p). Bin j holds the integers v with
 * ⌊v·bins / p⌋ = j, that is [⌈jp/bins⌉, ⌈(j + 1)p/bins⌉); when bins does not
 * divide p the widths differ by one and each expected count is
 * total · width / p, exactly. Values and p may be Numbers or BigInts (for
 * BigInts, edges and widths are returned as decimal strings).
 * @returns {{ bins: number, total: number, edges: (number|string)[], widths: (number|string)[],
 *   counts: number[], expected: number[], minExpected: number, statistic: number, df: number, pValue: number }}
 */
export function coordinateDistribution(values, p, bins) {
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError('bins must be a positive integer');
  const total = values.length;
  if (total === 0) throw new RangeError('no values');
  const counts = new Array(bins).fill(0);
  let edges;
  let widths;
  let expected;
  if (typeof p === 'bigint') {
    const B = BigInt(bins);
    const lower = Array.from({ length: bins + 1 }, (_, j) => (BigInt(j) * p + B - 1n) / B);
    for (const v of values) counts[Number((BigInt(v) * B) / p)] += 1;
    const w = lower.slice(1).map((e, j) => e - lower[j]);
    edges = lower.map(String);
    widths = w.map(String);
    expected = w.map((wj) => total * ratio(wj, p));
  } else {
    if (bins > p) throw new RangeError('more bins than integers in [0, p)');
    edges = Array.from({ length: bins + 1 }, (_, j) => Math.ceil((j * p) / bins));
    for (const v of values) counts[Math.floor((Number(v) * bins) / p)] += 1;
    widths = edges.slice(1).map((e, j) => e - edges[j]);
    expected = widths.map((wj) => (total * wj) / p);
  }
  const fit = chiSquareGoodnessOfFit(counts, expected);
  return { bins, total, edges, widths, counts, expected, minExpected: Math.min(...expected), statistic: fit.statistic, df: fit.df, pValue: fit.p };
}

/* ------------------------------------------------------------------------ */
/* E2 value frequency (occupancy)                                            */
/* ------------------------------------------------------------------------ */

/**
 * Expected number of field values hit exactly m times, m = 0, …, mMax, when
 * λp values fall independently and uniformly on p cells: p·e^−λ λ^m / m!
 * (the Poisson limit of the occupancy law of a random function).
 */
export function poissonReference(lambda, p, mMax) {
  return Array.from({ length: mMax + 1 }, (_, m) => p * poissonPmf(m, lambda));
}

/* Chi-square of observed multiplicities against Poisson(λ), the last category being m ≥ max. */
function poissonOccupancyTest(counts, lambda, p) {
  const expected = counts.map((_, m) => p * poissonPmf(m, lambda));
  const below = sum(expected.slice(0, -1));
  expected[expected.length - 1] = Math.max(0, p - below);
  const fit = pooledChiSquare(counts, expected);
  return { statistic: fit.statistic, df: fit.df, pValue: fit.p, bins: fit.bins };
}

/**
 * Occupancy of F_p by a list of values in [0, p): how many field values are
 * hit exactly m times, against the Poisson(λ) law of a random function with
 * λ = number of values / p, and a chi-square test with pooling of expected
 * counts below 5. multiplicity lists only the m that occur; counts is dense.
 * @returns {{ total: number, p: number, lambda: number, max: number, counts: number[],
 *   multiplicity: Object<number, number>, reference: number[], test: object }}
 */
export function occupancy(values, p) {
  const hits = new Int32Array(p);
  for (const v of values) {
    const i = Number(v);
    if (!(i >= 0 && i < p)) throw new RangeError(`value ${v} is outside [0, ${p})`);
    hits[i] += 1;
  }
  let max = 0;
  for (const h of hits) if (h > max) max = h;
  const counts = new Array(max + 1).fill(0);
  for (const h of hits) counts[h] += 1;
  const multiplicity = {};
  counts.forEach((c, m) => {
    if (c > 0) multiplicity[m] = c;
  });
  const lambda = values.length / p;
  return {
    total: values.length,
    p,
    lambda,
    max,
    counts,
    multiplicity,
    reference: poissonReference(lambda, p, max),
    test: poissonOccupancyTest(counts, lambda, p),
  };
}

/* Keccak-256 of k as 32 big-endian bytes, reduced modulo a small p (Horner over the bytes). */
function keccakResidue(k, p) {
  const digest = keccak256(bigIntToBytes(BigInt(k), 32, 'be'));
  let r = 0;
  for (const byte of digest) r = (r * 256 + byte) % p;
  return r;
}

/**
 * The hash baseline of E2: the multiset { Keccak-256(k) mod p : k = 1, …, n − 1 },
 * k encoded as 32 big-endian bytes, and its occupancy. This is what the values
 * of a random function into F_p look like.
 * @returns {{ n: number, p: number, values: Int32Array, occupancy: object }}
 */
export function keccakModP(entry, n = entry.n) {
  const values = new Int32Array(n - 1);
  for (let k = 1; k < n; k += 1) values[k - 1] = keccakResidue(k, entry.p);
  return { n, p: entry.p, values, occupancy: occupancy(values, entry.p) };
}

/* ------------------------------------------------------------------------ */
/* E3 bit distribution                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Number of ones at each bit position j = 0, …, bits − 1 (bit 0 = least
 * significant) over a list of non-negative integers (Numbers or BigInts).
 * @returns {{ total: number, bits: number, ones: number[], frequency: number[] }}
 */
export function bitFrequency(values, bits) {
  const ones = new Array(bits).fill(0);
  for (const v of values) {
    if (typeof v === 'bigint') tallyBits(ones, 0, v, bits);
    else for (let j = 0; j < bits; j += 1) ones[j] += j < 31 ? (v >> j) & 1 : Math.floor(v / 2 ** j) % 2;
  }
  const total = values.length;
  return { total, bits, ones, frequency: ones.map((c) => c / total) };
}

/**
 * q_j = (number of integers in [0, p) with bit j set) / p, for j < bits: the
 * exact bit frequencies of a uniform variable on [0, p). Each period 2^(j+1)
 * contributes 2^j ones, and the incomplete last period max(0, (p mod 2^(j+1)) − 2^j).
 * @param {number|bigint} p
 * @returns {number[]}
 */
export function exactBitExpectation(p, bits) {
  if (typeof p === 'bigint') {
    return Array.from({ length: bits }, (_, j) => {
      const half = 1n << BigInt(j);
      const period = half << 1n;
      const rest = p % period;
      return ratio((p / period) * half + (rest > half ? rest - half : 0n), p);
    });
  }
  return Array.from({ length: bits }, (_, j) => {
    const half = 2 ** j;
    const period = 2 * half;
    return (Math.floor(p / period) * half + Math.max(0, (p % period) - half)) / p;
  });
}

/**
 * E3 for one list of values: per-bit frequencies, the exact expectation q_j
 * on [0, p), z-scores against ½ and against q_j (binomial standard error),
 * the per-bit monobit p-values of NIST SP 800-22 §2.1 (against ½) and the
 * monobit test on all bits pooled.
 */
export function bitStudy(values, p, bits) {
  const f = bitFrequency(values, bits);
  const expected = exactBitExpectation(p, bits);
  const zHalf = f.ones.map((c) => zScore(c, f.total, 0.5));
  const zExact = f.ones.map((c, j) => zScore(c, f.total, expected[j]));
  const allOnes = sum(f.ones);
  return {
    ...f,
    expected,
    zHalf,
    zExact,
    maxAbsZHalf: Math.max(...zHalf.map(Math.abs)),
    maxAbsZExact: Math.max(...zExact.map(Math.abs)),
    monobit: f.ones.map((c) => monobitFromCounts(c, f.total)),
    overall: { ones: allOnes, bits: f.total * bits, pValue: monobitFromCounts(allOnes, f.total * bits) },
  };
}

/* ------------------------------------------------------------------------ */
/* E4 apparent uniformity                                                    */
/* ------------------------------------------------------------------------ */

/**
 * A deterministic subsample of an orbit, evenly spaced in k (all points when
 * n − 1 ≤ maxPoints), as plain arrays for a scatter plot.
 */
export function pointCloud(o, maxPoints = 4000) {
  const m = o.n - 1;
  const count = Math.min(m, maxPoints);
  const k = Array.from({ length: count }, (_, t) => Math.floor((t * m) / count) + 1);
  return { key: o.key, p: o.p, n: o.n, count, k, xs: k.map((i) => o.xs[i - 1]), ys: k.map((i) => o.ys[i - 1]) };
}

/**
 * Two-dimensional chi-square on a cellsPerAxis × cellsPerAxis grid against
 * the uniform law on the p × p lattice F_p², each axis cut into bins of exact
 * integer widths as in coordinateDistribution. The support of the points is
 * only the curve (about p of the p² lattice points), so the test asks whether
 * the curve spreads evenly over the cells at this resolution, not whether it
 * fills the plane. counts[row][col]: row = cell of y, col = cell of x.
 */
export function cellUniformity(xs, ys, p, cellsPerAxis) {
  const c = cellsPerAxis;
  const edges = Array.from({ length: c + 1 }, (_, j) => Math.ceil((j * p) / c));
  const widths = edges.slice(1).map((e, j) => e - edges[j]);
  const counts = Array.from({ length: c }, () => new Array(c).fill(0));
  for (let i = 0; i < xs.length; i += 1) counts[Math.floor((ys[i] * c) / p)][Math.floor((xs[i] * c) / p)] += 1;
  const total = xs.length;
  const expected = widths.map((wy) => widths.map((wx) => (total * wx * wy) / (p * p)));
  const fit = chiSquareGoodnessOfFit(counts.flat(), expected.flat());
  const note = ['Reference: uniform law on F_p × F_p; the points lie on the curve only, about p of the p² lattice points.'];
  if (p % 3 === 2) note.push('For p ≡ 2 (mod 3) every ordinate occurs exactly once, so the marginal law of y is exactly uniform.');
  return {
    cellsPerAxis: c,
    total,
    edges,
    counts,
    expected,
    minExpected: Math.min(...expected.flat()),
    statistic: fit.statistic,
    df: fit.df,
    pValue: fit.p,
    note: note.join(' '),
  };
}

/** Fraction of the orbit's points whose mirror image (x, p − y) is also in the orbit (1 for a subgroup). */
export function mirrorSymmetry(o) {
  const { p, xs, ys } = o;
  const present = new Set();
  for (let i = 0; i < xs.length; i += 1) present.add(xs[i] * p + ys[i]);
  let mirrored = 0;
  for (let i = 0; i < xs.length; i += 1) if (present.has(xs[i] * p + ((p - ys[i]) % p))) mirrored += 1;
  return { total: xs.length, mirrored, fraction: mirrored / xs.length };
}

/* ------------------------------------------------------------------------ */
/* E5 correlation                                                            */
/* ------------------------------------------------------------------------ */

/* Pearson and Spearman coefficients of paired samples with Fisher-z p-values (large-sample approximation). */
function correlationPair(a, b) {
  const r = pearson(a, b);
  const rho = spearman(a, b);
  const fr = fisherZTest(r, a.length);
  return { pairs: a.length, r, rho, zR: fr.z, pValueR: fr.p, pValueRho: fisherZTest(rho, a.length).p };
}

/**
 * Correlations along a full orbit k = 1, …, n − 1: (k, x), (k, y), lag one
 * (x_k, x_{k+1}) and mirror (x_k, x_{n−k}). Since (n − k)G = −kG has the
 * same abscissa, the mirror pairs are equal (r = ρ = 1) and r(k, x) = 0
 * exactly over the full cycle. p-values use Fisher's z (large-sample
 * approximation, stats.js), as a yardstick rather than an exact test.
 */
export function correlationStudy(o) {
  const m = o.n - 1;
  const ks = Array.from({ length: m }, (_, i) => i + 1);
  const mirror = Int32Array.from(o.xs).reverse();
  return {
    key: o.key,
    n: o.n,
    kx: correlationPair(ks, o.xs),
    ky: correlationPair(ks, o.ys),
    lag1: correlationPair(o.xs.slice(0, m - 1), o.xs.slice(1)),
    mirror: correlationPair(o.xs, mirror),
  };
}

/**
 * x(kG) and y(kG) for k = 1, …, kMax, with null at the multiples of the
 * order n (kG = O): the sequence is periodic with period n.
 */
export function periodicSequence(entry, base = entry.base, kMax = 36) {
  const c = fastCurve(entry);
  const G = { x: Number(base.x), y: Number(base.y) };
  const k = [];
  const xs = [];
  const ys = [];
  let n = null;
  let acc = null;
  for (let i = 1; i <= kMax; i += 1) {
    acc = nadd(c, acc, G);
    k.push(i);
    xs.push(acc === null ? null : acc.x);
    ys.push(acc === null ? null : acc.y);
    if (acc === null && n === null) n = i;
  }
  return { key: base.key ?? entry.id, base: G, n: n ?? orbit(entry, G).n, k, xs, ys };
}

/**
 * E5 on the secp256k1 sample: Pearson and Spearman between k/n and x(Q)/p,
 * k/n and y(Q)/p, and, for comparison, between k/n and Keccak-256(k)/2^256.
 */
export function sampleCorrelation(sample) {
  const kn = sample.keys.map((k) => Number(k) / Number(ORDER));
  return {
    kx: correlationPair(kn, sample.points.map((Q) => Number(Q.x) / Number(SECP_P))),
    ky: correlationPair(kn, sample.points.map((Q) => Number(Q.y) / Number(SECP_P))),
    kHash: correlationPair(kn, sample.hashes.map((h) => Number(h) / 2 ** 256)),
  };
}

/* ------------------------------------------------------------------------ */
/* E6 avalanche on the small curves (exhaustive)                             */
/* ------------------------------------------------------------------------ */

/**
 * Exhaustive avalanche on an orbit: for every k in [1, n − 1] and every bit
 * i < bitLength(n), k′ = k ⊕ 2^i; k′ = 0 or k′ ≥ n is discarded and counted,
 * otherwise the Hamming distance between x‖y of kG and of k′G (bits bits per
 * coordinate) is tallied.
 *
 * Reference law: if Q′ were an independent draw from the orbit's own
 * population, coordinate bit j would differ with probability 2q_j(1 − q_j),
 * q_j its population frequency over the orbit; treating the 2·bits positions
 * as independent gives a Poisson-binomial law for the distance.
 */
export function avalancheSmall(entry, { base = entry.base, orbit: o = orbit(entry, base) } = {}) {
  const { n, xs, ys } = o;
  const bits = entry.bits;
  const inputBits = bitLength(n);
  const counts = new Array(2 * bits + 1).fill(0);
  let trials = 0;
  let discarded = 0;
  for (let k = 1; k < n; k += 1) {
    for (let i = 0; i < inputBits; i += 1) {
      const kp = k ^ (1 << i);
      if (kp === 0 || kp >= n) {
        discarded += 1;
        continue;
      }
      counts[popcount(xs[k - 1] ^ xs[kp - 1]) + popcount(ys[k - 1] ^ ys[kp - 1])] += 1;
      trials += 1;
    }
  }
  const flip = [...bitFrequency(xs, bits).frequency, ...bitFrequency(ys, bits).frequency].map((q) => 2 * q * (1 - q));
  const reference = poissonBinomialPmf(flip);
  const fit = pooledChiSquare(counts, reference.map((r) => r * trials));
  const { mean, sd } = momentsOfCounts(counts);
  return {
    key: o.key,
    n,
    bits,
    inputBits,
    trials,
    discarded,
    counts,
    mean,
    sd,
    reference,
    expectedMean: sum(flip),
    test: { statistic: fit.statistic, df: fit.df, pValue: fit.p, bins: fit.bins },
  };
}

/* ------------------------------------------------------------------------ */
/* secp256k1: fixed-base multiplication and the key sample                   */
/* ------------------------------------------------------------------------ */

/*
 * Fixed-base comb with 8-bit windows: the table holds d·2^(8w)·G for
 * w = 0, …, 31 and d = 1, …, 255 (8160 affine points, built once with one
 * batched inversion). Then kG = Σ_w T[w][byte w of k] costs at most 32 mixed
 * Jacobian additions, about a tenth of double-and-add. It computes k′G from
 * scratch, with no knowledge of any other multiple.
 */
let combTable = null;

function affineFrom(j, zInv) {
  const zInv2 = (zInv * zInv) % SECP_P;
  return { x: (j.X * zInv2) % SECP_P, y: (j.Y * zInv2 * zInv) % SECP_P };
}

function getCombTable() {
  if (combTable) return combTable;
  const jacobians = [];
  let base = SECP_G;
  for (let w = 0; w < 32; w += 1) {
    let acc = toJacobian(base);
    jacobians.push(acc);
    for (let d = 2; d <= 255; d += 1) {
      acc = jacobianAddAffine(acc, base);
      jacobians.push(acc);
    }
    if (w < 31) base = jacobianToAffine(jacobianAddAffine(acc, base)); // 256 · base
  }
  const zInv = batchInverse(jacobians.map((j) => j.Z));
  combTable = jacobians.map((j, i) => affineFrom(j, zInv[i]));
  return combTable;
}

function combJacobian(k) {
  const table = getCombTable();
  const hex = secpMod(k, ORDER).toString(16).padStart(64, '0');
  let acc = JACOBIAN_INFINITY;
  for (let w = 0; w < 32; w += 1) {
    const d = parseInt(hex.slice(62 - 2 * w, 64 - 2 * w), 16);
    if (d !== 0) acc = jacobianAddAffine(acc, table[w * 255 + d - 1]);
  }
  return acc;
}

/* kG for many scalars, with one batched inversion for all the affine conversions. */
function multiplyBaseMany(scalars) {
  const jacobians = scalars.map(combJacobian);
  const finite = [];
  jacobians.forEach((j, i) => {
    if (j.Z !== 0n) finite.push(i);
  });
  const zInv = batchInverse(finite.map((i) => jacobians[i].Z));
  const out = new Array(scalars.length).fill(null);
  finite.forEach((i, t) => {
    out[i] = affineFrom(jacobians[i], zInv[t]);
  });
  return out;
}

/* 2^i·G, read from the comb table (d = 2^(i mod 8) in window ⌊i/8⌋). */
function pow2G(i) {
  return getCombTable()[(i >> 3) * 255 + (1 << (i & 7)) - 1];
}

/**
 * The secp256k1 sample: N private keys uniform on [1, n − 1] by rejection
 * sampling of 32 random bytes (big-endian) from createRandom(seed).bytes,
 * their public points Q_i = k_i·G, and the Keccak-256 digests of the keys
 * as 32 big-endian bytes (digests as bytes, hashes as 256-bit integers).
 * In-memory BigInt data, the input of the other secp256k1 experiments.
 */
export function secpSample({ N = 4096, seed = 20261013 } = {}) {
  const rnd = createRandom(seed);
  const keys = [];
  let rejected = 0;
  while (keys.length < N) {
    const k = bytesToBigInt(rnd.bytes(32), 'be');
    if (k >= 1n && k < ORDER) keys.push(k);
    else rejected += 1;
  }
  const points = multiplyBaseMany(keys);
  const digests = keys.map((k) => keccak256(bigIntToBytes(k, 32, 'be')));
  return { seed, N, rejected, keys, points, digests, hashes: digests.map((d) => bytesToBigInt(d, 'be')) };
}

/**
 * Q ± 2^i·G for each listed bit i: Q + 2^i·G when bit i of k is 0 and
 * Q − 2^i·G when it is 1, which equals (k ⊕ 2^i)·G (the homomorphic
 * shortcut of the SAC matrix). Affine additions with one batched inversion.
 * @param {bigint} k
 * @param {{ x: bigint, y: bigint }} Q = kG
 * @param {number[]} bitIndices
 */
export function flippedPoints(k, Q, bitIndices) {
  const deltas = bitIndices.map((i) => ((k >> BigInt(i)) & 1n ? secpNegate(pow2G(i)) : pow2G(i)));
  const regular = [];
  deltas.forEach((D, t) => {
    if (D.x !== Q.x) regular.push(t);
  });
  const inverses = batchInverse(regular.map((t) => secpMod(deltas[t].x - Q.x)));
  const out = deltas.map((D) => (D.y === Q.y ? secpDouble(Q) : null)); // D = ±Q, the rare cases
  regular.forEach((t, r) => {
    const D = deltas[t];
    const lambda = secpMod((D.y - Q.y) * inverses[r]);
    const x = secpMod(lambda * lambda - Q.x - D.x);
    out[t] = { x, y: secpMod(lambda * (Q.x - x) - Q.y) };
  });
  return out;
}

/**
 * One random bit flip per key of the sample: bit i uniform on 0, …, 255
 * (from createRandom(seed)), k′ = k ⊕ 2^i, Q′ = k′G by a fresh fixed-base
 * multiplication and Keccak-256(k′). Flips with k′ outside [1, n − 1] are
 * marked invalid (probability about 2^−128). Shared by avalancheSecp and
 * relatedOutputs, so that both use the same flips.
 */
export function flipSample(sample, { seed = deriveSeed(sample.seed, 'avalanche') } = {}) {
  const rnd = createRandom(seed);
  const bits = sample.keys.map(() => rnd.int(256));
  const keys = sample.keys.map((k, t) => k ^ (1n << BigInt(bits[t])));
  const valid = keys.map((kp) => kp >= 1n && kp < ORDER);
  const points = multiplyBaseMany(keys.map((kp, t) => (valid[t] ? kp : 0n)));
  const hashes = keys.map((kp, t) => (valid[t] ? bytesToBigInt(keccak256(bigIntToBytes(kp, 32, 'be')), 'be') : null));
  return { seed, bits, keys, valid, points, hashes };
}

/* Histogram of a Bin(256, ½) Hamming distance with its binned chi-square test. */
function hammingSummary(counts) {
  const fit = binnedBinomialChiSquare(counts, 256, 0.5);
  const { mean, sd } = momentsOfCounts(counts);
  return { counts, mean, sd, expectedMean: 128, expectedSd: 8, statistic: fit.statistic, df: fit.df, pValue: fit.p, bins: fit.bins };
}

/**
 * E6 avalanche on secp256k1 and Keccak-256: for each key, one random bit of
 * k is flipped; the Hamming distance between x(Q) and x(Q′) (256 bits, Q′ by
 * a fresh multiplication) and between the two Keccak digests is tallied,
 * against Bin(256, ½) with a pooled chi-square test.
 * @param {object} sample from secpSample
 * @param {{ seed?: number, flipped?: object }} [options] flipped from flipSample (computed when absent)
 */
export function avalancheSecp(sample, { seed, flipped = flipSample(sample, { seed }) } = {}) {
  const ec = new Array(257).fill(0);
  const hash = new Array(257).fill(0);
  let trials = 0;
  sample.keys.forEach((_, t) => {
    if (!flipped.valid[t]) return;
    ec[popcountBig(sample.points[t].x ^ flipped.points[t].x)] += 1;
    hash[popcountBig(sample.hashes[t] ^ flipped.hashes[t])] += 1;
    trials += 1;
  });
  return {
    seed: flipped.seed,
    trials,
    discarded: sample.keys.length - trials,
    reference: binomialPmfTable(256, 0.5),
    ec: hammingSummary(ec),
    keccak: hammingSummary(hash),
  };
}

/* Two-sided 0.001 quantile of N(0, 1): |z| above it flags a SAC cell. */
const Z_999 = 3.2905267314919255;

/* Summary of a 256 × 256 matrix of flip counts, each cell Bin(trials, ½) under the SAC. */
function sacSummary(counts, trials, discarded) {
  const half = trials / 2;
  const sdCell = Math.sqrt(trials / 4);
  let statistic = 0;
  let maxAbsZ = 0;
  let beyond = 0;
  let total = 0;
  for (const c of counts) {
    const z = (c - half) / sdCell;
    statistic += z * z;
    maxAbsZ = Math.max(maxAbsZ, Math.abs(z));
    if (Math.abs(z) > Z_999) beyond += 1;
    total += c;
  }
  const cells = counts.length;
  return {
    inputBits: 256,
    outputBits: 256,
    trials,
    discarded,
    counts: Array.from(counts),
    meanFrequency: total / (cells * trials),
    maxAbsDeviation: (maxAbsZ * sdCell) / trials,
    maxAbsZ,
    statistic,
    df: cells,
    pValue: chiSquareSf(statistic, cells),
    beyond,
    expectedBeyond: cells * 0.001,
    note: 'Cells are treated as independent Bin(trials, ½) counts; z = (count − trials/2) / sqrt(trials/4); beyond counts |z| > 3.29.',
  };
}

/**
 * E6 strict avalanche criterion of k ↦ x(kG): a 256 × 256 matrix whose cell
 * (i, j), stored row-major at 256·i + j, counts the keys for which output
 * bit j of x flips when input bit i of k is flipped. Q′ is computed by the
 * homomorphic shortcut Q′ = Q ± 2^i·G (one addition; flippedPoints), which
 * equals (k ⊕ 2^i)·G. Uses the first `keys` keys of the sample.
 */
export function sacSecp(sample, { keys = 1024 } = {}) {
  const used = Math.min(keys, sample.keys.length);
  const counts = new Uint32Array(256 * 256);
  const all = Array.from({ length: 256 }, (_, i) => i);
  let discarded = 0;
  for (let t = 0; t < used; t += 1) {
    const Q = sample.points[t];
    const flipped = flippedPoints(sample.keys[t], Q, all);
    for (let i = 0; i < 256; i += 1) {
      if (flipped[i] === null) discarded += 1;
      else tallyBits(counts, 256 * i, Q.x ^ flipped[i].x);
    }
  }
  return sacSummary(counts, used, discarded);
}

/**
 * The same SAC matrix for Keccak-256: input bit i of k (as 32 big-endian
 * bytes, bit 0 = least significant bit of the last byte), output bit j of the
 * digest read as a 256-bit big-endian integer.
 */
export function sacKeccak(sample, { keys = 1024 } = {}) {
  const used = Math.min(keys, sample.keys.length);
  const counts = new Uint32Array(256 * 256);
  for (let t = 0; t < used; t += 1) {
    const message = bigIntToBytes(sample.keys[t], 32, 'be');
    const base = sample.digests[t];
    for (let i = 0; i < 256; i += 1) {
      const byte = 31 - (i >> 3);
      const mask = 1 << (i & 7);
      message[byte] ^= mask;
      const digest = keccak256(message);
      message[byte] ^= mask;
      for (let b = 0; b < 32; b += 1) {
        const diff = digest[b] ^ base[b];
        if (diff === 0) continue;
        const offset = 256 * i + 8 * (31 - b);
        for (const s of BITS_OF[diff]) counts[offset + s] += 1;
      }
    }
  }
  return sacSummary(counts, used, 0);
}

/* True when the Jacobian point J and the affine point A are the same point. */
function sameAsAffine(J, A) {
  if (J.Z === 0n || A === null) return J.Z === 0n && A === null;
  const z2 = (J.Z * J.Z) % SECP_P;
  return J.X === (A.x * z2) % SECP_P && J.Y === (((A.y * z2) % SECP_P) * J.Z) % SECP_P;
}

/* Hits of the rule out′ = out ⊕ m_i, the mask m_i learned from the first pair that flips bit i. */
function xorMaskRule(bits, valid, before, after) {
  const masks = new Map();
  let hits = 0;
  let trials = 0;
  bits.forEach((i, t) => {
    if (!valid[t]) return;
    const observed = before[t] ^ after[t];
    if (!masks.has(i)) {
      masks.set(i, observed);
      return;
    }
    trials += 1;
    if (observed === masks.get(i)) hits += 1;
  });
  return { hits, trials, learned: masks.size };
}

/**
 * E6 related outputs: can the output after a bit flip be predicted from the
 * output before it and the flipped position i?
 *   - scalar multiplication: Q′ ∈ { Q + 2^i·G, Q − 2^i·G } always (hits N of N),
 *     because k ↦ kG is a group homomorphism;
 *   - Keccak-256: no algebraic relation between H(k) and H(k ⊕ 2^i) is known;
 *     as an honest analogue we test the simplest guess, H(k′) = H(k) ⊕ m_i,
 *     the mask m_i learned from the first pair that flips bit i (expected 0 hits).
 * The same XOR rule is reported for x(Q) as a control.
 */
export function relatedOutputs(sample, { seed, flipped = flipSample(sample, { seed }) } = {}) {
  let hits = 0;
  let trials = 0;
  sample.keys.forEach((_, t) => {
    if (!flipped.valid[t]) return;
    const Q = toJacobian(sample.points[t]);
    const D = pow2G(flipped.bits[t]);
    const candidates = [jacobianAddAffine(Q, D), jacobianAddAffine(Q, secpNegate(D))];
    if (candidates.some((J) => sameAsAffine(J, flipped.points[t]))) hits += 1;
    trials += 1;
  });
  const xs = sample.points.map((Q) => Q.x);
  const xsAfter = flipped.points.map((Q) => (Q === null ? 0n : Q.x));
  const hashesAfter = flipped.hashes.map((h) => h ?? 0n);
  const keccakRule = xorMaskRule(flipped.bits, flipped.valid, sample.hashes, hashesAfter);
  return {
    seed: flipped.seed,
    ec: {
      rule: "Q′ ∈ {Q + 2^i·G, Q − 2^i·G}",
      hits,
      trials,
      xorMask: xorMaskRule(flipped.bits, flipped.valid, xs, xsAfter),
    },
    keccak: {
      rule: 'H(k′) = H(k) ⊕ m_i, m_i learned from the first pair that flips bit i',
      ...keccakRule,
      note: 'No algebraic relation between H(k) and H(k ⊕ 2^i) is known; the XOR rule is the simplest honest guess.',
    },
  };
}

/* ------------------------------------------------------------------------ */
/* E7 the cost of inverting k ↦ kG                                           */
/* ------------------------------------------------------------------------ */

/**
 * Curves y² = x³ + 7 of prime order, one per bit size b = fromBits … toBits:
 * the first prime p ≥ 2^b with #E(F_p) prime, found by an exhaustive point
 * count and a primality test, except that a prime of `include` lying in
 * [2^b, 2^(b+1)) is used instead (the ladder curves 1051 and 16477). Primes
 * p ≡ 2 (mod 3) are skipped: their curves have p + 1 points, an even number.
 * @returns {{ p: number, n: number }[]}
 */
export function primeOrderCurves({ fromBits = 6, toBits = 18, include = [1051, 16477] } = {}) {
  const out = [];
  for (let b = fromBits; b <= toBits; b += 1) {
    const [lo, hi] = [2 ** b, 2 ** (b + 1)];
    const chosen = include.find((p) => p >= lo && p < hi);
    if (chosen !== undefined) {
      const n = countPoints(fastCurve({ p: chosen }));
      if (!isPrime(chosen) || !isPrime(n)) throw new RangeError(`y² = x³ + 7 over F_${chosen} does not have prime order`);
      out.push({ p: chosen, n });
      continue;
    }
    for (let p = lo + 1; p < hi; p += 1) {
      if (p % 3 !== 1 || !isPrime(p)) continue;
      const n = countPoints(fastCurve({ p }));
      if (isPrime(n)) {
        out.push({ p, n });
        break;
      }
    }
  }
  return out;
}

const pointKey = (P, p) => (P === null ? -1 : P.x * p + P.y);

/* The ECDLP on one curve: brute force and baby-step giant-step on the same random targets. */
function ecdlpOnCurve(p, targets, seed) {
  const c = fastCurve({ p });
  let G = null;
  for (let x = 0; G === null; x += 1) {
    const v = rhs(c, x);
    for (let y = 0; y <= (p - 1) / 2; y += 1) {
      if ((y * y) % p === v) {
        G = { x, y };
        break;
      }
    }
  }
  const groupOrder = countPoints(c);
  const n = orderOfPoint(c, G, groupOrder);
  const rnd = createRandom(deriveSeed(seed, `ecdlp:${p}`));
  const ks = Array.from({ length: targets }, () => 1 + rnd.int(n - 1));
  const Qs = ks.map((k) => nmul(c, G, k));

  // Brute force: walk G, 2G, 3G, …; reaching kG costs k − 1 additions. One walk serves every target.
  const brute = new Array(targets);
  const pending = new Map();
  Qs.forEach((Q, t) => {
    const key = pointKey(Q, p);
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(t);
  });
  let remaining = targets;
  let acc = G;
  for (let ops = 0; remaining > 0; ops += 1) {
    const key = pointKey(acc, p);
    const found = pending.get(key);
    if (found) {
      for (const t of found) {
        if (ops + 1 !== ks[t]) throw new Error('brute force found a wrong logarithm');
        brute[t] = ops;
      }
      remaining -= found.length;
      pending.delete(key);
    }
    acc = nadd(c, acc, G);
    if (acc === null && remaining > 0) throw new Error('brute force wrapped around the group');
  }

  // Baby-step giant-step: m − 1 additions give G, 2G, …, mG (the table j·G, j < m, and the
  // stride), then γ ← γ − mG costs one addition per giant step until γ = j·G.
  const m = Math.ceil(Math.sqrt(n));
  const table = new Map([[pointKey(null, p), 0]]);
  let step = null;
  for (let j = 1; j <= m; j += 1) {
    step = nadd(c, step, G);
    if (j < m) table.set(pointKey(step, p), j);
  }
  const stride = step === null ? null : { x: step.x, y: nmod(-step.y, p) };
  const bsgs = Qs.map((Q, t) => {
    let gamma = Q;
    for (let i = 0; i <= m; i += 1) {
      const j = table.get(pointKey(gamma, p));
      if (j !== undefined) {
        if ((i * m + j) % n !== ks[t] % n) throw new Error('baby-step giant-step found a wrong logarithm');
        return m - 1 + i;
      }
      gamma = nadd(c, gamma, stride);
    }
    throw new Error('baby-step giant-step failed');
  });

  return {
    p,
    groupOrder,
    n,
    log2n: Math.log2(n),
    base: G,
    targets,
    bruteForce: describe(brute),
    bsgs: { m, ...describe(bsgs) },
    reference: { bruteForceMean: (n - 2) / 2, sqrtN: Math.sqrt(n) },
  };
}

/**
 * E7: the number of group operations needed to recover k from Q = kG by
 * brute force and by baby-step giant-step, on prime-order curves of growing
 * size (primeOrderCurves, or the given primes), for `targets` keys uniform on
 * [1, n − 1] per curve. Returns per-curve means and quartiles, the OLS fit of
 * log₂(mean operations) on log₂ n (slope ≈ 1 for brute force, ≈ ½ for BSGS)
 * with its extrapolation to n ≈ 2^256, and the factorisation of the orders
 * of the ladder base points (Pohlig–Hellman: a smooth order such as
 * 18 = 2·3² reduces the problem to its prime-power factors).
 */
export function ecdlpCost({ primes, targets = 64, seed = 20261013 } = {}) {
  const list = primes ?? primeOrderCurves().map((c) => c.p);
  const curves = list.map((p) => ecdlpOnCurve(p, targets, seed));
  const xs = curves.map((c) => c.log2n);
  const log2Secp = Math.log2(Number(ORDER));
  const fitOf = (ys) => {
    const { slope, intercept, r } = linearFit(xs, ys);
    return { slope, intercept, r, log2At256: intercept + slope * log2Secp };
  };
  return {
    seed,
    targets,
    curves,
    fit: {
      x: 'log2 n',
      bruteForce: fitOf(curves.map((c) => Math.log2(c.bruteForce.mean))),
      bsgs: fitOf(curves.map((c) => Math.log2(c.bsgs.mean))),
      log2nSecp256k1: log2Secp,
      // The expected means at n ≈ 2^256: (n − 2)/2 for brute force; about 1.5·√n for BSGS
      // (m − 1 table additions plus, on average, about m/2 giant steps).
      theoryAt256: { bruteForce: Math.log2(Number(ORDER) / 2), bsgs: Math.log2(1.5 * Math.sqrt(Number(ORDER))) },
    },
    smoothness: LADDER.flatMap((e) =>
      e.bases.map((b) => {
        const factors = factorize(b.n);
        return { key: b.key, n: b.n, factors, largestPrime: factors[factors.length - 1].prime };
      }),
    ),
  };
}

/* ------------------------------------------------------------------------ */
/* E8 the cost of computing kG                                               */
/* ------------------------------------------------------------------------ */

/**
 * Group operations to compute kG for a uniform L-bit scalar k (k ∈ [2^(L−1), 2^L)),
 * L = 1, …, maxBits: repeated addition needs k − 1 additions, mean
 * (3·2^(L−1) − 3)/2; left-to-right double-and-add needs L − 1 doublings and,
 * on average, (L − 1)/2 additions. Also the exact counts of the assignment
 * (k = 6) from the step traces of toy-curve.js. log₂ of a zero count is null.
 */
export function doubleAndAddCost(maxBits = 256) {
  const bits = Array.from({ length: maxBits }, (_, i) => i + 1);
  const repeatedAddition = bits.map((L) => (3 * 2 ** (L - 1) - 3) / 2);
  const doubleAndAdd = bits.map((L) => 1.5 * (L - 1));
  const log2 = (v) => (v > 0 ? Math.log2(v) : null);
  const repeated = multiplyByRepeatedAddition(TOY_CURVE, TOY_BASE, TOY_PRIVATE_KEY);
  const binary = multiplyByDoubleAndAdd(TOY_CURVE, TOY_BASE, TOY_PRIVATE_KEY);
  const doublings = binary.steps.filter((s) => s.op === 'double').length;
  const additions = binary.steps.filter((s) => s.op === 'add').length;
  if (formatPoint(repeated.result) !== formatPoint(binary.result)) throw new Error('the two methods disagree');
  return {
    bits,
    repeatedAddition,
    doubleAndAdd,
    log2RepeatedAddition: repeatedAddition.map(log2),
    log2DoubleAndAdd: doubleAndAdd.map(log2),
    assignment: {
      k: Number(TOY_PRIVATE_KEY),
      bits: binary.bits,
      repeatedAddition: repeated.steps.length,
      doubleAndAdd: { doublings, additions, total: doublings + additions },
      result: formatPoint(binary.result),
    },
  };
}

/* ------------------------------------------------------------------------ */
/* The whole study                                                           */
/* ------------------------------------------------------------------------ */

const binsFor = (p) => (p <= 32 ? p : p < 4096 ? 16 : 32);
const cellsFor = (points) => Math.min(16, Math.max(2, 2 ** Math.floor(Math.log2(Math.sqrt(points / 5)))));

/**
 * Runs E1–E8 and returns one JSON-serialisable object: meta, then one key per
 * experiment, each keyed by orbit (T17, T17g, S1031, O1051, O16477) and by
 * secp256k1 / keccak. meta records the seed and the derived sub-seeds, the
 * sample sizes, the curve parameters, the time spent per experiment (ms) and
 * the first 8 private keys as hexadecimal.
 */
export function runStudy({ seed = 20261013, secpN = 4096, sacKeys = 1024, ecdlpTargets = 64, ecdlpPrimes } = {}) {
  const start = performance.now();
  const timing = {};
  const timed = (name, fn) => {
    const t0 = performance.now();
    const value = fn();
    timing[name] = Math.round(performance.now() - t0);
    return value;
  };
  const seeds = { keys: seed, avalanche: deriveSeed(seed, 'avalanche'), ecdlp: deriveSeed(seed, 'ecdlp') };

  const orbits = timed('orbits', () => LADDER.flatMap((entry) => entry.bases.map((base) => ({ entry, base, o: orbit(entry, base) }))));
  const perOrbit = (fn) => Object.fromEntries(orbits.map((item) => [item.base.key, fn(item)]));
  const sample = timed('sample', () => secpSample({ N: secpN, seed: seeds.keys }));
  const flipped = timed('flips', () => flipSample(sample, { seed: seeds.avalanche }));
  const xs = sample.points.map((Q) => Q.x);
  const ys = sample.points.map((Q) => Q.y);
  const HASH_RANGE = 2n ** 256n;

  const E1 = timed('E1', () => ({
    ...perOrbit(({ o }) => ({ x: coordinateDistribution(o.xs, o.p, binsFor(o.p)), y: coordinateDistribution(o.ys, o.p, binsFor(o.p)) })),
    secp256k1: { x: coordinateDistribution(xs, SECP_P, 32), y: coordinateDistribution(ys, SECP_P, 32) },
    keccak: { digest: coordinateDistribution(sample.hashes, HASH_RANGE, 32) },
  }));
  const E2 = timed('E2', () =>
    perOrbit(({ entry, o }) => ({ x: occupancy(o.xs, o.p), y: occupancy(o.ys, o.p), keccakModP: keccakModP(entry, o.n).occupancy })),
  );
  const E3 = timed('E3', () => ({
    ...perOrbit(({ entry, o }) => ({ x: bitStudy(o.xs, o.p, entry.bits), y: bitStudy(o.ys, o.p, entry.bits) })),
    secp256k1: { x: bitStudy(xs, SECP_P, 256) },
    keccak: { digest: bitStudy(sample.hashes, HASH_RANGE, 256) },
  }));
  const E4 = timed('E4', () =>
    perOrbit(({ o }) => ({ cloud: pointCloud(o), cells: cellUniformity(o.xs, o.ys, o.p, cellsFor(o.n - 1)), mirror: mirrorSymmetry(o) })),
  );
  const E5 = timed('E5', () => {
    const secp = sampleCorrelation(sample);
    return {
      ...perOrbit(({ entry, base, o }) => ({
        ...correlationStudy(o),
        ...(entry.p <= 64 ? { periodic: periodicSequence(entry, base, 36) } : {}),
      })),
      secp256k1: { kx: secp.kx, ky: secp.ky },
      keccak: { kHash: secp.kHash },
    };
  });
  const E6 = timed('E6', () => {
    const { ec, keccak, ...common } = avalancheSecp(sample, { flipped });
    const related = relatedOutputs(sample, { flipped });
    return {
      ...perOrbit(({ entry, base, o }) => avalancheSmall(entry, { base, orbit: o })),
      secp256k1: { avalanche: { ...common, ...ec }, sac: sacSecp(sample, { keys: sacKeys }), related: related.ec },
      keccak: { avalanche: { ...common, ...keccak }, sac: sacKeccak(sample, { keys: sacKeys }), related: related.keccak },
    };
  });
  const E7 = timed('E7', () => ecdlpCost({ primes: ecdlpPrimes, targets: ecdlpTargets, seed: seeds.ecdlp }));
  const E8 = timed('E8', () => doubleAndAddCost(256));
  timing.total = Math.round(performance.now() - start);

  return {
    meta: {
      seed,
      seeds,
      sizes: { secpN, sacKeys: Math.min(sacKeys, secpN), ecdlpTargets },
      curves: LADDER,
      secp256k1: { p: SECP_P.toString(), n: ORDER.toString(), G: { x: SECP_G.x.toString(), y: SECP_G.y.toString() } },
      keys: {
        count: sample.keys.length,
        rejected: sample.rejected,
        rule: 'k = 32 bytes of createRandom(seed).bytes read big-endian, kept when 1 ≤ k ≤ n − 1',
        first: sample.keys.slice(0, 8).map((k) => k.toString(16).padStart(64, '0')),
      },
      timing,
    },
    E1,
    E2,
    E3,
    E4,
    E5,
    E6,
    E7,
    E8,
  };
}

/**
 * The experiments of the homework: statistical properties of the toy
 * elliptic-curve hash, measured against SHA-256 and against the behaviour of
 * an ideal random function.
 *
 * Every experiment is a pure function of its options ({ variant, n, seed, … })
 * and returns plain, serialisable data: counts, statistics and p-values. The
 * same code produces the static figures at build time and the re-sampled ones
 * in the browser.
 *
 * Null hypothesis throughout: the digest of a random message is a uniformly
 * random 256-bit string, independent of the message and of other digests
 * (the "random oracle" idealisation). Each test states the statistic used.
 */

import { ecHash } from './ec-hash.js';
import { sha256 } from './sha256.js';
import { createRandom } from './random.js';
import { bitAt, flipBit, hammingDistance, hammingWeight, toBits } from './bytes.js';
import { inv, mod } from './secp256k1.js';
import {
  binnedBinomialChiSquare,
  binomialPmfTable,
  chiSquareGoodnessOfFit,
  chiSquareSf,
  collisionProbability,
  expectedCollidingPairs,
  monobitFromCounts,
  runsTestP,
  runsTestPValueDistribution,
  zScore,
} from './stats.js';

/** Hash functions the experiments can run on. */
export const HASHES = Object.freeze(['scalar', 'pedersen', 'sha256']);

/** The 32-byte digest function of a name in HASHES. */
export function hashFunction(name) {
  if (name === 'sha256') return sha256;
  if (name === 'scalar' || name === 'pedersen') return (bytes) => ecHash(bytes, { variant: name }).digest;
  throw new Error(`unknown hash "${name}"; expected one of ${HASHES.join(', ')}`);
}

/** n random messages of the given length from the seed. */
export function randomMessages({ n, seed, length = 32 }) {
  const rnd = createRandom(seed);
  return Array.from({ length: n }, () => rnd.bytes(length));
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* Mean and sample standard deviation of a variable given its histogram of counts. */
function momentsOfCounts(counts) {
  const total = sum(counts);
  let mean = 0;
  counts.forEach((c, k) => (mean += k * c));
  mean /= total;
  let ss = 0;
  counts.forEach((c, k) => (ss += c * (k - mean) ** 2));
  return { mean, sd: Math.sqrt(ss / (total - 1)) };
}

/* ------------------------------------------------------------------------ */
/* E1 bit frequency                                                           */
/* ------------------------------------------------------------------------ */

/**
 * E1. For each of the 256 output bit positions, the number of ones over n
 * digests. Under H0 each count is Bin(n, ½); the standardised counts z_j are
 * approximately N(0, 1) and Σ z_j² is approximately χ²(256). Also reports the
 * monobit p-value of the whole bit stream.
 */
export function bitFrequency({ variant, n, seed, length = 32 }) {
  const h = hashFunction(variant);
  const counts = new Array(256).fill(0);
  for (const m of randomMessages({ n, seed, length })) {
    const d = h(m);
    for (let j = 0; j < 256; j += 1) counts[j] += bitAt(d, j);
  }
  const z = counts.map((c) => zScore(c, n, 0.5));
  const statistic = sum(z.map((v) => v * v));
  const ones = sum(counts);
  const totalBits = 256 * n;
  const beyondTwoSigma = z.filter((v) => Math.abs(v) > 1.96).length;
  return {
    variant,
    n,
    seed,
    length,
    counts,
    z,
    statistic,
    df: 256,
    p: chiSquareSf(statistic, 256),
    ones,
    totalBits,
    onesFraction: ones / totalBits,
    monobitP: monobitFromCounts(ones, totalBits),
    maxAbsZ: Math.max(...z.map(Math.abs)),
    beyondTwoSigma,
    expectedBeyondTwoSigma: 256 * 0.05,
  };
}

/* ------------------------------------------------------------------------ */
/* E2 byte frequency                                                          */
/* ------------------------------------------------------------------------ */

/**
 * E2. Histogram of the 32n digest bytes over the 256 byte values. Under H0
 * the counts are multinomial with equal probabilities and Pearson's
 * statistic is approximately χ²(255).
 */
export function byteFrequency({ variant, n, seed, length = 32 }) {
  const h = hashFunction(variant);
  const counts = new Array(256).fill(0);
  for (const m of randomMessages({ n, seed, length })) for (const b of h(m)) counts[b] += 1;
  const expected = new Array(256).fill((32 * n) / 256);
  const fit = chiSquareGoodnessOfFit(counts, expected);
  return {
    variant,
    n,
    seed,
    counts,
    expectedPerValue: expected[0],
    statistic: fit.statistic,
    df: fit.df,
    p: fit.p,
    min: Math.min(...counts),
    max: Math.max(...counts),
  };
}

/* ------------------------------------------------------------------------ */
/* E3 Hamming weight                                                          */
/* ------------------------------------------------------------------------ */

/**
 * E3. The number of ones in each digest. Under H0 it is Bin(256, ½): mean
 * 128, standard deviation 8. The histogram is compared with the binomial
 * pmf by a chi-square test with the tails merged.
 */
export function hammingWeights({ variant, n, seed, length = 32 }) {
  const h = hashFunction(variant);
  const counts = new Array(257).fill(0);
  for (const m of randomMessages({ n, seed, length })) counts[hammingWeight(h(m))] += 1;
  const { mean, sd } = momentsOfCounts(counts);
  const fit = binnedBinomialChiSquare(counts, 256, 0.5);
  return {
    variant,
    n,
    seed,
    counts,
    pmf: binomialPmfTable(256, 0.5),
    mean,
    sd,
    expectedMean: 128,
    expectedSd: 8,
    statistic: fit.statistic,
    df: fit.df,
    p: fit.p,
    bins: fit.bins,
  };
}

/* ------------------------------------------------------------------------ */
/* E4 avalanche                                                               */
/* ------------------------------------------------------------------------ */

/**
 * E4. For n random messages, one random input bit is flipped and the Hamming
 * distance between the two digests is recorded. Under H0 (and under the
 * strict avalanche criterion) the distance is Bin(256, ½): on average half
 * the output bits change.
 */
export function avalanche({ variant, n, seed, length = 32 }) {
  const h = hashFunction(variant);
  const rnd = createRandom(seed);
  const counts = new Array(257).fill(0);
  for (let t = 0; t < n; t += 1) {
    const m = rnd.bytes(length);
    const i = rnd.int(8 * length);
    counts[hammingDistance(h(m), h(flipBit(m, i)))] += 1;
  }
  const { mean, sd } = momentsOfCounts(counts);
  const fit = binnedBinomialChiSquare(counts, 256, 0.5);
  return {
    variant,
    n,
    seed,
    length,
    pairs: n,
    counts,
    pmf: binomialPmfTable(256, 0.5),
    mean,
    sd,
    expectedMean: 128,
    expectedSd: 8,
    unchanged: counts[0],
    statistic: fit.statistic,
    df: fit.df,
    p: fit.p,
    bins: fit.bins,
  };
}

/* ------------------------------------------------------------------------ */
/* E5 strict avalanche criterion matrix                                       */
/* ------------------------------------------------------------------------ */

/**
 * E5. The strict avalanche criterion (Webster and Tavares, 1985): for every
 * input bit i and output bit j, output bit j should change with probability
 * ½ when input bit i is flipped. The matrix of flip counts over `trials`
 * random messages is returned flat, row i = input bit, column j = output bit.
 * Under H0 each count is Bin(trials, ½).
 */
export function sacMatrix({ variant, trials, seed, length = 32, inputBits = 8 * length }) {
  const h = hashFunction(variant);
  const rnd = createRandom(seed);
  const flips = new Array(inputBits * 256).fill(0);
  for (let t = 0; t < trials; t += 1) {
    const m = rnd.bytes(length);
    const base = h(m);
    for (let i = 0; i < inputBits; i += 1) {
      const d = h(flipBit(m, i));
      const row = i * 256;
      for (let byte = 0; byte < 32; byte += 1) {
        const x = base[byte] ^ d[byte];
        if (x === 0) continue;
        for (let bit = 0; bit < 8; bit += 1) if ((x >> bit) & 1) flips[row + byte * 8 + bit] += 1;
      }
    }
  }
  const rowMeans = Array.from({ length: inputBits }, (_, i) => sum(flips.slice(i * 256, i * 256 + 256)) / (256 * trials));
  const columnMeans = new Array(256).fill(0);
  for (let i = 0; i < inputBits; i += 1) for (let j = 0; j < 256; j += 1) columnMeans[j] += flips[i * 256 + j];
  for (let j = 0; j < 256; j += 1) columnMeans[j] /= inputBits * trials;
  let beyond = 0;
  let maxAbsZ = 0;
  for (const c of flips) {
    const z = Math.abs(zScore(c, trials, 0.5));
    if (z > 1.96) beyond += 1;
    if (z > maxAbsZ) maxAbsZ = z;
  }
  return {
    variant,
    trials,
    seed,
    length,
    inputBits,
    outputBits: 256,
    flips,
    mean: sum(flips) / (flips.length * trials),
    min: Math.min(...flips) / trials,
    max: Math.max(...flips) / trials,
    rowMeans,
    columnMeans,
    maxAbsZ,
    fractionBeyondTwoSigma: beyond / flips.length,
    expectedFractionBeyondTwoSigma: 0.05,
  };
}

/* ------------------------------------------------------------------------ */
/* E6 birthday collisions                                                     */
/* ------------------------------------------------------------------------ */

/* The leading `bits` bits of a digest as a number (bits ≤ 32). */
function leadingBits(digest, bits) {
  const word = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return bits === 32 ? word : word >>> (32 - bits);
}

/**
 * E6. Collisions among n digests truncated to t bits. Under H0 the number of
 * colliding pairs has mean C(n, 2) / 2^t (the birthday bound), and the
 * probability that a sample of m digests contains a repeat is
 * 1 − Π_{i<m} (1 − i / 2^t). The empirical curve is estimated by drawing
 * random subsets of size m from the pool of n digests.
 */
export function birthdayCollisions({
  variant,
  n,
  seed,
  length = 32,
  bits = [12, 16, 20, 24],
  curveBits = 16,
  subsets = 200,
}) {
  const h = hashFunction(variant);
  const digests = randomMessages({ n, seed, length }).map(h);

  const truncations = bits.map((t) => {
    const buckets = new Map();
    for (const d of digests) {
      const key = leadingBits(d, t);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let observedPairs = 0;
    let collidingValues = 0;
    for (const c of buckets.values()) {
      if (c >= 2) {
        observedPairs += (c * (c - 1)) / 2;
        collidingValues += 1;
      }
    }
    const space = 2 ** t;
    return {
      bits: t,
      space,
      observedPairs,
      expectedPairs: expectedCollidingPairs(n, t),
      collidingValues,
      distinctValues: buckets.size,
      expectedDistinct: space * (1 - (1 - 1 / space) ** n),
    };
  });

  const keys = digests.map((d) => leadingBits(d, curveBits));
  const rnd = createRandom(seed ^ 0x9e3779b9);
  const indices = Array.from({ length: n }, (_, i) => i);
  // 0.075 places a size between 200 and 400 for n = 4000, around the theoretical
  // half-way point of a 16-bit space (m ≈ 302), so the crossing is not a grid artefact.
  const fractions = [0.02, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const sizes = [...new Set(fractions.map((f) => Math.max(2, Math.round(f * n))))].sort((a, b) => a - b);
  const points = sizes.map((m) => {
    let withCollision = 0;
    for (let r = 0; r < subsets; r += 1) {
      // Partial Fisher–Yates shuffle: the first m entries are a uniform random subset.
      for (let i = 0; i < m; i += 1) {
        const j = i + rnd.int(n - i);
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const seen = new Set();
      let collided = false;
      for (let i = 0; i < m && !collided; i += 1) {
        const k = keys[indices[i]];
        if (seen.has(k)) collided = true;
        seen.add(k);
      }
      if (collided) withCollision += 1;
    }
    return { m, empirical: withCollision / subsets, theory: collisionProbability(m, 2 ** curveBits, { exact: true }) };
  });

  return { variant, n, seed, length, truncations, curve: { bits: curveBits, subsets, points } };
}

/* ------------------------------------------------------------------------ */
/* E7 runs and adjacent-bit independence                                      */
/* ------------------------------------------------------------------------ */

/**
 * Expected number of runs of n independent fair bits: one run to start, then
 * each of the n − 1 adjacent pairs ends a run with probability 1/2. This is
 * the unconditional expectation 1 + (n − 1)/2; the NIST statistic 2nπ(1 − π)
 * + 1 is the expectation conditional on the observed proportion of ones π.
 */
export function expectedRunsOfFairBits(n) {
  return 1 + (n - 1) / 2;
}

/**
 * E7. Dependence within a digest. (a) The NIST runs test on each 256-bit
 * digest. The number of runs of a 256-bit string takes few distinct values,
 * so under H0 the p-values are not uniform on [0, 1] but follow a discrete
 * law that is computed exactly by enumerating the strings by their numbers
 * of ones and runs (see runsTestPValueDistribution); the histogram of
 * p-values over ten bins is compared with that law by a chi-square test,
 * and the proportion of digests with p ≥ 0.01 is reported with the interval
 * used by the NIST suite. (b) The 2 × 2 table of adjacent bit pairs
 * (b_j, b_{j+1}) pooled over all digests, tested for independence with a
 * chi-square statistic on one degree of freedom, with the lag-1 correlation
 * (phi coefficient) as effect size.
 */
export function runsAndIndependence({ variant, n, seed, length = 32 }) {
  const h = hashFunction(variant);
  const runsPValues = [];
  let applicable = 0;
  let runsTotal = 0;
  const table = { '00': 0, '01': 0, 10: 0, 11: 0 };
  for (const m of randomMessages({ n, seed, length })) {
    const bits = toBits(h(m));
    const r = runsTestP(bits);
    runsPValues.push(r.p);
    runsTotal += r.runs;
    if (r.applicable) applicable += 1;
    for (let j = 0; j < 255; j += 1) table[`${bits[j]}${bits[j + 1]}`] += 1;
  }
  const histogram = new Array(10).fill(0);
  for (let i = 0; i < n; i += 1) {
    const p = runsPValues[i];
    if (p > 0) histogram[Math.min(9, Math.floor(p * 10))] += 1;
  }
  // NIST counts a digest as non-applicable (p = 0) when the frequency precondition fails.
  const reference = runsTestPValueDistribution(8 * length, { bins: 10 });
  const expectedHistogram = reference.bins.map((p) => p * applicable);
  const uniformity =
    applicable > 0 ? chiSquareGoodnessOfFit(histogram, expectedHistogram) : { statistic: 0, df: 9, p: Number.NaN };
  const passing = runsPValues.filter((p) => p >= 0.01).length;
  const n00 = table['00'];
  const n01 = table['01'];
  const n10 = table[10];
  const n11 = table[11];
  const total = n00 + n01 + n10 + n11;
  const row0 = n00 + n01;
  const row1 = n10 + n11;
  const col0 = n00 + n10;
  const col1 = n01 + n11;
  const expected = [(row0 * col0) / total, (row0 * col1) / total, (row1 * col0) / total, (row1 * col1) / total];
  const independence = chiSquareGoodnessOfFit([n00, n01, n10, n11], expected, { ddof: 2 });
  const phi = (n11 * n00 - n01 * n10) / Math.sqrt(row0 * row1 * col0 * col1);
  return {
    variant,
    n,
    seed,
    runsPValues,
    applicable,
    meanRuns: runsTotal / n,
    expectedRuns: expectedRunsOfFairBits(256),
    pValueHistogram: histogram,
    expectedPValueHistogram: expectedHistogram,
    expectedInapplicable: n * reference.inapplicable,
    uniformityStatistic: uniformity.statistic,
    uniformityDf: uniformity.df,
    uniformityP: uniformity.p,
    proportionPassing: passing / n,
    passingInterval: [0.99 - 3 * Math.sqrt((0.01 * 0.99) / n), 0.99 + 3 * Math.sqrt((0.01 * 0.99) / n)],
    adjacent: {
      table: { '00': n00, '01': n01, 10: n10, 11: n11 },
      statistic: independence.statistic,
      df: independence.df,
      p: independence.p,
      lag1Correlation: phi,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* E8 small curves and the discrete logarithm                                 */
/* ------------------------------------------------------------------------ */

/*
 * Curves y² = x³ + 7 over small prime fields, with the textbook affine
 * formulas. They make the discrete logarithm problem visible at a size where
 * it can still be solved by exhaustive search, so that its cost can be seen
 * to grow with the square root of the group order.
 * Points are { x, y } with BigInt coordinates; null is the point at infinity.
 */

/** P1 + P2 on y² = x³ + 7 over F_p. */
export function smallCurveAdd(p, a, b) {
  if (a === null) return b;
  if (b === null) return a;
  let slope;
  if (a.x === b.x) {
    if (mod(a.y + b.y, p) === 0n) return null;
    slope = mod(3n * a.x * a.x * inv(2n * a.y, p), p);
  } else {
    slope = mod((b.y - a.y) * inv(mod(b.x - a.x, p), p), p);
  }
  const x = mod(slope * slope - a.x - b.x, p);
  return { x, y: mod(slope * (a.x - x) - a.y, p) };
}

/** k·Q by double-and-add on a small curve. */
export function smallCurveMul(p, point, k) {
  let scalar = BigInt(k);
  if (scalar < 0n) throw new Error('scalar must be non-negative');
  let acc = null;
  let base = point;
  while (scalar > 0n) {
    if (scalar & 1n) acc = smallCurveAdd(p, acc, base);
    base = smallCurveAdd(p, base, base);
    scalar >>= 1n;
  }
  return acc;
}

/**
 * All affine points of y² = x³ + 7 over F_p, found by tabulating the squares
 * of F_p once and looking up each x³ + 7 (O(p) work).
 * @returns {{ p: bigint, points: {x: bigint, y: bigint}[], order: number }}
 */
export function smallCurvePoints(p) {
  const roots = new Map();
  for (let y = 0n; y < p; y += 1n) {
    const sq = (y * y) % p;
    if (!roots.has(sq)) roots.set(sq, []);
    roots.get(sq).push(y);
  }
  const points = [];
  for (let x = 0n; x < p; x += 1n) {
    const ys = roots.get((x * x * x + 7n) % p);
    if (ys) for (const y of ys) points.push({ x, y });
  }
  return { p, points, order: points.length + 1 };
}

/** The order of a point: the least k ≥ 1 with k·Q = ∞ (exhaustive). */
export function smallCurveOrderOf(p, point) {
  let acc = point;
  let k = 1;
  while (acc !== null) {
    acc = smallCurveAdd(p, acc, point);
    k += 1;
  }
  return k;
}

const key = (point) => (point === null ? 'inf' : `${point.x},${point.y}`);

/**
 * Exhaustive search for k with k·base = target, counting the point additions
 * performed. Expected cost: order / 2 additions.
 */
export function smallCurveDiscreteLogBruteForce(p, base, target, order) {
  let acc = null;
  for (let k = 0; k < order; k += 1) {
    if (key(acc) === key(target)) return { k, steps: k };
    acc = smallCurveAdd(p, acc, base);
  }
  return { k: null, steps: order };
}

/**
 * Baby-step giant-step (Shanks): with m = ⌈√order⌉, tabulate j·base for
 * j < m, then walk target − i·m·base for i < m until a table hit gives
 * k = i·m + j. Cost O(√order) point operations and O(√order) memory.
 */
export function smallCurveDiscreteLogBsgs(p, base, target, order) {
  const m = Math.ceil(Math.sqrt(order));
  const baby = new Map();
  let acc = null;
  let steps = 0;
  for (let j = 0; j < m; j += 1) {
    baby.set(key(acc), j);
    acc = smallCurveAdd(p, acc, base);
    steps += 1;
  }
  const giantStep = smallCurveMul(p, base, m);
  const minusGiant = giantStep === null ? null : { x: giantStep.x, y: mod(-giantStep.y, p) };
  let gamma = target;
  for (let i = 0; i < m; i += 1) {
    const j = baby.get(key(gamma));
    if (j !== undefined) return { k: (i * m + j) % order, steps, m };
    gamma = smallCurveAdd(p, gamma, minusGiant);
    steps += 1;
  }
  return { k: null, steps, m };
}

/**
 * The cost of the discrete logarithm on curves of growing size: for each
 * prime, the group order, the order of a base point, and the mean number of
 * point operations used by exhaustive search and by baby-step giant-step on
 * random challenges, next to the Pollard-rho estimate sqrt(π·order / 2).
 */
export function ecdlpCostGrowth({ primes, challenges = 5, seed = 1 }) {
  const rnd = createRandom(seed);
  return primes.map((p) => {
    const curve = smallCurvePoints(p);
    const base = curve.points[rnd.int(curve.points.length)];
    const order = smallCurveOrderOf(p, base);
    let brute = 0;
    let bsgs = 0;
    for (let c = 0; c < challenges; c += 1) {
      const k = 1 + rnd.int(order - 1);
      const target = smallCurveMul(p, base, k);
      brute += smallCurveDiscreteLogBruteForce(p, base, target, order).steps;
      bsgs += smallCurveDiscreteLogBsgs(p, base, target, order).steps;
    }
    return {
      p: Number(p),
      groupOrder: curve.order,
      baseOrder: order,
      sqrtOrder: Math.sqrt(order),
      meanBruteForceSteps: brute / challenges,
      meanBsgsSteps: bsgs / challenges,
      rhoEstimate: Math.sqrt((Math.PI * order) / 2),
    };
  });
}

/**
 * The numerical study of homework 4, exercise 1: three ways of computing the
 * corrected sum of squares SS = ∑(xᵢ − x̄)², measured against its exact value.
 *
 * Every finite double is a dyadic rational m·2ᵉ, so the exact SS of a sample of
 * doubles is the rational (n·∑xᵢ² − (∑xᵢ)²)/n, which BigInt evaluates with no
 * rounding at all once the sample is scaled to a common power of two. The error
 * of a computed value is then itself an exact rational, rounded once at the end:
 * nothing in the measurement is limited by the arithmetic being measured.
 *
 *   textbook   SS = ∑xᵢ² − (∑xᵢ)²/n              one pass, sums of large squares
 *   two-pass   SS = ∑(xᵢ − x̄)²                   the mean first, then the deviations
 *   Welford    SSₖ = SSₖ₋₁ + (xₖ − x̄ₖ₋₁)(xₖ − x̄ₖ)  one pass, src/lib/welford.js
 *
 * The sensitivity of SS to its data is the condition number
 * κ = ‖x‖₂/√SS = √(1 + n·x̄²/SS) of Chan, Golub and LeVeque (1983).
 */

import { deriveSeed } from './kg-study.js';
import { boxMuller, linearFit } from './normal.js';
import { createRandom } from './random.js';
import { summarize } from './welford.js';

/** The unit roundoff of double precision, half the distance from 1 to the next double. */
export const UNIT_ROUNDOFF = 2 ** -53;

/** The three algorithms, in the order in which they are reported. */
export const ALGORITHMS = Object.freeze(['textbook', 'twoPass', 'welford']);

/**
 * The bounds of Chan, Golub and LeVeque (1983, Table 1), which keep the dominant
 * terms only and suppress small constant factors.
 */
export const PUBLISHED_BOUNDS = Object.freeze({
  textbook: (n, kappa) => n * kappa ** 2 * UNIT_ROUNDOFF,
  twoPass: (n, kappa) => n * UNIT_ROUNDOFF + n ** 2 * kappa ** 2 * UNIT_ROUNDOFF ** 2,
  welford: (n, kappa) => n * kappa * UNIT_ROUNDOFF,
});

const scratch = new DataView(new ArrayBuffer(8));
const MANTISSA_MASK = (1n << 52n) - 1n;
const HIDDEN_BIT = 1n << 52n;

/**
 * Writes a finite double as an exact product: x = mantissa · 2^exponent, with an
 * odd mantissa (or zero).
 * @param {number} x
 * @returns {{ mantissa: bigint, exponent: number }}
 */
export function decomposeDouble(x) {
  if (!Number.isFinite(x)) throw new RangeError(`decomposeDouble: ${x} is not finite.`);
  scratch.setFloat64(0, x);
  const bits = scratch.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & MANTISSA_MASK;
  if (biased === 0 && fraction === 0n) return { mantissa: 0n, exponent: 0 };
  let mantissa = biased === 0 ? fraction : fraction | HIDDEN_BIT;
  let exponent = (biased === 0 ? 1 : biased) - 1075;
  while ((mantissa & 1n) === 0n) {
    mantissa >>= 1n;
    exponent += 1;
  }
  return { mantissa: bits >> 63n ? -mantissa : mantissa, exponent };
}

function bitLength(value) {
  const hex = value.toString(16);
  return (hex.length - 1) * 4 + Number.parseInt(hex[0], 16).toString(2).length;
}

/** m · 2^e for an integer |m| ≤ 2⁵³ whose product is representable, or infinite. */
function scaleByPowerOfTwo(m, e) {
  if (e > 1023) return m * 2 ** 1023 * 2 ** (e - 1023);
  return m * 2 ** e;
}

/**
 * The double nearest the rational p/q, ties to even, including the subnormal
 * range: the quotient is taken to 66 bits or more, a sticky bit remembers the
 * remainder, and the rounding is done once, at the last bit the result can hold.
 * @param {bigint} p
 * @param {bigint} q
 */
export function rationalToNumber(p, q) {
  if (q === 0n) throw new RangeError('rationalToNumber: zero denominator.');
  if (p === 0n) return 0;
  const negative = p < 0n !== q < 0n;
  let a = p < 0n ? -p : p;
  let b = q < 0n ? -q : q;
  const shift = 66 - (bitLength(a) - bitLength(b));
  if (shift >= 0) a <<= BigInt(shift);
  else b <<= BigInt(-shift);
  const quotient = a / b;
  const sticky = a % b !== 0n;
  const width = bitLength(quotient);
  const exponent = width - 1 - shift; // 2^exponent ≤ |p/q| < 2^(exponent + 1)
  const keep = exponent >= -1022 ? 53 : 53 - (-1022 - exponent);
  if (keep < 0) return negative ? -0 : 0;
  const drop = BigInt(width - keep);
  const kept = quotient >> drop;
  const rest = quotient - (kept << drop);
  const half = 1n << (drop - 1n);
  const up = rest > half || (rest === half && (sticky || (kept & 1n) === 1n));
  const value = scaleByPowerOfTwo(Number(up ? kept + 1n : kept), Number(drop) - shift);
  return negative ? -value : value;
}

/** n, the scaled sums ∑Mᵢ and ∑Mᵢ² of xᵢ = Mᵢ·2ᵉ, and the common exponent e. */
function scaledSums(values) {
  const n = values.length;
  if (n === 0) throw new RangeError('exactSumOfSquares: the sample is empty.');
  const parts = values.map(decomposeDouble);
  let exponent = Infinity;
  for (const part of parts) if (part.mantissa !== 0n && part.exponent < exponent) exponent = part.exponent;
  if (exponent === Infinity) exponent = 0;
  let sum = 0n;
  let squares = 0n;
  for (const { mantissa, exponent: e } of parts) {
    const m = mantissa === 0n ? 0n : mantissa << BigInt(e - exponent);
    sum += m;
    squares += m * m;
  }
  return { n: BigInt(n), sum, squares, exponent };
}

/**
 * The exact corrected sum of squares of a sample of doubles.
 * @param {number[]} values
 * @returns {{ numerator: bigint, denominator: bigint }} SS = numerator/denominator, not reduced
 */
export function exactSumOfSquares(values) {
  const { n, sum, squares, exponent } = scaledSums(values);
  const scaled = n * squares - sum * sum;
  const twice = 2 * exponent;
  return twice >= 0
    ? { numerator: scaled << BigInt(twice), denominator: n }
    : { numerator: scaled, denominator: n << BigInt(-twice) };
}

/**
 * κ = ‖x‖₂/√SS = √(1 + n·x̄²/SS), from the exact rational ‖x‖²/SS. Infinite for a
 * constant sample, which has no sum of squares to be sensitive about.
 * @param {number[]} values
 */
export function conditionNumber(values) {
  const { n, sum, squares } = scaledSums(values);
  const scaled = n * squares - sum * sum;
  if (scaled === 0n) return Infinity;
  return Math.sqrt(rationalToNumber(n * squares, scaled));
}

/** The textbook one-pass formula SS = ∑x² − (∑x)²/n. */
export function textbookSumOfSquares(values) {
  let sum = 0;
  let squares = 0;
  for (const x of values) {
    sum += x;
    squares += x * x;
  }
  return squares - (sum * sum) / values.length;
}

/** The standard two-pass algorithm: the computed mean, then the sum of squared deviations. */
export function twoPassSumOfSquares(values) {
  let sum = 0;
  for (const x of values) sum += x;
  const mean = sum / values.length;
  let ss = 0;
  for (const x of values) ss += (x - mean) ** 2;
  return ss;
}

/** Welford's recurrence, from the single implementation in src/lib/welford.js. */
export const welfordSumOfSquares = (values) => summarize(values).ss;

const COMPUTE = Object.freeze({ textbook: textbookSumOfSquares, twoPass: twoPassSumOfSquares, welford: welfordSumOfSquares });

/**
 * |computed − exact|/exact, evaluated in rational arithmetic and rounded once.
 * @param {number} computed a finite double
 * @param {{ numerator: bigint, denominator: bigint }} exact a non-negative rational
 */
export function relativeError(computed, { numerator, denominator }) {
  if (numerator === 0n) return computed === 0 ? 0 : Infinity;
  const { mantissa, exponent } = decomposeDouble(computed);
  const a = exponent >= 0 ? mantissa << BigInt(exponent) : mantissa;
  const b = exponent >= 0 ? 1n : 1n << BigInt(-exponent);
  const difference = a * denominator - numerator * b;
  return rationalToNumber(difference < 0n ? -difference : difference, b * numerator);
}

/**
 * The slope of log₁₀ y on log₁₀ x. Points that logarithmic axes cannot draw do not
 * enter the fit.
 * @param {{ x: number, y: number }[]} points
 * @returns {{ slope: number, intercept: number, count: number }} NaN below two points
 */
export function fitLogLogSlope(points) {
  const usable = points.filter((p) => p.x > 0 && p.y > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (usable.length < 2) return { slope: NaN, intercept: NaN, count: usable.length };
  const { slope, intercept } = linearFit(
    usable.map((p) => Math.log10(p.x)),
    usable.map((p) => Math.log10(p.y)),
  );
  return { slope, intercept, count: usable.length };
}

const median = (sorted) => {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};

/** Median and worst relative error of each algorithm, and how often it went negative, over some samples. */
function measure(samples) {
  const errors = Object.fromEntries(ALGORITHMS.map((name) => [name, []]));
  const negative = Object.fromEntries(ALGORITHMS.map((name) => [name, 0]));
  const kappas = [];
  for (const values of samples) {
    const exact = exactSumOfSquares(values);
    kappas.push(conditionNumber(values));
    for (const name of ALGORITHMS) {
      const computed = COMPUTE[name](values);
      errors[name].push(relativeError(computed, exact));
      if (computed < 0) negative[name] += 1;
    }
  }
  kappas.sort((a, b) => a - b);
  const algorithms = {};
  for (const name of ALGORITHMS) {
    const sorted = errors[name].sort((a, b) => a - b);
    algorithms[name] = { median: median(sorted), worst: sorted.at(-1), negative: negative[name] };
  }
  return { kappa: median(kappas), algorithms };
}

/**
 * The sweep of the condition number. The same `replicates` samples z of n standard
 * normal draws are used at every shift c, so that the data x = c + z differ from
 * one point of the sweep to the next by the shift alone (and by its rounding,
 * which belongs to the data: x is the double that was stored). The law of the
 * exercise 2 scores, X = B·Y with B ~ Bernoulli(p) and Y ~ Uniform(0, top], is
 * measured in the same way when `scores` is given.
 *
 * @param {{ seed: number, n: number, replicates: number, shifts: number[],
 *   fit?: Record<string, { algorithm: string, low: number, high: number }>,
 *   scores?: { p: number, top: number, n: number, replicates: number } }} params
 *   `fit` names the slopes to measure: each is the slope of the median error of an
 *   algorithm over a range of κ, so that one algorithm can have two regimes
 */
export function runStabilityStudy({ seed, n, replicates, shifts, fit = {}, scores }) {
  if (!Number.isInteger(n) || n < 2) throw new RangeError('runStabilityStudy: n must be at least 2.');
  if (!Number.isInteger(replicates) || replicates < 1) throw new RangeError('runStabilityStudy: replicates must be at least 1.');
  const seeds = { noise: deriveSeed(seed, 'stability:noise'), scores: deriveSeed(seed, 'stability:scores') };
  const random = createRandom(seeds.noise);
  const noise = Array.from({ length: replicates }, () => boxMuller(random.uniform, n));
  const points = shifts.map((shift) => ({
    shift,
    ...measure(noise.map((z) => z.map((v) => shift + v))),
  }));

  const slopes = {};
  for (const [key, { algorithm, low, high }] of Object.entries(fit)) {
    slopes[key] = {
      ...fitLogLogSlope(points.filter((p) => p.kappa >= low && p.kappa <= high).map((p) => ({ x: p.kappa, y: p.algorithms[algorithm].median }))),
      algorithm,
      low,
      high,
    };
  }

  // The largest ratio of a measured error to its published bound, on the part of the sweep where the bound says something.
  const boundRatios = {};
  for (const name of ALGORITHMS) {
    const ratios = points.map((p) => ({ kappa: p.kappa, bound: PUBLISHED_BOUNDS[name](n, p.kappa), worst: p.algorithms[name].worst }));
    const informative = ratios.filter((r) => r.bound < 1);
    boundRatios[name] = informative.length ? Math.max(...informative.map((r) => r.worst / r.bound)) : NaN;
  }

  const result = { n, replicates, seeds, points, slopes, boundRatios };
  if (scores) {
    const draw = createRandom(seeds.scores);
    const samples = Array.from({ length: scores.replicates }, () =>
      Array.from({ length: scores.n }, () => {
        const success = draw.uniform() < scores.p;
        const depth = scores.top * (1 - draw.uniform());
        return success ? depth : 0;
      }),
    );
    result.scores = { ...scores, ...measure(samples) };
  }
  return result;
}

/**
 * The score law of homework 4, exercise 2: the "fixed probability distribution
 * of your choice" for the score of one penetration attempt,
 *
 *   X = B·Y,  B ~ Bernoulli(p), Y ~ Uniform(0, 10], B and Y independent,
 *
 * with the p of homework 3: a failed attempt scores 0 and a successful one
 * scores the depth Y it reached. The law has an atom of 1 − p at 0 and a flat
 * density p/10 on (0, 10], so that F(x) = 0.7 + 0.03x on [0, 10]: strongly
 * skewed and heavy in its fourth moment, it cannot make anything below look
 * normal by accident.
 *
 * Everything is exact and in closed form: the raw moments E[Xᵏ] = p·10ᵏ/(k + 1)
 * and, from them, the central moments μₖ, and the exact functions of n of the
 * sample mean x̄ₙ and the sample variance s²ₙ of n independent scores.
 */

import { standardNormalCdf } from './penetration.js';
import { Z_95 } from './stats.js';

/** Probability of a successful attempt, the p of homework 3. */
export const SCORE_P = 0.3;
/** The largest score. */
export const SCORE_MAX = 10;
/** P(X = 0), the atom of a failed attempt. */
export const ATOM = 1 - SCORE_P;

/** The distribution function F(x) = P(X ≤ x). */
export function scoreCdf(x) {
  if (x < 0) return 0;
  if (x >= SCORE_MAX) return 1;
  return ATOM + (SCORE_P * x) / SCORE_MAX;
}

/** The quantile F⁻¹(u) = inf{x : F(x) ≥ u}: 0 on the atom, then linear up to 10. */
export function scoreQuantile(u) {
  if (u <= ATOM) return 0;
  return Math.min(SCORE_MAX, (SCORE_MAX * (u - ATOM)) / SCORE_P);
}

/**
 * One score, by inversion: exactly one uniform per draw, so that the draws of
 * a run are positions of its stream.
 * @param {{ uniform: () => number }} random
 */
export function drawScore(random) {
  return scoreQuantile(random.uniform());
}

/** E[Xᵏ] = p·10ᵏ/(k + 1) for k ≥ 1, and 1 for k = 0 (the atom contributes only then). */
export function rawMoment(k) {
  return k === 0 ? 1 : (SCORE_P * SCORE_MAX ** k) / (k + 1);
}

/** C(k, j) by the multiplicative formula, for the small k of the moments. */
function binomial(k, j) {
  let c = 1;
  for (let i = 1; i <= j; i += 1) c = (c * (k - j + i)) / i;
  return c;
}

/** μₖ = E[(X − μ)ᵏ], expanded in the raw moments. */
export function centralMoment(k) {
  const mean = rawMoment(1);
  let sum = 0;
  for (let j = 0; j <= k; j += 1) sum += binomial(k, j) * rawMoment(j) * (-mean) ** (k - j);
  return sum;
}

/** μ = 3/2. */
export const MU = rawMoment(1);
/** σ² = 31/4. */
export const SIGMA2 = centralMoment(2);
/** μ₃ = 36.75. */
export const MU3 = centralMoment(3);
/** μ₄ = 269.8125. */
export const MU4 = centralMoment(4);
/** The skewness μ₃/σ³, about 1.70. */
export const SKEWNESS = MU3 / SIGMA2 ** 1.5;
/** The kurtosis κ = μ₄/σ⁴, about 4.49, against 3 for a normal law. */
export const KURTOSIS = MU4 / SIGMA2 ** 2;
/** The limit of Corr(x̄ₙ, s²ₙ), μ₃/√(σ²(μ₄ − σ⁴)), about 0.91. */
export const CORRELATION_LIMIT = MU3 / Math.sqrt(SIGMA2 * (MU4 - SIGMA2 ** 2));

/** Var(x̄ₙ) = σ²/n. */
export function varianceOfMean(n) {
  return SIGMA2 / n;
}

/** Var(s²ₙ) = (μ₄ − σ⁴(n − 3)/(n − 1))/n, for n ≥ 2; NaN below. */
export function varianceOfVariance(n) {
  if (n < 2) return Number.NaN;
  return (MU4 - (SIGMA2 ** 2 * (n - 3)) / (n - 1)) / n;
}

/** Cov(x̄ₙ, s²ₙ) = μ₃/n. */
export function covarianceMeanVariance(n) {
  return MU3 / n;
}

/** Corr(x̄ₙ, s²ₙ), which depends on n only through Var(s²ₙ). */
export function correlationMeanVariance(n) {
  return MU3 / Math.sqrt(SIGMA2 * (MU4 - (SIGMA2 ** 2 * (n - 3)) / (n - 1)));
}

/** Var(s²ₙ) if the scores were normal: 2σ⁴/(n − 1). */
export function normalTheoryVariance(n) {
  return (2 * SIGMA2 ** 2) / (n - 1);
}

/**
 * The limit as n grows of the coverage of the χ² interval for σ², 2Φ(z√(2/(κ − 1))) − 1:
 * the interval has half-width z·σ²√(2/n), while s²ₙ has standard deviation σ²√((κ − 1)/n).
 */
export function chiSquareCoverageLimit(z = Z_95) {
  return 2 * standardNormalCdf(z * Math.sqrt(2 / (KURTOSIS - 1))) - 1;
}

/** The probability that a hacker scores 0 on all n systems, so that s²ₙ = 0. */
export function allZeroProbability(n) {
  return ATOM ** n;
}

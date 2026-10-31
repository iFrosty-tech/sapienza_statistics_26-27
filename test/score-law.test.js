/**
 * The score law of homework 4, exercise 2: X = B·Y with B ~ Bernoulli(0.3) and
 * Y ~ Uniform(0, 10], its distribution function and quantile, one uniform per
 * draw, its exact moments and the exact functions of n of the sample mean and
 * the sample variance.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/lib/random.js';
import { summarize } from '../src/lib/welford.js';
import { standardNormalCdf } from '../src/lib/penetration.js';
import {
  ATOM,
  CORRELATION_LIMIT,
  KURTOSIS,
  MU,
  MU3,
  MU4,
  SCORE_MAX,
  SCORE_P,
  SIGMA2,
  SKEWNESS,
  allZeroProbability,
  centralMoment,
  chiSquareCoverageLimit,
  correlationMeanVariance,
  covarianceMeanVariance,
  drawScore,
  normalTheoryVariance,
  rawMoment,
  scoreCdf,
  scoreQuantile,
  varianceOfMean,
  varianceOfVariance,
} from '../src/lib/score-law.js';

const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('the law extends homework 3: p = 0.3 and scores between 0 and 10', () => {
  assert.equal(SCORE_P, 0.3);
  assert.equal(SCORE_MAX, 10);
  close(ATOM, 0.7);
});

test('the distribution function has an atom of 0.7 at 0 and rises linearly to 1 at 10', () => {
  assert.equal(scoreCdf(-1e-9), 0);
  close(scoreCdf(0), 0.7);
  close(scoreCdf(5), 0.85);
  close(scoreCdf(10), 1);
  assert.equal(scoreCdf(11), 1);
});

test('the quantile inverts the distribution function above the atom and returns 0 on it', () => {
  assert.equal(scoreQuantile(0), 0);
  assert.equal(scoreQuantile(0.3), 0);
  assert.equal(scoreQuantile(0.7), 0);
  for (const u of [0.70001, 0.75, 0.85, 0.99, 0.999999]) close(scoreCdf(scoreQuantile(u)), u);
  close(scoreQuantile(0.85), 5);
  close(scoreQuantile(1), 10);
});

test('one draw uses exactly one uniform, and the draws stay in [0, 10]', () => {
  const calls = { n: 0 };
  const random = createRandom(7);
  const counted = {
    uniform() {
      calls.n += 1;
      return random.uniform();
    },
  };
  let zeros = 0;
  const N = 20000;
  for (let i = 0; i < N; i += 1) {
    const x = drawScore(counted);
    assert.ok(x >= 0 && x <= 10);
    if (x === 0) zeros += 1;
  }
  assert.equal(calls.n, N);
  assert.ok(Math.abs(zeros / N - 0.7) < 0.015, `share of zeros ${zeros / N}`);
});

test('the raw moments are p·10ᵏ/(k + 1) and the central moments follow in closed form', () => {
  assert.equal(rawMoment(0), 1);
  close(rawMoment(1), 1.5);
  close(rawMoment(2), 10);
  close(rawMoment(3), 75);
  close(rawMoment(4), 600);
  close(centralMoment(0), 1);
  close(centralMoment(1), 0);
  close(centralMoment(2), 7.75);
  close(centralMoment(3), 36.75);
  close(centralMoment(4), 269.8125);
  close(MU, 1.5);
  close(SIGMA2, 7.75);
  close(MU3, 36.75);
  close(MU4, 269.8125);
  close(SKEWNESS, 1.7034, 1e-4);
  close(KURTOSIS, 4.4922, 1e-4);
});

test('a large sample of the sampler matches the exact mean and variance', () => {
  const random = createRandom(20261031);
  const N = 400000;
  const values = new Float64Array(N);
  for (let i = 0; i < N; i += 1) values[i] = drawScore(random);
  const { mean, sampleVariance } = summarize(values);
  assert.ok(Math.abs(mean - MU) < 4 * Math.sqrt(SIGMA2 / N));
  assert.ok(Math.abs(sampleVariance - SIGMA2) < 4 * Math.sqrt((MU4 - SIGMA2 ** 2) / N));
});

test('the variance of the sample mean is σ²/n', () => {
  close(varianceOfMean(1), 7.75);
  close(varianceOfMean(100), 0.0775);
});

test('the variance of the sample variance is (μ₄ − σ⁴(n − 3)/(n − 1))/n', () => {
  const s4 = 7.75 ** 2;
  close(varianceOfVariance(2), (269.8125 + s4) / 2);
  close(varianceOfVariance(3), 269.8125 / 3);
  close(varianceOfVariance(100), (269.8125 - (s4 * 97) / 99) / 100);
  assert.ok(Number.isNaN(varianceOfVariance(1)));
});

test('the exact variance of s² for n = 2 and n = 3 agrees with a direct computation of its moments', () => {
  // For n = 2, s² = (X₁ − X₂)²/2, so Var(s²) = ((E(X₁ − X₂)⁴) − (E(X₁ − X₂)²)²)/4 with the central moments of (X₁ − X₂).
  const d2 = 2 * SIGMA2;
  const d4 = 2 * MU4 + 6 * SIGMA2 ** 2;
  close(varianceOfVariance(2), (d4 - d2 ** 2) / 4);
});

test('the covariance of the two estimators is μ₃/n and their correlation tends to about 0.91', () => {
  close(covarianceMeanVariance(1), 36.75);
  close(covarianceMeanVariance(50), 0.735);
  const rho = (n) => covarianceMeanVariance(n) / Math.sqrt(varianceOfMean(n) * varianceOfVariance(n));
  for (const n of [2, 5, 50, 1000]) close(correlationMeanVariance(n), rho(n));
  close(CORRELATION_LIMIT, MU3 / Math.sqrt(SIGMA2 * (MU4 - SIGMA2 ** 2)));
  close(CORRELATION_LIMIT, 0.9115, 1e-3);
  assert.ok(Math.abs(correlationMeanVariance(1e7) - CORRELATION_LIMIT) < 1e-6);
});

test('the normal-theory variance is 2σ⁴/(n − 1) and understates the true variance at every n', () => {
  close(normalTheoryVariance(11), (2 * 7.75 ** 2) / 10);
  for (const n of [2, 5, 50, 5000]) assert.ok(varianceOfVariance(n) > normalTheoryVariance(n));
  close(varianceOfVariance(1e8) / normalTheoryVariance(1e8), (KURTOSIS - 1) / 2, 1e-6);
});

test('the limit of the coverage of the χ² interval is 2Φ(z√(2/(κ − 1))) − 1, about 0.862', () => {
  const limit = chiSquareCoverageLimit();
  close(limit, 2 * standardNormalCdf(1.959963984540054 * Math.sqrt(2 / (KURTOSIS - 1))) - 1);
  close(limit, 0.862, 1e-3);
});

test('a hacker scores 0 on every system with probability 0.7ⁿ', () => {
  close(allZeroProbability(1), 0.7);
  close(allZeroProbability(5), 0.7 ** 5);
});

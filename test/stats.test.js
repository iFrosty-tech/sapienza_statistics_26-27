/**
 * Statistical helpers against tabulated values.
 * Chi-square critical values: NIST/SEMATECH e-Handbook of Statistical Methods,
 * section 1.3.6.7.4, https://www.itl.nist.gov/div898/handbook/eda/section3/eda3674.htm
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lnGamma,
  gammaP,
  gammaQ,
  chiSquareSf,
  chiSquareCdf,
  lnChoose,
  binomialPmf,
  binomialPmfTable,
  normalCdf,
  erfc,
  monobitP,
  runsTestP,
  chiSquareGoodnessOfFit,
  binnedBinomialChiSquare,
  zScore,
  collisionProbability,
  expectedCollidingPairs,
} from '../src/lib/stats.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('lnGamma matches factorials and Γ(1/2) = √π', () => {
  near(Math.exp(lnGamma(5)), 24, 1e-9);
  near(Math.exp(lnGamma(11)), 3628800, 1e-3);
  near(Math.exp(lnGamma(0.5)), Math.sqrt(Math.PI), 1e-9);
});

test('regularized incomplete gamma: P(1, 1) = 1 − e^{-1}, P + Q = 1', () => {
  near(gammaP(1, 1), 1 - Math.exp(-1), 1e-10);
  near(gammaP(3, 2.5) + gammaQ(3, 2.5), 1, 1e-12);
  near(gammaP(50, 100), 1, 1e-6, 'large x tends to 1');
  assert.equal(gammaP(2, 0), 0);
});

test('chi-square upper tail reproduces the 5% critical values', () => {
  near(chiSquareSf(3.841, 1), 0.05, 5e-4);
  near(chiSquareSf(18.307, 10), 0.05, 5e-4);
  near(chiSquareSf(293.248, 255), 0.05, 1e-3);
  near(chiSquareCdf(3.841, 1), 0.95, 5e-4);
  assert.equal(chiSquareSf(0, 5), 1);
});

test('binomial pmf sums to one and is symmetric at p = ½', () => {
  const table = binomialPmfTable(256, 0.5);
  assert.equal(table.length, 257);
  near(table.reduce((a, b) => a + b, 0), 1, 1e-9);
  near(table[128], binomialPmf(256, 128, 0.5), 1e-15);
  near(table[100], table[156], 1e-15);
  near(binomialPmf(10, 3, 0.2), 0.2013265920, 1e-9);
  near(Math.exp(lnChoose(10, 3)), 120, 1e-9);
  assert.equal(binomialPmf(5, 0, 0), 1);
  assert.equal(binomialPmf(5, 5, 1), 1);
});

test('normal cdf and erfc (Numerical Recipes erfc, fractional error below 1.2e-7)', () => {
  near(normalCdf(0), 0.5, 1e-6);
  near(normalCdf(1.959964), 0.975, 1e-6);
  near(erfc(0), 1, 1e-6);
  near(erfc(1), 0.157299207, 1e-6);
});

test('NIST monobit and runs tests on the worked examples of SP 800-22', () => {
  // SP 800-22 rev. 1a, section 2.1.8: ε = 1011010101, n = 10 → p = 0.527089.
  const bits = [1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
  near(monobitP(bits), 0.527089, 1e-5);
  // Section 2.3.8: ε = 1001101011, n = 10 → V = 7, p = 0.147232.
  const runsBits = [1, 0, 0, 1, 1, 0, 1, 0, 1, 1];
  const r = runsTestP(runsBits);
  assert.equal(r.runs, 7);
  assert.ok(r.applicable);
  near(r.p, 0.147232, 1e-5);
  const constant = runsTestP(new Array(64).fill(1));
  assert.equal(constant.applicable, false);
  assert.equal(constant.p, 0);
});

test('chi-square goodness of fit and binned binomial fit', () => {
  const fit = chiSquareGoodnessOfFit([10, 10, 10, 10], [10, 10, 10, 10]);
  assert.equal(fit.statistic, 0);
  assert.equal(fit.df, 3);
  near(fit.p, 1, 1e-12);
  const skew = chiSquareGoodnessOfFit([30, 10], [20, 20]);
  near(skew.statistic, 10, 1e-12);
  near(skew.p, chiSquareSf(10, 1), 1e-12);
  assert.throws(() => chiSquareGoodnessOfFit([1, 2], [1]));

  // Counts drawn exactly from the pmf fit perfectly after binning.
  const n = 1000;
  const pmf = binomialPmfTable(16, 0.5);
  const counts = pmf.map((q) => q * n);
  const binned = binnedBinomialChiSquare(counts, 16, 0.5, { minExpected: 5 });
  near(binned.statistic, 0, 1e-9);
  assert.ok(binned.df >= 1 && binned.df < 17);
  assert.ok(binned.bins.every((b) => b.expected >= 5));
  near(binned.bins.reduce((a, b) => a + b.observed, 0), n, 1e-9);
});

test('z-scores and birthday probabilities', () => {
  near(zScore(60, 100, 0.5), 2, 1e-12);
  near(expectedCollidingPairs(1000, 16), (1000 * 999) / 2 / 65536, 1e-12);
  near(collisionProbability(23, 365, { exact: true }), 0.507297, 1e-5, 'birthday paradox with 365 days');
  near(collisionProbability(23, 365), 0.500002, 2e-3, 'exponential approximation');
  near(collisionProbability(1, 365), 0, 1e-15);
  assert.ok(collisionProbability(400, 365, { exact: true }) === 1);
});

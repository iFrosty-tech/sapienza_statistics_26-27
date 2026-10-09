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

  // A sample too small for any bin does not crash; it reports an undefined p-value.
  const tiny = binnedBinomialChiSquare([0, 1, 1, 0, 0], 4, 0.5, { minExpected: 5 });
  assert.equal(tiny.bins.length, 1);
  assert.ok(Number.isNaN(tiny.p));
});

test('z-scores and birthday probabilities', () => {
  near(zScore(60, 100, 0.5), 2, 1e-12);
  near(expectedCollidingPairs(1000, 16), (1000 * 999) / 2 / 65536, 1e-12);
  near(collisionProbability(23, 365, { exact: true }), 0.507297, 1e-5, 'birthday paradox with 365 days');
  near(collisionProbability(23, 365), 0.500002, 2e-3, 'exponential approximation');
  near(collisionProbability(1, 365), 0, 1e-15);
  assert.ok(collisionProbability(400, 365, { exact: true }) === 1);
});

test("Nakamoto's attacker catch-up probability reproduces the whitepaper table", async () => {
  const { attackerSuccessProbability } = await import('../src/lib/stats.js');
  // Section 11 of the Bitcoin whitepaper, "Calculations": q = 0.1 and q = 0.3 rows.
  assert.ok(Math.abs(attackerSuccessProbability(0.1, 0) - 1) < 1e-12);
  assert.ok(Math.abs(attackerSuccessProbability(0.1, 1) - 0.2045873) < 1e-7);
  assert.ok(Math.abs(attackerSuccessProbability(0.1, 5) - 0.0009137) < 1e-7);
  assert.ok(Math.abs(attackerSuccessProbability(0.1, 10) - 0.0000012) < 1e-7);
  assert.ok(Math.abs(attackerSuccessProbability(0.3, 5) - 0.1773523) < 1e-7);
  assert.ok(Math.abs(attackerSuccessProbability(0.3, 10) - 0.0416605) < 1e-7);
  assert.ok(Math.abs(attackerSuccessProbability(0.3, 50) - 0.0000006) < 1e-7);
  assert.equal(attackerSuccessProbability(0.5, 20), 1, 'an attacker with half the hash rate always catches up');
});

test('exact null distribution of the runs-test p-value for short strings', async () => {
  const { runsCount, runsTestPValueDistribution, binomialPmf } = await import('../src/lib/stats.js');
  // Strings of length n with r runs number 2·C(n − 1, r − 1), summed over the number of ones.
  for (const n of [8, 31]) {
    for (let r = 1; r <= n; r += 1) {
      let total = 0;
      for (let k = 0; k <= n; k += 1) total += runsCount(n, k, r);
      assert.ok(Math.abs(total - 2 * Math.exp(lnChoose(n - 1, r - 1))) < 1e-6 * total + 1e-9, `n = ${n}, r = ${r}`);
    }
  }
  const d = runsTestPValueDistribution(256, { bins: 10 });
  assert.equal(d.bins.length, 10);
  assert.ok(Math.abs(d.bins.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // The inapplicable mass is the binomial tail |k/n − ½| ≥ 2/√n.
  let tail = 0;
  for (let k = 0; k <= 256; k += 1) if (Math.abs(k / 256 - 0.5) >= 2 / 16) tail += binomialPmf(256, k, 0.5);
  assert.ok(Math.abs(d.inapplicable - tail) < 1e-9);
  // Discreteness: the deciles are visibly unequal for 256-bit strings.
  assert.ok(Math.max(...d.bins) - Math.min(...d.bins) > 0.01);
});

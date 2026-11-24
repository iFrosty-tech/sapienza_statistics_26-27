import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPONENTIAL_THIRD_ABSOLUTE_MOMENT,
  SEQUENCES,
  alternatingSignGap,
  berryEsseenBound,
  binCounts,
  cauchyMeanTail,
  chebyshevBound,
  equicorrelatedVariance,
  exceedanceFraction,
  exponentialMeanTail,
  kolmogorovDistance,
  lastNonzeroIndex,
  runningMeans,
  standardisedMeans,
  standardisedSumCdf,
  sumSpread,
} from '../src/lib/convergence.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the exact exceedance probabilities telescope to the products they stand for', () => {
  for (const [key, term] of [['indicator', (k) => 1 - 1 / k], ['spike', (k) => 1 - 1 / (k * k)]]) {
    let product = 1;
    for (let k = 11; k <= 500; k += 1) product *= term(k);
    close(SEQUENCES[key].pExceedAfter(10, 500), 1 - product, 1e-12);
  }
});

test('the indicator sequence keeps exceeding, the spike sequence stops: the simulation agrees with the exact law', () => {
  const N = 400;
  for (const key of ['indicator', 'spike']) {
    const last = lastNonzeroIndex(SEQUENCES[key], { paths: 4000, N, seed: 11 });
    for (const n of [10, 100]) close(exceedanceFraction(last, n), SEQUENCES[key].pExceedAfter(n, N), 0.03);
  }
});

test('the second moment of the spike does not vanish although P(X_n ≠ 0) does', () => {
  assert.equal(SEQUENCES.spike.secondMoment(1000), 1);
  assert.ok(SEQUENCES.spike.pNonzero(1000) <= 1e-6);
  assert.equal(SEQUENCES.indicator.secondMoment(1000), 0.001);
});

test('the gap of the alternating sequence does not depend on n and equals 2(1 − Φ(ε/2))', () => {
  close(alternatingSignGap(0.5), 2 * (1 - 0.5987063256829237), 1e-7);
});

test('the tail of the mean of exponentials is exact and below the Chebyshev bound', () => {
  for (const n of [100, 1000, 10000]) assert.ok(exponentialMeanTail(n, 0.1) <= chebyshevBound(n, 0.1));
  // n = 1, ε = 0.5: P(X > 1.5) + P(X < 0.5) = e^{-1.5} + 1 − e^{-0.5}
  close(exponentialMeanTail(1, 0.5), Math.exp(-1.5) + 1 - Math.exp(-0.5), 1e-12);
});

test('the mean of Cauchy variables keeps the same tail at every n, so the law of large numbers fails', () => {
  close(cauchyMeanTail(0.1), 1 - (2 / Math.PI) * Math.atan(0.1));
  const paths = runningMeans('cauchy', { paths: 3000, n: 400, seed: 5 });
  const late = paths.filter((p) => Math.abs(p[399]) > 0.1).length / paths.length;
  close(late, cauchyMeanTail(0.1), 0.03);
});

test('the running means of exponentials settle at the mean', () => {
  const paths = runningMeans('exponential', { paths: 50, n: 20000, seed: 3 });
  assert.ok(paths.every((p) => Math.abs(p.at(-1) - 1) < 0.05));
});

test('the Kolmogorov distance falls as 1/√n towards γ φ(0)/6 = 0.133/√n for the exponential law', () => {
  const scaled = [100, 400, 1600].map((n) => Math.sqrt(n) * kolmogorovDistance(n, { step: 0.005 }));
  scaled.forEach((v) => close(v, 0.133, 0.01));
  assert.ok(kolmogorovDistance(100, { step: 0.005 }) < berryEsseenBound(100));
});

test('the third absolute central moment of the exponential law is 12/e − 2', () => {
  let sum = 0;
  const h = 1e-4;
  for (let x = h / 2; x < 40; x += h) sum += Math.abs(x - 1) ** 3 * Math.exp(-x) * h;
  close(sum, EXPONENTIAL_THIRD_ABSOLUTE_MOMENT, 1e-4);
});

test('the standardised sum has the law of the standardised gamma, and its simulation matches', () => {
  close(standardisedSumCdf(1, -1), 0);
  const z = standardisedMeans(30, { replicates: 20000, seed: 9 });
  const below = z.filter((v) => v <= 0).length / z.length;
  close(below, standardisedSumCdf(30, 0), 0.015);
});

test('binCounts keeps every value in exactly one bin or in the count outside', () => {
  const { counts, outside } = binCounts([-5, -0.1, 0, 0.4, 0.5, 9], { from: -1, to: 1, width: 0.5 });
  assert.deepEqual(counts, [0, 1, 2, 1]);
  assert.equal(outside, 2);
});

test('the spread of a sum grows as √n for independent terms and as n for correlated ones', () => {
  const rows = sumSpread({ ns: [10, 1000], replicates: 3000, rho: 0.3, seed: 2 });
  close(rows[0].independent / Math.sqrt(10), 1, 0.06);
  close(rows[1].independent / Math.sqrt(1000), 1, 0.06);
  close(rows[1].dependent, Math.sqrt(equicorrelatedVariance(1000, 0.3)), 0.06 * Math.sqrt(equicorrelatedVariance(1000, 0.3)));
  assert.ok(rows[1].dependent / 1000 > 0.5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bayesUpdate, betaBinomial, betaCdf, betaPdf, betaQuantile, diagnosticTest } from '../src/lib/bayes.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the posterior is normalised and equals prior × likelihood over the evidence', () => {
  const { posterior, evidence } = bayesUpdate([0.2, 0.3, 0.5], [0.5, 0.1, 0.2]);
  close(evidence, 0.1 + 0.03 + 0.1);
  close(posterior.reduce((a, b) => a + b, 0), 1);
  close(posterior[0], 0.1 / 0.23);
});

test('a prior that does not sum to one, or data of probability zero, is an error', () => {
  assert.throws(() => bayesUpdate([0.5, 0.6], [1, 1]), RangeError);
  assert.throws(() => bayesUpdate([0.5, 0.5], [0, 0]), RangeError);
  assert.throws(() => bayesUpdate([1], [1, 1]), RangeError);
});

test('a 1% prevalence with 95% sensitivity and specificity gives a posterior of 16.1%, and 78.5% after two positives', () => {
  const t = diagnosticTest({ prevalence: 0.01, sensitivity: 0.95, specificity: 0.95 });
  close(t.afterOne, 0.0095 / (0.0095 + 0.0495));
  close(t.afterTwo, 0.0095 * 0.95 / (0.0095 * 0.95 + 0.0495 * 0.05));
  close(t.truePositives, 950);
  close(t.falsePositives, 4950);
});

test('the beta density integrates to one and the distribution function inverts', () => {
  let area = 0;
  const h = 1e-4;
  for (let x = h / 2; x < 1; x += h) area += betaPdf(x, 8, 4) * h;
  close(area, 1, 1e-6);
  close(betaCdf(0.3, 1, 1), 0.3);
  close(betaCdf(0.5, 2, 2), 0.5);
  close(betaCdf(0.4, 2, 1), 0.16);
  close(betaCdf(betaQuantile(0.975, 27, 23), 27, 23), 0.975, 1e-9);
});

test('the beta–binomial update adds the data to the parameters and averages prior mean and sample proportion', () => {
  const r = betaBinomial({ a: 2, b: 18, k: 7, n: 10 });
  assert.equal(r.a, 9);
  assert.equal(r.b, 21);
  close(r.mean, r.priorWeight * 0.1 + r.dataWeight * 0.7);
  close(r.priorWeight + r.dataWeight, 1);
});

test('the uniform prior with 3 successes in 3 trials gives Laplace\'s rule of succession, 4/5', () => {
  close(betaBinomial({ a: 1, b: 1, k: 3, n: 3 }).mean, 0.8);
});

test('the posteriors of different priors approach one another as n grows', () => {
  const gap = (n) => Math.abs(betaBinomial({ a: 2, b: 18, k: 0.7 * n, n }).mean - betaBinomial({ a: 1, b: 1, k: 0.7 * n, n }).mean);
  assert.ok(gap(10) > gap(100) && gap(100) > gap(1000));
});

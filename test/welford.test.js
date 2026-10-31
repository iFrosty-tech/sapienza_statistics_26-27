import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccumulator,
  populationVariance,
  push,
  runningEstimates,
  sampleVariance,
  summarize,
} from '../src/lib/welford.js';
import { createRandom } from '../src/lib/random.js';

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

/** Mean and corrected sum of squares from their definitions, for small well-conditioned data. */
function fromDefinition(values) {
  const n = values.length;
  const mean = values.reduce((sum, x) => sum + x, 0) / n;
  const ss = values.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  return { mean, ss };
}

function randomScores(seed, n) {
  const random = createRandom(seed);
  return Array.from({ length: n }, () => 10 * random.uniform());
}

test('an empty accumulator holds no estimate', () => {
  const state = createAccumulator();
  assert.deepEqual(state, { k: 0, mean: 0, ss: 0 });
  assert.ok(Number.isNaN(sampleVariance(state)));
  assert.ok(Number.isNaN(populationVariance(state)));
});

test('one observation fixes the mean and leaves the sum of squares at zero', () => {
  const state = push(createAccumulator(), 7.5);
  assert.deepEqual(state, { k: 1, mean: 7.5, ss: 0 });
  assert.ok(Number.isNaN(sampleVariance(state)));
  assert.equal(populationVariance(state), 0);
});

test('the recurrences reproduce the textbook data set exactly', () => {
  const summary = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(summary.n, 8);
  assert.equal(summary.mean, 5);
  assert.equal(summary.ss, 32);
  assert.equal(summary.populationVariance, 4);
  close(summary.sampleVariance, 32 / 7);
});

test('the recurrences agree with the definitions on random data at every length', () => {
  for (const n of [2, 3, 10, 257, 4096]) {
    const values = randomScores(20261031 + n, n);
    const summary = summarize(values);
    const expected = fromDefinition(values);
    close(summary.mean, expected.mean);
    close(summary.ss, expected.ss, 1e-7);
    close(summary.sampleVariance, expected.ss / (n - 1), 1e-9);
  }
});

test('the result does not depend on the order of the observations', () => {
  const values = randomScores(11, 500);
  const forward = summarize(values);
  const backward = summarize([...values].reverse());
  close(forward.mean, backward.mean);
  close(forward.ss, backward.ss, 1e-8);
});

test('the increment of SS equals both forms of the recurrence and is never negative', () => {
  const values = randomScores(12, 200);
  const state = createAccumulator();
  for (const x of values) {
    const before = { ...state };
    push(state, x);
    const increment = state.ss - before.ss;
    const k = state.k;
    close(increment, (x - before.mean) * (x - state.mean), 1e-8);
    close(increment, ((k - 1) / k) * (x - before.mean) ** 2, 1e-8);
    assert.ok(increment >= 0);
  }
});

test('the sample variance obeys the recurrence that mirrors the one of the mean', () => {
  const values = randomScores(13, 100);
  const state = push(createAccumulator(), values[0]);
  let variance = 0;
  for (const x of values.slice(1)) {
    const previousMean = state.mean;
    push(state, x);
    variance += ((x - previousMean) * (x - state.mean) - variance) / (state.k - 1);
    close(variance, sampleVariance(state));
  }
});

test('the running estimates are the summaries of the prefixes', () => {
  const values = randomScores(14, 64);
  const { mean, ss, variance } = runningEstimates(values);
  assert.equal(mean.length, 64);
  assert.equal(ss.length, 64);
  assert.equal(variance.length, 64);
  assert.ok(Number.isNaN(variance[0]));
  for (const k of [2, 3, 17, 64]) {
    const prefix = summarize(values.slice(0, k));
    assert.equal(mean[k - 1], prefix.mean);
    assert.equal(ss[k - 1], prefix.ss);
    assert.equal(variance[k - 1], prefix.sampleVariance);
  }
});

test('a large common offset does not disturb the recurrences', () => {
  const summary = summarize([4, 7, 13, 16].map((x) => 1e9 + x));
  assert.equal(summary.mean, 1e9 + 10);
  assert.equal(summary.ss, 90);
  assert.equal(summary.sampleVariance, 30);
});

test('no observation is stored: the state stays three numbers long', () => {
  const state = createAccumulator();
  for (const x of randomScores(15, 1000)) push(state, x);
  assert.deepEqual(Object.keys(state).sort(), ['k', 'mean', 'ss']);
});

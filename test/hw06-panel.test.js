/**
 * The pure part of the live panel of homework 06 (src/hw06/model.js): reading
 * the mount point, the run of m hackers advanced one system at a time through
 * Welford's recurrences, the fixed axes, the bars of the histograms, the
 * bands, and the readout against theory. Nothing here touches the DOM.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/lib/random.js';
import { createAccumulator, push, sampleVariance } from '../src/lib/welford.js';
import { MU, SIGMA2, drawScore, varianceOfMean, varianceOfVariance } from '../src/lib/score-law.js';
import {
  DEFAULT_SEED,
  MEAN_DOMAIN,
  M_STOPS,
  N_STOPS,
  TRACED,
  VARIANCE_DOMAIN,
  advanceRun,
  bandAt,
  barGroup,
  createRun,
  easeBars,
  groupBars,
  histogramBars,
  panelLayout,
  parseMountOptions,
  readRun,
  runSummary,
} from '../src/hw06/model.js';

test('the mount point names a seed; an absent or unusable one falls back to the default', () => {
  assert.equal(parseMountOptions({ seed: '123' }).seed, 123);
  assert.equal(parseMountOptions({ seed: 'abc' }).seed, DEFAULT_SEED);
  assert.equal(parseMountOptions({}).seed, DEFAULT_SEED);
});

test('the scales of the controls are increasing and start where s² is defined', () => {
  for (const stops of [N_STOPS, M_STOPS]) {
    for (let i = 1; i < stops.length; i += 1) assert.ok(stops[i] > stops[i - 1]);
  }
  assert.ok(N_STOPS[0] >= 2);
  assert.ok(M_STOPS[0] >= 2);
  assert.ok(N_STOPS.at(-1) * M_STOPS.at(-1) <= 1e7, 'a run stays below ten million draws');
});

test('a run pushes one score of the stream per hacker and per system, system by system', () => {
  const run = createRun({ n: 6, m: 4, seed: 9 });
  assert.equal(run.k, 0);
  advanceRun(run, 6);
  assert.equal(run.k, 6);
  const random = createRandom(9);
  const expected = Array.from({ length: 4 }, () => createAccumulator());
  for (let k = 0; k < 6; k += 1) for (const state of expected) push(state, drawScore(random));
  assert.deepEqual(run.states, expected);
});

test('advancing in steps gives the same state as advancing at once', () => {
  const whole = createRun({ n: 50, m: 20, seed: 3 });
  advanceRun(whole, 50);
  const steps = createRun({ n: 50, m: 20, seed: 3 });
  for (const k of [1, 2, 7, 7, 30, 50, 60]) advanceRun(steps, k);
  assert.equal(steps.k, 50, 'a run never passes n');
  assert.deepEqual(steps.states, whole.states);
});

test('the traced hackers keep the whole path of their running estimates', () => {
  const run = createRun({ n: 30, m: 3 * TRACED, seed: 5 });
  advanceRun(run, 30);
  assert.equal(run.paths.length, TRACED);
  const random = createRandom(5);
  const first = createAccumulator();
  for (let k = 0; k < 30; k += 1) {
    for (let j = 0; j < run.m; j += 1) {
      const x = drawScore(random);
      if (j === 0) push(first, x);
    }
    assert.ok(Math.abs(run.paths[0].mean[k] - first.mean) < 1e-6);
    if (k >= 1) assert.ok(Math.abs(run.paths[0].variance[k] - sampleVariance(first)) < 1e-5);
  }
  assert.ok(Number.isNaN(run.paths[0].variance[0]), 's² needs two scores');
});

test('a run with fewer hackers than traced paths traces all of them', () => {
  const run = createRun({ n: 5, m: 3, seed: 1 });
  assert.equal(run.paths.length, 3);
});

test('the readout holds the averages at the step reached, with exact standard errors and z-scores', () => {
  const run = createRun({ n: 40, m: 500, seed: 2 });
  advanceRun(run, 40);
  const r = readRun(run);
  const avg = (f) => run.states.reduce((s, st) => s + f(st), 0) / run.m;
  assert.equal(r.k, 40);
  assert.ok(Math.abs(r.mean.average - avg((s) => s.mean)) < 1e-12);
  assert.ok(Math.abs(r.variance.average - avg(sampleVariance)) < 1e-12);
  assert.equal(r.mean.theory, MU);
  assert.equal(r.variance.theory, SIGMA2);
  assert.equal(r.mean.exactSd, Math.sqrt(varianceOfMean(40)));
  assert.equal(r.variance.exactSd, Math.sqrt(varianceOfVariance(40)));
  assert.equal(r.mean.standardError, Math.sqrt(varianceOfMean(40) / 500));
  assert.equal(r.mean.z, (r.mean.average - MU) / r.mean.standardError);
  assert.equal(r.variance.z, (r.variance.average - SIGMA2) / r.variance.standardError);
  assert.ok(Math.abs(r.mean.sd / r.mean.exactSd - 1) < 0.15);
  assert.ok(Math.abs(r.variance.sd / r.variance.exactSd - 1) < 0.3);
});

test('the readout says nothing about s² before a hacker has two scores', () => {
  const run = createRun({ n: 10, m: 10, seed: 2 });
  assert.equal(readRun(run).mean.average, null);
  advanceRun(run, 1);
  const r = readRun(run);
  assert.equal(r.k, 1);
  assert.equal(typeof r.mean.average, 'number');
  assert.equal(r.variance.average, null);
  assert.equal(r.variance.exactSd, null);
});

test('the bands are the exact ±2 standard deviations, cut at 0 where scores cannot go', () => {
  const b = bandAt('mean', 100);
  assert.equal(b.centre, MU);
  assert.ok(Math.abs(b.high - (MU + 2 * Math.sqrt(SIGMA2 / 100))) < 1e-12);
  assert.ok(Math.abs(b.low - (MU - 2 * Math.sqrt(SIGMA2 / 100))) < 1e-12);
  assert.equal(bandAt('mean', 2).low, 0);
  const v = bandAt('variance', 50);
  assert.equal(v.centre, SIGMA2);
  assert.ok(Math.abs(v.high - (SIGMA2 + 2 * Math.sqrt(varianceOfVariance(50)))) < 1e-12);
  assert.equal(bandAt('variance', 1), null);
});

test('the axes are fixed: the spread seen against n is the spread, not a rescaling', () => {
  assert.deepEqual(MEAN_DOMAIN, [0, 5]);
  assert.deepEqual(VARIANCE_DOMAIN, [0, 30]);
  for (const n of [N_STOPS[0], N_STOPS.at(-1)]) {
    const band = bandAt('variance', n);
    assert.ok(band.centre > VARIANCE_DOMAIN[0] && band.centre < VARIANCE_DOMAIN[1]);
  }
});

test('the histogram counts every value once, values beyond the axis in the last bar', () => {
  const bars = histogramBars([0, 0.4, 0.5, 2.5, 4.99, 5, 9], MEAN_DOMAIN, 10);
  assert.equal(bars.counts.length, 10);
  assert.equal(bars.counts.reduce((a, b) => a + b, 0), 7);
  assert.equal(bars.counts[0], 2);
  assert.equal(bars.counts[1], 1);
  assert.equal(bars.counts[5], 1);
  assert.equal(bars.counts[9], 3);
  assert.equal(bars.peak, 3);
});

test('the histogram skips undefined variances', () => {
  const bars = histogramBars([Number.NaN, 1], VARIANCE_DOMAIN, 3);
  assert.equal(bars.counts.reduce((a, b) => a + b, 0), 1);
});

test('the bars ease from the old heights to the new ones and land exactly', () => {
  const from = Float32Array.from([0, 10]);
  const to = Float32Array.from([10, 0]);
  const out = new Float32Array(2);
  easeBars(out, from, to, 0);
  assert.deepEqual([...out], [0, 10]);
  easeBars(out, from, to, 1);
  assert.deepEqual([...out], [10, 0]);
  easeBars(out, from, to, 0.5);
  assert.ok(out[0] > 5, 'exponential deceleration passes the midpoint early');
});

test('the layout keeps a plot and a strip inside the canvas at phone and desktop widths', () => {
  for (const width of [296, 328, 720, 900]) {
    const { plot, strip } = panelLayout(width, 220);
    assert.ok(plot.x >= 0 && plot.w > 120, `plot at ${width}`);
    assert.ok(strip.x > plot.x + plot.w);
    assert.ok(strip.x + strip.w <= width);
    assert.ok(plot.y >= 0 && plot.y + plot.h <= 220);
  }
});

test('the summary announces the parameters, the averages and the spreads in words', () => {
  const run = createRun({ n: 40, m: 500, seed: 2 });
  advanceRun(run, 40);
  const text = runSummary(run, readRun(run));
  assert.match(text, /500 hackers over 40 systems, seed 2/);
  assert.match(text, /average of the sampling means/);
  assert.match(text, /average of the sampling variances/);
  assert.match(text, /μ = 1\.5/);
  assert.match(text, /σ² = 7\.75/);
});

test('a drawn bar groups fine bins by Rice’s rule over the occupied range, so that few hackers still draw a shape', () => {
  const fine = new Float32Array(100);
  for (let i = 0; i < 80; i += 1) fine[i] = 1; // 80 hackers over 80 bins: 2·∛80 ≈ 9 bars
  assert.equal(barGroup(fine), 9);
  const narrow = new Float32Array(100);
  narrow[50] = 800;
  narrow[51] = 200;
  assert.equal(barGroup(narrow), 1, 'a narrow law keeps the fine bins');
  assert.equal(barGroup(new Float32Array(10)), 1, 'nothing to draw');
});

test('grouped bars keep every hacker and align at multiples of the group', () => {
  const fine = Float32Array.from([1, 2, 3, 4, 5, 6, 7]);
  const bars = groupBars(fine, 3);
  assert.deepEqual([...bars.counts], [6, 15, 7]);
  assert.equal(bars.peak, 15);
  assert.deepEqual([...groupBars(fine, 1).counts], [...fine]);
});

/**
 * The build-time study of homework 4, exercise 2: every hacker's estimates come
 * from Welford's recurrences, each n has its own stream, and the experiments
 * E1–E6 return JSON-serialisable summaries. The study runs on the full grid of
 * n with fewer hackers, which changes the values but not their meaning.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRandom } from '../src/lib/random.js';
import { createAccumulator, push, sampleVariance } from '../src/lib/welford.js';
import { chiSquareCdf, wilsonInterval } from '../src/lib/stats.js';
import {
  KURTOSIS,
  MU,
  SIGMA2,
  SKEWNESS,
  chiSquareCoverageLimit,
  correlationMeanVariance,
  drawScore,
  varianceOfMean,
  varianceOfVariance,
} from '../src/lib/score-law.js';
import {
  chiSquareQuantile,
  hackerStream,
  regularizedBeta,
  runHacker,
  runSamplingStudy,
  scoreHistogram,
  studentTCdf,
  studentTQuantile,
  studySeeds,
  tallyIntervals,
} from '../src/lib/sampling-study.js';

const PARAMS = Object.freeze({
  seed: 20261031,
  m: 2000,
  nGrid: Object.freeze([2, 5, 10, 50, 200]),
  lawSample: 2000,
  trajectories: Object.freeze({ n: 200, m: 6, points: 40 }),
  distributionN: Object.freeze([5, 50]),
  bins: 24,
  scatterN: Object.freeze([10, 200]),
  scatterPoints: 300,
  precision: Object.freeze({ n: 50, hackers: 4000, groupSizes: Object.freeze([10, 100, 1000]) }),
  level: 0.95,
});

const results = runSamplingStudy(PARAMS);
const row = (n) => results.experiments.find((e) => e.n === n);

/* ------------------------------------------------------------ distributions */

test('the regularised incomplete beta function has the exact values of its special cases', () => {
  assert.equal(regularizedBeta(0, 2, 3), 0);
  assert.equal(regularizedBeta(1, 2, 3), 1);
  assert.ok(Math.abs(regularizedBeta(0.5, 2, 2) - 0.5) < 1e-12);
  // I_x(1, b) = 1 − (1 − x)^b and I_x(a, 1) = x^a.
  assert.ok(Math.abs(regularizedBeta(0.3, 1, 4) - (1 - 0.7 ** 4)) < 1e-12);
  assert.ok(Math.abs(regularizedBeta(0.3, 3, 1) - 0.3 ** 3) < 1e-12);
});

test("Student's t distribution function matches its closed forms for 1 and 2 degrees of freedom", () => {
  assert.equal(studentTCdf(0, 7), 0.5);
  assert.ok(Math.abs(studentTCdf(1, 1) - 0.75) < 1e-12);
  const t = 1.7;
  assert.ok(Math.abs(studentTCdf(t, 2) - (0.5 + t / (2 * Math.sqrt(2 + t * t)))) < 1e-12);
  assert.ok(Math.abs(studentTCdf(-t, 9) + studentTCdf(t, 9) - 1) < 1e-12);
});

test("Student's t quantile reproduces the printed table values", () => {
  const table = [
    [1, 12.706],
    [2, 4.303],
    [9, 2.262],
    [29, 2.045],
    [120, 1.98],
  ];
  for (const [df, value] of table) assert.ok(Math.abs(studentTQuantile(0.975, df) - value) < 0.001, `df ${df}`);
  assert.ok(Math.abs(studentTQuantile(0.975, 1e6) - 1.95997) < 1e-3);
  assert.equal(studentTQuantile(0.5, 5), 0);
  assert.ok(Math.abs(studentTQuantile(0.025, 9) + studentTQuantile(0.975, 9)) < 1e-9);
});

test('the χ² quantile inverts the distribution function and reproduces the printed table values', () => {
  const table = [
    [0.975, 1, 5.024],
    [0.025, 1, 0.000982],
    [0.975, 9, 19.023],
    [0.025, 9, 2.7],
    [0.975, 99, 128.422],
  ];
  for (const [p, df, value] of table) {
    const q = chiSquareQuantile(p, df);
    assert.ok(Math.abs(q - value) <= 0.001 * Math.max(1, value), `p ${p}, df ${df}: ${q}`);
    assert.ok(Math.abs(chiSquareCdf(q, df) - p) < 1e-10);
  }
});

/* ---------------------------------------------------------------- streams */

test('a hacker pushes its n draws through Welford, one uniform per score', () => {
  const random = createRandom(11);
  const mirror = createRandom(11);
  const state = runHacker(createAccumulator(), 25, random);
  const expected = createAccumulator();
  for (let i = 0; i < 25; i += 1) push(expected, drawScore(mirror));
  assert.deepEqual(state, expected);
  // The next uniform of both generators is the same: the hacker took exactly n draws.
  assert.equal(random.uniform(), mirror.uniform());
});

test('the study reaches the estimates through push of welford.js, never through a second loop', () => {
  const source = readFileSync(new URL('../src/lib/sampling-study.js', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*\bpush\b[^}]*\} from '\.\/welford\.js'/);
  assert.doesNotMatch(source, /\.mean \+=|\.ss \+=/);
});

test('every n has its own stream, derived from the master seed', () => {
  const seeds = studySeeds(PARAMS);
  const list = PARAMS.nGrid.map((n) => seeds.n[n]);
  assert.equal(new Set(list).size, list.length);
  const a = hackerStream(PARAMS.seed, 5);
  const b = hackerStream(PARAMS.seed, 10);
  assert.notEqual(a.uniform(), b.uniform());
  assert.equal(results.meta.seeds.n[5], seeds.n[5]);
  // The estimates of one n are not a prefix of those of another: the means differ hacker by hacker.
  assert.notEqual(row(5).meanOfMeans, row(10).meanOfMeans);
});

test('the study is reproducible from its seed, and a different seed gives different numbers', () => {
  const again = runSamplingStudy(PARAMS);
  assert.deepEqual(again, results);
  const other = runSamplingStudy({ ...PARAMS, seed: PARAMS.seed + 1 });
  assert.notEqual(other.experiments[0].meanOfMeans, results.experiments[0].meanOfMeans);
});

test('the result is plain JSON: no typed array, NaN or Infinity survives serialisation', () => {
  const text = JSON.stringify(results);
  assert.deepEqual(JSON.parse(text), results);
  assert.doesNotMatch(text, /NaN|Infinity/);
});

/* ------------------------------------------------------------- experiments */

test('E1 compares the averages with μ and σ² through the exact standard errors, and counts the large z honestly', () => {
  for (const n of PARAMS.nGrid) {
    const e = row(n);
    assert.equal(e.seMean, Math.sqrt(varianceOfMean(n) / PARAMS.m));
    assert.equal(e.seVariance, Math.sqrt(varianceOfVariance(n) / PARAMS.m));
    assert.equal(e.zMean, (e.meanOfMeans - MU) / e.seMean);
    assert.equal(e.zVariance, (e.meanOfVariances - SIGMA2) / e.seVariance);
    assert.ok(Math.abs(e.meanOfSsOverN - (e.meanOfVariances * (n - 1)) / n) < 1e-9, 'SS/n is the same data with the other divisor');
    assert.equal(e.biasedExpectation, (SIGMA2 * (n - 1)) / n);
  }
  const zs = results.experiments.flatMap((e) => [e.zMean, e.zVariance]);
  assert.equal(results.summary.zCount, zs.length);
  assert.equal(results.summary.zAboveTwo, zs.filter((z) => Math.abs(z) > 2).length);
  assert.equal(results.summary.zMax, Math.max(...zs.map(Math.abs)));
});

test('E2 reports the spreads across hackers against the exact values, with log–log slopes near −1/2', () => {
  for (const n of PARAMS.nGrid) {
    const e = row(n);
    assert.equal(e.exactSdMean, Math.sqrt(varianceOfMean(n)));
    assert.equal(e.exactSdVariance, Math.sqrt(varianceOfVariance(n)));
    assert.ok(Math.abs(e.sdMean / e.exactSdMean - 1) < 0.1, `sd of x̄ at n = ${n}`);
    assert.ok(Math.abs(e.sdVariance / e.exactSdVariance - 1) < 0.2, `sd of s² at n = ${n}`);
    assert.equal(e.varianceRatio, varianceOfVariance(n) / ((2 * SIGMA2 ** 2) / (n - 1)));
  }
  assert.ok(Math.abs(results.summary.slopeMean + 0.5) < 0.05);
  assert.ok(Math.abs(results.summary.slopeVariance + 0.5) < 0.08);
  assert.ok(Math.abs(results.summary.slopeExactMean + 0.5) < 1e-12);
  assert.equal(results.summary.varianceRatioLimit, (KURTOSIS - 1) / 2);
});

test('E3 bins every hacker, with the normal approximation as expected counts, and the atom shows at small n', () => {
  for (const block of results.distributions) {
    for (const key of ['mean', 'variance']) {
      const h = block[key];
      assert.equal(h.counts.reduce((a, b) => a + b, 0), PARAMS.m);
      assert.equal(h.expected.length, h.counts.length);
      assert.equal(h.edges.length, h.counts.length + 1);
      assert.ok(h.expected.every((v) => v >= 0));
    }
  }
  const small = results.distributions.find((d) => d.n === 5);
  assert.ok(Math.abs(small.atomShare - 0.7 ** 5) < 0.03, `atom share ${small.atomShare}`);
  assert.ok(small.mean.counts[0] >= small.atomShare * PARAMS.m);
});

test('a histogram places a value on an edge once and keeps the largest value in the last bin', () => {
  const h = scoreHistogram(Float64Array.from([0, 0, 1, 2, 3, 4]), { low: 0, high: 4, bins: 4, mean: 2, sd: 1 });
  assert.deepEqual(h.counts, [2, 1, 1, 2]);
  assert.deepEqual(h.edges, [0, 1, 2, 3, 4]);
  assert.ok(Math.abs(h.expected[1] - 6 * (0.5 - 0.15865525393145707)) < 1e-9);
});

test('E4 counts a hacker with every score 0 as a miss of both intervals, and states how many there were', () => {
  const t = tallyIntervals({ n: 4, level: 0.95 });
  t.add(0, 0);
  assert.equal(t.degenerate, 1);
  assert.equal(t.t.hits, 0);
  assert.equal(t.chi.hits, 0);
  assert.equal(t.t.below + t.t.above, 1);
  assert.equal(t.chi.below + t.chi.above, 1);
  // A hacker on the theoretical values is covered by both.
  t.add(MU, SIGMA2);
  assert.equal(t.t.hits, 1);
  assert.equal(t.chi.hits, 1);
  assert.equal(t.degenerate, 1);
});

test('E3 measures the skewness of s²ₙ across hackers, which for this law stays below that of x̄ₙ', () => {
  for (const block of results.distributions) {
    assert.ok(Number.isFinite(block.skewVariance));
    assert.ok(Math.abs(block.skewVariance) < SKEWNESS / Math.sqrt(block.n), `n = ${block.n}: ${block.skewVariance}`);
  }
});

test('E4 gives coverage with Wilson intervals, and the χ² coverage is far from 95 % at the largest n', () => {
  for (const n of PARAMS.nGrid) {
    const c = row(n).coverage;
    const w = wilsonInterval(c.t.hits, PARAMS.m);
    assert.equal(c.t.rate, c.t.hits / PARAMS.m);
    assert.equal(c.t.low, w.low);
    assert.equal(c.t.high, w.high);
    assert.equal(c.t.hits + c.t.below + c.t.above, PARAMS.m);
    assert.equal(c.chi.hits + c.chi.below + c.chi.above, PARAMS.m);
    assert.ok(c.degenerateExpected === 0.7 ** n * PARAMS.m);
  }
  assert.equal(results.summary.chiLimit, chiSquareCoverageLimit());
  const last = row(200).coverage.chi.rate;
  assert.ok(Math.abs(last - chiSquareCoverageLimit()) < 0.03, `χ² coverage ${last}`);
  // The t-interval approaches the nominal level from below: its misses leave μ above the interval.
  assert.ok(row(5).coverage.t.rate < row(200).coverage.t.rate);
  assert.ok(row(5).coverage.t.below > 3 * row(5).coverage.t.above);
});

test('E5 keeps the scatter of a few hackers and the correlation of all of them, against the exact value', () => {
  assert.equal(results.scatter.length, PARAMS.scatterN.length);
  for (const s of results.scatter) {
    assert.equal(s.points.length, PARAMS.scatterPoints);
    assert.equal(s.exact, correlationMeanVariance(s.n));
    assert.ok(Math.abs(s.correlation - s.exact) < 0.08, `corr at n = ${s.n}: ${s.correlation}`);
    assert.ok(s.points.every(([x, y]) => x >= 0 && y >= 0));
  }
});

test('E6 shows that m shrinks the error of the averages as 1/√m and leaves the spread of one hacker alone', () => {
  const { n, rows, slopeMean, slopeVariance } = results.precision;
  assert.equal(n, PARAMS.precision.n);
  assert.deepEqual(rows.map((r) => r.size), PARAMS.precision.groupSizes);
  for (const r of rows) {
    assert.equal(r.groups, Math.floor(PARAMS.precision.hackers / r.size));
    assert.equal(r.seMean, Math.sqrt(varianceOfMean(n) / r.size));
    assert.ok(Math.abs(r.spreadMean / Math.sqrt(varianceOfMean(n)) - 1) < 0.1, 'the spread of one hacker does not move with m');
  }
  assert.ok(rows[0].rmsMean > 5 * rows[2].rmsMean);
  assert.ok(Math.abs(slopeMean + 0.5) < 0.2);
  assert.ok(Math.abs(slopeVariance + 0.5) < 0.2);
});

test('the running estimates of the trajectories are those of push, against the exact bands', () => {
  const tr = results.trajectories;
  assert.equal(tr.paths.length, PARAMS.trajectories.m);
  assert.equal(tr.k.at(-1), PARAMS.trajectories.n);
  const random = hackerStream(PARAMS.seed, 'trajectories');
  const state = createAccumulator();
  for (let i = 1; i <= tr.n; i += 1) {
    push(state, drawScore(random));
    const at = tr.k.indexOf(i);
    if (at >= 0) {
      assert.equal(tr.paths[0].mean[at], state.mean);
      if (i >= 2) assert.equal(tr.paths[0].variance[at], sampleVariance(state));
    }
  }
  const last = tr.k.length - 1;
  assert.equal(tr.band.sdMean[last], Math.sqrt(varianceOfMean(tr.n)));
  assert.equal(tr.band.sdVariance[last], Math.sqrt(varianceOfVariance(tr.n)));
});

test('the empirical sample of the law is summarised against its atom and its moments', () => {
  const s = results.lawSample;
  assert.equal(s.size, PARAMS.lawSample);
  assert.equal(s.counts.reduce((a, b) => a + b, 0), PARAMS.lawSample - s.zeros);
  assert.ok(Math.abs(s.zeros / s.size - 0.7) < 0.04);
  assert.equal(s.counts.length, 10);
});

test('the number of draws is the sum over the runs', () => {
  const grid = PARAMS.nGrid.reduce((a, n) => a + n * PARAMS.m, 0);
  const expected =
    grid +
    PARAMS.lawSample +
    PARAMS.trajectories.n * PARAMS.trajectories.m +
    PARAMS.precision.n * PARAMS.precision.hackers;
  assert.equal(results.meta.draws, expected);
});

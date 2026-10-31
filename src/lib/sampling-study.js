/**
 * The build-time study of homework 4, exercise 2. m hackers each attempt n
 * systems; a hacker's n scores (src/lib/score-law.js) go through Welford's
 * recurrences (push of src/lib/welford.js), which leave its sampling mean x̄ₙ
 * and its sampling variance s²ₙ = SSₙ/(n − 1). Every n of the grid is an
 * independent experiment with its own stream, derived from the master seed.
 *
 *   E1 averages       the average of the x̄ₙ against μ and of the s²ₙ against σ², with exact standard
 *                     errors and z-scores, and the average of SSₙ/n against σ²(n − 1)/n
 *   E2 spreads        the standard deviation of the x̄ₙ and of the s²ₙ across hackers against the exact
 *                     values, log–log slopes, and the true Var(s²ₙ) against the normal-theory one
 *   E3 distributions  the binned laws of x̄ₙ and s²ₙ against their normal approximations
 *   E4 coverage       the 95% t-interval for μ and the 95% χ² interval for σ², with Wilson intervals
 *   E5 scatter        (x̄ₙ, s²ₙ) across hackers, with their sample correlation against the exact one
 *   E6 precision      the role of m at fixed n: the error of the averages and the spread of one hacker
 *
 * The result is JSON-serialisable (undefined quantities are null), so that the
 * figure provider can cache it and render every figure and table from it.
 */

import { deriveSeed } from './kg-study.js';
import { linearFit } from './normal.js';
import { standardNormalCdf } from './penetration.js';
import { createRandom } from './random.js';
import { chiSquareCdf, lnGamma, pearson, wilsonInterval } from './stats.js';
import { createAccumulator, push, runningEstimates, sampleVariance } from './welford.js';
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
  chiSquareCoverageLimit,
  correlationMeanVariance,
  drawScore,
  normalTheoryVariance,
  varianceOfMean,
  varianceOfVariance,
} from './score-law.js';

/* ------------------------------------------------------ the two quantiles */

const CF_ITERATIONS = 20000;
const CF_EPSILON = 1e-15;
const CF_TINY = 1e-300;

/* The continued fraction of the incomplete beta function, by the modified Lentz method. */
function betaContinuedFraction(x, a, b) {
  const guard = (v) => (Math.abs(v) < CF_TINY ? CF_TINY : v);
  let c = 1;
  let d = 1 / guard(1 - ((a + b) * x) / (a + 1));
  let h = d;
  for (let m = 1; m <= CF_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    const even = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 / guard(1 + even * d);
    c = guard(1 + even / c);
    h *= d * c;
    const odd = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 / guard(1 + odd * d);
    c = guard(1 + odd / c);
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < CF_EPSILON) return h;
  }
  throw new Error(`regularizedBeta did not converge for x = ${x}, a = ${a}, b = ${b}`);
}

/** The regularised incomplete beta function Iₓ(a, b). */
export function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  // The fraction converges fast on this side of the mean; the other side follows by symmetry.
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Student's t distribution function with df degrees of freedom. */
export function studentTCdf(t, df) {
  if (t === 0) return 0.5;
  const tail = 0.5 * regularizedBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/* The root of an increasing function on [low, high], to the resolution of the doubles. */
function bisect(increasing, target, low, high) {
  let a = low;
  let b = high;
  for (let i = 0; i < 400 && b - a > 1e-13 * Math.max(1, Math.abs(a)); i += 1) {
    const mid = (a + b) / 2;
    if (increasing(mid) < target) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/** Student's t quantile, inverted by bisection. */
export function studentTQuantile(p, df) {
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  let high = 1;
  while (studentTCdf(high, df) < p) high *= 2;
  return bisect((t) => studentTCdf(t, df), p, 0, high);
}

/** The χ² quantile, inverted by bisection. */
export function chiSquareQuantile(p, df) {
  let high = df + 10;
  while (chiSquareCdf(high, df) < p) high *= 2;
  return bisect((x) => chiSquareCdf(x, df), p, 0, high);
}

/* ----------------------------------------------------------------- streams */

const streamLabel = (key) => (typeof key === 'number' ? `hackers:n${key}` : key);

/** The generator of one run: an n of the grid, or the name of an auxiliary run. */
export function hackerStream(seed, key) {
  return createRandom(deriveSeed(seed, streamLabel(key)));
}

/** The seed of every stream of the study. */
export function studySeeds(params) {
  const { seed } = params;
  return {
    master: seed,
    n: Object.fromEntries(params.nGrid.map((n) => [n, deriveSeed(seed, streamLabel(n))])),
    law: deriveSeed(seed, 'law'),
    trajectories: deriveSeed(seed, 'trajectories'),
    precision: deriveSeed(seed, 'precision'),
  };
}

/**
 * One hacker over n systems: each score, drawn from the stream, goes through
 * Welford's recurrences. Returns the same state.
 */
export function runHacker(state, n, random) {
  for (let i = 0; i < n; i += 1) push(state, drawScore(random));
  return state;
}

/* ------------------------------------------------------------- histograms */

function niceWidth(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power;
}

/* Bins of a round width covering [lo, hi], about `target` of them, with edges on multiples of the width. */
function roundBins(lo, hi, target) {
  const width = niceWidth((hi - lo) / target || 1);
  const low = Math.floor(lo / width + 1e-9) * width;
  const high = Math.ceil(hi / width - 1e-9) * width;
  return { low, high, bins: Math.max(1, Math.round((high - low) / width)) };
}

/**
 * The counts of the values in equal bins on [low, high] (each bin closed on the
 * left, the last also on the right) and, for the normal law N(mean, sd²), the
 * expected count of each bin.
 * @returns {{ edges: number[], counts: number[], expected: number[] }}
 */
export function scoreHistogram(values, { low, high, bins, mean, sd }) {
  const width = (high - low) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - low) / width))] += 1;
  const edges = Array.from({ length: bins + 1 }, (_, i) => low + i * width);
  const phi = (x) => standardNormalCdf((x - mean) / sd);
  const expected = counts.map((_, i) => values.length * (phi(edges[i + 1]) - phi(edges[i])));
  return { edges, counts, expected };
}

/* ----------------------------------------------------------------- E4 */

/**
 * The two intervals of one experiment, counted hacker by hacker. `below` counts
 * the intervals lying wholly below the true value and `above` those wholly above.
 * A hacker with every score 0 has s² = 0, and both of its intervals collapse to
 * the point 0, which lies below μ and σ²: it is counted as a miss, and as degenerate.
 * @param {{ n: number, level: number }} options
 */
export function tallyIntervals({ n, level }) {
  const alpha = 1 - level;
  const t = studentTQuantile(1 - alpha / 2, n - 1);
  const chiLow = chiSquareQuantile(alpha / 2, n - 1);
  const chiHigh = chiSquareQuantile(1 - alpha / 2, n - 1);
  const tally = {
    degenerate: 0,
    t: { hits: 0, below: 0, above: 0 },
    chi: { hits: 0, below: 0, above: 0 },
    quantiles: { t, chiLow, chiHigh },
    add(mean, variance) {
      if (variance === 0) tally.degenerate += 1;
      const half = t * Math.sqrt(variance / n);
      classify(tally.t, mean - half, mean + half, MU);
      classify(tally.chi, ((n - 1) * variance) / chiHigh, ((n - 1) * variance) / chiLow, SIGMA2);
    },
  };
  return tally;
}

function classify(counter, low, high, truth) {
  if (high < truth) counter.below += 1;
  else if (low > truth) counter.above += 1;
  else counter.hits += 1;
}

function coverageSummary(counter, m) {
  const { low, high } = wilsonInterval(counter.hits, m);
  return { hits: counter.hits, below: counter.below, above: counter.above, rate: counter.hits / m, low, high };
}

/* ------------------------------------------------------------ experiments */

/* m hackers over n systems, from the stream of this n. */
function runExperiment(n, params) {
  const { m, level } = params;
  const random = hackerStream(params.seed, n);
  const means = new Float64Array(m);
  const variances = new Float64Array(m);
  // The averages and spreads across hackers come from the same recurrences as the estimates of one hacker.
  const acrossMeans = createAccumulator();
  const acrossVariances = createAccumulator();
  const tally = tallyIntervals({ n, level });
  for (let j = 0; j < m; j += 1) {
    const state = runHacker(createAccumulator(), n, random);
    const variance = sampleVariance(state);
    means[j] = state.mean;
    variances[j] = variance;
    push(acrossMeans, state.mean);
    push(acrossVariances, variance);
    tally.add(state.mean, variance);
  }
  const seMean = Math.sqrt(varianceOfMean(n) / m);
  const seVariance = Math.sqrt(varianceOfVariance(n) / m);
  const biasFactor = (n - 1) / n;
  const row = {
    n,
    meanOfMeans: acrossMeans.mean,
    meanOfVariances: acrossVariances.mean,
    seMean,
    seVariance,
    zMean: (acrossMeans.mean - MU) / seMean,
    zVariance: (acrossVariances.mean - SIGMA2) / seVariance,
    meanOfSsOverN: acrossVariances.mean * biasFactor,
    biasedExpectation: (SIGMA2 * (n - 1)) / n,
    seSsOverN: seVariance * biasFactor,
    sdMean: Math.sqrt(sampleVariance(acrossMeans)),
    sdVariance: Math.sqrt(sampleVariance(acrossVariances)),
    exactSdMean: Math.sqrt(varianceOfMean(n)),
    exactSdVariance: Math.sqrt(varianceOfVariance(n)),
    varianceRatio: varianceOfVariance(n) / normalTheoryVariance(n),
    coverage: {
      t: coverageSummary(tally.t, m),
      chi: coverageSummary(tally.chi, m),
      degenerate: tally.degenerate,
      degenerateExpected: allZeroProbability(n) * m,
      tQuantile: tally.quantiles.t,
      chiLow: tally.quantiles.chiLow,
      chiHigh: tally.quantiles.chiHigh,
    },
  };
  return { row, means, variances };
}

function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/* The bins cover every hacker and the central ±4.5 sd of the normal approximation, within the positive axis. */
function distributionOf(values, mean, sd, target) {
  const [observedLow, observedHigh] = extent(values);
  const lo = Math.min(observedLow, Math.max(0, mean - 4.5 * sd));
  const hi = Math.max(observedHigh, mean + 4.5 * sd);
  return { ...scoreHistogram(values, { ...roundBins(lo, hi, target), mean, sd }), observedLow, observedHigh };
}

/** Moment skewness of a sample. */
function skewnessOf(values) {
  const state = createAccumulator();
  for (const v of values) push(state, v);
  const sd = Math.sqrt(state.ss / state.k);
  let sum = 0;
  for (const v of values) sum += ((v - state.mean) / sd) ** 3;
  return sum / state.k;
}

function distributionBlock({ row, means, variances }, target) {
  const { n, exactSdMean, exactSdVariance } = row;
  return {
    n,
    atomShare: row.coverage.degenerate / means.length,
    skewVariance: skewnessOf(variances),
    mean: distributionOf(means, MU, exactSdMean, target),
    variance: distributionOf(variances, SIGMA2, exactSdVariance, target),
  };
}

function scatterBlock({ row, means, variances }, size) {
  const { n } = row;
  const keep = (v) => Math.round(v * 1000) / 1000;
  return {
    n,
    correlation: pearson(means, variances),
    exact: correlationMeanVariance(n),
    atomShare: row.coverage.degenerate / means.length,
    points: Array.from({ length: Math.min(size, means.length) }, (_, j) => [keep(means[j]), keep(variances[j])]),
  };
}

/* The sample of Fig. 1: its atom, ten bins on (0, 10] and its moments. */
function lawSampleStudy(params) {
  const random = hackerStream(params.seed, 'law');
  const size = params.lawSample;
  const state = createAccumulator();
  const counts = new Array(10).fill(0);
  let zeros = 0;
  for (let i = 0; i < size; i += 1) {
    const x = drawScore(random);
    push(state, x);
    if (x === 0) zeros += 1;
    else counts[Math.min(9, Math.ceil(x) - 1)] += 1;
  }
  return { size, zeros, counts, expectedPerBin: (size * SCORE_P) / counts.length, mean: state.mean, variance: sampleVariance(state) };
}

/* The running steps kept of a path: 2 … 10, then evenly on a logarithmic scale up to n. */
function runningSteps(n, points) {
  const steps = new Set();
  for (let k = 2; k <= Math.min(10, n); k += 1) steps.add(k);
  for (let i = 0; i <= points; i += 1) steps.add(Math.round(10 * (n / 10) ** (i / points)));
  return [...steps].filter((k) => k >= 2 && k <= n).sort((a, b) => a - b);
}

const finiteOrNull = (v) => (Number.isFinite(v) ? v : null);

function trajectoryStudy(params) {
  const { n, m, points } = params.trajectories;
  const random = hackerStream(params.seed, 'trajectories');
  const k = runningSteps(n, points);
  const paths = [];
  for (let j = 0; j < m; j += 1) {
    const scores = new Float64Array(n);
    for (let i = 0; i < n; i += 1) scores[i] = drawScore(random);
    const running = runningEstimates(scores);
    paths.push({
      mean: k.map((step) => running.mean[step - 1]),
      variance: k.map((step) => finiteOrNull(running.variance[step - 1])),
    });
  }
  return {
    n,
    m,
    k,
    paths,
    band: {
      sdMean: k.map((step) => Math.sqrt(varianceOfMean(step))),
      sdVariance: k.map((step) => Math.sqrt(varianceOfVariance(step))),
    },
  };
}

/* The size of m at fixed n: disjoint groups of hackers from one long run. */
function precisionStudy(params) {
  const { n, hackers, groupSizes } = params.precision;
  const random = hackerStream(params.seed, 'precision');
  const means = new Float64Array(hackers);
  const variances = new Float64Array(hackers);
  for (let j = 0; j < hackers; j += 1) {
    const state = runHacker(createAccumulator(), n, random);
    means[j] = state.mean;
    variances[j] = sampleVariance(state);
  }
  const rows = groupSizes.filter((size) => size <= hackers).map((size) => {
    const groups = Math.floor(hackers / size);
    const totals = { errorMean: 0, errorVariance: 0, withinMean: 0, withinVariance: 0 };
    for (let g = 0; g < groups; g += 1) {
      const groupMeans = createAccumulator();
      const groupVariances = createAccumulator();
      for (let j = g * size; j < (g + 1) * size; j += 1) {
        push(groupMeans, means[j]);
        push(groupVariances, variances[j]);
      }
      totals.errorMean += (groupMeans.mean - MU) ** 2;
      totals.errorVariance += (groupVariances.mean - SIGMA2) ** 2;
      totals.withinMean += sampleVariance(groupMeans);
      totals.withinVariance += sampleVariance(groupVariances);
    }
    return {
      size,
      groups,
      rmsMean: Math.sqrt(totals.errorMean / groups),
      rmsVariance: Math.sqrt(totals.errorVariance / groups),
      seMean: Math.sqrt(varianceOfMean(n) / size),
      seVariance: Math.sqrt(varianceOfVariance(n) / size),
      spreadMean: Math.sqrt(totals.withinMean / groups),
      spreadVariance: Math.sqrt(totals.withinVariance / groups),
    };
  });
  const slope = (key) => linearFit(rows.map((r) => Math.log10(r.size)), rows.map((r) => Math.log10(r[key]))).slope;
  return {
    n,
    hackers,
    rows,
    slopeMean: slope('rmsMean'),
    slopeVariance: slope('rmsVariance'),
    exactSdMean: Math.sqrt(varianceOfMean(n)),
    exactSdVariance: Math.sqrt(varianceOfVariance(n)),
  };
}

function summaryOf(experiments) {
  const zs = experiments.flatMap((e) => [e.zMean, e.zVariance]);
  const logN = experiments.map((e) => Math.log10(e.n));
  const slope = (key) => linearFit(logN, experiments.map((e) => Math.log10(e[key]))).slope;
  return {
    zCount: zs.length,
    zAboveTwo: zs.filter((z) => Math.abs(z) > 2).length,
    zMax: Math.max(...zs.map(Math.abs)),
    slopeMean: slope('sdMean'),
    slopeVariance: slope('sdVariance'),
    slopeExactMean: slope('exactSdMean'),
    slopeExactVariance: slope('exactSdVariance'),
    varianceRatioLimit: (KURTOSIS - 1) / 2,
    chiLimit: chiSquareCoverageLimit(),
    correlationLimit: CORRELATION_LIMIT,
  };
}

/**
 * Runs the whole study.
 * @param {{ seed: number, m: number, nGrid: number[], lawSample: number,
 *   trajectories: { n: number, m: number, points: number }, distributionN: number[], bins: number,
 *   scatterN: number[], scatterPoints: number, level: number,
 *   precision: { n: number, hackers: number, groupSizes: number[] } }} params
 */
export function runSamplingStudy(params) {
  const { m, nGrid, distributionN, scatterN, bins, scatterPoints } = params;
  const experiments = [];
  const distributions = [];
  const scatter = [];
  for (const n of nGrid) {
    const run = runExperiment(n, params);
    experiments.push(run.row);
    if (distributionN.includes(n)) distributions.push(distributionBlock(run, bins));
    if (scatterN.includes(n)) scatter.push(scatterBlock(run, scatterPoints));
  }
  const gridDraws = nGrid.reduce((sum, n) => sum + n * m, 0);
  const { n: tn, m: tm } = params.trajectories;
  return {
    law: { p: SCORE_P, max: SCORE_MAX, atom: ATOM, mu: MU, sigma2: SIGMA2, mu3: MU3, mu4: MU4, skewness: SKEWNESS, kurtosis: KURTOSIS },
    meta: {
      seeds: studySeeds(params),
      draws: gridDraws + params.lawSample + tn * tm + params.precision.n * params.precision.hackers,
    },
    lawSample: lawSampleStudy(params),
    trajectories: trajectoryStudy(params),
    experiments,
    distributions,
    scatter,
    precision: precisionStudy(params),
    summary: summaryOf(experiments),
  };
}

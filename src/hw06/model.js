/**
 * The pure part of the live panel of homework 06: reading the mount point, the
 * scales of the controls, a run of m hackers advanced one system at a time, the
 * fixed axes, the exact bands, the bars of the histograms, and the readout
 * against theory. Nothing here touches the DOM, so that every rule the panel
 * follows is tested in Node (test/hw06-panel.test.js).
 *
 * A run is a state of the recurrences of src/lib/welford.js for each hacker.
 * Every system, each hacker takes the next score of one seeded stream and
 * pushes it, so the animation of the panel is the algorithm itself: nothing is
 * stored but the state, and the paths of the few hackers that are drawn. The
 * stream is read system by system, so that a longer run of the same m extends
 * a shorter one, and the estimates at step k do not depend on n.
 */

import { createRandom } from '../lib/random.js';
import { createAccumulator, push, sampleVariance } from '../lib/welford.js';
import { MU, SIGMA2, drawScore, varianceOfMean, varianceOfVariance } from '../lib/score-law.js';
import { easeOut, formatNumber, parseSeed } from '../hw04/model.js';

/** Seed of the panel when the mount point names none: the master seed of the study. */
export const DEFAULT_SEED = 20261031;
/** Systems per hacker. */
export const N_STOPS = [5, 10, 20, 50, 100, 200, 500, 1000];
/** Hackers. */
export const M_STOPS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
/** Hackers whose whole path is kept and drawn. */
export const TRACED = 12;

/**
 * The two vertical axes. They never rescale with n or m, so that what the reader
 * sees change is the spread itself: x̄ lives on the lower half of the scores,
 * and s² is cut at 30 although a very short trajectory can reach 50.
 */
export const MEAN_DOMAIN = Object.freeze([0, 5]);
export const VARIANCE_DOMAIN = Object.freeze([0, 30]);
export const DOMAINS = Object.freeze({ mean: MEAN_DOMAIN, variance: VARIANCE_DOMAIN });

/** The options of the panel read from its mount point. */
export function parseMountOptions(dataset = {}) {
  const seed = parseSeed(dataset.seed);
  return { seed: seed.ok ? seed.seed : DEFAULT_SEED };
}

/* --------------------------------------------------------------------- run */

/** A run before any system: k = 0, one fresh state per hacker, and empty paths. */
export function createRun({ n, m, seed }) {
  const traced = Math.min(TRACED, m);
  return {
    n,
    m,
    seed,
    k: 0,
    random: createRandom(seed),
    states: Array.from({ length: m }, createAccumulator),
    paths: Array.from({ length: traced }, () => ({ mean: new Float32Array(n), variance: new Float32Array(n) })),
    buffer: new Float64Array(m),
  };
}

/** Every hacker attempts the next systems, up to step `target` (never past n). */
export function advanceRun(run, target) {
  const { states, paths, random, m } = run;
  const to = Math.min(run.n, Math.floor(target));
  for (let k = run.k; k < to; k += 1) {
    for (let j = 0; j < m; j += 1) {
      const state = states[j];
      push(state, drawScore(random));
      if (j < paths.length) {
        paths[j].mean[k] = state.mean;
        paths[j].variance[k] = sampleVariance(state);
      }
    }
  }
  run.k = Math.max(run.k, to);
  return run;
}

/** The estimates of all hackers at the step reached, in the buffer of the run. */
export function estimates(run, quantity) {
  const { states, buffer } = run;
  const read = quantity === 'mean' ? (s) => s.mean : sampleVariance;
  for (let j = 0; j < states.length; j += 1) buffer[j] = read(states[j]);
  return buffer;
}

/* ------------------------------------------------------------------ theory */

/** The theoretical value and the exact ±2 standard deviations at step k, cut at 0; null before an estimate exists. */
export function bandAt(quantity, k) {
  const centre = quantity === 'mean' ? MU : SIGMA2;
  const variance = quantity === 'mean' ? varianceOfMean(k) : varianceOfVariance(k);
  if (!(k >= 1) || Number.isNaN(variance)) return null;
  const sd = Math.sqrt(variance);
  return { centre, sd, low: Math.max(0, centre - 2 * sd), high: centre + 2 * sd };
}

/* --------------------------------------------------------------------- bars */

/**
 * Counts of the values in equal bars on the domain. Values above the axis stay
 * in the last bar, so that no hacker leaves the drawing; undefined ones are skipped.
 * @returns {{ counts: Float32Array, peak: number }}
 */
export function histogramBars(values, [low, high], bins) {
  const counts = new Float32Array(bins);
  const scale = bins / (high - low);
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    counts[Math.max(0, Math.min(bins - 1, Math.floor((v - low) * scale)))] += 1;
  }
  return { counts, peak: counts.reduce((a, b) => Math.max(a, b), 0) };
}

/**
 * How many fine bins one drawn bar holds: no more bars over the occupied range than
 * Rice's rule, 2·m^(1/3), allows, so that a few hackers still draw a shape.
 */
export function barGroup(counts) {
  let first = -1;
  let last = -1;
  let total = 0;
  counts.forEach((c, i) => {
    if (c < 0.5) return;
    if (first < 0) first = i;
    last = i;
    total += c;
  });
  if (first < 0) return 1;
  return Math.max(1, Math.ceil((last - first + 1) / Math.max(4, Math.ceil(2 * Math.cbrt(total)))));
}

/** The fine bins summed in groups aligned at multiples of `group`. */
export function groupBars(counts, group) {
  const grouped = new Float32Array(Math.ceil(counts.length / group));
  counts.forEach((c, i) => {
    grouped[Math.floor(i / group)] += c;
  });
  return { counts: grouped, peak: grouped.reduce((a, b) => Math.max(a, b), 0) };
}

/** out[i] between from[i] and to[i], at the decelerating progress of x ∈ [0, 1]. */
export function easeBars(out, from, to, x) {
  const e = easeOut(x);
  for (let i = 0; i < out.length; i += 1) out[i] = from[i] + (to[i] - from[i]) * e;
  return out;
}

/* ------------------------------------------------------------------ layout */

/** The drawing of one estimate: the running paths on the left, the histogram across hackers beside them. */
export function panelLayout(width, height) {
  const left = 40;
  const right = 4;
  const top = 24;
  const bottom = 34;
  const gap = 10;
  const stripW = Math.min(130, Math.max(56, Math.round(width * 0.16)));
  const plot = { x: left, y: top, w: width - left - right - gap - stripW, h: height - top - bottom };
  return { plot, strip: { x: plot.x + plot.w + gap, w: stripW } };
}

/* ----------------------------------------------------------------- readout */

function readQuantity(run, quantity) {
  const theory = quantity === 'mean' ? MU : SIGMA2;
  const empty = { theory, average: null, sd: null, exactSd: null, standardError: null, z: null };
  const { k, m } = run;
  if (k < (quantity === 'mean' ? 1 : 2)) return empty;
  // The averages across hackers come from the same recurrences as the estimates of one hacker.
  const across = createAccumulator();
  for (const v of estimates(run, quantity)) push(across, v);
  const exactVariance = quantity === 'mean' ? varianceOfMean(k) : varianceOfVariance(k);
  const standardError = Math.sqrt(exactVariance / m);
  return {
    theory,
    average: across.mean,
    sd: Math.sqrt(sampleVariance(across)),
    exactSd: Math.sqrt(exactVariance),
    standardError,
    z: (across.mean - theory) / standardError,
  };
}

/** The averages across hackers at the step reached, against μ and σ², with exact standard errors. */
export function readRun(run) {
  return { k: run.k, n: run.n, m: run.m, mean: readQuantity(run, 'mean'), variance: readQuantity(run, 'variance') };
}

/** The words announced for a run. */
export function runSummary(run, readout) {
  const { mean, variance, k } = readout;
  const count = (v) => v.toLocaleString('en-GB');
  const head = `${count(run.m)} hackers over ${count(run.n)} systems, seed ${run.seed}. After ${count(k)} systems:`;
  if (mean.average === null || variance.average === null) return `${head} too few scores for an estimate.`;
  return (
    `${head} the average of the sampling means is ${formatNumber(mean.average)} against μ = ${formatNumber(mean.theory)}, ` +
    `and the average of the sampling variances is ${formatNumber(variance.average)} against σ² = ${formatNumber(variance.theory)}. ` +
    `Across the hackers the sampling means have standard deviation ${formatNumber(mean.sd)} and the sampling variances ${formatNumber(variance.sd)}.`
  );
}

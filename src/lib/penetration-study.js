/**
 * The build-time study of homework 04: experiments on the penetration process
 * of src/lib/penetration.js, driven by one parameter object and returning a
 * JSON-serialisable summary (undefined values are null), so that the figure
 * provider can cache it and render every figure and table from it.
 *
 * One simulateScores run per model holds the total scores of the same m
 * attackers at every checkpoint n of the study, so that the distributions at
 * increasing n come from the same attackers continuing on more systems. The
 * experiments are
 *
 *   E1 trajectories   sample paths of a few attackers for Sₜ, Sₜ/t and Sₜ/√t, with the theoretical envelope
 *   E2 distributions  the binned law of Sₙ at increasing n, empirical and exact
 *   E3 moments        empirical mean and variance of the three quantities, with standard errors, against theory
 *   E4 variance       the variance against n under the three normalisations, with fitted log–log slopes
 *   E5 lln            P(|Sₙ/n − μ| ≥ ε): empirical with Wilson intervals, exact, Chebyshev and Hoeffding
 *   E6 clt            Kolmogorov distance of the Rademacher Sₙ/√n to N(0, 1), with Berry–Esseen and DKW
 *   E7 clt.bernoulli  the Bernoulli Sₙ/√n, which drifts, against its standardised form, which converges
 *   E8 precision      the role of m at fixed n: error of the empirical mean and of the distribution function
 *   E9 aggregate/best the total score of a group of attackers, and the chance that the best of m attackers
 *                     penetrates a given share of the n systems
 *
 * Every simulation, exact law, bound and Φ comes from src/lib/penetration.js.
 */

import { linearFit, mean as sampleMean } from './normal.js';
import { deriveSeed } from './kg-study.js';
import { wilsonInterval } from './stats.js';
import {
  NORMALIZATIONS,
  berryEsseenBound,
  chebyshevBound,
  dkwRadius,
  empiricalExceedance,
  exactExceedance,
  exactKolmogorovDistance,
  exactScoreLaw,
  hoeffdingBound,
  incrementLaw,
  kolmogorovDistance,
  normalizeScores,
  probabilityAnyAttackerReaches,
  sampleMoments,
  scoreMoments,
  simulateScores,
  simulateTrajectories,
  standardNormalCdf,
} from './penetration.js';

const MODEL_IDS = ['bernoulli', 'rademacher'];
const QUANTITY_IDS = Object.keys(NORMALIZATIONS);

/** A finite number, or null (JSON has no NaN or Infinity). */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Every n at which the simulated scores are recorded: the sorted union of the
 * grids of all experiments.
 */
export function studyCheckpoints(params) {
  const all = [
    ...params.curveN,
    ...params.distributionN,
    ...params.cltPlotN,
    params.precision.n,
    ...params.aggregate.n,
    ...params.best.n,
  ];
  return [...new Set(all)].sort((a, b) => a - b);
}

/** Integers 1 … nMax spaced evenly on a logarithmic scale, perDecade per decade, ending at nMax. */
export function denseGrid(nMax, perDecade) {
  const steps = Math.ceil(Math.log10(nMax) * perDecade);
  const out = new Set([1, nMax]);
  for (let k = 0; k <= steps; k += 1) out.add(Math.min(nMax, Math.round(10 ** (k / perDecade))));
  return [...out].sort((a, b) => a - b);
}

/* The stream of each run, derived from the master seed. */
function seedsOf(seed) {
  return {
    bernoulli: deriveSeed(seed, 'scores:bernoulli'),
    rademacher: deriveSeed(seed, 'scores:rademacher'),
    trajectoriesBernoulli: deriveSeed(seed, 'trajectories:bernoulli'),
    trajectoriesRademacher: deriveSeed(seed, 'trajectories:rademacher'),
  };
}

/* The binomial count K of a total score, Sₙ = n·low + (high − low)·K. */
const countOf = (law, n) => (s) => (s - n * law.low) / (law.high - law.low);

/* ------------------------------------------------------------------ E1 */

/* Indices at which a path is kept: the first ten steps, then about `points` evenly spaced steps up to n. */
function trajectoryIndices(n, points) {
  const out = new Set();
  for (let t = 1; t <= Math.min(10, n); t += 1) out.add(t);
  for (let k = 1; k <= points; k += 1) out.add(Math.max(1, Math.round((k * n) / points)));
  return [...out].sort((a, b) => a - b);
}

function trajectoryStudy(params, laws, seeds) {
  const { n, m, points } = params.trajectories;
  const t = trajectoryIndices(n, points);
  const models = {};
  for (const model of MODEL_IDS) {
    const law = laws[model];
    const seed = seeds[model === 'bernoulli' ? 'trajectoriesBernoulli' : 'trajectoriesRademacher'];
    const paths = simulateTrajectories({ law, n, m, seed }).map((path) => t.map((i) => path[i]));
    const envelope = {};
    for (const q of QUANTITY_IDS) envelope[q] = { mean: [], sd: [] };
    for (const i of t) {
      const th = scoreMoments(law, i);
      for (const q of QUANTITY_IDS) {
        envelope[q].mean.push(th[q].mean);
        envelope[q].sd.push(th[q].sd);
      }
    }
    models[model] = { paths, envelope };
  }
  return { n, m, t, models };
}

/* ------------------------------------------------------------------ E2 */

/* The law of Sₙ binned on its binomial count: the central ±4.5 sd, widened to every observed value. */
function binnedLaw(law, n, scores, binsTarget) {
  const toK = countOf(law, n);
  let observedMin = Infinity;
  let observedMax = -Infinity;
  for (const s of scores) {
    const k = toK(s);
    if (k < observedMin) observedMin = k;
    if (k > observedMax) observedMax = k;
  }
  const centre = n * law.q;
  const sd = Math.sqrt(n * law.q * (1 - law.q));
  const lo = Math.min(observedMin, Math.max(0, Math.floor(centre - 4.5 * sd)));
  const hi = Math.max(observedMax, Math.min(n, Math.ceil(centre + 4.5 * sd)));
  const width = Math.max(1, Math.ceil((hi - lo + 1) / binsTarget));
  const bins = Math.ceil((hi - lo + 1) / width);
  const empirical = new Array(bins).fill(0);
  for (const s of scores) empirical[Math.floor((toK(s) - lo) / width)] += 1;
  const { prob } = exactScoreLaw(law, n);
  const exact = new Array(bins).fill(0);
  for (let k = lo; k <= Math.min(n, lo + bins * width - 1); k += 1) exact[Math.floor((k - lo) / width)] += prob[k];
  return { n, k0: lo, width, empirical, exact, observedMin, observedMax };
}

/* ------------------------------------------------------------------ E3 */

/* Mean and unbiased variance with their standard errors, s/√m and √((m̂₄ − s⁴)/m). */
function momentsWithErrors(values) {
  const m = values.length;
  const { mean, variance } = sampleMoments(values);
  let m4 = 0;
  for (const v of values) m4 += (v - mean) ** 4;
  m4 /= m;
  return {
    mean,
    variance,
    seMean: Math.sqrt(variance / m),
    seVariance: Math.sqrt(Math.max(0, m4 - variance * variance) / m),
  };
}

/* ------------------------------------------------------------------ E5 */

/*
 * The smallest n from which P(|Sₙ/n − μ| ≥ ε) stays at or below the level on the dense grid: the dense
 * grid locates the last crossing, and every integer between its neighbours is then checked.
 */
function exactCrossing(law, eps, level, dense) {
  let last = -1;
  dense.forEach((n, i) => {
    if (exactExceedance(law, n, eps) > level) last = i;
  });
  if (last === -1) return 1;
  if (last === dense.length - 1) return null;
  let crossing = dense[last] + 1;
  for (let n = dense[last]; n < dense[last + 1]; n += 1) if (exactExceedance(law, n, eps) > level) crossing = n + 1;
  return crossing;
}

function llnStudy(params, law, run, dense) {
  const index = new Map(run.checkpoints.map((n, i) => [n, i]));
  const { m } = params;
  return params.eps.map((eps) => {
    const points = params.curveN.map((n) => {
      const empirical = empiricalExceedance(run.scores[index.get(n)], law, n, eps);
      const count = Math.round(empirical * m);
      const { low, high } = wilsonInterval(count, m);
      return {
        n,
        count,
        empirical,
        low,
        high,
        exact: exactExceedance(law, n, eps),
        chebyshev: chebyshevBound(law, n, eps),
        hoeffding: hoeffdingBound(law, n, eps),
      };
    });
    const curve = dense.map((n) => ({
      n,
      exact: exactExceedance(law, n, eps),
      chebyshev: chebyshevBound(law, n, eps),
      hoeffding: hoeffdingBound(law, n, eps),
    }));
    const level = params.llnLevel;
    const span = law.high - law.low;
    return {
      eps,
      points,
      dense: curve,
      nExact: exactCrossing(law, eps, level, dense),
      nChebyshev: Math.ceil(law.variance / (level * eps * eps) - 1e-9),
      nHoeffding: Math.ceil((span * span * Math.log(2 / level)) / (2 * eps * eps) - 1e-9),
    };
  });
}

/* ------------------------------------------------------------------ E6, E7 */

/* Least-squares slope of log₁₀ y on log₁₀ n over the points with lo ≤ n ≤ hi. */
function logFit(points, key, lo = 1, hi = Infinity) {
  const use = points.filter((p) => p.n >= lo && p.n <= hi && p[key] > 0);
  if (use.length < 2) return { slope: null, intercept: null, r: null };
  const fit = linearFit(
    use.map((p) => Math.log10(p.n)),
    use.map((p) => Math.log10(p[key])),
  );
  return { slope: num(fit.slope), intercept: num(fit.intercept), r: num(fit.r) };
}

/* Values of Sₙ/√n at q Blom plotting positions (i − 0.375)/(q + 0.25): the order statistics nearest to them. */
function blomQuantiles(values, q) {
  const sorted = Float64Array.from(values).sort();
  const m = sorted.length;
  const out = [];
  for (let i = 1; i <= q; i += 1) {
    const p = (i - 0.375) / (q + 0.25);
    out.push(Math.round(sorted[Math.min(m - 1, Math.max(0, Math.ceil(p * m) - 1))] * 1e6) / 1e6);
  }
  return out;
}

/* The law of Sₙ/√n itself, not standardised: the increment law read with mean 0 and variance 1. */
const unstandardised = (law) => ({ ...law, mean: 0, variance: 1 });

function cltStudy(params, laws, runs, dense) {
  const rad = laws.rademacher;
  const ber = laws.bernoulli;
  const small = laws.bernoulliSmall;
  const at = (run, n) => run.scores[run.checkpoints.indexOf(n)];

  const radPoints = params.curveN.map((n) => ({
    n,
    empirical: kolmogorovDistance(normalizeScores(at(runs.rademacher, n), n, 'normalized'), standardNormalCdf),
    exact: exactKolmogorovDistance(rad, n),
    berryEsseen: berryEsseenBound(rad, n),
  }));
  const radDense = dense.map((n) => ({ n, exact: exactKolmogorovDistance(rad, n), berryEsseen: berryEsseenBound(rad, n) }));
  const plots = params.cltPlotN.map((n) => {
    const values = normalizeScores(at(runs.rademacher, n), n, 'normalized');
    const { mean, variance } = sampleMoments(values);
    return { n, quantiles: blomQuantiles(values, params.quantiles), mean, sd: Math.sqrt(variance) };
  });

  const centre = (n) => n * ber.mean;
  const scale = (n) => Math.sqrt(n * ber.variance);
  const berPoints = params.curveN.map((n) => {
    const scores = at(runs.bernoulli, n);
    const standardised = Float64Array.from(scores, (s) => (s - centre(n)) / scale(n));
    return {
      n,
      empirical: kolmogorovDistance(standardised, standardNormalCdf),
      exact: exactKolmogorovDistance(ber, n),
      rawEmpirical: kolmogorovDistance(normalizeScores(scores, n, 'normalized'), standardNormalCdf),
      raw: exactKolmogorovDistance(unstandardised(ber), n),
      berryEsseen: berryEsseenBound(ber, n),
    };
  });
  const berDense = dense.map((n) => ({
    n,
    exact: exactKolmogorovDistance(ber, n),
    raw: exactKolmogorovDistance(unstandardised(ber), n),
    berryEsseen: berryEsseenBound(ber, n),
  }));
  const smallDense = dense.map((n) => ({ n, exact: exactKolmogorovDistance(small, n), berryEsseen: berryEsseenBound(small, n) }));

  return {
    dkw: dkwRadius(params.m, params.dkwAlpha),
    rademacher: {
      points: radPoints,
      dense: radDense,
      plots,
      fitExact: logFit(radDense, 'exact', params.ksFitMinN),
      fitEmpirical: logFit(radPoints, 'empirical', params.ksFitMinN, params.ksFitMaxN),
    },
    bernoulli: {
      points: berPoints,
      dense: berDense,
      fitExact: logFit(berDense, 'exact', params.ksFitMinN),
      fitEmpirical: logFit(berPoints, 'empirical', params.ksFitMinN, params.ksFitMaxN),
    },
    bernoulliSmall: { dense: smallDense, fitExact: logFit(smallDense, 'exact', params.ksFitMinN) },
  };
}

/* ------------------------------------------------------------------ E8 */

/*
 * sup_x |F̂(x) − F(x)| between the empirical distribution function of a group of total scores and the
 * exact one. Both are step functions that jump only on the lattice of Sₙ, so the supremum is attained
 * at a lattice point.
 */
function latticeDistance(scores, start, size, law, n, cumulative, counts) {
  counts.fill(0);
  const toK = countOf(law, n);
  for (let j = start; j < start + size; j += 1) counts[toK(scores[j])] += 1;
  let below = 0;
  let d = 0;
  for (let k = 0; k <= n; k += 1) {
    below += counts[k];
    d = Math.max(d, Math.abs(below / size - cumulative[k]));
  }
  return d;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

function precisionStudy(params, laws, runs) {
  const { n, groupSizes } = params.precision;
  const models = {};
  for (const model of MODEL_IDS) {
    const law = laws[model];
    const run = runs[model];
    const scores = run.scores[run.checkpoints.indexOf(n)];
    const { prob } = exactScoreLaw(law, n);
    const cumulative = new Float64Array(n + 1);
    prob.reduce((acc, p, k) => (cumulative[k] = acc + p), 0);
    const counts = new Int32Array(n + 1);
    models[model] = groupSizes.map((size) => {
      const groups = Math.floor(params.m / size);
      let squared = 0;
      const distances = [];
      for (let g = 0; g < groups; g += 1) {
        let total = 0;
        for (let j = g * size; j < (g + 1) * size; j += 1) total += scores[j];
        squared += (total / (size * n) - law.mean) ** 2;
        distances.push(latticeDistance(scores, g * size, size, law, n, cumulative, counts));
      }
      const dkw = dkwRadius(size, params.dkwAlpha);
      return {
        size,
        groups,
        rms: Math.sqrt(squared / groups),
        se: Math.sqrt(law.variance / (n * size)),
        medianD: median(distances),
        shareAbove: distances.filter((d) => d > dkw).length / groups,
        dkw,
      };
    });
  }
  return { n, models };
}

/* ------------------------------------------------------------------ E9 */

function aggregateStudy(params, laws, runs) {
  const { budget } = params.aggregate;
  const models = {};
  const total = {};
  for (const model of MODEL_IDS) {
    const law = laws[model];
    const run = runs[model];
    models[model] = params.aggregate.n.map((n) => {
      const size = budget / n;
      if (!Number.isInteger(size)) throw new RangeError(`The aggregate budget ${budget} is not a multiple of n = ${n}`);
      const scores = run.scores[run.checkpoints.indexOf(n)];
      const groups = Math.floor(params.m / size);
      const totals = [];
      for (let g = 0; g < groups; g += 1) {
        let t = 0;
        for (let j = g * size; j < (g + 1) * size; j += 1) t += scores[j];
        totals.push(t);
      }
      const { mean, variance } = sampleMoments(totals);
      return {
        size,
        n,
        groups,
        mean,
        variance: num(variance),
        theoryMean: size * n * law.mean,
        theoryVariance: size * n * law.variance,
      };
    });
    const nMax = run.checkpoints.at(-1);
    let value = 0;
    for (const s of run.scores.at(-1)) value += s;
    const mean = params.m * nMax * law.mean;
    const sd = Math.sqrt(params.m * nMax * law.variance);
    total[model] = { n: nMax, value, mean, sd, z: (value - mean) / sd };
  }
  return { budget, models, total };
}

function bestAttackerStudy(params, laws, runs) {
  const law = laws.bernoulli;
  const { excess, groupSizes, mPerDecade } = params.best;
  const thresholdOf = (n) => Math.ceil(n * (law.mean + excess) - 1e-9);
  const m50 = (p1) => num(Math.LN2 / -Math.log1p(-p1));
  const rows = params.best.n.map((n) => {
    const threshold = thresholdOf(n);
    const p1 = probabilityAnyAttackerReaches(law, n, 1, threshold);
    return {
      n,
      threshold,
      p1,
      rate: num(-Math.log(p1) / n),
      m50: m50(p1),
      pAtM: probabilityAnyAttackerReaches(law, n, params.m, threshold),
    };
  });
  const largest = Math.max(...params.best.chartN.map((n) => m50(probabilityAnyAttackerReaches(law, n, 1, thresholdOf(n))) ?? 1));
  const decades = Math.min(15, Math.ceil(Math.log10(largest)) + 1);
  const mGrid = [];
  for (let k = 0; k <= decades * mPerDecade; k += 1) mGrid.push(10 ** (k / mPerDecade));
  const curves = params.best.chartN.map((n) => ({
    n,
    threshold: thresholdOf(n),
    points: mGrid.map((m) => ({ m, p: probabilityAnyAttackerReaches(law, n, m, thresholdOf(n)) })),
  }));
  const run = runs.bernoulli;
  const empirical = [];
  for (const n of params.best.chartN) {
    const scores = run.scores[run.checkpoints.indexOf(n)];
    const threshold = thresholdOf(n);
    for (const size of groupSizes) {
      const groups = Math.floor(params.m / size);
      let hits = 0;
      for (let g = 0; g < groups; g += 1) {
        let best = -Infinity;
        for (let j = g * size; j < (g + 1) * size; j += 1) best = Math.max(best, scores[j]);
        if (best >= threshold) hits += 1;
      }
      const { low, high } = wilsonInterval(hits, groups);
      empirical.push({
        n,
        size,
        groups,
        hits,
        rate: hits / groups,
        low,
        high,
        exact: probabilityAnyAttackerReaches(law, n, size, threshold),
      });
    }
  }
  return { model: 'bernoulli', excess, rows, curves, empirical, mMax: 10 ** decades };
}

/* ------------------------------------------------------------------ the study */

/**
 * Runs every experiment of homework 04.
 * @param {object} params see PARAMS in homework/04/figures.js
 * @returns {object} a JSON-safe summary (no typed arrays, no NaN)
 */
export function runPenetrationStudy(params) {
  const seeds = seedsOf(params.seed);
  const laws = {
    bernoulli: incrementLaw('bernoulli', { p: params.p }),
    rademacher: incrementLaw('rademacher'),
    bernoulliSmall: incrementLaw('bernoulli', { p: params.pSmall }),
  };
  const checkpoints = studyCheckpoints(params);
  const nMax = checkpoints.at(-1);
  const runs = {};
  for (const model of MODEL_IDS) {
    runs[model] = simulateScores({ law: laws[model], checkpoints, m: params.m, seed: seeds[model] });
  }
  const dense = denseGrid(nMax, params.densePerDecade);
  const at = (model, n) => runs[model].scores[checkpoints.indexOf(n)];

  const distributions = {};
  const moments = {};
  const variance = {};
  const lln = {};
  for (const model of MODEL_IDS) {
    const law = laws[model];
    distributions[model] = params.distributionN.map((n) => binnedLaw(law, n, at(model, n), params.binsTarget));
    moments[model] = params.distributionN.map((n) => {
      const row = { n };
      const th = scoreMoments(law, n);
      for (const q of QUANTITY_IDS) {
        row[q] = { ...momentsWithErrors(normalizeScores(at(model, n), n, q)), theoryMean: th[q].mean, theoryVariance: th[q].variance };
      }
      return row;
    });
    const points = params.curveN.map((n) => {
      const pt = { n };
      const th = scoreMoments(law, n);
      for (const q of QUANTITY_IDS) {
        pt[q] = sampleMoments(normalizeScores(at(model, n), n, q)).variance;
        pt[`${q}Theory`] = th[q].variance;
      }
      return pt;
    });
    const fits = {};
    for (const q of QUANTITY_IDS) fits[q] = logFit(points, q);
    variance[model] = { points, fits };
    lln[model] = llnStudy(params, law, runs[model], dense);
  }

  return {
    meta: {
      seed: params.seed,
      p: params.p,
      pSmall: params.pSmall,
      m: params.m,
      checkpoints,
      nMax,
      dense,
      seeds,
      draws: MODEL_IDS.length * params.m * nMax,
      means: Object.fromEntries(MODEL_IDS.map((model) => [model, sampleMean(Array.from(at(model, nMax), (s) => s / nMax))])),
    },
    laws,
    trajectories: trajectoryStudy(params, laws, seeds),
    distributions,
    moments,
    variance,
    lln,
    clt: cltStudy(params, laws, runs, dense),
    precision: precisionStudy(params, laws, runs),
    aggregate: aggregateStudy(params, laws, runs),
    best: bestAttackerStudy(params, laws, runs),
  };
}

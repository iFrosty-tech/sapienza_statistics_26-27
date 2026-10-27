/**
 * Build-time figure provider of homework 04 (called by src/build/site-plugin.js).
 *
 * Runs the experiments of src/lib/penetration-study.js on the penetration
 * process of src/lib/penetration.js (one run of m attackers over n systems per
 * increment model, recorded at every checkpoint n), renders every figure and
 * table of the page with src/lib/penetration-charts.js and returns them with
 * the values quoted in the text as {{fig.…}} tokens.
 *
 * The results are cached under node_modules/.cache/hw04/<key>.json, the key
 * being a hash of PARAMS, of the source of every module listed in DEPENDENCIES
 * and of this file, so that a dev reload is instant and any change to the
 * study recomputes everything; the rendering is redone on every build from
 * the cached JSON.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/04/index.html)
 *   trajectories     Fig. 1, sample paths of Sₙ, Sₙ/n and Sₙ/√n of a few attackers, both models
 *   distBernoulli    Fig. 2, the law of the three quantities at increasing n, Bernoulli model
 *   distRademacher   Fig. 3, the same, Rademacher model
 *   moments          Table 1, empirical mean and variance with standard errors against theory
 *   variance         Fig. 4, the variance against n on log–log axes
 *   varianceFits     Table 2, the fitted log–log slopes of the variance against theory
 *   lln              Fig. 5, P(|Sₙ/n − μ| ≥ ε) against n: simulated, exact, Chebyshev, Hoeffding
 *   llnTable         Table 3, the same at selected n
 *   cltPlots         Fig. 6, normal probability plots of the Rademacher Sₙ/√n
 *   kolmogorov       Fig. 7, the Kolmogorov distance to N(0, 1) against n, with Berry–Esseen and DKW
 *   kolmogorovTable  Table 4, the same at selected n
 *   contrast         Fig. 8, the Bernoulli Sₙ/√n against its standardised form
 *   precision        Fig. 9, the precision of the empirical mean and distribution function against m
 *   precisionTable   Table 5, the same
 *   aggregateTable   Table 6, the aggregate score of a group of m attackers over n systems at fixed m·n
 *   best             Fig. 10, the chance that the best of m attackers penetrates a share of the systems
 *   bestTable        Table 7, the number of attackers for an even chance, against n
 *   parameters       Table A1, the parameters of the study
 *
 * Tokens ({{fig.<key>}}); every value is a display string. <model> is bernoulli or rademacher,
 * <q> total, average or normalized, <eps> eps10 (ε = 0.1) or eps5 (ε = 0.05), N an n of the grids.
 *   params.{seed, p, pSmall, m, nMax, distributionN, curveN, curveCount, denseCount, eps1, eps2, llnLevel,
 *     trajN, trajM, quantiles, cltPlotN, precisionN, groupSizes, aggregateBudget, excess, share, dkwAlpha,
 *     dkwLevel, binsTarget, draws, berryEsseenConstant, computeSeconds, computedAt, cacheKey}
 *     (params.seed and params.p are plain numbers, read by the live panels)
 *   params.seeds.{bernoulli, rademacher, trajectoriesBernoulli, trajectoriesRademacher}
 *   theory.<model|bernoulliSmall>.{mean, variance, sd, absThird, rho}, theory.latticeConstant
 *   traj.<model>.<q>.{min, max, mean, sd}, traj.<model>.inside (attackers ending inside the ±2 sd band)
 *   moments.<model>.nN.<q>.{mean, seMean, variance, seVariance, theoryMean, theoryVariance, zMean, zVariance},
 *   moments.{maxAbsZ, count} (the largest |z| of Table 1 and the number of its estimates)
 *   variance.<model>.<q>.{slope, constant, r}
 *   lln.<model>.<eps>.nN.{count, empirical, low, high, exact, chebyshev, hoeffding} (N in curveN),
 *   lln.<model>.<eps>.{nExact, nChebyshev, nHoeffding}
 *   clt.dkw, clt.rademacher.nN.{exact, empirical, berryEsseen, scaled}, clt.rademacher.{slopeExact,
 *     slopeEmpirical, floorN}, clt.plot.nN.{r, mean, sd}, clt.bernoulli.nN.{exact, empirical, raw,
 *     rawEmpirical, berryEsseen, drift}, clt.bernoulli.slopeExact, clt.bernoulliSmall.nN.{exact, berryEsseen}
 *     (N in 1, 10, 100, 1000, 10000), clt.bernoulliSmall.slopeExact
 *   precision.n, precision.<model>.mM.{groups, rms, se, ratio, medianD, shareAbove, dkw}
 *   aggregate.budget, aggregate.<model>.mM.{n, groups, mean, variance, theoryMean, theoryVariance},
 *   aggregate.total.<model>.{n, value, mean, sd, z, perSystem, perSystemSd}, aggregate.total.bernoulli.relSd
 *   best.{excess, share, hoeffdingRate, klRate, mGrowth, mMax}, best.nN.{threshold, p1, rate, m50, pAtM},
 *   best.empirical.nN.mM.{groups, hits, rate, low, high, exact}
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { BERRY_ESSEEN_CONSTANT, NORMALIZATIONS } from '../../src/lib/penetration.js';
import { runPenetrationStudy } from '../../src/lib/penetration-study.js';
import {
  count,
  dec,
  fmt,
  int,
  plotCorrelation,
  renderAggregateTable,
  renderBestAttacker,
  renderBestTable,
  renderCltPlots,
  renderContrast,
  renderDistributions,
  renderKolmogorov,
  renderKolmogorovTable,
  renderLln,
  renderLlnTable,
  renderMomentsTable,
  renderParametersTable,
  renderPrecision,
  renderPrecisionTable,
  renderTrajectories,
  renderVariance,
  renderVarianceTable,
  sci,
  sig,
} from '../../src/lib/penetration-charts.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seed: 20261027, // the master seed; every stream of the study is derived from it (deriveSeed)
  p: 0.3, // success probability of the Bernoulli increment
  pSmall: 0.05, // a skewed Bernoulli increment, for the rate of the central limit theorem (exact laws only)
  m: 10000, // attackers, one sample trajectory each
  distributionN: Object.freeze([10, 100, 1000, 10000]), // the n of the distributions (Figs. 2, 3, Table 1)
  curveN: Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]), // the n of the curves
  densePerDecade: 10, // points per decade of the exact curves
  eps: Object.freeze([0.1, 0.05]), // tolerances of the law of large numbers
  llnLevel: 0.05, // the level at which the n of the exact law and of the bounds are compared
  trajectories: Object.freeze({ n: 1000, m: 20, points: 70 }), // Fig. 1: systems, attackers, points per path
  binsTarget: 36, // bins per row of the distributions
  cltPlotN: Object.freeze([10, 100, 1000]), // the n of the probability plots (Fig. 6)
  quantiles: 80, // quantiles per probability plot
  ksFitMinN: 10, // the slopes of the Kolmogorov distance are fitted from this n
  ksFitMaxN: 100, // and, for the simulated distance, up to this n (beyond, the Monte Carlo floor dominates)
  dkwAlpha: 0.05, // level of the Dvoretzky–Kiefer–Wolfowitz band
  precision: Object.freeze({ n: 1000, groupSizes: Object.freeze([10, 20, 50, 100, 200, 500, 1000]) }), // Fig. 9
  aggregate: Object.freeze({ budget: 10000, n: Object.freeze([10, 100, 1000, 10000]) }), // Table 6, m·n fixed
  best: Object.freeze({
    excess: 0.1, // the best attacker must penetrate a share p + 0.1 of the systems
    n: Object.freeze([10, 20, 50, 100, 200, 500, 1000]), // Table 7
    chartN: Object.freeze([10, 100, 200, 500, 1000]), // Fig. 10
    groupSizes: Object.freeze([1, 10, 100, 1000]), // simulated checks of Fig. 10
    mPerDecade: 4,
  }),
  buildWidth: 640, // pixel width of the printed charts
});

/* The cache key covers the parameters, every module the study depends on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/penetration-study.js',
  'src/lib/penetration.js',
  'src/lib/random.js',
  'src/lib/normal.js',
  'src/lib/stats.js',
  'src/lib/kg-study.js',
];

let memo = null;

function loadOrCompute(root) {
  const source = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + source)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw04');
  const file = resolve(dir, `${key}.json`);
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.best) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = runPenetrationStudy(PARAMS);
    const ms = performance.now() - t0;
    const text = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, results });
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    value = JSON.parse(text);
    console.log(`[hw04] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw04/${key}.json`);
  }
  memo = { key, value };
  return value;
}

/* "10, 100, 1,000 and 10,000". */
const list = (values) => {
  const s = values.map((v) => int(v));
  return s.length < 2 ? s.join('') : `${s.slice(0, -1).join(', ')} and ${s.at(-1)}`;
};
const epsKey = (eps) => `eps${Math.round(eps * 100)}`;
const MODELS = ['bernoulli', 'rademacher'];
const QUANTITIES = Object.keys(NORMALIZATIONS);

/**
 * Every figure, table and token of the page, from the results of the study.
 * @param {object} results the output of runPenetrationStudy
 * @param {{ params?: object, ms: number, computedAt: string, cacheKey: string }} meta
 * @returns {{ html: Record<string, string>, tokens: Record<string, string> }}
 */
export function buildFigures(results, { params = PARAMS, ms, computedAt, cacheKey }) {
  const html = {};
  const tokens = {};
  const token = (k, value) => {
    tokens[k] = String(value);
  };
  const width = params.buildWidth;
  const { laws } = results;
  const m = params.m;
  const p = params.p;

  /* Figures and tables. */
  html.trajectories = renderTrajectories(results.trajectories, { id: 'fig-traj', width, p });
  html.distBernoulli = renderDistributions(results.distributions.bernoulli, laws.bernoulli, { id: 'fig-dist-b', width, m });
  html.distRademacher = renderDistributions(results.distributions.rademacher, laws.rademacher, { id: 'fig-dist-r', width, m });
  html.moments = renderMomentsTable(results.moments);
  html.variance = renderVariance(results.variance, laws, { id: 'fig-var', width, m });
  html.varianceFits = renderVarianceTable(results.variance, laws);
  html.lln = renderLln(results.lln, { id: 'fig-lln', width, m, level: params.llnLevel });
  html.llnTable = renderLlnTable(results.lln, { n: params.distributionN });
  html.cltPlots = renderCltPlots(results.clt.rademacher.plots, { id: 'fig-pp', width, seed: results.meta.seeds.rademacher, m });
  html.kolmogorov = renderKolmogorov(results.clt, { id: 'fig-ks', width, m, p, pSmall: params.pSmall });
  const ksN = [1, ...params.distributionN];
  html.kolmogorovTable = renderKolmogorovTable(results.clt, { n: ksN, p, pSmall: params.pSmall });
  html.contrast = renderContrast(results.distributions.bernoulli, laws.bernoulli, { id: 'fig-contrast', width, m });
  html.precision = renderPrecision(results.precision, { id: 'fig-precision', width });
  html.precisionTable = renderPrecisionTable(results.precision);
  html.aggregateTable = renderAggregateTable(results.aggregate);
  html.best = renderBestAttacker(results.best, { id: 'fig-best', width, p });
  html.bestTable = renderBestTable(results.best, { m });
  html.parameters = renderParametersTable([
    ['Master seed', String(params.seed), 'Every stream of the study is derived from it'],
    ['p', String(p), 'Success probability of the Bernoulli increment'],
    ['p, skewed case', String(params.pSmall), 'A second Bernoulli increment, exact laws only (Fig. 7)'],
    ['m', int(m), 'Attackers, one simulated trajectory each'],
    ['n, distributions', list(params.distributionN), 'Figs. 2, 3 and 8, Tables 1, 3 and 4'],
    ['n, curves', `${params.curveN.length} values from 1 to ${int(results.meta.nMax)}`, 'Simulated points of Figs. 4, 5 and 7'],
    ['n, exact curves', `${results.meta.dense.length} values, ${params.densePerDecade} per decade`, 'Exact laws and bounds of Figs. 5 and 7'],
    ['ε', params.eps.join(' and '), 'Tolerances of the law of large numbers'],
    ['Trajectories', `${params.trajectories.m} attackers × ${int(params.trajectories.n)} systems`, 'Fig. 1'],
    ['Quantiles per plot', String(params.quantiles), 'Fig. 6'],
    ['DKW level', `${fmt(100 * (1 - params.dkwAlpha), 0)}%`, 'Monte Carlo floor of Figs. 7 and 9'],
    ['n, precision', int(params.precision.n), 'Fig. 9 and Table 5'],
    ['m · n, aggregate', int(params.aggregate.budget), 'Table 6'],
    ['Excess δ', String(params.best.excess), 'Fig. 10 and Table 7: share p + δ of the systems'],
    ['Random draws', count(results.meta.draws), 'Two runs of m attackers over the largest n'],
  ]);

  /* Parameters and provenance (Appendix). */
  token('params.seed', params.seed);
  token('params.p', p);
  token('params.pSmall', params.pSmall);
  token('params.m', int(m));
  token('params.nMax', int(results.meta.nMax));
  token('params.distributionN', list(params.distributionN));
  token('params.curveN', list(params.curveN));
  token('params.curveCount', params.curveN.length);
  token('params.denseCount', results.meta.dense.length);
  token('params.eps1', params.eps[0]);
  token('params.eps2', params.eps[1]);
  token('params.llnLevel', params.llnLevel);
  token('params.trajN', int(params.trajectories.n));
  token('params.trajM', params.trajectories.m);
  token('params.quantiles', params.quantiles);
  token('params.cltPlotN', list(params.cltPlotN));
  token('params.precisionN', int(params.precision.n));
  token('params.groupSizes', list(params.precision.groupSizes));
  token('params.aggregateBudget', int(params.aggregate.budget));
  token('params.excess', params.best.excess);
  token('params.share', `${fmt(100 * (p + params.best.excess), 0)}%`);
  token('params.dkwAlpha', params.dkwAlpha);
  token('params.dkwLevel', `${fmt(100 * (1 - params.dkwAlpha), 0)}%`);
  token('params.binsTarget', params.binsTarget);
  token('params.draws', count(results.meta.draws));
  token('params.berryEsseenConstant', BERRY_ESSEEN_CONSTANT);
  token('params.computeSeconds', fmt(ms / 1000, 1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);
  for (const [k, v] of Object.entries(results.meta.seeds)) token(`params.seeds.${k}`, v);

  /* §2: the increments. */
  for (const [k, law] of Object.entries(laws)) {
    token(`theory.${k}.mean`, sig(law.mean, 3));
    token(`theory.${k}.variance`, sig(law.variance, 4));
    token(`theory.${k}.sd`, fmt(Math.sqrt(law.variance), 4));
    token(`theory.${k}.absThird`, sig(law.absThird, 4));
    token(`theory.${k}.rho`, fmt(law.absThird / law.variance ** 1.5, 3));
  }
  token('theory.latticeConstant', fmt(1 / Math.sqrt(2 * Math.PI), 4));

  /* §3: the trajectories at the last system. */
  const tr = results.trajectories;
  for (const model of MODELS) {
    const data = tr.models[model];
    const last = tr.t.length - 1;
    for (const q of QUANTITIES) {
      const d = NORMALIZATIONS[q].divisor(tr.n);
      const finals = data.paths.map((path) => path[last] / d);
      const digits = q === 'total' ? 0 : 3;
      token(`traj.${model}.${q}.min`, fmt(Math.min(...finals), digits));
      token(`traj.${model}.${q}.max`, fmt(Math.max(...finals), digits));
      token(`traj.${model}.${q}.mean`, fmt(data.envelope[q].mean[last], digits === 0 ? 0 : 3));
      token(`traj.${model}.${q}.sd`, fmt(data.envelope[q].sd[last], 3));
    }
    const mu = data.envelope.total.mean[last];
    const sd = data.envelope.total.sd[last];
    token(`traj.${model}.inside`, data.paths.filter((path) => Math.abs(path[last] - mu) <= 2 * sd).length);
  }

  /* §4: moments, and the largest |z| of Table 1 over all its estimates. */
  const zs = [];
  for (const model of MODELS) {
    for (const row of results.moments[model]) {
      for (const q of QUANTITIES) {
        const v = row[q];
        zs.push((v.mean - v.theoryMean) / v.seMean, (v.variance - v.theoryVariance) / v.seVariance);
        const k = `moments.${model}.n${row.n}.${q}`;
        token(`${k}.mean`, sig(v.mean, 5));
        token(`${k}.seMean`, sig(v.seMean, 2));
        token(`${k}.variance`, sig(v.variance, 5));
        token(`${k}.seVariance`, sig(v.seVariance, 2));
        token(`${k}.theoryMean`, sig(v.theoryMean, 5));
        token(`${k}.theoryVariance`, sig(v.theoryVariance, 5));
        token(`${k}.zMean`, fmt((v.mean - v.theoryMean) / v.seMean, 2));
        token(`${k}.zVariance`, fmt((v.variance - v.theoryVariance) / v.seVariance, 2));
      }
    }
  }
  token('moments.maxAbsZ', fmt(Math.max(...zs.map(Math.abs)), 2));
  token('moments.count', zs.length);

  /* §5: variance slopes. */
  for (const model of MODELS) {
    for (const q of QUANTITIES) {
      const f = results.variance[model].fits[q];
      token(`variance.${model}.${q}.slope`, fmt(f.slope, 4));
      token(`variance.${model}.${q}.constant`, sig(10 ** f.intercept, 4));
      token(`variance.${model}.${q}.r`, fmt(f.r, 4));
    }
  }

  /* §6: the law of large numbers. */
  for (const model of MODELS) {
    for (const block of results.lln[model]) {
      const k = `lln.${model}.${epsKey(block.eps)}`;
      token(`${k}.nExact`, block.nExact === null ? 'beyond the grid' : int(block.nExact));
      token(`${k}.nChebyshev`, int(block.nChebyshev));
      token(`${k}.nHoeffding`, int(block.nHoeffding));
      for (const pt of block.points) {
        const kn = `${k}.n${pt.n}`;
        token(`${kn}.count`, int(pt.count));
        token(`${kn}.empirical`, sci(pt.empirical, 3));
        token(`${kn}.low`, sci(pt.low, 2));
        token(`${kn}.high`, sci(pt.high, 2));
        token(`${kn}.exact`, sci(pt.exact, 3));
        token(`${kn}.chebyshev`, sci(pt.chebyshev, 3));
        token(`${kn}.hoeffding`, sci(pt.hoeffding, 3));
      }
    }
  }

  /* §7: the central limit theorem. */
  const clt = results.clt;
  token('clt.dkw', fmt(clt.dkw, 4));
  token('clt.rademacher.slopeExact', fmt(clt.rademacher.fitExact.slope, 3));
  token('clt.rademacher.slopeEmpirical', fmt(clt.rademacher.fitEmpirical.slope, 3));
  token('clt.bernoulli.slopeExact', fmt(clt.bernoulli.fitExact.slope, 3));
  token('clt.bernoulliSmall.slopeExact', fmt(clt.bernoulliSmall.fitExact.slope, 3));
  const floor = clt.rademacher.dense.find((pt) => pt.exact < clt.dkw);
  token('clt.rademacher.floorN', floor ? int(floor.n) : 'beyond the grid');
  for (const n of ksN) {
    const r = clt.rademacher.points.find((pt) => pt.n === n);
    token(`clt.rademacher.n${n}.exact`, sig(r.exact, 3));
    token(`clt.rademacher.n${n}.empirical`, sig(r.empirical, 3));
    token(`clt.rademacher.n${n}.berryEsseen`, sig(r.berryEsseen, 3));
    token(`clt.rademacher.n${n}.scaled`, fmt(Math.sqrt(n) * r.exact, 4));
    const b = clt.bernoulli.points.find((pt) => pt.n === n);
    token(`clt.bernoulli.n${n}.exact`, sig(b.exact, 3));
    token(`clt.bernoulli.n${n}.empirical`, sig(b.empirical, 3));
    token(`clt.bernoulli.n${n}.raw`, sig(b.raw, 3));
    token(`clt.bernoulli.n${n}.rawEmpirical`, sig(b.rawEmpirical, 3));
    token(`clt.bernoulli.n${n}.berryEsseen`, sig(b.berryEsseen, 3));
    token(`clt.bernoulli.n${n}.drift`, sig(laws.bernoulli.mean * Math.sqrt(n), 3));
    const s = clt.bernoulliSmall.dense.find((pt) => pt.n === n);
    token(`clt.bernoulliSmall.n${n}.exact`, sig(s.exact, 3));
    token(`clt.bernoulliSmall.n${n}.berryEsseen`, sig(s.berryEsseen, 3));
  }
  for (const plot of clt.rademacher.plots) {
    token(`clt.plot.n${plot.n}.r`, fmt(plotCorrelation(plot), 4));
    token(`clt.plot.n${plot.n}.mean`, fmt(plot.mean, 3));
    token(`clt.plot.n${plot.n}.sd`, fmt(plot.sd, 3));
  }

  /* §8: systems and attackers. */
  token('precision.n', int(results.precision.n));
  for (const model of MODELS) {
    for (const r of results.precision.models[model]) {
      const k = `precision.${model}.m${r.size}`;
      token(`${k}.groups`, int(r.groups));
      token(`${k}.rms`, sig(r.rms, 3));
      token(`${k}.se`, sig(r.se, 3));
      token(`${k}.ratio`, fmt(r.rms / r.se, 2));
      token(`${k}.medianD`, sig(r.medianD, 3));
      token(`${k}.shareAbove`, `${fmt(100 * r.shareAbove, 1)}%`);
      token(`${k}.dkw`, sig(r.dkw, 3));
    }
  }
  token('aggregate.budget', int(results.aggregate.budget));
  for (const model of MODELS) {
    for (const r of results.aggregate.models[model]) {
      const k = `aggregate.${model}.m${r.size}`;
      token(`${k}.n`, int(r.n));
      token(`${k}.groups`, int(r.groups));
      token(`${k}.mean`, dec(r.mean, 1));
      token(`${k}.variance`, int(r.variance));
      token(`${k}.theoryMean`, int(r.theoryMean));
      token(`${k}.theoryVariance`, int(r.theoryVariance));
    }
    const t = results.aggregate.total[model];
    token(`aggregate.total.${model}.n`, int(t.n));
    token(`aggregate.total.${model}.value`, int(t.value));
    token(`aggregate.total.${model}.mean`, int(t.mean));
    token(`aggregate.total.${model}.sd`, int(t.sd));
    token(`aggregate.total.${model}.z`, fmt(t.z, 2));
    // The aggregate per attacker and system, T/(mn), and its standard deviation σ/√(mn).
    token(`aggregate.total.${model}.perSystem`, fmt(t.value / (m * t.n), 5));
    token(`aggregate.total.${model}.perSystemSd`, sci(t.sd / (m * t.n), 2));
  }
  // The relative spread σ√(mn)/(mnμ) of the Bernoulli aggregate (the Rademacher mean is zero).
  const tb = results.aggregate.total.bernoulli;
  token('aggregate.total.bernoulli.relSd', sci(tb.sd / tb.mean, 2));
  const best = results.best;
  token('best.excess', best.excess);
  token('best.share', `${fmt(100 * (p + best.excess), 0)}%`);
  token('best.hoeffdingRate', fmt(2 * best.excess ** 2, 4));
  token('best.klRate', fmt(best.klRate, 4));
  // Each further hundred systems multiplies the attackers needed for an even chance by about e^(100·D).
  token('best.mGrowth', sig(Math.exp(100 * best.klRate), 3));
  token('best.mMax', count(best.mMax));
  for (const r of best.rows) {
    const k = `best.n${r.n}`;
    token(`${k}.threshold`, int(r.threshold));
    token(`${k}.p1`, sci(r.p1, 3));
    token(`${k}.rate`, fmt(r.rate, 4));
    token(`${k}.m50`, count(r.m50));
    token(`${k}.pAtM`, sci(r.pAtM, 3));
  }
  for (const e of best.empirical) {
    const k = `best.empirical.n${e.n}.m${e.size}`;
    token(`${k}.groups`, int(e.groups));
    token(`${k}.hits`, int(e.hits));
    token(`${k}.rate`, sig(e.rate, 3));
    token(`${k}.low`, sig(e.low, 2));
    token(`${k}.high`, sig(e.high, 2));
    token(`${k}.exact`, sci(e.exact, 3));
  }

  return { html, tokens };
}

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { key: cacheKey, results, ms, computedAt } = loadOrCompute(root);
  return buildFigures(results, { params: PARAMS, ms, computedAt, cacheKey });
}

/**
 * Build-time figure provider of homework 06 (called by src/build/site-plugin.js).
 *
 * Runs the experiments of src/lib/sampling-study.js on the score law of
 * src/lib/score-law.js, every hacker's estimates coming from the recurrences of
 * src/lib/welford.js, renders every figure and table of the page with
 * src/lib/sampling-charts.js and returns them with the values quoted in the
 * text as {{fig.…}} tokens.
 *
 * The results are cached under node_modules/.cache/hw06/<key>.json, the key
 * being a hash of PARAMS, of the source of every module listed in DEPENDENCIES
 * and of this file, so that a dev reload is instant and any change to the study
 * recomputes everything; the rendering is redone on every build from the JSON.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/06/index.html)
 *   law            Fig. 1, the distribution function and a sample of the score law
 *   trajectories   Fig. 2, running x̄ₖ and s²ₖ of a few hackers against exact bands
 *   averages       Table 1, the averages against μ and σ², and the average of SSₙ/n
 *   zScores        Fig. 3, the z-scores of the averages against n
 *   bias           Fig. 4, the averages of s²ₙ and SSₙ/n against n
 *   spreads        Fig. 5, the spreads across hackers and the ratio to normal theory
 *   spreadTable    Table 2, the same against the exact values
 *   distributions  Fig. 6, the laws of x̄ₙ and s²ₙ against their normal approximations
 *   precision      Fig. 7, the role of m at fixed n
 *   coverage       Fig. 8, the coverage of the two intervals against n
 *   coverageTable  Table 3, the same, with the side of each miss and the all-zero hackers
 *   scatter        Fig. 9, (x̄ₙ, s²ₙ) across hackers
 *   parameters     Table A1, the parameters of the study
 *
 * Tokens ({{fig.<key>}}); every value is a display string, N an n of the grid and M a group size.
 *   params.{seed, m, nGrid, nCount, nMax, lawSample, trajN, trajM, trajPoints, distributionN, bins, scatterN,
 *     scatterPoints, level, precisionN, precisionHackers, draws, computeSeconds, computedAt, cacheKey}
 *     (params.seed is a plain number, read by the live panel)
 *   params.seeds.{law, trajectories, precision}, params.seeds.nN
 *   law.{p, atom, mu, sigma2, sd, mu3, mu4, skewness, kurtosis, excess, slope, normalShare, sdConstant}
 *   sample.{size, zeros, atomShare, mean, variance}
 *   traj.{insideMean, insideVariance}
 *   avg.nN.{mean, seMean, zMean, variance, seVariance, zVariance, ssOverN, biased, shortfall},
 *   avg.{zCount, zAboveTwo, zExpected, zMax, zList}
 *   spread.nN.{sdMean, exactMean, sdVariance, exactVariance, ratio, relMean, relVariance},
 *   spread.{slopeMean, slopeExactMean, slopeVariance, slopeExactVariance, ratioLimit}
 *   dist.nN.{atomShare, atomExact, skewMean, skewVariance}
 *   precision.{n, slopeMean, slopeVariance, exactSdMean, exactSdVariance}, precision.mM.{groups, rmsMean, seMean,
 *     spreadMean, rmsVariance, seVariance, spreadVariance}
 *   cover.nN.{tRate, tLow, tHigh, tBelow, tAbove, tBelowShare, chiRate, chiLow, chiHigh, chiBelow, chiAbove,
 *     degenerate, degenerateExpected, zeroProbability, ceiling}, cover.{chiLimit, chiZ, chiLargeMean, largestN}
 *   scatter.nN.{r, exact, atomShare}, scatter.limit
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { standardNormalCdf } from '../../src/lib/penetration.js';
import { count, fmt, int, sci, sig } from '../../src/lib/penetration-charts.js';
import { renderParametersTable } from '../../src/lib/penetration-charts.js';
import { runSamplingStudy } from '../../src/lib/sampling-study.js';
import {
  renderAveragesTable,
  renderBias,
  renderCoverage,
  renderCoverageTable,
  renderDistributions,
  renderLaw,
  renderPrecision,
  renderScatter,
  renderSpreadTable,
  renderSpreads,
  renderTrajectories,
  renderZScores,
  expectedCount,
} from '../../src/lib/sampling-charts.js';
import { SKEWNESS, allZeroProbability, correlationMeanVariance } from '../../src/lib/score-law.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seed: 20261031, // the master seed; every stream of the study is derived from it (deriveSeed)
  m: 10000, // hackers per n
  nGrid: Object.freeze([2, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]), // the experiments
  lawSample: 10000, // scores in the empirical sample of Fig. 1
  trajectories: Object.freeze({ n: 1000, m: 12, points: 70 }), // Fig. 2: systems, hackers, points per path
  distributionN: Object.freeze([5, 50, 500]), // the n of the sampling distributions (Fig. 6)
  bins: 36, // bins per histogram, about
  scatterN: Object.freeze([10, 200]), // the n of the scatter (Fig. 9)
  scatterPoints: 700, // hackers drawn per scatter; the correlation uses all of them
  level: 0.95, // of the two intervals
  precision: Object.freeze({ n: 100, hackers: 200000, groupSizes: Object.freeze([10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) }), // Fig. 7
  buildWidth: 640, // pixel width of the printed charts
});

/* The cache key covers the parameters, every module the study depends on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/sampling-study.js',
  'src/lib/score-law.js',
  'src/lib/welford.js',
  'src/lib/penetration.js',
  'src/lib/random.js',
  'src/lib/normal.js',
  'src/lib/stats.js',
  'src/lib/kg-study.js',
];

/** Where the study of a project is cached. */
export const cacheDirectory = (root) => resolve(root, 'node_modules/.cache/hw06');

let memo = null;

function loadOrCompute(root, source, run) {
  const from = source instanceof URL ? fileURLToPath(source) : source;
  const text = [...DEPENDENCIES.map((f) => resolve(from, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + text)).slice(0, 16);
  const dir = cacheDirectory(root);
  const file = resolve(dir, `${key}.json`);
  if (memo?.file === file) return memo.value;
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.summary) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = run(PARAMS);
    const ms = performance.now() - t0;
    const json = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, results });
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, json);
    renameSync(tmp, file);
    value = JSON.parse(json);
    console.log(`[hw06] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw06/${key}.json`);
  }
  memo = { file, value };
  return value;
}

/* "2, 3, 5 and 10". */
const list = (values) => {
  const s = values.map((v) => int(v));
  return s.length < 2 ? s.join('') : `${s.slice(0, -1).join(', ')} and ${s.at(-1)}`;
};

const words = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/**
 * Every figure, table and token of the page, from the results of the study.
 * @param {object} results the output of runSamplingStudy
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
  const { law, experiments, summary, precision, trajectories } = results;
  const { m } = params;
  const largest = experiments.at(-1);

  /* Figures and tables. */
  html.law = renderLaw(results.lawSample, { id: 'fig-law', width });
  html.trajectories = renderTrajectories(trajectories, { id: 'fig-traj', width });
  html.averages = renderAveragesTable(experiments);
  html.zScores = renderZScores(experiments, { id: 'fig-z', width });
  html.bias = renderBias(experiments, { id: 'fig-bias', width });
  html.spreads = renderSpreads(experiments, summary, { id: 'fig-spread', width });
  html.spreadTable = renderSpreadTable(experiments);
  html.distributions = renderDistributions(results.distributions, { id: 'fig-dist', width, m });
  html.precision = renderPrecision(precision, { id: 'fig-precision', width });
  html.coverage = renderCoverage(experiments, summary, { id: 'fig-cover', width, m });
  html.coverageTable = renderCoverageTable(experiments);
  html.scatter = renderScatter(results.scatter, law, { id: 'fig-scatter', width });
  html.parameters = renderParametersTable([
    ['Master seed', String(params.seed), 'Every stream of the study is derived from it'],
    ['p', String(law.p), 'Probability of a successful attempt, the p of homework 3'],
    ['Largest score', String(law.max), 'Y is uniform on (0, 10]'],
    ['m', int(m), 'Hackers at each n'],
    ['n', list(params.nGrid), 'One independent experiment for each value'],
    ['Law sample', int(params.lawSample), 'Scores in Fig. 1'],
    ['Trajectories', `${params.trajectories.m} hackers × ${int(params.trajectories.n)} systems`, 'Fig. 2'],
    ['n, distributions', list(params.distributionN), 'Fig. 6'],
    ['n, scatter', list(params.scatterN), `Fig. 9, ${int(params.scatterPoints)} hackers drawn per panel`],
    ['Level', `${fmt(100 * params.level, 0)}%`, 'The two intervals of Fig. 8 and Table 3'],
    ['Run of Fig. 7', `${int(params.precision.hackers)} hackers × ${int(params.precision.n)} systems`, `Cut into groups of ${list(params.precision.groupSizes)}`],
    ['Random draws', count(results.meta.draws), 'One uniform per score'],
  ]);

  /* Parameters and provenance (Appendix). */
  token('params.seed', params.seed);
  token('params.m', int(m));
  token('params.nGrid', list(params.nGrid));
  token('params.nCount', params.nGrid.length);
  token('params.nMax', int(params.nGrid.at(-1)));
  token('params.lawSample', int(params.lawSample));
  token('params.trajN', int(params.trajectories.n));
  token('params.trajM', params.trajectories.m);
  token('params.distributionN', list(params.distributionN));
  token('params.scatterN', list(params.scatterN));
  token('params.scatterPoints', int(params.scatterPoints));
  token('params.level', `${fmt(100 * params.level, 0)}%`);
  token('params.precisionN', int(params.precision.n));
  token('params.precisionHackers', int(params.precision.hackers));
  token('params.draws', count(results.meta.draws));
  token('params.computeSeconds', fmt(ms / 1000, 1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);
  const seeds = results.meta.seeds;
  token('params.seeds.law', seeds.law);
  token('params.seeds.trajectories', seeds.trajectories);
  token('params.seeds.precision', seeds.precision);
  for (const [n, seed] of Object.entries(seeds.n)) token(`params.seeds.n${n}`, seed);

  /* §2: the law. */
  token('law.p', law.p);
  token('law.atom', fmt(law.atom, 1));
  token('law.mu', sig(law.mu, 2));
  token('law.sigma2', sig(law.sigma2, 3));
  token('law.sd', fmt(Math.sqrt(law.sigma2), 3));
  token('law.mu3', fmt(law.mu3, 2));
  token('law.mu4', fmt(law.mu4, 4));
  token('law.skewness', fmt(law.skewness, 3));
  token('law.kurtosis', fmt(law.kurtosis, 3));
  token('law.excess', fmt(law.kurtosis - 3, 3));
  token('law.slope', fmt(law.mu3 / law.sigma2, 2));
  // The constant of Var(s²ₙ) ≈ (μ₄ − σ⁴)/n, as a standard deviation.
  token('law.sdConstant', fmt(Math.sqrt(law.mu4 - law.sigma2 ** 2), 2));
  const s = results.lawSample;
  token('sample.size', int(s.size));
  token('sample.zeros', int(s.zeros));
  token('sample.atomShare', fmt(s.zeros / s.size, 4));
  token('sample.mean', fmt(s.mean, 3));
  token('sample.variance', fmt(s.variance, 3));

  /* §3: the trajectories at the last system. */
  const last = trajectories.k.length - 1;
  const inside = (key, centre, sd) => trajectories.paths.filter((path) => Math.abs(path[key][last] - centre) <= 2 * sd).length;
  token('traj.insideMean', inside('mean', law.mu, trajectories.band.sdMean[last]));
  token('traj.insideVariance', inside('variance', law.sigma2, trajectories.band.sdVariance[last]));

  /* §4 and §6: the experiments. */
  for (const e of experiments) {
    const a = `avg.n${e.n}`;
    token(`${a}.mean`, fmt(e.meanOfMeans, 4));
    token(`${a}.seMean`, fmt(e.seMean, 4));
    token(`${a}.zMean`, fmt(e.zMean, 2));
    token(`${a}.variance`, fmt(e.meanOfVariances, 3));
    token(`${a}.seVariance`, fmt(e.seVariance, 3));
    token(`${a}.zVariance`, fmt(e.zVariance, 2));
    token(`${a}.ssOverN`, fmt(e.meanOfSsOverN, 3));
    token(`${a}.biased`, fmt(e.biasedExpectation, 3));
    token(`${a}.shortfall`, `${fmt((100 * (law.sigma2 - e.meanOfSsOverN)) / law.sigma2, 1)}%`);
    const b = `spread.n${e.n}`;
    token(`${b}.sdMean`, fmt(e.sdMean, 4));
    token(`${b}.exactMean`, fmt(e.exactSdMean, 4));
    token(`${b}.sdVariance`, fmt(e.sdVariance, 3));
    token(`${b}.exactVariance`, fmt(e.exactSdVariance, 3));
    token(`${b}.ratio`, fmt(e.varianceRatio, 3));
    token(`${b}.relMean`, `${fmt((100 * e.sdMean) / law.mu, 1)}%`);
    token(`${b}.relVariance`, `${fmt((100 * e.sdVariance) / law.sigma2, 1)}%`);
    const c = `cover.n${e.n}`;
    const { t, chi, degenerate, degenerateExpected } = e.coverage;
    token(`${c}.tRate`, fmt(t.rate, 3));
    token(`${c}.tLow`, fmt(t.low, 3));
    token(`${c}.tHigh`, fmt(t.high, 3));
    token(`${c}.tBelow`, int(t.below));
    token(`${c}.tAbove`, int(t.above));
    token(`${c}.tBelowShare`, `${fmt((100 * t.below) / (t.below + t.above), 0)}%`);
    token(`${c}.chiRate`, fmt(chi.rate, 3));
    token(`${c}.chiLow`, fmt(chi.low, 3));
    token(`${c}.chiHigh`, fmt(chi.high, 3));
    token(`${c}.chiBelow`, int(chi.below));
    token(`${c}.chiAbove`, int(chi.above));
    token(`${c}.degenerate`, int(degenerate));
    token(`${c}.degenerateExpected`, expectedCount(degenerateExpected));
    token(`${c}.zeroProbability`, sci(allZeroProbability(e.n), 3));
    token(`${c}.ceiling`, fmt(1 - allZeroProbability(e.n), 3));
  }
  token('avg.zCount', summary.zCount);
  token('avg.zAboveTwo', summary.zAboveTwo);
  token('avg.zExpected', fmt(summary.zCount * 2 * (1 - standardNormalCdf(2)), 1));
  token('avg.zMax', fmt(summary.zMax, 2));
  const large = experiments.flatMap((e) => [
    { name: `the average of the sampling means at n = ${int(e.n)}`, z: e.zMean },
    { name: `the average of the sampling variances at n = ${int(e.n)}`, z: e.zVariance },
  ]);
  token('avg.zList', words(large.filter((e) => Math.abs(e.z) > 2).map((e) => `${e.name} (${fmt(e.z, 2)})`)) || 'none');

  token('spread.slopeMean', fmt(summary.slopeMean, 3));
  token('spread.slopeExactMean', fmt(summary.slopeExactMean, 3));
  token('spread.slopeVariance', fmt(summary.slopeVariance, 3));
  token('spread.slopeExactVariance', fmt(summary.slopeExactVariance, 3));
  token('spread.ratioLimit', fmt(summary.varianceRatioLimit, 3));

  for (const d of results.distributions) {
    token(`dist.n${d.n}.atomShare`, fmt(d.atomShare, 4));
    token(`dist.n${d.n}.atomExact`, fmt(allZeroProbability(d.n), 4));
    token(`dist.n${d.n}.skewMean`, fmt(SKEWNESS / Math.sqrt(d.n), 3));
    token(`dist.n${d.n}.skewVariance`, fmt(d.skewVariance, 3));
  }

  token('precision.n', int(precision.n));
  token('precision.slopeMean', fmt(precision.slopeMean, 3));
  token('precision.slopeVariance', fmt(precision.slopeVariance, 3));
  token('precision.exactSdMean', fmt(precision.exactSdMean, 4));
  token('precision.exactSdVariance', fmt(precision.exactSdVariance, 3));
  for (const r of precision.rows) {
    const k = `precision.m${r.size}`;
    token(`${k}.groups`, int(r.groups));
    token(`${k}.rmsMean`, fmt(r.rmsMean, 4));
    token(`${k}.seMean`, fmt(r.seMean, 4));
    token(`${k}.spreadMean`, fmt(r.spreadMean, 4));
    token(`${k}.rmsVariance`, fmt(r.rmsVariance, 3));
    token(`${k}.seVariance`, fmt(r.seVariance, 3));
    token(`${k}.spreadVariance`, fmt(r.spreadVariance, 3));
  }

  /* §7: the intervals and the dependence of the two estimators. */
  const limit = summary.chiLimit;
  const seLimit = Math.sqrt((limit * (1 - limit)) / m);
  const tail = experiments.filter((e) => e.n >= 100);
  token('cover.chiLimit', fmt(limit, 3));
  token('cover.largestN', int(largest.n));
  token('cover.chiZ', fmt((largest.coverage.chi.rate - limit) / seLimit, 2));
  token('cover.chiLargeMean', fmt(tail.reduce((sum, e) => sum + e.coverage.chi.rate, 0) / tail.length, 3));
  token('cover.tailFrom', int(tail[0].n));
  for (const block of results.scatter) {
    const k = `scatter.n${block.n}`;
    token(`${k}.r`, fmt(block.correlation, 3));
    token(`${k}.exact`, fmt(correlationMeanVariance(block.n), 3));
    token(`${k}.atomShare`, fmt(block.atomShare, 3));
  }
  token('scatter.limit', fmt(summary.correlationLimit, 3));

  return { html, tokens };
}

/**
 * @param {{ root: string, source?: string | URL, run?: typeof runSamplingStudy }} context
 *   root is where the study is cached; source, the project whose modules form the key, defaults to root
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root, source = root, run = runSamplingStudy }) {
  const { key: cacheKey, results, ms, computedAt } = loadOrCompute(root, source, run);
  return buildFigures(results, { params: PARAMS, ms, computedAt, cacheKey });
}

/**
 * Build-time figure provider of homework 05 (called by src/build/site-plugin.js).
 *
 * Runs the numerical study of src/lib/welford-stability.js, works the trace of
 * the recurrences of src/lib/welford.js on the data set of the page, cuts the
 * code listing from that file, renders every figure and table, and returns them
 * with the values quoted in the text as {{fig.…}} tokens.
 *
 * The results of the study are cached under node_modules/.cache/hw05/<key>.json,
 * the key being a hash of PARAMS, of the source of every module listed in
 * DEPENDENCIES and of this file, so that a dev reload is instant and any change
 * to the study recomputes everything. The trace, the listing and the rendering
 * are redone on every build.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/05/index.html)
 *   listing      Listing 1, the functions push and sampleVariance of src/lib/welford.js
 *   trace        Table 1, the recurrences on the data set, step by step
 *   forms        Table 2, every form of the recurrence at the last step
 *   geometry     Fig. 1, the rectangle of three steps on the plane, and the ledger of areas
 *   errors       Fig. 2, the relative error of the three algorithms against κ
 *   errorTable   Table 3, the same at selected κ, with the negative results of the textbook formula
 *   slopesTable  Table 4, the measured slopes against the published bounds
 *   parameters   Table A1, the parameters of the study
 *
 * Tokens ({{fig.<key>}}); every value is a display string. J is a decade of κ, from 0 to 9.
 *   params.{seed, n, replicates, shiftCount, kappaMax, draws, u, computeSeconds, computedAt, cacheKey,
 *     seedNoise, seedScores, scoreN, scoreReplicates, scoreP, scoreTop}
 *     (params.seed is a plain number, read by the live panel)
 *   trace.{data, n, mean, ss, variance, population, step2.*, step8.*}, forms.maxDifference
 *   slope.{textbook, welford, twoPassFlat, twoPassTail}, ratio.{textbook, twoPass, welford}
 *   at.kJ.{kappa, textbookMedian, textbookWorst, twoPassMedian, twoPassWorst, welfordMedian, welfordWorst, negative}
 *   textbook.{negative, lostKappa, firstNegativeKappa}, welford.negative, twoPass.negative, samples
 *   scores.{kappa, kappaTheory, textbook, twoPass, welford, mean, variance}
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { count, fmt, int, renderParametersTable, sci, sig } from '../../src/lib/penetration-charts.js';
import { ALGORITHMS, UNIT_ROUNDOFF, runStabilityStudy } from '../../src/lib/welford-stability.js';
import { kappaText, renderErrorTable, renderErrors, renderFormsTable, renderListing, renderSlopesTable, renderTraceTable } from '../../src/lib/welford-charts.js';
import { DEFAULT_SEQUENCE, planeDomain, recurrenceForms, stepsOf } from '../../src/hw05/model.js';
import { ledgerSvg, planeSvg } from '../../src/hw05/scene.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seed: 20261031, // the master seed; every stream of the study is derived from it (deriveSeed)
  n: 1000, // values per sample
  replicates: 200, // samples per point of the sweep; the same samples at every shift
  // The shift c of x = c + z: κ ≈ c for c ≫ 1. Half-decades from 1 to 10⁹, and no shift at all.
  shifts: Object.freeze([0, ...Array.from({ length: 19 }, (_, i) => Math.round(10 ** (i / 2)))]),
  fit: Object.freeze({
    textbook: Object.freeze({ algorithm: 'textbook', low: 1e2, high: 1e7 }), // above its floor and below total loss
    welford: Object.freeze({ algorithm: 'welford', low: 1e2, high: 1.5e9 }),
    twoPassFlat: Object.freeze({ algorithm: 'twoPass', low: 1, high: 1e7 }),
    twoPassTail: Object.freeze({ algorithm: 'twoPass', low: 9e7, high: 1.5e9 }),
  }),
  tableShifts: Object.freeze([0, 100, 10000, 1000000, 10000000, 31622777, 100000000, 1000000000]), // Table 3
  // The score law X = B·Y of exercise 2: B ~ Bernoulli(p), Y ~ Uniform(0, top].
  scores: Object.freeze({ p: 0.3, top: 10, n: 1000, replicates: 200 }),
  figureSteps: Object.freeze([2, 5, 8]), // the steps drawn in Fig. 1
  buildWidth: 640, // pixel width of the printed charts
});

/* The cache key covers the parameters, every module the study depends on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = ['src/lib/welford-stability.js', 'src/lib/welford.js', 'src/lib/random.js', 'src/lib/normal.js', 'src/lib/kg-study.js'];

let memo = null;

function loadOrCompute(root) {
  const text = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + text)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw05');
  const file = resolve(dir, `${key}.json`);
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.scores) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = runStabilityStudy(PARAMS);
    const ms = performance.now() - t0;
    const json = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, results });
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, json);
    renameSync(tmp, file);
    value = JSON.parse(json);
    console.log(`[hw05] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw05/${key}.json`);
  }
  memo = { key, value };
  return value;
}

/** The forms of the recurrence at the last step, against the definition they must reach. */
function formRows(values) {
  const forms = recurrenceForms(values);
  const n = values.length;
  const last = n - 1;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const ss = values.reduce((s, x) => s + (x - mean) ** 2, 0);
  return [
    { equation: 3, quantity: String.raw`\bar{x}_k`, form: String.raw`\bar{x}_{k-1} + (x_k - \bar{x}_{k-1})/k`, value: forms.mean[last], definition: mean },
    { equation: 10, quantity: 'SS_k', form: String.raw`SS_{k-1} + (x_k - \bar{x}_{k-1})(x_k - \bar{x}_k)`, value: forms.ssProduct[last], definition: ss },
    { equation: 12, quantity: 'SS_k', form: String.raw`SS_{k-1} + \frac{k-1}{k}(x_k - \bar{x}_{k-1})^2`, value: forms.ssSquare[last], definition: ss },
    { equation: 14, quantity: 's_k^2', form: String.raw`\frac{k-2}{k-1}s_{k-1}^2 + (x_k - \bar{x}_{k-1})^2/k`, value: forms.varianceScaled[last], definition: ss / (n - 1) },
    { equation: 15, quantity: 's_k^2', form: String.raw`s_{k-1}^2 + [(x_k - \bar{x}_{k-1})(x_k - \bar{x}_k) - s_{k-1}^2]/(k-1)`, value: forms.varianceMirror[last], definition: ss / (n - 1) },
    { equation: 16, quantity: String.raw`\hat{\sigma}_k^2`, form: String.raw`\hat{\sigma}_{k-1}^2 + [(x_k - \bar{x}_{k-1})(x_k - \bar{x}_k) - \hat{\sigma}_{k-1}^2]/k`, value: forms.populationMirror[last], definition: ss / n },
  ];
}

/** Fig. 1: the plane at a few steps, each with the same scale, and the ledger of all the areas. */
function renderGeometry(steps, stepsShown, width) {
  const domain = planeDomain(steps.map((s) => s.x));
  const panels = stepsShown
    .map((k) => {
      const step = steps[k - 1];
      const plane = planeSvg(step, {
        id: `fig-plane-${k}`,
        domain,
        size: 240,
        compact: true,
        title: `Step ${k} of the recurrence`,
        desc: `The new observation ${fmt(step.x, 0)} on the diagonal, the previous mean ${fmt(step.oldMean, 3)} on the horizontal axis and the new mean ${fmt(step.mean, 3)} on the vertical axis; the rectangle between them has area ${fmt(step.area, 3)}.`,
      });
      return `<div class="chart-panel"><p class="chart-panel__title">k = ${k}: area ${fmt(step.area, 3)}</p>${plane}</div>`;
    })
    .join('');
  const ledger = ledgerSvg(steps, steps.length, {
    id: 'fig-ledger',
    width,
    title: 'The areas laid end to end',
    desc: `The areas added at steps 2 to ${steps.length}, end to end in a strip of constant height, whose total length is the final sum of squares ${fmt(steps.at(-1).ss, 0)}.`,
  });
  return `<div class="stepper-panels">${panels}</div><div class="stepper-ledger-frame">${ledger}</div>`;
}

const pointAt = (study, shift) => study.points.find((p) => p.shift === shift);

/**
 * Every figure, table and token of the page.
 * @param {ReturnType<typeof runStabilityStudy>} results
 * @param {{ params?: object, ms: number, computedAt: string, cacheKey: string, source: string }} meta
 *   `source` is the text of src/lib/welford.js
 * @returns {{ html: Record<string, string>, tokens: Record<string, string> }}
 */
export function buildFigures(results, { params = PARAMS, ms, computedAt, cacheKey, source }) {
  const html = {};
  const tokens = {};
  const token = (k, value) => {
    tokens[k] = String(value);
  };
  const width = params.buildWidth;
  const values = [...DEFAULT_SEQUENCE];
  const steps = stepsOf(values);
  const last = steps.at(-1);
  const rows = formRows(values);

  /* Figures and tables. */
  html.listing = renderListing(source, ['push', 'sampleVariance']);
  html.trace = renderTraceTable(steps);
  html.forms = renderFormsTable(rows);
  html.geometry = renderGeometry(steps, params.figureSteps, width);
  html.errors = renderErrors(results, { id: 'fig-errors', width });
  html.errorTable = renderErrorTable(results, params.tableShifts);
  html.slopesTable = renderSlopesTable(results);
  html.parameters = renderParametersTable([
    ['Master seed', String(params.seed), 'Every stream of the study is derived from it'],
    ['n', int(params.n), 'Values per sample, Fig. 2 and Tables 3 and 4'],
    ['Replicates', int(params.replicates), 'Samples per point of the sweep, the same at every shift'],
    ['Shift c', `0, then ${params.shifts.length - 1} half-decades from 1 to ${sci(params.shifts.at(-1), 1)}`, 'Data x = c + z with z standard normal'],
    ['u', sci(UNIT_ROUNDOFF, 3), 'Unit roundoff of double precision, 2⁻⁵³'],
    ['Scores', `p = ${params.scores.p}, top = ${params.scores.top}`, 'X = B·Y of exercise 2, §7.5'],
    ['n, scores', int(params.scores.n), 'Values per sample of scores'],
    ['Replicates, scores', int(params.scores.replicates), 'Samples of scores'],
    ['Exact evaluations', count(params.replicates * params.shifts.length + params.scores.replicates), 'Samples whose exact sum of squares is computed'],
  ]);

  /* Parameters and provenance (Appendix). */
  token('params.seed', params.seed);
  token('params.n', int(params.n));
  token('params.replicates', int(params.replicates));
  token('params.shiftCount', params.shifts.length);
  token('params.kappaMax', kappaText(results.points.at(-1).kappa));
  token('params.draws', count(params.n * params.replicates));
  token('params.u', sci(UNIT_ROUNDOFF, 3));
  token('params.computeSeconds', fmt(ms / 1000, 1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);
  token('params.seedNoise', results.seeds.noise);
  token('params.seedScores', results.seeds.scores);
  token('params.scoreN', int(params.scores.n));
  token('params.scoreReplicates', int(params.scores.replicates));
  token('params.scoreP', params.scores.p);
  token('params.scoreTop', params.scores.top);

  /* §4 and §5: the trace. */
  token('trace.data', values.join(', '));
  token('trace.n', values.length);
  token('trace.mean', sig(last.mean, 4).replace(/.0+$/, ''));
  token('trace.ss', sig(last.ss, 4).replace(/\.0+$/, ''));
  token('trace.variance', fmt(last.variance, 4));
  token('trace.population', sig(last.ss / values.length, 4).replace(/\.0+$/, ''));
  for (const k of [2, 3, 8]) {
    const s = steps[k - 1];
    token(`trace.step${k}.old`, fmt(s.oldMean, 3).replace(/\.?0+$/, ''));
    token(`trace.step${k}.mean`, fmt(s.mean, 3).replace(/\.?0+$/, ''));
    token(`trace.step${k}.x`, s.x);
    token(`trace.step${k}.area`, fmt(s.area, 3).replace(/\.?0+$/, ''));
    token(`trace.step${k}.ss`, fmt(s.ss, 3).replace(/\.?0+$/, ''));
  }
  const difference = Math.max(...rows.map((r) => Math.abs(r.value - r.definition)));
  token('forms.maxDifference', difference === 0 ? '0' : sci(difference, 2));
  const biggest = steps.reduce((best, s) => (s.area > best.area ? s : best));
  token('trace.biggest.k', biggest.k);
  token('trace.biggest.share', `${fmt((100 * biggest.area) / last.ss, 0)}%`);

  /* §7: the slopes and the bounds. */
  for (const [key, s] of Object.entries(results.slopes)) token(`slope.${key}`, fmt(s.slope, 2));
  for (const name of ALGORITHMS) {
    token(`ratio.${name}`, sig(results.boundRatios[name], 2));
    const negative = results.points.reduce((sum, p) => sum + p.algorithms[name].negative, 0);
    token(`${name}.negative`, negative);
  }
  token('samples', int(params.replicates * params.shifts.length));
  for (let j = 0; j <= 9; j += 1) {
    const p = pointAt(results, j === 0 ? 0 : 10 ** j);
    if (!p) continue;
    const a = p.algorithms;
    const k = `at.k${j}`;
    token(`${k}.kappa`, kappaText(p.kappa));
    for (const name of ALGORITHMS) {
      token(`${k}.${name}Median`, sci(a[name].median, 2));
      token(`${k}.${name}Worst`, sci(a[name].worst, 2));
    }
    token(`${k}.negative`, `${fmt((100 * a.textbook.negative) / results.replicates, 0)}%`);
    token(`${k}.digits`, fmt(Math.max(0, -Math.log10(a.textbook.median)), 0));
  }
  const lost = results.points.find((p) => p.algorithms.textbook.median >= 1);
  token('textbook.lostKappa', lost ? kappaText(lost.kappa) : 'beyond the sweep');
  const firstNegative = results.points.find((p) => p.algorithms.textbook.negative > 0);
  token('textbook.firstNegativeKappa', firstNegative ? kappaText(firstNegative.kappa) : 'beyond the sweep');

  /* §7.5: the scores of exercise 2. */
  const { p, top } = params.scores;
  const mean = (p * top) / 2;
  const variance = (p * top ** 2) / 3 - mean ** 2;
  token('scores.mean', sig(mean, 2));
  token('scores.variance', sig(variance, 3));
  token('scores.kappaTheory', fmt(Math.sqrt(1 + mean ** 2 / variance), 2));
  token('scores.kappa', fmt(results.scores.kappa, 2));
  for (const name of ALGORITHMS) token(`scores.${name}`, sci(results.scores.algorithms[name].worst, 2));

  return { html, tokens };
}

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { key: cacheKey, results, ms, computedAt } = loadOrCompute(root);
  const source = readFileSync(resolve(root, 'src/lib/welford.js'), 'utf8');
  return buildFigures(results, { params: PARAMS, ms, computedAt, cacheKey, source });
}

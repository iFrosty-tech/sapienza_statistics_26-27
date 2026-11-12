/**
 * Build-time figure provider of homework 07 (called by src/build/site-plugin.js).
 *
 * Runs the study of src/lib/hw07-study.js, renders every figure and table of the page, and returns them with
 * the values quoted in the text as {{fig.…}} tokens. Exercise 1 is the integral computed by Riemann and by
 * Lebesgue sums (src/lib/integration.js), exercise 2 the normal distribution function (src/lib/normal-cdf.js).
 *
 * The results are cached under node_modules/.cache/hw07/<key>.json, the key being a hash of PARAMS, of the
 * source of every module listed in DEPENDENCIES and of this file, so that a dev reload is instant and any change
 * to the study recomputes everything; the rendering is redone on every build from the JSON. The timings are
 * the one non-deterministic part of the study: they are measured when the cache is filled and stay fixed until it is.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/07/index.html)
 *   functions      Table 1, the functions and their exact integrals
 *   partitions     Fig. 1, the two ways of cutting up the area, for sin x and for a step function
 *   errorTable     Table 2, the error of every sum at n = N = 1001
 *   convergence    Fig. 2, the error of the sums against n for the seven functions
 *   rateTable      Table 3, the measured exponents of convergence
 *   costTable      Table 4, evaluations and time of the two sums, and of the Lebesgue sum with sampled preimages
 *   pathological   Fig. 3, the Riemann sums of the Dirichlet and Thomae functions
 *   thomaeTable    Table 5, the Riemann and Darboux sums of Thomae's function
 *   levelTable     Table 6, the superlevel sets of Thomae's function
 *   webTable       Table 7, erf from the web table against the hybrid method
 *   accuracyTable  Table 8, the relative error of Φ(−x) of every method
 *   quadrature     Fig. 4, the error of the trapezoid and Simpson rules against the number of panels
 *   profile        Fig. 5, the relative error of the lower tail of every method against x
 *   cdfCostTable   Table 9, the cost of reaching an error of 10⁻¹² in Φ(x)
 *   parameters     Table A1, the parameters of the study
 *
 * Tokens ({{fig.<key>}}); every value is a display string. F is the key of a function: sin, square, step, abs,
 * inverseRoot, indicator, sinc. N is an n of a grid, X an x of a table, written with an underscore for the point (2_5).
 *   params.{seed, tableN, timingN, gridFrom, gridTo, gridCount, sampledPoints, sampledLevels, cutoff, computeSeconds,
 *     computedAt, cacheKey, trapezoidPanels, simpsonPanels, tolerance, builtWith}
 *   int.F.{exact, left, mid, right, lebesgue, bound, step}     errors at n = N = tableN
 *   rate.F.{left, mid, right, lebesgue}                        fitted exponents
 *   time.F.{riemann, lebesgue, ratio}, sampled.F, bisections
 *   dir.alternating, thomae.nN.{tags, upper}, thomae.slope, level.mN
 *   web.{maxDiff, maxDiffErfc, bound, count}
 *   acc.xX.{trapezoid, simpson, maclaurin, erfTaylor, cf, approximation, recipes, hybrid}
 *   quad.xX.{trapezoidSlope, simpsonSlope, floorAt}
 *   profile.{hybridMax, maclaurinLost, erfTaylorLost, cfMax, approximationMax, recipesMax}
 *   cost.xX.{trapezoid, simpson, maclaurin, erfTaylor, cf, hybrid}, ns.{trapezoid, simpson, maclaurin, erfTaylor, cf,
 *     approximation, recipes, hybrid, reference}
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { count, fmt, int, renderParametersTable, sci, sciHtml, sig } from '../../src/lib/penetration-charts.js';
import { FUNCTIONS, functionByKey } from '../../src/lib/integration.js';
import { HYBRID_CUTOFF } from '../../src/lib/normal-cdf.js';
import { fitRate, runStudy } from '../../src/lib/hw07-study.js';
import { dataTable, panels, renderPlot, rowHead, swap, td, tex, th } from '../../src/lib/integration-charts.js';
import { partitionSvg } from '../../src/hw07/scene.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seed: 20261112, // the master seed of the one stochastic part, the sampled preimages (deriveSeed)
  integration: Object.freeze({
    seed: 20261112,
    grid: Object.freeze({ from: 1, to: 5 }), // n = N from 10 to 10⁵, four to the decade, rounded to an odd integer
    tableN: 1001, // Table 2: odd, so that the jump at ½ falls inside a subinterval
    timingN: 1000000, // Table 4: the sums of a million terms
    sampled: Object.freeze({ levels: 1000, points: 1000000 }), // the Lebesgue sum with sampled preimages
    pathological: Object.freeze({
      grid: Object.freeze([10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]),
      levels: Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]),
    }),
  }),
  cdf: Object.freeze({
    trapezoidPanels: 100,
    simpsonPanels: 100,
    profile: Object.freeze({ xs: Object.freeze(Array.from({ length: 40 }, (_, i) => (i + 1) / 4)) }), // 0.25 to 10
    accuracyX: Object.freeze([0.5, 1, 2, 3, 5, 8]),
    convergence: Object.freeze({ x: Object.freeze([1, 3]), panels: Object.freeze(Array.from({ length: 14 }, (_, i) => 2 ** (i + 1))) }),
    cost: Object.freeze({ x: Object.freeze([1, 2, 3, 5]), tolerance: 1e-12 }),
    timing: Object.freeze({ points: Object.freeze([0.3, 0.9, 1.4, 1.8, 2.3, 2.9, 3.6, 4.4]), calls: 200000 }),
  }),
  convergencePanel: 300, // pixel width of the small multiples
  buildWidth: 640, // pixel width of the printed charts
});

/* The cache key covers the parameters, every module the study depends on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/hw07-study.js',
  'src/lib/integration.js',
  'src/lib/normal-cdf.js',
  'src/lib/normal.js',
  'src/lib/random.js',
  'src/lib/kg-study.js',
];

/** Where the study of a project is cached. */
export const cacheDirectory = (root) => resolve(root, 'node_modules/.cache/hw07');

let memo = null;

function loadOrCompute(root) {
  const text = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + text)).slice(0, 16);
  const dir = cacheDirectory(root);
  const file = resolve(dir, `${key}.json`);
  if (memo?.file === file) return memo.value;
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.cdf?.timing) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = runStudy(PARAMS);
    const ms = performance.now() - t0;
    const json = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, results }, (_, v) => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : Number.isNaN(v) ? 'NaN' : v));
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, json);
    renameSync(tmp, file);
    value = JSON.parse(json);
    console.log(`[hw07] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw07/${key}.json`);
  }
  memo = { file, value: revive(value) };
  return memo.value;
}

/** The JSON of the cache writes the non-finite numbers as strings: they come back as numbers. */
function revive(value) {
  const walk = (v) => {
    if (v === '∞') return Infinity;
    if (v === '−∞') return -Infinity;
    if (v === 'NaN') return NaN;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/* ------------------------------------------------------------------ helpers */

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const errorCell = (v) => (v === Infinity ? '∞' : sciHtml(Math.abs(v), 2));
const errorText = (v) => (v === Infinity ? '∞' : sci(Math.abs(v), 2));
const point = (x) => String(x).replace('.', '_');
const ms = (v) => (v < 10 ? fmt(v, 1) : int(v));
const label = (n) => (n >= 1000 ? `10^{${Math.round(Math.log10(n))}}` : String(n));

const FUNCTION_NOTES = Object.freeze({
  sin: 'smooth, vanishes at both ends',
  square: 'smooth, increasing',
  step: 'one jump, at ½',
  abs: 'continuous, a kink at ½',
  inverseRoot: 'unbounded at 0, improper',
  indicator: 'one jump, at ½',
  sinc: 'smooth, removable point at 0',
});

/* ------------------------------------------------------------------- tables */

/** The exact integral of a function: a fraction typeset as one, and the sine integral with its value. */
function exactCell(fn) {
  if (fn.key === 'sinc') return `${tex(String.raw`\mathrm{Si}(\pi)`)} ≈ ${fmt(fn.exact, 6)}`;
  const fraction = /^(\d)\/(\d)$/.exec(fn.exactText);
  return tex(fraction ? String.raw`\tfrac{${fraction[1]}}{${fraction[2]}}` : fn.exactText);
}

function functionsTable() {
  const head = [th('Function'), th(tex('f(x)'), 'is-number'), th('Domain', 'is-number'), th('Integral', 'is-number'), th('Character')];
  const rows = FUNCTIONS.map(
    (fn) => `<tr>${rowHead(fn.name)}${td(tex(fn.tex), 'data-table__form')}${td(tex(fn.domain))}${td(exactCell(fn))}<td>${FUNCTION_NOTES[fn.key]}</td></tr>`,
  );
  rows.push(
    `<tr>${rowHead('Dirichlet')}${td(tex(String.raw`\mathbf{1}_{\mathbb{Q}}(x)`), 'data-table__form')}${td(tex('[0, 1]'))}${td('0 (Lebesgue)')}<td>not Riemann integrable</td></tr>`,
    `<tr>${rowHead('Thomae')}${td(tex(String.raw`1/q \text{ at } p/q,\ 0 \text{ at irrationals}`), 'data-table__form')}${td(tex('[0, 1]'))}${td('0')}<td>Riemann integrable, discontinuous on ℚ</td></tr>`,
  );
  return dataTable('data-table--integration data-table--functions', head, rows);
}

function errorTable(int_) {
  const head = [th('Function'), th('Exact', 'is-number'), th('Left', 'is-number'), th('Midpoint', 'is-number'), th('Right', 'is-number'), th('Lebesgue', 'is-number')];
  const rows = int_.functions.map((f) => {
    const fn = functionByKey(f.key);
    const t = f.table;
    const err = (v) => td(errorCell(v - fn.exact));
    return `<tr>${rowHead(fn.name)}${td(f.key === 'sinc' ? fmt(fn.exact, 6) : fmt(fn.exact, f.key === 'square' ? 6 : 4))}${err(t.left)}${err(t.mid)}${err(t.right)}${err(t.lebesgue)}</tr>`;
  });
  return dataTable('data-table--integration data-table--errors', head, rows);
}

const rateCell = (r) => (r.diverges ? 'diverges' : r.exact ? 'exact' : fmt(r.slope, 2));

function rateTable(int_) {
  const head = [th('Function'), th('Left', 'is-number'), th('Midpoint', 'is-number'), th('Right', 'is-number'), th('Lebesgue', 'is-number')];
  const rows = int_.functions.map((f) => `<tr>${rowHead(functionByKey(f.key).name)}${['left', 'mid', 'right', 'lebesgue'].map((k) => td(rateCell(f.rates[k]))).join('')}</tr>`);
  return dataTable('data-table--integration data-table--rates', head, rows);
}

function costTable(int_, params) {
  const head = [
    th('Function'),
    th('Riemann time (ms)', 'is-number'),
    th('Lebesgue measures', 'is-number'),
    th('Inner evaluations of f', 'is-number'),
    th('Lebesgue time (ms)', 'is-number'),
    th('Ratio', 'is-number'),
    th('Sampled preimages: error', 'is-number'),
  ];
  const N = params.integration.timingN;
  const rows = int_.functions.map((f) => {
    const bis = f.key === 'sinc' ? (N + 1) * 60 : 0;
    return `<tr>${rowHead(functionByKey(f.key).name)}${td(ms(f.timing.riemannMs))}${td(int(N + 1))}${td(bis ? count(bis) : '0')}${td(ms(f.timing.lebesgueMs))}${td(`${fmt(f.timing.lebesgueMs / f.timing.riemannMs, 0)}×`)}${td(errorCell(f.sampledError))}</tr>`;
  });
  return dataTable('data-table--integration data-table--cost', head, rows);
}

function thomaeTable(int_) {
  const head = [th(tex('n'), 'is-number'), th('Tags at the right ends', 'is-number'), th('Upper Darboux sum', 'is-number'), th('Lower Darboux sum', 'is-number')];
  const rows = int_.thomae.map((t) => `<tr>${rowHead(int(t.n))}${td(sciHtml(t.rational, 3))}${td(sciHtml(t.upper, 3))}${td('0')}</tr>`);
  return dataTable('data-table--integration data-table--thomae', head, rows);
}

function levelTable(int_) {
  const head = [th(tex('m'), 'is-number'), th(tex(String.raw`\{x : f(x) \ge 1/m\}`), 'is-number'), th('Number of points', 'is-number'), th('Measure', 'is-number')];
  const rows = int_.thomaeLevels.map((l) => `<tr>${rowHead(int(l.m))}${td(`fractions of denominator at most ${int(l.m)}`, 'data-table__form')}${td(int(l.count))}${td('0')}</tr>`);
  return dataTable('data-table--integration data-table--levels', head, rows);
}

function webTable(cdf) {
  const head = [
    th(tex('z'), 'is-number'),
    th(tex(String.raw`\mathrm{erf}\,z`) + ', web', 'is-number'),
    th('here', 'is-number'),
    th('Difference', 'is-number'),
    th(tex(String.raw`1 - \mathrm{erf}\,z`) + ', web', 'is-number'),
    th('here', 'is-number'),
    th('Difference', 'is-number'),
  ];
  const rows = cdf.web.map(
    (w) =>
      `<tr>${rowHead(fmt(w.z, 1))}${td(fmt(w.erf, 9))}${td(fmt(w.mine, 12))}${td(sciHtml(w.mine - w.erf, 1))}${td(fmt(w.erfc, 9))}${td(sig(w.mineErfc, 6))}${td(sciHtml(w.mineErfc - w.erfc, 1))}</tr>`,
  );
  return dataTable('data-table--cdf data-table--web', head, rows);
}

const ACCURACY_COLUMNS = Object.freeze([
  ['trapezoid', 'Trapezoid'],
  ['simpson', 'Simpson'],
  ['maclaurin', 'Maclaurin'],
  ['erfTaylor', 'erf series'],
  ['cf', 'Fraction'],
  ['approximation', 'A&S 26.2.17'],
  ['recipes', 'Recipes'],
  ['hybrid', 'Hybrid'],
]);

function accuracyTable(cdf) {
  const head = [th(tex('x')), ...ACCURACY_COLUMNS.map(([, name]) => th(name, 'is-number'))];
  const rows = cdf.accuracy.map((a) => `<tr>${rowHead(String(a.x))}${ACCURACY_COLUMNS.map(([k]) => td(a[k].relative === 0 ? '0' : sciHtml(a[k].relative, 1))).join('')}</tr>`);
  return dataTable('data-table--cdf data-table--accuracy', head, rows);
}

function cdfCostTable(cdf, params) {
  const xs = cdf.cost.map((c) => c.x);
  const head = [th('Method (unit of cost)'), ...xs.map((x) => th(`${tex('x')} = ${x}`, 'is-number')), th('Time per call', 'is-number')];
  const limit = '> 2<sup>21</sup>';
  const ns = (v) => `${fmt(v, v < 100 ? 0 : 0)} ns`;
  const line = (name, cells, time) => `<tr>${rowHead(name)}${cells.map((c) => td(c)).join('')}${td(time)}</tr>`;
  const panelsOf = (v) => (v === null ? limit : int(v));
  const rows = [
    line('Trapezoid (panels)', cdf.cost.map((c) => panelsOf(c.trapezoid)), `${ns(cdf.timing.trapezoid)} at ${params.cdf.trapezoidPanels}`),
    line('Simpson (panels)', cdf.cost.map((c) => panelsOf(c.simpson)), `${ns(cdf.timing.simpson)} at ${params.cdf.simpsonPanels}`),
    line('Maclaurin series (terms)', cdf.cost.map((c) => int(c.maclaurin.cost)), ns(cdf.timing.maclaurin)),
    line('erf series (terms)', cdf.cost.map((c) => (c.erfTaylor.error < params.cdf.cost.tolerance ? int(c.erfTaylor.cost) : `${int(c.erfTaylor.cost)}, error ${sciHtml(c.erfTaylor.error, 1)}`)), ns(cdf.timing.erfTaylor)),
    line('Continued fraction (terms)', cdf.cost.map((c) => int(c.continuedFraction.cost)), ns(cdf.timing.continuedFraction)),
    line('Hybrid (terms)', cdf.cost.map((c) => int(c.hybrid.cost)), ns(cdf.timing.hybrid)),
    line('A&S 26.2.17 (terms)', cdf.cost.map((c) => `${int(c.approximation.cost)}, error ${sciHtml(c.approximation.error, 1)}`), ns(cdf.timing.approximation)),
    line('Reference, 80 digits (BigInt)', cdf.cost.map(() => DASH_CELL), `${fmt(cdf.timing.reference / 1000, 0)} µs`),
  ];
  return dataTable('data-table--cdf data-table--cdf-cost', head, rows);
}
const DASH_CELL = '—';

/* ------------------------------------------------------------------ figures */

/** Fig. 1: a Riemann and a Lebesgue sum for a smooth function and for a step function. */
function partitions() {
  const items = [
    { fn: functionByKey('sin'), kind: 'riemann', count: 8, rule: 'left', title: `${functionByKey('sin').name}: Riemann, n = 8` },
    { fn: functionByKey('sin'), kind: 'lebesgue', count: 8, title: `${functionByKey('sin').name}: Lebesgue, N = 8` },
    { fn: functionByKey('step'), kind: 'riemann', count: 7, rule: 'mid', title: 'Step 1 and 3: Riemann, n = 7' },
    { fn: functionByKey('step'), kind: 'lebesgue', count: 4, title: 'Step 1 and 3: Lebesgue, N = 4' },
  ].map(({ fn, kind, count: n, rule, title }, i) => ({
    title,
    svg: partitionSvg(fn, {
      kind,
      count: n,
      rule,
      id: `fig-partition-${i + 1}`,
      title,
      desc:
        kind === 'riemann'
          ? `The rectangles of a Riemann sum of ${fn.name} on ${n} equal subintervals, each as high as the function at its ${rule === 'left' ? 'left end' : 'middle'}.`
          : `The simple function that rounds ${fn.name} down to ${n} equally spaced levels of the range, drawn over the preimage of each level.`,
    }),
  }));
  return panels(items, 2);
}

const STYLES = Object.freeze({
  left: { style: 'ring', shape: 'square', dash: '2 3', label: 'left' },
  mid: { style: 'ink', shape: 'triangle', dash: '', label: 'midpoint' },
  lebesgue: { style: 'data', shape: 'circle', dash: '', label: 'Lebesgue' },
});

/** Fig. 2: the error of the sums against n, one small chart per function. */
function convergence(int_, params) {
  const width = params.convergencePanel;
  const items = int_.functions.map((f) => {
    const fn = functionByKey(f.key);
    const series = ['left', 'mid', 'lebesgue'].map((k) => ({
      key: k,
      points: f.grid.map((n, i) => ({ x: n, y: Number.isFinite(f[k][i]) ? Math.abs(f[k][i]) : null })),
      ...STYLES[k],
    }));
    const slopes = { 1: 1, 2: 2 };
    const reference = f.key === 'inverseRoot' ? [{ kind: 'slope', exponent: -0.5, factor: 0.8, label: 'n^{−1/2}' }] : [
      { kind: 'slope', exponent: -slopes[1], factor: 0.5, label: 'n^{−1}' },
      { kind: 'slope', exponent: -slopes[2], factor: 0.7, label: 'n^{−2}' },
    ];
    const svg = renderPlot({
      id: `fig-convergence-${f.key}`,
      title: `Error of the sums for ${fn.name}`,
      desc: `The absolute error of the left, midpoint and Lebesgue sums of ${fn.name} against n, on logarithmic axes, for n from 10 to 100,000. Errors below 10⁻¹⁶ are drawn on the bottom edge.`,
      width,
      height: 250,
      panel: true,
      x: { scale: 'log', domain: [8, 1.2e5], label: 'n = N' },
      y: { scale: 'log', domain: [1e-16, 10], label: 'Error' },
      series: series.map((s) => ({ ...s, label: undefined })),
      rules: reference,
    });
    return { title: fn.name, svg };
  });
  return panels(items, 2);
}

/** Fig. 3: the Riemann sums of the Dirichlet and Thomae functions. */
function pathological(int_, width) {
  const dirichlet = renderPlot({
    id: 'fig-dirichlet',
    title: 'Riemann sums of the Dirichlet function',
    desc: 'The Riemann sum of the Dirichlet function over n equal subintervals against n, for tags chosen rational, alternately rational and irrational, and irrational: the sums are 1, about one half and 0 at every n.',
    width,
    height: 260,
    panel: true,
    x: { scale: 'log', domain: [8, 1.2e4], label: 'Subintervals n' },
    y: { scale: 'linear', domain: [-0.1, 1.1], label: 'Riemann sum' },
    series: [
      { key: 'rational', label: 'rational tags', points: int_.dirichlet.map((d) => ({ x: d.n, y: d.rational })), style: 'data', prefer: ['s', 'se'] },
      { key: 'alternating', label: 'alternating', points: int_.dirichlet.map((d) => ({ x: d.n, y: d.alternating })), style: 'ring', shape: 'square', dash: '2 3', prefer: ['n', 'ne'] },
      { key: 'irrational', label: 'irrational tags', points: int_.dirichlet.map((d) => ({ x: d.n, y: d.irrational })), style: 'ink', shape: 'triangle', prefer: ['n', 'ne'] },
    ],
  });
  const u0 = int_.thomae[0];
  const thomae = renderPlot({
    id: 'fig-thomae',
    title: 'Riemann and Darboux sums of the Thomae function',
    desc: `The upper Darboux sum and the Riemann sum with tags at the right ends of the subintervals, for Thomae's function, against n on logarithmic axes: both fall to 0, the upper sum about as n to the power minus one half, from ${fmt(u0.upper, 2)} at n = ${u0.n}.`,
    width,
    height: 260,
    panel: true,
    x: { scale: 'log', domain: [8, 1.2e4], label: 'Subintervals n' },
    y: { scale: 'log', domain: [1e-4, 1], label: 'Sum' },
    series: [
      { key: 'upper', label: 'upper Darboux', points: int_.thomae.map((t) => ({ x: t.n, y: t.upper })), style: 'data', prefer: ['ne', 'n'] },
      { key: 'tags', label: 'right-end tags', points: int_.thomae.map((t) => ({ x: t.n, y: t.rational })), style: 'ring', shape: 'square', dash: '2 3', prefer: ['sw', 's'] },
    ],
    rules: [{ kind: 'slope', exponent: -0.5, factor: u0.upper * u0.n ** 0.5, label: 'n^{−1/2}' }],
  });
  return panels([{ title: 'Dirichlet', svg: dirichlet }, { title: 'Thomae', svg: thomae }], 2);
}

/** Fig. 4: the two quadrature rules against the number of panels. */
function quadrature(cdf, params) {
  const items = cdf.convergence.map((c) => {
    const t0 = c.trapezoid[0];
    const s0 = c.simpson[0];
    const svg = renderPlot({
      id: `fig-quadrature-${point(c.x)}`,
      title: `Error of the trapezoid and Simpson rules at x = ${c.x}`,
      desc: `The absolute error of the trapezoidal and Simpson rules for Φ(${c.x}) against the number of panels, on logarithmic axes: the trapezoid error falls with slope −2 and the Simpson error with slope −4 until it reaches the roundoff, near 10⁻¹⁶.`,
      width: params.convergencePanel,
      height: 270,
      panel: true,
      x: { scale: 'log', domain: [1.5, 3e4], label: 'Panels n' },
      y: { scale: 'log', domain: [1e-17, 1], label: 'Absolute error' },
      series: [
        { key: 'trapezoid', label: 'trapezoid', points: c.panels.map((n, i) => ({ x: n, y: c.trapezoid[i] })), style: 'ring', shape: 'square', dash: '2 3', prefer: ['ne', 'e', 'n'] },
        { key: 'simpson', label: 'Simpson', points: c.panels.map((n, i) => ({ x: n, y: c.simpson[i] })), style: 'data', prefer: ['sw', 'w', 's'] },
      ],
      rules: [
        { kind: 'slope', exponent: -2, factor: t0 * 2 ** 2 * 1.8, label: 'n^{−2}' },
        { kind: 'slope', exponent: -4, factor: s0 * 2 ** 4 * 1.8, label: 'n^{−4}' },
      ],
    });
    return { title: `Φ(${c.x})`, svg };
  });
  return panels(items, 2);
}

const PROFILE_STYLES = Object.freeze({
  maclaurin: { dash: '', style: 'ring', label: 'Maclaurin', prefer: ['nw', 'n'] },
  erfTaylor: { dash: '7 4', style: 'ring', label: 'erf series', prefer: ['nw', 'w'] },
  cf: { dash: '2 3', style: 'ring', label: 'continued fraction', prefer: ['se', 's'] },
  approximation: { dash: '9 3 2 3', style: 'ring', label: 'A&S 26.2.17', prefer: ['nw', 'n'] },
  recipes: { dash: '', style: 'ring', label: 'Numerical Recipes', prefer: ['se', 'e'] },
  hybrid: { dash: '', style: 'data', label: 'hybrid', prefer: ['s', 'se'] },
});

/** Fig. 5: the relative error of the lower tail of each method against x. */
function profile(cdf, width, id) {
  const series = cdf.profile.map((p) => ({
    key: p.key,
    points: p.points.map((q) => ({ x: q.x, y: q.y })),
    markers: false,
    ...PROFILE_STYLES[p.key],
    label: PROFILE_STYLES[p.key].label,
  }));
  return renderPlot({
    id,
    title: 'Relative error of the lower tail Φ(−x) against x',
    desc: 'The relative error of the lower tail of the standard normal distribution function, computed by six methods, for x from 0.25 to 10 on a logarithmic axis. The Maclaurin series and the error-function series lose all their digits in the tail, the approximations of Abramowitz and Stegun and of Numerical Recipes stay at their fixed error, and the continued fraction and the hybrid method stay near the roundoff.',
    width,
    height: width < 420 ? 400 : 430,
    x: { scale: 'linear', domain: [0, 10], label: 'x' },
    y: {
      scale: 'log',
      domain: [1e-17, 10],
      label: 'Relative error of Φ(−x)',
      ticks: [-16, -12, -8, -4, 0].map((k) => ({ value: 10 ** k, label: k === 0 ? '1' : `10^{−${-k}}` })),
    },
    series,
    rules: [
      { kind: 'h', y: 1, label: 'relative error 1: no correct digit' },
      { kind: 'h', y: 2 ** -53, label: 'u = 2^{−53}' },
    ],
  });
}

/* ------------------------------------------------------------------ the page */

/**
 * Every figure, table and token of the page.
 * @param {ReturnType<typeof runStudy>} results
 * @param {{ params?: object, ms: number, computedAt: string, cacheKey: string }} meta
 * @returns {{ html: Record<string, string>, tokens: Record<string, string> }}
 */
export function buildFigures(results, { params = PARAMS, ms: elapsed, computedAt, cacheKey }) {
  const html = {};
  const tokens = {};
  const token = (k, value) => {
    tokens[k] = String(value);
  };
  const { integration: int_, cdf } = results;
  const width = params.buildWidth;

  html.functions = functionsTable();
  html.partitions = partitions();
  html.errorTable = errorTable(int_);
  html.convergence = convergence(int_, params);
  html.rateTable = rateTable(int_);
  html.costTable = costTable(int_, params);
  html.pathological = pathological(int_, params.convergencePanel);
  html.thomaeTable = thomaeTable(int_);
  html.levelTable = levelTable(int_);
  html.webTable = webTable(cdf);
  html.accuracyTable = accuracyTable(cdf);
  html.quadrature = quadrature(cdf, params);
  html.profile = swap((w, i) => profile(cdf, w, i), { id: 'fig-profile', width });
  html.cdfCostTable = cdfCostTable(cdf, params);
  html.parameters = renderParametersTable([
    ['Master seed', String(params.seed), 'The sampled preimages of Table 4, one stream per function (deriveSeed)'],
    ['n = N', `${int(10 ** params.integration.grid.from)} to ${int(10 ** params.integration.grid.to)}`, `${int_.grid.length} values, four to the decade, rounded to odd, Figure 2 and Table 3`],
    ['Table 2', `n = N = ${int(params.integration.tableN)}`, 'An odd n, so that the jump at ½ lies inside a subinterval'],
    ['Table 4', `n = N = ${count(params.integration.timingN)}`, 'Best of three runs of each sum, on the machine that built the page'],
    ['Sampled preimages', `${count(params.integration.sampled.points)} points, ${int(params.integration.sampled.levels)} levels`, 'Lebesgue sum with the measure of each preimage estimated by counting'],
    ['Pathological n', params.integration.pathological.grid.map(int).join(', '), 'Dirichlet and Thomae sums, Figure 3 and Table 5'],
    ['Panels', `${params.cdf.trapezoidPanels}`, 'Trapezoid and Simpson rules of Table 8'],
    ['Cutoff', `|x| < ${HYBRID_CUTOFF}`, 'Where the hybrid method leaves the Maclaurin series for the continued fraction'],
    ['Tolerance', sci(params.cdf.cost.tolerance, 1), 'Absolute error of Φ(x) of Table 9'],
    ['Profile', `x = 0.25 to 10 in steps of 0.25`, 'Figure 5, 40 points per method'],
    ['Reference', '80 decimal digits', 'The Maclaurin series in BigInt arithmetic at the exact binary value of x'],
  ]);

  /* Parameters and provenance (Appendix). */
  token('params.seed', params.seed);
  token('params.tableN', int(params.integration.tableN));
  token('params.timingN', count(params.integration.timingN));
  token('params.gridFrom', int(10 ** params.integration.grid.from));
  token('params.gridTo', int(10 ** params.integration.grid.to));
  token('params.gridCount', int_.grid.length);
  token('params.sampledPoints', count(params.integration.sampled.points));
  token('params.sampledLevels', int(params.integration.sampled.levels));
  token('params.cutoff', HYBRID_CUTOFF);
  token('params.trapezoidPanels', params.cdf.trapezoidPanels);
  token('params.simpsonPanels', params.cdf.simpsonPanels);
  token('params.tolerance', sci(params.cdf.cost.tolerance, 1));
  token('params.computeSeconds', fmt(elapsed / 1000, 1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);

  /* Exercise 1. */
  for (const f of int_.functions) {
    const fn = functionByKey(f.key);
    const t = f.table;
    token(`int.${f.key}.exact`, fn.exactText);
    token(`int.${f.key}.left`, errorText(t.left - fn.exact));
    token(`int.${f.key}.mid`, errorText(t.mid - fn.exact));
    token(`int.${f.key}.right`, errorText(t.right - fn.exact));
    token(`int.${f.key}.lebesgue`, errorText(t.lebesgue - fn.exact));
    token(`int.${f.key}.lebesgueValue`, fmt(t.lebesgue, 6));
    token(`int.${f.key}.step`, sig(t.lebesgueStep, 3));
    for (const k of ['left', 'mid', 'right', 'lebesgue']) token(`rate.${f.key}.${k}`, rateCell(f.rates[k]));
    token(`time.${f.key}.riemann`, ms(f.timing.riemannMs));
    token(`time.${f.key}.lebesgue`, ms(f.timing.lebesgueMs));
    token(`time.${f.key}.ratio`, fmt(f.timing.lebesgueMs / f.timing.riemannMs, 0));
    token(`sampled.${f.key}`, errorText(f.sampledError));
  }
  for (const key of ['sin', 'sinc', 'square']) {
    const f = int_.functions.find((g) => g.key === key);
    token(`ratio.${key}`, int(Math.abs(f.table.lebesgue - functionByKey(key).exact) / Math.abs(f.table.mid - functionByKey(key).exact)));
  }
  token('bisections', int((params.integration.tableN + 1) * 60));
  token('seed.sampled', int_.seeds.sampled);

  const alternating = int_.dirichlet.at(-1).alternating;
  token('dir.alternating', fmt(alternating, 2));
  for (const t of int_.thomae) {
    token(`thomae.n${t.n}.tags`, sci(t.rational, 3));
    token(`thomae.n${t.n}.upper`, sci(t.upper, 3));
  }
  const upperFit = fitRate(int_.thomae.map((t) => t.n), int_.thomae.map((t) => t.upper), { from: 20 });
  token('thomae.slope', fmt(upperFit.slope, 2));
  for (const l of int_.thomaeLevels) token(`level.m${l.m}`, int(l.count));

  /* Exercise 2. */
  const diffs = cdf.web.map((w) => Math.abs(w.mine - w.erf));
  const erfcDiffs = cdf.web.map((w) => Math.abs(w.mineErfc - w.erfc));
  const referenceDiffs = cdf.web.map((w) => Math.abs(w.exactErf - w.erf));
  token('web.maxDiff', sci(Math.max(...diffs), 1));
  token('web.maxDiffErfc', sci(Math.max(...erfcDiffs), 1));
  token('web.maxReference', sci(Math.max(...referenceDiffs), 1));
  token('web.maxHere', sci(Math.max(...cdf.web.map((w) => Math.abs(w.mine - w.exactErf))), 1));
  token('web.bound', sci(5e-10, 1));
  token('web.count', cdf.web.length);
  token('web.worstZ', fmt(cdf.web[diffs.indexOf(Math.max(...diffs))].z, 1));
  for (const a of cdf.accuracy) {
    for (const [k] of ACCURACY_COLUMNS) token(`acc.x${point(a.x)}.${k}`, a[k].relative === 0 ? '0' : sci(a[k].relative, 1));
  }
  for (const c of cdf.convergence) {
    const slope = (list) => fitRate(c.panels, list, { from: 4, floor: 1e-13 }).slope;
    token(`quad.x${point(c.x)}.trapezoidSlope`, fmt(slope(c.trapezoid), 2));
    token(`quad.x${point(c.x)}.simpsonSlope`, fmt(slope(c.simpson), 2));
    const floorAt = c.panels.find((n, i) => c.simpson[i] < 1e-15);
    token(`quad.x${point(c.x)}.floorAt`, floorAt ? int(floorAt) : 'not reached');
  }
  const maxOf = (key) => Math.max(...cdf.profile.find((p) => p.key === key).points.map((q) => q.y));
  const lostAt = (key) => cdf.profile.find((p) => p.key === key).points.find((q) => q.y >= 1)?.x;
  token('profile.hybridMax', sci(maxOf('hybrid'), 1));
  token('profile.cfMax', sci(maxOf('cf'), 1));
  token('profile.approximationMax', sci(maxOf('approximation'), 1));
  token('profile.recipesMax', sci(maxOf('recipes'), 1));
  token('profile.maclaurinLost', lostAt('maclaurin') ?? 'beyond 10');
  token('profile.erfTaylorLost', lostAt('erfTaylor') ?? 'beyond 10');
  const firstBad = (key, bound) => cdf.profile.find((p) => p.key === key).points.find((q) => q.y > bound)?.x ?? 'beyond 10';
  token('profile.maclaurinTen', firstBad('maclaurin', 1e-10));
  token('profile.erfTaylorTen', firstBad('erfTaylor', 1e-10));
  for (const c of cdf.cost) {
    const k = `cost.x${point(c.x)}`;
    token(`${k}.trapezoid`, c.trapezoid === null ? 'more than 2 097 152' : int(c.trapezoid));
    token(`${k}.simpson`, c.simpson === null ? 'more than 2 097 152' : int(c.simpson));
    token(`${k}.maclaurin`, int(c.maclaurin.cost));
    token(`${k}.erfTaylor`, int(c.erfTaylor.cost));
    token(`${k}.cf`, int(c.continuedFraction.cost));
    token(`${k}.hybrid`, int(c.hybrid.cost));
    token(`${k}.approximation`, sci(c.approximation.error, 1));
    token(`${k}.erfTaylorError`, sci(c.erfTaylor.error, 1));
  }
  for (const [k, v] of Object.entries(cdf.timing)) if (k !== 'n') token(`ns.${k}`, v < 1000 ? fmt(v, 0) : int(v));
  token('ns.referenceMicro', fmt(cdf.timing.reference / 1000, 0));
  token('ns.ratio', fmt(cdf.timing.reference / cdf.timing.hybrid, 0));
  return { html, tokens };
}

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { key: cacheKey, results, ms: elapsed, computedAt } = loadOrCompute(root);
  return buildFigures(results, { params: PARAMS, ms: elapsed, computedAt, cacheKey });
}

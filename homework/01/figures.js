/**
 * Build-time figure provider of homework 01 (called by src/build/site-plugin.js).
 *
 * Runs the study of src/lib/kg-study.js (runStudy: experiments E1–E8 on the
 * curves y² = x³ + 7 over F₁₇, F₁₀₃₁, F₁₀₅₁ and F₁₆₄₇₇, enumerated
 * exhaustively, and on a seeded sample of secp256k1 keys with Keccak-256 of
 * the same keys as the hash baseline), renders every figure and table of the
 * page and returns them with the values quoted in the text as {{fig.…}}
 * tokens. The study is cached under node_modules/.cache/hw01/<key>.json, the
 * key being a hash of PARAMS, of the source of every module listed in
 * DEPENDENCIES and of this file, so that a dev reload is instant and any
 * change to the code recomputes everything; the rendering is redone on every
 * build from the cached JSON (the same JSON in both cases, so the nulls left
 * by JSON for an infinite z or an undefined p-value are always the ones the
 * renderers see).
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/01/index.html)
 *   groupLaw        Fig. 1, chord-and-tangent rule over the reals (static SVG, mounted by group-law.js)
 *   toyCurve        Fig. 2, the lattice of E(F₁₇) with the orbit of G = (1, 5)
 *   toyPoints       Table 1, the points of E(F₁₇) grouped by order
 *   stepTable       Table 2, the computation of 2G … 6G (KaTeX)
 *   programStatic   Listing 1, the printed output of the program for k = 6
 *   dblAddTrace     Table 3, double-and-add for k = 6
 *   dblAddCost      Fig. 3, E8 (chart figure, series 'all')
 *   programSource   the escaped source of public/homework/01/toy-ecc.html
 *   slowMo          Fig. 4, static fallback of the slowed-down view (last step 5G + G)
 *   ladder          Table 4, the curves of the study
 *   coordHist       Fig. 5, E1 (series T17g, S1031, O1051, O16477, secp256k1, keccak)
 *   occupancy       Fig. 6, E2 (series S1031, O1051, O16477, keccakO1051, keccakO16477)
 *   bitFreq         Fig. 7, E3 (series T17g, O1051, O16477, secp256k1, keccak)
 *   pointCloud      Fig. 8, E4 (series 'all')
 *   sequence        Fig. 9, E5 (series 'all')
 *   correlation     Table 5, E5
 *   avalanche       Fig. 10, E6 (series O1051, O16477, secp256k1, keccak)
 *   sac             Fig. 11, E6 strict-avalanche matrices (static rasters)
 *   relatedOutputs  Table 6, E6 related outputs
 *   ecdlp           Fig. 12, E7 (series 'all')
 *
 * Tokens ({{fig.<key>}}); every value is a display string. Series keys:
 * T17 (G = (1, 5)), T17g (G = (6, 6)), S1031, O1051, O16477 (enumerations),
 * secp256k1 and keccak (samples), keccak<orbit> (Keccak-256(k) mod p).
 *   params.{seed, seedAvalanche, seedEcdlp, sampleN, sacKeys, ecdlpTargets, resampleN, computeSeconds,
 *     computedAt, cacheKey, rejected, firstKey}
 *   curve.secp256k1.{pHex, nHex, gxHex, gyHex, pMod3}
 *   ladder.<orbit>.{label, p, pMod3, groupOrder, base, n, factors, cyclic}
 *   toy.{p, a, b, G, k, Q, points, order, orderG, generator, orderGenerator, repeatedOperations,
 *     dblAddOperations, dblAddDoublings, dblAddAdditions, bits},
 *     toy.multiple.<k> (k = 1 … 9, '(x, y)' or 'O'), toy.slope.<k> (λ of the step that gives kG, k = 2 … 6)
 *   groupLaw.{result, double}
 *   coordHist.<series>.{series, provenance, population, xName, n, bins, xStatistic, xDf, xP, yStatistic, yDf, yP, c1h…c4}
 *     (series: T17, T17g, S1031, O1051, O16477, secp256k1, keccak)
 *   occupancy.<series>.{…, p, n, lambda, xStatistic, xDf, xP, xMultiplicity, xHits<m>, yStatistic, yDf, yP,
 *     yMultiplicity, yHits<m>} (series: every orbit and keccak<orbit>)
 *   bitFreq.<series>.{…, n, bits, maxAbsZExact, maxAbsZHalf, monobitP, topBit, topObserved, topExpected}
 *     (orbits) and {…, n, bits, statistic, df, p, maxAbsZ, beyondTwoSigma, expectedBeyondTwoSigma, monobitP}
 *     (secp256k1, keccak)
 *   avalanche.<series>.{…, trials, discarded, outputBits, mean, sd, expectedMean, statistic, df, p}
 *     (every orbit, secp256k1, keccak)
 *   pointCloud.<T17g|O1051|O16477>.{cells, cellsStatistic, cellsDf, cellsP, mirrored, total, drawn}
 *   sequence.T17.{period, kMax, kxR, lag1R}, sequence.O1051.{points, kxR, kyR, lag1R, mirrorR}
 *   correlation.<orbit>.{pairs, kxR, kxRho, kyR, kyRho, lag1R, lag1Rho, mirrorR, mirrorRho}
 *   correlation.secp256k1.{pairs, kxR, kxRho, kxP, kxRhoP, kyR, kyRho, kyP, kyRhoP}
 *   correlation.keccak.{pairs, kxR, kxRho, kxP, kxRhoP} (r between k/n and H(k)/2²⁵⁶)
 *   sac.<secp256k1|keccak>.{trials, cells, meanFrequency, maxAbsDeviation, maxAbsZ, statistic, df, p, beyond,
 *     expectedBeyond, discarded}
 *   relatedOutputs.<secp256k1|keccak>.{hits, trials, proportion}, relatedOutputs.secp256k1.{xorHits, xorTrials}
 *   ecdlp.{curves, targets, seed, smallestP, largestP, largestN, largestBruteMean, largestBsgsMean, largestSqrtN,
 *     bruteSlope, bsgsSlope, bruteR, bsgsR, bruteAt256, bsgsAt256, theoryBruteAt256, theoryBsgsAt256},
 *     ecdlp.smooth.<orbit>.{n, factors, largestPrime}
 *   dblAddCost.{k, bits, repeated, doublings, additions, total, result, meanRepeated256, log2Repeated256,
 *     meanDoubleAndAdd256}
 *   slowMo.{from, lambda, nu, third, result} (the printed step 5G + G: its line y = λx + ν, R′ and 6G)
 * Chart figures also expose c1h … c4 (the caption grid) and series, provenance, population per series.
 * Every p-value token <name> (xP, yP, p, monobitP, cellsP, kxP, …) also comes as <name>Eq, ready for a
 * sentence: "p = 0.252" or "p < 0.001". Occupancy also gives xPattern and yPattern in words
 * ("546 values twice, 505 never").
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { encodePng, pngDataUrl } from '../../src/lib/png.js';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { runStudy } from '../../src/lib/kg-study.js';
import {
  TOY_BASE,
  TOY_CURVE,
  TOY_PRIVATE_KEY,
  formatPoint,
  inverse,
  multiplyByDoubleAndAdd,
  multiplyByRepeatedAddition,
  orderOf,
  points as curvePoints,
  subgroup,
  addStep,
} from '../../src/lib/toy-curve.js';
import {
  DEFAULT_SERIES,
  FIGURE_SERIES,
  RESAMPLE_N,
  fmt,
  formatP,
  int,
  labelOf,
  renderChart,
  renderSeries,
  renderStatsScript,
  seriesFromStudy,
  statsOf,
} from '../../src/hw01/render.js';
import { renderLatticeSVG } from '../../src/hw01/lattice.js';
import { PRESET, construct, describe, renderGroupLawSVG } from '../../src/hw01/group-law.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 2,
  seed: 20261013, // the secp256k1 key sample; the avalanche and ECDLP seeds derive from it (deriveSeed)
  secpN: 4096, // private keys sampled on secp256k1 (E1, E3, E5, E6)
  sacKeys: 1024, // keys per strict-avalanche matrix (256 × 256 cells each)
  ecdlpTargets: 64, // random keys per curve in E7
  buildWidth: 640, // pixel width of the printed charts; the page redraws them at their true width
});

/* The cache key covers the parameters, every module the study and the figures depend on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/kg-study.js',
  'src/lib/toy-curve.js',
  'src/lib/stats.js',
  'src/lib/secp256k1.js',
  'src/lib/keccak.js',
  'src/lib/random.js',
  'src/lib/bytes.js',
  'src/lib/normal.js',
  'src/lib/charts.js',
  'src/lib/png.js',
  'src/lib/probability-plot.js',
  'src/hw01/render.js',
  'src/hw01/lattice.js',
  'src/hw01/group-law.js',
];

let memo = null;

function loadOrCompute(root) {
  const source = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + source)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw01');
  const file = resolve(dir, `${key}.json`);
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const study = runStudy({ seed: PARAMS.seed, secpN: PARAMS.secpN, sacKeys: PARAMS.sacKeys, ecdlpTargets: PARAMS.ecdlpTargets });
    const ms = performance.now() - t0;
    const text = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, study });
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    // The renderers always read the JSON form, whether it was just computed or read from the cache.
    value = JSON.parse(text);
    console.log(`[hw01] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw01/${key}.json`);
  }
  memo = { key, value };
  return value;
}

const rasterize = ({ width, height, rgba }) => pngDataUrl(encodePng({ width, height, rgba }));

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/*
 * Inline TeX rendered as the site plugin renders data-tex (the plugin's pass
 * runs before the figures are inserted). Braces are written as entities so
 * that the TeX annotation can never be read as a {{token}}.
 */
const tex = (source) =>
  `<span class="math">${katex
    .renderToString(source, { displayMode: false, throwOnError: true, output: 'htmlAndMathml' })
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')}</span>`;

/* The prime field F_p, typeset by KaTeX (the form typeface has no subscript digits). */
const field = (p) => tex(`\\mathbb{F}_{${p}}`);
/* A series named in a table: the field and, for the toy curve, its base point. */
const seriesName = (study, key) => {
  const entry = study.meta.curves.find((e) => e.bases.some((b) => b.key === key));
  const base = entry.bases.find((b) => b.key === key);
  return entry.bases.length > 1 ? `${field(entry.p)}, G = (${base.x}, ${base.y})` : field(entry.p);
};
const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const factorText = (factors) =>
  factors.length === 1 && factors[0].exponent === 1
    ? 'prime'
    : factors.map((f) => `${f.prime}${f.exponent > 1 ? String(f.exponent).replace(/\d/g, (d) => SUPER[d]) : ''}`).join('·');
const hexGroups = (decimal) => BigInt(decimal).toString(16).toUpperCase().padStart(64, '0').replace(/(.{8})(?!$)/g, '$1 ');
const name = (k) => (k === 1 ? 'G' : `${k}G`);
const pEquation = (p) => (formatP(p).startsWith('<') ? `p ${formatP(p)}` : `p = ${formatP(p)}`);
const point = (P) => formatPoint(P);

/* ---------------------------------------------------------- the toy curve */

function toyFacts() {
  const all = curvePoints(TOY_CURVE);
  const orbit = subgroup(TOY_CURVE, TOY_BASE); // G, 2G, …, 8G
  const indexOf = new Map(orbit.map((P, i) => [point(P), i + 1]));
  const order = new Map(all.map((P) => [point(P), Number(orderOf(TOY_CURVE, P))]));
  const repeated = multiplyByRepeatedAddition(TOY_CURVE, TOY_BASE, TOY_PRIVATE_KEY);
  const binary = multiplyByDoubleAndAdd(TOY_CURVE, TOY_BASE, TOY_PRIVATE_KEY);
  const generator = all.find((P) => order.get(point(P)) === all.length + 1);
  return { all, orbit, indexOf, order, repeated, binary, generator };
}

function renderToyPoints(toy) {
  const groups = new Map();
  for (const P of toy.all) {
    const n = toy.order.get(point(P));
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(P);
  }
  const rows = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([n, list]) => {
      // Points of the subgroup generated by G are listed in the order of their multiple.
      const sorted = [...list].sort((A, B) => (toy.indexOf.get(point(A)) ?? 99) - (toy.indexOf.get(point(B)) ?? 99));
      const multiples = sorted.map((P) => toy.indexOf.get(point(P))).filter(Boolean);
      return (
        `<tr><th scope="row" class="is-number">${n}</th>` +
        `<td class="data-table__points">${sorted.map(point).join(', ')}</td>` +
        `<td class="is-number">${sorted.length}</td>` +
        `<td>${multiples.length ? multiples.map(name).join(', ') : '—'}</td></tr>`
      );
    });
  rows.push(`<tr><th scope="row" class="is-number">1</th><td>O, the point at infinity</td><td class="is-number">1</td><td>9G (and 0G)</td></tr>`);
  return (
    `<table class="data-table data-table--toy">` +
    `<thead><tr><th scope="col" class="is-number">Order</th><th scope="col">Points</th><th scope="col" class="is-number">Number</th><th scope="col">As multiples of G = (1, 5)</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

/* One row of Table 2: the step that produces kG from (k − 1)G and G by the chord-and-tangent rule. */
function stepRow(record, k) {
  const p = TOY_CURVE.p;
  const { P, Q, lambda, third, result } = record;
  const [x1, y1, x2, y2] = [P.x, P.y, Q.x, Q.y];
  const doubling = record.kind === 'double';
  const num = doubling ? 3n * x1 * x1 : y2 - y1;
  const den = doubling ? 2n * y1 : x2 - x1;
  const red = (v) => ((v % p) + p) % p;
  const [a, b] = [red(num), red(den)];
  const inv = inverse(TOY_CURVE, b);
  const slope = doubling
    ? `\\lambda = \\dfrac{3x_1^2}{2y_1} = \\dfrac{3 \\cdot ${x1}^2}{2 \\cdot ${y1}}`
    : `\\lambda = \\dfrac{y_2 - y_1}{x_2 - x_1} = \\dfrac{${y2} - ${y1}}{${x2} - ${x1}}`;
  const reduction = b === 1n ? `\\equiv ${a}` : `\\equiv ${a} \\cdot ${b}^{-1} \\equiv ${a} \\cdot ${inv}`;
  const neg = (v) => (v < 0n ? `(${v})` : `${v}`);
  const xRaw = lambda * lambda - x1 - x2;
  const yRaw = lambda * (x1 - third.x) - y1;
  const xCell = `${lambda}^2 - ${x1} - ${x2} = ${xRaw}${xRaw === third.x ? '' : ` \\equiv ${third.x}`}`;
  const yCell = `${lambda}\\,(${x1} - ${neg(third.x)}) - ${y1} = ${yRaw}${yRaw === result.y ? '' : ` \\equiv ${result.y}`}`;
  const op = doubling ? `${name(k)} = G + G` : `${name(k)} = ${name(k - 1)} + G`;
  return (
    `<tr><th scope="row">${tex(op)}</th>` +
    `<td>${tex(`${slope} ${reduction}`)}</td>` +
    `<td class="is-number">${tex(String(lambda))}</td>` +
    `<td>${tex(xCell)}</td>` +
    `<td>${tex(yCell)}</td>` +
    `<td class="is-number">${tex(`(${result.x}, ${result.y})`)}</td></tr>`
  );
}

function renderStepTable(toy) {
  const rows = toy.repeated.steps.map((record, i) => stepRow(record, i + 2));
  return (
    `<table class="data-table data-table--math data-table--steps">` +
    `<thead><tr><th scope="col">Step</th><th scope="col">Slope of the line</th><th scope="col" class="is-number">${tex('\\lambda')}</th>` +
    `<th scope="col">${tex('x_3 = \\lambda^2 - x_1 - x_2')}</th><th scope="col">${tex('y_3 = \\lambda(x_1 - x_3) - y_1')}</th><th scope="col" class="is-number">Result</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

/* The output of the program for the assignment (the lines printed by toy-ecc.html). */
function programLines(toy) {
  const multiples = [TOY_BASE, ...toy.repeated.steps.map((s) => s.result)];
  const lines = multiples.map((P, i) => `${name(i + 1)} = ${point(P)}`);
  const k = Number(TOY_PRIVATE_KEY);
  return { lines, last: `TOY PUBLIC KEY: Q = ${name(k)} = ${point(toy.repeated.result)}` };
}

function renderDblAddTrace(toy) {
  const { bits, steps } = toy.binary;
  const bin = (k) => k.toString(2);
  const rows = [
    `<tr><td class="is-number">1</td><td class="is-number">1</td><td>Load G (leading bit)</td><td>${name(1)}</td><td class="is-number">${bin(1)}</td><td class="is-number">${point(TOY_BASE)}</td></tr>`,
  ];
  for (const s of steps) {
    const k = Number(s.index);
    rows.push(
      `<tr><td class="is-number">${s.bitIndex + 1}</td><td class="is-number">${s.bit}</td><td>${s.op === 'double' ? 'Double' : 'Add G'}</td>` +
        `<td>${name(k)}</td><td class="is-number">${bin(k)}</td><td class="is-number">${point(s.record.result)}</td></tr>`,
    );
  }
  return (
    `<table class="data-table data-table--trace" data-bits="${bits}">` +
    `<thead><tr><th scope="col" class="is-number">Bit read</th><th scope="col" class="is-number">Value</th><th scope="col">Operation</th>` +
    `<th scope="col">Accumulator</th><th scope="col" class="is-number">Index in binary</th><th scope="col" class="is-number">Point</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

/* ------------------------------------------------------------- tables */

function renderLadder(study) {
  const rows = [];
  for (const entry of study.meta.curves) {
    entry.bases.forEach((base, i) => {
      const smooth = study.E7.smoothness.find((s) => s.key === base.key);
      rows.push(
        `<tr><th scope="row">${field(entry.p)}${entry.bases.length > 1 ? (i === 0 ? ', assignment' : ', generator') : ''}</th>` +
          `<td class="is-number">${int(entry.p)}</td><td class="is-number">${entry.pMod3}</td><td class="is-number">${int(entry.groupOrder)}</td>` +
          `<td class="is-number">(${base.x}, ${base.y})</td><td class="is-number">${int(base.n)}</td>` +
          `<td class="is-number">${factorText(smooth.factors)}</td>` +
          `<td>Enumeration, k = 1 … ${int(base.n - 1)}</td></tr>`,
      );
    });
  }
  const pMod3 = (BigInt(study.meta.secp256k1.p) % 3n).toString();
  rows.push(
    `<tr><th scope="row">secp256k1</th><td class="is-number">${tex('2^{256} - 2^{32} - 977')}</td><td class="is-number">${pMod3}</td>` +
      `<td class="is-number">${tex('n \\approx 1.16 \\times 10^{77}')}</td><td class="is-number">G of SEC 2</td><td class="is-number">${tex('n')}</td><td class="is-number">prime</td>` +
      `<td>Sample, N = ${int(study.meta.sizes.secpN)}</td></tr>`,
    `<tr><th scope="row">Keccak-256</th><td class="is-number">—</td><td class="is-number">—</td><td class="is-number">—</td><td class="is-number">—</td>` +
      `<td class="is-number">—</td><td class="is-number">—</td><td>The same ${int(study.meta.sizes.secpN)} keys, hashed</td></tr>`,
  );
  return (
    `<table class="data-table data-table--compact data-table--math data-table--ladder">` +
    `<thead><tr><th scope="col">Curve</th><th scope="col" class="is-number">${tex('p')}</th><th scope="col" class="is-number">${tex('p \\bmod 3')}</th>` +
    `<th scope="col" class="is-number">${tex('\\#E')}</th><th scope="col" class="is-number">Base point ${tex('G')}</th><th scope="col" class="is-number">Order ${tex('n')} of ${tex('G')}</th>` +
    `<th scope="col" class="is-number">${tex('n')} factorised</th><th scope="col">Data</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

function correlationCells(c, { withP }) {
  const cell = (pair, coefficient) => {
    if (!pair) return '<td class="is-number">—</td>';
    const value = fmt(pair[coefficient], 3);
    const p = coefficient === 'r' ? pair.pValueR : pair.pValueRho;
    return `<td class="is-number">${value}${withP ? `<span class="data-table__p">p = ${formatP(p)}</span>` : ''}</td>`;
  };
  return ['kx', 'ky', 'lag1', 'mirror'].map((k) => cell(c[k], 'r') + cell(c[k], 'rho')).join('');
}

function renderCorrelation(study) {
  const rows = [];
  for (const entry of study.meta.curves) {
    for (const base of entry.bases) {
      const c = study.E5[base.key];
      rows.push(
        `<tr><th scope="row">${seriesName(study, base.key)}</th><td>Exact: all ${int(c.kx.pairs)} multiples</td>${correlationCells(c, { withP: false })}</tr>`,
      );
    }
  }
  const N = int(study.meta.sizes.secpN);
  rows.push(
    `<tr><th scope="row">secp256k1</th><td>Sample of ${N} keys; ${tex('k/n')} against ${tex('x/p')} and ${tex('y/p')}</td>${correlationCells(study.E5.secp256k1, { withP: true })}</tr>`,
    `<tr><th scope="row">Keccak-256</th><td>The same ${N} keys; ${tex('k/n')} against ${tex('H(k)/2^{256}')}</td>${correlationCells({ kx: study.E5.keccak.kHash }, { withP: true })}</tr>`,
  );
  const pair = (label) => `<th scope="colgroup" colspan="2" class="is-number">${label}</th>`;
  const coeffs = `<th scope="col" class="is-number">${tex('r')}</th><th scope="col" class="is-number">${tex('\\rho')}</th>`;
  return (
    `<table class="data-table data-table--compact data-table--math data-table--correlation">` +
    `<thead><tr><th scope="col" rowspan="2">Series</th><th scope="col" rowspan="2">Basis</th>` +
    `${pair(`${tex('k')} and ${tex('x')}`)}${pair(`${tex('k')} and ${tex('y')}`)}${pair(`Lag one, ${tex('x_k, x_{k+1}')}`)}${pair(`Mirror, ${tex('x_k, x_{n-k}')}`)}</tr>` +
    `<tr>${coeffs.repeat(4)}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

function renderRelatedOutputs(study) {
  const ec = study.E6.secp256k1.related;
  const h = study.E6.keccak.related;
  const share = (hits, trials) => fmt(trials ? hits / trials : NaN, 3);
  const row = (fn, rule, hits, trials) =>
    `<tr><th scope="row">${fn}</th><td>${rule}</td><td class="is-number">${int(hits)} of ${int(trials)}</td><td class="is-number">${share(hits, trials)}</td></tr>`;
  return (
    `<table class="data-table data-table--math data-table--related">` +
    `<thead><tr><th scope="col">Function</th><th scope="col">Prediction of the output after flipping bit ${tex('i')} of ${tex('k')}</th>` +
    `<th scope="col" class="is-number">Predicted exactly</th><th scope="col" class="is-number">Proportion</th></tr></thead><tbody>` +
    row(`${tex('k \\mapsto kG')}, secp256k1`, `${tex("Q' = Q + 2^i G")} or ${tex("Q' = Q - 2^i G")}, one point addition`, ec.hits, ec.trials) +
    row(`${tex('k \\mapsto x(kG)')}, control`, `${tex("x(Q') = x(Q) \\oplus m_i")}, ${tex('m_i')} learned from the first flip of bit ${tex('i')}`, ec.xorMask.hits, ec.xorMask.trials) +
    row('Keccak-256', `${tex("H(k') = H(k) \\oplus m_i")}, ${tex('m_i')} learned from the first flip of bit ${tex('i')}`, h.hits, h.trials) +
    `</tbody></table>`
  );
}

/* ------------------------------------------------------------ figures */

/* A chart figure: one series container per key (the default visible) and the statistics of every series. */
function chartFigure(kind, study, { tokenKeys = FIGURE_SERIES[kind], token }) {
  const single = FIGURE_SERIES[kind].length === 1;
  const statsBySeries = {};
  for (const key of new Set([...FIGURE_SERIES[kind], ...tokenKeys])) {
    const stats = statsOf(kind, seriesFromStudy(kind, study, key));
    if (FIGURE_SERIES[kind].includes(key)) statsBySeries[key] = stats;
    for (const [k, v] of Object.entries(stats)) token(single ? `${kind}.${k}` : `${kind}.${key}.${k}`, v);
  }
  const parts = FIGURE_SERIES[kind].map((key) =>
    renderSeries(kind, seriesFromStudy(kind, study, key), {
      id: `${kind}-${key}`,
      series: key,
      hidden: key !== DEFAULT_SERIES[kind],
      width: PARAMS.buildWidth,
    }),
  );
  return parts.join('') + renderStatsScript(statsBySeries);
}

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { key: cacheKey, study, ms, computedAt } = loadOrCompute(root);
  const html = {};
  const tokens = {};
  const token = (k, value) => {
    tokens[k] = String(value);
  };
  const orbitKeys = study.meta.curves.flatMap((e) => e.bases.map((b) => b.key));

  // Parameters and provenance (Appendix).
  token('params.seed', study.meta.seed);
  token('params.seedAvalanche', study.meta.seeds.avalanche);
  token('params.seedEcdlp', study.meta.seeds.ecdlp);
  token('params.sampleN', int(study.meta.sizes.secpN));
  token('params.sacKeys', int(study.meta.sizes.sacKeys));
  token('params.ecdlpTargets', int(study.meta.sizes.ecdlpTargets));
  token('params.resampleN', int(RESAMPLE_N));
  token('params.rejected', int(study.meta.keys.rejected));
  token('params.firstKey', study.meta.keys.first[0]);
  token('params.computeSeconds', (ms / 1000).toFixed(1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);
  token('curve.secp256k1.pHex', hexGroups(study.meta.secp256k1.p));
  token('curve.secp256k1.nHex', hexGroups(study.meta.secp256k1.n));
  token('curve.secp256k1.gxHex', hexGroups(study.meta.secp256k1.G.x));
  token('curve.secp256k1.gyHex', hexGroups(study.meta.secp256k1.G.y));
  token('curve.secp256k1.pMod3', (BigInt(study.meta.secp256k1.p) % 3n).toString());
  for (const entry of study.meta.curves) {
    for (const base of entry.bases) {
      const smooth = study.E7.smoothness.find((s) => s.key === base.key);
      token(`ladder.${base.key}.label`, labelOf(base.key));
      token(`ladder.${base.key}.p`, int(entry.p));
      token(`ladder.${base.key}.pMod3`, entry.pMod3);
      token(`ladder.${base.key}.groupOrder`, int(entry.groupOrder));
      token(`ladder.${base.key}.base`, `(${base.x}, ${base.y})`);
      token(`ladder.${base.key}.n`, int(base.n));
      token(`ladder.${base.key}.factors`, factorText(smooth.factors));
      token(`ladder.${base.key}.cyclic`, entry.cyclic ? 'cyclic' : 'not cyclic');
      token(`ecdlp.smooth.${base.key}.n`, int(smooth.n));
      token(`ecdlp.smooth.${base.key}.factors`, factorText(smooth.factors));
      token(`ecdlp.smooth.${base.key}.largestPrime`, int(smooth.largestPrime));
    }
  }

  // §2.1, Fig. 1: the group law over the reals, unchanged.
  html.groupLaw = renderGroupLawSVG({ ...PRESET, mode: 'add', id: 'gl' });
  token('groupLaw.result', describe(construct({ ...PRESET, mode: 'add' })));
  token('groupLaw.double', describe(construct({ P: PRESET.P, Q: PRESET.Q, mode: 'double' })));

  // §3: the toy curve, the program and its two methods.
  const toy = toyFacts();
  const k = Number(TOY_PRIVATE_KEY);
  const Q = toy.repeated.result;
  token('toy.p', String(TOY_CURVE.p));
  token('toy.a', String(TOY_CURVE.a));
  token('toy.b', String(TOY_CURVE.b));
  token('toy.G', point(TOY_BASE));
  token('toy.k', String(k));
  token('toy.Q', point(Q));
  token('toy.points', String(toy.all.length));
  token('toy.order', String(toy.all.length + 1));
  token('toy.orderG', String(toy.orbit.length + 1));
  token('toy.generator', point(toy.generator));
  token('toy.orderGenerator', String(toy.all.length + 1));
  toy.orbit.forEach((P, i) => token(`toy.multiple.${i + 1}`, point(P)));
  token(`toy.multiple.${toy.orbit.length + 1}`, 'O');
  toy.repeated.steps.forEach((s, i) => token(`toy.slope.${i + 2}`, String(s.lambda)));
  token('toy.repeatedOperations', String(toy.repeated.steps.length));
  token('toy.bits', toy.binary.bits);
  token('toy.dblAddOperations', String(toy.binary.steps.length));
  token('toy.dblAddDoublings', String(toy.binary.steps.filter((s) => s.op === 'double').length));
  token('toy.dblAddAdditions', String(toy.binary.steps.filter((s) => s.op === 'add').length));

  html.toyCurve = renderLatticeSVG({
    p: TOY_CURVE.p,
    points: toy.all,
    orbit: toy.orbit,
    highlight: Q,
    infinity: { label: `${toy.orbit.length + 1}G` },
    id: 'toy-curve',
    title: 'The 17 affine points of y² = x³ + 7 over F₁₇ and the multiples of G = (1, 5)',
    desc: `Rings are the points of the curve, filled marks the multiples G, 2G, …, 8G of G = (1, 5), each labelled, and the red disc is the toy public key Q = 6G = ${point(Q)}. The dashed line y = 17/2 is the axis of the symmetry between a point and its negative; the boxed O beside the plot is the point at infinity, 9G.`,
  });
  html.toyPoints = renderToyPoints(toy);
  html.stepTable = renderStepTable(toy);
  const program = programLines(toy);
  html.programStatic = `${program.lines.map(escapeHtml).join('\n')}\n\n<strong>${escapeHtml(program.last)}</strong>`;
  html.dblAddTrace = renderDblAddTrace(toy);
  html.programSource = escapeHtml(readFileSync(resolve(root, 'public/homework/01/toy-ecc.html'), 'utf8').trimEnd())
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');

  // §4: the static view of the slowed-down construction, the last step 5G + G = 6G.
  const last = addStep(TOY_CURVE, toy.orbit[4], TOY_BASE);
  html.slowMo = renderLatticeSVG({
    p: TOY_CURVE.p,
    points: toy.all,
    orbit: toy.orbit,
    line: { lambda: last.lambda, nu: last.nu },
    third: last.third,
    result: last.result,
    infinity: { label: `${toy.orbit.length + 1}G` },
    id: 'slowmo-static',
    title: 'The last step of the computation of Q = 6G on the lattice of E(F₁₇): 5G + G',
    desc: `The line through 5G = ${point(toy.orbit[4])} and G = ${point(TOY_BASE)} has slope λ = ${last.lambda} modulo 17 and appears on the sheet as parallel segments through its 17 lattice points; it meets the curve a third time at R′ = ${point(last.third)}, whose reflection across y = 17/2 is the result 6G = ${point(last.result)}.`,
  });
  token('slowMo.from', point(toy.orbit[4]));
  token('slowMo.lambda', String(last.lambda));
  token('slowMo.nu', String(last.nu));
  token('slowMo.third', point(last.third));
  token('slowMo.result', point(last.result));

  // §5: the statistical exploration.
  html.ladder = renderLadder(study);
  html.coordHist = chartFigure('coordHist', study, { tokenKeys: [...orbitKeys, 'secp256k1', 'keccak'], token });
  html.occupancy = chartFigure('occupancy', study, { tokenKeys: [...orbitKeys, ...orbitKeys.map((o) => `keccak${o}`)], token });
  html.bitFreq = chartFigure('bitFreq', study, { tokenKeys: [...orbitKeys, 'secp256k1', 'keccak'], token });
  html.pointCloud = chartFigure('pointCloud', study, { token });
  html.sequence = chartFigure('sequence', study, { token });
  html.avalanche = chartFigure('avalanche', study, { tokenKeys: [...orbitKeys, 'secp256k1', 'keccak'], token });
  html.ecdlp = chartFigure('ecdlp', study, { token });
  html.dblAddCost = chartFigure('dblAddCost', study, { token });

  const sac = seriesFromStudy('sac', study, 'all');
  html.sac = renderChart('sac', sac, { id: 'sac', rasterize });
  for (const [k2, v] of Object.entries(statsOf('sac', sac))) token(`sac.${k2}`, v);

  html.correlation = renderCorrelation(study);
  const corr = (key, c) => {
    for (const pair of ['kx', 'ky', 'lag1', 'mirror']) {
      if (!c[pair]) continue;
      token(`correlation.${key}.${pair}R`, fmt(c[pair].r, 3));
      token(`correlation.${key}.${pair}Rho`, fmt(c[pair].rho, 3));
      if (key === 'secp256k1' || key === 'keccak') {
        token(`correlation.${key}.${pair}P`, formatP(c[pair].pValueR));
        token(`correlation.${key}.${pair}RhoP`, formatP(c[pair].pValueRho));
        token(`correlation.${key}.${pair}PEq`, pEquation(c[pair].pValueR));
        token(`correlation.${key}.${pair}RhoPEq`, pEquation(c[pair].pValueRho));
      }
    }
    token(`correlation.${key}.pairs`, int(c.kx.pairs));
  };
  for (const o of orbitKeys) corr(o, study.E5[o]);
  corr('secp256k1', study.E5.secp256k1);
  corr('keccak', { kx: study.E5.keccak.kHash });

  html.relatedOutputs = renderRelatedOutputs(study);
  const ec = study.E6.secp256k1.related;
  const hk = study.E6.keccak.related;
  token('relatedOutputs.secp256k1.hits', int(ec.hits));
  token('relatedOutputs.secp256k1.trials', int(ec.trials));
  token('relatedOutputs.secp256k1.proportion', fmt(ec.hits / ec.trials, 3));
  token('relatedOutputs.secp256k1.xorHits', int(ec.xorMask.hits));
  token('relatedOutputs.secp256k1.xorTrials', int(ec.xorMask.trials));
  token('relatedOutputs.keccak.hits', int(hk.hits));
  token('relatedOutputs.keccak.trials', int(hk.trials));
  token('relatedOutputs.keccak.proportion', fmt(hk.hits / hk.trials, 3));

  return { html, tokens };
}

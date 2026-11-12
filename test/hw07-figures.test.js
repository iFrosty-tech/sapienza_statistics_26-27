/**
 * The figure provider and the page of homework 07: every @figure marker and every {{fig.…}} token of
 * homework/07/index.html is provided, the live panels keep their mount contract, the assignment is quoted
 * verbatim, the numbers the text quotes follow from the study and every citation resolves. The provider runs
 * on the full parameters with a smaller grid and fewer timing calls, which changes the values but not the keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, buildFigures } from '../homework/07/figures.js';
import { runStudy } from '../src/lib/hw07-study.js';
import { applyFigureMarkers } from '../src/build/site-plugin.js';
import homeworks from '../src/data/homeworks.js';

const params = {
  ...PARAMS,
  integration: { ...PARAMS.integration, grid: { from: 1, to: 3 }, timingN: 20000, sampled: { levels: 200, points: 20000 } },
  cdf: { ...PARAMS.cdf, timing: { ...PARAMS.cdf.timing, calls: 2000 } },
};
const results = runStudy(params);
const meta = { params, ms: 1234, computedAt: '2026-11-12T12:00:00.000Z', cacheKey: '0123456789abcdef' };
const { html, tokens } = buildFigures(results, meta);
const page = readFileSync(new URL('../homework/07/index.html', import.meta.url), 'utf8');
const tagless = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the homework is registered at number 7 with the labels of homework 5', () => {
  const entry = homeworks.find((h) => h.number === 7);
  assert.equal(entry.label, 'Homework 5');
  assert.equal(entry.shortLabel, '5');
  assert.equal(entry.status, 'published');
});

test('every @figure marker of the page is provided as html', () => {
  const ids = [...page.matchAll(/<!--\s*@figure\s+id=(\S+)\s*-->/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14, `found ${ids.length} figure markers`);
  assert.equal(new Set(ids).size, ids.length, 'figure ids are unique');
  for (const id of ids) {
    assert.equal(typeof html[id], 'string', `figure ${id}`);
    assert.ok(html[id].length > 100, `figure ${id} is not empty`);
  }
});

test('every {{fig.…}} token of the page is provided as a string', () => {
  const keys = [...new Set([...page.matchAll(/\{\{\s*fig\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 60, `found ${keys.length} tokens`);
  const missing = keys.filter((k) => typeof tokens[k] !== 'string');
  assert.deepEqual(missing, []);
});

test('provider output carries no undefined values and keeps every SVG id unique', () => {
  const all = Object.values(html).join('');
  assert.doesNotMatch(all, /NaN|undefined|Infinity/);
  for (const [k, v] of Object.entries(tokens)) assert.doesNotMatch(v, /NaN|undefined|Infinity/, k);
  const ids = [...all.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, []);
});

test('the provider is deterministic for the same results', () => {
  const again = buildFigures(results, meta);
  assert.deepEqual(again.tokens, tokens);
  assert.deepEqual(again.html, html);
});

test('the tokens quote the study, not typed values', () => {
  const sin = results.integration.functions.find((f) => f.key === 'sin');
  assert.equal(tokens['int.sin.exact'], '2');
  assert.equal(tokens['rate.step.lebesgue'], 'exact');
  assert.equal(tokens['rate.inverseRoot.left'], 'diverges');
  assert.equal(tokens['int.sin.lebesgueValue'], sin.table.lebesgue.toFixed(6));
  assert.equal(tokens['level.m5'], '11');
  assert.equal(tokens['web.count'], String(results.cdf.web.length));
  assert.equal(tokens['params.tableN'], '1,001');
});

test('what the text claims about the study holds in the study', () => {
  const fn = (key) => results.integration.functions.find((f) => f.key === key);
  // The Lebesgue sum of a step function is exact, and every Riemann sum of it is off by about 1/n.
  for (const key of ['step', 'indicator']) {
    assert.ok(Math.max(...fn(key).lebesgue.map(Math.abs)) < 1e-12, key);
    assert.ok(Math.abs(fn(key).rates.mid.slope - 1) < 0.1, `${key} midpoint exponent`);
  }
  // Midpoint is second order on smooth functions, Lebesgue first order.
  for (const key of ['square', 'sinc']) assert.ok(Math.abs(fn(key).rates.mid.slope - 2) < 0.1, key);
  for (const key of ['sin', 'square', 'abs', 'sinc']) assert.ok(Math.abs(fn(key).rates.lebesgue.slope - 1) < 0.1, key);
  // The left sum of 1/√x is infinite at every n.
  assert.ok(fn('inverseRoot').left.every((v) => v === Infinity));
  // Left and right sums of sin x and |x − ½| coincide with the trapezoid rule: second order.
  for (const key of ['sin', 'abs']) assert.ok(Math.abs(fn(key).rates.left.slope - 2) < 0.1, key);
  // The table of the web is matched to its rounding, and the hybrid method has a tail error near the roundoff.
  assert.ok(Number(tokens['web.maxDiff'].replace(/ × 10⁻/, 'e-').replace(/[^\de.-]/g, '')) <= 5.0001e-10 || /10⁻¹⁰/.test(tokens['web.maxDiff']));
  const hybridMax = Math.max(...results.cdf.profile.find((p) => p.key === 'hybrid').points.map((p) => p.y));
  assert.ok(hybridMax < 1e-13);
  // Quadrature orders at x = 1.
  const c = results.cdf.convergence[0];
  assert.ok(c.trapezoid[0] > c.trapezoid.at(-1) && c.simpson[0] > c.simpson[5]);
  assert.ok(Number(tokens['quad.x1.trapezoidSlope']) > 1.9 && Number(tokens['quad.x1.trapezoidSlope']) < 2.1);
});

test('the page quotes the assignment of both exercises verbatim', () => {
  const quote = /<blockquote class="assignment">([\s\S]*?)<\/blockquote>/.exec(page)?.[1] ?? '';
  const text = tagless(quote);
  for (const sentence of [
    'Es 1 – Riemann and Lebesgue Integration',
    'Choose a collection of interesting functions f1, f2, ... and compute their integrals numerically.',
    'Approximate the integrals using approaches inspired by both the Riemann definition (partitioning the domain into subintervals)',
    'and the Lebesgue definition (partitioning the range of function values into measurable subsets and considering their preimages in the domain).',
    'Compare the two numerical approaches in terms of accuracy, convergence, and computational efficiency.',
    'For functions that are Riemann-integrable, compare the numerical results and discuss whether the two approaches converge to the same value.',
    'Include examples of functions for which the two approaches behave differently, if possible.',
    'f(x) = 1 / sqrt(x), x in (0, 1]',
    "f(x) = 1/q if x = p/q in lowest terms, 0 if x is irrational, x in [0, 1] (Thomae's function)",
    'Es 2 – Numerical Computation of the Normal CDF',
    'Develop an efficient numerical method to compute the cumulative distribution function (CDF) of the standard normal distribution.',
    'Implement the method and evaluate the CDF at several points, comparing the results with a trusted numerical reference found on the web.',
    'Investigate the numerical efficiency and accuracy of your implementation.',
    "Explain why the normal CDF cannot be expressed in terms of elementary functions, discussing the mathematical result behind this fact (Liouville's theorem).",
    'Explain how the introduction of special functions, such as the error function (erf), provides an exact analytical representation of the CDF',
    'and why numerical methods are still necessary for its practical computation.',
    'Explore possible numerical approaches, such as numerical integration, series expansions, or approximations based on the error function.',
    "- Numerical integration: using the trapezoidal rule or Simpson's rule.",
    '- Series expansion: using the power series expansion of the error function.',
    '- Error function (erf): using the mathematical relationship between the normal CDF and the error function.',
  ]) {
    // The assignment wraps lines; compare with the whitespace of both sides collapsed.
    assert.ok(text.replace(/\s+/g, ' ').includes(sentence.replace(/\s+/g, ' ')), sentence);
  }
});

test('the live panels keep their mount contract, with a printed fallback', () => {
  assert.match(page, /<script type="module" src="\/src\/hw07\.js"><\/script>/);
  for (const name of ['sums', 'cdf']) {
    assert.match(page, new RegExp(`<div class="demo" data-demo="${name}">\\s*<p class="demo__fallback">`), name);
  }
  assert.match(readFileSync(new URL('../src/hw07.js', import.meta.url), 'utf8'), /sums:[\s\S]*cdf:/);
});

test('every computed chart figure is labelled as computed', () => {
  const figures = [...page.matchAll(/<figure class="chart-figure[^"]*"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.ok(figures.length >= 5, `found ${figures.length} chart figures`);
  for (const f of figures) assert.match(f, /pplot__provenance">Computed</, f.match(/@figure id=(\S+)/)?.[1]);
});

test('the page has the sections of both exercises and at most ten references', () => {
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 'reproducibility', 'references']) {
    assert.match(page, new RegExp(`<section class="hw-section[^"]*" id="${s}"`), s);
    assert.match(page, new RegExp(`<a href="#${s}">`), `contents entry for ${s}`);
  }
  const refs = page.match(/<li id="ref-\d+">/g) ?? [];
  assert.ok(refs.length >= 5 && refs.length <= 10, `${refs.length} references`);
});

test('every citation resolves to a reference and every reference is cited', () => {
  const ids = [...page.matchAll(/<li id="(ref-\d+)">/g)].map((m) => m[1]);
  const cited = new Set([...page.matchAll(/href="#(ref-\d+)"/g)].map((m) => m[1]));
  assert.deepEqual([...cited].filter((id) => !ids.includes(id)), [], 'citations without an entry');
  assert.deepEqual(ids.filter((id) => !cited.has(id)), [], 'entries never cited');
});

test('the finished page has no figure marker and no token of the provider left', () => {
  const filled = applyFigureMarkers(page, html, 'homework/07/index.html').replace(/\{\{\s*fig\.([\w.]+)\s*\}\}/g, (_, key) => tokens[key] ?? '');
  assert.doesNotMatch(filled, /@figure/);
  assert.doesNotMatch(filled, /\{\{\s*fig\./);
});

test('every anchor of the text points at an element of the page', () => {
  const targets = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !targets.has(id));
  assert.deepEqual(missing, []);
});

test('every inline formula followed by punctuation is tied to it, so that the punctuation never starts a line', () => {
  const loose = [...page.matchAll(/(<span class="math-tie">)?<span data-tex>[^<]*<\/span>[,;:.!?)\]]/g)].filter((m) => !m[1]);
  assert.deepEqual(loose.map((m) => m[0]), []);
});

test('no computed value is typed in the prose: the decimals of the text come from tokens or from exact theory', () => {
  const prose = page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<blockquote class="assignment">[\s\S]*?<\/blockquote>/g, '')
    .replace(/<span data-tex>[\s\S]*?<\/span>/g, '')
    .replace(/<div data-tex-display>[\s\S]*?<\/div>/g, '')
    .replace(/<ol>[\s\S]*?<\/ol>/g, '')
    .replace(/<a [^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    // The numbers of a theorem and of a formula of the references are names, not values.
    .replace(/Thm\. [\d.]+|\b\d+\.\d+\.\d+\b/g, ' ');
  const decimals = [...prose.matchAll(/\b\d+\.\d{2,}\b/g)].map((m) => m[0]);
  assert.deepEqual(decimals, []);
});

test('every centred tick label of every chart stays inside its SVG', () => {
  const DIGIT = 6.3;
  const escapes = [];
  for (const [id, figure] of Object.entries(html)) {
    for (const svg of figure.match(/<svg[\s\S]*?<\/svg>/g) ?? []) {
      const width = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
      for (const m of svg.matchAll(/<text class="chart__xlabel" x="([\d.]+)"[^>]*text-anchor="middle">([\s\S]*?)<\/text>/g)) {
        const label = m[2].replace(/<[^>]+>/g, '');
        const half = (label.length * DIGIT) / 2;
        const x = Number(m[1]);
        if (x - half < 0 || x + half > width) escapes.push(`${id}: "${label}" at ${x} of ${width}`);
      }
    }
  }
  assert.deepEqual(escapes, []);
});

test('the profile figure carries a narrow drawing for small screens beside the printed one', () => {
  assert.match(html.profile, /class="chart-swap"/);
  const width = (svg) => Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)[1]);
  const narrow = /<div class="chart-swap__narrow">([\s\S]*)<\/div><\/div>$/.exec(html.profile)[1];
  assert.ok(width(narrow) <= 360, `narrow drawing ${width(narrow)} px`);
});

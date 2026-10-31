/**
 * The figure provider and page skeleton of homework 4, exercise 1: every
 * @figure marker and every {{fig.…}} token of homework/05/index.html is
 * provided, the code listing is the real source, the trace and the study reach
 * their known values, the assignment is quoted verbatim, every citation
 * resolves, and the live panel keeps its mount contract. The provider runs on
 * the full parameters with fewer replicates, which changes the values but not
 * the keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, buildFigures } from '../homework/05/figures.js';
import { runStabilityStudy } from '../src/lib/welford-stability.js';
import { extractListing, renderListing } from '../src/lib/welford-charts.js';

const params = { ...PARAMS, replicates: 8, scores: { ...PARAMS.scores, replicates: 8 } };
const results = runStabilityStudy(params);
const source = readFileSync(new URL('../src/lib/welford.js', import.meta.url), 'utf8');
const meta = { params, ms: 1234, computedAt: '2026-10-31T12:00:00.000Z', cacheKey: '0123456789abcdef', source };
const { html, tokens } = buildFigures(results, meta);
const page = readFileSync(new URL('../homework/05/index.html', import.meta.url), 'utf8');

test('every @figure marker of the page is provided as html', () => {
  const ids = [...page.matchAll(/<!--\s*@figure\s+id=(\S+)\s*-->/g)].map((m) => m[1]);
  assert.ok(ids.length >= 6, `found ${ids.length} figure markers`);
  assert.equal(new Set(ids).size, ids.length, 'figure ids are unique');
  for (const id of ids) {
    assert.equal(typeof html[id], 'string', `figure ${id}`);
    assert.ok(html[id].length > 100, `figure ${id} is not empty`);
  }
});

test('every {{fig.…}} token of the page is provided as a string', () => {
  const keys = [...new Set([...page.matchAll(/\{\{\s*fig\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 20, `found ${keys.length} tokens`);
  assert.deepEqual(keys.filter((k) => typeof tokens[k] !== 'string'), []);
});

test('provider output carries no undefined values and keeps every SVG id unique', () => {
  // The listing is source code, and sampleVariance is NaN below two observations.
  const { listing, ...figures } = html;
  assert.equal(typeof listing, 'string');
  const all = Object.values(figures).join('');
  assert.doesNotMatch(all, /NaN|undefined|Infinity/);
  for (const [k, v] of Object.entries(tokens)) assert.doesNotMatch(v, /NaN|undefined|Infinity/, k);
  const ids = [...all.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

test('the provider is deterministic for the same results', () => {
  const again = buildFigures(results, meta);
  assert.deepEqual(again.tokens, tokens);
  assert.deepEqual(again.html, html);
});

test('the listing is cut from the source file, with its own line numbers and its three core lines marked', () => {
  const push = extractListing(source, 'push');
  const lines = source.split('\n');
  assert.equal(lines[push.first - 1], 'export function push(state, x) {');
  assert.equal(push.lines.join('\n'), lines.slice(push.first - 1, push.first - 1 + push.lines.length).join('\n'));
  assert.equal(push.lines.at(-1), '}');
  assert.throws(() => extractListing(source, 'noSuchFunction'), /noSuchFunction/);

  const rendered = renderListing(source, ['push', 'sampleVariance']);
  assert.equal((rendered.match(/data-core="true"/g) ?? []).length, 3);
  const text = rendered.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  for (const line of ['const innovation = x - state.mean;', 'state.mean += innovation / state.k;', 'state.ss += innovation * (x - state.mean);']) {
    assert.ok(source.includes(line), `the source holds ${line}`);
    assert.ok(text.includes(line), `the listing holds ${line}`);
  }
  assert.ok(text.includes('return k < 2 ? NaN : ss / (k - 1);'));
  assert.equal(html.listing, rendered);
});

test('the trace reaches the known values of the data set 2, 4, 4, 4, 5, 5, 7, 9', () => {
  assert.equal(tokens['trace.mean'], '5');
  assert.equal(tokens['trace.ss'], '32');
  assert.equal(tokens['trace.variance'], '4.5714');
  assert.equal(tokens['trace.population'], '4');
  assert.equal(tokens['trace.n'], '8');
  assert.equal(tokens['trace.data'], '2, 4, 4, 4, 5, 5, 7, 9');
  assert.equal((html.trace.match(/<tr>/g) ?? []).length, 9, 'one row per step and a head');
  assert.match(html.trace, /<td class="is-number">32\.0000<\/td>/);
});

test('every form of the recurrence is tabulated at the last step of the trace', () => {
  assert.equal((html.forms.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) ?? []).length, 6);
  assert.equal(tokens['forms.maxDifference'], '0');
});

test('the tokens of the study follow from its results', () => {
  assert.equal(tokens['slope.textbook'], results.slopes.textbook.slope.toFixed(2));
  assert.equal(tokens['slope.welford'], results.slopes.welford.slope.toFixed(2));
  assert.equal(tokens['params.n'], '1,000');
  assert.equal(tokens['welford.negative'], '0');
  const total = results.points.reduce((s, p) => s + p.algorithms.textbook.negative, 0);
  assert.equal(tokens['textbook.negative'], String(total));
  assert.equal(tokens['params.seed'], String(PARAMS.seed));
  assert.match(tokens['scores.kappa'], /^1\.1\d$/);
  assert.equal(tokens['scores.kappaTheory'], Math.sqrt(1 + 2.25 / 7.75).toFixed(2));
});

test('a condition number always prints as a power of ten once it is large, never as a raw median such as 9999', () => {
  assert.equal(tokens['at.k4.kappa'], '1.0 × 10⁴');
  assert.equal(tokens['at.k8.kappa'], '1.0 × 10⁸');
  assert.doesNotMatch(html.errorTable, /<th scope="row">(9999|999884)<\/th>/);
  assert.match(html.errorTable, /<th scope="row">1\.0 × 10<sup>4<\/sup><\/th>/);
});

test('table heads keep the case of their symbols, and subscripted symbols are set as mathematics', () => {
  for (const id of ['trace', 'forms', 'errorTable', 'slopesTable']) assert.match(html[id], /<table class="[^"]*data-table--math/, id);
  for (const id of ['trace', 'forms']) assert.match(html[id], /class="katex"/, id);
  // The subscripts of the text face fall back to another font at table size.
  assert.doesNotMatch(html.trace.replace(/<span class="katex">[\s\S]*?<\/annotation>/g, ''), /[ₖ₋₁]/);
});

test('the lines of the listing are blocks with no newline between them, so that they are not double-spaced', () => {
  assert.doesNotMatch(renderListing(source, ['push', 'sampleVariance']), /<\/span>\n/);
});

test('the published bounds and the measured slopes are set side by side', () => {
  assert.match(html.slopesTable, /nκ²u/);
  assert.match(html.slopesTable, /nκu/);
  assert.match(html.slopesTable, /nu \+ n²κ²u²/);
  assert.ok(html.slopesTable.includes(tokens['slope.textbook']));
});

test('the error figure has a narrow drawing for small screens, each with its own ids', () => {
  assert.match(html.errors, /class="chart-swap"/);
  assert.match(html.errors, /id="fig-errors-narrow-title"/);
  const width = (svg) => Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)[1]);
  const svgs = html.errors.match(/<svg[\s\S]*?<\/svg>/g);
  assert.equal(svgs.length, 2);
  assert.equal(width(svgs[0]), PARAMS.buildWidth);
  assert.ok(width(svgs[1]) <= 360);
});

test('the assignment of exercise 1 is quoted verbatim, without its marker, and exercise 2 stays on its own page', () => {
  assert.match(page, /Ex\. 1 – Welford’s Recurrence Formulas/);
  assert.match(page, /Derive Welford’s recurrence formulas for the sum of squares \(SS\) and the variance, following the same\s+approach as Knuth’s recurrence formula for the mean\./);
  assert.match(page, /Write the corresponding code\. The core logic should require only about 3 lines\./);
  assert.doesNotMatch(page, /HMWK|📚/);
  assert.doesNotMatch(page, /Ex\. 2 – Sampling Mean and Variance/);
});

test('the page has its sections and contents, and links forward to the next exercise', () => {
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'reproducibility', 'references']) {
    assert.match(page, new RegExp(`<section class="hw-section[^"]*" id="${s}"`), s);
    assert.match(page, new RegExp(`<a href="#${s}">`), `contents entry for ${s}`);
  }
  assert.match(page, /href="\{\{base\}\}homework\/06\/"/);
  assert.match(page, /<script type="module" src="\/src\/hw05\.js"><\/script>/);
  assert.match(page, /<!-- @include partials\/homework-header\.html -->/);
  assert.match(page, /<!-- @include partials\/site-footer\.html -->/);
});

test('the stepper keeps its mount contract, with a printed fallback in place', () => {
  assert.match(page, /<div class="demo" data-demo="stepper" data-seed="\{\{fig\.params\.seed\}\}">\s*<p class="demo__fallback">/);
  const entry = readFileSync(new URL('../src/hw05.js', import.meta.url), 'utf8');
  assert.match(entry, /stepper: \(\) => import\('\.\/hw05\/stepper-demo\.js'\)/);
  assert.match(tokens['params.seed'], /^\d+$/);
});

test('the simulated figure is labelled as simulated and states its seed; the computed one is not', () => {
  const figures = [...page.matchAll(/<figure class="chart-figure[^"]*"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.ok(figures.length >= 2, `found ${figures.length} chart figures`);
  const simulated = figures.find((f) => f.includes('@figure id=errors'));
  assert.match(simulated, /pplot__provenance">Simulated</);
  assert.match(simulated, /class="pplot__seed"[^>]*>[^<]*\{\{fig\.params\.seed/);
  const computed = figures.find((f) => f.includes('@figure id=geometry'));
  assert.match(computed, /pplot__provenance">Computed</);
});

test('at most ten references, every citation resolves and every reference is cited', () => {
  const ids = [...page.matchAll(/<li id="(ref-\d+)">/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5 && ids.length <= 10, `${ids.length} references`);
  const cited = new Set([...page.matchAll(/href="#(ref-\d+)"/g)].map((m) => m[1]));
  assert.deepEqual([...cited].filter((id) => !ids.includes(id)), [], 'citations without an entry');
  assert.deepEqual(ids.filter((id) => !cited.has(id)), [], 'entries never cited');
});

test('the prose types no study result by hand: the figures of the sweep arrive through tokens', () => {
  const prose = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<span data-tex>[\s\S]*?<\/span>/g, '').replace(/<div data-tex-display>[\s\S]*?<\/div>/g, '');
  // A relative error, a percentage of replicates or a fitted slope written out as digits would be a hand-typed result.
  assert.doesNotMatch(prose, /\d\.\d+ ?[×x] ?10/);
  assert.doesNotMatch(prose, /\bslope of \d/);
});

test('every inline formula followed by punctuation is tied to it, so that the punctuation never starts a line', () => {
  const loose = [...page.matchAll(/(<span class="math-tie">)?<span data-tex>[^<]*<\/span>[,;:.!?)\]]/g)].filter((m) => !m[1]);
  assert.deepEqual(loose.map((m) => m[0]), []);
});

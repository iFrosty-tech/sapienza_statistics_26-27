/**
 * The figure provider and page skeleton of homework 04: every @figure marker
 * and every {{fig.…}} token of homework/04/index.html is provided, the live
 * panels keep their mount contract, and every simulated figure is labelled
 * as simulated with its seed. The provider is run on the full parameters
 * with fewer attackers, which changes the values but not the keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, buildFigures } from '../homework/04/figures.js';
import { runPenetrationStudy } from '../src/lib/penetration-study.js';
import { sci, sig } from '../src/lib/penetration-charts.js';

const params = { ...PARAMS, m: 1000 };
const results = runPenetrationStudy(params);
const meta = { params, ms: 1234, computedAt: '2026-10-27T12:00:00.000Z', cacheKey: '0123456789abcdef' };
const { html, tokens } = buildFigures(results, meta);
const page = readFileSync(new URL('../homework/04/index.html', import.meta.url), 'utf8');

test('every @figure marker of the page is provided as html', () => {
  const ids = [...page.matchAll(/<!--\s*@figure\s+id=(\S+)\s*-->/g)].map((m) => m[1]);
  assert.ok(ids.length >= 15, `found ${ids.length} figure markers`);
  assert.equal(new Set(ids).size, ids.length, 'figure ids are unique');
  for (const id of ids) {
    assert.equal(typeof html[id], 'string', `figure ${id}`);
    assert.ok(html[id].length > 100, `figure ${id} is not empty`);
  }
});

test('every {{fig.…}} token of the page is provided as a string', () => {
  const keys = [...new Set([...page.matchAll(/\{\{\s*fig\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 20, `found ${keys.length} tokens`);
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

test('the aggregate and large-deviation tokens follow from the study', () => {
  const t = results.aggregate.total.bernoulli;
  const perSystem = t.value / (params.m * t.n);
  assert.equal(tokens['aggregate.total.bernoulli.perSystem'], perSystem.toFixed(5));
  assert.equal(tokens['aggregate.total.bernoulli.relSd'], sci(t.sd / t.mean, 2));
  assert.equal(tokens['aggregate.total.rademacher.perSystemSd'], sci(1 / Math.sqrt(params.m * results.aggregate.total.rademacher.n), 2));
  assert.equal(tokens['best.klRate'], results.best.klRate.toFixed(4));
  // Group means of the aggregate carry thousands separators, like their theoretical values.
  assert.match(tokens['aggregate.bernoulli.m1.mean'], /^\d{1,3}(,\d{3})*\.\d$/);
  // The largest |z| of Table 1 over models, n, quantities, means and variances.
  const zs = ['bernoulli', 'rademacher'].flatMap((model) =>
    results.moments[model].flatMap((row) =>
      ['total', 'average', 'normalized'].flatMap((q) => [
        (row[q].mean - row[q].theoryMean) / row[q].seMean,
        (row[q].variance - row[q].theoryVariance) / row[q].seVariance,
      ]),
    ),
  );
  assert.equal(tokens['moments.maxAbsZ'], Math.max(...zs.map(Math.abs)).toFixed(2));
  assert.equal(tokens['moments.count'], String(zs.length));
  // Each further hundred systems multiplies the attackers needed by about e^(100·D).
  assert.equal(tokens['best.mGrowth'], sig(Math.exp(100 * results.best.klRate), 3));
});

test('the provider is deterministic for the same results', () => {
  const again = buildFigures(results, meta);
  assert.deepEqual(again.tokens, tokens);
  assert.deepEqual(again.html, html);
});

test('the live panels keep their mount contract, with plain numbers for seed and p', () => {
  assert.match(page, /<script type="module" src="\/src\/hw04\.js"><\/script>/);
  assert.match(page, /<div class="demo" data-demo="simulator" data-seed="\{\{fig\.params\.seed\}\}" data-p="\{\{fig\.params\.p\}\}">\s*<p class="demo__fallback">/);
  assert.match(page, /<div class="demo" data-demo="clt">\s*<p class="demo__fallback">/);
  assert.match(tokens['params.seed'], /^\d+$/);
  assert.equal(Number(tokens['params.seed']), PARAMS.seed);
  assert.match(tokens['params.p'], /^0\.\d+$/);
  assert.equal(Number(tokens['params.p']), PARAMS.p);
});

test('every simulated chart figure is labelled as simulated and states its seed', () => {
  const figures = [...page.matchAll(/<figure class="chart-figure[^"]*"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.ok(figures.length >= 10, `found ${figures.length} chart figures`);
  for (const f of figures) {
    const id = f.match(/@figure id=(\S+)/)?.[1];
    assert.match(f, /pplot__provenance">Simulated</, `figure ${id}`);
    assert.match(f, /class="pplot__seed"[^>]*>[^<]*\{\{fig\.params\.seed/, `figure ${id}`);
  }
});

test('the page has the sections of the assignment and at most ten references', () => {
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 'reproducibility', 'references']) {
    assert.match(page, new RegExp(`<section class="hw-section[^"]*" id="${s}"`), s);
    assert.match(page, new RegExp(`<a href="#${s}">`), `contents entry for ${s}`);
  }
  const refs = page.match(/<li id="ref-\d+">/g) ?? [];
  assert.ok(refs.length <= 10, `${refs.length} references`);
  assert.match(page, /Consider n systems and m attackers\./);
});

test('every citation resolves to a reference and every reference is cited, with no drafting notes left', () => {
  const ids = [...page.matchAll(/<li id="(ref-\d+)">/g)].map((m) => m[1]);
  assert.ok(ids.length >= 1);
  const cited = new Set([...page.matchAll(/href="#(ref-\d+)"/g)].map((m) => m[1]));
  assert.deepEqual([...cited].filter((id) => !ids.includes(id)), [], 'citations without an entry');
  assert.deepEqual(ids.filter((id) => !cited.has(id)), [], 'entries never cited');
  assert.doesNotMatch(page, /T4:/);
  // The assignment is quoted as given (without its "HMWK ==>" marker), with the professor's spelling.
  assert.doesNotMatch(page, /HMWK/);
  assert.match(page, /<p>\s*Consider n systems and m attackers\./);
  assert.match(page, /Consider two possible models for the score:/);
  assert.match(page, /Normalized total score: Sₙ\/√n/);
});

/* ------------------------------------------------------------ legibility (T5) */

test('Figure 10 carries a narrow drawing for small screens beside the printed one, each with its own ids', () => {
  const best = html.best;
  assert.match(best, /class="chart-swap"/);
  const wide = /<div class="chart-swap__wide">([\s\S]*?)<\/div><div class="chart-swap__narrow">/.exec(best);
  const narrow = /<div class="chart-swap__narrow">([\s\S]*)<\/div><\/div>$/.exec(best);
  assert.ok(wide && narrow, 'both drawings are present');
  const width = (svg) => Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)[1]);
  assert.equal(width(wide[1]), PARAMS.buildWidth);
  assert.ok(width(narrow[1]) <= 360, `narrow drawing ${width(narrow[1])} px`);
  assert.match(narrow[1], /id="fig-best-narrow-title"/);
});

test('every centred tick label of every chart stays inside its SVG', () => {
  // Libre Franklin at 10.5 px: tabular digits are about 0.6 em wide.
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

test('every inline formula followed by punctuation is tied to it, so that the punctuation never starts a line', () => {
  const loose = [...page.matchAll(/(<span class="math-tie">)?<span data-tex>[^<]*<\/span>[,;:.!?)\]]/g)].filter((m) => !m[1]);
  assert.deepEqual(loose.map((m) => m[0]), []);
});

test('the figure statistics write n with thousands separators, as the text does', () => {
  assert.doesNotMatch(page, /<dt>[^<]*\bn = \d{4,}/);
});

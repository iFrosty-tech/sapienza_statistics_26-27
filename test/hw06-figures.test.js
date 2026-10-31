/**
 * The figure provider and the page of homework 06: every @figure marker and
 * every {{fig.…}} token of homework/06/index.html is provided, the live panel
 * keeps its mount contract, every simulated figure is labelled as simulated
 * with its seed, the assignment is quoted verbatim and every citation
 * resolves. The provider runs on the full parameters with fewer hackers, which
 * changes the values but not the keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import provide, { PARAMS, buildFigures, cacheDirectory } from '../homework/06/figures.js';
import { runSamplingStudy } from '../src/lib/sampling-study.js';
import { applyFigureMarkers } from '../src/build/site-plugin.js';

const params = { ...PARAMS, m: 1000, precision: { ...PARAMS.precision, hackers: 20000 } };
const results = runSamplingStudy(params);
const meta = { params, ms: 1234, computedAt: '2026-10-31T12:00:00.000Z', cacheKey: '0123456789abcdef' };
const { html, tokens } = buildFigures(results, meta);
const page = readFileSync(new URL('../homework/06/index.html', import.meta.url), 'utf8');
const tagless = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('every @figure marker of the page is provided as html', () => {
  const ids = [...page.matchAll(/<!--\s*@figure\s+id=(\S+)\s*-->/g)].map((m) => m[1]);
  assert.ok(ids.length >= 12, `found ${ids.length} figure markers`);
  assert.equal(new Set(ids).size, ids.length, 'figure ids are unique');
  for (const id of ids) {
    assert.equal(typeof html[id], 'string', `figure ${id}`);
    assert.ok(html[id].length > 100, `figure ${id} is not empty`);
  }
});

test('every {{fig.…}} token of the page is provided as a string', () => {
  const keys = [...new Set([...page.matchAll(/\{\{\s*fig\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 40, `found ${keys.length} tokens`);
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

test('the tokens quote the study and the exact law, not typed values', () => {
  const e = (n) => results.experiments.find((row) => row.n === n);
  assert.equal(tokens['avg.n100.zMean'], e(100).zMean.toFixed(2).replace('-', '−'));
  assert.equal(tokens['avg.zAboveTwo'], String(results.summary.zAboveTwo));
  assert.equal(tokens['avg.zCount'], String(results.summary.zCount));
  assert.equal(tokens['law.mu'], '1.5');
  assert.equal(tokens['law.sigma2'], '7.75');
  assert.equal(tokens['cover.chiLimit'], results.summary.chiLimit.toFixed(3));
  assert.equal(tokens['spread.ratioLimit'], results.summary.varianceRatioLimit.toFixed(3));
});

test('the provider is deterministic for the same results', () => {
  const again = buildFigures(results, meta);
  assert.deepEqual(again.tokens, tokens);
  assert.deepEqual(again.html, html);
});

test('the provider caches the study under a hash key, so that a second run reads the cache', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hw06-cache-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = cacheDirectory(root);
  assert.equal(existsSync(dir), false);
  const repo = new URL('..', import.meta.url);
  const study = { calls: 0 };
  const first = await provide({ root, source: repo, run: (p) => ((study.calls += 1), runSamplingStudy({ ...p, m: 500, precision: { ...p.precision, hackers: 5000 } })) });
  const second = await provide({ root, source: repo, run: () => assert.fail('the study must come from the cache') });
  assert.equal(study.calls, 1);
  assert.ok(existsSync(dir));
  assert.deepEqual(second.tokens, first.tokens);
});

test('the page quotes the assignment of exercise 2 verbatim, heading included, without its marker', () => {
  assert.doesNotMatch(page, /HMWK/);
  assert.doesNotMatch(page, /📚/);
  const quote = /<blockquote class="assignment">([\s\S]*?)<\/blockquote>/.exec(page)?.[1] ?? '';
  const text = tagless(quote);
  for (const sentence of [
    'Ex. 2 – Sampling Mean and Variance',
    'Extend the previous homework by assigning each penetration attempt a score between 0 and 10, drawn from a fixed probability distribution of your choice.',
    'Let the theoretical mean and variance of this distribution be μ and σ², respectively.',
    'Assume there are m hackers, each attempting to penetrate n systems.',
    'Each hacker receives one score for each system, resulting in a trajectory of n scores.',
    'For each hacker, use Welford’s recurrence formulas to compute the sampling mean and sampling variance of their n scores.',
    'Across the m hackers, compute the average of the sampling means and the average of the sampling variances.',
    'Compare these two averages with the theoretical mean μ and variance σ², respectively.',
    'What conclusions can you draw from these comparisons?',
    'Why are these results useful in inferential statistics?',
    'Repeat the experiment for different values of n.',
    'How does increasing the number of systems attempted by each hacker affect the variability of the sampling means and sampling variances?',
  ]) {
    assert.ok(text.includes(sentence), sentence);
  }
});

test('the page links homework 3 and exercise 1 and states once what the sampling mean and variance are', () => {
  assert.match(page, /href="\{\{base\}\}homework\/04\/"/);
  assert.match(page, /href="\{\{base\}\}homework\/05\/"/);
  assert.equal(page.match(/id="def-sampling"/g)?.length, 1);
});

test('the live panel keeps its mount contract, with a plain number for the seed and a printed fallback', () => {
  assert.match(page, /<script type="module" src="\/src\/hw06\.js"><\/script>/);
  assert.match(page, /<div class="demo" data-demo="sampling" data-seed="\{\{fig\.params\.seed\}\}">\s*<p class="demo__fallback">/);
  assert.match(tokens['params.seed'], /^\d+$/);
  assert.equal(Number(tokens['params.seed']), PARAMS.seed);
  const fallback = /<p class="demo__fallback">([\s\S]*?)<\/p>/.exec(page)[1];
  assert.match(fallback, /\{\{fig\.avg\.n100\.mean\}\}/);
});

test('every simulated chart figure is labelled as simulated and states its seed', () => {
  const figures = [...page.matchAll(/<figure class="chart-figure[^"]*"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
  assert.ok(figures.length >= 8, `found ${figures.length} chart figures`);
  for (const f of figures) {
    const id = f.match(/@figure id=(\S+)/)?.[1];
    assert.match(f, /pplot__provenance">Simulated</, `figure ${id}`);
    assert.match(f, /class="pplot__seed"[^>]*>[^<]*\{\{fig\.params\.seed/, `figure ${id}`);
  }
});

test('the page has the sections of the assignment and at most ten references', () => {
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'reproducibility', 'references']) {
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
  const filled = applyFigureMarkers(page, html, 'homework/06/index.html').replace(/\{\{\s*fig\.([\w.]+)\s*\}\}/g, (_, key) => tokens[key] ?? '');
  assert.doesNotMatch(filled, /@figure/);
  assert.doesNotMatch(filled, /\{\{\s*fig\./);
});

test('the coverage figure explains its ceiling in the caption, not with a label that floats away from the curve', () => {
  assert.doesNotMatch(html.coverage, /1 − 0\.7ⁿ<\/text>/);
  assert.match(page, /<span data-tex>1 - 0\.7\^n<\/span> is the share of hackers with any score/);
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

test('no simulated value is typed in the prose: the decimals of the text come from tokens or from exact theory', () => {
  const prose = page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<span data-tex>[\s\S]*?<\/span>/g, '')
    .replace(/<div data-tex-display>[\s\S]*?<\/div>/g, '')
    .replace(/<ol>[\s\S]*?<\/ol>/g, '')
    .replace(/<a [^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ');
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

test('single-panel figures carry a narrow drawing for small screens beside the printed one', () => {
  for (const id of ['bias']) {
    assert.match(html[id], /class="chart-swap"/, id);
    const width = (svg) => Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)[1]);
    const narrow = /<div class="chart-swap__narrow">([\s\S]*)<\/div><\/div>$/.exec(html[id])[1];
    assert.ok(width(narrow) <= 360, `narrow drawing ${width(narrow)} px`);
  }
});

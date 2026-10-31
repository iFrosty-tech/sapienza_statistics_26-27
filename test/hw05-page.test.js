/**
 * The page of homework 4, which holds both exercises at homework/05/: the two
 * studies are provided together, one numbering runs through the whole page, every
 * printed cross-reference names something that exists, and the former address of
 * exercise 2 leads here. The providers run on the full parameters with fewer
 * replicates and hackers, which changes the values but not the keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PARAMS, buildFigures, mergeFigures } from '../homework/05/figures.js';
import { PARAMS as SAMPLING_PARAMS, buildFigures as buildSamplingFigures } from '../homework/05/figures-sampling.js';
import { runStabilityStudy } from '../src/lib/welford-stability.js';
import { runSamplingStudy } from '../src/lib/sampling-study.js';
import { applyFigureMarkers } from '../src/build/site-plugin.js';
import registry from '../src/data/homeworks.js';

const meta = { ms: 1234, computedAt: '2026-10-31T12:00:00.000Z', cacheKey: '0123456789abcdef' };
const source = readFileSync(new URL('../src/lib/welford.js', import.meta.url), 'utf8');
const params = { ...PARAMS, replicates: 8, scores: { ...PARAMS.scores, replicates: 8 } };
const samplingParams = { ...SAMPLING_PARAMS, m: 500, precision: { ...SAMPLING_PARAMS.precision, hackers: 20000 } };
const exercise1 = buildFigures(runStabilityStudy(params), { ...meta, params, source });
const exercise2 = buildSamplingFigures(runSamplingStudy(samplingParams), { ...meta, params: samplingParams });
const { html, tokens } = mergeFigures(exercise1, exercise2);
const page = readFileSync(new URL('../homework/05/index.html', import.meta.url), 'utf8');

/** The page with its TeX, tokens and tags removed: what a reader sees as prose. */
const prose = page
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<span data-tex>[\s\S]*?<\/span>/g, '')
  .replace(/<div data-tex-display>[\s\S]*?<\/div>/g, '')
  .replace(/<section class="hw-section references"[\s\S]*?<\/section>/, '');

const numbers = (pattern) => [...page.matchAll(pattern)].map((m) => Number(m[1]));
const upTo = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('homework 4 is one register entry whose page holds both exercises', () => {
  const entries = registry.filter((e) => e.label?.startsWith('Homework 4'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].number, 5);
  assert.equal(entries[0].label, 'Homework 4');
  assert.equal(entries[0].shortLabel, '4');
  assert.equal(registry.some((e) => e.number === 6), false);
  assert.equal(existsSync(new URL('../homework/06/', import.meta.url)), false);
  assert.match(page, /Ex\. 1 – Welford’s Recurrence Formulas/);
  assert.match(page, /Ex\. 2 – Sampling Mean and Variance/);
});

test('each exercise opens with its own heading, in order, and the contents lead to both', () => {
  const first = page.indexOf('id="exercise-1"');
  const second = page.indexOf('id="exercise-2"');
  assert.ok(first > 0 && first < page.indexOf('id="s1"'));
  assert.ok(second > page.indexOf('id="s8"') && second < page.indexOf('id="s9"'));
  assert.match(page, /<a href="#exercise-1">/);
  assert.match(page, /<a href="#exercise-2">/);
});

test('both panels mount on the page, from one entry point', () => {
  assert.equal(page.match(/<script type="module"/g)?.length, 1);
  assert.match(page, /<div class="demo" data-demo="stepper"/);
  assert.match(page, /<div class="demo" data-demo="sampling"/);
  const entry = readFileSync(new URL('../src/hw05.js', import.meta.url), 'utf8');
  assert.match(entry, /stepper: \(\) => import\('\.\/hw05\/stepper-demo\.js'\)/);
  assert.match(entry, /sampling: \(\) => import\('\.\/hw05\/sampling-demo\.js'\)/);
});

test('the styles of both panels and of both studies reach the page', () => {
  const styles = readFileSync(new URL('../src/styles/hw05.css', import.meta.url), 'utf8');
  const figures = readFileSync(new URL('../src/styles/hw05-figures.css', import.meta.url), 'utf8');
  // A canvas of the sampling panel has no height of its own: without its rule the panel draws nothing.
  for (const rule of ['.stepper {', '.smp-figures {', '.smp-canvas {', '.smp-readout thead th {']) assert.ok(styles.includes(rule), rule);
  for (const rule of ['.chart--errors .chart__range {', '.chart--cloud .chart__point {', '.data-table.data-table--sampling']) assert.ok(figures.includes(rule), rule);
});

test('the button of the stepper names the table that holds its data', () => {
  const stepper = readFileSync(new URL('../src/hw05/stepper-demo.js', import.meta.url), 'utf8');
  const label = /data-step-worked>(Table \d) data</.exec(stepper)?.[1];
  assert.match(page, new RegExp(`${label} traces the code on \\{\\{fig\\.trace\\.data\\}\\}`));
});

test('sections, equations, figures, tables and panels run in one sequence through the page', () => {
  assert.deepEqual(numbers(/<section class="hw-section" id="s(\d+)"/g), upTo(16));
  assert.deepEqual(numbers(/<span class="equation__no">\((\d+)\)<\/span>/g), upTo(33));
  assert.deepEqual(numbers(/<span class="pplot__fig-no">Figure (\d+)\.<\/span>/g), upTo(11));
  assert.deepEqual(numbers(/<span class="table-figure__no">Table (\d+)\.<\/span>/g), upTo(7));
  assert.equal(numbers(/<h3 id="s(\d+)-\d+">\1\.\d+ /g).length, page.match(/<h3 id="s\d+-\d+">/g).length);
  assert.equal(page.match(/<span class="table-figure__no">Table A1\.<\/span>/g)?.length, 1);
  assert.equal(page.match(/<span class="table-figure__no">Table A2\.<\/span>/g)?.length, 1);
});

test('every printed cross-reference names something on the page', () => {
  const sections = new Set([...page.matchAll(/<h3 id="s\d+-\d+">(\d+\.\d+) /g)].map((m) => m[1]));
  const cited = [...prose.matchAll(/§(\d+(?:\.\d+)*)/g)].map((m) => m[1]);
  // §4.2.2 is the section of Knuth's book, not of this page.
  const dangling = cited.filter((s) => s !== '4.2.2' && !(s.includes('.') ? sections.has(s) : Number(s) >= 1 && Number(s) <= 16));
  assert.deepEqual(dangling, []);
  const out = (pattern, limit) => [...prose.matchAll(pattern)].map((m) => Number(m[1])).filter((n) => n < 1 || n > limit);
  assert.deepEqual(out(/Figure (\d+)/g, 11), []);
  assert.deepEqual(out(/(?<!, )Table (\d+)/g, 7), []);
  assert.deepEqual(out(/Panel (\d+)/g, 2), []);
  assert.deepEqual(out(/\((\d{1,2})\)/g, 33), []);
});

test('the two studies are provided together, and neither overwrites a key of the other', () => {
  assert.ok(html.parameters.length > 100);
  assert.ok(html.samplingParameters.length > 100);
  assert.equal(PARAMS.seed, SAMPLING_PARAMS.seed, 'the one seed the two studies may share');
  assert.equal(tokens['params.seed'], String(PARAMS.seed));
  assert.equal(tokens['params.m'], '500');
  assert.equal(tokens['params.n'], '1,000');
  assert.throws(() => mergeFigures({ html: { a: 'x' }, tokens: {} }, { html: { a: 'y' }, tokens: {} }), /a/);
  assert.throws(() => mergeFigures({ html: {}, tokens: { a: 'x' } }, { html: {}, tokens: { a: 'y' } }), /a/);
  assert.deepEqual(mergeFigures({ html: {}, tokens: { a: 'x' } }, { html: {}, tokens: { a: 'x' } }).tokens, { a: 'x' });
});

test('every @figure marker and every {{fig.…}} token of the page is provided, and no marker is left', () => {
  const ids = [...page.matchAll(/<!--\s*@figure\s+id=(\S+)\s*-->/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'figure ids are unique');
  assert.deepEqual(ids.filter((id) => typeof html[id] !== 'string'), []);
  const keys = [...new Set([...page.matchAll(/\{\{\s*fig\.([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  assert.deepEqual(keys.filter((k) => typeof tokens[k] !== 'string'), []);
  assert.doesNotMatch(applyFigureMarkers(page, html, 'homework/05/index.html'), /@figure/);
});

test('every element id of the finished page is unique and every anchor resolves', () => {
  const filled = applyFigureMarkers(page, html, 'homework/05/index.html');
  const ids = [...filled.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  const missing = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((id) => !ids.includes(id));
  assert.deepEqual(missing, []);
});

test('every reference is listed once, in alphabetical order, cited and resolved', () => {
  const entries = [...page.matchAll(/<li id="ref-(\d+)">([^<(]+\(\d{4}\))/g)];
  assert.deepEqual(entries.map((m) => Number(m[1])), upTo(entries.length));
  assert.equal(entries.length, 17);
  const authors = entries.map((m) => m[2].trim());
  assert.deepEqual(authors, [...authors].sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(new Set(authors).size, authors.length);
  const cited = new Set([...page.matchAll(/<a href="#ref-(\d+)">(\d+)<\/a>/g)].map((m) => {
    assert.equal(m[1], m[2], 'a citation prints the number of its entry');
    return Number(m[1]);
  }));
  assert.deepEqual(upTo(entries.length).filter((n) => !cited.has(n)), []);
});

test('the symbol reused between the exercises is declared where its meaning changes', () => {
  assert.match(page, /denotes this kurtosis, not the condition\s+number of §7/);
});

test('the former address of exercise 2 forwards to its heading on this page', () => {
  const stub = readFileSync(new URL('../public/homework/06/index.html', import.meta.url), 'utf8');
  assert.match(stub, /<meta http-equiv="refresh" content="0; url=\.\.\/05\/#exercise-2" \/>/);
  assert.match(stub, /<a href="\.\.\/05\/#exercise-2">/);
});

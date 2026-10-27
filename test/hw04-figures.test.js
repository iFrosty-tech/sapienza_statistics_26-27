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

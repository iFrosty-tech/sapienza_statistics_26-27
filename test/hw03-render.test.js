/**
 * The renderers of src/hw03/render.js on small runs of the homework 03 study:
 * every chart is SVG with an accessible name, plots one red point per measured
 * value, never prints NaN or undefined, and every table has the expected rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareStatistics, repeatedEncryption, runCaesarStudy } from '../src/lib/caesar-study.js';
import { attackCostTable, keySpaces, measureAttackCost } from '../src/lib/ecc-attack-study.js';
import {
  FIGURE_KINDS,
  durationFromLog2Seconds,
  figureData,
  renderAttackTable,
  renderCaesarSummary,
  renderChart,
  renderKeySpaces,
  renderRepeated,
  renderSeries,
  renderStatisticsTable,
  sciFromLog2,
} from '../src/hw03/render.js';

const stats = JSON.parse(readFileSync(new URL('../src/data/hw03/training-stats.json', import.meta.url), 'utf8'));
const text = readFileSync(new URL('../src/data/hw03/heldout.txt', import.meta.url), 'utf8').trim();
const lengths = [1, 3, 10, 30, 100];
const results = JSON.parse(
  JSON.stringify({
    caesar: runCaesarStudy({ text, stats, lengths, windows: 20, seed: 3 }),
    compare: compareStatistics({ text, stats, chars: 3000, seed: 3 }),
    repeat: repeatedEncryption({ seed: 3 }),
    attack: measureAttackCost({ seed: 3, keysPerBits: 3, ranges: { 'brute-force': [6, 8, 10], bsgs: [6, 8, 10, 12], kangaroo: [8, 10] } }),
  }),
);

const count = (s, re) => (s.match(re) ?? []).length;
const clean = (s) => {
  assert.doesNotMatch(s, /NaN|undefined|Infinity/);
};

test('every chart kind renders SVG with titles and descriptions at two widths', () => {
  for (const kind of FIGURE_KINDS) {
    for (const width of [640, 340]) {
      const html = renderChart(kind, figureData(kind, results), { id: kind, width });
      clean(html);
      const svgs = count(html, /<svg /g);
      assert.ok(svgs >= 1, `${kind} at ${width}`);
      assert.equal(count(html, /<title id=/g), svgs);
      assert.equal(count(html, /<desc id=/g), svgs);
    }
  }
});

test('the success figure has one panel per method plus the overlay, a red point per length and a band', () => {
  const html = renderChart('success', figureData('success', results), { id: 's', width: 900 });
  assert.equal(count(html, /<svg /g), 6);
  assert.equal(count(html, /class="chart__point"/g), 5 * lengths.length);
  assert.equal(count(html, /chart__band-area/g), 5);
  assert.match(html, /data-columns="3"/);
});

test('the letters figure draws 26 + 26 + 256 bars', () => {
  const html = renderChart('letters', figureData('letters', results), { id: 'l', width: 640 });
  assert.equal(count(html, /class="chart__bar"/g), 26 + 26 + 256);
});

test('the attack figure plots one point and one range per measured key size', () => {
  const html = renderChart('attack', figureData('attack', results), { id: 'a', width: 640 });
  const sizes = 3 + 4 + 2;
  assert.equal(count(html, /class="chart__point"/g), sizes);
  assert.equal(count(html, /class="chart__range"/g), sizes);
  assert.match(html, /slope/);
});

test('renderSeries embeds the data the page needs to redraw the chart', () => {
  const html = renderSeries('rank', figureData('rank', results), { id: 'r' });
  const json = html.match(/<script type="application\/json" data-fig-data>(.*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(json), figureData('rank', results));
});

test('the tables have one row per item', () => {
  const rows = (s) => count(s, /<tr>/g) - 1; // minus the head row
  const spaces = renderKeySpaces(keySpaces(), { caesarRate: 1e6, bruteRate: 2.4e5 });
  assert.equal(rows(spaces), 3);
  assert.equal(rows(renderRepeated(results.repeat)), 4);
  assert.equal(rows(renderStatisticsTable(results.compare)), 5);
  assert.equal(rows(renderCaesarSummary(results.caesar, { at: [3, 10] })), 5);
  assert.equal(rows(renderAttackTable(attackCostTable(results.attack))), 3 * 2 + 1);
  for (const s of [spaces, renderRepeated(results.repeat), renderStatisticsTable(results.compare), renderAttackTable(attackCostTable(results.attack))]) clean(s);
});

test('large numbers are printed from their base-2 logarithm without overflow', () => {
  assert.equal(sciFromLog2(256), '1.16 × 10⁷⁷');
  assert.equal(sciFromLog2(10), '1024');
  assert.equal(durationFromLog2Seconds(0), '1.0 s');
  assert.match(durationFromLog2Seconds(100), /years$/);
});

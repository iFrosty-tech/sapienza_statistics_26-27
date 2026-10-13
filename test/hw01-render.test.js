/**
 * Figure kinds of homework 01: the series each figure shows, the statistics
 * printed in its caption and the chart drawn from the study of kg-study.js.
 * The study is run once at a reduced size and passed through JSON, as the
 * build provider does, so that the nulls left by JSON (an infinite Fisher z,
 * a chi-square p-value with no degrees of freedom) are exercised.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SERIES,
  FIGURE_SERIES,
  RESAMPLABLE,
  RESAMPLE_N,
  SAMPLED,
  compactData,
  exactTwoSidedTail,
  formatP,
  renderChart,
  renderSeries,
  renderStatsScript,
  seriesFromStudy,
  statsOf,
} from '../src/hw01/render.js';
import { coordinateDistribution, runStudy, secpSample } from '../src/lib/kg-study.js';
import { P as SECP_P } from '../src/lib/secp256k1.js';

const study = JSON.parse(JSON.stringify(runStudy({ secpN: 96, sacKeys: 8, ecdlpTargets: 4 })));
// A leaked JavaScript value; "null" after a word ("a structural null") is the statistical term.
const BAD = /NaN|undefined|Infinity|(?<![A-Za-z] )null|\[object/;
const GRID = ['c1h', 'c1', 'c2h', 'c2', 'c3h', 'c3', 'c4h', 'c4'];

test('every series of every figure has printable statistics and a chart', () => {
  for (const [kind, keys] of Object.entries(FIGURE_SERIES)) {
    assert.ok(keys.includes(DEFAULT_SERIES[kind]), `${kind}: the default series is listed`);
    for (const key of keys) {
      const data = seriesFromStudy(kind, study, key);
      const stats = statsOf(kind, data);
      for (const k of GRID) assert.equal(typeof stats[k], 'string', `${kind}/${key}: ${k}`);
      for (const [k, v] of Object.entries(stats)) {
        assert.equal(typeof v, 'string', `${kind}/${key}.${k} is a string`);
        assert.ok(!BAD.test(v), `${kind}/${key}.${k} = "${v}"`);
      }
      for (const width of [640, 340]) {
        const html = renderChart(kind, data, { id: `${kind}-${key}-${width}`, width });
        assert.ok(html.includes('role="img"'), `${kind}/${key} at ${width}px draws an accessible chart`);
        assert.ok(!/NaN|undefined/.test(html), `${kind}/${key} at ${width}px has no undefined coordinates`);
      }
    }
  }
});

test('enumerated series are labelled as enumerations and sampled ones as simulations', () => {
  const coord = (key) => statsOf('coordHist', seriesFromStudy('coordHist', study, key));
  assert.equal(coord('O1051').provenance, 'Enumeration');
  assert.equal(coord('T17g').provenance, 'Enumeration');
  assert.equal(coord('secp256k1').provenance, 'Simulated');
  assert.equal(coord('keccak').provenance, 'Simulated');
  assert.match(coord('secp256k1').population, /N = 96 private keys/);
  assert.match(coord('secp256k1').population, /seed 20261013/);
  assert.match(coord('O1051').population, /all 1,092 points/);
  assert.deepEqual(SAMPLED, ['secp256k1', 'keccak']);
  for (const kind of RESAMPLABLE) assert.ok(FIGURE_SERIES[kind].some((k) => SAMPLED.includes(k)), `${kind} has a sampled series`);
  assert.ok(RESAMPLE_N >= 256 && RESAMPLE_N <= 4096);
});

test('the hash baseline has one output: its second coordinate prints as a dash', () => {
  const stats = statsOf('coordHist', seriesFromStudy('coordHist', study, 'keccak'));
  assert.equal(stats.xName, 'H(k)');
  assert.equal(stats.yStatistic, '—');
  assert.equal(stats.yP, '—');
  assert.match(stats.c1h, /^H\(k\): χ²\(31\)$/);
});

test('exact population values print as such: the exhaustive occupancy of F₁₀₅₁', () => {
  const stats = statsOf('occupancy', seriesFromStudy('occupancy', study, 'O1051'));
  assert.equal(stats.yHits0, '687');
  assert.equal(stats.yHits3, '364');
  // Four pooled categories, less one for the estimated mean θ and one for the total.
  assert.equal(stats.yDf, '2');
  assert.equal(stats.yP, '< 0.001');
  assert.equal(stats.xMultiplicity, '0: 505; 2: 546');
  assert.match(stats.population, /a mean of 1\.039 per value/);
  assert.ok(!/λ/.test(stats.population), 'the Poisson mean is not called λ, the slope of the group law');
});

test('no figure prints a caret: powers are superscripts in charts and Unicode in plain text', () => {
  // The visible text of an SVG or HTML string: its text nodes, without tags.
  const visible = (html) => html.replace(/<title[^>]*>.*?<\/title>|<desc[^>]*>.*?<\/desc>/g, '').replace(/<[^>]+>/g, '');
  for (const [kind, keys] of Object.entries(FIGURE_SERIES)) {
    for (const key of keys) {
      const data = seriesFromStudy(kind, study, key);
      for (const [k, v] of Object.entries(statsOf(kind, data))) assert.ok(!v.includes('^'), `${kind}/${key}.${k} = "${v}"`);
      for (const width of [640, 358]) {
        const html = renderChart(kind, data, { id: `${kind}-${key}`, width });
        assert.ok(!visible(html).includes('^'), `${kind}/${key} at ${width}px prints a caret`);
        assert.ok(!/<(title|desc)[^>]*>[^<]*\^/.test(html), `${kind}/${key} at ${width}px: caret in an accessible text`);
      }
    }
  }
  const cost = statsOf('dblAddCost', seriesFromStudy('dblAddCost', study, 'all'));
  assert.match(cost.meanRepeated256, /^\d\.\d\d × 10⁷⁶$/);
  assert.equal(cost.meanRepeated256Exponent, '76');
  assert.match(cost.meanRepeated256Mantissa, /^\d\.\d\d$/);
});

test('Figure 12: the dashed references are those of the marks and the tokens, n/2 and 1.5√n', () => {
  const data = seriesFromStudy('ecdlp', study, 'all');
  const stats = statsOf('ecdlp', data);
  assert.equal(stats.bsgsReference, '1.5√n');
  assert.equal(stats.bruteReference, 'n/2');
  const svg = renderChart('ecdlp', data, { id: 'e', width: 640 });
  assert.ok(svg.includes('>1.5√n<') && svg.includes('>n/2<'));
  assert.ok(!svg.includes('>√n<'), 'no bare √n reference');
  // The BSGS mark sits at log₂(1.5·√n) for n the order of secp256k1, as theoryBsgsAt256.
  assert.equal(stats.theoryBsgsAt256, '128.6');
  assert.ok(svg.includes(`font-size="75%">${stats.theoryBsgsAt256}</tspan>`));
});

test('enumerations report the structural Monte Carlo null and pairs counted once', () => {
  const coord = statsOf('coordHist', seriesFromStudy('coordHist', study, 'O1051'));
  assert.equal(coord.replicates, '2,000');
  assert.match(coord.c2h, /structural null/);
  assert.equal(coord.c2, coord.xStructuralP);
  assert.equal(coord.c4, coord.yStructuralP);
  assert.equal(coord.yVif, '1.96');
  assert.match(coord.yStructuralPEq, /^P [=<] /);
  const sample = statsOf('coordHist', seriesFromStudy('coordHist', study, 'secp256k1'));
  assert.equal(sample.xStructuralP, '—');
  assert.equal(sample.c2h, 'x: p-value');
  const aval = statsOf('avalanche', seriesFromStudy('avalanche', study, 'O1051'));
  assert.equal(aval.pairs, '5,380');
  assert.equal(aval.trials, undefined);
  assert.match(aval.population, /5,380 pairs/);
  const cells = statsOf('pointCloud', seriesFromStudy('pointCloud', study, 'all'));
  assert.equal(cells['T17g.cellsIllustrative'], 'illustrative only, expected counts below 5');
  assert.match(cells.c1, /illustrative only$/);
  assert.equal(cells['O16477.cellsPoints'], '8,346');
});

test('two coordinates sit side by side on a wide figure and stack on a narrow one', () => {
  const data = seriesFromStudy('coordHist', study, 'O1051');
  assert.ok(renderChart('coordHist', data, { id: 'w', width: 640 }).includes('data-columns="2"'));
  assert.ok(renderChart('coordHist', data, { id: 'n', width: 340 }).includes('data-columns="1"'));
  const cloud = seriesFromStudy('pointCloud', study, 'all');
  assert.ok(renderChart('pointCloud', cloud, { id: 'c', width: 640 }).includes('data-columns="3"'));
});

test('a figure redrawn from its embedded JSON is the figure the build printed', () => {
  for (const [kind, keys] of Object.entries(FIGURE_SERIES)) {
    for (const key of keys) {
      const data = seriesFromStudy(kind, study, key);
      const compact = JSON.parse(JSON.stringify(compactData(kind, data)));
      assert.equal(renderChart(kind, compact, { id: 'r', width: 500 }), renderChart(kind, data, { id: 'r', width: 500 }), `${kind}/${key}`);
    }
  }
  const html = renderSeries('coordHist', seriesFromStudy('coordHist', study, 'O1051'), { id: 's', series: 'O1051', hidden: true });
  assert.ok(html.includes('data-fig-series="O1051" hidden') && html.includes('data-fig-data'));
  assert.ok(!renderStatsScript({ a: { s: '</script>' } }).includes('</script><'), 'the JSON cannot close its script element');
});

test('a sample redrawn in the browser states its own seed and size', () => {
  const sample = secpSample({ N: 64, seed: 99 });
  const partial = {
    meta: { seed: 99, sizes: { secpN: 64 }, origin: 'browser' },
    E1: {
      secp256k1: { x: coordinateDistribution(sample.points.map((Q) => Q.x), SECP_P, 32), y: coordinateDistribution(sample.points.map((Q) => Q.y), SECP_P, 32) },
      keccak: { digest: coordinateDistribution(sample.hashes, 2n ** 256n, 32) },
    },
  };
  const stats = statsOf('coordHist', seriesFromStudy('coordHist', JSON.parse(JSON.stringify(partial)), 'secp256k1'));
  assert.match(stats.population, /browser/);
  assert.match(stats.population, /N = 64/);
  assert.match(stats.population, /seed 99/);
});

test('the strict-avalanche maps render as two rasters with their statistics', () => {
  const data = seriesFromStudy('sac', study, 'all');
  let calls = 0;
  const html = renderChart('sac', data, { id: 'sac', rasterize: () => ((calls += 1), 'data:image/png;base64,AAAA') });
  assert.equal(calls, 2);
  assert.equal(html.split('class="heatmap"').length - 1, 2);
  const stats = statsOf('sac', data);
  assert.match(stats['secp256k1.maxAbsDeviation'], /^0\.\d{3}$/);
  assert.equal(stats['keccak.cells'], '65,536');
});

test('exact two-sided tail of Bin(trials, ½) beyond 1.96 standard deviations', () => {
  // Bin(48, ½): sd = √12 ≈ 3.464, so |k − 24| > 6.79 means k ≤ 17 or k ≥ 31.
  assert.ok(Math.abs(exactTwoSidedTail(48) - 0.0595) < 0.0005);
  // Bin(8, ½): sd = √2, so |k − 4| > 2.77 means k ≤ 1 or k ≥ 7: 2 · (1 + 8) / 256.
  assert.ok(Math.abs(exactTwoSidedTail(8) - 18 / 256) < 1e-12);
  // A very large number of trials approaches the normal 5%.
  assert.ok(Math.abs(exactTwoSidedTail(4000) - 0.05) < 0.003);
});

test('p-values print to three decimals or as a bound', () => {
  assert.equal(formatP(0.0011), '0.001');
  assert.equal(formatP(0.0004), '< 0.001');
  assert.equal(formatP(0.5), '0.500');
  assert.equal(formatP(NaN), 'n/a');
  assert.equal(formatP(null), 'n/a');
});

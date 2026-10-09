/**
 * Chart renderers: deterministic structure checks (element counts, labels,
 * accessible names). The visual judgement belongs to the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipLineToRange,
  renderHistogram,
  renderZStrip,
  renderCollisionCurve,
  renderLogLog,
  renderCurveScatter,
  renderNakamoto,
  renderHeatMap,
} from '../src/lib/charts.js';
import { modelFromSample } from '../src/lib/normal.js';
import { renderProbabilityPlotSVG, plotTitle, plotDescription } from '../src/lib/probability-plot.js';

const count = (html, needle) => html.split(needle).length - 1;

test('reference lines are cut to the panel rectangle', () => {
  // y = x on [0, 10] × [0, 10]: untouched.
  assert.deepEqual(clipLineToRange(1, 0, [0, 10], [0, 10]), [0, 0, 10, 10]);
  // y = x − 1 (n/2 in log₂ axes) on [0, 10] × [0, 4]: leaves the frame at x = 5.
  assert.deepEqual(clipLineToRange(1, -1, [0, 10], [0, 4]), [1, 0, 5, 4]);
  // y = x/2 on [0, 10] × [0, 10]: ends at the right edge below the top.
  assert.deepEqual(clipLineToRange(0.5, 0, [0, 10], [0, 10]), [0, 0, 10, 5]);
  // A horizontal line outside the range is dropped, one inside is kept whole.
  assert.equal(clipLineToRange(0, 12, [0, 10], [0, 10]), null);
  assert.deepEqual(clipLineToRange(0, 3, [0, 10], [0, 10]), [0, 3, 10, 3]);
  // A line that misses the rectangle entirely is dropped.
  assert.equal(clipLineToRange(1, 20, [0, 10], [0, 10]), null);
});

test('histogram draws one bar per bin, an expected step line and the axis titles', () => {
  const bins = [1, 2, 3, 4, 5].map((k) => ({ label: String(k), observed: k * 2, expected: k * 2 + 0.5 }));
  const svg = renderHistogram({ id: 'h', title: 'T', desc: 'D', bins, xLabel: 'Value', yLabel: 'Count' });
  assert.ok(svg.startsWith('<svg'));
  assert.equal(count(svg, 'class="chart__bar"'), 5);
  assert.equal(count(svg, 'class="chart__expected"'), 1);
  assert.ok(svg.includes('>Value<') && svg.includes('>Count<'));
  assert.ok(svg.includes('<title id="h-title">T</title>'));
  assert.ok(svg.includes('aria-labelledby="h-title h-desc"'));
});

test('histogram axis covers the tallest bar, so no bar rises above the frame', () => {
  // A maximum of 212 with five target intervals rounds the tick step to 50: the last tick
  // used to be 200 and the tallest bars were drawn above the frame (negative y).
  const bins = Array.from({ length: 81 }, (_, k) => ({ label: String(k), observed: k === 40 ? 212 : 150, expected: 160 }));
  const svg = renderHistogram({ id: 'h3', title: 'T', desc: 'D', bins });
  const frameTop = Number(svg.match(/class="chart__frame" x="[\d.]+" y="([\d.]+)"/)[1]);
  const ys = [...svg.matchAll(/class="chart__bar" x="[\d.-]+" y="([\d.-]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 81);
  assert.ok(ys.every((y) => y >= frameTop), `bar above the frame: min y ${Math.min(...ys)} < ${frameTop}`);
  assert.ok(svg.includes('>250<'), 'the axis gains a tick above the data maximum');
});

test('log-log marks accept a label offset', () => {
  const series = [{ key: 's', label: 'S', points: [{ x: 128, y: 11 }, { x: 1024, y: 32 }] }];
  const marks = [{ x: 2 ** 112, y: 2 ** 56, label: 'A', dy: 12 }, { x: 2 ** 114, y: 2 ** 57, label: 'B', dy: -8 }];
  const svg = renderLogLog({ id: 'll', title: 'T', desc: 'D', series, marks });
  const labels = [...svg.matchAll(/class="chart__annotation" x="[\d.-]+" y="([\d.-]+)" text-anchor="end">(A|B)</g)];
  assert.equal(labels.length, 2);
  assert.ok(Math.abs(Number(labels[0][1]) - Number(labels[1][1])) >= 18, 'the two labels are separated vertically');
});

test('histogram without expectations draws no step line and honours labelEvery', () => {
  const bins = Array.from({ length: 40 }, (_, k) => ({ label: String(k), observed: k }));
  const svg = renderHistogram({ id: 'h2', title: 'T', desc: 'D', bins, labelEvery: 10 });
  assert.equal(count(svg, 'class="chart__expected"'), 0);
  assert.equal(count(svg, 'class="chart__xlabel"'), 4);
});

test('z-score strip draws 256 lollipops and the ±1.96 and ±3 bands', () => {
  const z = Array.from({ length: 256 }, (_, j) => Math.sin(j) * 2);
  const svg = renderZStrip({ id: 'z', title: 'T', desc: 'D', z });
  assert.equal(count(svg, 'class="chart__lollipop"'), 256);
  assert.equal(count(svg, 'class="chart__point"'), 256);
  assert.equal(count(svg, 'class="chart__band chart__band--two"'), 2);
  assert.equal(count(svg, 'class="chart__band chart__band--three"'), 2);
  assert.equal(count(svg, 'class="chart__bandlabel"'), 2);
  assert.equal(count(svg, 'class="chart__zero"'), 1);
});

test('collision curve draws the theory line, one point per sample size and error bars', () => {
  const points = [10, 50, 100].map((m) => ({ m, empirical: m / 120, theory: m / 100 }));
  const theory = Array.from({ length: 101 }, (_, m) => ({ m, p: m / 100 }));
  const svg = renderCollisionCurve({ id: 'c', title: 'T', desc: 'D', points, theory, subsets: 50, halfPoint: 50 });
  assert.equal(count(svg, 'class="chart__theory"'), 1);
  assert.equal(count(svg, 'class="chart__point"'), 3);
  assert.equal(count(svg, 'class="chart__errorbar"'), 3);
  assert.ok(svg.includes('chart__half'));
});

test('log-log plot renders every series, the reference lines and the marks in both panels', () => {
  const series = [
    { key: 'bsgs', label: 'BSGS', points: [{ x: 128, y: 12 }, { x: 256, y: 17 }] },
    { key: 'brute', label: 'Brute', points: [{ x: 128, y: 64 }, { x: 256, y: 128 }] },
  ];
  const marks = [{ x: 2 ** 256, y: 2 ** 128, label: 'secp256k1' }];
  const svg = renderLogLog({ id: 'l', title: 'T', desc: 'D', series, marks, references: [{ label: '√n', exponent: 0.5 }] });
  // Two panels (measured range and extrapolation) each draw every series.
  assert.equal(count(svg, 'class="chart__point chart__point--bsgs"'), 4);
  assert.equal(count(svg, 'class="chart__point chart__point--brute"'), 4);
  assert.equal(count(svg, 'class="chart__panel-title"'), 2);
  assert.equal(count(svg, 'secp256k1'), 2, 'the mark label and the panel title');
  assert.equal(count(svg, 'class="chart__mark"'), 1, 'marks appear in the extrapolation panel only');
  assert.equal(count(svg, 'class="chart__reference"'), 2);
});

test('curve scatter draws one point per affine point and the mirror ruling', () => {
  const points = [{ x: 1, y: 2 }, { x: 1, y: 9 }, { x: 4, y: 5 }];
  const svg = renderCurveScatter({ id: 's', title: 'T', desc: 'D', p: 11, points });
  assert.equal(count(svg, 'class="chart__point"'), 3);
  assert.ok(svg.includes('chart__mirror'));
});

test('Nakamoto chart draws one curve per attacker share and the confirmation ruling', () => {
  const curves = [0.1, 0.3].map((q) => ({
    q,
    label: `q = ${q}`,
    values: Array.from({ length: 11 }, (_, z) => ({ z, p: Math.exp(-z * (1 - q)) })),
  }));
  const svg = renderNakamoto({ id: 'n', title: 'T', desc: 'D', curves, markZ: 6 });
  assert.equal(count(svg, 'class="chart__curve'), 2);
  assert.ok(svg.includes('q = 0.1') && svg.includes('q = 0.3'));
  assert.ok(svg.includes('chart__half'));
});

test('heat map composes the raster, a legend and the accessible description', () => {
  const trials = 4;
  const flips = Array.from({ length: 16 * 8 }, (_, i) => i % (trials + 1));
  let seen = null;
  const rasterize = ({ width, height, rgba }) => {
    seen = { width, height, bytes: rgba.length };
    return 'data:image/png;base64,AAAA';
  };
  const html = renderHeatMap({ id: 'm', rows: 16, cols: 8, flips, trials, rasterize, alt: 'ALT' });
  assert.deepEqual(seen, { width: 8, height: 16, bytes: 16 * 8 * 4 });
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
  assert.ok(html.includes('alt="ALT"'));
  assert.ok(html.includes('heatmap__legend'));
});

test('modelFromSample builds a probability-plot model that renders', () => {
  const values = [3, -1, 0.5, 2, -2, 1];
  const model = modelFromSample(values, { seed: 42, label: 'test values', title: 'Plot of test values', description: 'desc' });
  assert.equal(model.n, 6);
  assert.deepEqual(model.sample, [-2, -1, 0.5, 1, 2, 3]);
  assert.equal(model.z.length, 6);
  assert.ok(Number.isFinite(model.fit.slope) && Number.isFinite(model.fit.r));
  assert.equal(model.population.label, 'test values');
  assert.equal(plotTitle(model), 'Plot of test values');
  assert.ok(plotDescription(model).startsWith('desc'));
  const svg = renderProbabilityPlotSVG(model, { width: 600, height: 400, id: 'pp' });
  assert.equal(count(svg, 'class="pplot__point"'), 6);
});

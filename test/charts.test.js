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
  renderLogLog,
  renderCurveScatter,
  renderHeatMap,
  renderBandChart,
  renderIntervalDots,
  renderCapacityBars,
  renderScatter,
  renderLineChart,
  renderBitProfile,
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

test('band chart draws one point per checkpoint, one quartile band, the references and the groups', () => {
  const points = [1, 11, 20, 200, 360, 800].map((mean, i) => ({ label: `C${i}`, tick: `c${i}`, mean, q1: mean * 0.9, q3: mean * 1.1 }));
  const svg = renderBandChart({
    id: 'b',
    title: 'T',
    desc: 'D',
    points,
    references: [{ value: 800, label: 'Half the state' }],
    groups: [{ from: 0, to: 2, label: 'Round 1' }, { from: 3, to: 5, label: 'Round 2' }],
    yLog: true,
    xLabel: 'Checkpoint',
    yLabel: 'Differing bits',
  });
  assert.ok(svg.startsWith('<svg'));
  assert.equal(count(svg, 'class="chart__point"'), 6);
  assert.equal(count(svg, 'class="chart__band-area"'), 1);
  assert.equal(count(svg, 'class="chart__trace"'), 1);
  assert.equal(count(svg, 'class="chart__reference"'), 1);
  assert.equal(count(svg, 'class="chart__group"'), 2);
  assert.ok(svg.includes('>Round 1<') && svg.includes('>Half the state<'));
  assert.ok(svg.includes('>c3<'), 'tick labels are printed');
  // On a logarithmic axis every point lies inside the frame.
  const frame = svg.match(/class="chart__frame" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
  const ys = [...svg.matchAll(/class="chart__point" cx="[\d.]+" cy="([\d.-]+)"/g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y >= frame[1] - 0.05 && y <= frame[1] + frame[3] + 0.05));
});

test('interval dot plot draws one estimate, one interval and one expected mark per row on a log axis', () => {
  const rows = [
    { label: 'A', expected: 1 / 16, estimate: 0.062, low: 0.06, high: 0.064 },
    { label: 'B', expected: 1 / 256, estimate: 0.0041, low: 0.0037, high: 0.0045 },
    { label: 'C', expected: 2.47e-4, estimate: 2.4e-4, low: 1.8e-4, high: 3.2e-4 },
  ];
  const svg = renderIntervalDots({ id: 'i', title: 'T', desc: 'D', rows, xLabel: 'Probability' });
  assert.equal(count(svg, 'class="chart__point"'), 3);
  assert.equal(count(svg, 'class="chart__interval"'), 3);
  assert.equal(count(svg, 'class="chart__expected-mark"'), 3);
  assert.equal(count(svg, 'class="chart__row-label"'), 3);
  // Decade ticks from 10^-4 to 10^0 cover the data.
  assert.ok(svg.includes('10<tspan class="chart__sup" dy="-0.5em" font-size="75%">−4</tspan>'));
  // The estimate of the larger probability lies to the right of the smaller one.
  const cx = [...svg.matchAll(/class="chart__point" cx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(cx[0] > cx[1] && cx[1] > cx[2]);
});

test('capacity bars draw a hollow total and a filled part per row', () => {
  const rows = [
    { label: 'Entropy', total: 128, part: 128 },
    { label: 'Mnemonic', total: 132, part: 128 },
    { label: 'Seed', total: 512, part: 128 },
  ];
  const svg = renderCapacityBars({ id: 'cb', title: 'T', desc: 'D', rows, totalLabel: 'Representation', partLabel: 'Entropy' });
  assert.equal(count(svg, 'class="chart__capacity"'), 3);
  assert.equal(count(svg, 'class="chart__bar"'), 3);
  assert.equal(count(svg, 'chart__swatch'), 2, 'the legend shows both marks');
  assert.equal(count(svg, 'class="chart__row-label"'), 3);
  assert.ok(svg.includes('>128 of 512<'));
  const widths = [...svg.matchAll(/class="chart__capacity" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(widths[2] / widths[0] - 4) < 0.01, 'bar length is proportional to the bits');
  // With max 512 the nice ticks stop at 500; the axis gains a tick so the longest bar stays inside the frame.
  const wide = renderCapacityBars({ id: 'cb2', title: 'T', desc: 'D', rows, max: 512 });
  const frameW = Number(wide.match(/class="chart__frame" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/)[1]);
  const longest = Math.max(...[...wide.matchAll(/class="chart__capacity" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1])));
  assert.ok(longest <= frameW + 0.05, `bar ${longest} exceeds the frame ${frameW}`);
});

/* Frame rectangle [x, y, width, height] of a chart. */
const frameOf = (svg) => svg.match(/class="chart__frame" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
const inside = ([fx, fy, fw, fh], x, y) => x >= fx - 0.05 && x <= fx + fw + 0.05 && y >= fy - 0.05 && y <= fy + fh + 0.05;

test('histogram edge ticks label the bin boundaries instead of the bins', () => {
  const bins = Array.from({ length: 16 }, (_, k) => ({ label: String(k), observed: 10, expected: 10 }));
  const edgeTicks = [0, 4, 8, 12, 16].map((at) => ({ at, label: String(at / 16) }));
  const svg = renderHistogram({ id: 'he', title: 'T', desc: 'D', bins, edgeTicks, width: 400, height: 260 });
  assert.equal(count(svg, 'class="chart__xlabel"'), 5);
  const [fx, , fw] = frameOf(svg);
  const xs = [...svg.matchAll(/class="chart__xlabel" x="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(xs[0] - fx) < 0.1 && Math.abs(xs[4] - (fx + fw)) < 0.1, 'first and last ticks on the frame edges');
  assert.ok(Math.abs(xs[2] - (fx + fw / 2)) < 0.1, 'the middle edge sits halfway');
  assert.ok(svg.includes('>0.5<'));
});

test('curve scatter accepts an explicit point radius', () => {
  const svg = renderCurveScatter({ id: 'sr', title: 'T', desc: 'D', p: 17, points: [{ x: 1, y: 5 }], width: 300, radius: 4 });
  assert.ok(/class="chart__point" cx="[\d.]+" cy="[\d.]+" r="4"/.test(svg));
});

test('scatter draws each series, breaks connecting lines at gaps, and draws the identity and vertical marks', () => {
  const series = [
    { key: 'seq', points: [{ x: 1, y: 2 }, { x: 2, y: 5 }, { x: 3, y: null }, { x: 4, y: 1 }, { x: 5, y: 3 }], connect: true },
    { key: 'pairs', label: 'Pairs', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 2 }], mark: 'ring' },
  ];
  const svg = renderScatter({
    id: 'sc',
    title: 'T',
    desc: 'D',
    series,
    xDomain: [0, 6],
    yDomain: [0, 6],
    identity: true,
    vMarks: [{ x: 3, label: 'O' }],
    legend: true,
    xLabel: 'k',
    yLabel: 'x',
  });
  assert.ok(svg.startsWith('<svg') && svg.includes('role="img"'));
  assert.equal(count(svg, 'class="chart__point"'), 4, 'four finite points in the first series');
  assert.equal(count(svg, 'class="chart__point chart__point--ring"'), 2, 'coincident points are drawn once');
  const trace = svg.match(/class="chart__trace" d="([^"]+)"/)[1];
  assert.equal(count(trace, 'M'), 2, 'the gap at k = 3 starts a new sub-path');
  assert.equal(count(svg, 'class="chart__reference"'), 1);
  assert.equal(count(svg, 'class="chart__half"'), 1);
  assert.ok(svg.includes('>O<') && svg.includes('>Pairs<'));
  const frame = frameOf(svg);
  for (const m of svg.matchAll(/class="chart__point[^"]*" cx="([\d.-]+)" cy="([\d.-]+)"/g)) {
    assert.ok(inside(frame, Number(m[1]), Number(m[2])), `point (${m[1]}, ${m[2]}) inside the frame`);
  }
});

test('a square scatter has a square plot area', () => {
  const svg = renderScatter({ id: 'sq', title: 'T', desc: 'D', series: [{ key: 'a', points: [{ x: 1, y: 1 }] }], xDomain: [0, 10], yDomain: [0, 10], square: true, width: 500, height: 300 });
  const [, , w, h] = frameOf(svg);
  assert.ok(Math.abs(w - h) < 0.1, `${w} × ${h}`);
});

test('line chart draws one path per series, gaps for missing values, marks and power-of-two tick labels', () => {
  const series = [
    { key: 'a', label: 'Repeated addition', points: [{ x: 1, y: null }, { x: 2, y: 1 }, { x: 3, y: 2 }, { x: 4, y: 3 }] },
    { key: 'b', label: 'Double-and-add', points: [{ x: 1, y: null }, { x: 2, y: 0.5 }, { x: 3, y: 1 }, { x: 4, y: 1.3 }] },
  ];
  const svg = renderLineChart({
    id: 'lc',
    title: 'T',
    desc: 'D',
    series,
    marks: [{ x: 3, y: 2, label: 'k = 6' }],
    xDomain: [1, 4],
    yDomain: [0, 4],
    yFormat: 'pow2',
    xLabel: 'Bits',
    yLabel: 'Operations',
  });
  assert.equal(count(svg, 'class="chart__curve chart__curve--'), 2);
  const first = svg.match(/class="chart__curve chart__curve--0"[^>]*d="([^"]+)"/)[1];
  assert.equal(count(first, 'M'), 1, 'the leading null is skipped');
  assert.equal(count(svg, 'class="chart__mark"'), 1);
  assert.ok(svg.includes('>k = 6<') && svg.includes('>Repeated addition<'));
  assert.ok(svg.includes('2<tspan class="chart__sup"'), 'y ticks are printed as powers of two');
  const frame = frameOf(svg);
  for (const m of first.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)) assert.ok(inside(frame, Number(m[1]), Number(m[2])));
});

test('bit profile draws, for every bit, the observed proportion, its exact expectation and the reference range', () => {
  const bits = [
    { observed: 0.5, expected: 0.4995, low: 0.47, high: 0.53 },
    { observed: 0.49, expected: 0.4986, low: 0.47, high: 0.53 },
    { observed: 0.03, expected: 0.0257, low: 0.016, high: 0.035 },
  ];
  const svg = renderBitProfile({ id: 'bp', title: 'T', desc: 'D', bits });
  assert.equal(count(svg, 'class="chart__point"'), 3);
  assert.equal(count(svg, 'class="chart__range"'), 3);
  assert.equal(count(svg, 'class="chart__tick-expected"'), 3);
  assert.equal(count(svg, 'class="chart__reference"'), 1, 'the line at one half');
  const ys = [...svg.matchAll(/class="chart__point" cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(ys[2] > ys[0], 'a smaller proportion is drawn lower');
  const frame = frameOf(svg);
  for (const m of svg.matchAll(/class="chart__point" cx="([\d.]+)" cy="([\d.]+)"/g)) assert.ok(inside(frame, Number(m[1]), Number(m[2])));
});

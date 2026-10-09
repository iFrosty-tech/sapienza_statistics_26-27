/**
 * Chart renderers for the homework figures: pure functions returning SVG (or
 * a small HTML composition for the heat map), usable in Node at build time and
 * in the browser. Everything is drawn in the vocabulary of the site's
 * probability paper: green rulings, an ink frame, printed captions, plot red
 * for data marks, ink for theoretical references. Colours come from CSS
 * classes (see src/styles/hw01.css), never from inline fills, so the print
 * scene and any future theme restyle the figures by tokens alone.
 *
 * Every renderer takes `id`, `title` and `desc` (accessible name and long
 * description), `width` and `height` in CSS pixels, and returns a string.
 */

import { formatNumber } from './probability-plot.js';

const round = (v) => Math.round(v * 10) / 10;

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ scales */

function niceStep(rawStep) {
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const f = rawStep / power;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * power;
}

function decimalsFor(step) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/** Nice tick values covering [min, max] with about `target` intervals. */
function niceTicks(min, max, target = 5) {
  const span = max - min || 1;
  const step = niceStep(span / target);
  const values = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) values.push(+v.toFixed(10));
  return { values, step, decimals: decimalsFor(step) };
}

function layout({ width, height, margin: m }) {
  const narrow = width < 520;
  const margin = { top: 16, right: narrow ? 14 : 28, bottom: 50, left: narrow ? 48 : 60, ...m };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = Math.max(40, height - margin.top - margin.bottom);
  return {
    width,
    height,
    narrow,
    margin,
    plotW,
    plotH,
    left: margin.left,
    right: margin.left + plotW,
    top: margin.top,
    bottom: margin.top + plotH,
  };
}

const linear = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/* ------------------------------------------------------------ primitives */

function svgOpen({ id, width, height, title, desc, className = '' }) {
  return (
    `<svg class="chart${className ? ` ${className}` : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">` +
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`
  );
}

function frame(g) {
  return `<rect class="chart__frame" x="${g.left}" y="${g.top}" width="${round(g.plotW)}" height="${round(g.plotH)}"/>`;
}

function hRulings(g, ys, { major = () => true } = {}) {
  return ys
    .map(
      ({ value, y }) =>
        `<line class="chart__ruling${major(value) ? ' is-major' : ''}" x1="${g.left}" x2="${round(g.right)}" y1="${round(y)}" y2="${round(y)}"/>`,
    )
    .join('');
}

function vRulings(g, xs, { major = () => true } = {}) {
  return xs
    .map(
      ({ value, x }) =>
        `<line class="chart__ruling chart__ruling--v${major(value) ? ' is-major' : ''}" x1="${round(x)}" x2="${round(x)}" y1="${g.top}" y2="${round(g.bottom)}"/>`,
    )
    .join('');
}

function yLabels(g, ticks) {
  return ticks
    .map(
      ({ label, y }) =>
        `<text class="chart__ylabel" x="${g.left - 7}" y="${round(y)}" text-anchor="end" dominant-baseline="middle">${label}</text>`,
    )
    .join('');
}

function xLabels(g, ticks) {
  return ticks
    .map(
      ({ label, x }) => `<text class="chart__xlabel" x="${round(x)}" y="${round(g.bottom + 17)}" text-anchor="middle">${label}</text>`,
    )
    .join('');
}

function axisTitles(g, xLabel, yLabel) {
  const parts = [];
  if (yLabel) {
    parts.push(
      `<text class="chart__axis-title" transform="translate(14 ${round(g.top + g.plotH / 2)}) rotate(-90)" text-anchor="middle">${escapeXml(yLabel)}</text>`,
    );
  }
  if (xLabel) {
    parts.push(
      `<text class="chart__axis-title" x="${round(g.left + g.plotW / 2)}" y="${round(g.bottom + 40)}" text-anchor="middle">${escapeXml(xLabel)}</text>`,
    );
  }
  return parts.join('');
}

/** "2^k" or "10^k" with a superscript. */
function powerLabel(base, k) {
  return `${base}<tspan class="chart__sup" dy="-0.5em" font-size="75%">${k}</tspan>`;
}

/* ----------------------------------------------------------- histogram */

/**
 * Bars for observed counts with an optional stepped line of expected counts.
 * @param {{ id: string, title: string, desc: string, bins: { label: string, observed: number, expected?: number }[],
 *   width?: number, height?: number, xLabel?: string, yLabel?: string, labelEvery?: number, yMax?: number }} options
 */
export function renderHistogram({
  id,
  title,
  desc,
  bins,
  width = 960,
  height = 400,
  xLabel = '',
  yLabel = 'Count',
  labelEvery = 1,
  yMax,
}) {
  const g = layout({ width, height });
  const hasExpected = bins.some((b) => typeof b.expected === 'number');
  const dataMax = Math.max(1, ...bins.map((b) => Math.max(b.observed, b.expected ?? 0)));
  const top = yMax ?? dataMax * 1.08;
  const yTicks = niceTicks(0, top, g.narrow ? 4 : 5);
  // The axis ends on the last nice tick, which must sit at or above the tallest bar; when the
  // nice step rounds below the data maximum, one more tick is added so no bar leaves the frame.
  if (yTicks.values.at(-1) < dataMax) yTicks.values.push(+(yTicks.values.at(-1) + yTicks.step).toFixed(10));
  const y = linear(0, yTicks.values.at(-1) || top, g.bottom, g.top);
  const bandW = g.plotW / bins.length;
  const gap = bandW > 6 ? Math.min(3, bandW * 0.18) : bandW > 2.5 ? 0.6 : 0;
  const x = (i) => g.left + i * bandW;
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--histogram' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, yTicks.values.map((value) => ({ value, y: y(value) })), { major: (v) => v !== 0 }));
  out.push(frame(g), '</g>');

  out.push('<g class="chart__bars" aria-hidden="true">');
  bins.forEach((b, i) => {
    const h = g.bottom - y(b.observed);
    out.push(
      `<rect class="chart__bar" x="${round(x(i) + gap / 2)}" y="${round(g.bottom - h)}" width="${round(Math.max(0.4, bandW - gap))}" height="${round(h)}"/>`,
    );
  });
  out.push('</g>');

  if (hasExpected) {
    const d = bins
      .map((b, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))},${round(y(b.expected ?? 0))}H${round(x(i + 1))}`)
      .join('');
    out.push(`<path class="chart__expected" d="${d}" aria-hidden="true"/>`);
  }

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, yTicks.values.map((value) => ({ label: formatNumber(value, yTicks.decimals), y: y(value) }))));
  const labelled = bins
    .map((b, i) => ({ label: escapeXml(b.label), x: x(i) + bandW / 2, i }))
    .filter(({ i }) => i % labelEvery === 0);
  out.push(xLabels(g, labelled));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* -------------------------------------------------------------- z strip */

/**
 * The standardised frequency of each output bit as a lollipop, with the
 * ±1.96 and ±3 bands an ideal hash would respect 95% and 99.7% of the time.
 */
export function renderZStrip({ id, title, desc, z, width = 960, height = 320, xLabel = 'Output bit position j', yLabel = 'z-score' }) {
  const g = layout({ width, height });
  const extent = Math.max(4.5, ...z.map((v) => Math.abs(v) + 0.5));
  const y = linear(-extent, extent, g.bottom, g.top);
  const bandW = g.plotW / z.length;
  const x = (j) => g.left + (j + 0.5) * bandW;
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--zstrip' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  const yTicks = [];
  for (let v = -Math.floor(extent); v <= Math.floor(extent); v += 1) yTicks.push(v);
  out.push(hRulings(g, yTicks.filter((v) => v !== 0).map((value) => ({ value, y: y(value) })), { major: () => false }));
  const xTicks = [];
  for (let j = 0; j <= z.length; j += 32) xTicks.push({ value: j, x: g.left + j * bandW });
  out.push(vRulings(g, xTicks.filter((t) => t.value > 0 && t.value < z.length)));
  for (const [level, cls] of [
    [1.96, 'chart__band chart__band--two'],
    [3, 'chart__band chart__band--three'],
  ]) {
    for (const s of [-1, 1]) {
      out.push(`<line class="${cls}" x1="${g.left}" x2="${round(g.right)}" y1="${round(y(s * level))}" y2="${round(y(s * level))}"/>`);
    }
    out.push(
      `<text class="chart__bandlabel" x="${round(g.right - 4)}" y="${round(y(level) - 3)}" text-anchor="end">±${level}</text>`,
    );
  }
  out.push(`<line class="chart__zero" x1="${g.left}" x2="${round(g.right)}" y1="${round(y(0))}" y2="${round(y(0))}"/>`);
  out.push(frame(g), '</g>');

  const r = g.narrow ? 1.4 : 1.9;
  out.push('<g class="chart__data" aria-hidden="true">');
  z.forEach((v, j) => {
    out.push(
      `<line class="chart__lollipop" x1="${round(x(j))}" x2="${round(x(j))}" y1="${round(y(0))}" y2="${round(y(v))}"/>`,
      `<circle class="chart__point" cx="${round(x(j))}" cy="${round(y(v))}" r="${r}"/>`,
    );
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, yTicks.filter((v) => v % 2 === 0).map((value) => ({ label: formatNumber(value, 0), y: y(value) }))));
  out.push(xLabels(g, xTicks.map((t) => ({ label: String(t.value), x: t.x }))));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------ collision curve */

/**
 * Probability of at least one collision against the sample size: the exact
 * birthday curve as a line, the empirical frequencies as points with 95%
 * binomial error bars. The bars are the binomial standard error of the subset
 * proportion for the fixed pool the subsets are drawn from; they do not
 * measure the uncertainty of the birthday law, since the subsets overlap.
 */
export function renderCollisionCurve({
  id,
  title,
  desc,
  points,
  theory,
  subsets,
  halfPoint,
  width = 960,
  height = 400,
  xLabel = 'Sample size m',
  yLabel = 'P(at least one collision)',
}) {
  const g = layout({ width, height });
  const mMax = Math.max(...points.map((p) => p.m), ...theory.map((t) => t.m));
  const xTicks = niceTicks(0, mMax, g.narrow ? 4 : 8);
  const x = linear(0, mMax, g.left, g.right);
  const y = linear(0, 1, g.bottom, g.top);
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--collision' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, [0.25, 0.5, 0.75].map((value) => ({ value, y: y(value) })), { major: (v) => v === 0.5 }));
  out.push(vRulings(g, xTicks.values.filter((v) => v > 0 && v < mMax).map((value) => ({ value, x: x(value) })), { major: () => false }));
  if (halfPoint) {
    out.push(
      `<line class="chart__half" x1="${round(x(halfPoint))}" x2="${round(x(halfPoint))}" y1="${g.top}" y2="${round(g.bottom)}"/>`,
      `<text class="chart__annotation" x="${round(x(halfPoint) + 6)}" y="${round(g.top + 14)}">P = ½ at m = ${halfPoint}</text>`,
    );
  }
  out.push(frame(g), '</g>');

  const d = theory.map((t, i) => `${i === 0 ? 'M' : 'L'}${round(x(t.m))},${round(y(t.p))}`).join('');
  out.push(`<path class="chart__theory" d="${d}" aria-hidden="true"/>`);

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const p of points) {
    const se = Math.sqrt((p.empirical * (1 - p.empirical)) / subsets);
    const lo = Math.max(0, p.empirical - 1.96 * se);
    const hi = Math.min(1, p.empirical + 1.96 * se);
    out.push(
      `<line class="chart__errorbar" x1="${round(x(p.m))}" x2="${round(x(p.m))}" y1="${round(y(lo))}" y2="${round(y(hi))}"/>`,
      `<circle class="chart__point" cx="${round(x(p.m))}" cy="${round(y(p.empirical))}" r="${g.narrow ? 3 : 3.75}"/>`,
    );
  }
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, [0, 0.25, 0.5, 0.75, 1].map((value) => ({ label: formatNumber(value, 2), y: y(value) }))));
  out.push(xLabels(g, xTicks.values.map((value) => ({ label: formatNumber(value, xTicks.decimals), x: x(value) }))));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------------- log–log */

function log2Ticks(min, max, target) {
  const steps = [1, 2, 4, 8, 16, 32, 64];
  const span = max - min;
  const step = steps.find((s) => span / s <= target) ?? 64;
  const values = [];
  for (let k = Math.ceil(min / step) * step; k <= max + 1e-9; k += step) values.push(k);
  return values;
}

/**
 * The part of the line y = f + exponent · x that lies inside xRange × yRange, as
 * [xa, ya, xb, yb] in data coordinates, or null when the line misses the rectangle.
 */
export function clipLineToRange(exponent, f, xRange, yRange) {
  let xa = xRange[0];
  let xb = xRange[1];
  if (exponent === 0) {
    if (f < yRange[0] || f > yRange[1]) return null;
  } else {
    const atY0 = (yRange[0] - f) / exponent;
    const atY1 = (yRange[1] - f) / exponent;
    xa = Math.max(xa, Math.min(atY0, atY1));
    xb = Math.min(xb, Math.max(atY0, atY1));
  }
  if (!(xa < xb)) return null;
  return [xa, f + exponent * xa, xb, f + exponent * xb];
}

function logPanel({ g, series, references, marks, xRange, yRange, label, showSeriesLabels, dense }) {
  const lx = (v) => Math.log2(v);
  const x = linear(xRange[0], xRange[1], g.left, g.right);
  const y = linear(yRange[0], yRange[1], g.bottom, g.top);
  const out = [];
  out.push('<g class="chart__rulings" aria-hidden="true">');
  const xt = log2Ticks(xRange[0], xRange[1], dense ? 6 : 8);
  const yt = log2Ticks(yRange[0], yRange[1], dense ? 5 : 8);
  out.push(hRulings(g, yt.map((k) => ({ value: k, y: y(k) })), { major: () => false }));
  out.push(vRulings(g, xt.map((k) => ({ value: k, x: x(k) })), { major: () => false }));
  out.push(frame(g), '</g>');

  out.push('<g class="chart__references" aria-hidden="true">');
  for (const ref of references) {
    const f = Math.log2(ref.factor ?? 1);
    // The reference line log2 y = f + exponent · log2 x is cut to the panel so that a steep
    // law (n/2 in the measured panel) does not run past the frame into the caption.
    const segment = clipLineToRange(ref.exponent, f, xRange, yRange);
    if (!segment) continue;
    const [xa, ya, xb, yb] = segment;
    out.push(
      `<line class="chart__reference" x1="${round(x(xa))}" y1="${round(y(ya))}" x2="${round(x(xb))}" y2="${round(y(yb))}"/>`,
    );
    out.push(
      `<text class="chart__annotation" x="${round(x(xb) - 4)}" y="${round(y(yb) - 5)}" text-anchor="end">${escapeXml(ref.label)}</text>`,
    );
  }
  out.push('</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const s of series) {
    for (const p of s.points) {
      out.push(
        `<circle class="chart__point chart__point--${s.key}" cx="${round(x(lx(p.x)))}" cy="${round(y(lx(p.y)))}" r="${dense ? 3 : 3.75}"/>`,
      );
    }
    if (showSeriesLabels && s.points.length) {
      const last = s.points[s.points.length - 1];
      out.push(
        `<text class="chart__series-label" x="${round(x(lx(last.x)) + 8)}" y="${round(y(lx(last.y)) + 4)}">${escapeXml(s.label)}</text>`,
      );
    }
  }
  for (const m of marks) {
    const mx = x(lx(m.x));
    const my = y(lx(m.y));
    // `dy` shifts a label vertically (CSS pixels) so that marks close on the axis keep separate labels.
    out.push(
      `<circle class="chart__mark" cx="${round(mx)}" cy="${round(my)}" r="5"/>`,
      `<text class="chart__annotation" x="${round(mx - 9)}" y="${round(my + 4 + (m.dy ?? 0))}" text-anchor="end">${escapeXml(m.label)}</text>`,
    );
  }
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, yt.map((k) => ({ label: powerLabel(2, k), y: y(k) }))));
  out.push(xLabels(g, xt.map((k) => ({ label: powerLabel(2, k), x: x(k) }))));
  if (label) {
    out.push(`<text class="chart__panel-title" x="${g.left + 6}" y="${g.top + 15}">${escapeXml(label)}</text>`);
  }
  out.push('</g>');
  return out.join('');
}

/**
 * Operations against group order on log₂ axes, in two panels: a close view
 * of the measured curves and the full range up to secp256k1.
 * @param {{ series: { key: string, label: string, points: { x: number, y: number }[] }[],
 *   references?: { label: string, exponent: number, factor?: number }[],
 *   marks?: { x: number, y: number, label: string, dy?: number }[] }} options
 */
export function renderLogLog({
  id,
  title,
  desc,
  series,
  references = [],
  marks = [],
  width = 960,
  height,
  xLabel = 'Group order n',
  yLabel = 'Point operations',
}) {
  const stacked = width < 600;
  const h = height ?? (stacked ? 640 : 400);
  const out = [svgOpen({ id, width, height: h, title, desc, className: 'chart--loglog' })];
  const allX = series.flatMap((s) => s.points.map((p) => Math.log2(p.x)));
  const allY = series.flatMap((s) => s.points.map((p) => Math.log2(p.y)));
  const zoomX = [Math.floor(Math.min(...allX)) - 1, Math.ceil(Math.max(...allX)) + 1];
  const zoomY = [Math.max(0, Math.floor(Math.min(...allY)) - 1), Math.ceil(Math.max(...allY)) + 1];
  const fullX = [0, Math.ceil(Math.max(...allX, ...marks.map((m) => Math.log2(m.x))) / 32) * 32 + 8];
  const fullY = [0, Math.ceil(Math.max(...allY, ...marks.map((m) => Math.log2(m.y))) / 16) * 16 + 8];

  const panels = stacked
    ? [
        { offset: { x: 0, y: 0 }, size: { width, height: h / 2 } },
        { offset: { x: 0, y: h / 2 }, size: { width, height: h / 2 } },
      ]
    : [
        { offset: { x: 0, y: 0 }, size: { width: width / 2, height: h } },
        { offset: { x: width / 2, y: 0 }, size: { width: width / 2, height: h } },
      ];
  const views = [
    { xRange: zoomX, yRange: zoomY, label: 'Measured range', marks: [], showSeriesLabels: true },
    { xRange: fullX, yRange: fullY, label: 'Extrapolation to secp256k1', marks, showSeriesLabels: false },
  ];
  panels.forEach((panel, i) => {
    const g = layout({ ...panel.size, margin: { right: 18 } });
    out.push(`<g transform="translate(${round(panel.offset.x)} ${round(panel.offset.y)})">`);
    out.push(logPanel({ g, series, references, ...views[i], dense: true }));
    out.push(`<g class="chart__labels" aria-hidden="true">${axisTitles(g, xLabel, i === 0 || stacked ? yLabel : '')}</g>`);
    out.push('</g>');
  });
  out.push('</svg>');
  return out.join('');
}

/* ------------------------------------------------------ curve scatter */

/** All affine points of y² = x³ + 7 over F_p, as a square scatter (the SVG is cut to the square). */
export function renderCurveScatter({ id, title, desc, p, points, width = 960, height }) {
  const h = height ?? Math.min(width, 640);
  const g0 = layout({ width, height: h, margin: { right: 28 } });
  const side = Math.min(g0.plotW, g0.plotH);
  const g = { ...g0, plotW: side, plotH: side, right: g0.left + side, bottom: g0.top + side };
  const svgWidth = g.left + side + g.margin.right;
  const svgHeight = g.top + side + g.margin.bottom;
  const ticks = niceTicks(0, p, g.narrow ? 4 : 6).values.filter((v) => v <= p);
  const x = linear(0, p, g.left, g.right);
  const y = linear(0, p, g.bottom, g.top);
  const out = [svgOpen({ id, width: svgWidth, height: svgHeight, title, desc, className: 'chart--scatter' })];
  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, ticks.filter((v) => v > 0 && v < p).map((value) => ({ value, y: y(value) })), { major: () => false }));
  out.push(vRulings(g, ticks.filter((v) => v > 0 && v < p).map((value) => ({ value, x: x(value) })), { major: () => false }));
  out.push(
    `<line class="chart__mirror" x1="${g.left}" x2="${round(g.right)}" y1="${round(y(p / 2))}" y2="${round(y(p / 2))}"/>`,
    `<text class="chart__annotation" x="${round(g.right - 4)}" y="${round(y(p / 2) - 5)}" text-anchor="end">y = p / 2</text>`,
  );
  out.push(frame(g), '</g>');
  const r = Math.max(1.6, side / 230);
  out.push('<g class="chart__data" aria-hidden="true">');
  for (const pt of points) out.push(`<circle class="chart__point" cx="${round(x(pt.x))}" cy="${round(y(pt.y))}" r="${round(r)}"/>`);
  out.push('</g>');
  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, ticks.map((value) => ({ label: String(value), y: y(value) }))));
  out.push(xLabels(g, ticks.map((value) => ({ label: String(value), x: x(value) }))));
  out.push(axisTitles(g, 'x', 'y'), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------------ Nakamoto */

const DASHES = ['', '7 4', '2 3', '9 3 2 3'];

/**
 * Nakamoto's catch-up probability against the number of confirmations, one
 * curve per attacker share q, on a logarithmic probability axis.
 */
export function renderNakamoto({
  id,
  title,
  desc,
  curves,
  markZ,
  floor = 1e-7,
  width = 960,
  height = 420,
  xLabel = 'Confirmations z',
  yLabel = 'P(attacker catches up)',
}) {
  const g = layout({ width, height, margin: { right: 74 } });
  const zMax = Math.max(...curves.flatMap((c) => c.values.map((v) => v.z)));
  const x = linear(0, zMax, g.left, g.right);
  const yExp = linear(Math.log10(floor), 0, g.bottom, g.top);
  const y = (p) => yExp(Math.log10(Math.max(p, floor)));
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--nakamoto' })];
  const decades = [];
  for (let k = 0; k >= Math.log10(floor); k -= 1) decades.push(k);
  const xTicks = niceTicks(0, zMax, g.narrow ? 5 : 10).values;

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, decades.filter((k) => k !== 0 && k > Math.log10(floor)).map((k) => ({ value: k, y: yExp(k) })), { major: () => false }));
  out.push(vRulings(g, xTicks.filter((v) => v > 0 && v < zMax).map((value) => ({ value, x: x(value) })), { major: () => false }));
  if (markZ !== undefined) {
    out.push(
      `<line class="chart__half" x1="${round(x(markZ))}" x2="${round(x(markZ))}" y1="${g.top}" y2="${round(g.bottom)}"/>`,
      `<text class="chart__annotation" x="${round(x(markZ) + 6)}" y="${round(g.top + 14)}">z = ${markZ}</text>`,
    );
  }
  out.push(frame(g), '</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  curves.forEach((c, i) => {
    const visible = [];
    for (const v of c.values) {
      visible.push(v);
      if (v.p < floor) break;
    }
    const d = visible.map((v, k) => `${k === 0 ? 'M' : 'L'}${round(x(v.z))},${round(y(v.p))}`).join('');
    out.push(`<path class="chart__curve chart__curve--${i}" d="${d}"${DASHES[i % DASHES.length] ? ` stroke-dasharray="${DASHES[i % DASHES.length]}"` : ''}/>`);
    // Curves that leave the sheet through the floor are labelled where they exit, inside the frame.
    const last = visible[visible.length - 1];
    const atFloor = last.p < floor;
    out.push(
      `<text class="chart__series-label" x="${round(atFloor ? x(last.z) + 6 : g.right + 6)}" y="${round(atFloor ? g.bottom - 8 - 14 * (i % 2) : y(last.p) + 4)}" text-anchor="start">${escapeXml(c.label)}</text>`,
    );
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, decades.map((k) => ({ label: k === 0 ? '1' : powerLabel(10, k), y: yExp(k) }))));
  out.push(xLabels(g, xTicks.map((value) => ({ label: String(value), x: x(value) }))));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------------- heat map */

const PAPER = [247, 250, 248];
const INK = [27, 36, 32];

/**
 * The strict-avalanche matrix as a raster: one pixel per (input bit, output
 * bit), paper for "never flips", ink for "always flips", mid-grey for the
 * ideal one half. `rasterize({ width, height, rgba })` must return a data URL
 * (PNG in Node, canvas in the browser).
 * @returns {string} HTML
 */
export function renderHeatMap({ id, rows, cols, flips, trials, rasterize, alt, lo = 0.25, hi = 0.75, xLabel = 'Output bit j', yLabel = 'Input bit i' }) {
  const rgba = new Uint8Array(rows * cols * 4);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = flips[r * cols + c] / trials;
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      const o = (r * cols + c) * 4;
      for (let k = 0; k < 3; k += 1) rgba[o + k] = Math.round(PAPER[k] + (INK[k] - PAPER[k]) * t);
      rgba[o + 3] = 255;
    }
  }
  const src = rasterize({ width: cols, height: rows, rgba });
  const xTicks = [0, 64, 128, 192, 255].filter((v) => v < cols);
  const yTicks = [0, 64, 128, 192, 255].filter((v) => v < rows);
  const tick = (axis, v, size) => `<span class="heatmap__tick" style="--at:${((v + 0.5) / size) * 100}%">${v}</span>`;
  return (
    `<div class="heatmap" id="${id}">` +
    `<div class="heatmap__corner"></div>` +
    `<div class="heatmap__xaxis" aria-hidden="true"><span class="heatmap__axis-title">${escapeXml(xLabel)}</span>${xTicks.map((v) => tick('x', v, cols)).join('')}</div>` +
    `<div class="heatmap__yaxis" aria-hidden="true"><span class="heatmap__axis-title">${escapeXml(yLabel)}</span>${yTicks.map((v) => tick('y', v, rows)).join('')}</div>` +
    `<img class="heatmap__raster" src="${src}" width="${cols}" height="${rows}" alt="${escapeXml(alt)}" decoding="async" />` +
    `<div class="heatmap__legend" aria-hidden="true">` +
    `<svg class="heatmap__scale" viewBox="0 0 200 10" preserveAspectRatio="none" focusable="false"><defs><linearGradient id="${id}-grad"><stop offset="0" stop-color="rgb(${PAPER.join(',')})"/><stop offset="1" stop-color="rgb(${INK.join(',')})"/></linearGradient></defs><rect x="0" y="0" width="200" height="10" fill="url(#${id}-grad)"/></svg>` +
    `<span class="heatmap__legend-ticks"><span>${lo}</span><span>0.5</span><span>${hi}</span></span>` +
    `<span class="heatmap__legend-title">P(output bit flips)</span>` +
    `</div></div>`
  );
}

/**
 * Figures and tables of homework 06, rendered from the summary of
 * src/lib/sampling-study.js as static, printable SVG and HTML.
 *
 *   renderLaw            Fig. 1, the distribution function and a sample of the score law
 *   renderTrajectories   Fig. 2, running x̄ₖ and s²ₖ of a few hackers against exact bands
 *   renderZScores        Fig. 3, the z-scores of the two averages against n
 *   renderBias           Fig. 4, the averages of s²ₙ and SSₙ/n against σ² and σ²(n − 1)/n
 *   renderSpreads        Fig. 5, the spreads across hackers and the ratio to normal theory
 *   renderDistributions  Fig. 6, the laws of x̄ₙ and s²ₙ against their normal approximations
 *   renderPrecision      Fig. 7, the role of m: error of the averages, spread of one hacker
 *   renderCoverage       Fig. 8, the coverage of the two intervals against n
 *   renderScatter        Fig. 9, (x̄ₙ, s²ₙ) across hackers
 *   render…Table         the tables
 *
 * Everything is drawn with the classes of src/styles/hw01.css, hw04-figures.css
 * and hw06-figures.css: green rulings, a green-ink frame, ink for theory and
 * references, plot red only for simulated values. Histograms come from
 * renderHistogram of charts.js; the other panels share a small renderer here,
 * on linear or logarithmic axes.
 */

import katex from 'katex';
import { escapeXml, labelBoard, renderHistogram, richText } from './charts.js';
import { fmt, int, sig } from './penetration-charts.js';
import { MU, SIGMA2, allZeroProbability, normalTheoryVariance, scoreCdf, varianceOfMean, varianceOfVariance } from './score-law.js';

const round = (v) => Math.round(v * 10) / 10;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/*
 * Symbols printed in Libre Franklin lose the macron of x̄ₙ to its neighbour, so that titles and table
 * heads set them in KaTeX and the labels inside the drawings name the estimates in words.
 */
const tex = (source) => katex.renderToString(source, { throwOnError: true, output: 'htmlAndMathml' });
const XBAR = tex('\\bar{x}_n');
const S2 = tex('s_n^2');

/* The narrow drawing of a single-panel figure, as in homework 04. */
const NARROW_WIDTH = 340;

/* ------------------------------------------------------------ axes */

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}

function linearTicks(lo, hi, target) {
  const step = niceStep((hi - lo) / target || 1);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) {
    const value = +v.toFixed(10);
    out.push({ value, label: fmt(value, decimals) });
  }
  return out;
}

const decadeLabel = (k) => (k === 0 ? '1' : k === 1 ? '10' : `10^{${k < 0 ? `−${-k}` : k}}`);

function decadeTicks(lo, hi) {
  const out = [];
  for (let k = Math.ceil(Math.log10(lo) - 1e-9); k <= Math.floor(Math.log10(hi) + 1e-9); k += 1) {
    out.push({ value: 10 ** k, label: decadeLabel(k) });
  }
  return out;
}

const linearAxis = (lo, hi, target = 5) => ({ domain: [lo, hi], ticks: linearTicks(lo, hi, target) });
const logAxis = (lo, hi) => ({ log: true, domain: [lo, hi], ticks: decadeTicks(lo, hi) });

/* The axis of n: a little past the ends of the grid. */
const nAxis = (ns) => logAxis(Math.min(...ns) * 0.7, Math.max(...ns) * 1.6);

/* Integers evenly spaced on a logarithmic scale, for the exact curves. */
function denseN(from, to, count = 60) {
  const out = new Set();
  for (let i = 0; i <= count; i += 1) out.add(Math.round(from * (to / from) ** (i / count)));
  return [...out];
}

function scaleOf(axis, r0, r1) {
  const t = axis.log ? Math.log10 : (v) => v;
  const [d0, d1] = axis.domain.map(t);
  return (v) => r0 + ((t(v) - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

const valid = (axis, v) => finite(v) && (!axis.log || v > 0);

/* ------------------------------------------------------------ panel */

/**
 * One chart on linear or logarithmic axes: bands (interval areas), ink lines with optional dashes and
 * direct labels, vertical ranges, plot-red points or open rings, and dashed horizontal references.
 * Data are clipped to the plot area; labels are placed by the label board of charts.js.
 */
function panel({ id, title, desc, width, height, x, y, xLabel = '', yLabel = '', bands = [], lines = [], ranges = [], points = [], references = [], pointRadius, className = '' }) {
  const narrow = width < 420;
  const m = { top: 12, right: narrow ? 14 : 16, bottom: 44, left: narrow ? 48 : 56 };
  const plotW = Math.max(40, width - m.left - m.right);
  const plotH = Math.max(40, height - m.top - m.bottom);
  const g = { left: m.left, right: m.left + plotW, top: m.top, bottom: m.top + plotH };
  const X = scaleOf(x, g.left, g.right);
  const Y = scaleOf(y, g.bottom, g.top);
  const clip = `${id}-clip`;
  const out = [
    `<svg class="chart chart--panel ${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
    `<defs><clipPath id="${clip}"><rect x="${g.left}" y="${g.top}" width="${round(plotW)}" height="${round(plotH)}"/></clipPath></defs>`,
  ];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of y.ticks) {
    const ty = Y(t.value);
    if (ty > g.top + 0.5 && ty < g.bottom - 0.5) out.push(`<line class="chart__ruling" x1="${g.left}" x2="${round(g.right)}" y1="${round(ty)}" y2="${round(ty)}"/>`);
  }
  for (const t of x.ticks) {
    const tx = X(t.value);
    if (tx > g.left + 0.5 && tx < g.right - 0.5) out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(tx)}" x2="${round(tx)}" y1="${g.top}" y2="${round(g.bottom)}"/>`);
  }
  out.push(`<rect class="chart__frame" x="${g.left}" y="${g.top}" width="${round(plotW)}" height="${round(plotH)}"/>`, '</g>');

  out.push(`<g clip-path="url(#${clip})" aria-hidden="true">`);
  for (const b of bands) {
    const pts = b.points.filter((p) => valid(x, p.x));
    const upper = pts.map((p, i) => `${i ? 'L' : 'M'}${round(X(p.x))},${round(Y(p.high))}`).join('');
    const lower = [...pts].reverse().map((p) => `L${round(X(p.x))},${round(Y(p.low))}`).join('');
    if (upper) out.push(`<path class="chart__band-area" d="${upper}${lower}Z"/>`);
  }
  out.push('</g>');

  const board = labelBoard({ x0: g.left + 2, x1: g.right - 2, y0: g.top + 2, y1: g.bottom - 2 });
  out.push('<g class="chart__references" aria-hidden="true">');
  for (const ref of references) {
    const ry = Y(ref.y);
    if (!(ry >= g.top && ry <= g.bottom)) continue;
    out.push(`<line class="chart__reference" x1="${g.left}" x2="${round(g.right)}" y1="${round(ry)}" y2="${round(ry)}"/>`);
    board.segment(g.left, ry, g.right, ry);
  }
  out.push('</g>');

  const runs = lines.map((l) => l.points.filter((p) => valid(x, p.x) && valid(y, p.y)).map((p) => [X(p.x), Y(p.y)]));
  runs.forEach((run) => board.polyline(run));
  const inside = (px, py) => px >= g.left - 0.5 && px <= g.right + 0.5 && py >= g.top - 0.5 && py <= g.bottom + 0.5;
  const radius = pointRadius ?? (narrow ? 2.4 : 2.8);
  const dots = points
    .filter((p) => valid(x, p.x) && valid(y, p.y))
    .map((p) => ({ px: X(p.x), py: Y(p.y), r: p.r ?? radius, ring: p.ring }))
    .filter((d) => inside(d.px, d.py));
  dots.forEach((d) => board.circle(d.px, d.py, d.r));
  const spans = ranges.filter((rg) => valid(x, rg.x)).map((rg) => ({ px: X(rg.x), y1: Y(rg.low), y2: Y(rg.high) }));
  spans.forEach((s) => board.segment(s.px, s.y1, s.px, s.y2));

  const labels = [];
  for (const ref of references) {
    const ry = Y(ref.y);
    if (!ref.label || !(ry >= g.top && ry <= g.bottom)) continue;
    const at = board.place(ref.label, { anchors: [[g.right - 4, ry], [g.left + 40, ry]], directions: ref.directions ?? ['nw', 'sw', 'ne', 'se'] });
    labels.push(`<text class="chart__annotation" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(ref.label)}</text>`);
  }
  lines.forEach((l, i) => {
    const all = runs[i].filter(([px, py]) => inside(px, py));
    if (!l.label || !all.length) return;
    const order = [];
    const start = Math.round((all.length - 1) * (l.labelAt ?? 0.6));
    for (let k = 0; order.length < all.length; k += 1) {
      if (start + k < all.length) order.push(all[start + k]);
      if (k > 0 && start - k >= 0) order.push(all[start - k]);
    }
    const at = board.place(l.label, { anchors: order, directions: l.directions ?? ['ne', 'n', 'nw', 'se', 's', 'sw', 'e', 'w'] });
    labels.push(`<text class="chart__series-label" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(l.label)}</text>`);
  });

  out.push(`<g class="chart__data" aria-hidden="true"><g clip-path="url(#${clip})">`);
  for (const s of spans) out.push(`<line class="chart__range" x1="${round(s.px)}" x2="${round(s.px)}" y1="${round(s.y1)}" y2="${round(s.y2)}"/>`);
  lines.forEach((l, i) => {
    const d = runs[i].map(([px, py], k) => `${k ? 'L' : 'M'}${round(px)},${round(py)}`).join('');
    if (d) out.push(`<path class="${l.className ?? 'chart__curve'}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''} d="${d}"/>`);
  });
  out.push('</g>');
  for (const d of dots) out.push(`<circle class="chart__point${d.ring ? ' chart__point--ring' : ''}" cx="${round(d.px)}" cy="${round(d.py)}" r="${d.r}"/>`);
  out.push(...labels, '</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const t of y.ticks) {
    const ty = Y(t.value);
    if (ty >= g.top - 0.5 && ty <= g.bottom + 0.5) out.push(`<text class="chart__ylabel" x="${g.left - 6}" y="${round(ty)}" text-anchor="end" dominant-baseline="middle">${richText(t.label)}</text>`);
  }
  for (const t of x.ticks) {
    const tx = X(t.value);
    if (tx >= g.left - 0.5 && tx <= g.right + 0.5) out.push(`<text class="chart__xlabel" x="${round(tx)}" y="${round(g.bottom + 17)}" text-anchor="middle">${richText(t.label)}</text>`);
  }
  if (yLabel) out.push(`<text class="chart__axis-title" transform="translate(11 ${round(g.top + plotH / 2)}) rotate(-90)" text-anchor="middle">${richText(yLabel)}</text>`);
  if (xLabel) out.push(`<text class="chart__axis-title" x="${round(g.left + plotW / 2)}" y="${round(g.bottom + 37)}" text-anchor="middle">${richText(xLabel)}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/* Panels side by side at the printed width; the sheet stacks them on phones (hw06-figures.css). */
const GAP = 16;
function panels(parts, width, columns = 2) {
  const w = Math.floor((width - GAP * (columns - 1)) / columns);
  const html = parts
    .map((part) => {
      const { title, html: chart } = part(w);
      return `<div class="chart-panel">${title ? `<p class="chart-panel__title">${title}</p>` : ''}${chart}</div>`;
    })
    .join('');
  return `<div class="chart-panels" data-columns="${columns}">${html}</div>`;
}

const panelHeight = (w) => Math.round(Math.min(290, Math.max(230, w * 0.8)));

/* A drawing for the printed page and one for phones; only one is displayed (hw04-figures.css). */
const swap = (draw, id, width) =>
  `<div class="chart-swap"><div class="chart-swap__wide">${draw(id, width)}</div><div class="chart-swap__narrow">${draw(`${id}-narrow`, NARROW_WIDTH)}</div></div>`;

/* ------------------------------------------------------------ Fig. 1, the law */

/** The distribution function with its atom at 0, and the sample above 0 against the flat density. */
export function renderLaw(sample, { id, width = 640 }) {
  const { size, zeros, counts, expectedPerBin } = sample;
  const cdf = (w) => {
    const empirical = [{ x: 0, y: zeros / size }];
    let total = zeros;
    counts.forEach((c, i) => {
      total += c;
      empirical.push({ x: i + 1, y: total / size });
    });
    return {
      title: 'Distribution function',
      html: panel({
        id: `${id}-cdf`,
        title: 'Distribution function of the score, with a jump of 0.7 at 0',
        desc: `The exact distribution function F(x) = 0.7 + 0.03x on [0, 10] (line), with its jump at 0 (dashed), and the empirical distribution function of ${int(size)} simulated scores at the whole numbers (red points).`,
        width: w,
        height: panelHeight(w),
        x: linearAxis(-1, 11, 6),
        y: linearAxis(0, 1, 5),
        xLabel: 'Score x',
        yLabel: 'F(x)',
        lines: [
          { points: [{ x: -1, y: 0 }, { x: 0, y: 0 }] },
          { points: [{ x: 0, y: 0 }, { x: 0, y: scoreCdf(0) }], dash: '3 3', className: 'chart__curve chart__curve--bound' },
          { points: [0, 10, 11].map((v) => ({ x: v, y: scoreCdf(v) })), label: 'F(x) = 0.7 + 0.03x', labelAt: 0.3, directions: ['se', 's', 'e'] },
        ],
        points: empirical,
      }),
    };
  };
  const histogram = (w) => ({
    title: 'Scores above 0',
    html: renderHistogram({
      id: `${id}-hist`,
      title: 'Histogram of the simulated scores above 0',
      desc: `The ${int(size - zeros)} scores above 0 among ${int(size)} simulated scores, in ten bins of width 1, against the expected count of ${fmt(expectedPerBin, 0)} per bin under the flat density.`,
      bins: counts.map((c, i) => ({ label: String(i), observed: c, expected: expectedPerBin })),
      width: w,
      height: panelHeight(w),
      xLabel: 'Score x',
      yLabel: 'Scores per bin',
      edgeTicks: [0, 2, 4, 6, 8, 10].map((v) => ({ at: v, label: String(v) })),
    }),
  });
  return panels([cdf, histogram], width);
}

/* ------------------------------------------------------------ Fig. 2, trajectories */

/** Running x̄ₖ and s²ₖ of a few hackers, against the exact mean ± 2 sd. */
export function renderTrajectories(tr, { id, width = 640 }) {
  const { k, band, paths, n, m } = tr;
  const last = k.length - 1;
  const quantity = ({ key, sd, centre, domain, name, symbol, centreLabel }) => (w) => ({
    title: `${name}, ${tex(symbol)}`,
    html: panel({
      id: `${id}-${key}`,
      title: `${name} of ${m} hackers against the number of systems attempted`,
      desc: `Each thin line follows one hacker's running ${name.toLowerCase()} over ${int(n)} systems, on a logarithmic axis of k; the shaded band is the theoretical value plus or minus two exact standard deviations at every k, cut at 0; the dashed line is the theoretical value ${centreLabel}; the red points are the estimates after the last system.`,
      width: w,
      height: panelHeight(w),
      x: logAxis(2, n * 1.15),
      y: linearAxis(domain[0], domain[1], 5),
      xLabel: 'Systems attempted, k',
      yLabel: name,
      bands: [{ points: k.map((step, i) => ({ x: step, low: Math.max(0, centre - 2 * sd[i]), high: centre + 2 * sd[i] })) }],
      references: [{ y: centre, label: centreLabel, directions: ['nw', 'ne', 'sw'] }],
      lines: paths.map((p) => ({ points: k.map((step, i) => ({ x: step, y: p[key][i] })), className: 'chart__path' })),
      points: paths.map((p) => ({ x: k[last], y: p[key][last] })),
    }),
  });
  return panels(
    [
      quantity({ key: 'mean', sd: band.sdMean, centre: MU, domain: [0, 5], name: 'Running mean', symbol: '\\bar{x}_k', centreLabel: 'μ = 1.5' }),
      quantity({ key: 'variance', sd: band.sdVariance, centre: SIGMA2, domain: [0, 30], name: 'Running variance', symbol: 's_k^2', centreLabel: 'σ² = 7.75' }),
    ],
    width,
  );
}

/* ------------------------------------------------------------ Fig. 3, z-scores */

/** The standardised deviation of each average from its theoretical value, against n. */
export function renderZScores(experiments, { id, width = 640 }) {
  const ns = experiments.map((e) => e.n);
  const band = [ns.at(0) * 0.7, ns.at(-1) * 1.6].map((x) => ({ x, low: -2, high: 2 }));
  const quantity = ({ key, field, symbol, truth, symbolHtml, truthTex }) => (w) => ({
    title: `Average of ${symbolHtml} against ${tex(truthTex)}`,
    html: panel({
      id: `${id}-${key}`,
      title: `z-scores of the average of ${symbol} against n`,
      desc: `For each n, the deviation of the average of ${symbol} over the hackers from ${truth}, in exact standard errors (red points); the shaded band marks plus or minus two standard errors. Values: ${experiments.map((e) => `n = ${int(e.n)}: ${fmt(e[field], 2)}`).join('; ')}.`,
      width: w,
      height: Math.round(panelHeight(w) * 0.82),
      x: nAxis(ns),
      y: linearAxis(-3.5, 3.5, 4),
      xLabel: 'Systems n',
      yLabel: 'z',
      bands: [{ points: band }],
      references: [{ y: 0 }],
      points: experiments.map((e) => ({ x: e.n, y: e[field] })),
    }),
  });
  return panels(
    [
      quantity({ key: 'mean', field: 'zMean', symbol: 'x̄ₙ', truth: 'μ', symbolHtml: XBAR, truthTex: '\\mu' }),
      quantity({ key: 'variance', field: 'zVariance', symbol: 's²ₙ', truth: 'σ²', symbolHtml: S2, truthTex: '\\sigma^2' }),
    ],
    width,
  );
}

/* ------------------------------------------------------------ Fig. 4, bias */

/** The average of s²ₙ stays on σ²; the average of SSₙ/n follows σ²(n − 1)/n. */
export function renderBias(experiments, { id, width = 640 }) {
  const ns = experiments.map((e) => e.n);
  const draw = (svgId, w) =>
    panel({
      id: svgId,
      title: 'The averages of the two variance estimators against n',
      desc: `The average of s²ₙ = SSₙ/(n − 1) over the hackers (red points) stays on σ² = ${SIGMA2} (dashed line); the average of SSₙ/n (open rings) follows σ²(n − 1)/n (solid line), which starts at half of σ² for n = 2 and approaches σ² as n grows.`,
      width: w,
      height: Math.round(Math.min(300, Math.max(230, w * 0.5))),
      x: nAxis(ns),
      y: linearAxis(0, 10, 5),
      xLabel: 'Systems n',
      yLabel: 'Average across hackers',
      references: [{ y: SIGMA2, label: 'σ² = 7.75', directions: ['ne', 'nw', 'se'] }],
      lines: [
        {
          points: denseN(ns.at(0), ns.at(-1)).map((n) => ({ x: n, y: (SIGMA2 * (n - 1)) / n })),
          label: 'σ²(n − 1)/n',
          labelAt: 0.12,
          directions: ['se', 'e', 's'],
        },
      ],
      points: [
        ...experiments.map((e) => ({ x: e.n, y: e.meanOfSsOverN, ring: true })),
        ...experiments.map((e) => ({ x: e.n, y: e.meanOfVariances })),
      ],
    });
  return swap(draw, id, width);
}

/* ------------------------------------------------------------ Fig. 5, spreads */

/** The spreads across hackers on log–log axes, and the true Var(s²ₙ) against the normal-theory value. */
export function renderSpreads(experiments, summary, { id, width = 640 }) {
  const ns = experiments.map((e) => e.n);
  const dense = denseN(ns.at(0), ns.at(-1));
  const spreads = (w) => ({
    title: 'Standard deviations across hackers',
    html: panel({
      id: `${id}-sd`,
      title: 'Standard deviation of the sampling means and variances across hackers against n',
      desc: `Simulated standard deviations (red points) and the exact ones (lines) on logarithmic axes. Fitted slopes ${fmt(summary.slopeMean, 3)} for the means and ${fmt(summary.slopeVariance, 3)} for the variances.`,
      width: w,
      height: panelHeight(w),
      x: nAxis(ns),
      y: logAxis(0.01, 30),
      xLabel: 'Systems n',
      yLabel: 'SD across hackers',
      lines: [
        { points: dense.map((n) => ({ x: n, y: Math.sqrt(varianceOfVariance(n)) })), label: 'sampling variances', labelAt: 0.55, directions: ['ne', 'n', 'e'] },
        { points: dense.map((n) => ({ x: n, y: Math.sqrt(varianceOfMean(n)) })), label: 'sampling means', labelAt: 0.45, directions: ['sw', 's', 'w'] },
      ],
      points: experiments.flatMap((e) => [{ x: e.n, y: e.sdMean }, { x: e.n, y: e.sdVariance }]),
    }),
  });
  const ratio = (w) => ({
    title: `${tex('\\mathrm{Var}(s_n^2)')} against normal theory`,
    html: panel({
      id: `${id}-ratio`,
      title: 'Ratio of the variance of s² to its normal-theory value against n',
      desc: `The exact ratio of Var(s²ₙ) to 2σ⁴/(n − 1) (line), which tends to (κ − 1)/2 = ${fmt(summary.varianceRatioLimit, 3)}, and the same ratio with the simulated variance (red points); the dashed line at 1 is the value for normal scores.`,
      width: w,
      height: panelHeight(w),
      x: nAxis(ns),
      y: linearAxis(0.75, 2, 5),
      xLabel: 'Systems n',
      yLabel: 'Ratio',
      references: [{ y: 1, label: 'normal scores', directions: ['ne', 'nw', 'se'] }],
      lines: [{ points: dense.map((n) => ({ x: n, y: varianceOfVariance(n) / normalTheoryVariance(n) })), label: 'exact', labelAt: 0.2, directions: ['sw', 's', 'se'] }],
      points: experiments.map((e) => ({ x: e.n, y: e.sdVariance ** 2 / normalTheoryVariance(e.n) })),
    }),
  });
  return panels([spreads, ratio], width);
}

/* ------------------------------------------------------------ Fig. 6, distributions */

/* Edge labels at round values of a histogram's axis. */
function edgeLabels(h) {
  const width = h.edges[1] - h.edges[0];
  const low = h.edges[0];
  return linearTicks(low, h.edges.at(-1), 4).map((t) => ({ at: (t.value - low) / width, label: t.label }));
}

/** The law of x̄ₙ and of s²ₙ across hackers at a few n, against N(μ, σ²/n) and N(σ², Var(s²ₙ)). */
export function renderDistributions(blocks, { id, width = 640, m }) {
  const parts = blocks.flatMap((block) =>
    [
      { key: 'mean', symbol: 'x̄ₙ', symbolHtml: XBAR, name: 'Sampling mean', law: `N(μ, σ²/${int(block.n)})` },
      { key: 'variance', symbol: 's²ₙ', symbolHtml: S2, name: 'Sampling variance', law: `N(σ², Var(s²ₙ))` },
    ].map(({ key, symbol, symbolHtml, name, law }) => (w) => {
      const h = block[key];
      return {
        title: `${symbolHtml} at n = ${int(block.n)}`,
        html: renderHistogram({
          id: `${id}-${key}-n${block.n}`,
          title: `Distribution of ${symbol} at n = ${int(block.n)}`,
          desc: `Histogram of ${symbol} across ${int(m)} simulated hackers at n = ${int(block.n)} (bars), against the expected counts of the normal approximation ${law} (stepped line).`,
          bins: h.counts.map((c, i) => ({ label: fmt(h.edges[i], 2), observed: c, expected: h.expected[i] })),
          width: w,
          height: Math.round(panelHeight(w) * 0.8),
          xLabel: name,
          yLabel: '',
          edgeTicks: edgeLabels(h),
        }),
      };
    }),
  );
  return panels(parts, width);
}

/* ------------------------------------------------------------ Fig. 7, precision */

/** At fixed n, the error of the averages falls as 1/√m and the spread of one hacker does not move. */
export function renderPrecision(precision, { id, width = 640 }) {
  const { rows, n, exactSdMean, exactSdVariance } = precision;
  const sizes = rows.map((r) => r.size);
  const axis = logAxis(sizes.at(0) * 0.7, sizes.at(-1) * 1.5);
  const quantity = ({ key, symbol, symbolHtml, exactSd, slope, rms, spread, se }) => (w) => {
    const low = 10 ** Math.floor(Math.log10(Math.min(...rows.map((r) => r[rms]))) - 0.1);
    const high = 10 ** Math.ceil(Math.log10(exactSd * 1.5));
    return {
      title: `${symbolHtml} · fitted slope ${fmt(slope, 3)}`,
      html: panel({
        id: `${id}-${key}`,
        title: `Error of the average of ${symbol} and spread of one hacker's ${symbol} against m`,
        desc: `At n = ${int(n)}, the root mean square error of the average of ${symbol} over groups of m hackers (red points) falls along the exact standard error (line); the spread of a single hacker's ${symbol} inside a group (open rings) stays on its exact value (dashed line) whatever m is.`,
        width: w,
        height: panelHeight(w),
        x: axis,
        y: logAxis(low, high),
        xLabel: 'Hackers m',
        yLabel: 'Error or spread',
        references: [{ y: exactSd, label: 'one hacker', directions: ['sw', 'se', 'nw'] }],
        lines: [{ points: rows.map((r) => ({ x: r.size, y: r[se] })), label: 'standard error', labelAt: 0.4, directions: ['ne', 'n', 'e'] }],
        points: [...rows.map((r) => ({ x: r.size, y: r[spread], ring: true })), ...rows.map((r) => ({ x: r.size, y: r[rms] }))],
      }),
    };
  };
  return panels(
    [
      quantity({ key: 'mean', symbol: 'x̄ₙ', symbolHtml: XBAR, exactSd: exactSdMean, slope: precision.slopeMean, rms: 'rmsMean', spread: 'spreadMean', se: 'seMean' }),
      quantity({ key: 'variance', symbol: 's²ₙ', symbolHtml: S2, exactSd: exactSdVariance, slope: precision.slopeVariance, rms: 'rmsVariance', spread: 'spreadVariance', se: 'seVariance' }),
    ],
    width,
  );
}

/* ------------------------------------------------------------ Fig. 8, coverage */

/** The coverage of the two 95% intervals against n, with Wilson intervals. */
export function renderCoverage(experiments, summary, { id, width = 640, m }) {
  const ns = experiments.map((e) => e.n);
  const ceiling = denseN(ns.at(0), ns.at(-1)).map((n) => ({ x: n, y: 1 - allZeroProbability(n) }));
  const interval = ({ key, name, references, truth }) => (w) => ({
    title: `${name} · ${fmt(experiments.at(-1).coverage[key].rate, 3)} at n = ${int(ns.at(-1))}`,
    html: panel({
      id: `${id}-${key}`,
      title: `Coverage of the 95% ${name.toLowerCase()} for ${truth} against n`,
      desc: `The share of ${int(m)} simulated hackers whose interval contains ${truth} (red points), with Wilson 95% intervals; the solid line is 1 − 0.7ⁿ, the share of hackers with a score above 0, above which no interval can reach. Dashed lines mark the references named in the panel.`,
      width: w,
      height: panelHeight(w),
      x: nAxis(ns),
      y: linearAxis(0.4, 1, 6),
      xLabel: 'Systems n',
      yLabel: 'Coverage',
      references,
      lines: [{ points: ceiling, className: 'chart__curve chart__curve--bound' }],
      ranges: experiments.map((e) => ({ x: e.n, low: e.coverage[key].low, high: e.coverage[key].high })),
      points: experiments.map((e) => ({ x: e.n, y: e.coverage[key].rate })),
    }),
  });
  return panels(
    [
      interval({ key: 't', name: 't-interval', truth: 'μ', references: [{ y: 0.95, label: '0.95', directions: ['sw', 'se'] }] }),
      interval({
        key: 'chi',
        name: 'χ² interval',
        truth: 'σ²',
        references: [
          { y: 0.95, label: '0.95', directions: ['nw', 'ne'] },
          { y: summary.chiLimit, label: `limit ${fmt(summary.chiLimit, 3)}`, directions: ['sw', 'se'] },
        ],
      }),
    ],
    width,
  );
}

/* ------------------------------------------------------------ Fig. 9, scatter */

/** (x̄ₙ, s²ₙ) across hackers, with the best linear predictor of s²ₙ from x̄ₙ. */
export function renderScatter(blocks, law, { id, width = 640 }) {
  const slope = law.mu3 / law.sigma2;
  const parts = blocks.map((block) => (w) => {
    const xs = block.points.map(([x]) => x);
    const ys = block.points.map(([, y]) => y);
    const sdX = Math.sqrt(varianceOfMean(block.n));
    const xLow = Math.max(0, MU - 3.6 * sdX);
    const xHigh = Math.max(MU + 4.2 * sdX, ...xs.map((v) => Math.min(v, MU + 6 * sdX)));
    const sdY = Math.sqrt(varianceOfVariance(block.n));
    const yLow = Math.max(0, SIGMA2 - 3.6 * sdY);
    const yHigh = Math.max(SIGMA2 + 4.2 * sdY, ...ys.map((v) => Math.min(v, SIGMA2 + 6 * sdY)));
    return {
      title: `n = ${int(block.n)} · r = ${fmt(block.correlation, 3)}, exact ${fmt(block.exact, 3)}`,
      html: panel({
        id: `${id}-n${block.n}`,
        title: `Sampling variance against sampling mean across hackers at n = ${int(block.n)}`,
        desc: `Each red point is one of ${int(block.points.length)} simulated hackers. The solid line is the best linear predictor of the variance from the mean, of slope μ₃/σ² = ${fmt(slope, 2)}, through (μ, σ²). Sample correlation over all hackers ${fmt(block.correlation, 3)}, exact value ${fmt(block.exact, 3)}.`,
        width: w,
        height: panelHeight(w),
        x: linearAxis(xLow, xHigh, 4),
        y: linearAxis(yLow, yHigh, 4),
        xLabel: 'Sampling mean',
        yLabel: 'Sampling variance',
        className: 'chart--cloud',
        lines: [{ points: [xLow, xHigh].map((x) => ({ x, y: SIGMA2 + slope * (x - MU) })) }],
        points: block.points.map(([x, y]) => ({ x, y })),
        pointRadius: 1.5,
      }),
    };
  });
  return panels(parts, width);
}

/* ------------------------------------------------------------ tables */

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s) => `<td class="is-number">${s}</td>`;
const rowHead = (n) => `<th scope="row" class="is-number">${int(n)}</th>`;
const sub = (s) => `<span class="data-table__p">${s}</span>`;
const table = (cls, head, rows) =>
  `<table class="data-table data-table--compact data-table--math data-table--hw04 ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/* An expected count, which falls below anything printable as n grows. */
export const expectedCount = (v) => (v < 0.001 ? '< 0.001' : v >= 100 ? int(v) : sig(v, 3));

const digitsFor = (se) => Math.max(0, Math.min(5, 1 - Math.floor(Math.log10(se))));
const withError = (v, se) => `${fmt(v, digitsFor(se))} ± ${fmt(se, digitsFor(se))}`;

/** Table 1: the averages across hackers against μ and σ², with exact standard errors and z-scores. */
export function renderAveragesTable(experiments) {
  return table(
    'data-table--sampling',
    [th('n', 'is-number'), th(`Average of ${XBAR}`, 'is-number'), th('z', 'is-number'), th(`Average of ${S2}`, 'is-number'), th('z', 'is-number'), th(`Average of ${tex('\\mathrm{SS}_n/n')}`, 'is-number'), th(tex('\\sigma^2(n - 1)/n'), 'is-number')],
    experiments.map(
      (e) =>
        `<tr>${rowHead(e.n)}${td(withError(e.meanOfMeans, e.seMean))}${td(fmt(e.zMean, 2))}${td(withError(e.meanOfVariances, e.seVariance))}${td(fmt(e.zVariance, 2))}${td(fmt(e.meanOfSsOverN, 3))}${td(fmt(e.biasedExpectation, 3))}</tr>`,
    ),
  );
}

/** Table 2: the spreads across hackers against the exact values, and the ratio to normal theory. */
export function renderSpreadTable(experiments) {
  return table(
    'data-table--sampling',
    [th('n', 'is-number'), th(`SD of ${XBAR}`, 'is-number'), th(tex('\\sigma/\\sqrt{n}'), 'is-number'), th(`SD of ${S2}`, 'is-number'), th(tex('\\sqrt{\\mathrm{Var}(s_n^2)}'), 'is-number'), th(tex('\\mathrm{Var}(s_n^2)\\,(n - 1)/2\\sigma^4'), 'is-number')],
    experiments.map(
      (e) => `<tr>${rowHead(e.n)}${td(fmt(e.sdMean, 4))}${td(fmt(e.exactSdMean, 4))}${td(fmt(e.sdVariance, 3))}${td(fmt(e.exactSdVariance, 3))}${td(fmt(e.varianceRatio, 3))}</tr>`,
    ),
  );
}

/** Table 3: the coverage of the two intervals, on which side they miss, and the hackers with every score 0. */
export function renderCoverageTable(experiments) {
  const interval = (c) => `${fmt(c.rate, 3)}${sub(`${fmt(c.low, 3)} to ${fmt(c.high, 3)}`)}`;
  return table(
    'data-table--sampling',
    [
      th('n', 'is-number'),
      th(`t-interval for ${tex('\\mu')}`, 'is-number'),
      th(`Interval below ${tex('\\mu')}`, 'is-number'),
      th(`Interval above ${tex('\\mu')}`, 'is-number'),
      th(`${tex('\\chi^2')} interval for ${tex('\\sigma^2')}`, 'is-number'),
      th(`Interval below ${tex('\\sigma^2')}`, 'is-number'),
      th(`Interval above ${tex('\\sigma^2')}`, 'is-number'),
      th('All scores 0', 'is-number'),
      th('Expected', 'is-number'),
    ],
    experiments.map((e) => {
      const { t, chi, degenerate, degenerateExpected } = e.coverage;
      return `<tr>${rowHead(e.n)}${td(interval(t))}${td(int(t.below))}${td(int(t.above))}${td(interval(chi))}${td(int(chi.below))}${td(int(chi.above))}${td(int(degenerate))}${td(escapeXml(expectedCount(degenerateExpected)))}</tr>`;
    }),
  );
}

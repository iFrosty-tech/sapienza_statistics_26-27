/**
 * Figures and tables of homework 03, shared by the build-time provider
 * (homework/03/figures.js) and the page script, so that a chart redrawn in the
 * browser at its true width is the chart the build printed.
 *
 *   figureData(kind, results)        compact, JSON-safe data of one chart figure
 *   renderChart(kind, data, options) the chart, at a given pixel width
 *   renderSeries(kind, data, options) the chart in its series container with its data
 *   render…Table(results)            the tables of the page
 *
 * Chart kinds: 'letters' (Fig. 1, letter and byte histograms of one message
 * under both schemes), 'success' (Fig. 2, success rate of key recovery against
 * ciphertext length, one small multiple per method), 'rank' (Fig. 3, mean rank
 * of the true key) and 'attack' (Fig. 4, group operations of the attacks on the
 * restricted key space against the key size). Everything is drawn with the
 * classes of src/styles/hw01.css and hw03.css: green rulings, an ink frame,
 * ink lines and references, plot red only for measured values.
 */

import { escapeXml, labelBoard, renderHistogram, richText } from '../lib/charts.js';
import { formatNumber } from '../lib/probability-plot.js';

/* ------------------------------------------------------------ formats */

export const DASH = '—';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** A fixed-point number with a typographic minus; a rounded zero never carries a sign. */
export function fmt(v, digits = 2) {
  if (!finite(v)) return DASH;
  const s = formatNumber(v, digits);
  return /^−0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** An integer with thousands separators (en-GB). */
export const int = (v) => (finite(v) ? Math.round(v).toLocaleString('en-GB') : DASH);

/** A p-value as printed in tables ('< 0.001' below one in a thousand). */
export function formatP(p) {
  if (!finite(p)) return 'n/a';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

/** A p-value in a sentence: "p = 0.296" or "p < 0.001". */
export const pEq = (p) => (formatP(p).startsWith('<') ? `p ${formatP(p)}` : `p = ${formatP(p)}`);

/** A percentage with one decimal. */
export const percent = (v) => (finite(v) ? `${fmt(100 * v, 1)}%` : DASH);

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻', '-': '⁻' };
/** Unicode superscript digits, for plain text only (titles, descriptions, tokens). */
export const superscript = (s) => String(s).replace(/[0-9−-]/g, (c) => SUPERSCRIPT[c]);

/**
 * A positive number given by its base-2 logarithm, in scientific notation, as
 * its parts: { mantissa: '3.40', exponent: '38' }, or exponent null below 10⁶,
 * where the mantissa is the number itself. Working on the logarithm keeps
 * values such as 2²⁵⁶ exact enough without overflowing.
 */
export function sciPartsFromLog2(log2v, digits = 2) {
  if (!finite(log2v)) return { mantissa: DASH, exponent: null };
  const log10v = log2v * Math.LN2 * Math.LOG10E;
  if (log10v < 6) return { mantissa: fmt(10 ** log10v, log10v < 2 ? 2 : 0), exponent: null };
  let e = Math.floor(log10v);
  let mantissa = (10 ** (log10v - e)).toFixed(digits);
  if (Number(mantissa) >= 10) {
    e += 1;
    mantissa = (10 ** (log10v - e)).toFixed(digits);
  }
  return { mantissa, exponent: String(e) };
}

/** The same as plain text, "3.40 × 10³⁸" (Unicode superscripts; markup uses sciPartsFromLog2). */
export function sciFromLog2(log2v, digits = 2) {
  const { mantissa, exponent } = sciPartsFromLog2(log2v, digits);
  return exponent === null ? mantissa : `${mantissa} × 10${superscript(exponent)}`;
}

/** A duration given by log₂ of its seconds, in the most readable unit (years beyond a day). */
export function durationFromLog2Seconds(log2s) {
  if (!finite(log2s)) return DASH;
  const s = 2 ** log2s;
  if (s < 1) return `${fmt(s * 1000, 1)} ms`;
  if (s < 120) return `${fmt(s, 1)} s`;
  if (s < 7200) return `${fmt(s / 60, 1)} min`;
  if (s < 172800) return `${fmt(s / 3600, 1)} h`;
  const log2Years = log2s - Math.log2(365.25 * 86400);
  return `${sciFromLog2(log2Years)} years`;
}

/* ------------------------------------------------------------ figure data */

/** Chart kinds of the page. */
export const FIGURE_KINDS = Object.freeze(['letters', 'success', 'rank', 'attack']);

const METHOD_LABEL = {
  'chi-square': 'χ² of letter frequencies',
  'log-likelihood': 'Letter log-likelihood',
  bigram: 'Bigram score',
  trigram: 'Trigram score',
  exhaustive: 'Exhaustive search, dictionary',
};
const METHOD_SHORT = {
  'chi-square': 'χ²',
  'log-likelihood': 'Log-likelihood',
  bigram: 'Bigram',
  trigram: 'Trigram',
  exhaustive: 'Exhaustive',
};
const SOLVER_LABEL = { 'brute-force': 'Brute force', bsgs: 'Baby-step giant-step', kangaroo: 'Kangaroo' };

export const methodLabel = (m) => METHOD_LABEL[m] ?? m;
export const solverLabel = (m) => SOLVER_LABEL[m] ?? m;

const r4 = (v) => (finite(v) ? Math.round(v * 1e4) / 1e4 : v);

/**
 * The compact data of a chart figure.
 * @param {string} kind
 * @param {{ caesar: object, compare: object, attack: object }} results the cached study
 */
export function figureData(kind, results) {
  switch (kind) {
    case 'letters': {
      const c = results.compare;
      return {
        key: c.key,
        letters: c.letters,
        bytes: c.bytes,
        english: c.english.map(r4),
        plainLetters: c.plainLetters,
        caesarLetters: c.caesarLetters,
        eccBytes: c.eccBytes,
        ic: Object.fromEntries(Object.entries(c.ic).map(([k, v]) => [k, r4(v)])),
        eccTest: c.tests.eccBytesVsUniform256,
      };
    }
    case 'success':
    case 'rank': {
      const s = results.caesar;
      return {
        baseline: s.baseline,
        windows: s.meta.windows,
        lengths: s.meta.lengths,
        methods: s.meta.methods.map((m) => ({
          key: m,
          l95: s.methods[m].l95,
          l99: s.methods[m].l99,
          points: s.methods[m].points.map((p) =>
            kind === 'success' ? { L: p.L, rate: r4(p.rate), low: r4(p.low), high: r4(p.high) } : { L: p.L, rank: r4(p.meanRank) },
          ),
        })),
      };
    }
    case 'attack': {
      const a = results.attack;
      return {
        keysPerBits: a.meta.keysPerBits,
        methods: Object.entries(a.methods).map(([m, v]) => ({
          key: m,
          slope: r4(v.fit.slope),
          intercept: r4(v.fit.intercept),
          points: v.points.map((p) => ({
            bits: p.bits,
            mean: Math.round(p.meanOperations),
            min: Math.min(...p.operations),
            max: Math.max(...p.operations),
          })),
        })),
      };
    }
    default:
      throw new Error(`figureData: unknown kind "${kind}"`);
  }
}

/* ------------------------------------------------------------ chart primitives */

const round = (v) => Math.round(v * 10) / 10;
const DASHES = ['', '7 4', '2 3', '9 3 2 3', '4 2 1 2'];

function layout(width, height, margin = {}) {
  const narrow = width < 420;
  const m = { top: 14, right: narrow ? 12 : 18, bottom: 46, left: narrow ? 52 : 58, ...margin };
  const plotW = Math.max(40, width - m.left - m.right);
  const plotH = Math.max(40, height - m.top - m.bottom);
  return { width, height, narrow, margin: m, plotW, plotH, left: m.left, right: m.left + plotW, top: m.top, bottom: m.top + plotH };
}

function svgOpen({ id, width, height, title, desc, className }) {
  return (
    `<svg class="chart ${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">` +
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`
  );
}

const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/**
 * One chart panel on a linear or base-10 logarithmic x axis and a linear or
 * base-2 logarithmic y axis (y values are then given as base-2 logarithms).
 * Draws bands (interval areas), ink lines with optional dashes, vertical
 * ranges, plot-red points, dashed horizontal references and direct labels
 * placed by the label board of charts.js.
 */
function panel({
  id,
  title,
  desc,
  width,
  height,
  x,
  y,
  xLabel = '',
  yLabel = '',
  bands = [],
  lines = [],
  ranges = [],
  points = [],
  references = [],
  className = '',
}) {
  const g = layout(width, height);
  const tx = x.log ? (v) => Math.log10(v) : (v) => v;
  const sx = scale(tx(x.domain[0]), tx(x.domain[1]), g.left, g.right);
  const X = (v) => sx(tx(v));
  const Y = scale(y.domain[0], y.domain[1], g.bottom, g.top);
  const out = [svgOpen({ id, width, height, title, desc, className: `chart--panel ${className}` })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of y.ticks) {
    if (t.value > y.domain[0] && t.value < y.domain[1]) {
      out.push(`<line class="chart__ruling" x1="${g.left}" x2="${round(g.right)}" y1="${round(Y(t.value))}" y2="${round(Y(t.value))}"/>`);
    }
  }
  for (const t of x.ticks) {
    if (t.value > x.domain[0] && t.value < x.domain[1]) {
      out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(X(t.value))}" x2="${round(X(t.value))}" y1="${g.top}" y2="${round(g.bottom)}"/>`);
    }
  }
  out.push(`<rect class="chart__frame" x="${g.left}" y="${g.top}" width="${round(g.plotW)}" height="${round(g.plotH)}"/>`, '</g>');

  const board = labelBoard({ x0: g.left + 2, x1: g.right - 2, y0: g.top + 2, y1: g.bottom - 2 });
  for (const b of bands) {
    const upper = b.points.map((p, i) => `${i ? 'L' : 'M'}${round(X(p.x))},${round(Y(p.high))}`).join('');
    const lower = [...b.points].reverse().map((p) => `L${round(X(p.x))},${round(Y(p.low))}`).join('');
    out.push(`<path class="chart__band-area" d="${upper}${lower}Z" aria-hidden="true"/>`);
  }

  const labels = [];
  out.push('<g class="chart__references" aria-hidden="true">');
  for (const ref of references) {
    const ry = Y(ref.y);
    out.push(`<line class="chart__reference" x1="${g.left}" x2="${round(g.right)}" y1="${round(ry)}" y2="${round(ry)}"/>`);
    board.segment(g.left, ry, g.right, ry);
  }
  out.push('</g>');

  const runs = lines.map((l) => l.points.filter((p) => finite(p.x) && finite(p.y)).map((p) => [X(p.x), Y(p.y)]));
  runs.forEach((run) => board.polyline(run));
  const dots = points.map((p) => [X(p.x), Y(p.y), p.r ?? (g.narrow ? 2.4 : 3)]);
  dots.forEach(([cx, cy, r]) => board.circle(cx, cy, r));
  for (const rg of ranges) board.segment(X(rg.x), Y(rg.low), X(rg.x), Y(rg.high));

  // Reference labels at the right end of their line, then line labels along their line.
  for (const ref of references) {
    if (!ref.label) continue;
    const at = board.place(ref.label, { anchors: [[g.right - 4, Y(ref.y)], [g.left + 60, Y(ref.y)]], directions: ['nw', 'sw', 'ne', 'se'] });
    labels.push(`<text class="chart__annotation" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(ref.label)}</text>`);
  }
  lines.forEach((l, i) => {
    if (!l.label || !runs[i].length) return;
    const order = [];
    const start = Math.round((runs[i].length - 1) * (l.labelAt ?? 0.6));
    for (let k = 0; order.length < runs[i].length; k += 1) {
      if (start + k < runs[i].length) order.push(runs[i][start + k]);
      if (k > 0 && start - k >= 0) order.push(runs[i][start - k]);
    }
    const at = board.place(l.label, { anchors: order, directions: l.directions ?? ['ne', 'n', 'nw', 'se', 's', 'sw', 'e', 'w'] });
    labels.push(`<text class="chart__series-label" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(l.label)}</text>`);
  });

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const rg of ranges) {
    out.push(`<line class="chart__range" x1="${round(X(rg.x))}" x2="${round(X(rg.x))}" y1="${round(Y(rg.low))}" y2="${round(Y(rg.high))}"/>`);
  }
  lines.forEach((l, i) => {
    const d = runs[i].map(([px, py], k) => `${k ? 'L' : 'M'}${round(px)},${round(py)}`).join('');
    const dash = l.dash ?? '';
    if (d) out.push(`<path class="${l.className ?? 'chart__curve'}"${dash ? ` stroke-dasharray="${dash}"` : ''} d="${d}"/>`);
  });
  for (const [cx, cy, r] of dots) out.push(`<circle class="chart__point" cx="${round(cx)}" cy="${round(cy)}" r="${r}"/>`);
  out.push(...labels, '</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const t of y.ticks) {
    out.push(`<text class="chart__ylabel" x="${g.left - 7}" y="${round(Y(t.value))}" text-anchor="end" dominant-baseline="middle">${richText(t.label)}</text>`);
  }
  for (const t of x.ticks) {
    out.push(`<text class="chart__xlabel" x="${round(X(t.value))}" y="${round(g.bottom + 17)}" text-anchor="middle">${richText(t.label)}</text>`);
  }
  if (yLabel) {
    out.push(`<text class="chart__axis-title" transform="translate(12 ${round(g.top + g.plotH / 2)}) rotate(-90)" text-anchor="middle">${richText(yLabel)}</text>`);
  }
  if (xLabel) out.push(`<text class="chart__axis-title" x="${round(g.left + g.plotW / 2)}" y="${round(g.bottom + 38)}" text-anchor="middle">${richText(xLabel)}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/* Panels side by side (as many columns as fit at 260px or more) or stacked, as in homework 01. */
const GAP = 16;
function panels(parts, width, { maxColumns = 3, minWidth = 260 } = {}) {
  const cols = Math.max(1, Math.min(maxColumns, parts.length, Math.floor((width + GAP) / (minWidth + GAP))));
  const w = cols === 1 ? width : Math.floor((width - GAP * (cols - 1)) / cols);
  const html = parts
    .map((part) => {
      const { title, html: chart } = part(w);
      return `<div class="chart-panel">${title ? `<p class="chart-panel__title">${escapeXml(title)}</p>` : ''}${chart}</div>`;
    })
    .join('');
  return `<div class="chart-panels" data-columns="${cols}">${html}</div>`;
}

const LENGTH_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500].map((v) => ({ value: v, label: String(v) }));
const lengthAxis = (lengths) => ({ log: true, domain: [Math.min(...lengths) * 0.85, Math.max(...lengths) * 1.15], ticks: LENGTH_TICKS });

/* ------------------------------------------------------------ charts */

function successPanel(m, data, id) {
  return (w) => {
    const h = Math.round(Math.min(250, Math.max(200, w * 0.68)));
    const pts = m.points;
    const threshold = (t) => (t === null ? 'not reached' : `${t} letters`);
    return {
      title: `${methodLabel(m.key)} · 95% from ${m.l95 ?? DASH}, 99% from ${m.l99 ?? DASH}`,
      html: panel({
        id: `${id}-${m.key}`,
        title: `Success rate of ${methodLabel(m.key)} against ciphertext length`,
        desc: `Proportion of ${data.windows} ciphertexts per length whose key ${methodLabel(m.key)} recovers, with Wilson 95% intervals as a band; the dashed line is the chance level 1/26. The rate reaches 95% from ${threshold(m.l95)} and 99% from ${threshold(m.l99)}.`,
        width: w,
        height: h,
        x: lengthAxis(data.lengths),
        y: { domain: [0, 1.02], ticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, label: v === 0 ? '0' : fmt(v, 2) })) },
        xLabel: 'Ciphertext length L, letters',
        yLabel: 'Success rate',
        bands: [{ points: pts.map((p) => ({ x: p.L, low: p.low, high: p.high })) }],
        lines: [{ points: pts.map((p) => ({ x: p.L, y: p.rate })), className: 'chart__trace' }],
        points: pts.map((p) => ({ x: p.L, y: p.rate, r: w < 420 ? 2.2 : 2.6 })),
        references: [{ y: data.baseline, label: '1/26' }],
      }),
    };
  };
}

function overlayPanel(data, id, { value, label, yAxis, yLabel, references, title, desc, directions }) {
  return (w) => {
    const h = Math.round(Math.min(250, Math.max(200, w * 0.68)));
    return {
      title,
      html: panel({
        id: `${id}-all`,
        title,
        desc,
        width: w,
        height: h,
        x: lengthAxis(data.lengths),
        y: yAxis,
        xLabel: 'Ciphertext length L, letters',
        yLabel,
        lines: data.methods.map((m, i) => ({
          points: m.points.map((p) => ({ x: p.L, y: value(p) })),
          dash: DASHES[i % DASHES.length],
          label: label(m),
          labelAt: 0.35,
          directions,
        })),
        references,
      }),
    };
  };
}

/** Base-2 logarithmic y axis with ticks at powers of two. */
function pow2Axis(lo, hi, step) {
  const ticks = [];
  for (let k = Math.ceil(lo / step) * step; k <= hi + 1e-9; k += step) ticks.push({ value: k, label: `2^{${k}}` });
  return { domain: [lo, hi], ticks };
}

/**
 * The chart area of a figure.
 * @param {string} kind
 * @param {object} data from figureData (or its JSON copy)
 * @param {{ id: string, width?: number }} options
 * @returns {string} HTML
 */
export function renderChart(kind, data, { id, width = 640 } = {}) {
  switch (kind) {
    case 'letters': {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const english = data.english.map((p) => p * data.letters);
      const shifted = english.map((_, i) => english[(i - data.key + 26) % 26]);
      const histH = (w) => Math.round(Math.min(280, Math.max(200, w * 0.62)));
      const letterPanel = (counts, expected, which) => (w) => ({
        title: `${which === 'plain' ? 'Plaintext letters' : `Caesar letters, key ${data.key}`} · IC ${fmt(which === 'plain' ? data.ic.plainLetters : data.ic.caesarLetters, 4)}`,
        html: renderHistogram({
          id: `${id}-${which}`,
          title: which === 'plain' ? 'Letter counts of the plaintext' : `Letter counts of its Caesar ciphertext under key ${data.key}`,
          desc: `Bars are the counts of the ${int(data.letters)} letters A to Z; the step line is the count expected from the English frequencies of the training corpus${which === 'plain' ? '' : `, shifted by ${data.key} places`}.`,
          bins: counts.map((observed, i) => ({ label: alphabet[i], observed, expected: expected[i] })),
          width: w,
          height: histH(w),
          xLabel: which === 'plain' ? 'Plaintext letter' : 'Ciphertext letter',
          // On a narrow panel the axis title would collide with the tick labels; the panel title names the counts.
          yLabel: w < 360 ? '' : 'Count',
          labelEvery: w < 420 ? 2 : 1,
        }),
      });
      const top = panels([letterPanel(data.plainLetters, english, 'plain'), letterPanel(data.caesarLetters, shifted, 'caesar')], width, {
        maxColumns: 2,
      });
      const t = data.eccTest;
      const bytes = renderHistogram({
        id: `${id}-ecc`,
        title: 'Byte values of the toy EC ciphertext of the same message',
        desc: `Bars are the counts of the ${int(data.bytes)} ciphertext bytes in each of the 256 values; the step line is the uniform expectation ${fmt(data.bytes / 256, 1)}, χ² = ${fmt(t.statistic, 1)} with ${t.df} degrees of freedom, ${pEq(t.p)}.`,
        bins: data.eccBytes.map((observed, b) => ({ label: String(b), observed, expected: data.bytes / 256 })),
        width,
        height: Math.round(Math.min(260, Math.max(200, width * 0.36))),
        xLabel: 'Byte value',
        yLabel: 'Count',
        edgeTicks: [0, 64, 128, 192, 256].map((at) => ({ at, label: String(at) })),
      });
      return (
        top +
        `<div class="chart-panel"><p class="chart-panel__title">${escapeXml(`Toy EC ciphertext, byte counts · IC ${fmt(data.ic.eccBytes, 4)} (1/256 = ${fmt(1 / 256, 4)})`)}</p>${bytes}</div>`
      );
    }
    case 'success': {
      const parts = data.methods.map((m) => successPanel(m, data, id));
      parts.push(
        overlayPanel(data, id, {
          value: (p) => p.rate,
          label: (m) => METHOD_SHORT[m.key] ?? m.key,
          yAxis: { domain: [0, 1.02], ticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, label: v === 0 ? '0' : fmt(v, 2) })) },
          yLabel: 'Success rate',
          references: [{ y: data.baseline, label: '1/26' }],
          title: 'All methods',
          desc: 'The success rates of the five methods on one axis, each line labelled with its method; the dashed line is the chance level 1/26.',
          directions: ['nw', 'w', 'n', 'se', 'e', 's'],
        }),
      );
      return panels(parts, width, { maxColumns: 3 });
    }
    case 'rank': {
      const ticks = [0, 1, 2, 3, 4].map((k) => ({ value: k, label: String(2 ** k) }));
      return panels(
        [
          overlayPanel(data, id, {
            value: (p) => Math.log2(p.rank),
            label: (m) => METHOD_SHORT[m.key] ?? m.key,
            yAxis: { domain: [-0.08, Math.log2(16)], ticks },
            yLabel: 'Mean rank of the true key',
            references: [{ y: Math.log2(13.5), label: 'chance, 13.5' }],
            title: 'Mean rank of the true key among the 26 candidates (1 = ranked first)',
            desc: `Mean rank of the true key in the ranking of each method over ${data.windows} ciphertexts per length, on a base-2 logarithmic scale; ties count at their mid-rank and a blind guess has mean rank 13.5 (dashed).`,
            directions: ['ne', 'e', 'n', 'sw', 'w', 's'],
          }),
        ],
        width,
        { maxColumns: 1 },
      );
    }
    case 'attack': {
      const all = data.methods.flatMap((m) => m.points);
      const lo = Math.floor(Math.log2(Math.max(1, Math.min(...all.map((p) => p.min))))) - 1;
      const hi = Math.ceil(Math.log2(Math.max(...all.map((p) => p.max)))) + 1;
      const bitsAll = all.map((p) => p.bits);
      const xTicks = [];
      for (let b = 8; b <= Math.max(...bitsAll); b += 4) xTicks.push({ value: b, label: String(b) });
      const height = Math.round(Math.min(400, Math.max(280, width * 0.56)));
      const lines = data.methods.map((m, i) => {
        const b0 = Math.min(...m.points.map((p) => p.bits));
        const b1 = Math.max(...m.points.map((p) => p.bits));
        return {
          points: [b0, b1].map((b) => ({ x: b, y: m.intercept + m.slope * b })),
          dash: DASHES[(i + 1) % DASHES.length],
          label: `${solverLabel(m.key)}, slope ${fmt(m.slope, 2)}`,
          labelAt: 1,
          directions: i === 0 ? ['nw', 'w', 'n'] : i === 1 ? ['se', 's', 'e'] : ['e', 'se', 'ne'],
        };
      });
      return panel({
        id,
        title: 'Group operations of the attacks on the restricted key space against the key size',
        desc: `For each key size b and each attack, the mean number of group operations over ${data.keysPerBits} random keys (points) and the range from the smallest to the largest (vertical lines), on a base-2 logarithmic scale, with the least-squares line of log₂ of the mean on b. ${data.methods.map((m) => `${solverLabel(m.key)}: slope ${fmt(m.slope, 3)}`).join('; ')}.`,
        width,
        height,
        x: { domain: [Math.min(...bitsAll) - 1, Math.max(...bitsAll) + 1], ticks: xTicks },
        y: pow2Axis(lo, hi, hi - lo > 16 ? 4 : 2),
        xLabel: 'Key size in bits',
        yLabel: 'Group operations',
        ranges: data.methods.flatMap((m) => m.points.map((p) => ({ x: p.bits, low: Math.log2(Math.max(1, p.min)), high: Math.log2(Math.max(1, p.max)) }))),
        points: data.methods.flatMap((m) => m.points.map((p) => ({ x: p.bits, y: Math.log2(Math.max(1, p.mean)) }))),
        lines,
        className: 'chart--attack',
      });
    }
    default:
      throw new Error(`renderChart: unknown kind "${kind}"`);
  }
}

/* JSON inside <script>: "<" is escaped so that the data can never close the element. */
const jsonText = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/** A JSON data island for the page script. */
export const jsonScript = (value, attribute) => `<script type="application/json" ${attribute}>${jsonText(value)}</script>`;

/**
 * A chart figure as homework 01 prints it: one series container with its chart and its data.
 * @param {string} kind
 * @param {object} data
 * @param {{ id: string, width?: number }} options
 */
export function renderSeries(kind, data, { id, width = 640 }) {
  return (
    `<div class="chart-figure__series" data-fig-series="all">` +
    `<div class="chart-figure__chart" data-fig-chart>${renderChart(kind, data, { id, width })}</div>` +
    jsonScript(data, 'data-fig-data') +
    `</div>`
  );
}

/* ------------------------------------------------------------ tables */

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
const table = (cls, head, rows) =>
  `<table class="data-table ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
/* Markup for 2^{k}: a real superscript. */
const pow2Html = (k) => `2<sup>${escapeXml(String(k))}</sup>`;
const sciHtml = (log2v, digits = 2) => {
  const { mantissa, exponent } = sciPartsFromLog2(log2v, digits);
  return exponent === null ? escapeXml(mantissa) : `${mantissa} × 10<sup>${exponent}</sup>`;
};
const durationHtml = (log2s) => {
  const s = durationFromLog2Seconds(log2s);
  return s.endsWith(' years') ? `${sciHtml(log2s - Math.log2(365.25 * 86400))} years` : escapeXml(s);
};

/** Table: the key spaces of the two schemes. */
export function renderKeySpaces(spaces, { caesarRate, bruteRate } = {}) {
  const rows = spaces.map((s) => {
    const size = s.key === 'caesar' ? '26' : s.key === 'toy' ? `${pow2Html(fmt(s.log2, 0))} = ${int(s.size)}` : `n − 1 ≈ ${sciHtml(s.log2, 3)}`;
    const rate = s.key === 'caesar' ? caesarRate : bruteRate;
    const exhaust = rate ? durationHtml(s.log2 - Math.log2(rate)) : DASH;
    return `<tr><th scope="row">${escapeXml(s.name)}</th>${td(size, 'is-number')}${td(fmt(s.log2, 2), 'is-number')}${td(exhaust, 'is-number')}</tr>`;
  });
  return table(
    'data-table--compact data-table--hw03',
    [th('Scheme'), th('Number of keys', 'is-number'), th('Bits', 'is-number'), th('Exhaustive search', 'is-number')],
    rows,
  );
}

/** Table: the same message encrypted twice under each scheme. */
export function renderRepeated(r) {
  const short = (hex, n = 16) => `<code class="is-nowrap">${escapeXml(hex.slice(0, n))}…</code>`;
  const rows = [
    `<tr><th scope="row">Caesar, key ${r.caesar.key}</th>${td(`<code>${escapeXml(r.caesar.first)}</code>`)}${td(`<code>${escapeXml(r.caesar.second)}</code>`)}${td(r.caesar.equal ? 'Identical' : 'Different')}</tr>`,
    `<tr><th scope="row">Toy EC, ephemeral point R</th>${td(short(r.ecc.first.R))}${td(short(r.ecc.second.R))}${td(r.ecc.first.R === r.ecc.second.R ? 'Identical' : 'Different')}</tr>`,
    `<tr><th scope="row">Toy EC, ciphertext c</th>${td(short(r.ecc.first.c))}${td(short(r.ecc.second.c))}${td(`${r.ecc.differingBits} of ${r.ecc.totalBits} bits differ`)}</tr>`,
    `<tr><th scope="row">Toy EC, tag</th>${td(short(r.ecc.first.tag))}${td(short(r.ecc.second.tag))}${td(r.ecc.first.tag === r.ecc.second.tag ? 'Identical' : 'Different')}</tr>`,
  ];
  return table('data-table--compact data-table--hw03 data-table--repeat', [th('Scheme and field'), th('First encryption'), th('Second encryption'), th('Comparison')], rows);
}

/** Table: index of coincidence and uniformity tests of one message under both schemes. */
export function renderStatisticsTable(c) {
  const t = c.tests;
  const row = (name, alphabet, ic, test, against) =>
    `<tr><th scope="row">${name}</th>${td(alphabet)}${td(fmt(ic, 4), 'is-number')}${td(against)}${td(test.statistic >= 100 ? int(test.statistic) : fmt(test.statistic, 1), 'is-number')}${td(String(test.df), 'is-number')}${td(escapeXml(formatP(test.p)), 'is-number')}</tr>`;
  const rows = [
    row('Plaintext', '26 letters', c.ic.plainLetters, t.plainVsEnglish, 'English letter frequencies'),
    row(`Caesar ciphertext, key ${c.key}`, '26 letters', c.ic.caesarLetters, t.caesarVsEnglish, 'English letter frequencies'),
    row(`Caesar ciphertext, key ${c.key}`, '26 letters', c.ic.caesarLetters, t.caesarVsShiftedEnglish, `English, shifted by ${c.key}`),
    row('Plaintext, UTF-8', '256 byte values', c.ic.plainBytes, t.plainBytesVsUniform256, 'Uniform on 256 values'),
    row('Toy EC ciphertext', '256 byte values', c.ic.eccBytes, t.eccBytesVsUniform256, 'Uniform on 256 values'),
  ];
  return table(
    'data-table--compact data-table--hw03',
    [th('Text'), th('Alphabet'), th('Index of coincidence', 'is-number'), th('χ² test against'), th('χ²', 'is-number'), th('df', 'is-number'), th('p-value', 'is-number')],
    rows,
  );
}

/** Table: the shortest ciphertexts each method breaks reliably, with the success at selected lengths. */
export function renderCaesarSummary(s, { at = [5, 10, 20, 50] } = {}) {
  const rows = s.meta.methods.map((m) => {
    const v = s.methods[m];
    const cells = at.map((L) => {
      const p = v.points.find((q) => q.L === L);
      return td(p ? `${fmt(100 * p.rate, 1)}<span class="data-table__p">${fmt(100 * p.low, 1)}–${fmt(100 * p.high, 1)}</span>` : DASH, 'is-number');
    });
    return `<tr><th scope="row">${escapeXml(methodLabel(m))}</th>${cells.join('')}${td(v.l95 ?? DASH, 'is-number')}${td(v.l99 ?? DASH, 'is-number')}</tr>`;
  });
  return table(
    'data-table--compact data-table--hw03',
    [th('Method'), ...at.map((L) => th(`L = ${L}, %`, 'is-number')), th('L for 95%', 'is-number'), th('L for 99%', 'is-number')],
    rows,
  );
}

/** Table: the measured attack cost, extrapolated to full-size keys. */
export function renderAttackTable(costTable) {
  const theory = { 'brute-force': (b) => b - 1, bsgs: (b) => b / 2 + Math.log2(1.5), kangaroo: (b) => b / 2 + 1 };
  const rows = costTable.rows.map((r) => {
    return (
      `<tr><th scope="row">${escapeXml(solverLabel(r.method))}</th>${td(String(r.bits), 'is-number')}` +
      `${td(pow2Html(fmt(r.log2Operations, 1)), 'is-number')}${td(pow2Html(fmt(theory[r.method](r.bits), 1)), 'is-number')}` +
      `${td(durationHtml(r.log2SecondsMeasured), 'is-number')}${td(durationHtml(r.log2SecondsFast), 'is-number')}</tr>`
    );
  });
  rows.push(
    `<tr><th scope="row">Pollard's rho, full secp256k1</th>${td('256', 'is-number')}${td(DASH, 'is-number')}` +
      `${td(`√(πn/4) ≈ ${pow2Html(fmt(costTable.rho.log2Operations, 1))}`, 'is-number')}${td(DASH, 'is-number')}${td(durationHtml(costTable.rho.log2SecondsFast), 'is-number')}</tr>`,
  );
  return table(
    'data-table--compact data-table--hw03',
    [
      th('Attack'),
      th('Key bits', 'is-number'),
      th('Operations, fitted', 'is-number'),
      th('Operations, theory', 'is-number'),
      th('Time, measured rate', 'is-number'),
      th(`Time at 10<sup>${Math.round(Math.log10(costTable.fastRate))}</sup> op/s`, 'is-number'),
    ],
    rows,
  );
}

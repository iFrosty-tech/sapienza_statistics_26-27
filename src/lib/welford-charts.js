/**
 * The build-time figures and tables of homework 4, exercise 1: the code listing
 * cut from src/lib/welford.js, the worked trace, the forms of the recurrence at
 * the last step, and the numerical study (relative error against the condition
 * number on log–log axes, its table, and the measured slopes against the
 * published bounds). The chart keeps the vocabulary of the earlier homework:
 * rulings of the paper, ink for theory, plot red for what was measured, and
 * labels placed by the label board of charts.js.
 */

import katex from 'katex';
import { escapeXml, labelBoard, richText } from './charts.js';
import { DASH, NARROW_WIDTH, fmt, sciHtml, sig, superscript } from './penetration-charts.js';
import { PUBLISHED_BOUNDS, UNIT_ROUNDOFF } from './welford-stability.js';

export { NARROW_WIDTH };

const round = (v) => Math.round(v * 10) / 10;

/** A formula for a table cell: the subscripts of the text face fall back to another font at that size. */
export const tex = (source) => katex.renderToString(source, { displayMode: false, throwOnError: true, output: 'htmlAndMathml' });

/** Mantissa and exponent of a condition number, rounded together, so that 9,999 is 1.0 and 4, never 10.0 and 3. */
function kappaParts(kappa) {
  let exponent = Math.floor(Math.log10(kappa));
  let mantissa = (kappa / 10 ** exponent).toFixed(1);
  if (mantissa === '10.0') {
    mantissa = '1.0';
    exponent += 1;
  }
  return { mantissa, exponent };
}

/** A condition number: plain while it is small, a power of ten from a thousand on. */
export function kappaText(kappa) {
  if (kappa < 999.5) return sig(kappa, 2);
  const { mantissa, exponent } = kappaParts(kappa);
  return `${mantissa} × 10${superscript(String(exponent))}`;
}

const kappaHtml = (kappa) => {
  if (kappa < 999.5) return sig(kappa, 2);
  const { mantissa, exponent } = kappaParts(kappa);
  return `${mantissa} × 10<sup>${exponent}</sup>`;
};

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s, cls = 'is-number') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
const table = (cls, head, rows) =>
  `<table class="data-table data-table--hw04 data-table--compact ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/* ------------------------------------------------------------ listing */

/**
 * The lines of one exported function of a source file.
 * @param {string} source
 * @param {string} name
 * @returns {{ name: string, first: number, lines: string[] }} `first` is its 1-based line number
 */
export function extractListing(source, name) {
  const all = source.split(/\r?\n/);
  const start = all.findIndex((line) => line.startsWith(`export function ${name}(`));
  if (start < 0) throw new Error(`extractListing: no function ${name} in the source.`);
  const end = all.findIndex((line, i) => i > start && line === '}');
  return { name, first: start + 1, lines: all.slice(start, end + 1) };
}

const CORE_LINE = /^\s*(const innovation = |state\.mean \+= |state\.ss \+= )/;

/**
 * The listing of some functions of a source file, with the line numbers of that
 * file, so that the printed code cannot drift from the code that runs. The three
 * lines of core logic are marked.
 * @param {string} source
 * @param {string[]} names
 */
export function renderListing(source, names) {
  const blocks = names.map((name) => {
    const { first, lines } = extractListing(source, name);
    return lines
      .map((line, i) => {
        const core = CORE_LINE.test(line);
        return `<span class="listing__line"${core ? ' data-core="true"' : ''}><span class="listing__no" aria-hidden="true">${first + i}</span>${escapeXml(line) || ' '}</span>`;
      })
      .join('');
  });
  return blocks.join('<span class="listing__gap" aria-hidden="true"></span>');
}

/* ------------------------------------------------------------ tables */

/** The worked trace: one row per observation, from the recurrences themselves. */
export function renderTraceTable(steps) {
  const head = [
    th('<span class="visually-hidden">Step </span>' + tex('k')),
    th(tex('x_k'), 'is-number'),
    th(tex('x_k - \\bar{x}_{k-1}'), 'is-number'),
    th(tex('\\bar{x}_k'), 'is-number'),
    th(tex('x_k - \\bar{x}_k'), 'is-number'),
    th('Increment', 'is-number'),
    th(tex('SS_k'), 'is-number'),
    th(tex('s_k^2'), 'is-number'),
  ];
  const rows = steps.map((s) => {
    const none = s.oldMean === null;
    return (
      `<tr><th scope="row">${s.k}</th>` +
      td(fmt(s.x, 0)) +
      td(none ? DASH : fmt(s.width, 4)) +
      td(fmt(s.mean, 4)) +
      td(none ? DASH : fmt(s.height, 4)) +
      td(none ? DASH : fmt(s.area, 4)) +
      td(fmt(s.ss, 4)) +
      td(fmt(s.variance, 4)) +
      `</tr>`
    );
  });
  return table('data-table--math data-table--trace', head, rows);
}

/** Every printed form of the recurrence at the last step, beside the value it must reach. */
export function renderFormsTable(rows) {
  const head = [th('Eq.'), th('Quantity'), th('Recurrence'), th('Value', 'is-number'), th('Definition', 'is-number')];
  const body = rows.map(
    (r) => `<tr><th scope="row">(${r.equation})</th>${td(tex(r.quantity), '')}${td(tex(r.form), 'data-table__form')}${td(fmt(r.value, 6))}${td(fmt(r.definition, 6))}</tr>`,
  );
  return table('data-table--math data-table--forms', head, body);
}

const percent = (part, whole) => `${fmt((100 * part) / whole, 0)}%`;

/** The median and the worst error of each algorithm at selected shifts, and the negative results of the textbook formula. */
export function renderErrorTable(study, shifts) {
  const head = [
    th(tex('\\kappa')),
    th('Textbook median', 'is-number'),
    th('Textbook worst', 'is-number'),
    th('Two-pass median', 'is-number'),
    th('Two-pass worst', 'is-number'),
    th('Welford median', 'is-number'),
    th('Welford worst', 'is-number'),
    th('Textbook negative', 'is-number'),
  ];
  const rows = study.points
    .filter((p) => shifts.includes(p.shift))
    .map(({ kappa, algorithms: a }) => {
      const cells = ['textbook', 'twoPass', 'welford'].flatMap((name) => [td(sciHtml(a[name].median, 2)), td(sciHtml(a[name].worst, 2))]);
      return `<tr><th scope="row">${kappaHtml(kappa)}</th>${cells.join('')}${td(percent(a.textbook.negative, study.replicates))}</tr>`;
    });
  return table('data-table--math data-table--errors', head, rows);
}

/** The measured slopes against the exponent of κ in the published bounds. */
export function renderSlopesTable(study) {
  const head = [th('Algorithm'), th('Published bound'), th('Exponent of ' + tex('\\kappa'), 'is-number'), th('Measured slope', 'is-number'), th('Range of ' + tex('\\kappa'), 'is-number'), th('Worst error/bound', 'is-number')];
  const entries = [
    { key: 'textbook', name: 'Textbook', bound: 'nκ²u', exponent: '2' },
    { key: 'welford', name: 'Welford', bound: 'nκu', exponent: '1' },
    { key: 'twoPassFlat', name: 'Two-pass, first term', bound: 'nu + n²κ²u²', exponent: '0' },
    { key: 'twoPassTail', name: 'Two-pass, second term', bound: 'nu + n²κ²u²', exponent: '2' },
  ];
  const rows = entries.map(({ key, name, bound, exponent }) => {
    const s = study.slopes[key];
    const range = `${kappaHtml(s.low)} to ${kappaHtml(s.high)}`;
    return `<tr><th scope="row">${name}</th>${td(bound, 'data-table__form')}${td(exponent)}${td(fmt(s.slope, 2))}${td(range)}${td(sig(study.boundRatios[s.algorithm], 2))}</tr>`;
  });
  return table('data-table--math data-table--slopes', head, rows);
}

/* ------------------------------------------------------------ the error chart */

const X_DOMAIN = [0.7, 2e9];
const Y_DOMAIN = [1e-17, 1e4];
const SERIES = Object.freeze([
  { key: 'textbook', label: 'textbook', dash: '', ring: true },
  { key: 'twoPass', label: 'two-pass', dash: '2 3', ring: true },
  { key: 'welford', label: 'Welford', dash: '', ring: false },
]);

const decade = (k) => (k === 0 ? '1' : k === 1 ? '10' : `10^{${k < 0 ? `−${-k}` : k}}`);

function chart({ id, width, height, study }) {
  const narrow = width < 420;
  const m = { top: 12, right: narrow ? 12 : 16, bottom: 44, left: narrow ? 46 : 54 };
  const left = m.left;
  const right = width - m.right;
  const top = m.top;
  const bottom = height - m.bottom;
  const toX = (v) => left + ((Math.log10(v) - Math.log10(X_DOMAIN[0])) / (Math.log10(X_DOMAIN[1]) - Math.log10(X_DOMAIN[0]))) * (right - left);
  const toY = (v) => bottom - ((Math.log10(v) - Math.log10(Y_DOMAIN[0])) / (Math.log10(Y_DOMAIN[1]) - Math.log10(Y_DOMAIN[0]))) * (bottom - top);
  const inPlot = (v) => v > 0 && v <= Y_DOMAIN[1] && v >= Y_DOMAIN[0];
  const xTicks = Array.from({ length: 10 }, (_, k) => k).filter((k) => !narrow || k % 2 === 0);
  const yTicks = [-16, -14, -12, -10, -8, -6, -4, -2, 0, 2, 4].filter((k) => !narrow || k % 4 === 0);

  const title = 'Relative error of the computed sum of squares against the condition number';
  const textbook = study.slopes.textbook.slope;
  const updating = study.slopes.welford.slope;
  const desc = `Median relative error (points) and worst error (bars) of the textbook, two-pass and Welford algorithms over ${study.replicates} samples of ${study.n} values, on logarithmic axes, for condition numbers from 1 to 10⁹, with the published bounds as dashed lines. The textbook error grows with slope ${fmt(textbook, 2)} and the Welford error with slope ${fmt(updating, 2)}.`;
  const out = [
    `<svg class="chart chart--panel chart--errors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
  ];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const k of yTicks) out.push(`<line class="chart__ruling" x1="${left}" x2="${right}" y1="${round(toY(10 ** k))}" y2="${round(toY(10 ** k))}"/>`);
  for (const k of xTicks) out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(toX(10 ** k))}" x2="${round(toX(10 ** k))}" y1="${top}" y2="${bottom}"/>`);
  out.push(`<rect class="chart__frame" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></g>`);

  const board = labelBoard({ x0: left + 2, x1: right - 2, y0: top + 2, y1: bottom - 2 });
  const labels = [];
  const label = (text, cls, at) => labels.push(`<text class="${cls}" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(text)}</text>`);

  // The published bounds, cut to the plot.
  const n = study.n;
  const grid = Array.from({ length: 49 }, (_, i) => 10 ** (i / 5.3));
  const bounds = [
    { key: 'textbook', text: 'nκ^{2}u' },
    { key: 'welford', text: 'nκu' },
    { key: 'twoPass', text: 'nu + n^{2}κ^{2}u^{2}' },
  ].map((b) => ({ ...b, run: grid.filter((k) => k <= X_DOMAIN[1]).map((k) => [toX(k), PUBLISHED_BOUNDS[b.key](n, k)]).filter(([, y]) => inPlot(y)).map(([x, y]) => [x, toY(y)]) }));
  bounds.forEach((b) => board.polyline(b.run));

  // The level at which no digit is correct, and the unit roundoff.
  const rules = [
    { y: 1, text: 'relative error 1: no correct digit' },
    { y: UNIT_ROUNDOFF, text: `u = 2^{−53}` },
  ].map((r) => ({ ...r, py: toY(r.y) }));
  rules.forEach((r) => board.segment(left, r.py, right, r.py));

  // Measured: the worst error as a bar over the median, and a line through the medians.
  const measured = SERIES.map((s) => ({
    ...s,
    points: study.points.map((p) => ({ px: toX(p.kappa), py: toY(Math.max(p.algorithms[s.key].median, Y_DOMAIN[0])), wy: toY(Math.min(p.algorithms[s.key].worst, Y_DOMAIN[1])) })),
  }));
  const radius = narrow ? 2.4 : 2.9;
  for (const s of measured) {
    board.polyline(s.points.map((p) => [p.px, p.py]));
    for (const p of s.points) {
      board.circle(p.px, p.py, radius);
      board.segment(p.px, p.py, p.px, p.wy);
    }
  }

  for (const r of rules) {
    const at = board.place(r.text, { anchors: [[left + 8, r.py], [right - 8, r.py]], directions: ['ne', 'nw', 'se', 'sw'] });
    label(r.text, 'chart__annotation', at);
  }
  for (const s of measured) {
    const anchors = [0.55, 0.45, 0.65, 0.35, 0.75, 0.25].map((t) => {
      const p = s.points[Math.round((s.points.length - 1) * t)];
      return [p.px, p.py];
    });
    const at = board.place(s.label, { anchors, directions: s.key === 'welford' ? ['se', 's', 'e', 'sw'] : s.key === 'twoPass' ? ['s', 'se', 'sw'] : ['nw', 'n', 'w'] });
    label(s.label, 'chart__series-label', at);
  }
  for (const b of bounds) {
    if (!b.run.length) continue;
    const anchors = [0.8, 0.7, 0.9, 0.6, 0.5].map((t) => b.run[Math.round((b.run.length - 1) * t)]);
    const at = board.place(b.text, { anchors, directions: ['nw', 'w', 'n', 'se', 'e', 's'] });
    label(b.text, 'chart__annotation', at);
  }

  out.push('<g class="chart__references" aria-hidden="true">');
  for (const r of rules) out.push(`<line class="chart__reference" x1="${left}" x2="${right}" y1="${round(r.py)}" y2="${round(r.py)}"/>`);
  for (const b of bounds) {
    if (b.run.length) out.push(`<path class="chart__curve chart__curve--bound chart__curve--published" d="${b.run.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)},${round(y)}`).join('')}"/>`);
  }
  out.push('</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const s of measured) {
    for (const p of s.points) out.push(`<line class="chart__range" x1="${round(p.px)}" x2="${round(p.px)}" y1="${round(p.py)}" y2="${round(p.wy)}"/>`);
  }
  for (const s of measured) {
    out.push(`<path class="chart__curve chart__curve--measured"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} d="${s.points.map((p, i) => `${i ? 'L' : 'M'}${round(p.px)},${round(p.py)}`).join('')}"/>`);
    for (const p of s.points) out.push(`<circle class="chart__point${s.ring ? ' chart__point--ring' : ''}" cx="${round(p.px)}" cy="${round(p.py)}" r="${radius}"/>`);
  }
  out.push(...labels, '</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const k of yTicks) out.push(`<text class="chart__ylabel" x="${left - 6}" y="${round(toY(10 ** k))}" text-anchor="end" dominant-baseline="middle">${richText(decade(k))}</text>`);
  for (const k of xTicks) out.push(`<text class="chart__xlabel" x="${round(toX(10 ** k))}" y="${bottom + 17}" text-anchor="middle">${richText(decade(k))}</text>`);
  out.push(`<text class="chart__axis-title" transform="translate(11 ${round(top + (bottom - top) / 2)}) rotate(-90)" text-anchor="middle">Relative error of SS</text>`);
  out.push(`<text class="chart__axis-title" x="${round(left + (right - left) / 2)}" y="${bottom + 37}" text-anchor="middle">Condition number κ</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/**
 * The relative error against κ, in a wide drawing for the page and print and a
 * narrow one for phones, where the wide one would shrink to half its type size.
 * @param {ReturnType<typeof import('./welford-stability.js').runStabilityStudy>} study
 * @param {{ id: string, width?: number }} options
 */
export function renderErrors(study, { id, width = 640 }) {
  const wide = chart({ id, width, height: 430, study });
  const narrow = chart({ id: `${id}-narrow`, width: NARROW_WIDTH, height: 400, study });
  return `<div class="chart-swap"><div class="chart-swap__wide">${wide}</div><div class="chart-swap__narrow">${narrow}</div></div>`;
}


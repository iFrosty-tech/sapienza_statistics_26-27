/**
 * The build-time figures and tables of homework 5: one general chart for the page (a plot of series on
 * linear or logarithmic axes, in the vocabulary of the site's probability paper: rulings of the paper,
 * plot red for what was computed, ink for theory and references, labels placed by the label board of
 * charts.js), and the table helpers. The drawings of the sums themselves are in src/hw07/scene.js, which the
 * live panel shares and which needs no KaTeX.
 */

import katex from 'katex';
import { clipLineToRange, escapeXml, labelBoard, richText } from './charts.js';
import { formatNumber } from './probability-plot.js';
import { NARROW_WIDTH } from './penetration-charts.js';

export { NARROW_WIDTH };

const round = (v) => Math.round(v * 10) / 10;

/** A formula for a table cell or a heading. */
export const tex = (source) => katex.renderToString(source, { displayMode: false, throwOnError: true, output: 'htmlAndMathml' });

/* ------------------------------------------------------------------- tables */

export const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
export const td = (s, cls = 'is-number') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
export const rowHead = (s) => `<th scope="row">${s}</th>`;

/** A numeric table in the vocabulary of the earlier homework. */
export const dataTable = (cls, head, rows) =>
  `<table class="data-table data-table--hw04 data-table--compact data-table--math ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/* ------------------------------------------------------------------- scales */

const decade = (k) => (k === 0 ? '1' : k === 1 ? '10' : `10^{${k < 0 ? `−${-k}` : k}}`);

/** Nice tick values of a linear axis, about `target` of them. */
function linearTicks(min, max, target = 5) {
  const raw = (max - min) / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
  const values = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) values.push(+v.toFixed(10));
  return { values, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
}

function axisOf({ scale = 'linear', domain, label = '', ticks }, lo, hi, target) {
  const log = scale === 'log';
  const to = log ? (v) => Math.log10(v) : (v) => v;
  const d0 = to(domain[0]);
  const d1 = to(domain[1]);
  const map = (v) => lo + ((to(v) - d0) / (d1 - d0)) * (hi - lo);
  let list;
  if (ticks) list = ticks;
  else if (log) {
    const every = Math.max(1, Math.ceil((d1 - d0) / target));
    list = [];
    for (let k = Math.ceil(d0 - 1e-9); k <= d1 + 1e-9; k += 1) if ((k - Math.ceil(d0 - 1e-9)) % every === 0) list.push({ value: 10 ** k, label: decade(k) });
  } else {
    const t = linearTicks(domain[0], domain[1], target);
    list = t.values.map((value) => ({ value, label: formatNumber(value, t.decimals) }));
  }
  return { log, map, domain, label, ticks: list, to };
}

/* --------------------------------------------------------------------- plot */

const SHAPES = {
  circle: (cx, cy, r) => `<circle cx="${round(cx)}" cy="${round(cy)}" r="${r}"`,
  square: (cx, cy, r) => `<rect x="${round(cx - r)}" y="${round(cy - r)}" width="${round(2 * r)}" height="${round(2 * r)}"`,
};

/** A marker element, without its closing, in the class of its style. */
function marker(shape, cx, cy, r, cls) {
  if (shape === 'triangle') {
    const s = r * 1.25;
    return `<path class="${cls}" d="M${round(cx)},${round(cy - s)}L${round(cx + s)},${round(cy + s * 0.8)}L${round(cx - s)},${round(cy + s * 0.8)}Z"/>`;
  }
  return `${(SHAPES[shape] ?? SHAPES.circle)(cx, cy, r)} class="${cls}"/>`;
}

/**
 * A plot of series on linear or logarithmic axes.
 * @param {{
 *   id: string, title: string, desc: string, width?: number, height?: number, panel?: boolean,
 *   x: { scale?: 'linear'|'log', domain: [number, number], label?: string, ticks?: { value: number, label: string }[] },
 *   y: { scale?: 'linear'|'log', domain: [number, number], label?: string, ticks?: { value: number, label: string }[] },
 *   series: { key: string, label?: string, points: { x: number, y: number|null }[], style?: 'data'|'ring'|'ink', shape?: string,
 *     dash?: string, line?: boolean, markers?: boolean, prefer?: string[], from?: number }[],
 *   rules?: ({ kind: 'slope', exponent: number, factor?: number, label: string } | { kind: 'h', y: number, label: string } | { kind: 'v', x: number, label: string })[],
 * }} options
 *   A y outside the domain is drawn on its nearest edge (a computed error of zero, or one beyond what the axis shows); a
 *   missing or non-finite y breaks the line. `markers: false` draws a line alone, for a dense series. Labels contain "^{…}" for exponents.
 */
export function renderPlot({ id, title, desc, width = 640, height = 360, panel = false, x, y, series, rules = [] }) {
  const narrow = width < 420;
  const m = { top: 12, right: narrow ? 12 : 16, bottom: panel ? 40 : 44, left: narrow ? 44 : 54 };
  const left = m.left;
  const right = width - m.right;
  const top = m.top;
  const bottom = height - m.bottom;
  const ax = axisOf(x, left, right, narrow ? 4 : 6);
  const ay = axisOf(y, bottom, top, narrow ? 5 : 6);
  const lowY = y.domain[0];
  const out = [
    `<svg class="chart chart--panel chart--plot" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
  ];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of ay.ticks) out.push(`<line class="chart__ruling" x1="${left}" x2="${right}" y1="${round(ay.map(t.value))}" y2="${round(ay.map(t.value))}"/>`);
  for (const t of ax.ticks) out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(ax.map(t.value))}" x2="${round(ax.map(t.value))}" y1="${top}" y2="${bottom}"/>`);
  out.push(`<rect class="chart__frame" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></g>`);

  const board = labelBoard({ x0: left + 2, x1: right - 2, y0: top + 2, y1: bottom - 2 });
  const labels = [];
  const label = (text, cls, at) => labels.push(`<text class="${cls}" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(text)}</text>`);
  const radius = narrow || panel ? 2.5 : 3;

  // Drawable runs: missing values break the line, values below the domain sit on its floor.
  const prepared = series.map((s) => {
    const runs = [[]];
    for (const p of s.points) {
      const valid = Number.isFinite(p.x) && Number.isFinite(p.y) && p.y !== null && (!ay.log || p.y >= 0) && p.x >= x.domain[0] && p.x <= x.domain[1];
      if (!valid) {
        if (runs.at(-1).length) runs.push([]);
        continue;
      }
      const clamped = Math.min(Math.max(p.y, lowY), y.domain[1]);
      runs.at(-1).push([ax.map(p.x), ay.map(clamped), p.y < lowY || p.y > y.domain[1]]);
    }
    return { ...s, runs: runs.filter((r) => r.length) };
  });

  // The references first: they are obstacles for the labels, and are drawn beneath the data.
  const references = rules
    .map((r) => {
      if (r.kind === 'h') return { ...r, seg: [left, ay.map(r.y), right, ay.map(r.y)] };
      if (r.kind === 'v') return { ...r, seg: [ax.map(r.x), top, ax.map(r.x), bottom] };
      const f = Math.log10(r.factor ?? 1);
      const clipped = clipLineToRange(r.exponent, f, [Math.log10(x.domain[0]), Math.log10(x.domain[1])], [Math.log10(y.domain[0]), Math.log10(y.domain[1])]);
      if (!clipped) return { ...r, seg: null };
      const [xa, ya, xb, yb] = clipped;
      return { ...r, seg: [ax.map(10 ** xa), ay.map(10 ** ya), ax.map(10 ** xb), ay.map(10 ** yb)] };
    })
    .filter((r) => r.seg);
  for (const r of references) board.segment(...r.seg);
  for (const s of prepared) {
    for (const run of s.runs) {
      board.polyline(run.map(([px, py]) => [px, py]));
      if (s.markers !== false) for (const [px, py] of run) board.circle(px, py, radius);
    }
  }

  for (const s of prepared) {
    if (!s.label) continue;
    const all = s.runs.flat();
    if (!all.length) continue;
    const t = s.from ?? 0.6;
    const order = [];
    const start = Math.round((all.length - 1) * t);
    for (let k = 0; order.length < all.length; k += 1) {
      if (start + k < all.length) order.push(all[start + k]);
      if (k > 0 && start - k >= 0) order.push(all[start - k]);
    }
    const at = board.place(s.label, { anchors: order.slice(0, 12).map(([px, py]) => [px, py]), directions: s.prefer ?? ['n', 'nw', 'ne', 's', 'se', 'sw', 'e', 'w'] });
    label(s.label, 'chart__series-label', at);
  }
  for (const r of references) {
    const [x1, y1, x2, y2] = r.seg;
    const anchors = (r.kind === 'h' ? [0.08, 0.92, 0.5] : [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]).map((t) => [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    const at = board.place(r.label, { anchors, directions: r.kind === 'h' ? ['ne', 'nw', 'se', 'sw'] : ['nw', 'se', 'w', 'e', 'n', 's'] });
    label(r.label, 'chart__annotation', at);
  }

  out.push('<g class="chart__references" aria-hidden="true">');
  for (const r of references) out.push(`<line class="chart__reference" x1="${round(r.seg[0])}" y1="${round(r.seg[1])}" x2="${round(r.seg[2])}" y2="${round(r.seg[3])}"/>`);
  out.push('</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const s of prepared) {
    if (s.line !== false) {
      for (const run of s.runs) {
        if (run.length < 2) continue;
        out.push(`<path class="chart__curve chart__curve--measured"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} d="${run.map(([px, py], i) => `${i ? 'L' : 'M'}${round(px)},${round(py)}`).join('')}"/>`);
      }
    }
  }
  for (const s of prepared) {
    const cls = `chart__point${s.style === 'ring' ? ' chart__point--ring' : s.style === 'ink' ? ' chart__point--ink' : ''}`;
    if (s.markers === false) continue;
    for (const run of s.runs) for (const [px, py] of run) out.push(marker(s.shape ?? 'circle', px, py, radius, cls));
  }
  out.push(...labels, '</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const t of ay.ticks) out.push(`<text class="chart__ylabel" x="${left - 6}" y="${round(ay.map(t.value))}" text-anchor="end" dominant-baseline="middle">${richText(t.label)}</text>`);
  for (const t of ax.ticks) out.push(`<text class="chart__xlabel" x="${round(ax.map(t.value))}" y="${bottom + 17}" text-anchor="middle">${richText(t.label)}</text>`);
  if (y.label) out.push(`<text class="chart__axis-title" transform="translate(11 ${round(top + (bottom - top) / 2)}) rotate(-90)" text-anchor="middle">${richText(y.label)}</text>`);
  if (x.label) out.push(`<text class="chart__axis-title" x="${round(left + (right - left) / 2)}" y="${bottom + 36}" text-anchor="middle">${richText(x.label)}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/**
 * A wide chart for the page and print and a narrow one for phones, where the wide one would shrink its type.
 * @param {(width: number, id: string) => string} draw
 */
export function swap(draw, { id, width = 640, narrowWidth = NARROW_WIDTH }) {
  return `<div class="chart-swap"><div class="chart-swap__wide">${draw(width, id)}</div><div class="chart-swap__narrow">${draw(narrowWidth, `${id}-narrow`)}</div></div>`;
}

/** Panels in a grid of one figure: each a titled chart. */
export function panels(items, columns = 2) {
  const cells = items.map((p) => `<div class="chart-panel"><p class="chart-panel__title">${p.title}</p>${p.svg}</div>`).join('');
  return `<div class="chart-panels" data-columns="${columns}">${cells}</div>`;
}

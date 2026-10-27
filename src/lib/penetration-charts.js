/**
 * Figures and tables of homework 04, rendered from the summary of
 * src/lib/penetration-study.js as static, printable SVG and HTML.
 *
 *   renderTrajectories   Fig. 1, sample paths of Sₙ, Sₙ/n and Sₙ/√n with the theoretical envelope
 *   renderDistributions  Figs. 2 and 3, the law of the three quantities at increasing n (ridgelines)
 *   renderVariance       Fig. 4, the variance against n on log–log axes
 *   renderLln            Fig. 5, P(|Sₙ/n − μ| ≥ ε) against n with the Chebyshev and Hoeffding bounds
 *   renderCltPlots       Fig. 6, normal probability plots of the Rademacher Sₙ/√n
 *   renderKolmogorov     Fig. 7, the Kolmogorov distance to N(0, 1) against n
 *   renderContrast       Fig. 8, the Bernoulli Sₙ/√n against its standardised form
 *   renderPrecision      Fig. 9, the precision of the empirical mean and distribution function against m
 *   renderBestAttacker   Fig. 10, the chance that the best of m attackers reaches a share of the systems
 *   render…Table         the tables
 *
 * Everything is drawn with the classes of src/styles/hw01.css and
 * hw04-figures.css: green rulings, a green-ink frame, ink for theory and
 * references, plot red only for simulated values.
 */

import { escapeXml, labelBoard, richText } from './charts.js';
import { modelFromSample, normPdf } from './normal.js';
import { formatNumber, renderProbabilityPlotSVG } from './probability-plot.js';
import { NORMALIZATIONS } from './penetration.js';

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
export const int = (v) => (finite(v) ? Math.round(v).toLocaleString('en-GB').replace(/^-/, '−') : DASH);

/** A number with thousands separators and a fixed number of decimals; a rounded zero carries no sign. */
export function dec(v, digits = 1) {
  if (!finite(v)) return DASH;
  const r = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  return r.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/^-/, '−');
}

/** A number with s significant digits in fixed-point notation. */
export function sig(v, s = 3) {
  if (!finite(v)) return DASH;
  if (v === 0) return '0';
  return fmt(v, Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(v)))));
}

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻' };
/** Unicode superscript digits, for plain text (tokens, titles, descriptions). */
export const superscript = (s) => String(s).replace(/[0-9−]/g, (c) => SUPERSCRIPT[c]);

/** Mantissa and base-10 exponent of a non-zero number, the mantissa with s significant digits. */
function sciParts(v, s) {
  let e = Math.floor(Math.log10(Math.abs(v)));
  let mantissa = (v / 10 ** e).toFixed(s - 1);
  if (Math.abs(Number(mantissa)) >= 10) {
    e += 1;
    mantissa = (v / 10 ** e).toFixed(s - 1);
  }
  return { mantissa: fmt(Number(mantissa), s - 1), exponent: e < 0 ? `−${-e}` : String(e) };
}

const plainRange = (v) => Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6;

/** A number as plain text: fixed-point in [10⁻³, 10⁶), otherwise "3.20 × 10⁻²⁷". */
export function sci(v, s = 3) {
  if (!finite(v)) return DASH;
  if (v === 0 || plainRange(v)) return sig(v, s);
  const { mantissa, exponent } = sciParts(v, s);
  return `${mantissa} × 10${superscript(exponent)}`;
}

/** The same in markup, with a real superscript. */
export function sciHtml(v, s = 3) {
  if (!finite(v)) return DASH;
  if (v === 0 || plainRange(v)) return sig(v, s);
  const { mantissa, exponent } = sciParts(v, s);
  return `${mantissa} × 10<sup>${exponent}</sup>`;
}

/** A large count as text, with separators below a million and in scientific notation above. */
export const count = (v) => (!finite(v) ? DASH : Math.abs(v) < 1e6 ? int(v) : sci(v, 3));

const countHtml = (v) => (!finite(v) ? DASH : Math.abs(v) < 1e6 ? int(v) : sciHtml(v, 3));

/* The model and quantity names printed in captions and heads. */
export const MODEL_LABEL = { bernoulli: 'Bernoulli', rademacher: 'Rademacher' };
const QUANTITIES = ['total', 'average', 'normalized'];

/* ------------------------------------------------------------ geometry */

const round = (v) => Math.round(v * 10) / 10;
const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

function layout(width, height, margin = {}) {
  const narrow = width < 420;
  const m = { top: 12, right: narrow ? 10 : 16, bottom: 44, left: narrow ? 48 : 56, ...margin };
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

/* An axis: linear or base-10 logarithmic, from data values to pixels. */
function scaleOf(axis, r0, r1) {
  const t = axis.log ? Math.log10 : (v) => v;
  const s = lin(t(axis.domain[0]), t(axis.domain[1]), r0, r1);
  return (v) => s(t(v));
}
const valid = (axis, v) => finite(v) && (!axis.log || v > 0);
const clampTo = (axis, v) => Math.min(axis.domain[1], Math.max(axis.domain[0], valid(axis, v) ? v : axis.domain[0]));

/* The part of a segment inside a box (Liang–Barsky), or null. */
function clipSegment(x1, y1, x2, y2, b) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, x1 - b.x0],
    [dx, b.x1 - x1],
    [-dy, y1 - b.y0],
    [dy, b.y1 - y1],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy, t1 < 1];
}

/* A polyline (pixel points, null for a gap) cut to a box, as runs of drawable points. */
function clipRuns(points, box) {
  const runs = [];
  let current = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const seg = a && b ? clipSegment(a[0], a[1], b[0], b[1], box) : null;
    if (!seg) {
      current = null;
      continue;
    }
    const [xa, ya, xb, yb, cutEnd] = seg;
    const last = current?.at(-1);
    if (last && Math.abs(last[0] - xa) < 0.01 && Math.abs(last[1] - ya) < 0.01) current.push([xb, yb]);
    else {
      current = [
        [xa, ya],
        [xb, yb],
      ];
      runs.push(current);
    }
    if (cutEnd) current = null;
  }
  return runs;
}

/*
 * Path data of the runs. `coarse` rounds to whole pixels and writes relative steps ("l3-2"), which
 * is enough for the many thin sample paths of Fig. 1 and keeps the printed page light.
 */
const pathOf = (runs, coarse = false) => {
  if (!coarse) return runs.map((run) => run.map(([x, y], k) => `${k ? 'L' : 'M'}${round(x)},${round(y)}`).join('')).join('');
  return runs
    .map((run) => {
      const pts = run.map(([x, y]) => [Math.round(x), Math.round(y)]);
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let k = 1; k < pts.length; k += 1) {
        const dx = pts[k][0] - pts[k - 1][0];
        const dy = pts[k][1] - pts[k - 1][1];
        d += `l${dx}${dy < 0 ? dy : `,${dy}`}`;
      }
      return d;
    })
    .join('');
};

/* ------------------------------------------------------------ ticks */

function niceStep(raw) {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}

/** Linear ticks with nice values inside [lo, hi]. */
function linearTicks(lo, hi, target = 5) {
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

/** Ticks at the powers of ten inside [lo, hi], every `every` decades. */
function decadeTicks(lo, hi, every = 1) {
  const out = [];
  const k0 = Math.ceil(Math.log10(lo) - 1e-9);
  for (let k = k0; k <= Math.floor(Math.log10(hi) + 1e-9); k += 1) {
    if ((k - k0) % every === 0) out.push({ value: 10 ** k, label: decadeLabel(k) });
  }
  return out;
}

const logAxis = (lo, hi, every) => ({ log: true, domain: [lo, hi], ticks: decadeTicks(lo, hi, every) });

/* ------------------------------------------------------------ panel */

/**
 * One chart panel on linear or logarithmic axes: bands (interval areas), ink lines with optional
 * dashes and direct labels, vertical ranges, plot-red points (or open rings), and dashed horizontal
 * references. Lines are cut to the plot area; labels are placed by the label board of charts.js.
 */
function panel({ id, title, desc, width, height, x, y, xLabel = '', yLabel = '', bands = [], lines = [], ranges = [], points = [], references = [], className = '', margin }) {
  const g = layout(width, height, margin);
  const X = scaleOf(x, g.left, g.right);
  const Y = scaleOf(y, g.bottom, g.top);
  const box = { x0: g.left, x1: g.right, y0: g.top, y1: g.bottom };
  const inside = (px, py) => px >= g.left - 0.5 && px <= g.right + 0.5 && py >= g.top - 0.5 && py <= g.bottom + 0.5;
  const out = [svgOpen({ id, width, height, title, desc, className: `chart--panel ${className}` })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of y.ticks) {
    const ty = Y(t.value);
    if (ty > g.top + 0.5 && ty < g.bottom - 0.5) out.push(`<line class="chart__ruling" x1="${g.left}" x2="${round(g.right)}" y1="${round(ty)}" y2="${round(ty)}"/>`);
  }
  for (const t of x.ticks) {
    const tx = X(t.value);
    if (tx > g.left + 0.5 && tx < g.right - 0.5) out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(tx)}" x2="${round(tx)}" y1="${g.top}" y2="${round(g.bottom)}"/>`);
  }
  out.push(`<rect class="chart__frame" x="${g.left}" y="${g.top}" width="${round(g.plotW)}" height="${round(g.plotH)}"/>`, '</g>');

  for (const b of bands) {
    const pts = b.points.filter((p) => valid(x, p.x));
    const upper = pts.map((p, i) => `${i ? 'L' : 'M'}${round(X(p.x))},${round(Y(clampTo(y, p.high)))}`).join('');
    const lower = [...pts].reverse().map((p) => `L${round(X(p.x))},${round(Y(clampTo(y, p.low)))}`).join('');
    if (upper) out.push(`<path class="chart__band-area" d="${upper}${lower}Z" aria-hidden="true"/>`);
  }

  const board = labelBoard({ x0: g.left + 2, x1: g.right - 2, y0: g.top + 2, y1: g.bottom - 2 });
  const labels = [];
  out.push('<g class="chart__references" aria-hidden="true">');
  for (const ref of references) {
    const ry = Y(ref.y);
    if (!(ry >= g.top && ry <= g.bottom)) continue;
    out.push(`<line class="chart__reference" x1="${g.left}" x2="${round(g.right)}" y1="${round(ry)}" y2="${round(ry)}"/>`);
    board.segment(g.left, ry, g.right, ry);
  }
  out.push('</g>');

  const runs = lines.map((l) => clipRuns(l.points.map((p) => (valid(x, p.x) && valid(y, p.y) ? [X(p.x), Y(p.y)] : null)), box));
  runs.forEach((r) => r.forEach((run) => board.polyline(run)));
  const dots = points
    .filter((p) => valid(x, p.x) && valid(y, p.y))
    .map((p) => ({ px: X(p.x), py: Y(p.y), r: p.r ?? (g.narrow ? 2.4 : 2.8), ring: p.ring }))
    .filter((d) => inside(d.px, d.py));
  dots.forEach((d) => board.circle(d.px, d.py, d.r));
  const spans = ranges
    .filter((rg) => valid(x, rg.x))
    .map((rg) => ({ px: X(rg.x), y1: Y(clampTo(y, rg.low)), y2: Y(clampTo(y, rg.high)) }))
    .filter((s) => s.px >= g.left - 0.5 && s.px <= g.right + 0.5);
  spans.forEach((s) => board.segment(s.px, s.y1, s.px, s.y2));

  for (const ref of references) {
    const ry = Y(ref.y);
    if (!ref.label || !(ry >= g.top && ry <= g.bottom)) continue;
    const at = board.place(ref.label, { anchors: [[g.right - 4, ry], [g.left + 40, ry]], directions: ref.directions ?? ['nw', 'sw', 'ne', 'se'] });
    labels.push(`<text class="chart__annotation" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(ref.label)}</text>`);
  }
  lines.forEach((l, i) => {
    const all = runs[i].flat();
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

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const s of spans) out.push(`<line class="chart__range" x1="${round(s.px)}" x2="${round(s.px)}" y1="${round(s.y1)}" y2="${round(s.y2)}"/>`);
  lines.forEach((l, i) => {
    const d = pathOf(runs[i], l.coarse);
    if (d) out.push(`<path class="${l.className ?? 'chart__curve'}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''} d="${d}"/>`);
  });
  for (const d of dots) {
    out.push(`<circle class="chart__point${d.ring ? ' chart__point--ring' : ''}" cx="${round(d.px)}" cy="${round(d.py)}" r="${d.r}"/>`);
  }
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
  if (yLabel) out.push(`<text class="chart__axis-title" transform="translate(11 ${round(g.top + g.plotH / 2)}) rotate(-90)" text-anchor="middle">${richText(yLabel)}</text>`);
  if (xLabel) out.push(`<text class="chart__axis-title" x="${round(g.left + g.plotW / 2)}" y="${round(g.bottom + 37)}" text-anchor="middle">${richText(xLabel)}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/* Panels side by side (as many columns as fit at minWidth or more), or stacked, as in homework 03. */
const GAP = 16;
function panels(parts, width, { maxColumns = 3, minWidth = 190 } = {}) {
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

/* Least-squares line through (log₁₀ n, log₁₀ y) as two end points for a log–log panel. */
const fitLine = (fit, n0, n1) => [n0, n1].map((n) => ({ x: n, y: 10 ** (fit.intercept + fit.slope * Math.log10(n)) }));

const nAxis = (nMax) => logAxis(0.7, nMax * 1.45);

/* ------------------------------------------------------------ Fig. 1, trajectories */

const QUANTITY_DESC = {
  total: 'total score Sₙ',
  average: 'average score Sₙ/n',
  normalized: 'normalised total score Sₙ/√n',
};

/**
 * Sample paths of the three quantities, one panel per model and quantity.
 * @param {object} tr the trajectories of the study
 * @param {{ id: string, width?: number, p: number }} options
 */
export function renderTrajectories(tr, { id, width = 640, p }) {
  const parts = [];
  for (const model of ['bernoulli', 'rademacher']) {
    const data = tr.models[model];
    for (const q of QUANTITIES) {
      const d = NORMALIZATIONS[q].divisor;
      const paths = data.paths.map((path) => path.map((s, i) => s / d(tr.t[i])));
      const env = data.envelope[q];
      const from = tr.t.findIndex((t) => t >= tr.n / 20);
      const envLo = Math.min(...env.mean.slice(from).map((mu, i) => mu - 2.2 * env.sd[from + i]));
      const envHi = Math.max(...env.mean.slice(from).map((mu, i) => mu + 2.2 * env.sd[from + i]));
      const values = paths.flat();
      let lo = Math.min(envLo, ...values);
      let hi = Math.max(envHi, ...values);
      const pad = (hi - lo) * 0.05;
      lo -= pad;
      hi += pad;
      const label = NORMALIZATIONS[q].label;
      parts.push((w) => {
        const h = Math.round(Math.min(220, Math.max(170, w * 0.86)));
        return {
          title: `${MODEL_LABEL[model]} · ${label}`,
          html: panel({
            id: `${id}-${model}-${q}`,
            title: `${MODEL_LABEL[model]} model: ${QUANTITY_DESC[q]} of ${tr.m} attackers over ${tr.n} systems`,
            desc: `Thin lines are the ${QUANTITY_DESC[q]} of ${tr.m} simulated attackers against the number of systems attacked, from 1 to ${tr.n}${model === 'bernoulli' ? `, with Bernoulli increments of success probability ${p}` : ', with Rademacher increments'}. The shaded band is the theoretical mean plus or minus two standard deviations, the dashed line the theoretical mean; red points mark the value of each attacker after the last system.`,
            width: w,
            height: h,
            x: { log: false, domain: [0, tr.n], ticks: linearTicks(0, tr.n, 4) },
            y: { log: false, domain: [lo, hi], ticks: linearTicks(lo, hi, 4) },
            xLabel: 'Systems attacked n',
            yLabel: label,
            bands: [{ points: tr.t.map((t, i) => ({ x: t, low: env.mean[i] - 2 * env.sd[i], high: env.mean[i] + 2 * env.sd[i] })) }],
            lines: [
              ...paths.map((path) => ({ points: path.map((v, i) => ({ x: tr.t[i], y: v })), className: 'chart__path', coarse: true })),
              { points: tr.t.map((t, i) => ({ x: t, y: env.mean[i] })), className: 'chart__curve chart__curve--mean', dash: '6 4' },
            ],
            points: paths.map((path) => ({ x: tr.n, y: path.at(-1), r: 2.1 })),
            className: 'chart--paths',
          }),
        };
      });
    }
  }
  return panels(parts, width, { maxColumns: 3, minWidth: 180 });
}

/* ------------------------------------------------------------ Figs. 2, 3 and 8, distributions */

/* The value of a quantity at the binomial count k of Sₙ, and its spacing per unit of k. */
function columnMap(column, law, n) {
  const span = law.high - law.low;
  const divisor = { total: 1, average: n, normalized: Math.sqrt(n), standardised: Math.sqrt(n * law.variance) }[column];
  const shift = column === 'standardised' ? n * law.mean : 0;
  return { at: (k) => (n * law.low + span * k - shift) / divisor, unit: span / divisor };
}

const COLUMN_LABEL = { total: 'Sₙ', average: 'Sₙ/n', normalized: 'Sₙ/√n', standardised: '(Sₙ − nμ)/(σ√n)' };
const COLUMN_NAME = {
  total: 'total score Sₙ',
  average: 'average score Sₙ/n',
  normalized: 'normalised total score Sₙ/√n',
  standardised: 'standardised score (Sₙ − nμ)/(σ√n)',
};

/* One column of a ridgeline: a row per n on a common axis, each row scaled to its own maximum. */
function ridgeColumn({ id, column, rows, law, m, width, normal, modelLabel }) {
  const rowH = 44;
  const rowGap = 6;
  const g = layout(width, 0, { left: 12, right: 12, top: 6, bottom: 40 });
  const height = g.margin.top + rows.length * (rowH + rowGap) - rowGap + g.margin.bottom;
  const bottom = height - g.margin.bottom;
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rows) {
    const { at } = columnMap(column, law, r.n);
    lo = Math.min(lo, at(r.k0 - 0.5));
    hi = Math.max(hi, at(r.k0 + r.width * r.exact.length - 0.5));
  }
  if (normal) {
    lo = Math.min(lo, -4);
    hi = Math.max(hi, 4);
  }
  const pad = (hi - lo) * 0.03;
  lo -= pad;
  hi += pad;
  const X = lin(lo, hi, g.left, g.right);
  const ticks = linearTicks(lo, hi, g.narrow ? 3 : 4);
  const label = COLUMN_LABEL[column];
  const desc =
    `The ${COLUMN_NAME[column]} of ${int(m)} simulated attackers, ${modelLabel} increments, after n = ${rows.map((r) => int(r.n)).join(', ')} systems, one row each on a common horizontal axis. ` +
    `Bars are the simulated densities, the ink steps the exact law of the same bins${normal ? ', the dashed curve the standard normal density' : ''}; each row is scaled to its own maximum.`;
  const out = [svgOpen({ id, width, height, title: `${modelLabel} model: the ${COLUMN_NAME[column]} at increasing n`, desc, className: 'chart--ridges' })];
  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of ticks) {
    const tx = X(t.value);
    if (tx > g.left + 0.5 && tx < g.right - 0.5) out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(tx)}" x2="${round(tx)}" y1="${g.margin.top}" y2="${round(bottom)}"/>`);
  }
  out.push(`<rect class="chart__frame" x="${g.left}" y="${g.margin.top}" width="${round(g.plotW)}" height="${round(bottom - g.margin.top)}"/>`, '</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  rows.forEach((r, i) => {
    const top = g.margin.top + i * (rowH + rowGap);
    const base = top + rowH;
    const { at } = columnMap(column, law, r.n);
    const bins = r.exact.map((p, b) => {
      const x0 = at(r.k0 + b * r.width - 0.5);
      const x1 = at(r.k0 + (b + 1) * r.width - 0.5);
      const w = x1 - x0;
      return { x0, x1, empirical: r.empirical[b] / m / w, exact: p / w };
    });
    const normalPeak = normal && X(0) >= g.left && X(0) <= g.right ? normPdf(0) : 0;
    const yMax = Math.max(...bins.map((b) => Math.max(b.empirical, b.exact)), normalPeak) * 1.08;
    const Y = lin(0, yMax, base, top + 12);
    if (i > 0) out.push(`<line class="chart__row-rule" x1="${g.left}" x2="${round(g.right)}" y1="${round(top - rowGap / 2)}" y2="${round(top - rowGap / 2)}"/>`);
    for (const b of bins) {
      if (b.empirical <= 0) continue;
      const bx = X(b.x0);
      const bw = Math.max(0.6, X(b.x1) - bx - (X(b.x1) - bx > 4 ? 1 : 0));
      out.push(`<rect class="chart__bar" x="${round(bx)}" y="${round(Y(b.empirical))}" width="${round(bw)}" height="${round(base - Y(b.empirical))}"/>`);
    }
    const step = bins.map((b, k) => `${k ? '' : `M${round(X(b.x0))},${round(base)}`}V${round(Y(b.exact))}H${round(X(b.x1))}`).join('') + `V${round(base)}`;
    out.push(`<path class="chart__expected" d="${step}"/>`);
    if (normal) {
      const pts = [];
      for (let k = 0; k <= 80; k += 1) {
        const z = -4.5 + (9 * k) / 80;
        const px = X(z);
        if (px >= g.left && px <= g.right) pts.push(`${pts.length ? 'L' : 'M'}${round(px)},${round(Y(normPdf(z)))}`);
      }
      out.push(`<path class="chart__normal" d="${pts.join('')}"/>`);
    }
    out.push(`<line class="chart__baseline" x1="${g.left}" x2="${round(g.right)}" y1="${round(base)}" y2="${round(base)}"/>`);
    out.push(`<text class="chart__row-label" x="${g.left + 5}" y="${round(top + 10)}">n = ${int(r.n)}</text>`);
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const t of ticks) {
    const tx = X(t.value);
    if (tx >= g.left - 0.5 && tx <= g.right + 0.5) out.push(`<text class="chart__xlabel" x="${round(tx)}" y="${round(bottom + 17)}" text-anchor="middle">${richText(t.label)}</text>`);
  }
  out.push(`<text class="chart__axis-title" x="${round(g.left + g.plotW / 2)}" y="${round(bottom + 35)}" text-anchor="middle">${richText(label)}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/**
 * The law of the total, average and normalised scores at increasing n for one model, as three
 * ridgeline columns on common axes; the standard normal density is drawn under Sₙ/√n.
 * @param {object[]} rows the binned laws of the study for this model
 * @param {object} law the increment law
 * @param {{ id: string, width?: number, m: number, columns?: string[] }} options
 */
export function renderDistributions(rows, law, { id, width = 640, m, columns = QUANTITIES }) {
  const modelLabel = MODEL_LABEL[law.model];
  const parts = columns.map((column) => (w) => ({
    title: `${modelLabel} · ${COLUMN_LABEL[column]}`,
    html: ridgeColumn({ id: `${id}-${column}`, column, rows, law, m, width: w, normal: column === 'normalized' || column === 'standardised', modelLabel }),
  }));
  return panels(parts, width, { maxColumns: columns.length, minWidth: 180 });
}

/** Fig. 8: the Bernoulli Sₙ/√n, which drifts with mean p√n, against its standardised form. */
export function renderContrast(rows, law, { id, width = 640, m }) {
  return renderDistributions(rows, law, { id, width, m, columns: ['normalized', 'standardised'] });
}

/* ------------------------------------------------------------ Fig. 4, variance */

/**
 * The variance of the three quantities against n on log–log axes, one panel per model: simulated
 * variances as points, the theoretical laws n·σ², σ²/n and σ² as lines labelled with the fitted slope.
 */
export function renderVariance(variance, laws, { id, width = 640, m }) {
  const parts = ['bernoulli', 'rademacher'].map((model) => (w) => {
    const v = variance[model];
    const law = laws[model];
    const ns = v.points.map((pt) => pt.n);
    const nMax = Math.max(...ns);
    const values = v.points.flatMap((pt) => QUANTITIES.map((q) => pt[q]));
    const lo = 10 ** Math.floor(Math.log10(Math.min(...values)) - 0.2);
    const hi = 10 ** Math.ceil(Math.log10(Math.max(...values)) + 0.2);
    const theory = { total: (n) => n * law.variance, average: (n) => law.variance / n, normalized: () => law.variance };
    const h = Math.round(Math.min(300, Math.max(240, w * 0.8)));
    const span = Math.round(Math.log10(hi / lo));
    return {
      title: `${MODEL_LABEL[model]} · σ² = ${sig(law.variance, 3)}`,
      html: panel({
        id: `${id}-${model}`,
        title: `${MODEL_LABEL[model]} model: variance of Sₙ, Sₙ/n and Sₙ/√n against n`,
        desc: `Simulated variances over ${int(m)} attackers (points) and the theoretical variances n·σ², σ²/n and σ² (lines) for n = 1 to ${int(nMax)}, on logarithmic axes. Fitted slopes: ${QUANTITIES.map((q) => `${NORMALIZATIONS[q].label} ${fmt(v.fits[q].slope, 3)}`).join(', ')}.`,
        width: w,
        height: h,
        x: nAxis(nMax),
        y: logAxis(lo, hi, span > 7 ? 2 : 1),
        xLabel: 'Systems n',
        yLabel: 'Variance',
        lines: QUANTITIES.map((q) => ({
          // Many points along each straight line, so that its label can sit anywhere on it.
          points: Array.from({ length: 41 }, (_, k) => 0.7 * (nMax * 1.45 / 0.7) ** (k / 40)).map((n) => ({ x: n, y: theory[q](n) })),
          className: 'chart__curve',
          label: `${NORMALIZATIONS[q].label}: slope ${fmt(v.fits[q].slope, 3)}`,
          labelAt: q === 'normalized' ? 0.5 : 0.75,
          directions: q === 'total' ? ['nw', 'w', 'n'] : q === 'average' ? ['ne', 'e', 'n'] : ['n', 's', 'ne'],
        })),
        points: v.points.flatMap((pt) => QUANTITIES.map((q) => ({ x: pt.n, y: pt[q] }))),
      }),
    };
  });
  return panels(parts, width, { maxColumns: 2, minWidth: 260 });
}

/* ------------------------------------------------------------ Fig. 5, law of large numbers */

const P_FLOOR = 1e-6;

/** P(|Sₙ/n − μ| ≥ ε) against n, one panel per model and ε: exact, bounds and simulation. */
export function renderLln(lln, { id, width = 640, m, level }) {
  const parts = [];
  for (const model of ['bernoulli', 'rademacher']) {
    for (const block of lln[model]) {
      parts.push((w) => {
        const nMax = Math.max(...block.points.map((pt) => pt.n));
        const h = Math.round(Math.min(270, Math.max(220, w * 0.74)));
        const curve = (key) => block.dense.map((pt) => ({ x: pt.n, y: Math.max(pt[key], P_FLOOR / 10) }));
        return {
          title: `${MODEL_LABEL[model]} · ε = ${block.eps}`,
          html: panel({
            id: `${id}-${model}-${String(block.eps).replace('.', 'p')}`,
            title: `${MODEL_LABEL[model]} model: probability that the average score deviates from its mean by at least ${block.eps}`,
            desc: `Exact probability P(|Sₙ/n − μ| ≥ ${block.eps}) against n (solid line), Chebyshev's bound (long dashes) and Hoeffding's bound (short dashes), on logarithmic axes cut at 10⁻⁶; red points are the proportions of ${int(m)} simulated attackers with Wilson 95% intervals. The exact probability stays below ${level} from n = ${block.nExact ?? DASH}; Chebyshev guarantees it from n = ${block.nChebyshev}, Hoeffding from n = ${block.nHoeffding}.`,
            width: w,
            height: h,
            x: nAxis(nMax),
            y: logAxis(P_FLOOR, 1.6, 2),
            xLabel: 'Systems n',
            yLabel: 'Probability',
            lines: [
              { points: curve('exact'), className: 'chart__curve', label: 'exact', labelAt: 0.55, directions: ['sw', 'w', 's', 'se'] },
              { points: curve('chebyshev'), className: 'chart__curve chart__curve--bound', dash: '7 4', label: 'Chebyshev', labelAt: 0.92, directions: ['n', 'nw', 'ne', 'w'] },
              { points: curve('hoeffding'), className: 'chart__curve chart__curve--bound', dash: '2 3', label: 'Hoeffding', labelAt: 0.7, directions: ['ne', 'e', 'n', 'se'] },
            ],
            ranges: block.points.map((pt) => ({ x: pt.n, low: pt.low, high: pt.high })),
            points: block.points.filter((pt) => pt.count > 0).map((pt) => ({ x: pt.n, y: pt.empirical })),
            references: [{ y: level, label: String(level), directions: ['sw', 'nw', 'se'] }],
          }),
        };
      });
    }
  }
  return panels(parts, width, { maxColumns: 2, minWidth: 260 });
}

/* ------------------------------------------------------------ Fig. 6, probability plots */

/** Normal probability plots of the Rademacher Sₙ/√n at the quantiles kept by the study. */
export function renderCltPlots(plots, { id, width = 640, seed, m }) {
  const parts = plots.map((plot) => (w) => {
    const model = modelFromSample(plot.quantiles, {
      seed,
      label: `Sₙ/√n at n = ${int(plot.n)}`,
      title: `Normal probability plot of the Rademacher Sₙ/√n at n = ${int(plot.n)}`,
      description: `${plot.quantiles.length} quantiles of the normalised total score of ${int(m)} simulated attackers after ${int(plot.n)} systems, at Blom's plotting positions, against the normal scale of the paper; a standard normal sample would lie on a straight line of slope 1 through the origin. Sample mean ${fmt(plot.mean, 3)}, standard deviation ${fmt(plot.sd, 3)}.`,
    });
    const h = Math.round(Math.min(280, Math.max(230, w * 1.12)));
    return {
      title: `n = ${int(plot.n)} · r = ${fmt(model.fit.r, 4)}`,
      html: renderProbabilityPlotSVG(model, { width: w, height: h, id: `${id}-n${plot.n}`, xLabel: 'Sₙ/√n' }),
    };
  });
  return panels(parts, width, { maxColumns: 3, minWidth: 180 });
}

/** The probability-plot correlation of each plot (the r printed in its title). */
export const plotCorrelation = (plot) => modelFromSample(plot.quantiles).fit.r;

/* ------------------------------------------------------------ Fig. 7, Kolmogorov distance */

/** The Kolmogorov distance to N(0, 1) against n: Rademacher (left) and Bernoulli (right). */
export function renderKolmogorov(clt, { id, width = 640, m, p, pSmall }) {
  const nMax = Math.max(...clt.rademacher.points.map((pt) => pt.n));
  const y = logAxis(1e-3, 1.5, 1);
  const dkw = { y: clt.dkw, label: `DKW 95%, m = ${int(m)}`, directions: ['sw', 'nw', 'se'] };
  const h = (w) => Math.round(Math.min(290, Math.max(240, w * 0.8)));
  const rademacher = (w) => ({
    title: 'Rademacher · Sₙ/√n',
    html: panel({
      id: `${id}-rademacher`,
      title: 'Rademacher model: Kolmogorov distance between the law of Sₙ/√n and N(0, 1) against n',
      desc: `Exact distance (solid line), Berry–Esseen bound (dashed) and the distance of the empirical law of ${int(m)} simulated attackers (red points), on logarithmic axes; the dashed horizontal line is the 95% DKW radius of ${int(m)} observations, the Monte Carlo floor below which the simulation cannot resolve the distance. The exact distance falls with a fitted slope of ${fmt(clt.rademacher.fitExact.slope, 3)} from n = 10.`,
      width: w,
      height: h(w),
      x: nAxis(nMax),
      y,
      xLabel: 'Systems n',
      yLabel: 'Kolmogorov distance',
      lines: [
        { points: clt.rademacher.dense.map((pt) => ({ x: pt.n, y: pt.exact })), label: `exact, slope ${fmt(clt.rademacher.fitExact.slope, 2)}`, labelAt: 0.45, directions: ['sw', 's', 'w'] },
        { points: clt.rademacher.dense.map((pt) => ({ x: pt.n, y: pt.berryEsseen })), dash: '7 4', label: 'Berry–Esseen', labelAt: 0.75, directions: ['ne', 'n', 'e'] },
      ],
      points: clt.rademacher.points.map((pt) => ({ x: pt.n, y: pt.empirical })),
      references: [dkw],
    }),
  });
  const bernoulli = (w) => ({
    title: `Bernoulli · p = ${p} and ${pSmall}`,
    html: panel({
      id: `${id}-bernoulli`,
      title: 'Bernoulli model: Kolmogorov distance to N(0, 1) of Sₙ/√n and of the standardised score against n',
      desc: `Exact distances to N(0, 1) of the standardised score (Sₙ − nμ)/(σ√n) for p = ${p} (solid) and p = ${pSmall} (dash-dot), and of Sₙ/√n itself for p = ${p} (dotted), which tends to 1 because its mean p√n grows without bound; filled red points are the simulated standardised scores, open points the simulated Sₙ/√n, ${int(m)} attackers each. The dashed horizontal line is the 95% DKW radius.`,
      width: w,
      height: h(w),
      x: nAxis(nMax),
      y,
      xLabel: 'Systems n',
      yLabel: 'Kolmogorov distance',
      lines: [
        { points: clt.bernoulli.dense.map((pt) => ({ x: pt.n, y: pt.exact })), label: `standardised, p = ${p}`, labelAt: 0.5, directions: ['sw', 's', 'w'] },
        { points: clt.bernoulliSmall.dense.map((pt) => ({ x: pt.n, y: pt.exact })), dash: '9 3 2 3', label: `p = ${pSmall}`, labelAt: 0.7, directions: ['ne', 'n', 'e'] },
        { points: clt.bernoulli.dense.map((pt) => ({ x: pt.n, y: pt.raw })), dash: '2 3', label: `Sₙ/√n, p = ${p}`, labelAt: 0.4, directions: ['s', 'se', 'sw'] },
      ],
      points: [
        ...clt.bernoulli.points.map((pt) => ({ x: pt.n, y: pt.empirical })),
        ...clt.bernoulli.points.map((pt) => ({ x: pt.n, y: pt.rawEmpirical, ring: true })),
      ],
      references: [dkw],
    }),
  });
  return panels([rademacher, bernoulli], width, { maxColumns: 2, minWidth: 260 });
}

/* ------------------------------------------------------------ Fig. 9, precision against m */

/** The error of the empirical mean and of the empirical distribution function against m. */
export function renderPrecision(precision, { id, width = 640 }) {
  const rows = precision.models;
  const sizes = rows.bernoulli.map((r) => r.size);
  const x = logAxis(Math.min(...sizes) * 0.7, Math.max(...sizes) * 1.45);
  const h = (w) => Math.round(Math.min(280, Math.max(230, w * 0.78)));
  const series = (key, ring) => (model) => rows[model].map((r) => ({ x: r.size, y: r[key], ring }));
  const allMean = [...rows.bernoulli, ...rows.rademacher].flatMap((r) => [r.rms, r.se]);
  const allD = [...rows.bernoulli, ...rows.rademacher].flatMap((r) => [r.medianD, r.dkw]);
  const axisFor = (values) => logAxis(10 ** Math.floor(Math.log10(Math.min(...values)) - 0.1), 10 ** Math.ceil(Math.log10(Math.max(...values)) + 0.1));
  const mean = (w) => ({
    title: 'Mean of Sₙ/n',
    html: panel({
      id: `${id}-mean`,
      title: `Root-mean-square error of the mean average score of a group of m attackers against m, at n = ${int(precision.n)}`,
      desc: `For each group size m the attackers of the study are split into disjoint groups of m; points are the root-mean-square error of the group mean of Sₙ/n over the groups (filled: Bernoulli, open: Rademacher), lines the standard error σ/√(nm) of each model, on logarithmic axes.`,
      width: w,
      height: h(w),
      x,
      y: axisFor(allMean),
      xLabel: 'Attackers per group m',
      yLabel: 'Error of the mean',
      lines: ['bernoulli', 'rademacher'].map((model, i) => ({
        points: rows[model].map((r) => ({ x: r.size, y: r.se })),
        dash: i ? '7 4' : '',
        label: `σ/√(nm), ${MODEL_LABEL[model]}`,
        labelAt: i ? 0.3 : 0.75,
        directions: i ? ['ne', 'n', 'e'] : ['sw', 's', 'w'],
      })),
      points: [...series('rms', false)('bernoulli'), ...series('rms', true)('rademacher')],
    }),
  });
  const distribution = (w) => ({
    title: 'Distribution function of Sₙ',
    html: panel({
      id: `${id}-ecdf`,
      title: `Median distance between the empirical and the exact distribution function of Sₙ against m, at n = ${int(precision.n)}`,
      desc: `Points are the median over the disjoint groups of the supremum distance between the empirical distribution function of a group of m attackers and the exact distribution function of Sₙ (filled: Bernoulli, open: Rademacher); the line is the 95% radius of the Dvoretzky–Kiefer–Wolfowitz band, √(ln(2/0.05)/(2m)).`,
      width: w,
      height: h(w),
      x,
      y: axisFor(allD),
      xLabel: 'Attackers per group m',
      yLabel: 'Supremum distance',
      lines: [{ points: rows.bernoulli.map((r) => ({ x: r.size, y: r.dkw })), label: 'DKW 95% radius', labelAt: 0.4, directions: ['ne', 'n', 'e'] }],
      points: [...series('medianD', false)('bernoulli'), ...series('medianD', true)('rademacher')],
    }),
  });
  return panels([mean, distribution], width, { maxColumns: 2, minWidth: 260 });
}

/* ------------------------------------------------------------ Fig. 10, best attacker */

/** P(at least one of m attackers penetrates at least a share μ + δ of the n systems) against m. */
export function renderBestAttacker(best, { id, width = 640, p }) {
  const h = Math.round(Math.min(340, Math.max(260, width * 0.5)));
  const decades = Math.round(Math.log10(best.mMax));
  const share = p + best.excess;
  return panel({
    id,
    title: `Probability that at least one of m attackers penetrates at least ${fmt(100 * share, 0)}% of n systems, against m`,
    desc: `Bernoulli increments with p = ${p}. Lines are the exact probabilities 1 − P(Sₙ < ⌈${fmt(share, 2)}n⌉)^m for n = ${best.curves.map((c) => int(c.n)).join(', ')} on a logarithmic axis of m; red points are the proportions of disjoint groups of m simulated attackers whose best member reaches the threshold, with Wilson 95% intervals. The dashed line marks one half: the number of attackers it takes grows exponentially with n.`,
    width,
    height: h,
    x: logAxis(0.7, best.mMax * 1.45, decades > 8 ? 2 : 1),
    y: { log: false, domain: [0, 1.02], ticks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, label: v === 0 ? '0' : fmt(v, 2) })) },
    xLabel: 'Attackers m',
    yLabel: 'P(best attacker reaches the share)',
    lines: best.curves.map((c, i) => ({
      points: c.points.map((pt) => ({ x: pt.m, y: pt.p })),
      dash: ['', '7 4', '2 3', '9 3 2 3', '4 2 1 2'][i % 5],
      label: `n = ${int(c.n)}`,
      labelAt: Math.min(0.95, Math.max(0.05, (c.points.findIndex((pt) => pt.p >= 0.5) + 1) / c.points.length)),
      directions: ['w', 'nw', 'e', 'se'],
    })),
    ranges: best.empirical.map((e) => ({ x: e.size, low: e.low, high: e.high })),
    points: best.empirical.map((e) => ({ x: e.size, y: e.rate })),
    references: [{ y: 0.5, label: '1/2', directions: ['nw', 'sw'] }],
    margin: { left: 50 },
  });
}

/* ------------------------------------------------------------ tables */

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s, cls = 'is-number') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
const sub = (s) => `<span class="data-table__p">${s}</span>`;
const table = (cls, head, rows) =>
  `<table class="data-table data-table--compact data-table--math data-table--hw04 ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/* Decimals that show a value against its standard error: two significant digits of the error. */
const digitsFor = (se) => (finite(se) && se > 0 ? Math.max(0, Math.min(6, 1 - Math.floor(Math.log10(se)))) : 3);

/* An estimate and its standard error; below 10⁻³ both share one power of ten, "(2.089 ± 0.030) × 10⁻⁵". */
function withError(v, se) {
  const size = Math.max(Math.abs(v), se);
  if (!(size > 0 && size < 1e-3)) return `${fmt(v, digitsFor(se))} ± ${fmt(se, digitsFor(se))}`;
  const e = Math.floor(Math.log10(size));
  const k = 10 ** -e;
  const d = digitsFor(se * k);
  return `(${fmt(v * k, d)} ± ${fmt(se * k, d)}) × 10<sup>${e < 0 ? `−${-e}` : e}</sup>`;
}

/** Table 1: empirical mean and variance of the three quantities, with standard errors, against theory. */
export function renderMomentsTable(moments) {
  const rows = [];
  for (const model of ['bernoulli', 'rademacher']) {
    moments[model].forEach((row, i) => {
      const cells = QUANTITIES.flatMap((q) => {
        const v = row[q];
        return [
          td(`${withError(v.mean, v.seMean)}${sub(`theory ${sciHtml(v.theoryMean, 4)}`)}`),
          td(`${withError(v.variance, v.seVariance)}${sub(`theory ${sciHtml(v.theoryVariance, 4)}`)}`),
        ];
      });
      const head = i === 0 ? `<th scope="rowgroup" rowspan="${moments[model].length}">${MODEL_LABEL[model]}</th>` : '';
      rows.push(`<tr>${head}<th scope="row" class="is-number">${int(row.n)}</th>${cells.join('')}</tr>`);
    });
  }
  return table(
    'data-table--moments',
    [th('Model'), th('n', 'is-number'), ...QUANTITIES.flatMap((q) => [th(`Mean of ${NORMALIZATIONS[q].label}`, 'is-number'), th(`Var(${NORMALIZATIONS[q].label})`, 'is-number')])],
    rows,
  );
}

/** Table 2: the fitted log–log slopes of the variance against their theoretical values. */
export function renderVarianceTable(variance, laws) {
  const theory = { total: ['n·σ²', 1], average: ['σ²/n', -1], normalized: ['σ²', 0] };
  const rows = QUANTITIES.map((q) => {
    const cells = ['bernoulli', 'rademacher'].flatMap((model) => {
      const f = variance[model].fits[q];
      return [td(fmt(f.slope, 4)), td(sig(10 ** f.intercept, 4) + sub(`σ² = ${sig(laws[model].variance, 3)}`))];
    });
    return `<tr><th scope="row">${NORMALIZATIONS[q].label}</th>${td(theory[q][0], '')}${td(fmt(theory[q][1], 0))}${cells.join('')}</tr>`;
  });
  return table(
    'data-table--slopes',
    [th('Quantity'), th('Variance'), th('Slope, theory', 'is-number'), th('Bernoulli slope', 'is-number'), th('Bernoulli constant', 'is-number'), th('Rademacher slope', 'is-number'), th('Rademacher constant', 'is-number')],
    rows,
  );
}

/** Table 3: P(|Sₙ/n − μ| ≥ ε) at selected n: simulated with its Wilson interval, exact, and the two bounds. */
export function renderLlnTable(lln, { n: selected }) {
  const rows = [];
  for (const model of ['bernoulli', 'rademacher']) {
    for (const block of lln[model]) {
      const pts = block.points.filter((pt) => selected.includes(pt.n));
      pts.forEach((pt, i) => {
        const head = i === 0 ? `<th scope="rowgroup" rowspan="${pts.length}">${MODEL_LABEL[model]}, ε = ${block.eps}</th>` : '';
        rows.push(
          `<tr>${head}<th scope="row" class="is-number">${int(pt.n)}</th>` +
            td(`${sig(pt.empirical, 3)}${sub(`${sig(pt.low, 2)}–${sig(pt.high, 2)}`)}`) +
            td(sciHtml(pt.exact, 3)) +
            td(sciHtml(pt.chebyshev, 3)) +
            td(sciHtml(pt.hoeffding, 3)) +
            `</tr>`,
        );
      });
    }
  }
  return table(
    'data-table--lln',
    [th('Model and ε'), th('n', 'is-number'), th('Simulated, 95% interval', 'is-number'), th('Exact', 'is-number'), th('Chebyshev', 'is-number'), th('Hoeffding', 'is-number')],
    rows,
  );
}

/** Table 4: Kolmogorov distances to N(0, 1) at selected n. */
export function renderKolmogorovTable(clt, { n: selected, p, pSmall }) {
  const pick = (rows, n) => rows.find((r) => r.n === n);
  const rows = selected.map((n) => {
    const r = pick(clt.rademacher.points, n);
    const b = pick(clt.bernoulli.points, n);
    const s = pick(clt.bernoulliSmall.dense, n);
    return (
      `<tr><th scope="row" class="is-number">${int(n)}</th>` +
      td(sig(r.exact, 3)) +
      td(sig(r.empirical, 3)) +
      td(sig(r.berryEsseen, 3)) +
      td(fmt(Math.sqrt(n) * r.exact, 3)) +
      td(sig(b.exact, 3)) +
      td(sig(b.empirical, 3)) +
      td(s ? sig(s.exact, 3) : DASH) +
      td(sig(b.raw, 3)) +
      `</tr>`
    );
  });
  return table(
    'data-table--ks',
    [
      th('n', 'is-number'),
      th('Rademacher, exact', 'is-number'),
      th('Rademacher, simulated', 'is-number'),
      th('Berry–Esseen', 'is-number'),
      th('√n × exact', 'is-number'),
      th(`Bernoulli ${p}, exact`, 'is-number'),
      th(`Bernoulli ${p}, simulated`, 'is-number'),
      th(`Bernoulli ${pSmall}, exact`, 'is-number'),
      th(`Sₙ/√n, Bernoulli ${p}`, 'is-number'),
    ],
    rows,
  );
}

/** Table 5: precision of the empirical mean and distribution function against the group size m. */
export function renderPrecisionTable(precision) {
  const { bernoulli: b, rademacher: r } = precision.models;
  const rows = b.map((rb, i) => {
    const rr = r[i];
    return (
      `<tr><th scope="row" class="is-number">${int(rb.size)}</th>${td(int(rb.groups))}` +
      td(`${sig(rb.rms, 3)}${sub(`SE ${sig(rb.se, 3)}`)}`) +
      td(`${sig(rr.rms, 3)}${sub(`SE ${sig(rr.se, 3)}`)}`) +
      td(sig(rb.medianD, 3)) +
      td(sig(rr.medianD, 3)) +
      td(sig(rb.dkw, 3)) +
      td(`${fmt(100 * rb.shareAbove, 1)}% / ${fmt(100 * rr.shareAbove, 1)}%`) +
      `</tr>`
    );
  });
  return table(
    'data-table--precision',
    [
      th('Group size m', 'is-number'),
      th('Groups', 'is-number'),
      th('RMS error of Sₙ/n, Bernoulli', 'is-number'),
      th('RMS error of Sₙ/n, Rademacher', 'is-number'),
      th('Median sup |F̂ − F|, Bernoulli', 'is-number'),
      th('Median sup |F̂ − F|, Rademacher', 'is-number'),
      th('DKW 95% radius', 'is-number'),
      th('Groups beyond the radius', 'is-number'),
    ],
    rows,
  );
}

/** Table 6: the aggregate score of a group of m attackers over n systems, at a fixed budget m·n. */
export function renderAggregateTable(aggregate) {
  const { bernoulli: b, rademacher: r } = aggregate.models;
  const rows = b.map((rb, i) => {
    const rr = r[i];
    return (
      `<tr><th scope="row" class="is-number">${int(rb.size)}</th>${td(int(rb.n))}${td(int(rb.groups))}` +
      td(`${dec(rb.mean, 1)}${sub(`theory ${int(rb.theoryMean)}`)}`) +
      td(`${int(rb.variance)}${sub(`theory ${int(rb.theoryVariance)}`)}`) +
      td(`${dec(rr.mean, 1)}${sub(`theory ${int(rr.theoryMean)}`)}`) +
      td(`${int(rr.variance)}${sub(`theory ${int(rr.theoryVariance)}`)}`) +
      `</tr>`
    );
  });
  return table(
    'data-table--aggregate',
    [
      th('Attackers m', 'is-number'),
      th('Systems n', 'is-number'),
      th('Groups', 'is-number'),
      th('Mean of T, Bernoulli', 'is-number'),
      th('Var(T), Bernoulli', 'is-number'),
      th('Mean of T, Rademacher', 'is-number'),
      th('Var(T), Rademacher', 'is-number'),
    ],
    rows,
  );
}

/** Table 7: the number of attackers it takes for an even chance that one of them penetrates a share μ + δ. */
export function renderBestTable(best, { m }) {
  const rows = best.rows.map(
    (r) =>
      `<tr><th scope="row" class="is-number">${int(r.n)}</th>${td(int(r.threshold))}${td(sciHtml(r.p1, 3))}${td(fmt(r.rate, 4))}${td(countHtml(r.m50))}${td(sciHtml(r.pAtM, 3))}</tr>`,
  );
  return table(
    'data-table--best',
    [th('Systems n', 'is-number'), th('Threshold', 'is-number'), th('One attacker', 'is-number'), th('−ln P / n', 'is-number'), th('m for 1/2', 'is-number'), th(`m = ${int(m)}`, 'is-number')],
    rows,
  );
}

/** Table A1: the parameters of the study. */
export function renderParametersTable(entries) {
  const rows = entries.map(([name, value, role]) => `<tr><th scope="row">${escapeXml(name)}</th>${td(escapeXml(value))}<td>${escapeXml(role)}</td></tr>`);
  return table('data-table--parameters', [th('Parameter'), th('Value', 'is-number'), th('Role')], rows);
}

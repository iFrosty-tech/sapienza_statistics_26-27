/**
 * The drawings of homework 5, shared by the figures of the page (built in Node) and the live panels (in the
 * browser): the two ways of cutting up the area under a function, and the trapezoids under the normal density.
 * Pure functions that return SVG; the colours come from the CSS classes of src/styles/hw07-figures.css.
 *
 *   partitionSvg   a Riemann sum (rectangles over a partition of the domain) or a Lebesgue sum (the
 *                  simple function that rounds f down to a grid of levels, over the preimages of the levels)
 *   densitySvg     the standard normal density, the area Φ(x) below x, and the trapezoids of a numerical integral
 */

import { lebesgueSlabs, riemannRectangles } from '../lib/integration.js';
import { phi } from '../lib/normal-cdf.js';

const round = (v) => Math.round(v * 10) / 10;
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The highest value of f drawn: the supremum, or a fixed height for the function with none. */
export const DRAWN_TOP = 5;

const MARGIN = { top: 10, right: 12, bottom: 26, left: 34 };

function frameOf(width, height) {
  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const top = MARGIN.top;
  const bottom = height - MARGIN.bottom;
  return { left, right, top, bottom };
}

function yTicksOf(top) {
  const raw = top / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = (raw / power < 1.5 ? 1 : raw / power < 3.5 ? 2 : raw / power < 7.5 ? 5 : 10) * power;
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(+v.toFixed(8));
  return out;
}

const yText = (v) => String(+v.toFixed(3)).replace('-', '−');

/** Tick labels of the x axis: the ends, and the middle. */
function xTicksOf(fn) {
  if (Math.abs(fn.b - Math.PI) < 1e-12) return [[0, '0'], [Math.PI / 2, 'π/2'], [Math.PI, 'π']];
  return [[0, '0'], [0.5, '½'], [1, '1']];
}

/**
 * One drawing of a sum.
 * @param {object} fn a function of src/lib/integration.js
 * @param {{ kind: 'riemann'|'lebesgue', count: number, rule?: 'left'|'mid'|'right', id: string, title: string, desc: string,
 *   width?: number, height?: number }} options `count` is the number of subintervals or of levels
 */
export function partitionSvg(fn, { kind, count, rule = 'mid', id, title, desc, width = 360, height = 250 }) {
  const { left, right, top, bottom } = frameOf(width, height);
  const yMax = Number.isFinite(fn.hi) ? fn.hi : DRAWN_TOP;
  const yTop = yMax * 1.1;
  const x = (v) => left + ((v - fn.a) / (fn.b - fn.a)) * (right - left);
  const y = (v) => bottom - (Math.min(v, yTop) / yTop) * (bottom - top);

  const out = [
    `<svg class="int-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
  ];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const v of yTicksOf(yTop)) out.push(`<line class="chart__ruling" x1="${left}" x2="${right}" y1="${round(y(v))}" y2="${round(y(v))}"/>`);
  out.push(`<rect class="chart__frame" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></g>`);

  // The sum itself, under the curve.
  out.push('<g aria-hidden="true">');
  if (kind === 'riemann') {
    for (const r of riemannRectangles(fn, count, rule)) {
      const infinite = !Number.isFinite(r.y);
      const h = infinite ? yTop : r.y;
      const cls = infinite ? 'int-rect int-rect--infinite' : 'int-rect';
      out.push(`<rect class="${cls}" x="${round(x(r.x0))}" y="${round(y(h))}" width="${round(Math.max(0.5, x(r.x1) - x(r.x0)))}" height="${round(Math.max(0, bottom - y(h)))}"/>`);
    }
  } else {
    const slabs = lebesgueSlabs(fn, count);
    for (const s of slabs) {
      for (const [x0, x1] of s.intervals) {
        if (x1 - x0 <= 0) continue;
        out.push(`<rect class="int-slab" x="${round(x(x0))}" y="${round(y(s.level))}" width="${round(Math.max(0.5, x(x1) - x(x0)))}" height="${round(Math.max(0, bottom - y(s.level)))}"/>`);
      }
    }
    // The levels, drawn across the plot, with the topmost last.
    for (const s of slabs) {
      if (s.level > 0) out.push(`<line class="int-level" x1="${left}" x2="${right}" y1="${round(y(s.level))}" y2="${round(y(s.level))}"/>`);
    }
  }
  out.push('</g>');

  // The curve, broken where the function jumps.
  const samples = 360;
  const runs = [[]];
  let previous = null;
  for (let i = 0; i <= samples; i += 1) {
    const xv = fn.a + ((fn.b - fn.a) * i) / samples;
    const v = i === 0 && fn.unbounded ? fn.f(fn.a + (fn.b - fn.a) / (4 * samples)) : fn.f(xv);
    if (previous !== null && Math.abs(v - previous) > 0.4 * (yMax - fn.lo)) runs.push([]);
    previous = v;
    runs.at(-1).push([x(xv), y(v)]);
  }
  out.push('<g aria-hidden="true">');
  for (const run of runs) {
    if (run.length < 2) continue;
    out.push(`<path class="int-curve" d="${run.map(([px, py], i) => `${i ? 'L' : 'M'}${round(px)},${round(py)}`).join('')}"/>`);
  }
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const v of yTicksOf(yTop)) out.push(`<text class="chart__ylabel" x="${left - 6}" y="${round(y(v))}" text-anchor="end" dominant-baseline="middle">${yText(v)}</text>`);
  for (const [v, label] of xTicksOf(fn)) out.push(`<text class="chart__xlabel" x="${round(x(v === 0 ? fn.a : fn.a + v))}" y="${bottom + 16}" text-anchor="middle">${label}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

/**
 * The standard normal density on [−4, 4] with the area Φ(x) shaded exactly, and n trapezoids on [0, x].
 * @param {{ x: number, n: number, id: string, title: string, desc: string, width?: number, height?: number }} options
 */
export function densitySvg({ x: upper, n, id, title, desc, width = 420, height = 250 }) {
  const { left, right, top, bottom } = frameOf(width, height);
  const lo = -4;
  const hi = 4;
  const yTop = 0.44;
  const px = (v) => left + ((v - lo) / (hi - lo)) * (right - left);
  const py = (v) => bottom - (v / yTop) * (bottom - top);
  const clamp = (v) => Math.max(lo, Math.min(hi, v));
  const u = clamp(upper);

  const out = [
    `<svg class="int-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
  ];
  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const v of [0.1, 0.2, 0.3, 0.4]) out.push(`<line class="chart__ruling" x1="${left}" x2="${right}" y1="${round(py(v))}" y2="${round(py(v))}"/>`);
  out.push(`<rect class="chart__frame" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/></g>`);

  const curve = (from, to, steps = 120) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [px(t), py(phi(t))];
  });
  const path = (points) => points.map(([cx, cy], i) => `${i ? 'L' : 'M'}${round(cx)},${round(cy)}`).join('');

  // The exact area Φ(x), to the left of x.
  out.push('<g aria-hidden="true">');
  out.push(`<path class="int-area" d="${path(curve(lo, u))}L${round(px(u))},${round(bottom)}L${round(px(lo))},${round(bottom)}Z"/>`);
  // The trapezoids of the numerical integral from 0 to x.
  if (n > 0 && u !== 0) {
    const h = u / n;
    for (let k = 0; k < n; k += 1) {
      const x0 = k * h;
      const x1 = (k + 1) * h;
      out.push(`<path class="int-trapezoid" d="M${round(px(x0))},${round(bottom)}L${round(px(x0))},${round(py(phi(x0)))}L${round(px(x1))},${round(py(phi(x1)))}L${round(px(x1))},${round(bottom)}Z"/>`);
    }
  }
  out.push(`<line class="int-level" x1="${round(px(u))}" x2="${round(px(u))}" y1="${top}" y2="${bottom}"/>`);
  out.push(`<path class="int-curve" d="${path(curve(lo, hi))}"/>`);
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const v of [0, 0.1, 0.2, 0.3, 0.4]) out.push(`<text class="chart__ylabel" x="${left - 6}" y="${round(py(v))}" text-anchor="end" dominant-baseline="middle">${v === 0 ? '0' : v.toFixed(1)}</text>`);
  for (const v of [-4, -2, 0, 2, 4]) out.push(`<text class="chart__xlabel" x="${round(px(v))}" y="${bottom + 16}" text-anchor="middle">${v < 0 ? `−${-v}` : v}</text>`);
  out.push('</g></svg>');
  return out.join('');
}

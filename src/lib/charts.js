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
      `<text class="chart__axis-title" transform="translate(14 ${round(g.top + g.plotH / 2)}) rotate(-90)" text-anchor="middle">${richText(yLabel)}</text>`,
    );
  }
  if (xLabel) {
    parts.push(
      `<text class="chart__axis-title" x="${round(g.left + g.plotW / 2)}" y="${round(g.bottom + 40)}" text-anchor="middle">${richText(xLabel)}</text>`,
    );
  }
  return parts.join('');
}

/** "2^k" or "10^k" with a superscript. */
function powerLabel(base, k) {
  return `${base}<tspan class="chart__sup" dy="-0.5em" font-size="75%">${k}</tspan>`;
}

/* ------------------------------------------------------------ label text */

/* How far an exponent rises above the baseline of an 11px label, in CSS pixels. */
const SUP_RISE = 4;

/**
 * The SVG content of a label, escaped, in which "^{…}" marks an exponent:
 * "2^{255}" prints 255 as a superscript, so that no caret is ever printed.
 * The exponent is a smaller tspan raised by a fixed dy and the text after it
 * is lowered back by the same amount (baseline-shift would be simpler, but
 * Firefox ignores it).
 * @param {string} label
 */
export function richText(label) {
  const parts = String(label).split(/\^\{([^}]*)\}/);
  let out = '';
  let raised = false;
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      out += `<tspan class="chart__sup" dy="${-SUP_RISE}" font-size="75%">${escapeXml(part)}</tspan>`;
      raised = true;
    } else if (part) {
      out += raised ? `<tspan dy="${SUP_RISE}">${escapeXml(part)}</tspan>` : escapeXml(part);
      raised = false;
    }
  });
  return out;
}

/* Average advance of a character of an 11px Libre Franklin label (weights 500–600), a little generous. */
const CHAR_WIDTH = 6.3;

/** Estimated width in CSS pixels of an 11px chart label written for richText. */
export function textWidth(label) {
  return String(label)
    .split(/\^\{([^}]*)\}/)
    .reduce((w, part, i) => w + [...part].reduce((s, c) => s + (c === ' ' ? 0.55 : 1), 0) * CHAR_WIDTH * (i % 2 === 1 ? 0.75 : 1), 0);
}

/**
 * The box of a label drawn at (x, y) (its baseline) with a text-anchor:
 * { x0, x1, y0, y1 } in CSS pixels, taller when the label has an exponent.
 */
export function labelBox({ x, y, anchor }, label) {
  const w = textWidth(label);
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x0, x1: x0 + w, y0: y - (/\^\{/.test(label) ? 9 + SUP_RISE : 9), y1: y + 3 };
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const grow = (b, d) => ({ x0: b.x0 - d, x1: b.x1 + d, y0: b.y0 - d, y1: b.y1 + d });

/* Whether the segment from (x1, y1) to (x2, y2) crosses the box (Liang–Barsky clipping). */
function segmentHitsBox([x1, y1, x2, y2], b) {
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
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/* Candidate positions of a label around an anchor point at distance d: baseline and text-anchor. */
const DIRECTIONS = {
  e: (ax, ay, d) => ({ x: ax + d, y: ay + 4, anchor: 'start' }),
  w: (ax, ay, d) => ({ x: ax - d, y: ay + 4, anchor: 'end' }),
  n: (ax, ay, d) => ({ x: ax, y: ay - d, anchor: 'middle' }),
  s: (ax, ay, d) => ({ x: ax, y: ay + d + 6, anchor: 'middle' }),
  ne: (ax, ay, d) => ({ x: ax + 0.7 * d, y: ay - 0.7 * d, anchor: 'start' }),
  nw: (ax, ay, d) => ({ x: ax - 0.7 * d, y: ay - 0.7 * d, anchor: 'end' }),
  se: (ax, ay, d) => ({ x: ax + 0.7 * d, y: ay + 0.7 * d + 6, anchor: 'start' }),
  sw: (ax, ay, d) => ({ x: ax - 0.7 * d, y: ay + 0.7 * d + 6, anchor: 'end' }),
};
const ALL_DIRECTIONS = Object.keys(DIRECTIONS);
/* Preferred directions, tried first at every distance, then the others: options for board.place. */
const prefer = (first) => ({ directions: [...first, ...ALL_DIRECTIONS.filter((d) => !first.includes(d))], preferred: first.length });

/**
 * A board on which labels are placed without collisions: marks, lines and
 * labels already drawn are obstacles, and each new label takes the first
 * candidate position, nearest distance first and then in the given order of
 * directions and anchors, whose box lies inside `bounds` (the plot area) and
 * touches no obstacle. If every candidate collides, it takes the one inside
 * the bounds with the fewest collisions, so a label never leaves the plot.
 * @param {{ x0: number, x1: number, y0: number, y1: number }} bounds
 */
export function labelBoard(bounds) {
  const boxes = [];
  const segments = [];
  const inside = (b) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1;
  const collisions = (b) => {
    const padded = grow(b, 1.5);
    return boxes.filter((o) => overlaps(o, padded)).length + segments.filter((s) => segmentHitsBox(s, padded)).length;
  };
  return {
    circle(cx, cy, r) {
      boxes.push({ x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r });
    },
    box(b) {
      boxes.push(b);
    },
    segment(x1, y1, x2, y2) {
      segments.push([x1, y1, x2, y2]);
    },
    /** Polyline through the given points ([x, y] pairs), as segments. */
    polyline(points) {
      for (let i = 1; i < points.length; i += 1) segments.push([...points[i - 1], ...points[i]]);
    },
    /**
     * The first `preferred` directions are tried at every distance before the others, so that a
     * label keeps to its preferred side when there is room there at any distance.
     * @param {string} label
     * @param {{ anchors: [number, number][], directions: string[], preferred?: number, distances?: number[] }} options
     * @returns {{ x: number, y: number, anchor: 'start'|'middle'|'end' }}
     */
    place(label, { anchors, directions, preferred = 0, distances = [6, 9, 13, 18, 26, 36] }) {
      let best = null;
      const tiers = preferred > 0 ? [directions.slice(0, preferred), directions.slice(preferred)] : [directions];
      for (const tier of tiers) {
        for (const d of distances) {
          for (const dir of tier) {
            for (const [ax, ay] of anchors) {
              const at = DIRECTIONS[dir](ax, ay, d);
              const b = labelBox(at, label);
              if (!inside(b)) continue;
              const hits = collisions(b);
              if (hits === 0) {
                boxes.push(b);
                return at;
              }
              if (!best || hits < best.hits) best = { at, b, hits };
            }
          }
        }
      }
      if (!best) {
        // Nothing fits inside: clamp the first candidate into the bounds.
        const [ax, ay] = anchors[0];
        const at = DIRECTIONS[directions[0]](ax, ay, distances[0]);
        const b = labelBox(at, label);
        const shiftX = Math.max(0, bounds.x0 - b.x0) - Math.max(0, b.x1 - bounds.x1);
        const shiftY = Math.max(0, bounds.y0 - b.y0) - Math.max(0, b.y1 - bounds.y1);
        best = { at: { ...at, x: at.x + shiftX, y: at.y + shiftY }, b: { x0: b.x0 + shiftX, x1: b.x1 + shiftX, y0: b.y0 + shiftY, y1: b.y1 + shiftY } };
      }
      boxes.push(best.b);
      return best.at;
    },
  };
}

/* The anchors of a series label: its points from the given fraction of the series outward. */
function seriesAnchors(points, from = 0.5) {
  const order = [];
  const start = Math.round((points.length - 1) * from);
  for (let k = 0; order.length < points.length; k += 1) {
    if (start + k < points.length) order.push(points[start + k]);
    if (k > 0 && start - k >= 0) order.push(points[start - k]);
  }
  return order;
}

/* A label drawn at a position chosen by a label board. */
const placedText = (cls, at, label) =>
  `<text class="${cls}" x="${round(at.x)}" y="${round(at.y)}" text-anchor="${at.anchor}">${richText(label)}</text>`;

/* The plot area of a layout, less a small inset, as the bounds of a label board. */
const plotBounds = (g, inset = 2) => ({ x0: g.left + inset, x1: g.right - inset, y0: g.top + inset, y1: g.bottom - inset });

/* ----------------------------------------------------------- histogram */

/**
 * Bars for observed counts with an optional stepped line of expected counts.
 * Bins are labelled at their centres (every `labelEvery`-th), or, when
 * `edgeTicks` is given, at bin boundaries instead: { at, label } puts the
 * label on the left edge of bin `at` (at = bins.length is the right edge).
 * @param {{ id: string, title: string, desc: string, bins: { label: string, observed: number, expected?: number }[],
 *   width?: number, height?: number, xLabel?: string, yLabel?: string, labelEvery?: number, yMax?: number,
 *   edgeTicks?: { at: number, label: string }[] }} options
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
  edgeTicks,
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
  const labelled = edgeTicks
    ? edgeTicks.map((t) => ({ label: escapeXml(t.label), x: x(t.at) }))
    : bins.map((b, i) => ({ label: escapeXml(b.label), x: x(i) + bandW / 2, i })).filter(({ i }) => i % labelEvery === 0);
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

  // Every label is placed inside the plot area, clear of the points, the lines and the other labels.
  const board = labelBoard(plotBounds(g));
  // The panel title (10.5px with 0.04em tracking in the formula figures, about 6.2px a character).
  if (label) board.box({ x0: g.left + 6, x1: g.left + 6 + [...label].length * 6.2, y0: g.top + 4, y1: g.top + 19 });
  const radius = dense ? 3 : 3.75;
  const points = series.map((s) => s.points.map((p) => [x(lx(p.x)), y(lx(p.y))]));
  points.flat().forEach(([cx, cy]) => board.circle(cx, cy, radius));
  const markAt = marks.map((m) => [x(lx(m.x)), y(lx(m.y))]);
  markAt.forEach(([mx, my]) => board.circle(mx, my, 5));
  // The reference line log2 y = f + exponent · log2 x is cut to the panel so that a steep
  // law (n/2 in the measured panel) does not run past the frame into the caption.
  const segments = references.map((ref) => {
    const segment = clipLineToRange(ref.exponent, Math.log2(ref.factor ?? 1), xRange, yRange);
    if (!segment) return null;
    const [xa, ya, xb, yb] = segment;
    const s = [x(xa), y(ya), x(xb), y(yb)];
    board.segment(...s);
    return s;
  });

  const labels = [];
  // Marks first (their labels belong next to them), with `dy` (CSS pixels) as a hint for a lower or higher label.
  marks.forEach((m, i) => {
    const [mx, my] = markAt[i];
    const at = board.place(m.label, { anchors: [[mx, my + (m.dy ?? 0)]], ...prefer(m.prefer ?? ['w', 'nw', 'sw']) });
    labels.push(placedText('chart__annotation', at, m.label));
  });
  // Series labels: the highest series above-left of its points, the others below-right.
  if (showSeriesLabels) {
    const meanY = points.map((list) => list.reduce((s, [, py]) => s + py, 0) / Math.max(1, list.length));
    const top = meanY.indexOf(Math.min(...meanY));
    series.forEach((s, i) => {
      if (!points[i].length) return;
      const directions = i === top ? ['nw', 'n', 'w', 'ne', 'se', 's', 'e', 'sw'] : ['se', 's', 'e', 'sw', 'nw', 'n', 'w', 'ne'];
      const at = board.place(s.label, { anchors: seriesAnchors(points[i]), directions });
      labels.push(placedText('chart__series-label', at, s.label));
    });
  }
  // Reference labels last: they may sit anywhere along their line, preferably near its upper end.
  references.forEach((ref, i) => {
    const s = segments[i];
    if (!s) return;
    const anchors = [0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.32].map((t) => [s[0] + t * (s[2] - s[0]), s[1] + t * (s[3] - s[1])]);
    const at = board.place(ref.label, { anchors, directions: ['nw', 'se', 'w', 'e', 'n', 's'] });
    labels.push(placedText('chart__annotation', at, ref.label));
  });

  out.push('<g class="chart__references" aria-hidden="true">');
  for (const s of segments) {
    if (s) out.push(`<line class="chart__reference" x1="${round(s[0])}" y1="${round(s[1])}" x2="${round(s[2])}" y2="${round(s[3])}"/>`);
  }
  out.push('</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  series.forEach((s, i) => {
    for (const [cx, cy] of points[i]) out.push(`<circle class="chart__point chart__point--${s.key}" cx="${round(cx)}" cy="${round(cy)}" r="${radius}"/>`);
  });
  for (const [mx, my] of markAt) out.push(`<circle class="chart__mark" cx="${round(mx)}" cy="${round(my)}" r="5"/>`);
  out.push(...labels);
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
 *   marks?: { x: number, y: number, label: string, dy?: number, prefer?: string[] }[] }} options
 *   Labels are placed by a label board inside each plot area; '^{…}' in a label marks an exponent.
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
  const fullY = [0, Math.ceil(Math.max(...allY, ...marks.map((m) => Math.log2(m.y))) / 16) * 16 + 24];

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

/**
 * All affine points of y² = x³ + 7 over F_p, as a square scatter (the SVG is
 * cut to the square). `radius` overrides the point radius, which otherwise
 * scales with the plot (small for dense clouds); `margin` overrides the
 * default margins (tighter for small multiples).
 */
export function renderCurveScatter({ id, title, desc, p, points, width = 960, height, radius, margin = {} }) {
  const h = height ?? Math.min(width, 640);
  const g0 = layout({ width, height: h, margin: { right: 28, ...margin } });
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
  const r = radius ?? Math.max(1.6, side / 230);
  out.push('<g class="chart__data" aria-hidden="true">');
  for (const pt of points) out.push(`<circle class="chart__point" cx="${round(x(pt.x))}" cy="${round(y(pt.y))}" r="${round(r)}"/>`);
  out.push('</g>');
  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, ticks.map((value) => ({ label: String(value), y: y(value) }))));
  out.push(xLabels(g, ticks.map((value) => ({ label: String(value), x: x(value) }))));
  out.push(axisTitles(g, 'x', 'y'), '</g></svg>');
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

/* --------------------------------------------------------- band chart */

/** Decade exponents k with 10^k inside [min, max] on a logarithmic axis. */
function decadeTicks(min, max) {
  const values = [];
  for (let k = Math.ceil(Math.log10(min) - 1e-9); k <= Math.floor(Math.log10(max) + 1e-9); k += 1) values.push(k);
  return values;
}

/**
 * A statistic followed across ordered checkpoints: the mean as a line with a
 * point at every checkpoint, the interquartile range as a band, optional
 * horizontal references and brackets that group the checkpoints (for
 * instance the step mappings of one round).
 * @param {{ id: string, title: string, desc: string,
 *   points: { label: string, tick?: string, mean: number, q1: number, q3: number }[],
 *   references?: { value: number, label: string }[], groups?: { from: number, to: number, label: string }[],
 *   yLog?: boolean, yDomain?: [number, number], width?: number, height?: number, xLabel?: string, yLabel?: string }} options
 */
export function renderBandChart({
  id,
  title,
  desc,
  points,
  references = [],
  groups = [],
  yLog = false,
  yDomain,
  width = 960,
  height = 420,
  xLabel = '',
  yLabel = '',
}) {
  const g = layout({ width, height, margin: { bottom: groups.length ? 72 : 50 } });
  const values = points.flatMap((p) => [p.q1, p.q3, p.mean]).concat(references.map((r) => r.value));
  const dataMax = Math.max(...values);
  const domain = yDomain ?? (yLog ? [1, 10 ** Math.ceil(Math.log10(dataMax * 1.05))] : [0, dataMax * 1.08]);
  let y;
  let yTicks;
  if (yLog) {
    const toY = linear(Math.log10(domain[0]), Math.log10(domain[1]), g.bottom, g.top);
    y = (v) => toY(Math.log10(Math.max(v, domain[0])));
    yTicks = decadeTicks(domain[0], domain[1]).map((k) => ({ value: 10 ** k, label: k === 0 ? '1' : powerLabel(10, formatNumber(k, 0)) }));
  } else {
    const t = niceTicks(domain[0], domain[1], g.narrow ? 4 : 5);
    y = linear(domain[0], t.values.at(-1), g.bottom, g.top);
    yTicks = t.values.map((value) => ({ value, label: formatNumber(value, t.decimals) }));
  }
  const step = g.plotW / points.length;
  const x = (i) => g.left + (i + 0.5) * step;
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--band' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, yTicks.map((t) => ({ value: t.value, y: y(t.value) })), { major: () => false }));
  for (const grp of groups.slice(1)) {
    const gx = g.left + grp.from * step;
    out.push(`<line class="chart__ruling chart__ruling--v is-major" x1="${round(gx)}" x2="${round(gx)}" y1="${g.top}" y2="${round(g.bottom)}"/>`);
  }
  out.push(frame(g), '</g>');

  const upper = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))},${round(y(p.q3))}`).join('');
  const lower = points
    .map((p, i) => [i, p])
    .reverse()
    .map(([i, p]) => `L${round(x(i))},${round(y(p.q1))}`)
    .join('');
  out.push(`<path class="chart__band-area" d="${upper}${lower}Z" aria-hidden="true"/>`);

  out.push('<g class="chart__references" aria-hidden="true">');
  for (const ref of references) {
    out.push(
      `<line class="chart__reference" x1="${g.left}" x2="${round(g.right)}" y1="${round(y(ref.value))}" y2="${round(y(ref.value))}"/>`,
      `<text class="chart__annotation" x="${round(g.left + 6)}" y="${round(y(ref.value) - 5)}">${escapeXml(ref.label)}</text>`,
    );
  }
  out.push('</g>');

  const trace = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))},${round(y(p.mean))}`).join('');
  out.push(`<path class="chart__trace" d="${trace}" aria-hidden="true"/>`);
  out.push('<g class="chart__data" aria-hidden="true">');
  points.forEach((p, i) => out.push(`<circle class="chart__point" cx="${round(x(i))}" cy="${round(y(p.mean))}" r="${g.narrow ? 2.4 : 3.2}"/>`));
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, yTicks.map((t) => ({ label: t.label, y: y(t.value) }))));
  out.push(
    xLabels(
      g,
      points.map((p, i) => ({ label: escapeXml(p.tick ?? p.label), x: x(i) })).filter((t) => t.label !== ''),
    ),
  );
  for (const grp of groups) {
    const x0 = g.left + grp.from * step + 2;
    const x1 = g.left + (grp.to + 1) * step - 2;
    const by = g.bottom + 27;
    out.push(
      `<path class="chart__group" d="M${round(x0)},${round(by - 4)}V${round(by)}H${round(x1)}V${round(by - 4)}"/>`,
      `<text class="chart__group-label" x="${round((x0 + x1) / 2)}" y="${round(by + 13)}" text-anchor="middle">${escapeXml(grp.label)}</text>`,
    );
  }
  out.push(axisTitles({ ...g, bottom: g.bottom + (groups.length ? 22 : 0) }, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------- interval dot plot */

/**
 * One row per quantity on a logarithmic probability axis: the exact value as
 * an ink tick, the Monte Carlo estimate as a point and its confidence
 * interval as a line. Row labels are printed above their row, so the chart
 * keeps its full width on a phone.
 * @param {{ id: string, title: string, desc: string,
 *   rows: { label: string, expected: number, estimate: number, low: number, high: number }[],
 *   xDomain?: [number, number], width?: number, rowHeight?: number, xLabel?: string }} options
 */
export function renderIntervalDots({ id, title, desc, rows, xDomain, width = 960, rowHeight = 52, xLabel = '' }) {
  const height = 16 + rows.length * rowHeight + 50;
  const g = layout({ width, height, margin: { left: width < 520 ? 14 : 20, right: width < 520 ? 18 : 28 } });
  const positive = rows.flatMap((r) => [r.expected, r.estimate, r.low, r.high]).filter((v) => v > 0);
  const domain = xDomain ?? [
    10 ** Math.floor(Math.log10(Math.min(...positive))),
    10 ** Math.ceil(Math.log10(Math.max(...positive))),
  ];
  const toX = linear(Math.log10(domain[0]), Math.log10(domain[1]), g.left, g.right);
  const x = (v) => toX(Math.log10(Math.min(domain[1], Math.max(v, domain[0]))));
  const ticks = decadeTicks(domain[0], domain[1]);
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--intervals' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(vRulings(g, ticks.map((k) => ({ value: k, x: toX(k) })), { major: () => false }));
  out.push(frame(g), '</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  rows.forEach((r, i) => {
    const top = g.top + i * rowHeight;
    const cy = top + rowHeight * 0.66;
    if (i > 0) out.push(`<line class="chart__row-rule" x1="${g.left}" x2="${round(g.right)}" y1="${round(top)}" y2="${round(top)}"/>`);
    out.push(
      `<text class="chart__row-label" x="${round(g.left + 6)}" y="${round(top + 15)}">${escapeXml(r.label)}</text>`,
      `<line class="chart__interval" x1="${round(x(r.low))}" x2="${round(x(r.high))}" y1="${round(cy)}" y2="${round(cy)}"/>`,
      `<line class="chart__expected-mark" x1="${round(x(r.expected))}" x2="${round(x(r.expected))}" y1="${round(cy - 8)}" y2="${round(cy + 8)}"/>`,
      `<circle class="chart__point" cx="${round(x(r.estimate))}" cy="${round(cy)}" r="${g.narrow ? 3.2 : 4}"/>`,
    );
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(xLabels(g, ticks.map((k) => ({ label: k === 0 ? '1' : powerLabel(10, formatNumber(k, 0)), x: toX(k) }))));
  out.push(axisTitles(g, xLabel, ''), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------ capacity bars */

/**
 * Horizontal bars of a capacity with a filled part, one row per item, the
 * label printed above its bar: for instance the size of a representation
 * against the entropy it can carry.
 * @param {{ id: string, title: string, desc: string, rows: { label: string, total: number, part: number }[],
 *   max?: number, width?: number, rowHeight?: number, xLabel?: string, totalLabel?: string, partLabel?: string }} options
 */
export function renderCapacityBars({
  id,
  title,
  desc,
  rows,
  max,
  width = 960,
  rowHeight = 46,
  xLabel = 'Bits',
  totalLabel = 'Total',
  partLabel = 'Part',
}) {
  const legendH = 26;
  const height = legendH + 16 + rows.length * rowHeight + 46;
  const narrow = width < 520;
  const g = layout({ width, height, margin: { top: 16 + legendH, left: narrow ? 14 : 20, right: narrow ? 18 : 28 } });
  const top = max ?? Math.max(...rows.map((r) => r.total));
  const ticks = niceTicks(0, top, narrow ? 4 : 8);
  // The axis ends on a tick at or beyond the longest bar, so no bar leaves the frame.
  if (ticks.values.at(-1) < top) ticks.values.push(+(ticks.values.at(-1) + ticks.step).toFixed(10));
  const end = ticks.values.at(-1);
  const x = linear(0, end, g.left, g.right);
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--capacity' })];

  const lx = g.left + 40 + totalLabel.length * 6.4;
  out.push(
    '<g class="chart__legend" aria-hidden="true">',
    `<rect class="chart__capacity chart__swatch" x="${g.left}" y="10" width="22" height="10"/>`,
    `<text class="chart__legend-label" x="${g.left + 28}" y="19">${escapeXml(totalLabel)}</text>`,
    `<rect class="chart__bar chart__swatch" x="${round(lx)}" y="10" width="22" height="10"/>`,
    `<text class="chart__legend-label" x="${round(lx + 28)}" y="19">${escapeXml(partLabel)}</text>`,
    '</g>',
  );

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(vRulings(g, ticks.values.filter((v) => v > 0 && v < end).map((value) => ({ value, x: x(value) })), { major: () => false }));
  out.push(frame(g), '</g>');

  out.push('<g class="chart__data" aria-hidden="true">');
  rows.forEach((r, i) => {
    const top = g.top + i * rowHeight;
    const barY = top + 21;
    const barH = Math.min(14, rowHeight - 26);
    out.push(
      `<text class="chart__row-label" x="${round(g.left + 6)}" y="${round(top + 15)}">${escapeXml(r.label)}</text>`,
      `<text class="chart__row-value" x="${round(g.right - 6)}" y="${round(top + 15)}" text-anchor="end">${escapeXml(`${r.part} of ${r.total}`)}</text>`,
      `<rect class="chart__capacity" x="${g.left}" y="${round(barY)}" width="${round(x(r.total) - g.left)}" height="${barH}"/>`,
      `<rect class="chart__bar" x="${g.left}" y="${round(barY)}" width="${round(x(r.part) - g.left)}" height="${barH}"/>`,
    );
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(xLabels(g, ticks.values.map((value) => ({ label: formatNumber(value, ticks.decimals), x: x(value) }))));
  out.push(axisTitles(g, xLabel, ''), '</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------------- scatter */

/** Tick values of niceTicks restricted to [min, max]. */
function ticksWithin(min, max, target) {
  const t = niceTicks(min, max, target);
  return { ...t, values: t.values.filter((v) => v >= min - 1e-9 && v <= max + 1e-9) };
}

/**
 * A scatter plot on linear axes. Each series is a list of points { x, y };
 * a missing value (y null, undefined or not finite) draws no point and breaks
 * the connecting line. Points are plot red, or open ink rings with
 * mark: 'ring'; connect: true joins consecutive points with an ink line.
 * Points of one series that land on the same position (to 0.1 px) are drawn
 * once, so a dense cloud does not repeat identical marks.
 * Options: identity draws the dashed line y = x; vMarks draws dashed vertical
 * rulings labelled above the frame (for instance the multiples of an order);
 * legend prints the labelled series above the frame; square makes the plot
 * area square (the SVG is cut to it).
 * @param {{ id: string, title: string, desc: string,
 *   series: { key: string, label?: string, points: { x: number, y: number|null }[], connect?: boolean, mark?: 'point'|'ring' }[],
 *   xDomain?: [number, number], yDomain?: [number, number], identity?: boolean, vMarks?: { x: number, label: string }[],
 *   legend?: boolean, square?: boolean, width?: number, height?: number, xLabel?: string, yLabel?: string, radius?: number }} options
 */
export function renderScatter({
  id,
  title,
  desc,
  series,
  xDomain,
  yDomain,
  identity = false,
  vMarks = [],
  legend = false,
  square = false,
  width = 960,
  height,
  xLabel = '',
  yLabel = '',
  radius,
}) {
  const h = height ?? Math.round(width * 0.6);
  const top = legend || vMarks.length ? 34 : 16;
  let g = layout({ width, height: h, margin: { top } });
  if (square) {
    const side = Math.min(g.plotW, g.plotH);
    g = { ...g, plotW: side, plotH: side, right: g.left + side, bottom: g.top + side };
  }
  const svgW = square ? Math.round(g.right + g.margin.right) : width;
  const svgH = square ? Math.round(g.bottom + g.margin.bottom) : h;
  const finite = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const xd = xDomain ?? [Math.min(...finite.map((p) => p.x)), Math.max(...finite.map((p) => p.x))];
  const yd = yDomain ?? [Math.min(...finite.map((p) => p.y)), Math.max(...finite.map((p) => p.y))];
  const x = linear(xd[0], xd[1], g.left, g.right);
  const y = linear(yd[0], yd[1], g.bottom, g.top);
  const xt = ticksWithin(xd[0], xd[1], g.narrow ? 4 : 6);
  const yt = ticksWithin(yd[0], yd[1], g.narrow ? 4 : 5);
  const r = radius ?? (g.narrow ? 2.2 : 2.8);
  const out = [svgOpen({ id, width: svgW, height: svgH, title, desc, className: 'chart--scatter' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, yt.values.filter((v) => v > yd[0] && v < yd[1]).map((value) => ({ value, y: y(value) })), { major: () => false }));
  out.push(vRulings(g, xt.values.filter((v) => v > xd[0] && v < xd[1]).map((value) => ({ value, x: x(value) })), { major: () => false }));
  for (const m of vMarks) {
    out.push(
      `<line class="chart__half" x1="${round(x(m.x))}" x2="${round(x(m.x))}" y1="${g.top}" y2="${round(g.bottom)}"/>`,
      `<text class="chart__annotation" x="${round(x(m.x))}" y="${round(g.top - 5)}" text-anchor="middle">${escapeXml(m.label)}</text>`,
    );
  }
  out.push(frame(g), '</g>');

  if (identity) {
    const a = Math.max(xd[0], yd[0]);
    const b = Math.min(xd[1], yd[1]);
    if (a < b) {
      out.push(`<line class="chart__reference" x1="${round(x(a))}" y1="${round(y(a))}" x2="${round(x(b))}" y2="${round(y(b))}" aria-hidden="true"/>`);
    }
  }

  out.push('<g class="chart__data" aria-hidden="true">');
  for (const s of series) {
    if (s.connect) {
      let d = '';
      let pen = 'M';
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          pen = 'M';
          continue;
        }
        d += `${pen}${round(x(p.x))},${round(y(p.y))}`;
        pen = 'L';
      }
      if (d) out.push(`<path class="chart__trace" d="${d}"/>`);
    }
    const cls = s.mark === 'ring' ? 'chart__point chart__point--ring' : 'chart__point';
    const seen = new Set();
    for (const p of s.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const cx = round(x(p.x));
      const cy = round(y(p.y));
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`);
    }
  }
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  if (legend) {
    let lx = g.left;
    for (const s of series.filter((t) => t.label)) {
      const cls = s.mark === 'ring' ? 'chart__point chart__point--ring' : 'chart__point';
      out.push(
        `<circle class="chart__swatch ${cls}" cx="${round(lx + 5)}" cy="13" r="3.5"/>`,
        `<text class="chart__legend-label" x="${round(lx + 13)}" y="17">${escapeXml(s.label)}</text>`,
      );
      lx += 26 + s.label.length * 6.2;
    }
  }
  out.push(yLabels(g, yt.values.map((value) => ({ label: formatNumber(value, yt.decimals), y: y(value) }))));
  out.push(xLabels(g, xt.values.map((value) => ({ label: formatNumber(value, xt.decimals), x: x(value) }))));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ----------------------------------------------------------- line chart */

const DASHES = ['', '7 4', '2 3', '9 3 2 3'];

/**
 * Lines on linear axes, one per series (missing values break the line), with
 * optional marked points. With yFormat 'pow2' the y values are base-2
 * logarithms and the ticks print as powers of two.
 * @param {{ id: string, title: string, desc: string, series: { key: string, label?: string, points: { x: number, y: number|null }[] }[],
 *   marks?: { x: number, y: number, label: string, dy?: number, anchor?: 'start'|'end', prefer?: string[] }[],
 *   xDomain: [number, number], yDomain: [number, number], yFormat?: 'number'|'pow2',
 *   width?: number, height?: number, xLabel?: string, yLabel?: string }} options
 */
export function renderLineChart({
  id,
  title,
  desc,
  series,
  marks = [],
  xDomain,
  yDomain,
  yFormat = 'number',
  width = 960,
  height = 360,
  xLabel = '',
  yLabel = '',
}) {
  const g = layout({ width, height });
  const x = linear(xDomain[0], xDomain[1], g.left, g.right);
  const y = linear(yDomain[0], yDomain[1], g.bottom, g.top);
  const xt = ticksWithin(xDomain[0], xDomain[1], g.narrow ? 4 : 6);
  const pow2 = yFormat === 'pow2';
  const yValues = pow2 ? log2Ticks(yDomain[0], yDomain[1], g.narrow ? 4 : 5) : ticksWithin(yDomain[0], yDomain[1], 5).values;
  const yDecimals = pow2 ? 0 : niceTicks(yDomain[0], yDomain[1], 5).decimals;
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--line' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, yValues.filter((v) => v > yDomain[0] && v < yDomain[1]).map((value) => ({ value, y: y(value) })), { major: () => false }));
  out.push(vRulings(g, xt.values.filter((v) => v > xDomain[0] && v < xDomain[1]).map((value) => ({ value, x: x(value) })), { major: () => false }));
  out.push(frame(g), '</g>');

  // Labels are placed inside the plot area, clear of the lines, the marks and each other.
  const board = labelBoard(plotBounds(g));
  const runs = series.map((s) => {
    // Missing values break a line into runs of drawable points (pixel coordinates).
    const parts = [[]];
    for (const p of s.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        if (parts.at(-1).length) parts.push([]);
        continue;
      }
      parts.at(-1).push([x(p.x), y(p.y)]);
    }
    return parts.filter((part) => part.length);
  });
  runs.flat().forEach((run) => board.polyline(run));
  const markAt = marks.map((m) => [x(m.x), y(m.y)]);
  markAt.forEach(([mx, my]) => board.circle(mx, my, 4.5));

  const labels = [];
  // Mark labels first, next to their marks: `prefer` lists the directions to try first (compass
  // points such as 'nw' or 'se'), `anchor: 'end'` prefers the left side, `dy` shifts the anchor.
  marks.forEach((m, i) => {
    const [mx, my] = markAt[i];
    const order = prefer(m.prefer ?? (m.anchor === 'end' ? ['w', 'nw', 'sw'] : ['e', 'ne', 'se']));
    const at = board.place(m.label, { anchors: [[mx, my + (m.dy ?? 0)]], ...order });
    labels.push(placedText('chart__annotation', at, m.label));
  });
  // Series labels along their own line, preferably in its upper part: the highest line above-left.
  const meanY = runs.map((parts) => {
    const all = parts.flat();
    return all.reduce((s, [, py]) => s + py, 0) / Math.max(1, all.length);
  });
  const top = meanY.indexOf(Math.min(...meanY));
  series.forEach((s, i) => {
    const all = runs[i].flat();
    if (!s.label || !all.length) return;
    const directions = i === top ? ['nw', 'n', 'w', 'se', 's', 'e'] : ['n', 'nw', 'ne', 'se', 's', 'sw'];
    const at = board.place(s.label, { anchors: seriesAnchors(all, 0.7), directions });
    labels.push(placedText('chart__series-label', at, s.label));
  });

  out.push('<g class="chart__data" aria-hidden="true">');
  series.forEach((s, i) => {
    const d = runs[i].map((run) => run.map(([px, py], k) => `${k === 0 ? 'M' : 'L'}${round(px)},${round(py)}`).join('')).join('');
    const dash = DASHES[i % DASHES.length];
    out.push(`<path class="chart__curve chart__curve--${i}"${dash ? ` stroke-dasharray="${dash}"` : ''} d="${d}"/>`);
  });
  for (const [mx, my] of markAt) out.push(`<circle class="chart__mark" cx="${round(mx)}" cy="${round(my)}" r="4.5"/>`);
  out.push(...labels);
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(yLabels(g, yValues.map((value) => ({ label: pow2 ? powerLabel(2, value) : formatNumber(value, yDecimals), y: y(value) }))));
  out.push(xLabels(g, xt.values.map((value) => ({ label: formatNumber(value, xt.decimals), x: x(value) }))));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

/* ---------------------------------------------------------- bit profile */

/**
 * The proportion of ones at each bit position: the observed proportion as a
 * point, its exact expectation as an ink tick, a reference range (for
 * instance the 95% range of a uniform random sample of the same size) as a
 * vertical line, and the level one half as a dashed reference.
 * @param {{ id: string, title: string, desc: string, bits: { observed: number, expected: number, low: number, high: number }[],
 *   reference?: number, yDomain?: [number, number], width?: number, height?: number, xLabel?: string, yLabel?: string }} options
 */
export function renderBitProfile({
  id,
  title,
  desc,
  bits,
  reference = 0.5,
  yDomain = [0, 1],
  width = 960,
  height = 300,
  xLabel = 'Bit position j (0 = least significant)',
  yLabel = 'Proportion of ones',
}) {
  const g = layout({ width, height });
  const y = linear(yDomain[0], yDomain[1], g.bottom, g.top);
  const band = g.plotW / bits.length;
  const cx = (j) => g.left + (j + 0.5) * band;
  const yt = ticksWithin(yDomain[0], yDomain[1], 4);
  const tickHalf = Math.min(10, band * 0.32);
  const every = band >= 18 ? 1 : band >= 9 ? 2 : 4;
  const out = [svgOpen({ id, width, height, title, desc, className: 'chart--bits' })];

  out.push('<g class="chart__rulings" aria-hidden="true">');
  out.push(hRulings(g, yt.values.filter((v) => v > yDomain[0] && v < yDomain[1]).map((value) => ({ value, y: y(value) })), { major: () => false }));
  out.push(frame(g), '</g>');
  out.push(
    `<line class="chart__reference" x1="${g.left}" x2="${round(g.right)}" y1="${round(y(reference))}" y2="${round(y(reference))}" aria-hidden="true"/>`,
  );

  out.push('<g class="chart__data" aria-hidden="true">');
  bits.forEach((b, j) => {
    const x = round(cx(j));
    out.push(
      `<line class="chart__range" x1="${x}" x2="${x}" y1="${round(y(b.low))}" y2="${round(y(b.high))}"/>`,
      `<line class="chart__tick-expected" x1="${round(cx(j) - tickHalf)}" x2="${round(cx(j) + tickHalf)}" y1="${round(y(b.expected))}" y2="${round(y(b.expected))}"/>`,
      `<circle class="chart__point" cx="${x}" cy="${round(y(b.observed))}" r="${g.narrow ? 3 : 3.75}"/>`,
    );
  });
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  out.push(`<text class="chart__annotation" x="${round(g.right - 4)}" y="${round(y(reference) - 5)}" text-anchor="end">½</text>`);
  out.push(yLabels(g, yt.values.map((value) => ({ label: formatNumber(value, yt.decimals), y: y(value) }))));
  out.push(xLabels(g, bits.map((_, j) => ({ label: String(j), x: cx(j), j })).filter((t) => t.j % every === 0)));
  out.push(axisTitles(g, xLabel, yLabel), '</g></svg>');
  return out.join('');
}

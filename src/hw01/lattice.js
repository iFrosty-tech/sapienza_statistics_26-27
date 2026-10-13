/**
 * The lattice of E(F_p): the curve y² = x³ + 7 over a small prime field drawn
 * on a ruled square, as the sheet on which scalar multiplication is shown.
 * Pure functions shared by the build (the printed figures) and the browser
 * (the slowed-down view), so the page script animates the very elements the
 * build printed.
 *
 * Geometry. Field elements 0, …, p − 1 sit at the centres of p cells: the
 * sheet is the square [−½, p − ½) × [−½, p − ½), a fundamental domain of the
 * torus (Z/pZ)², with y growing upwards. A line y = λx + ν "modulo p" is the
 * real line unwrapped over that square: it is cut wherever it leaves through
 * the top (or bottom) edge and continues from the opposite edge, so it appears
 * as parallel segments through its p lattice points (lineSegments).
 *
 * Layers and their stable classes (the animation selects them):
 *   lat__grid       rulings (minor for every integer, major every 4) and lat__frame
 *   lat__tick       axis labels 0 … p − 1
 *   lat__mirror     the dashed line y = p/2 (P ↔ −P), with lat__mirror-label
 *   lat__line       one line mod p: lat__segment[data-seg] in unwrapping order,
 *                   lat__linepoint[data-x][data-y] at its p lattice points
 *   lat__point      every affine point [data-x][data-y]; .is-orbit (with data-k)
 *                   for the multiples of G, .is-highlight for the selected point
 *   lat__third      the third intersection R′ (open ring)
 *   lat__drop       the reflection R′ → −R′ across the mirror line
 *   lat__result     the result of the operation (plot-red disc)
 *   lat__label      the names kG of the orbit points [data-k]
 *   lat__infinity   the boxed O, the point at infinity, outside the plot
 */

const round = (v) => Math.round(v * 100) / 100;
const num = (v) => Number(v);

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Placement of field elements on the sheet: a square plot of side `size`
 * whose p cells have side `step`; x(v) and y(v) give the SVG coordinates of
 * the centre of the cell of v (y upwards). The right margin holds the boxed O.
 * @param {{ p: number|bigint, width?: number, margin?: { top?: number, right?: number, bottom?: number, left?: number } }} options
 * @returns {{ p: number, width: number, height: number, left: number, top: number, size: number, step: number,
 *   lo: number, hi: number, x: (v: number) => number, y: (v: number) => number }}
 */
export function latticeScale({ p, width = 440, margin = {} }) {
  const P = num(p);
  const m = { top: 14, right: 56, bottom: 34, left: 36, ...margin };
  const size = Math.max(40, width - m.left - m.right);
  const step = size / P;
  return {
    p: P,
    width,
    height: m.top + size + m.bottom,
    left: m.left,
    top: m.top,
    size,
    step,
    lo: -0.5,
    hi: P - 0.5,
    x: (v) => m.left + (v + 0.5) * step,
    y: (v) => m.top + size - (v + 0.5) * step,
  };
}

/**
 * The line y = λx + ν over F_p as the parallel segments it forms on the sheet
 * [−½, p − ½)²: the real line is followed from x = −½ to x = p − ½ and cut
 * where it crosses the top edge (λ > 0) or the bottom edge (λ < 0), then
 * continued from the opposite edge. Any representative of λ may be passed
 * (λ and λ − p give the same lattice points; the smaller |λ| gives fewer
 * segments). With λ null or ±Infinity the line is vertical, x = ν (mod p).
 * Endpoints are exact up to floating point; segments come in increasing x.
 * @param {number|bigint} p
 * @param {number|bigint|null} lambda
 * @param {number|bigint} nu
 * @returns {{ x1: number, y1: number, x2: number, y2: number }[]}
 */
export function lineSegments(p, lambda, nu) {
  const P = num(p);
  const lo = -0.5;
  const hi = P - 0.5;
  if (lambda === null || lambda === undefined || !Number.isFinite(num(lambda))) {
    const c = ((num(nu) % P) + P) % P;
    return [{ x1: c, y1: lo, x2: c, y2: hi }];
  }
  const L = num(lambda);
  const N = num(nu);
  const at = (x) => L * x + N;
  if (L === 0) {
    const y = at(0) - P * Math.floor((at(0) - lo) / P);
    return [{ x1: lo, y1: y, x2: hi, y2: y }];
  }
  const segments = [];
  let x = lo;
  // shift = the multiple of p subtracted from the unwrapped y on the current segment.
  let shift = P * Math.floor((at(lo) - lo) / P);
  // A descending line that starts exactly on the bottom edge belongs to the segment above it.
  if (L < 0 && at(lo) - shift === lo) shift -= P;
  let y = at(lo) - shift;
  while (x < hi - 1e-12) {
    const edge = L > 0 ? hi : lo; // the edge the line leaves through
    const crossing = (edge + shift - N) / L;
    const x2 = Math.min(crossing, hi);
    const y2 = crossing <= hi ? edge : at(hi) - shift;
    if (x2 - x > 1e-12) segments.push({ x1: x, y1: y, x2, y2 });
    if (crossing >= hi) break;
    shift += L > 0 ? P : -P;
    x = crossing;
    y = L > 0 ? lo : hi;
  }
  return segments;
}

/* A point argument as plain numbers, or null. */
const pt = (P) => (P ? { x: num(P.x), y: num(P.y) } : null);

/**
 * The lattice of E(F_p) as an accessible SVG string.
 * @param {{ p: number|bigint, points?: {x,y}[], orbit?: {x,y}[], highlight?: {x,y}, labels?: string[],
 *   line?: { lambda: number|bigint, nu: number|bigint } | { vertical: true, x: number|bigint },
 *   third?: {x,y}, result?: {x,y}, mirror?: boolean, infinity?: boolean | { label?: string, highlight?: boolean },
 *   width?: number, id: string, title: string, desc: string }} options
 *   points: every affine point; orbit: G, 2G, 3G, … in order (labelled kG unless `labels` is given);
 *   highlight: the point drawn as the plot-red disc; line, third, result: one group operation.
 * @returns {string}
 */
export function renderLatticeSVG({
  p,
  points = [],
  orbit = [],
  highlight,
  labels,
  line,
  third,
  result,
  mirror = true,
  infinity,
  width = 440,
  id,
  title,
  desc,
}) {
  const s = latticeScale({ p, width });
  const P = s.p;
  const X = (v) => round(s.x(v));
  const Y = (v) => round(s.y(v));
  const r = Math.min(6, Math.max(3, s.step * 0.22));
  const out = [];
  out.push(
    `<svg class="lat" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${round(s.height)}" width="${s.width}" height="${round(s.height)}" role="img" aria-labelledby="${id}-title ${id}-desc" data-p="${P}">`,
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`,
  );

  // Rulings at every integer (major every 4), the frame, and the tick labels.
  const right = round(s.left + s.size);
  const bottom = round(s.top + s.size);
  out.push('<g class="lat__grid" aria-hidden="true">');
  for (let v = 0; v < P; v += 1) {
    const cls = v % 4 === 0 ? 'lat__ruling is-major' : 'lat__ruling';
    out.push(
      `<line class="${cls}" x1="${X(v)}" x2="${X(v)}" y1="${round(s.top)}" y2="${bottom}"/>`,
      `<line class="${cls}" x1="${round(s.left)}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}"/>`,
    );
  }
  out.push(`<rect class="lat__frame" x="${round(s.left)}" y="${round(s.top)}" width="${round(s.size)}" height="${round(s.size)}"/>`, '</g>');
  const every = s.step >= 14 ? 1 : s.step >= 7 ? 2 : 4;
  out.push('<g class="lat__ticks" aria-hidden="true">');
  for (let v = 0; v < P; v += every) {
    out.push(
      `<text class="lat__tick" x="${X(v)}" y="${round(bottom + 15)}" text-anchor="middle">${v}</text>`,
      `<text class="lat__tick" x="${round(s.left - 7)}" y="${Y(v)}" text-anchor="end" dominant-baseline="middle">${v}</text>`,
    );
  }
  out.push(
    `<text class="lat__axis" x="${round(s.left + s.size / 2)}" y="${round(bottom + 30)}" text-anchor="middle">x</text>`,
    `<text class="lat__axis" x="${round(s.left - 26)}" y="${round(s.top + 6)}" text-anchor="middle">y</text>`,
    '</g>',
  );

  if (mirror) {
    const my = round(s.y(P / 2));
    out.push(
      `<g class="lat__mirror-group" aria-hidden="true"><line class="lat__mirror" x1="${round(s.left)}" x2="${right}" y1="${my}" y2="${my}"/>`,
      `<text class="lat__mirror-label" x="${round(right + 6)}" y="${my}" dominant-baseline="middle">y = p/2</text></g>`,
    );
  }

  // One line mod p: its segments in unwrapping order and its p lattice points.
  if (line) {
    const vertical = line.vertical === true;
    const segments = vertical ? lineSegments(P, null, line.x) : lineSegments(P, line.lambda, line.nu);
    const attrs = vertical ? `data-vertical="${num(line.x)}"` : `data-lambda="${num(line.lambda)}" data-nu="${num(line.nu)}"`;
    out.push(`<g class="lat__line" ${attrs} aria-hidden="true">`);
    segments.forEach((g, i) => {
      out.push(`<line class="lat__segment" data-seg="${i}" x1="${round(s.x(g.x1))}" y1="${round(s.y(g.y1))}" x2="${round(s.x(g.x2))}" y2="${round(s.y(g.y2))}"/>`);
    });
    if (vertical) {
      const c = ((num(line.x) % P) + P) % P;
      for (let v = 0; v < P; v += 1) out.push(`<circle class="lat__linepoint" data-x="${c}" data-y="${v}" cx="${X(c)}" cy="${Y(v)}" r="1.6"/>`);
    } else {
      for (let v = 0; v < P; v += 1) {
        const w = (((num(line.lambda) * v + num(line.nu)) % P) + P) % P;
        out.push(`<circle class="lat__linepoint" data-x="${v}" data-y="${w}" cx="${X(v)}" cy="${Y(w)}" r="1.6"/>`);
      }
    }
    out.push('</g>');
  }

  // Every affine point; the orbit filled and indexed by k; the highlighted point in plot red.
  const orbitIndex = new Map(orbit.map((Q, i) => [`${num(Q.x)},${num(Q.y)}`, i + 1]));
  const hl = pt(highlight);
  const all = points.length ? points.map(pt) : orbit.map(pt);
  out.push('<g class="lat__marks">');
  for (const Q of all) {
    const k = orbitIndex.get(`${Q.x},${Q.y}`);
    const isHl = hl && hl.x === Q.x && hl.y === Q.y;
    const cls = ['lat__point', k ? 'is-orbit' : '', isHl ? 'is-highlight' : ''].filter(Boolean).join(' ');
    out.push(`<circle class="${cls}" data-x="${Q.x}" data-y="${Q.y}"${k ? ` data-k="${k}"` : ''} cx="${X(Q.x)}" cy="${Y(Q.y)}" r="${round(r)}"/>`);
  }
  out.push('</g>');

  // The operation: third intersection R′, its reflection across y = p/2, the result.
  const R3 = pt(third);
  const R = pt(result);
  if (R3 && R) {
    out.push(`<line class="lat__drop" x1="${X(R3.x)}" y1="${Y(R3.y)}" x2="${X(R.x)}" y2="${Y(R.y)}" aria-hidden="true"/>`);
  }
  if (R3) out.push(`<circle class="lat__third" data-x="${R3.x}" data-y="${R3.y}" cx="${X(R3.x)}" cy="${Y(R3.y)}" r="${round(r + 3.5)}"/>`);
  if (R) out.push(`<circle class="lat__result" data-x="${R.x}" data-y="${R.y}" cx="${X(R.x)}" cy="${Y(R.y)}" r="${round(r + 1)}"/>`);

  // Names of the orbit points, beside their marks and kept inside the sheet.
  out.push('<g class="lat__labels" aria-hidden="true">');
  orbit.forEach((Q0, i) => {
    const Q = pt(Q0);
    const text = labels?.[i] ?? (i === 0 ? 'G' : `${i + 1}G`);
    const nearRight = Q.x >= P - 2;
    const nearTop = Q.y >= P - 1;
    const lx = round(s.x(Q.x) + (nearRight ? -(r + 3) : r + 3));
    const ly = round(s.y(Q.y) + (nearTop ? r + 11 : -(r + 2)));
    out.push(`<text class="lat__label" data-k="${i + 1}" x="${lx}" y="${ly}" text-anchor="${nearRight ? 'end' : 'start'}">${escapeXml(text)}</text>`);
  });
  out.push('</g>');

  if (infinity) {
    const opts = typeof infinity === 'object' ? infinity : {};
    const bx = round(right + 14);
    const by = round(s.top + 6);
    const side = 22;
    out.push(
      `<g class="lat__infinity${opts.highlight ? ' is-highlight' : ''}"${opts.label ? ` data-label="${escapeXml(opts.label)}"` : ''}>`,
      `<rect x="${bx}" y="${by}" width="${side}" height="${side}"/>`,
      `<text class="lat__infinity-mark" x="${round(bx + side / 2)}" y="${round(by + side / 2)}" text-anchor="middle" dominant-baseline="central">O</text>`,
    );
    if (opts.label) {
      out.push(`<text class="lat__label lat__label--infinity" x="${round(bx + side / 2)}" y="${round(by + side + 13)}" text-anchor="middle">${escapeXml(opts.label)}</text>`);
    }
    out.push('</g>');
  }

  out.push('</svg>');
  return out.join('');
}

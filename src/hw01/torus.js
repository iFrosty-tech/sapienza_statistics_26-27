/**
 * The torus view of the slowed-down construction (Figure 4). F_p × F_p wraps
 * in both coordinates, so the ruled sheet of the lattice is a torus: a line
 * y = λx + ν (mod p), which the flat sheet shows as parallel segments, is one
 * closed curve on it, and the reflection y → −y is the mirror through the
 * plane of the equators.
 *
 * Model space. Sheet coordinates (x, y), the field elements of lattice.js on
 * [−½, p − ½)², map to model coordinates (X, Y, Z) in the units of the printed
 * SVG: the origin at the centre of the plot, Y upwards, Z away from the viewer.
 * The morph runs in two stages: for t ∈ [0, ½] the sheet rolls along y about
 * the mirror line y = p/2 into a cylinder of circumference `size` (the side of
 * the sheet, so the rows keep their length); for t ∈ [½, 1] the axis of the
 * cylinder bends along x into a ring of radius R, here twice the tube radius r.
 * The finished torus is centred on the origin with its axis along Y: the
 * mirror line becomes the outer equator, y = 0 the inner one, and both lie in
 * the plane Y = 0.
 *
 * The view spins the model about Y (yaw) and tilts it about the horizontal
 * screen axis (pitch), then projects it in perspective so that the plane Z = 0
 * keeps scale 1: at t = 0 with no rotation the drawing is the printed lattice.
 *
 * The pure functions are exported for the tests; createTorusRenderer draws the
 * view on a canvas and runs only in the browser.
 */

import { lineSegments, placeLabels } from './lattice.js';

const TAU = 2 * Math.PI;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mod = (v, p) => ((v % p) + p) % p;
/* Weight of the translation that brings the centre of the torus to the origin. */
const centring = (t) => t * t * (3 - 2 * t);

/**
 * Sizes of the torus made from a sheet of side `size`: the tube radius r keeps
 * the length of the rows, and the ring radius is R = ratio · r.
 */
export function torusDims(size, ratio = 2) {
  const r = size / TAU;
  return { size, r, R: ratio * r };
}

/**
 * The model position of the sheet point (x, y) on the flat sheet: the layout
 * of latticeScale, centred on the plot, Y upwards.
 */
export function sheetPoint(x, y, p, size) {
  return { X: ((x + 0.5) / p - 0.5) * size, Y: ((y + 0.5) / p - 0.5) * size, Z: 0 };
}

/* The longitude of x around the axis of the torus, 0 at the centre of the sheet. */
const longitude = (x, p) => TAU * ((x + 0.5) / p - 0.5);
/* The angle of y around the tube, 0 on the mirror line y = p/2 and π on y = 0. */
const tubeAngle = (y, p) => TAU * (y / p - 0.5);

/** The point (x, y) on the torus of ring radius R and tube radius r, axis along Y. */
export function torusPoint(x, y, p, R, r) {
  const beta = longitude(x, p);
  const alpha = tubeAngle(y, p);
  const w = R + r * Math.cos(alpha);
  return { X: w * Math.sin(beta), Y: r * Math.sin(alpha), Z: -w * Math.cos(beta) };
}

/**
 * The point (x, y) at stage t ∈ [0, 1] of the morph: t = 0 is the flat sheet,
 * t = 1 exactly torusPoint, and the position is continuous in t.
 * @param {{ size: number, r?: number, R?: number }} dims
 */
export function morphPoint(x, y, p, t, dims) {
  const L = dims.size;
  const r = dims.r ?? L / TAU;
  const R = dims.R ?? 2 * r;
  const flat = sheetPoint(x, y, p, L);
  const s1 = clamp01(2 * t);
  const s2 = clamp01(2 * t - 1);
  if (s1 === 0) return flat;
  const y0 = L / (2 * p); // the mirror line y = p/2, about which the sheet rolls
  const alpha = (TAU * (flat.Y - y0)) / L;
  let X;
  let Y;
  let Z;
  if (s2 === 0) {
    // Roll: the column of the sheet bends into an arc of angle 2π·s1 and radius L / (2π·s1).
    const a = alpha * s1;
    const rho = L / (TAU * s1);
    X = flat.X;
    Y = y0 + rho * Math.sin(a);
    Z = 2 * rho * Math.sin(a / 2) ** 2;
  } else {
    // Bend: the axis of the cylinder (Y = y0, Z = r) curves into a ring that grows to radius R.
    const beta = (TAU * s2 * flat.X) / L;
    const ring = (L * (1 + (R / r - 1) * s2)) / (TAU * s2);
    const w = ring + r * Math.cos(alpha);
    X = w * Math.sin(beta);
    Y = y0 + r * Math.sin(alpha);
    Z = r - r * Math.cos(alpha) * Math.cos(beta) + 2 * ring * Math.sin(beta / 2) ** 2;
  }
  const c = centring(t);
  return { X, Y: Y - y0 * c, Z: Z - (r + R) * c };
}

/** The unit normal of the morphing surface at (x, y), pointing at the viewer on the flat sheet. */
export function morphNormal(x, y, p, t) {
  const s1 = clamp01(2 * t);
  const s2 = clamp01(2 * t - 1);
  const alpha = TAU * (y / p - 0.5);
  if (s2 === 0) {
    const a = alpha * s1;
    return { X: 0, Y: Math.sin(a), Z: -Math.cos(a) };
  }
  const beta = TAU * s2 * ((x + 0.5) / p - 0.5);
  return { X: Math.cos(alpha) * Math.sin(beta), Y: Math.sin(alpha), Z: -Math.cos(alpha) * Math.cos(beta) };
}

/** A model point spun by `yaw` about Y, then tilted by `pitch` about the horizontal screen axis. */
export function rotate({ X, Y, Z }, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const X1 = X * cy + Z * sy;
  const Z1 = -X * sy + Z * cy;
  return { X: X1, Y: Y * cp - Z1 * sp, Z: Y * sp + Z1 * cp };
}

/**
 * A model point on screen: rotated, then projected in perspective from `distance`
 * in front of the plane Z = 0, which keeps scale 1.
 * @param {{ cx: number, cy: number, distance: number, yaw?: number, pitch?: number }} view
 * @returns {{ x: number, y: number, depth: number, scale: number }}
 */
export function project(point, { cx, cy, distance, yaw = 0, pitch = 0 }) {
  const q = rotate(point, yaw, pitch);
  const scale = distance / (distance + q.Z);
  return { x: cx + q.X * scale, y: cy - q.Y * scale, depth: q.Z, scale };
}

/** Indices of items with a `depth`, from the farthest to the nearest (the painter's order). */
export function depthOrder(items) {
  return items.map((_, i) => i).sort((a, b) => items[b].depth - items[a].depth);
}

/**
 * The line y = λx + ν (mod p), or the vertical line x = c, as polylines of
 * sheet points ready for morphPoint. While the sheet is open (t < 1) these are
 * the parallel segments of lineSegments, sampled; on the closed torus (t = 1)
 * the line is one curve, followed unwrapped from x = −½ to x = p − ½, whose end
 * meets its start. `slope` (when given) is the representative of λ to follow.
 * Every sample carries `u`, its position along the line, from 0 to 1.
 * @param {number} p
 * @param {{ vertical: true, x: number } | { lambda: number, nu: number, slope?: number }} line
 * @param {number} t
 * @param {number} [samples]
 * @returns {{ x: number, y: number, u: number }[][]}
 */
export function liftLine(p, line, t, samples = 240) {
  const lo = -0.5;
  if (line.vertical) {
    const c = mod(line.x, p);
    return [Array.from({ length: samples + 1 }, (_, i) => ({ x: c, y: lo + (p * i) / samples, u: i / samples }))];
  }
  const slope = line.slope ?? line.lambda;
  const nu = line.nu;
  if (t >= 1) {
    const shift = p * Math.floor((slope * lo + nu - lo) / p);
    return [
      Array.from({ length: samples + 1 }, (_, i) => {
        const x = lo + (p * i) / samples;
        return { x, y: slope * x + nu - shift, u: i / samples };
      }),
    ];
  }
  // The segments of the open sheet, each sampled in proportion to its extent in x.
  return lineSegments(p, slope, nu).map((s) => {
    const count = Math.max(2, Math.round((samples * (s.x2 - s.x1)) / p));
    return Array.from({ length: count + 1 }, (_, i) => {
      const f = i / count;
      const x = s.x1 + (s.x2 - s.x1) * f;
      return { x, y: s.y1 + (s.y2 - s.y1) * f, u: (x - lo) / p };
    });
  });
}

/* ------------------------------------------------------------------ canvas */

/** The default view of the finished torus: seen from above, turned a little. */
export const TORUS_VIEW = Object.freeze({ yaw: -0.42, pitch: -0.98 });
export const PITCH_LIMIT = 1.45;

const BACK_ALPHA = 0.32;
const FONT_PX = 11;

/**
 * Draws the scene of the slowed-down view on a canvas laid exactly over the
 * printed SVG: the units are those of the SVG's viewBox, so at t = 0 with no
 * rotation every mark falls where the SVG draws it.
 * @param {HTMLCanvasElement} canvas
 * @param {{ p: number, scale: object, points: { x: number, y: number }[] }} options
 *   scale: the latticeScale of the SVG; points: the affine points of the curve
 */
export function createTorusRenderer(canvas, { p, scale: s, points }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Torus view: no 2D canvas context.');
  const dims = torusDims(s.size);
  const centre = { cx: s.left + s.size / 2, cy: s.top + s.size / 2, distance: 5 * s.size };
  const colours = {};
  let box = { width: s.width, height: s.height, dpr: 1, k: 1 };
  const r = Math.min(6, Math.max(3, s.step * 0.22));

  function readColours() {
    const css = getComputedStyle(canvas);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    Object.assign(colours, {
      paper: v('--paper', '#f7faf8'),
      ink: v('--ink', '#1b2420'),
      inkSoft: v('--ink-soft', '#46524c'),
      ruling: v('--ruling', '#9cc3ae'),
      rulingMinor: v('--ruling-minor', '#d3e6da'),
      rulingInk: v('--ruling-ink', '#3a6b54'),
      plot: v('--plot', '#d0462f'),
      font: v('--font-form', 'sans-serif'),
    });
  }

  /** Matches the canvas to its CSS box (the SVG's box), at the device pixel ratio. */
  function resize(cssWidth) {
    const k = cssWidth / s.width;
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    box = { width: cssWidth, height: s.height * k, dpr, k };
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
  }

  /** The screen position, perspective scale and facing of the sheet point (x, y). */
  function place(x, y, view) {
    const m = morphPoint(x, y, p, view.t, dims);
    const q = project(m, { ...centre, yaw: view.yaw, pitch: view.pitch });
    const n = rotate(morphNormal(x, y, p, view.t), view.yaw, view.pitch);
    return { x: q.x, y: q.y, depth: q.depth, scale: q.scale, front: n.Z <= 1e-9 };
  }

  /*
   * The part of a polyline of placed samples on one side of the surface: a piece
   * is on the back when both its ends face away, so the silhouette leaves no gap.
   */
  function polyline(samples, back) {
    const path = new Path2D();
    let open = false;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      if ((!a.front && !b.front) === back) {
        if (!open) path.moveTo(a.x, a.y);
        path.lineTo(b.x, b.y);
        open = true;
      } else open = false;
    }
    return path;
  }

  function strokeRuns(runs, back) {
    for (const run of runs) {
      ctx.globalAlpha = (back ? BACK_ALPHA : 1) * (run.alpha ?? 1);
      ctx.strokeStyle = run.colour;
      ctx.lineWidth = run.width;
      ctx.setLineDash(run.dash ?? []);
      ctx.stroke(polyline(run.samples, back));
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function circle(x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, TAU);
  }

  /* The rulings of the sheet, its edges (the seams of the torus) and the mirror line. */
  function sheetRuns(view) {
    const runs = [];
    const lo = -0.5;
    const hi = p - 0.5;
    const n = 40;
    const along = (fixed, vertical) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const u = lo + (p * i) / n;
        return vertical ? place(fixed, u, view) : place(u, fixed, view);
      });
    for (let v = 0; v < p; v += 1) {
      const colour = v % 4 === 0 ? colours.ruling : colours.rulingMinor;
      runs.push({ samples: along(v, true), colour, width: 1 }, { samples: along(v, false), colour, width: 1 });
    }
    for (const edge of [lo, hi]) {
      runs.push({ samples: along(edge, true), colour: colours.rulingInk, width: 1.25 });
      runs.push({ samples: along(edge, false), colour: colours.rulingInk, width: 1.25 });
    }
    runs.push({ samples: along(p / 2, false), colour: colours.rulingInk, width: 1, dash: [4, 3] });
    return runs;
  }

  /* The drawn part of a line mod p: samples up to the pen position `progress` (0 to 1). */
  function lineRuns(line, view, progress, alpha) {
    if (!line || alpha <= 0 || progress <= 0) return [];
    const pieces = liftLine(p, line, view.t);
    const runs = [];
    for (const piece of pieces) {
      const kept = [];
      for (let i = 0; i < piece.length; i += 1) {
        const q = piece[i];
        if (q.u <= progress) kept.push(q);
        else {
          const a = piece[i - 1];
          if (a) {
            const f = (progress - a.u) / (q.u - a.u);
            kept.push({ x: a.x + (q.x - a.x) * f, y: a.y + (q.y - a.y) * f, u: progress });
          }
          break;
        }
      }
      if (kept.length > 1) runs.push({ samples: kept.map((q) => place(q.x, q.y, view)), colour: colours.ink, width: 1.25, alpha });
    }
    return runs;
  }

  /* A screen position for a scene position: a sheet point, or 'O' for the boxed O in the margin. */
  function screenOf(pos, view, infinity) {
    if (pos === 'O') return { x: infinity.cx, y: infinity.cy, scale: 1, front: true, depth: -Infinity };
    return place(pos.x, pos.y, view);
  }

  function lerpScreen(a, b, f) {
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, scale: a.scale + (b.scale - a.scale) * f, front: f < 0.5 ? a.front : b.front };
  }

  /**
   * Paints one frame.
   * @param {object} scene the state of the construction (see slowmo.js, sceneOf)
   * @param {{ t: number, yaw: number, pitch: number }} view
   */
  function draw(scene, view) {
    const { dpr, k } = box;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const infinity = scene.infinity;

    const sheet = sheetRuns(view);
    const lines = [
      ...lineRuns(scene.trace?.line, view, 1, scene.trace?.lineAlpha ?? 0),
      ...lineRuns(scene.live?.line, view, scene.live?.lineProgress ?? 0, scene.live?.lineAlpha ?? 0),
    ];
    const marks = points.map((q) => ({ ...place(q.x, q.y, view), q, orbit: scene.visited.has(`${q.x},${q.y}`) }));

    // Back: rulings, lines and marks on the far side of the surface, faint.
    strokeRuns(sheet, true);
    strokeRuns(lines, true);
    const order = depthOrder(marks);
    const drawMark = (m, back) => {
      ctx.globalAlpha = back ? BACK_ALPHA : 1;
      circle(m.x, m.y, r * m.scale);
      ctx.fillStyle = m.orbit ? colours.ink : colours.paper;
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colours.ink;
      ctx.stroke();
    };
    for (const i of order) if (!marks[i].front) drawMark(marks[i], true);

    // Front.
    strokeRuns(sheet, false);
    strokeRuns(lines, false);
    for (const i of order) if (marks[i].front) drawMark(marks[i], false);
    ctx.globalAlpha = 1;

    // Lattice points of the live line, ticked as the pen passes them.
    for (const tick of scene.live?.ticks ?? []) {
      const m = place(tick.x, tick.y, view);
      ctx.globalAlpha = tick.alpha * (m.front ? 1 : BACK_ALPHA);
      circle(m.x, m.y, tick.r * m.scale);
      ctx.fillStyle = colours.inkSoft;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The drop R′ → R along the meridian, dashed, and the third point.
    for (const helper of [scene.trace, scene.live]) {
      if (!helper) continue;
      if (helper.drop && helper.dropAlpha > 0) {
        const { from, to, progress } = helper.drop;
        const n = 24;
        const samples = Array.from({ length: n + 1 }, (_, i) => place(from.x, from.y + (to.y - from.y) * progress * (i / n), view));
        strokeRuns([{ samples, colour: colours.rulingInk, width: 1.25, dash: [4, 3], alpha: helper.dropAlpha }], true);
        strokeRuns([{ samples, colour: colours.rulingInk, width: 1.25, dash: [4, 3], alpha: helper.dropAlpha }], false);
      }
      if (helper.third && helper.thirdAlpha > 0) {
        const m = place(helper.third.x, helper.third.y, view);
        ctx.globalAlpha = helper.thirdAlpha * (m.front ? 1 : BACK_ALPHA);
        circle(m.x, m.y, (r + 3.5) * helper.thirdScale * m.scale);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = colours.ink;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // The operands pulse once.
    for (const pulse of scene.pulses) {
      const m = screenOf(pulse.pos, view, infinity);
      ctx.globalAlpha = pulse.alpha * (m.front ? 1 : BACK_ALPHA);
      circle(m.x, m.y, pulse.radius * m.scale);
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colours.ink;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The accumulator, plot red, travelling from P to R.
    for (const acc of scene.acc) {
      if (acc.alpha <= 0) continue;
      const a = screenOf(acc.from, view, infinity);
      const m = acc.to ? lerpScreen(a, screenOf(acc.to, view, infinity), acc.travel) : a;
      ctx.globalAlpha = acc.alpha * (m.front ? 1 : 0.55);
      circle(m.x, m.y, (r + 2) * acc.size * m.scale);
      ctx.fillStyle = colours.plot;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colours.paper;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Names of the multiples on the front of the surface, placed clear of the marks.
    const front = scene.labels
      .map((label) => ({ label, m: place(label.x, label.y, view) }))
      .filter(({ m }) => m.front);
    if (front.length) {
      const placed = placeLabels({
        items: front.map(({ label, m }, i) => ({ id: i, text: label.text, cx: m.x, cy: m.y, r: (label.final ? r + 2 : r) * m.scale })),
        obstacles: marks.filter((m) => m.front).map((m) => ({ cx: m.x, cy: m.y, r: r * m.scale })),
        // On the flat sheet, the same placement as the SVG; once it leaves the plane, the whole canvas.
        bounds: view.t < 0.02 ? { x0: s.left, y0: s.top, x1: s.left + s.size, y1: s.top + s.size } : { x0: 2, y0: 2, x1: s.width - 2, y1: s.height - 2 },
        avoidY: view.t < 0.02 ? [s.y(p / 2)] : [],
        fontSize: FONT_PX,
      });
      ctx.font = `700 ${FONT_PX}px ${colours.font}`;
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3;
      ctx.strokeStyle = colours.paper;
      ctx.fillStyle = colours.ink;
      for (const a of placed) {
        ctx.textAlign = a.anchor === 'middle' ? 'center' : a.anchor === 'end' ? 'right' : 'left';
        ctx.strokeText(a.text, a.x, a.y);
        ctx.fillText(a.text, a.x, a.y);
      }
    }
  }

  readColours();
  return { draw, resize, readColours, dims, place };
}

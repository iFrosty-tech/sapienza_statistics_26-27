/**
 * Figure 4, the slowed-down view of scalar multiplication (§4): the
 * computation of kG on the toy curve replayed one group operation at a time,
 * in two linked views and an arithmetic panel.
 *
 *   Coordinate view   the lattice of E(F₁₇) as printed by lattice.js (SVG), or
 *                     glued into a torus (canvas, torus.js), with the
 *                     operands, the line modulo p drawn segment by segment
 *                     through its lattice points, the third point R′, the
 *                     reflection across y = p/2 and the red accumulator.
 *   Group view        a printed dial of n ticks: the index of the accumulator
 *                     modulo n advances one tick per addition and doubles per
 *                     doubling; with double-and-add, the bits of k beneath.
 *   Arithmetic        the formulas of the operation with substituted numbers,
 *                     row by row as the drawing reaches them.
 *   Transcript        each multiple as it is reached: the text alternative.
 *
 * State machine. The timeline (slowmo-timeline.js) is a list of operations;
 * the state is `done` (operations completed, 0 … S) plus, while one is drawn,
 * `anim` = { index, elapsed }, elapsed in normal-speed ms. `running` advances
 * the clock; `playing` chains the operations with a rest between them. Every
 * frame is rendered from (timeline, done, anim) alone, so an interrupted or
 * reversed operation never leaves stray marks: Step back drops `anim` or
 * decrements `done`, Step forward completes or plays one operation, Restart
 * sets `done` to 0, and a new parameter rebuilds the timeline.
 *
 * Motion budget: requestAnimationFrame runs only while the figure is on
 * screen and something moves (an operation, the rest between two, the morph,
 * the slow spin of the torus while playing). Reduced motion keeps the phases
 * in sequence but replaces drawing and travel by 160 ms crossfades, and the
 * morph by a crossfade to a still torus.
 *
 * The printed SVG of the build stays in the page as the fallback for no
 * script and for print; the live sheet is drawn beside it.
 */

import { LIMITS, METHODS, PHASE_MS, REST_MS, SPEED, buildTimeline, easeInOut, easeOut, operationMs, phaseProgress } from './slowmo-timeline.js';
import { infinityBox, latticeScale, placeLabels, renderLatticeSVG } from './lattice.js';
import { PITCH_LIMIT, TORUS_VIEW, createTorusRenderer } from './torus.js';
import { TOY_BASE, TOY_CURVE, orderOf, points as curvePoints } from '../lib/toy-curve.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 440;
const MORPH_MS = 1400;
const FADE_MS = 160;
const TRACE_LINE = 0.18;
const TRACE_HELPER = 0.3;
const SPIN_RAD_PER_S = 0.12;
const DEFAULT = Object.freeze({ k: 6, method: 'repeated', speed: 'slow', view: 'flat' });

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, f) => a + (b - a) * f;
const mod = (v, n) => ((v % n) + n) % n;
const keyOf = (P) => `${P.x},${P.y}`;
const coords = (P) => (P ? `(${P.x}, ${P.y})` : 'O');
const multiple = (k) => (k === 1 ? 'G' : `${k}G`);
const METHOD_NAME = Object.freeze({ repeated: 'repeated addition', 'double-and-add': 'double-and-add' });

/* ------------------------------------------------------------ motion kit */

function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function announceTo(status, text) {
  if (!status) return;
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
}

/** The acknowledgement of an instant change: a 160 ms opacity blink. */
function blink(element) {
  element?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: FADE_MS, easing: 'linear' });
}

/** Calls back once when the element comes within one screen of the viewport. */
function whenNear(element, callback) {
  if (!('IntersectionObserver' in globalThis)) {
    callback();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        callback();
      }
    },
    { rootMargin: '100% 0px' },
  );
  io.observe(element);
}

/** Calls onChange(visible) whenever the element enters or leaves the screen or the tab is hidden. */
function trackVisibility(element, onChange) {
  let onScreen = !('IntersectionObserver' in globalThis);
  const update = () => onChange(onScreen && document.visibilityState === 'visible');
  if (!onScreen) {
    new IntersectionObserver((entries) => {
      onScreen = entries.at(-1).isIntersecting;
      update();
    }).observe(element);
  }
  document.addEventListener('visibilitychange', update);
  update();
}

function svgEl(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
}

/* ------------------------------------------------------------------ scene */

/**
 * Everything one frame shows, computed from the timeline, the number of
 * completed operations and the operation under way. Both the SVG sheet and
 * the canvas torus draw this object.
 */
function sceneOf(tl, done, anim, rm) {
  const op = anim ? tl.ops[anim.index] : null;
  const pr = op ? phaseProgress(op, anim.elapsed) : null;
  const before = tl.states[done];
  const S = tl.ops.length;
  const pos = (P) => (P === undefined ? undefined : P === null ? 'O' : P);
  const fadeIn = (progress, phase) => (rm ? clamp01((progress * PHASE_MS[phase]) / FADE_MS) : easeOut(progress));

  // Points reached so far: discs on the sheet, named by their index modulo n.
  const visited = new Map();
  let infinityReached = false;
  const reach = (state) => {
    if (!state || state.point === undefined) return;
    if (state.point === null) infinityReached = true;
    else if (!visited.has(keyOf(state.point))) visited.set(keyOf(state.point), { ...state.point, index: state.index });
  };
  for (let i = 0; i <= done; i += 1) reach(tl.states[i]);
  if (op && pr.land >= 1) reach(tl.states[done + 1]);
  const final = !op && done === S;
  const labels = [...visited.values()]
    .sort((a, b) => a.index - b.index)
    .map((v) => ({ x: v.x, y: v.y, text: multiple(v.index), final: false }));
  let infinityLabel = infinityReached ? `${tl.n}G` : null;
  if (final) {
    if (tl.result === null) infinityLabel = multiple(tl.resultK);
    else {
      const label = labels.find((l) => l.x === tl.result.x && l.y === tl.result.y);
      if (label) Object.assign(label, { text: `Q = ${multiple(tl.resultK)}`, final: true });
    }
  }

  // The trace of the previous operation: its line as a faint ghost until the next line
  // draws, its third point and drop fainter still until the next operation begins.
  let trace = null;
  const lineOp = tl.ops.slice(0, done).findLast((o) => o.line);
  const lastOp = done > 0 ? tl.ops[done - 1] : null;
  if (lineOp || lastOp) {
    const ghost = op && pr.line !== null ? 1 - clamp01(pr.line / 0.3) : 1;
    const helpers = op ? 1 - pr.operands : 1;
    trace = {
      op: lineOp,
      line: lineOp?.line ?? null,
      lineAlpha: TRACE_LINE * ghost,
      third: lastOp?.third ?? null,
      thirdScale: 1,
      thirdAlpha: lastOp?.third ? TRACE_HELPER * helpers : 0,
      drop: lastOp?.third && lastOp.result ? { from: lastOp.third, to: lastOp.result, progress: 1 } : null,
      dropAlpha: TRACE_HELPER * helpers,
    };
  }

  // The operation under way.
  let live = null;
  const pulses = [];
  const acc = [];
  if (op) {
    const clear = pr.clear ?? 0;
    if (op.line && pr.line > 0) {
      const progress = rm ? 1 : pr.line;
      const ticks = op.line.points
        .map((q, i) => ({ ...q, tick: op.line.ticks[i] }))
        .filter((q) => progress >= q.tick)
        .map((q) => ({
          x: q.x,
          y: q.y,
          r: rm ? 1.6 : 1.6 + 1.8 * clamp01(1 - ((pr.line - q.tick) * PHASE_MS.line) / 240),
          alpha: (rm ? fadeIn(pr.line, 'line') : 1) * (1 - clear),
        }));
      live = {
        op,
        line: op.line,
        lineProgress: progress,
        lineAlpha: (rm ? fadeIn(pr.line, 'line') : 1) * lerp(1, TRACE_LINE, clear),
        ticks,
      };
    } else live = { op, line: null, lineProgress: 0, lineAlpha: 0, ticks: [] };
    if (op.third && pr.third > 0) {
      live.third = op.third;
      live.thirdScale = rm ? 1 : 0.4 + 0.6 * easeOut(pr.third);
      live.thirdAlpha = fadeIn(pr.third, 'third') * lerp(1, TRACE_HELPER, clear);
    }
    if (op.third && op.result && pr.reflect > 0) {
      live.drop = { from: op.third, to: op.result, progress: rm ? 1 : easeOut(pr.reflect) };
      live.dropAlpha = (rm ? fadeIn(pr.reflect, 'reflect') : 1) * lerp(1, TRACE_HELPER, clear);
    }
    // The operands pulse once: P and Q, or P twice for a doubling.
    if (pr.operands < 1) {
      const q = pr.operands;
      const ring = (target, delay = 0) => {
        const f = clamp01((q * PHASE_MS.operands - delay) / (PHASE_MS.operands - delay));
        if (f <= 0) return;
        pulses.push(rm ? { pos: target, radius: 12, alpha: 1 - f } : { pos: target, radius: 8 + 10 * easeOut(f), alpha: 0.9 * (1 - f) });
      };
      if (op.kind === 'load') ring(pos(op.Q));
      else {
        ring(pos(op.P));
        ring(pos(op.kind === 'double' ? op.P : op.Q), op.kind === 'double' ? 90 : 0);
      }
    }
    // The accumulator: at P until it lands on R.
    const from = pos(before.point);
    const to = pos(op.result);
    const land = pr.land;
    if (op.kind === 'load') {
      if (land > 0) acc.push({ from: to, to: null, travel: 0, alpha: fadeIn(land, 'land'), size: rm ? 1 : 0.3 + 0.7 * easeOut(land) });
    } else if (rm && land > 0) {
      const c = fadeIn(land, 'land');
      if (from !== undefined) acc.push({ from, to: null, travel: 0, alpha: 1 - c, size: 1 });
      acc.push({ from: to, to: null, travel: 0, alpha: c, size: 1 });
    } else if (from !== undefined) {
      acc.push({ from, to, travel: easeOut(land), alpha: 1, size: 1 });
    }
  } else if (before.point !== undefined) {
    acc.push({ from: pos(before.point), to: null, travel: 0, alpha: 1, size: 1 });
  }

  return { tl, done, op, pr, final, visited, labels, infinityLabel, trace, live, pulses, acc };
}

/* ------------------------------------------------------------ the sheet */

/**
 * The live SVG sheet: the lattice printed by renderLatticeSVG plus a layer of
 * lines below the marks and a layer of helpers above them, updated per frame.
 */
function createSheet(holder, { p, s, points, r, box }) {
  holder.innerHTML = renderLatticeSVG({
    p,
    points,
    orbit: [],
    infinity: true,
    id: 'slowmo-live',
    title: 'Scalar multiplication slowed down on the lattice of E(F₁₇)',
    desc: '',
  });
  const svg = holder.querySelector('svg');
  svg.classList.add('slowmo__svg');
  const desc = svg.querySelector('desc');
  const marks = svg.querySelector('.lat__marks');
  const labels = svg.querySelector('.lat__labels');
  const ticks = svg.querySelector('.lat__ticks');
  const mirrorLabel = svg.querySelector('.lat__mirror-label');
  const pointEls = new Map([...marks.querySelectorAll('.lat__point')].map((c) => [`${c.dataset.x},${c.dataset.y}`, c]));

  const lines = svgEl('g', { class: 'slowmo__lines', 'aria-hidden': 'true' });
  marks.before(lines);
  const traceLine = svgEl('g', { class: 'slowmo__trace' }, lines);
  const liveLine = svgEl('g', { class: 'slowmo__live' }, lines);
  const fx = svgEl('g', { class: 'slowmo__fx', 'aria-hidden': 'true' });
  marks.after(fx);
  const helpers = {
    traceDrop: svgEl('line', { class: 'lat__drop' }, fx),
    traceThird: svgEl('circle', { class: 'lat__third' }, fx),
    liveDrop: svgEl('line', { class: 'lat__drop' }, fx),
    liveThird: svgEl('circle', { class: 'lat__third' }, fx),
  };
  const pulses = [0, 1].map(() => svgEl('circle', { class: 'slowmo__pulse' }, fx));
  const accs = [0, 1].map(() => svgEl('circle', { class: 'slowmo__acc' }, fx));
  const infinityLabel = svgEl('text', {
    class: 'lat__label lat__label--infinity slowmo__infinity-label',
    x: box.cx,
    y: box.y + box.side + 13,
    'text-anchor': 'middle',
    'aria-hidden': 'true',
  });
  svg.append(infinityLabel);

  const X = (P) => (P === 'O' ? box.cx : s.x(P.x));
  const Y = (P) => (P === 'O' ? box.cy : s.y(P.y));

  /* The line of an operation on the sheet: its segments with their lengths, and its lattice points. */
  function geometry(line) {
    let total = 0;
    const segs = line.segments.map((g) => {
      const seg = { x1: s.x(g.x1), y1: s.y(g.y1), x2: s.x(g.x2), y2: s.y(g.y2) };
      seg.from = total;
      seg.len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      total += seg.len;
      return seg;
    });
    return { segs, total };
  }

  function buildLine(group, line) {
    group.replaceChildren();
    if (!line) return null;
    const g = geometry(line);
    const segEls = g.segs.map((seg, i) => svgEl('line', { class: 'lat__segment', 'data-seg': i, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 }, group));
    return { line, g, segEls, tickEls: new Map() };
  }

  /* Draws the first `progress` of the line, segment after segment, in unwrapping order. */
  function drawLine(state, progress) {
    const drawn = progress * state.g.total;
    state.g.segs.forEach((seg, i) => {
      const el = state.segEls[i];
      const f = clamp01((drawn - seg.from) / seg.len);
      el.style.visibility = f > 0 ? '' : 'hidden';
      setAttrs(el, { x2: lerp(seg.x1, seg.x2, f), y2: lerp(seg.y1, seg.y2, f) });
    });
  }

  let live = null; // the drawn live line, and the line objects both layers show
  let traceShown = null;
  let liveShown = null;
  let labelKey = '';

  function drawLabels(scene) {
    const key = scene.labels.map((l) => `${l.text}@${l.x},${l.y}`).join('|');
    if (key === labelKey) return;
    labelKey = key;
    const placed = placeLabels({
      items: scene.labels.map((l, i) => ({ id: i, text: l.text, cx: s.x(l.x), cy: s.y(l.y), r: l.final ? r + 2 : r })),
      obstacles: points.map((q) => ({ cx: s.x(q.x), cy: s.y(q.y), r })),
      bounds: { x0: s.left, y0: s.top, x1: s.left + s.size, y1: s.top + s.size },
      avoidY: [s.y(p / 2)],
    });
    labels.replaceChildren(
      ...placed.map((a, i) => {
        const text = svgEl('text', { class: 'lat__label', x: Math.round(a.x * 100) / 100, y: Math.round(a.y * 100) / 100, 'text-anchor': a.anchor });
        if (scene.labels[i].final) text.setAttribute('data-highlight', '');
        text.textContent = a.text;
        return text;
      }),
    );
  }

  function drawHelper(lineEl, circleEl, src, which) {
    const third = src?.third;
    const alpha = src?.[`${which}Alpha`] ?? 0;
    if (third && src.thirdAlpha > 0) {
      setAttrs(circleEl, { cx: s.x(third.x), cy: s.y(third.y), r: (r + 3.5) * src.thirdScale, opacity: src.thirdAlpha });
      circleEl.style.display = '';
    } else circleEl.style.display = 'none';
    if (src?.drop && alpha > 0) {
      const { from, to, progress } = src.drop;
      setAttrs(lineEl, { x1: s.x(from.x), y1: s.y(from.y), x2: s.x(from.x), y2: lerp(s.y(from.y), s.y(to.y), progress), opacity: alpha });
      lineEl.style.display = '';
    } else lineEl.style.display = 'none';
  }

  /** Renders a scene. */
  function draw(scene) {
    for (const [key, el] of pointEls) el.classList.toggle('is-orbit', scene.visited.has(key));
    drawLabels(scene);
    infinityLabel.textContent = scene.infinityLabel ?? '';

    // The trace of the previous operation.
    const traceNext = scene.trace?.line ?? null;
    if (traceShown !== traceNext) {
      traceShown = traceNext;
      buildLine(traceLine, traceNext);
    }
    traceLine.style.opacity = String(scene.trace?.lineAlpha ?? 0);
    drawHelper(helpers.traceDrop, helpers.traceThird, scene.trace, 'drop');

    // The operation under way: the line, its lattice points as the pen passes them, R′ and the drop.
    const line = scene.live?.line ?? null;
    if (liveShown !== line) {
      liveShown = line;
      live = buildLine(liveLine, line);
    }
    if (live) {
      drawLine(live, scene.live.lineProgress);
      liveLine.style.opacity = String(scene.live.lineAlpha);
      const seen = new Set();
      for (const tick of scene.live.ticks) {
        const key = `${tick.x},${tick.y}`;
        seen.add(key);
        let el = live.tickEls.get(key);
        if (!el) {
          el = svgEl('circle', { class: 'lat__linepoint', cx: s.x(tick.x), cy: s.y(tick.y) }, liveLine);
          live.tickEls.set(key, el);
        }
        setAttrs(el, { r: tick.r, opacity: tick.alpha / Math.max(0.001, scene.live.lineAlpha) });
      }
      for (const [key, el] of live.tickEls) {
        if (!seen.has(key)) {
          el.remove();
          live.tickEls.delete(key);
        }
      }
    }
    drawHelper(helpers.liveDrop, helpers.liveThird, scene.live, 'drop');

    pulses.forEach((el, i) => {
      const pulse = scene.pulses[i];
      if (!pulse) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      setAttrs(el, { cx: X(pulse.pos), cy: Y(pulse.pos), r: pulse.radius, opacity: pulse.alpha });
    });
    accs.forEach((el, i) => {
      const a = scene.acc[i];
      if (!a || a.alpha <= 0) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      const x = a.to ? lerp(X(a.from), X(a.to), a.travel) : X(a.from);
      const y = a.to ? lerp(Y(a.from), Y(a.to), a.travel) : Y(a.from);
      setAttrs(el, { cx: x, cy: y, r: (r + 2) * a.size, opacity: a.alpha });
    });
  }

  /** Fades the printed axis numbers and the mirror label as the sheet leaves the plane. */
  function setChrome(alpha) {
    const v = alpha >= 1 ? '' : String(alpha);
    ticks.style.opacity = v;
    if (mirrorLabel) mirrorLabel.style.opacity = v;
  }

  return { svg, desc, draw, setChrome };
}

/* ------------------------------------------------------------ the dial */

const DIAL = Object.freeze({ size: 232, c: 116, R: 82 });

function dialAngle(i, n) {
  return -Math.PI / 2 + (2 * Math.PI * i) / n;
}

function arcPath(from, delta, n, radius) {
  const { c } = DIAL;
  const a0 = dialAngle(from, n);
  const a1 = dialAngle(from + delta, n);
  const large = delta / n > 0.5 ? 1 : 0;
  const pt = (a) => `${Math.round((c + radius * Math.cos(a)) * 100) / 100} ${Math.round((c + radius * Math.sin(a)) * 100) / 100}`;
  return `M${pt(a0)}A${radius} ${radius} 0 ${large} 1 ${pt(a1)}`;
}

/** The group view: a ruled circle of n ticks, 0 = O at the top, the accumulator's index in plot red. */
function createDial(holder) {
  const { size, c, R } = DIAL;
  const svg = svgEl('svg', { class: 'dial', viewBox: `0 0 ${size} ${size}`, role: 'img' });
  holder.append(svg);
  const ring = svgEl('g', {}, svg);
  const arcs = svgEl('g', { class: 'dial__arcs' }, svg);
  const current = svgEl('path', { class: 'dial__arc is-current' }, svg);
  const marker = svgEl('circle', { class: 'dial__marker', r: 6 }, svg);
  const index = svgEl('text', { class: 'dial__index', x: c, y: c + 4, 'text-anchor': 'middle' }, svg);
  const modulus = svgEl('text', { class: 'dial__modulus', x: c, y: c + 22, 'text-anchor': 'middle' }, svg);
  let n = 0;
  let arcKey = '';

  function setN(next) {
    n = next;
    arcKey = '';
    ring.replaceChildren();
    svgEl('circle', { class: 'dial__ring', cx: c, cy: c, r: R }, ring);
    for (let i = 0; i < n; i += 1) {
      const a = dialAngle(i, n);
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      svgEl('line', { class: 'dial__tick', x1: c + (R - 5) * cos, y1: c + (R - 5) * sin, x2: c + (R + 5) * cos, y2: c + (R + 5) * sin }, ring);
      const label = svgEl('text', { class: 'dial__label', x: c + (R + 17) * cos, y: c + (R + 17) * sin + 3.5, 'text-anchor': 'middle' }, ring);
      label.textContent = String(i);
    }
    // 0 is O, the identity: the boxed O of the sheet, printed inside the ring.
    // (Below the arcs, which run at radius R − 13, and above the index in the centre.)
    svgEl('rect', { class: 'dial__infinity', x: c - 8, y: c - R + 21, width: 16, height: 16 }, ring);
    const o = svgEl('text', { class: 'dial__infinity-mark', x: c, y: c - R + 33, 'text-anchor': 'middle' }, ring);
    o.textContent = 'O';
    modulus.textContent = `index mod ${n}`;
  }

  /** @param {{ arcs: { from: number, delta: number }[], from: number|null, delta: number, travel: number, alpha: number, index: number|null }} d */
  function draw(d) {
    const key = d.arcs.map((a) => `${a.from}+${a.delta}`).join(',');
    if (key !== arcKey) {
      arcKey = key;
      arcs.replaceChildren(...d.arcs.map((a) => svgEl('path', { class: 'dial__arc', d: arcPath(a.from, a.delta, n, R - 13) })));
    }
    if (d.from === null) {
      marker.style.display = 'none';
      current.style.display = 'none';
      index.textContent = '–';
      return;
    }
    const at = d.from + d.delta * d.travel;
    const a = dialAngle(at, n);
    marker.style.display = '';
    setAttrs(marker, { cx: c + R * Math.cos(a), cy: c + R * Math.sin(a), opacity: d.alpha });
    if (d.delta > 0 && d.travel > 0) {
      current.style.display = '';
      current.setAttribute('d', arcPath(d.from, d.delta * d.travel, n, R - 13));
    } else current.style.display = 'none';
    index.textContent = String(d.travel >= 1 ? mod(d.from + d.delta, n) : d.from);
  }

  return { svg, setN, draw };
}

/* ----------------------------------------------------------- controls */

const ICON = Object.freeze({
  play: '<path d="M4.5 2.75v10.5L13 8z" fill="currentColor"/>',
  pause: '<path d="M4.25 3h2.5v10h-2.5zM9.25 3h2.5v10h-2.5z" fill="currentColor"/>',
  back: '<path d="M3.5 3v10" stroke="currentColor" stroke-width="1.5"/><path d="M13 3.25v9.5L5.5 8z" fill="currentColor"/>',
  forward: '<path d="M12.5 3v10" stroke="currentColor" stroke-width="1.5"/><path d="M3 3.25v9.5L10.5 8z" fill="currentColor"/>',
  restart:
    '<path d="M12.6 9.6A4.75 4.75 0 1 1 11.2 4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8.9 2.2l3.6.4-.9 3.5z" fill="currentColor"/>',
});
const icon = (name) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

function choiceGroup(name, legend, options, checked) {
  const items = options
    .map(
      ([value, label]) =>
        `<div class="choice__option"><input type="radio" id="${name}-${value}" name="${name}" value="${value}"${value === checked ? ' checked' : ''} />` +
        `<label for="${name}-${value}">${label}</label></div>`,
    )
    .join('');
  return `<fieldset class="choice slowmo__${name.replace('slowmo-', '')}"><legend>${legend}</legend><div class="choice__options">${items}</div></fieldset>`;
}

function controlsHTML(baseOptions) {
  return (
    '<div class="slowmo__transport" role="group" aria-label="Playback of the construction">' +
    `<button type="button" class="form-button slowmo__play" data-slowmo-play aria-pressed="false"><span data-slowmo-play-icon>${icon('play')}</span>Play</button>` +
    `<button type="button" class="form-button" data-slowmo-back>${icon('back')}Step back</button>` +
    `<button type="button" class="form-button" data-slowmo-forward>${icon('forward')}Step forward</button>` +
    `<button type="button" class="form-button" data-slowmo-restart>${icon('restart')}Restart</button>` +
    '</div>' +
    '<div class="slowmo__params">' +
    '<div class="text-field slowmo__key"><label class="caption" for="slowmo-k">Private key</label>' +
    `<input id="slowmo-k" type="number" inputmode="numeric" min="1" max="${LIMITS.repeated}" step="1" value="${DEFAULT.k}" data-slowmo-k aria-describedby="slowmo-k-note slowmo-error" />` +
    `<p class="text-field__note" id="slowmo-k-note" data-slowmo-k-note>k from 1 to ${LIMITS.repeated}</p></div>` +
    '<div class="text-field text-field--select slowmo__base"><label class="caption" for="slowmo-base">Base point</label>' +
    `<select id="slowmo-base" data-slowmo-base>${baseOptions}</select></div>` +
    choiceGroup('slowmo-method', 'Method', [['repeated', 'Repeated addition'], ['double-and-add', 'Double-and-add']], DEFAULT.method) +
    choiceGroup('slowmo-view', 'View', [['flat', 'Flat sheet'], ['torus', 'Torus']], DEFAULT.view) +
    choiceGroup('slowmo-speed', 'Speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], DEFAULT.speed) +
    '<p class="slowmo__error" id="slowmo-error" role="alert" data-slowmo-error></p>' +
    '</div>'
  );
}

const PANEL_ROWS = Object.freeze([
  ['operands', 'Operands'],
  ['lambda', 'Slope'],
  ['inverse', 'Inverse'],
  ['nu', 'Intercept'],
  ['x3', 'Third point'],
  ['yPrime', ''],
  ['y3', 'Reflection'],
  ['result', 'Result'],
]);

/* Which rows of the arithmetic panel the drawing has reached. */
function rowsShown(op, pr) {
  if (!pr) return new Set(PANEL_ROWS.map(([key]) => key));
  const shown = new Set(['operands']);
  if (pr.line > 0) ['lambda', 'inverse', 'nu'].forEach((k) => shown.add(k));
  if (pr.third > 0) ['x3', 'yPrime'].forEach((k) => shown.add(k));
  if (pr.reflect > 0 || (op.line?.vertical && pr.land > 0)) shown.add('y3');
  if (pr.land >= 1) shown.add('result');
  return shown;
}

/* ------------------------------------------------------------- mount */

/**
 * Mounts Figure 4 when it comes near the viewport.
 * @param {HTMLElement} figure the [data-slowmo] figure
 */
export function mountSlowMo(figure) {
  whenNear(figure, () => {
    try {
      mountNow(figure);
    } catch (error) {
      console.error(error);
    }
  });
}

function mountNow(figure) {
  const stage = figure.querySelector('[data-slowmo-stage]');
  const side = figure.querySelector('[data-slowmo-side]');
  const controls = figure.querySelector('[data-slowmo-controls]');
  const consoleSlot = figure.querySelector('[data-slowmo-console]');
  const status = figure.querySelector('[data-slowmo-status]');
  if (!stage || !side || !controls || !consoleSlot) throw new Error('Slowed-down view: missing a [data-slowmo-*] slot.');

  const p = Number(TOY_CURVE.p);
  const s = latticeScale({ p, width: WIDTH });
  const r = Math.min(6, Math.max(3, s.step * 0.22));
  const box = infinityBox(s);
  const toyPoints = curvePoints(TOY_CURVE).map((P) => ({ x: Number(P.x), y: Number(P.y), order: Number(orderOf(TOY_CURVE, P)) }));
  const points = toyPoints.map(({ x, y }) => ({ x, y }));

  // The printed figure stays as the fallback for print; the live sheet is drawn beside it.
  const printed = document.createElement('div');
  printed.className = 'slowmo__static';
  printed.append(...stage.childNodes);
  const sheetEl = document.createElement('div');
  sheetEl.className = 'slowmo__sheet';
  stage.append(printed, sheetEl);
  const svgHolder = document.createElement('div');
  svgHolder.className = 'slowmo__svg-holder';
  sheetEl.append(svgHolder);
  const sheet = createSheet(svgHolder, { p, s, points, r, box });
  const canvas = document.createElement('canvas');
  canvas.className = 'slowmo__canvas';
  canvas.hidden = true;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-describedby', 'slowmo-canvas-help');
  const help = document.createElement('p');
  help.id = 'slowmo-canvas-help';
  help.className = 'visually-hidden';
  help.textContent = 'Drag the torus, or use the arrow keys while it has focus, to turn it; Home restores the initial view.';
  sheetEl.append(canvas, help);
  let torus = null; // created on first use

  // The margin column: the dial, the bits of k, the arithmetic.
  side.innerHTML =
    '<div class="slowmo__group"><p class="caption" id="slowmo-dial-title">Group view</p><div class="slowmo__dial" data-slowmo-dial></div></div>' +
    '<div class="slowmo__bits" data-slowmo-bits hidden><p class="caption">Bits of k, leading bit first</p><ol class="slowmo__bitlist" data-slowmo-bitlist></ol></div>' +
    '<div class="slowmo__arith" data-slowmo-arith><p class="slowmo__arith-head"><span data-slowmo-progress></span><span class="slowmo__arith-kind" data-slowmo-kind></span></p>' +
    '<p class="slowmo__arith-title" data-slowmo-title></p><dl class="slowmo__rows" data-slowmo-rows></dl></div>';
  const dial = createDial(side.querySelector('[data-slowmo-dial]'));
  const bitsBlock = side.querySelector('[data-slowmo-bits]');
  const bitList = side.querySelector('[data-slowmo-bitlist]');
  const progressText = side.querySelector('[data-slowmo-progress]');
  const kindText = side.querySelector('[data-slowmo-kind]');
  const titleText = side.querySelector('[data-slowmo-title]');
  const rowsEl = side.querySelector('[data-slowmo-rows]');

  consoleSlot.innerHTML =
    '<p class="caption" id="slowmo-transcript-title">Transcript</p>' +
    '<ol class="slowmo__transcript" data-slowmo-transcript aria-labelledby="slowmo-transcript-title" tabindex="0"></ol>';
  const transcript = consoleSlot.querySelector('[data-slowmo-transcript]');

  const baseOptions = toyPoints
    .map(({ x, y, order }) => `<option value="${x},${y}"${x === Number(TOY_BASE.x) && y === Number(TOY_BASE.y) ? ' selected' : ''}>(${x}, ${y}) — order ${order}</option>`)
    .join('');
  controls.innerHTML = controlsHTML(baseOptions);
  const playButton = controls.querySelector('[data-slowmo-play]');
  const playIcon = controls.querySelector('[data-slowmo-play-icon]');
  const backButton = controls.querySelector('[data-slowmo-back]');
  const forwardButton = controls.querySelector('[data-slowmo-forward]');
  const restartButton = controls.querySelector('[data-slowmo-restart]');
  const kInput = controls.querySelector('[data-slowmo-k]');
  const kNote = controls.querySelector('[data-slowmo-k-note]');
  const baseSelect = controls.querySelector('[data-slowmo-base]');
  const errorEl = controls.querySelector('[data-slowmo-error]');
  const checked = (name) => controls.querySelector(`input[name="${name}"]:checked`)?.value;

  /* --------------------------------------------------------- state */

  const state = {
    params: { k: DEFAULT.k, base: { x: Number(TOY_BASE.x), y: Number(TOY_BASE.y) }, method: DEFAULT.method },
    timeline: null,
    done: 0,
    anim: null,
    running: false,
    playing: false,
    rest: 0,
    speed: DEFAULT.speed,
    view: 'flat',
    t: 0,
    yaw: 0,
    pitch: 0,
    morph: null,
    dragging: null,
    visible: false,
    raf: 0,
    last: 0,
  };
  const total = () => state.timeline.ops.length;

  /* -------------------------------------------------------- render */

  function dialState(scene) {
    const { tl, done, op, pr } = scene;
    const n = tl.n;
    const arcs = [];
    for (let j = 0; j < done; j += 1) {
      const from = tl.states[j].index;
      if (from === null) continue;
      const delta = mod(tl.states[j + 1].index - from, n);
      if (delta > 0) arcs.push({ from, delta });
    }
    const from = tl.states[done].index;
    if (!op) return { arcs, from, delta: 0, travel: 0, alpha: 1 };
    if (from === null) {
      // Loading G: the marker appears on tick 1.
      return { arcs, from: op.index, delta: 0, travel: 0, alpha: pr.land > 0 ? (reducedMotion() ? 1 : easeOut(pr.land)) : 0 };
    }
    const delta = mod(op.index - from, n);
    const travel = reducedMotion() ? (pr.land > 0 ? 1 : 0) : easeOut(pr.land ?? 0);
    return { arcs, from, delta, travel, alpha: 1 };
  }

  let panelKey = '';
  let rowsKey = '';
  function drawPanel(scene) {
    const { tl, done, op, pr } = scene;
    const shownOp = op ?? (done > 0 ? tl.ops[done - 1] : null);
    const key = `${tl.k}|${tl.method}|${tl.base.x},${tl.base.y}|${shownOp ? shownOp.step : 0}|${scene.final}`;
    if (key !== panelKey) {
      panelKey = key;
      rowsKey = '';
      progressText.textContent = `Step ${op ? op.step : done} of ${total()}`;
      if (!shownOp) {
        kindText.textContent = 'Start';
        titleText.textContent = '';
        const intro =
          tl.method === 'repeated'
            ? `The accumulator holds <var>G</var> = ${coords(tl.base)}. Each operation adds <var>G</var> to it; Play runs the computation of ${multiple(tl.k)} slowly and Step forward runs one operation.`
            : `<var>k</var> = ${tl.k} is ${tl.bits} in binary. The leading bit loads <var>G</var>; each later bit doubles the accumulator, and a bit equal to 1 then adds <var>G</var>.`;
        rowsEl.innerHTML = `<div class="is-shown"><dt>Start</dt><dd>${intro}</dd></div>`;
      } else {
        kindText.textContent = shownOp.kindLabel;
        titleText.textContent = shownOp.kind === 'load' ? 'Load G' : `${shownOp.title} = ${multiple(shownOp.k)}`;
        const rows = PANEL_ROWS.filter(([k]) => shownOp.formulas[k]).map(
          ([k, label]) => `<div data-row="${k}"><dt>${label}</dt><dd>${shownOp.formulas[k]}</dd></div>`,
        );
        if (scene.final) {
          const verdict =
            tl.result === null
              ? `${multiple(tl.resultK)} = O, the point at infinity: not a valid public key, since ${tl.resultK} is a multiple of the order of <var>G</var>, <var>n</var> = ${tl.n}.`
              : `<var>Q</var> = ${multiple(tl.resultK)} = ${coords(tl.result)} is the toy public key.`;
          rows.push(`<div data-row="final" class="is-final"><dt>Public key</dt><dd>${verdict}</dd></div>`);
        }
        rowsEl.innerHTML = rows.join('');
      }
    }
    if (!shownOp) return;
    const shown = op ? rowsShown(op, pr) : rowsShown(shownOp, null);
    const rk = [...shown].join(',');
    if (rk === rowsKey) return;
    rowsKey = rk;
    for (const row of rowsEl.children) {
      const name = row.dataset.row;
      row.classList.toggle('is-shown', !name || name === 'final' || shown.has(name));
    }
  }

  let bitsKey = '';
  function drawBits(scene) {
    const { tl, done, op } = scene;
    if (!tl.bits) return;
    const current = op ? op.bitIndex : done > 0 ? tl.ops[done - 1].bitIndex : -1;
    const key = `${tl.bits}|${current}`;
    if (key === bitsKey) return;
    bitsKey = key;
    [...bitList.children].forEach((li, i) => {
      li.classList.toggle('is-read', i <= current);
      li.classList.toggle('is-current', i === current);
    });
  }

  function render() {
    const tl = state.timeline;
    const rm = reducedMotion();
    const scene = sceneOf(tl, state.done, state.anim, rm);
    scene.infinity = box;
    sheet.draw(scene);
    if (torus && (state.view === 'torus' || state.morph || state.t > 0)) {
      torus.draw(scene, { t: state.t, yaw: state.yaw, pitch: state.pitch });
    }
    dial.draw(dialState(scene));
    drawPanel(scene);
    drawBits(scene);
  }

  /* --------------------------------------------- the slower changes */

  function stateText() {
    const tl = state.timeline;
    const st = tl.states[state.done];
    const acc = st.point === undefined ? 'empty' : `${multiple(st.k)} = ${coords(st.point)}`;
    return `Step ${state.done} of ${total()} of the computation of ${multiple(tl.k)} from G = ${coords(tl.base)} by ${METHOD_NAME[tl.method]}; the accumulator is ${acc}.`;
  }

  function syncTranscript() {
    const tl = state.timeline;
    const items = [];
    if (tl.method === 'repeated') items.push({ text: `G = ${coords(tl.base)}` });
    for (let j = 0; j < state.done; j += 1) {
      const op = tl.ops[j];
      items.push({ text: op.kind === 'load' ? `G = ${coords(op.result)}   leading bit 1` : op.text });
    }
    if (state.done === total()) {
      items.push({
        text:
          tl.result === null
            ? `${multiple(tl.resultK)} = O: not a valid public key, ${tl.resultK} is a multiple of n = ${tl.n}`
            : `TOY PUBLIC KEY: Q = ${multiple(tl.resultK)} = ${coords(tl.result)}`,
        strong: true,
      });
    }
    const existing = [...transcript.children];
    items.forEach((item, i) => {
      const li = existing[i] ?? transcript.appendChild(document.createElement('li'));
      if (li.textContent !== item.text || li.classList.contains('is-final') !== Boolean(item.strong)) {
        li.className = item.strong ? 'is-final' : '';
        li.replaceChildren(item.strong ? Object.assign(document.createElement('strong'), { textContent: item.text }) : document.createTextNode(item.text));
      }
    });
    for (const li of existing.slice(items.length)) li.remove();
    transcript.scrollTop = transcript.scrollHeight;
  }

  function syncStatic() {
    const S = total();
    backButton.disabled = state.done === 0 && !state.anim;
    forwardButton.disabled = state.done === S && !state.anim;
    playButton.setAttribute('aria-pressed', String(state.playing));
    playIcon.innerHTML = icon(state.playing ? 'pause' : 'play');
    const text = stateText();
    sheet.desc.textContent = text;
    canvas.setAttribute('aria-label', `The lattice glued into a torus. ${text}`);
    dial.svg.setAttribute('aria-label', `Group view: ${state.timeline.states[state.done].index === null ? 'no index yet' : `the accumulator has index ${state.timeline.states[state.done].index} modulo ${state.timeline.n}`}.`);
    syncTranscript();
  }

  /* -------------------------------------------------------- the clock */

  const spinning = () => state.view === 'torus' && !state.morph && state.playing && !state.dragging && !reducedMotion();
  const moving = () => state.running || state.playing || Boolean(state.morph) || spinning();

  function requestFrame() {
    if (!state.raf && state.visible) state.raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    state.raf = 0;
    const dt = state.last ? Math.min(64, now - state.last) : 16;
    state.last = now;
    advance(dt);
    render();
    if (state.visible && moving()) state.raf = requestAnimationFrame(tick);
    else state.last = 0;
  }

  function advance(dt) {
    if (state.morph) advanceMorph(dt);
    if (spinning()) state.yaw += (SPIN_RAD_PER_S * dt) / 1000;
    const factor = SPEED[state.speed];
    if (state.anim && state.running) {
      state.anim.elapsed += dt / factor;
      if (state.anim.elapsed >= operationMs(state.timeline.ops[state.anim.index])) complete();
    } else if (state.playing && !state.anim) {
      if (state.done >= total()) stopPlaying();
      else {
        state.rest -= dt / factor;
        if (state.rest <= 0) begin();
      }
    }
  }

  function begin() {
    state.anim = { index: state.done, elapsed: 0 };
    state.running = true;
    syncStatic();
  }

  function complete() {
    const op = state.timeline.ops[state.anim.index];
    state.done += 1;
    state.anim = null;
    state.rest = REST_MS;
    if (!state.playing) state.running = false;
    const S = total();
    let text;
    if (op.kind === 'load') text = `Step ${state.done} of ${S}: the leading bit 1 loads G = ${coords(op.result)}.`;
    else text = `Step ${state.done} of ${S}: ${op.title} gives ${multiple(op.k)} = ${op.result ? coords(op.result) : 'O, the point at infinity'}.`;
    if (state.done === S) {
      const tl = state.timeline;
      text += tl.result === null ? ' The result O is not a valid public key.' : ` This is the toy public key Q = ${multiple(tl.resultK)}.`;
      if (state.playing) stopPlaying();
    }
    announceTo(status, text);
    syncStatic();
  }

  function stopPlaying() {
    state.playing = false;
    state.running = false;
    syncStatic();
  }

  /* --------------------------------------------------------- transport */

  function play() {
    if (state.playing) {
      state.playing = false;
      state.running = false; // an operation under way freezes where it is
      announceTo(status, `Paused at step ${state.done} of ${total()}.`);
    } else {
      if (state.done >= total() && !state.anim) {
        state.done = 0;
        blink(stage);
      }
      state.playing = true;
      state.running = true;
      state.rest = 0;
      announceTo(status, `Playing the ${total()} operations of the computation of ${multiple(state.timeline.k)}.`);
    }
    syncStatic();
    render();
    requestFrame();
  }

  function stepForward() {
    if (state.anim && state.running) {
      state.playing = false;
      complete();
      state.running = false;
    } else if (state.anim) {
      state.running = true; // finish the operation that was paused half-way
    } else if (state.done < total()) {
      state.playing = false;
      begin();
    }
    syncStatic();
    render();
    requestFrame();
  }

  function stepBack() {
    state.playing = false;
    state.running = false;
    if (state.anim) state.anim = null;
    else state.done = Math.max(0, state.done - 1);
    blink(stage);
    announceTo(status, `Back to step ${state.done} of ${total()}. ${stateText()}`);
    syncStatic();
    render();
  }

  function restart() {
    state.done = 0;
    state.anim = null;
    state.rest = 0;
    state.running = state.playing;
    blink(stage);
    announceTo(status, `Restarted at step 0 of ${total()}.`);
    syncStatic();
    render();
    requestFrame();
  }

  /* -------------------------------------------------------- parameters */

  function rebuild({ speak = true, startAt = 'start' } = {}) {
    const { k, base, method } = state.params;
    const tl = buildTimeline({ base, k, method });
    state.timeline = tl;
    state.done = startAt === 'end' ? tl.ops.length : 0;
    state.anim = null;
    state.rest = 0;
    state.running = state.playing;
    dial.setN(tl.n);
    bitsBlock.hidden = !tl.bits;
    bitList.replaceChildren(
      ...(tl.bits ?? '').split('').map((b) => Object.assign(document.createElement('li'), { className: 'slowmo__bit', textContent: b })),
    );
    bitList.setAttribute('aria-label', tl.bits ? `k = ${tl.k} in binary: ${tl.bits}` : '');
    bitsKey = '';
    panelKey = '';
    syncStatic();
    render();
    if (speak) {
      blink(stage);
      blink(side);
      announceTo(status, `New computation of ${multiple(k)} from G = ${coords(tl.base)} by ${METHOD_NAME[method]}: ${tl.ops.length} operations. Step 0 of ${tl.ops.length}.`);
    }
    requestFrame();
  }

  function limitOf(method) {
    return method === 'repeated' ? LIMITS.repeated : LIMITS.doubleAndAdd;
  }

  function readKey() {
    const method = state.params.method;
    const limit = limitOf(method);
    const v = Number(kInput.value);
    if (!Number.isInteger(v) || v < 1 || v > limit) {
      kInput.setAttribute('aria-invalid', 'true');
      errorEl.textContent =
        method === 'repeated'
          ? `k must be a whole number from 1 to ${limit} for repeated addition, which replays one operation per multiple; choose double-and-add for keys up to ${LIMITS.doubleAndAdd}.`
          : `k must be a whole number from 1 to ${limit}.`;
      return null;
    }
    kInput.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    return v;
  }

  kInput.addEventListener('change', () => {
    const k = readKey();
    if (k === null || k === state.params.k) return;
    state.params.k = k;
    rebuild();
  });
  kInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      kInput.dispatchEvent(new Event('change'));
    }
  });
  baseSelect.addEventListener('change', () => {
    const [x, y] = baseSelect.value.split(',').map(Number);
    state.params.base = { x, y };
    rebuild();
  });
  controls.addEventListener('change', (event) => {
    const { name } = event.target;
    if (name === 'slowmo-method') {
      const method = checked('slowmo-method');
      if (!METHODS.includes(method)) return;
      state.params.method = method;
      const limit = limitOf(method);
      kInput.max = String(limit);
      kNote.textContent = `k from 1 to ${limit}`;
      if (state.params.k > limit) {
        state.params.k = limit;
        kInput.value = String(limit);
        kNote.textContent = `k from 1 to ${limit}; k was set to ${limit}, the largest key replayed by repeated addition.`;
      }
      const k = readKey();
      if (k !== null) state.params.k = k;
      rebuild();
    } else if (name === 'slowmo-speed') {
      state.speed = checked('slowmo-speed') in SPEED ? checked('slowmo-speed') : 'slow';
    } else if (name === 'slowmo-view') {
      setView(checked('slowmo-view') === 'torus' ? 'torus' : 'flat');
    }
  });
  playButton.addEventListener('click', play);
  forwardButton.addEventListener('click', stepForward);
  backButton.addEventListener('click', stepBack);
  restartButton.addEventListener('click', restart);

  /* ------------------------------------------------------- the torus */

  function ensureTorus() {
    if (torus) return torus;
    torus = createTorusRenderer(canvas, { p, scale: s, points });
    resizeCanvas();
    return torus;
  }

  function resizeCanvas() {
    if (!torus) return;
    const width = sheetEl.getBoundingClientRect().width;
    if (width > 0) torus.resize(width);
  }

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    ensureTorus();
    const rm = reducedMotion();
    sheetEl.classList.toggle('is-crossfade', rm);
    if (view === 'torus') {
      canvas.hidden = false;
      resizeCanvas();
      if (rm) {
        state.morph = null;
        state.t = 1;
        state.yaw = TORUS_VIEW.yaw;
        state.pitch = TORUS_VIEW.pitch;
        sheet.setChrome(0);
        render();
        canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
      } else {
        startMorph(1, TORUS_VIEW);
        render(); // at t = 0 the canvas repeats the SVG exactly, so the swap shows no jump
      }
      sheetEl.classList.add('is-torus');
      announceTo(status, 'Torus view: opposite edges of the sheet are glued, so each line modulo 17 becomes one closed curve and the mirror line becomes the outer equator.');
    } else {
      if (rm) {
        state.morph = null;
        state.t = 0;
        state.yaw = 0;
        state.pitch = 0;
        sheetEl.classList.remove('is-torus');
        sheet.setChrome(1);
        const fade = canvas.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'linear' });
        const hide = () => {
          if (state.view === 'flat') canvas.hidden = true;
        };
        if (fade) fade.addEventListener('finish', hide);
        else hide();
        render();
      } else {
        // Wind the spin back to the nearest turn, so the sheet unrolls facing the reader.
        state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));
        startMorph(0, { yaw: 0, pitch: 0 });
      }
      announceTo(status, 'Flat sheet view.');
    }
    requestFrame();
  }

  function startMorph(to, endView) {
    const from = state.t;
    state.morph = {
      from,
      to,
      u: 0,
      duration: Math.max(300, MORPH_MS * Math.abs(to - from)),
      start: { yaw: state.yaw, pitch: state.pitch },
      end: endView,
    };
  }

  function advanceMorph(dt) {
    const m = state.morph;
    m.u = Math.min(1, m.u + dt / m.duration);
    const e = easeInOut(m.u);
    state.t = lerp(m.from, m.to, e);
    state.yaw = lerp(m.start.yaw, m.end.yaw, e);
    state.pitch = lerp(m.start.pitch, m.end.pitch, e);
    sheet.setChrome(1 - clamp01(state.t * 4));
    if (m.u >= 1) {
      state.morph = null;
      state.t = m.to;
      if (m.to === 0 && state.view === 'flat') {
        canvas.hidden = true;
        sheetEl.classList.remove('is-torus');
        sheet.setChrome(1);
      }
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (state.view !== 'torus' || state.morph) return;
    state.dragging = { x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    const d = state.dragging;
    if (!d || event.pointerId !== d.id) return;
    state.yaw = d.yaw + (event.clientX - d.x) * 0.01;
    state.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, d.pitch + (event.clientY - d.y) * 0.008));
    render();
  });
  const endDrag = () => {
    state.dragging = null;
    canvas.classList.remove('is-dragging');
    requestFrame();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (event) => {
    if (state.view !== 'torus' || state.morph) return;
    const step = event.shiftKey ? 0.3 : 0.1;
    if (event.key === 'ArrowLeft') state.yaw -= step;
    else if (event.key === 'ArrowRight') state.yaw += step;
    else if (event.key === 'ArrowUp') state.pitch = Math.max(-PITCH_LIMIT, state.pitch - step);
    else if (event.key === 'ArrowDown') state.pitch = Math.min(PITCH_LIMIT, state.pitch + step);
    else if (event.key === 'Home') Object.assign(state, { yaw: TORUS_VIEW.yaw, pitch: TORUS_VIEW.pitch });
    else return;
    event.preventDefault();
    render();
  });

  /* ------------------------------------------------------------ start */

  // The live figure opens on the state the printed figure shows: the computation completed.
  rebuild({ speak: false, startAt: 'end' });
  side.hidden = false;
  controls.hidden = false;
  consoleSlot.hidden = false;
  figure.classList.add('is-live');

  trackVisibility(figure, (visible) => {
    state.visible = visible;
    if (visible) requestFrame();
  });
  if ('ResizeObserver' in globalThis) {
    let last = 0;
    new ResizeObserver(() => {
      const width = Math.round(sheetEl.getBoundingClientRect().width);
      if (Math.abs(width - last) > 1) {
        last = width;
        resizeCanvas();
        if (torus && state.view === 'torus') render();
      }
    }).observe(sheetEl);
  }
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => render());
}

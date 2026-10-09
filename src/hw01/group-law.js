/**
 * The group law of y² = x³ + 7 over the real numbers, drawn as the chord-and-
 * tangent construction: the line through P and Q meets the curve in a third
 * point, and P + Q is its reflection in the x-axis; the tangent at P gives 2P.
 *
 * `renderGroupLawSVG` is pure (used at build time for the static figure);
 * `mountGroupLaw` adds the controls, dragging and the animated construction.
 */

const B = 7;
/** Leftmost real point of the curve, x = −∛7. */
export const X_MIN = -Math.cbrt(B);
const X_MAX = 4;
const Y_MAX = 9;
const VIEW = { x0: -3, x1: X_MAX, y0: -Y_MAX, y1: Y_MAX };

/**
 * The non-negative root y of y² = x³ + 7. At the cusp x = X_MIN the radicand
 * rounds slightly below zero in floating point, so it is clamped at zero: the
 * cusp is the point (X_MIN, 0), never NaN.
 */
export function curveY(x) {
  return Math.sqrt(Math.max(0, x * x * x + B));
}

/** A point on the curve at abscissa x, on the upper (sign > 0) or lower branch. */
export function pointAt(x, sign = 1) {
  return { x, y: sign * curveY(x) };
}

export const PRESET = Object.freeze({ P: pointAt(-1), Q: pointAt(2) });

/**
 * The construction for P + Q (mode 'add') or 2P (mode 'double').
 * Returns the slope of the line, the third intersection and the result, or
 * `infinity: true` when the line is vertical (P + (−P) = O).
 */
export function construct({ P, Q, mode }) {
  if (mode === 'double' || (P.x === Q.x && P.y === Q.y)) {
    if (P.y === 0) return { mode: 'double', infinity: true, vertical: P.x };
    const slope = (3 * P.x * P.x) / (2 * P.y);
    const x3 = slope * slope - 2 * P.x;
    const y3 = P.y + slope * (x3 - P.x);
    return { mode: 'double', slope, third: { x: x3, y: y3 }, result: { x: x3, y: -y3 } };
  }
  if (Math.abs(P.x - Q.x) < 1e-9) return { mode: 'add', infinity: true, vertical: P.x };
  const slope = (Q.y - P.y) / (Q.x - P.x);
  const x3 = slope * slope - P.x - Q.x;
  const y3 = P.y + slope * (x3 - P.x);
  return { mode: 'add', slope, third: { x: x3, y: y3 }, result: { x: x3, y: -y3 } };
}

const fmt = (v) => (v < 0 ? `−${(-v).toFixed(2)}` : v.toFixed(2));

/** Human-readable statement of the construction's result. */
export function describe(c) {
  const name = c.mode === 'double' ? '2P' : 'P + Q';
  if (c.infinity) return `${name} = O, the point at infinity: the line is vertical and meets the curve nowhere else.`;
  return `${name} = (${fmt(c.result.x)}, ${fmt(c.result.y)}): the line of slope ${fmt(c.slope)} meets the curve again at (${fmt(c.third.x)}, ${fmt(c.third.y)}), which is reflected in the x-axis.`;
}

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Pure SVG of the construction.
 * @param {{ P: {x:number,y:number}, Q: {x:number,y:number}, mode: 'add'|'double', width?: number, height?: number, id: string }} options
 */
export function renderGroupLawSVG({ P, Q, mode = 'add', width = 960, height = 520, id }) {
  const c = construct({ P, Q, mode });
  const margin = { top: 14, right: 18, bottom: 34, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (x) => margin.left + ((x - VIEW.x0) / (VIEW.x1 - VIEW.x0)) * plotW;
  const sy = (y) => margin.top + ((VIEW.y1 - y) / (VIEW.y1 - VIEW.y0)) * plotH;
  const r = (v) => Math.round(v * 10) / 10;
  const out = [];
  const name = mode === 'double' ? '2P' : 'P + Q';
  const title = `Chord-and-tangent construction of ${name} on y² = x³ + 7 over the real numbers`;
  out.push(
    `<svg class="gl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escape(title)}</title><desc id="${id}-desc">${escape(describe(c))}</desc>`,
    `<defs><clipPath id="${id}-clip"><rect x="${margin.left}" y="${margin.top}" width="${r(plotW)}" height="${r(plotH)}"/></clipPath></defs>`,
  );

  // Rulings at integers, axes in green ink.
  out.push('<g class="gl__rulings" aria-hidden="true">');
  for (let x = Math.ceil(VIEW.x0); x <= VIEW.x1; x += 1) {
    out.push(`<line class="gl__ruling${x === 0 ? ' is-axis' : ''}" x1="${r(sx(x))}" x2="${r(sx(x))}" y1="${margin.top}" y2="${r(margin.top + plotH)}"/>`);
  }
  for (let y = Math.ceil(VIEW.y0); y <= VIEW.y1; y += 1) {
    out.push(`<line class="gl__ruling${y === 0 ? ' is-axis' : ''}" x1="${margin.left}" x2="${r(margin.left + plotW)}" y1="${r(sy(y))}" y2="${r(sy(y))}"/>`);
  }
  out.push(`<rect class="gl__frame" x="${margin.left}" y="${margin.top}" width="${r(plotW)}" height="${r(plotH)}"/>`);
  for (let x = Math.ceil(VIEW.x0); x <= VIEW.x1; x += 1) {
    out.push(`<text class="gl__label" x="${r(sx(x))}" y="${r(margin.top + plotH + 16)}" text-anchor="middle">${x}</text>`);
  }
  for (let y = -8; y <= 8; y += 4) {
    out.push(`<text class="gl__label" x="${margin.left - 7}" y="${r(sy(y))}" text-anchor="end" dominant-baseline="middle">${y < 0 ? `−${-y}` : y}</text>`);
  }
  out.push('</g>');

  // The curve: upper branch right to left, lower branch left to right.
  const steps = 240;
  const upper = [];
  const lower = [];
  for (let i = 0; i <= steps; i += 1) {
    // Denser sampling near the cusp at X_MIN, where the branches meet vertically;
    // the first sample (t = 0) is the cusp itself, (X_MIN, 0).
    const t = i / steps;
    const x = X_MIN + (X_MAX - X_MIN) * t * t;
    const y = curveY(x);
    upper.push(`${r(sx(x))},${r(sy(y))}`);
    lower.push(`${r(sx(x))},${r(sy(-y))}`);
  }
  out.push(
    `<g clip-path="url(#${id}-clip)" aria-hidden="true">`,
    `<path class="gl__curve" d="M${upper.reverse().join('L')}L${lower.join('L')}"/>`,
  );

  // The construction line, extended across the sheet.
  if (c.infinity) {
    out.push(`<line class="gl__chord" id="${id}-chord" x1="${r(sx(c.vertical))}" x2="${r(sx(c.vertical))}" y1="${margin.top}" y2="${r(margin.top + plotH)}"/>`);
  } else {
    const yAt = (x) => P.y + c.slope * (x - P.x);
    out.push(`<line class="gl__chord" id="${id}-chord" x1="${r(sx(VIEW.x0))}" y1="${r(sy(yAt(VIEW.x0)))}" x2="${r(sx(VIEW.x1))}" y2="${r(sy(yAt(VIEW.x1)))}"/>`);
    out.push(`<circle class="gl__third" id="${id}-third" cx="${r(sx(c.third.x))}" cy="${r(sy(c.third.y))}" r="5"/>`);
    out.push(`<line class="gl__drop" id="${id}-drop" x1="${r(sx(c.third.x))}" y1="${r(sy(c.third.y))}" x2="${r(sx(c.result.x))}" y2="${r(sy(c.result.y))}"/>`);
    out.push(`<g class="gl__result" id="${id}-result"><circle cx="${r(sx(c.result.x))}" cy="${r(sy(c.result.y))}" r="5.5"/>`);
    out.push(`<text class="gl__name" x="${r(sx(c.result.x) + 10)}" y="${r(sy(c.result.y) + 4)}">${name}</text></g>`);
  }
  out.push('</g>');

  // Handles for P and Q (Q only in the addition).
  const handles = mode === 'double' ? [['P', P]] : [['P', P], ['Q', Q]];
  out.push('<g class="gl__handles">');
  for (const [label, pt] of handles) {
    const x = r(sx(pt.x));
    const y = r(sy(pt.y));
    out.push(
      `<g class="gl__handle" data-gl-handle="${label}" tabindex="0" role="slider" aria-label="Point ${label}, drag along the curve" aria-valuemin="${X_MIN.toFixed(2)}" aria-valuemax="${(X_MAX - 0.2).toFixed(2)}" aria-valuenow="${pt.x.toFixed(2)}" aria-valuetext="${label} = (${fmt(pt.x)}, ${fmt(pt.y)})">`,
      `<circle class="gl__handle-hit" cx="${x}" cy="${y}" r="16"/>`,
      `<circle class="gl__handle-mark" cx="${x}" cy="${y}" r="5.5"/>`,
      `<text class="gl__name" x="${x - 10}" y="${y - 10}" text-anchor="end">${label}</text></g>`,
    );
  }
  out.push('</g></svg>');
  return out.join('');
}

/* ------------------------------------------------------------------ DOM ---- */

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function drawLine(line, { delay = 0, duration = 500 } = {}) {
  if (!line) return;
  const len = Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value);
  line.style.strokeDasharray = `${len}`;
  const anim = line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay, easing: EASE_OUT, fill: 'backwards' });
  anim.onfinish = () => {
    line.style.strokeDasharray = '';
  };
}

/**
 * Mounts the figure: `[data-gl-canvas]` holds the SVG, `[data-gl-mode]`
 * buttons choose the construction, `[data-gl-status]` announces results.
 * @param {HTMLElement} figure
 */
export function mountGroupLaw(figure) {
  const canvas = figure.querySelector('[data-gl-canvas]');
  if (!canvas) throw new Error('Group law figure: missing [data-gl-canvas].');
  const id = canvas.dataset.id || 'gl';
  const status = figure.querySelector('[data-gl-status]');
  const state = { P: { ...PRESET.P }, Q: { ...PRESET.Q }, mode: canvas.dataset.mode === 'double' ? 'double' : 'add' };
  const resultEl = figure.querySelector('[data-gl-result]');

  function size() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.round(rect.width));
    return { width, height: Math.round(Math.min(560, Math.max(300, width * 0.54))) };
  }

  function announce(c) {
    const text = describe(c);
    if (status) status.textContent = text;
    if (resultEl) resultEl.textContent = text;
  }

  function render() {
    canvas.innerHTML = renderGroupLawSVG({ ...state, ...size(), id });
    bindHandles();
  }

  function animateConstruction() {
    const chord = canvas.querySelector(`#${id}-chord`);
    const third = canvas.querySelector(`#${id}-third`);
    const drop = canvas.querySelector(`#${id}-drop`);
    const result = canvas.querySelector(`#${id}-result`);
    if (prefersReducedMotion()) {
      for (const el of [chord, third, drop, result]) el?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    drawLine(chord, { duration: 520 });
    third?.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, delay: 460, easing: EASE_OUT, fill: 'backwards' });
    drawLine(drop, { delay: 640, duration: 300 });
    result?.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, delay: 880, easing: EASE_OUT, fill: 'backwards' });
  }

  function update({ animate = true } = {}) {
    render();
    const c = construct(state);
    if (animate) animateConstruction();
    announce(c);
  }

  // Pointer position → abscissa on the curve, keeping the branch of the pointer's side.
  function curvePointFromEvent(event) {
    const svg = canvas.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const { width, height } = size();
    const margin = { top: 14, right: 18, bottom: 34, left: 44 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const py = ((event.clientY - rect.top) / rect.height) * height;
    const x = VIEW.x0 + ((px - margin.left) / plotW) * (VIEW.x1 - VIEW.x0);
    const y = VIEW.y1 - ((py - margin.top) / plotH) * (VIEW.y1 - VIEW.y0);
    const clamped = Math.min(X_MAX - 0.2, Math.max(X_MIN + 0.002, x));
    return pointAt(clamped, y < 0 ? -1 : 1);
  }

  function separate(label) {
    // Keep P and Q apart, except when the user deliberately lines them up vertically.
    const other = label === 'P' ? state.Q : state.P;
    const mine = state[label];
    if (Math.abs(mine.x - other.x) < 0.03) {
      mine.x = other.x;
      mine.y = Math.sign(mine.y || 1) * curveY(mine.x);
    }
  }

  function bindHandles() {
    for (const handle of canvas.querySelectorAll('[data-gl-handle]')) {
      const label = handle.dataset.glHandle;
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const move = (e) => {
          state[label] = curvePointFromEvent(e);
          separate(label);
          render();
          // The re-rendered SVG replaced the handle; keep capturing on the new node.
          canvas.querySelector(`[data-gl-handle="${label}"]`)?.setPointerCapture(e.pointerId);
        };
        const up = () => {
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          canvas.removeEventListener('pointercancel', up);
          update({ animate: false });
          canvas.querySelector(`[data-gl-handle="${label}"]`)?.focus({ preventScroll: true });
        };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
      });
      handle.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 0.5 : 0.1;
        let dx = 0;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') dx = step;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') dx = -step;
        if (!dx) return;
        event.preventDefault();
        const pt = state[label];
        const x = Math.min(X_MAX - 0.2, Math.max(X_MIN + 0.002, pt.x + dx));
        state[label] = pointAt(x, Math.sign(pt.y || 1));
        separate(label);
        update({ animate: false });
        canvas.querySelector(`[data-gl-handle="${label}"]`)?.focus({ preventScroll: true });
      });
    }
  }

  for (const button of figure.querySelectorAll('[data-gl-mode]')) {
    button.addEventListener('click', () => {
      state.mode = button.dataset.glMode === 'double' ? 'double' : 'add';
      for (const b of figure.querySelectorAll('[data-gl-mode]')) b.setAttribute('aria-pressed', String(b === button));
      update();
    });
  }
  figure.querySelector('[data-gl-reset]')?.addEventListener('click', () => {
    state.P = { ...PRESET.P };
    state.Q = { ...PRESET.Q };
    update();
  });

  render();
  announce(construct(state));
  if ('ResizeObserver' in globalThis) {
    let last = size().width;
    new ResizeObserver(() => {
      const w = size().width;
      if (Math.abs(w - last) > 1) {
        last = w;
        render();
      }
    }).observe(canvas);
  }
  for (const controls of figure.querySelectorAll('[data-gl-controls]')) controls.hidden = false;
  figure.classList.add('is-live');
  return { replay: () => update() };
}

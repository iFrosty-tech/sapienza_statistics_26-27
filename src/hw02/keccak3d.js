/**
 * Figure 5, the Keccak-f[1600] state in three dimensions: a canvas drawing
 * of the 5 × 5 × 64 lattice in orthographic projection, the bits that differ
 * between the two traced states in plot red. Dragging, or the arrow keys
 * when the drawing has focus, turn it; the checkpoint control walks the
 * trace (input, then θ ρ π χ ι of rounds 1 to 3) and "Play" steps through it
 * with the marks fading between masks.
 *
 * A slow idle rotation runs only while the figure is on screen, the tab is
 * visible, the reader has not turned the lattice, and reduced motion is off;
 * the animation loop stops whenever none of its reasons holds. The printed
 * SVG remains as the fallback and is hidden only after the canvas has drawn.
 */

import { clampPitch, decodeMask, depthOrder, fitScale, latticePoints, maskTransition, project } from './lattice.js';
import { announce, blink, reducedMotion, trackVisibility } from './motion.js';

const DEFAULT_VIEW = Object.freeze({ yaw: -0.5, pitch: 0.38 });
const STEP_MS = 600;
const FADE_MS = 300;
const IDLE_SPEED = 0.00012; // radians per millisecond, about one turn in 52 s
const PAD = 22;

const STEP_NAME = Object.freeze({ input: 'the input', theta: 'θ', rho: 'ρ', pi: 'π', chi: 'χ', iota: 'ι' });

function describeStep(step) {
  if (step.step === 'input') return `Input: ${step.count} of 1600 bits differ`;
  return `${step.label}: ${step.count} of 1600 bits differ`;
}

export function mountKeccak3d(figure) {
  const holder = figure.querySelector('[data-keccak3d-canvas]');
  const traceScript = holder?.querySelector('[data-keccak3d-trace]');
  const frame = holder?.querySelector('.lattice-frame');
  if (!traceScript || !frame) throw new Error('Keccak lattice: missing the trace or the printed lattice.');
  const trace = JSON.parse(traceScript.textContent);
  const masks = trace.steps.map((s) => decodeMask(s.mask));
  const points = latticePoints();
  const status = figure.querySelector('[data-keccak3d-status]');
  const controls = figure.querySelector('[data-keccak3d-controls]');
  const range = figure.querySelector('[data-keccak3d-step]');
  const readout = figure.querySelector('[data-keccak3d-readout]');
  const playButton = figure.querySelector('[data-keccak3d-play]');
  const prev = figure.querySelector('[data-keccak3d-prev]');
  const next = figure.querySelector('[data-keccak3d-next]');

  const canvas = document.createElement('canvas');
  canvas.className = 'lattice-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-describedby', 'keccak3d-help');
  const help = document.createElement('p');
  help.id = 'keccak3d-help';
  help.className = 'visually-hidden';
  help.textContent = 'Drag the drawing, or use the arrow keys while it has focus, to turn the lattice; Home restores the initial view.';
  frame.after(canvas, help);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Keccak lattice: no 2D canvas context.');

  const view = { ...DEFAULT_VIEW };
  const state = {
    index: Math.max(0, trace.steps.findIndex((s) => s.label === trace.shown)),
    from: null, // mask faded from, during a transition
    t0: 0,
    playing: false,
    playTimer: 0,
    interacted: false,
    visible: false,
    raf: 0,
    lastTime: 0,
    size: { width: 0, height: 0, dpr: 1, scale: 1 },
  };
  const colours = {};
  let order = depthOrder(points, view.yaw, view.pitch);
  let orderKey = '';

  function readColours() {
    const css = getComputedStyle(figure);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    colours.plot = v('--plot', '#d0462f');
    colours.ruling = v('--ruling', '#9cc3ae');
    colours.label = v('--ruling-ink', '#3a6b54');
    colours.axis = v('--ink-faint', '#5d6a63');
    colours.font = v('--font-form', 'sans-serif');
  }

  function resize() {
    const width = Math.max(240, Math.round(holder.getBoundingClientRect().width));
    const height = Math.round(Math.min(400, Math.max(240, width * 0.5)));
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    state.size = { width, height, dpr, scale: fitScale(width, height, PAD) };
  }

  function axis(from, to, label) {
    const { width, height, scale } = state.size;
    const v = { ...view, scale, cx: width / 2, cy: height / 2 };
    const a = project(from, v);
    const b = project(to, v);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const off = len > 8 ? 10 : 0;
    ctx.fillText(label, b.x + (len ? (dx / len) * off : 6), b.y + (len ? (dy / len) * off : -6));
  }

  /** Paints one frame; t ∈ [0, 1] is the progress of the current fade. */
  function draw(t = 1) {
    const { width, height, dpr, scale } = state.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const key = `${view.yaw.toFixed(4)},${view.pitch.toFixed(4)}`;
    if (key !== orderKey) {
      order = depthOrder(points, view.yaw, view.pitch);
      orderKey = key;
    }
    const to = masks[state.index];
    const alpha = state.from ? maskTransition(state.from, to, t) : to;
    const v = { ...view, scale, cx: width / 2, cy: height / 2 };
    const rFaint = Math.max(0.9, scale * 0.11);
    const rMark = Math.max(1.7, scale * 0.2);

    ctx.lineWidth = 1;
    ctx.strokeStyle = colours.axis;
    ctx.fillStyle = colours.label;
    ctx.font = `600 11px ${colours.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Short axes at the corner of lane (0, 0), bit z = 0, so no rule crosses the lattice.
    const corner = { u: -32.5 * 0.62, v: -2.7, w: 2.7 };
    axis(corner, { ...corner, u: corner.u + 6 }, 'z');
    axis(corner, { ...corner, v: 2.4 }, 'x');
    axis(corner, { ...corner, w: -2.4 }, 'y');

    for (const i of order) {
      const p = project(points[i], v);
      const a = alpha[i];
      if (a < 1) {
        ctx.globalAlpha = 0.85 * (1 - a);
        ctx.fillStyle = colours.ruling;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rFaint, 0, Math.PI * 2);
        ctx.fill();
      }
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = colours.plot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rMark, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- loop */

  const idle = () => state.visible && !state.interacted && !reducedMotion() && document.visibilityState === 'visible';
  const fading = (now) => state.from !== null && now - state.t0 < FADE_MS;

  function tick(now) {
    state.raf = 0;
    const dt = state.lastTime ? Math.min(64, now - state.lastTime) : 16;
    state.lastTime = now;
    if (idle()) view.yaw += IDLE_SPEED * dt;
    let t = 1;
    if (state.from !== null) {
      t = Math.min(1, (now - state.t0) / FADE_MS);
      if (t >= 1) state.from = null;
    }
    draw(t);
    if (state.visible && (idle() || fading(now))) state.raf = requestAnimationFrame(tick);
    else state.lastTime = 0;
  }

  function requestFrame() {
    if (!state.raf) state.raf = requestAnimationFrame(tick);
  }

  /* -------------------------------------------------------- checkpoints */

  function setStep(index, { fade = true, speak = true, force = false } = {}) {
    const i = Math.max(0, Math.min(masks.length - 1, index));
    if (!force && i === state.index && state.from === null) return;
    const animate = fade && !reducedMotion() && state.visible;
    state.from = animate ? masks[state.index] : null;
    state.t0 = performance.now();
    state.index = i;
    const step = trace.steps[i];
    if (range) {
      range.value = String(i);
      range.setAttribute('aria-valuetext', describeStep(step));
    }
    if (readout) readout.textContent = describeStep(step);
    canvas.setAttribute('aria-label', `The Keccak-f[1600] state lattice after ${step.step === 'input' ? 'no step (the input)' : step.label}: ${step.count} of 1600 bits differ, drawn in red.`);
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === masks.length - 1;
    if (!animate) {
      draw(1);
      if (reducedMotion() && speak) blink(canvas);
    } else requestFrame();
    if (speak) announce(status, `${describeStep(step)}${step.step === 'input' ? '' : `, after ${STEP_NAME[step.step]} of round ${step.round}`}.`);
  }

  function stopPlay() {
    clearTimeout(state.playTimer);
    state.playing = false;
    if (playButton) {
      playButton.textContent = 'Play the steps';
      playButton.setAttribute('aria-pressed', 'false');
    }
  }

  function playStep() {
    if (!state.playing) return;
    if (!state.visible) {
      stopPlay();
      return;
    }
    if (state.index >= masks.length - 1) {
      stopPlay();
      return;
    }
    setStep(state.index + 1, { speak: false });
    state.playTimer = setTimeout(playStep, STEP_MS);
  }

  function startPlay() {
    state.playing = true;
    if (playButton) {
      playButton.textContent = 'Pause';
      playButton.setAttribute('aria-pressed', 'true');
    }
    if (state.index >= masks.length - 1) setStep(0, { speak: false });
    announce(status, 'Playing the steps of rounds 1 to 3.');
    state.playTimer = setTimeout(playStep, STEP_MS);
  }

  playButton?.addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
  prev?.addEventListener('click', () => {
    stopPlay();
    setStep(state.index - 1);
  });
  next?.addEventListener('click', () => {
    stopPlay();
    setStep(state.index + 1);
  });
  if (range) {
    range.max = String(masks.length - 1);
    range.addEventListener('input', () => {
      stopPlay();
      setStep(Number(range.value));
    });
  }

  /* ----------------------------------------------------------- rotation */

  function interact() {
    state.interacted = true;
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    interact();
    drag = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    view.yaw = drag.yaw + (event.clientX - drag.x) * 0.01;
    view.pitch = clampPitch(drag.pitch + (event.clientY - drag.y) * 0.008);
    requestFrame();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.3 : 0.1;
    if (event.key === 'ArrowLeft') view.yaw -= step;
    else if (event.key === 'ArrowRight') view.yaw += step;
    else if (event.key === 'ArrowUp') view.pitch = clampPitch(view.pitch - step);
    else if (event.key === 'ArrowDown') view.pitch = clampPitch(view.pitch + step);
    else if (event.key === 'Home') Object.assign(view, DEFAULT_VIEW);
    else return;
    event.preventDefault();
    interact();
    requestFrame();
  });

  /* -------------------------------------------------------------- start */

  readColours();
  resize();
  setStep(state.index, { fade: false, speak: false, force: true });
  frame.hidden = true; // the printed lattice stays as the fallback until the canvas has drawn
  if (controls) controls.hidden = false;
  figure.classList.add('is-live');

  trackVisibility(holder, (visible) => {
    state.visible = visible;
    if (!visible) stopPlay();
    if (visible) requestFrame();
  });
  if ('ResizeObserver' in globalThis) {
    let last = state.size.width;
    new ResizeObserver(() => {
      const w = Math.round(holder.getBoundingClientRect().width);
      if (Math.abs(w - last) > 1) {
        last = w;
        resize();
        draw(1);
      }
    }).observe(holder);
  }
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', requestFrame);
  return { setStep };
}

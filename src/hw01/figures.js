/**
 * Page-side behaviour of the chart figures of homework 01: choose which
 * series (curve or function) is shown, redraw charts at their true pixel
 * width, and draw a new sample of secp256k1 keys in a Web Worker with a fresh
 * seed. Only the sampled series (secp256k1 and Keccak-256) can be redrawn: an
 * enumeration already contains every k, so for those the button is disabled
 * and its note says why. Figures are complete static HTML before this runs;
 * a failure leaves the printed figure in place.
 *
 * Markup contract:
 *   <figure data-fig="coordHist" data-fig-kind="coordHist">
 *     <div data-fig-canvas> …series containers [data-fig-series] from the build… <script data-fig-stats> </div>
 *     <div data-fig-controls hidden>
 *       <input type=radio data-fig-series-choice value=…>
 *       <button data-fig-resample> <p data-fig-resample-note>
 *     </div>
 *     <… data-fig-stat="c1"> … <p data-fig-status aria-live="polite">
 *   </figure>
 */

import { freshSeed } from '../lib/normal.js';
import { RESAMPLE_N, compactData, int, isSampled, renderChart, seriesFromStudy, statsOf } from './render.js';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Rasterises RGBA pixels to a PNG data URL through a canvas. */
export function canvasRasterize({ width, height, rgba }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../hw01.worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event) => {
    const { id, result, error } = event.data;
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (error) job.reject(new Error(error));
    else job.resolve(result);
  });
  worker.addEventListener('error', (event) => {
    for (const job of pending.values()) job.reject(event.error ?? new Error('worker failed'));
    pending.clear();
  });
  return worker;
}

/* Runs one resample in the worker: { kind, seed, N } → a partial study (meta and one experiment). */
function runExperiment(message) {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...message });
  });
}

/**
 * Enhances one chart figure.
 * @param {HTMLElement} figure
 */
export function mountChartFigure(figure) {
  const kind = figure.dataset.figKind;
  const canvas = figure.querySelector('[data-fig-canvas]');
  if (!kind || !canvas) throw new Error('Chart figure: missing data-fig-kind or [data-fig-canvas].');
  const statusEl = figure.querySelector('[data-fig-status]');
  const button = figure.querySelector('[data-fig-resample]');
  const note = figure.querySelector('[data-fig-resample-note]');
  const id = figure.dataset.fig;

  const stats = JSON.parse(figure.querySelector('[data-fig-stats]')?.textContent ?? '{}');
  const data = {};
  const keys = [];
  for (const box of canvas.querySelectorAll('[data-fig-series]')) {
    keys.push(box.dataset.figSeries);
    const json = box.querySelector('[data-fig-data]')?.textContent;
    if (json) data[box.dataset.figSeries] = JSON.parse(json);
  }
  let current = figure.querySelector('[data-fig-series-choice]:checked')?.value ?? keys.find((k) => !canvas.querySelector(`[data-fig-series="${k}"]`)?.hidden) ?? keys[0];
  let busy = false;

  const width = () => Math.max(280, Math.round(canvas.getBoundingClientRect().width));
  const container = (series) => canvas.querySelector(`[data-fig-series="${series}"]`);

  function writeStats(series) {
    const values = stats[series];
    if (!values) return;
    for (const el of figure.querySelectorAll('[data-fig-stat]')) {
      const key = el.dataset.figStat;
      if (key in values) el.textContent = values[key];
    }
  }

  function redraw(series, { animate = false } = {}) {
    const d = data[series];
    const box = container(series);
    if (!d || !box) return;
    const chart = box.querySelector('[data-fig-chart]');
    chart.innerHTML = renderChart(kind, d, { id: `${id}-${series}`, width: width(), rasterize: canvasRasterize });
    if (!animate) return;
    if (prefersReducedMotion()) {
      chart.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    // The data settle: marks drop onto their positions in a short stagger, then the reference lines print.
    chart.querySelectorAll('.chart__bar, .chart__point, .chart__lollipop').forEach((mark, i) => {
      mark.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], {
        duration: 360,
        delay: Math.min(i * 2, 220),
        easing: EASE_OUT,
        fill: 'backwards',
      });
    });
    for (const line of chart.querySelectorAll('.chart__expected, .chart__theory, .chart__reference')) {
      line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 240, easing: EASE_OUT, fill: 'backwards' });
    }
  }

  /* The resample button applies to sampled series only; its note says what it does, or why it cannot. */
  function updateResample(series) {
    if (!button) return;
    const sampled = isSampled(series);
    button.disabled = busy || !sampled;
    if (note) {
      note.textContent = sampled
        ? `Draws ${int(RESAMPLE_N)} new private keys in this browser with a fresh seed and redraws secp256k1 and Keccak-256 together.`
        : 'An enumeration already covers every k from 1 to n − 1: there is nothing to resample. Choose secp256k1 or Keccak-256 to draw a new sample.';
    }
  }

  function show(series) {
    current = series;
    for (const box of canvas.querySelectorAll('[data-fig-series]')) box.hidden = box.dataset.figSeries !== series;
    writeStats(series);
    if (data[series]) redraw(series);
    updateResample(series);
  }

  async function resample() {
    if (busy || !isSampled(current)) return;
    busy = true;
    updateResample(current);
    figure.classList.add('is-computing');
    const seed = freshSeed();
    if (statusEl) statusEl.textContent = `Drawing ${int(RESAMPLE_N)} new private keys with seed ${seed}…`;
    try {
      const partial = await runExperiment({ kind, seed, N: RESAMPLE_N });
      for (const key of keys.filter(isSampled)) {
        const d = seriesFromStudy(kind, partial, key);
        data[key] = compactData(kind, d) ?? d;
        stats[key] = statsOf(kind, d);
      }
      redraw(current, { animate: true });
      writeStats(current);
      if (statusEl) {
        const s = stats[current];
        statusEl.textContent = `New sample drawn in this browser: N = ${int(RESAMPLE_N)} private keys, seed ${seed}. ${s.c1h} ${s.c1}, ${s.c2h} ${s.c2}.`;
      }
    } catch (error) {
      console.error(error);
      if (statusEl) statusEl.textContent = 'The new sample could not be computed; the printed figure is unchanged.';
    } finally {
      busy = false;
      updateResample(current);
      figure.classList.remove('is-computing');
    }
  }

  for (const input of figure.querySelectorAll('[data-fig-series-choice]')) {
    input.checked = input.value === current;
    input.addEventListener('change', () => {
      if (input.checked) show(input.value);
    });
  }
  button?.addEventListener('click', resample);
  updateResample(current);

  // Charts printed by the build were drawn at a nominal width; redraw at the true width.
  if (data[current]) redraw(current);
  if ('ResizeObserver' in globalThis) {
    let last = width();
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = width();
        if (Math.abs(w - last) > 1) {
          last = w;
          if (data[current]) redraw(current);
        }
      });
    }).observe(canvas);
  }

  for (const controls of figure.querySelectorAll('[data-fig-controls]')) controls.hidden = false;
  figure.classList.add('is-live');
  return { show, resample };
}

/** Enhances every chart figure under `root`. */
export function mountChartFigures(root = document) {
  const mounted = [];
  for (const figure of root.querySelectorAll('[data-fig]')) {
    try {
      mounted.push(mountChartFigure(figure));
    } catch (error) {
      console.error(error);
    }
  }
  return mounted;
}

/**
 * Page-side behaviour of the experiment figures: choose which hash function
 * is shown, redraw charts at the true pixel width, and draw new samples in a
 * Web Worker with a fresh seed. Figures are complete static HTML before this
 * runs; failure leaves the printed figure in place.
 *
 * Markup contract:
 *   <figure data-fig="avalanche" data-fig-kind="avalanche">
 *     <div data-fig-canvas> …series containers from the build… <script data-fig-stats> </div>
 *     <div data-fig-controls hidden> <input type=radio data-fig-series-choice value=…> <button data-fig-resample> </div>
 *     <span data-fig-stat="mean"> … <p data-fig-status aria-live="polite">
 *   </figure>
 */

import { freshSeed } from '../lib/normal.js';
import { compactData, renderChart, statsOf } from './render.js';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Sizes used when a figure is re-sampled in the browser (the build used larger ones). */
export const RESAMPLE = Object.freeze({
  bitFrequency: { n: 800 },
  byteFrequency: { n: 800 },
  hammingWeight: { n: 800 },
  avalanche: { n: 800 },
  sac: { trials: 8 },
  runs: { n: 800 },
  collisions: { n: 800 },
});

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

function runExperiment(message) {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...message });
  });
}

/**
 * Enhances one experiment figure.
 * @param {HTMLElement} figure
 */
export function mountChartFigure(figure) {
  const kind = figure.dataset.figKind;
  const canvas = figure.querySelector('[data-fig-canvas]');
  if (!kind || !canvas) throw new Error('Chart figure: missing data-fig-kind or [data-fig-canvas].');
  const statusEl = figure.querySelector('[data-fig-status]');
  const button = figure.querySelector('[data-fig-resample]');
  const id = figure.dataset.fig;

  const stats = JSON.parse(figure.querySelector('[data-fig-stats]')?.textContent ?? '{}');
  const data = {};
  for (const container of canvas.querySelectorAll('[data-fig-series]')) {
    const json = container.querySelector('[data-fig-data]')?.textContent;
    if (json) data[container.dataset.figSeries] = JSON.parse(json);
  }
  let current = figure.querySelector('[data-fig-series-choice]:checked')?.value ?? 'scalar';
  let busy = false;

  function width() {
    return Math.max(280, Math.round(canvas.getBoundingClientRect().width));
  }

  function container(series) {
    return canvas.querySelector(`[data-fig-series="${series}"]`);
  }

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
    if (animate) {
      const marks = chart.querySelectorAll('.chart__bar, .chart__point, .chart__lollipop, .pplot__point, .heatmap__raster');
      if (prefersReducedMotion()) {
        chart.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160 });
      } else {
        marks.forEach((m, i) => {
          m.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], {
            duration: 360,
            delay: Math.min(i * 2, 220),
            easing: EASE_OUT,
            fill: 'backwards',
          });
        });
        for (const line of chart.querySelectorAll('.chart__expected, .chart__theory, .pplot__fit')) {
          line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 240, easing: EASE_OUT, fill: 'backwards' });
        }
      }
    }
  }

  function show(series) {
    current = series;
    for (const box of canvas.querySelectorAll('[data-fig-series]')) box.hidden = box.dataset.figSeries !== series;
    writeStats(series);
    if (data[series]) redraw(series);
  }

  async function resample() {
    if (busy) return;
    busy = true;
    const series = current;
    if (button) button.disabled = true;
    figure.classList.add('is-computing');
    if (statusEl) statusEl.textContent = `Computing a new sample for ${stats[series]?.series ?? series}…`;
    try {
      const seed = freshSeed();
      const result = await runExperiment({ kind, variant: series, seed, ...RESAMPLE[kind] });
      data[series] = compactData(kind, result) ?? result;
      if (kind === 'sac') data[series] = result;
      stats[series] = statsOf(kind, result);
      if (series === current) {
        redraw(series, { animate: true });
        writeStats(series);
      }
      if (statusEl) {
        const s = stats[series];
        const summary = s.p ? `p-value ${s.p}` : s.uniformityP ? `p-value ${s.uniformityP}` : s.maxAbsZ ? `max |z| ${s.maxAbsZ}` : '';
        statusEl.textContent = `New sample drawn for ${s.series}: seed ${s.seed}${summary ? `, ${summary}` : ''}.`;
      }
    } catch (error) {
      console.error(error);
      if (statusEl) statusEl.textContent = 'The new sample could not be computed; the printed figure is unchanged.';
    } finally {
      busy = false;
      if (button) button.disabled = false;
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

  // Charts printed by the build were drawn at 960px; redraw at the true width.
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

/** Enhances every experiment figure under `root`. */
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

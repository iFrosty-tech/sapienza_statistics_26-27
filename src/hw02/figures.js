/**
 * Page-side behaviour of the experiment figures of homework 02: choose the
 * series shown (one or more radio groups, "axes", whose values are joined
 * into a series key such as "address.avalanche"), redraw charts at their true
 * pixel width, and draw a new sample in a Web Worker with a fresh seed where
 * a figure offers it. Figures are complete static HTML before this runs;
 * failure leaves the printed figure in place.
 *
 * Markup contract:
 *   <figure data-fig="stages" data-fig-kind="stages">
 *     <div data-fig-canvas> …series containers [data-fig-series] from the build… <script data-fig-stats> </div>
 *     <div data-fig-controls hidden>
 *       <input type=radio data-fig-series-choice data-fig-axis="stage" value=…> … <button data-fig-resample>
 *     </div>
 *     <span data-fig-stat="mean"> … <p data-fig-status aria-live="polite">
 *   </figure>
 */

import { freshSeed } from '../lib/normal.js';
import { DEFAULT_SERIES, compactData, renderChart, stagesSeriesOf, statsOf } from './render.js';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Sample sizes used when a figure is re-sampled in the browser (the build used larger ones). */
export const RESAMPLE = Object.freeze({
  stages: { n: 200 },
});

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* ------------------------------------------------------------- worker */

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../hw02.worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event) => {
    const { id, result, error, progress } = event.data;
    const job = pending.get(id);
    if (!job) return;
    if (progress) {
      job.onProgress?.(...progress);
      return;
    }
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

function runExperiment(message, onProgress) {
  return new Promise((resolve, reject) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, ...message });
  });
}

/* Turns a worker result into the series of the figure. */
const RESULT_SERIES = Object.freeze({
  stages: (result) => stagesSeriesOf(result),
});

/* -------------------------------------------------------------- mount */

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
  for (const box of canvas.querySelectorAll('[data-fig-series]')) {
    const json = box.querySelector('[data-fig-data]')?.textContent;
    if (json) data[box.dataset.figSeries] = JSON.parse(json);
  }

  // The radio groups, in document order; their values make the series key.
  const inputs = [...figure.querySelectorAll('[data-fig-series-choice]')];
  const axes = [...new Set(inputs.map((input) => input.dataset.figAxis ?? 'series'))];
  const axisInputs = (axis) => inputs.filter((input) => (input.dataset.figAxis ?? 'series') === axis);
  const keyOf = (values) => values.join('.');
  const selected = () => axes.map((axis) => axisInputs(axis).find((i) => i.checked)?.value);

  const fallback = DEFAULT_SERIES[kind] ?? Object.keys(data)[0];
  let current = inputs.length ? keyOf(selected()) : fallback;
  if (!(current in data)) current = fallback;
  let busy = false;

  const width = () => Math.max(280, Math.round(canvas.getBoundingClientRect().width));
  const container = (key) => [...canvas.querySelectorAll('[data-fig-series]')].find((box) => box.dataset.figSeries === key);

  function writeStats(key) {
    const values = stats[key];
    if (!values) return;
    for (const el of figure.querySelectorAll('[data-fig-stat]')) {
      const stat = el.dataset.figStat;
      if (stat in values) el.textContent = values[stat];
    }
  }

  function redraw(key, { animate = false } = {}) {
    const d = data[key];
    const box = container(key);
    if (!d || !box) return;
    const chart = box.querySelector('[data-fig-chart]');
    chart.innerHTML = renderChart(kind, d, { id: `${id}-${key.replace(/\./g, '-')}`, width: width() });
    if (!animate) return;
    if (prefersReducedMotion()) {
      chart.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    chart.querySelectorAll('.chart__bar, .chart__point, .chart__lollipop').forEach((mark, i) => {
      mark.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], {
        duration: 360,
        delay: Math.min(i * 2, 220),
        easing: EASE_OUT,
        fill: 'backwards',
      });
    });
    for (const line of chart.querySelectorAll('.chart__expected, .chart__trace')) {
      line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 240, easing: EASE_OUT, fill: 'backwards' });
    }
  }

  /* Options of the later axes that cannot combine with the current choice are disabled. */
  function syncAvailability() {
    if (axes.length < 2) return;
    const values = selected();
    axes.forEach((axis, a) => {
      if (a === 0) return;
      for (const input of axisInputs(axis)) {
        const candidate = values.slice();
        candidate[a] = input.value;
        input.disabled = !(keyOf(candidate) in data);
      }
    });
  }

  function show(key) {
    current = key;
    for (const box of canvas.querySelectorAll('[data-fig-series]')) box.hidden = box.dataset.figSeries !== key;
    writeStats(key);
    redraw(key);
  }

  function onChoice() {
    const values = selected();
    let key = keyOf(values);
    if (!(key in data)) {
      // The first axis changed to a value without the chosen later option: take the first one available.
      for (let a = 1; a < axes.length && !(key in data); a += 1) {
        const option = axisInputs(axes[a]).find((input) => {
          const candidate = values.slice();
          candidate[a] = input.value;
          return keyOf(candidate) in data;
        });
        if (option) {
          option.checked = true;
          values[a] = option.value;
          key = keyOf(values);
        }
      }
    }
    syncAvailability();
    if (key in data) show(key);
  }

  async function resample() {
    if (busy || !RESAMPLE[kind]) return;
    busy = true;
    if (button) button.disabled = true;
    figure.classList.add('is-computing');
    const seed = freshSeed();
    const n = RESAMPLE[kind].n;
    if (statusEl) statusEl.textContent = `Computing a new sample of ${n} wallets with seed ${seed}…`;
    let lastReport = 0;
    try {
      const result = await runExperiment({ kind, seed, ...RESAMPLE[kind] }, (done, total) => {
        // A polite region is read when it settles; report every quarter of the work.
        if (statusEl && (done === total || done - lastReport >= total / 4)) {
          lastReport = done;
          statusEl.textContent = `Computing a new sample: ${done} of ${total} wallets…`;
        }
      });
      const series = RESULT_SERIES[kind](result);
      for (const [key, d] of Object.entries(series)) {
        data[key] = compactData(kind, d);
        stats[key] = statsOf(kind, d);
      }
      redraw(current, { animate: true });
      writeStats(current);
      if (statusEl) {
        const s = stats[current];
        statusEl.textContent = `New sample drawn: ${s.series}, n = ${s.n}, seed ${s.seed}, p-value ${s.p}.`;
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

  for (const input of inputs) {
    input.addEventListener('change', () => {
      if (input.checked) onChoice();
    });
  }
  button?.addEventListener('click', resample);
  if (button && !RESAMPLE[kind]) button.hidden = true;

  // Charts printed by the build were drawn at 960px; redraw at the true width.
  syncAvailability();
  show(current);
  if ('ResizeObserver' in globalThis) {
    let last = width();
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = width();
        if (Math.abs(w - last) > 1) {
          last = w;
          redraw(current);
        }
      });
    }).observe(canvas);
  }

  for (const controls of figure.querySelectorAll('[data-fig-controls]')) controls.hidden = false;
  figure.classList.add('is-live');
  return { show, resample };
}

/** Enhances every experiment figure under `root`; a failure leaves that figure static. */
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

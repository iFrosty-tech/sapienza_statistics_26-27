/**
 * Normal probability plot on a reconstruction of normal probability paper.
 *
 * `renderProbabilityPlotSVG` is a pure function returning SVG markup; it runs in
 * Node at build time (static, script-free figures) and in the browser.
 * `mountProbabilityPlot` attaches interactivity and motion to a figure in the DOM.
 *
 * Markup contract for a figure (the build plugin emits the canvas for you):
 *   <figure data-pplot>
 *     <div data-pplot-canvas data-id="fig-1" data-n="40" data-seed="1" data-dist="normal">…</div>
 *     <button data-pplot-resample>Draw new sample</button>            optional
 *     <input type="radio" data-pplot-dist value="lognormal">           optional
 *     <input type="radio" data-pplot-n value="160">                    optional
 *     <output data-pplot-stat="n|mean|sd|r|seed|population"></output>  optional
 *     <p data-pplot-status aria-live="polite"></p>                     optional
 *   </figure>
 */

import { invNorm, simulateProbabilityPlot, freshSeed } from './normal.js';

/* Cumulative probabilities (in percent) printed on the paper. */
export const MAJOR_P = [
  0.01, 0.1, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99, 99.5,
  99.9, 99.99,
];
export const MINOR_P = [
  0.02, 0.05, 0.2, 3, 4, 15, 25, 35, 45, 55, 65, 75, 85, 96, 97, 99.8, 99.95,
  99.98,
];
/* Labels are placed in this order of importance until they would collide. */
const LABEL_PRIORITY = [
  50, 10, 90, 1, 99, 0.1, 99.9, 0.01, 99.99, 30, 70, 5, 95, 20, 80, 2, 98, 40,
  60, 0.5, 99.5,
];

const Z_MIN = invNorm(0.0001);
const Z_MAX = invNorm(0.9999);

const DESCRIPTIONS = {
  normal:
    'The points lie close to the straight reference line, the pattern expected when the population is normal.',
  lognormal:
    'The points bend away from the reference line in a convex curve, the pattern produced by a right-skewed population.',
  uniform:
    'The points form a flattened S around the reference line, the pattern produced by a population with lighter tails than the normal.',
};

/** Formats a number with a true minus sign and fixed decimals. */
export function formatNumber(x, digits = 2) {
  const s = Number(x).toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function formatPercent(p) {
  return String(p);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function niceStep(rawStep) {
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const f = rawStep / power;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * power;
}

function decimalsFor(step) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

const round = (v) => Math.round(v * 10) / 10;

/**
 * Geometry shared by rendering and animation.
 * @param {ReturnType<typeof simulateProbabilityPlot>} model
 * @param {{ width: number, height: number }} size
 */
export function plotGeometry(model, { width, height }) {
  const narrow = width < 520;
  const margin = { top: 14, right: narrow ? 12 : 44, bottom: 50, left: 60 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = Math.max(40, height - margin.top - margin.bottom);

  const lo = model.sample[0];
  const hi = model.sample[model.sample.length - 1];
  const span = hi - lo || 1;
  const x0 = lo - span * 0.08;
  const x1 = hi + span * 0.08;

  const x = (v) => margin.left + ((v - x0) / (x1 - x0)) * plotW;
  const y = (z) => margin.top + ((Z_MAX - z) / (Z_MAX - Z_MIN)) * plotH;

  return { width, height, narrow, margin, plotW, plotH, x0, x1, x, y };
}

function probabilityRulings(g) {
  const lines = [];
  const placedY = [];
  for (const p of MAJOR_P) {
    const yy = g.y(invNorm(p / 100));
    lines.push({ p, y: yy, major: true });
    placedY.push(yy);
  }
  for (const p of MINOR_P) {
    const yy = g.y(invNorm(p / 100));
    if (placedY.every((other) => Math.abs(other - yy) >= 4)) {
      lines.push({ p, y: yy, major: false });
      placedY.push(yy);
    }
  }
  // Draw-in order: from the 50% line outward, by distance in normal scores.
  const levels = [...new Set(lines.map((l) => Math.abs(invNorm(l.p / 100)).toFixed(4)))]
    .map(Number)
    .sort((a, b) => a - b);
  for (const l of lines) {
    l.rank = levels.indexOf(Number(Math.abs(invNorm(l.p / 100)).toFixed(4)));
  }

  const labelled = [];
  for (const p of LABEL_PRIORITY) {
    const yy = g.y(invNorm(p / 100));
    if (labelled.every((other) => Math.abs(other.y - yy) >= 13)) {
      labelled.push({ p, y: yy });
    }
  }
  return { lines, labelled };
}

function valueRulings(g) {
  const target = Math.max(3, Math.floor(g.plotW / 84));
  const step = niceStep((g.x1 - g.x0) / target);
  const minorDiv = (g.plotW / ((g.x1 - g.x0) / step)) / 5 >= 7 ? 5 : 2;
  const minor = step / minorDiv;
  const ticks = [];
  const start = Math.ceil(g.x0 / minor - 1e-9);
  const end = Math.floor(g.x1 / minor + 1e-9);
  for (let k = start; k <= end; k += 1) {
    const v = k * minor;
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    ticks.push({ v, x: g.x(v), major });
  }
  return { ticks, decimals: decimalsFor(step) };
}

/**
 * Pure SVG renderer.
 * @param {ReturnType<typeof simulateProbabilityPlot>} model
 * @param {{ width: number, height: number, id: string, xLabel?: string }} options
 * @returns {string}
 */
export function renderProbabilityPlotSVG(model, { width, height, id, xLabel = 'Ordered observation x(i)' }) {
  const g = plotGeometry(model, { width, height });
  const { lines, labelled } = probabilityRulings(g);
  const { ticks, decimals } = valueRulings(g);
  const left = g.margin.left;
  const right = g.margin.left + g.plotW;
  const top = g.margin.top;
  const bottom = g.margin.top + g.plotH;
  const out = [];

  out.push(
    `<svg class="pplot__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">`,
    `<title id="${id}-title">${escapeXml(plotTitle(model))}</title>`,
    `<desc id="${id}-desc">${escapeXml(plotDescription(model))}</desc>`,
    `<defs><clipPath id="${id}-clip"><rect x="${left}" y="${top}" width="${round(g.plotW)}" height="${round(g.plotH)}"/></clipPath></defs>`,
  );

  // Value rulings (linear scale).
  out.push('<g class="pplot__rulings pplot__rulings--value" aria-hidden="true">');
  for (const t of ticks) {
    out.push(
      `<line class="pplot__vline${t.major ? ' is-major' : ''}" x1="${round(t.x)}" x2="${round(t.x)}" y1="${top}" y2="${round(bottom)}"/>`,
    );
  }
  out.push('</g>');

  // Probability rulings (inverse-normal scale).
  out.push('<g class="pplot__rulings pplot__rulings--probability" aria-hidden="true">');
  for (const l of lines) {
    const cls = ['pplot__ruling', l.major ? 'is-major' : 'is-minor', l.p === 50 ? 'is-median' : '']
      .filter(Boolean)
      .join(' ');
    out.push(
      `<line class="${cls}" data-rank="${l.rank}" x1="${left}" x2="${round(right)}" y1="${round(l.y)}" y2="${round(l.y)}"/>`,
    );
  }
  out.push(
    `<rect class="pplot__frame" x="${left}" y="${top}" width="${round(g.plotW)}" height="${round(g.plotH)}"/>`,
    '</g>',
  );

  // Margin labels, as printed on the paper.
  out.push('<g class="pplot__labels" aria-hidden="true">');
  for (const l of labelled) {
    out.push(
      `<text class="pplot__plabel" x="${left - 7}" y="${round(l.y)}" text-anchor="end" dominant-baseline="middle">${formatPercent(l.p)}</text>`,
    );
    if (!g.narrow) {
      out.push(
        `<text class="pplot__plabel is-complement" x="${round(right + 7)}" y="${round(l.y)}" text-anchor="start" dominant-baseline="middle">${formatPercent(+(100 - l.p).toFixed(2))}</text>`,
      );
    }
  }
  for (const t of ticks) {
    if (!t.major) continue;
    out.push(
      `<text class="pplot__xlabel" x="${round(t.x)}" y="${round(bottom + 17)}" text-anchor="middle">${formatNumber(t.v, decimals)}</text>`,
    );
  }
  out.push(
    `<text class="pplot__axis-title" transform="translate(14 ${round(top + g.plotH / 2)}) rotate(-90)" text-anchor="middle">Cumulative probability (%)</text>`,
    `<text class="pplot__axis-title" x="${round(left + g.plotW / 2)}" y="${round(bottom + 40)}" text-anchor="middle">${escapeXml(xLabel)}</text>`,
    '</g>',
  );

  // Fitted reference line, clipped to the sheet.
  const fx1 = g.x(model.fit.intercept + model.fit.slope * Z_MIN);
  const fy1 = g.y(Z_MIN);
  const fx2 = g.x(model.fit.intercept + model.fit.slope * Z_MAX);
  const fy2 = g.y(Z_MAX);
  out.push(
    `<g clip-path="url(#${id}-clip)" aria-hidden="true"><line class="pplot__fit" x1="${round(fx1)}" y1="${round(fy1)}" x2="${round(fx2)}" y2="${round(fy2)}"/></g>`,
  );

  // Plotted points: ordered observations against their Blom positions.
  const r = g.narrow ? 3.25 : 3.75;
  out.push('<g class="pplot__points" aria-hidden="true">');
  model.sample.forEach((v, i) => {
    out.push(
      `<circle class="pplot__point" data-i="${i}" cx="${round(g.x(v))}" cy="${round(g.y(model.z[i]))}" r="${r}"/>`,
    );
  });
  out.push('</g></svg>');
  return out.join('');
}

/** Accessible title of a plot. */
export function plotTitle(model) {
  return `Normal probability plot of ${model.n} simulated observations from ${model.population.label}`;
}

/** Accessible long description of a plot. */
export function plotDescription(model) {
  return `${DESCRIPTIONS[model.dist]} Probability-plot correlation r = ${formatNumber(model.fit.r, 3)}; sample mean ${formatNumber(model.mean)}, sample standard deviation ${formatNumber(model.sd)}, seed ${model.seed}.`;
}

/* ------------------------------------------------------------------ DOM ---- */

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Attaches interactivity to a probability-plot figure.
 * @param {HTMLElement} figure element carrying `data-pplot`
 * @returns {{ intro: () => number, redraw: () => void }}
 *   `intro()` plays the entrance sequence and returns its duration in ms
 *   (0 when reduced motion is requested).
 */
export function mountProbabilityPlot(figure) {
  const canvas = figure.querySelector('[data-pplot-canvas]');
  if (!canvas) throw new Error('Probability plot: missing [data-pplot-canvas].');

  const state = {
    id: canvas.dataset.id || 'pplot',
    n: Number(canvas.dataset.n) || 40,
    seed: Number(canvas.dataset.seed) >>> 0,
    dist: canvas.dataset.dist || 'normal',
    xLabel: canvas.dataset.xLabel || undefined,
  };
  let model = simulateProbabilityPlot(state);
  let lastSize = { width: 0, height: 0 };

  const statusEl = figure.querySelector('[data-pplot-status]');

  function size() {
    const rect = canvas.getBoundingClientRect();
    return { width: Math.max(280, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) };
  }

  function writeStats() {
    const values = {
      n: String(model.n),
      mean: formatNumber(model.mean),
      sd: formatNumber(model.sd),
      r: formatNumber(model.fit.r, 3),
      seed: String(model.seed),
      population: model.population.label,
    };
    for (const el of figure.querySelectorAll('[data-pplot-stat]')) {
      const key = el.dataset.pplotStat;
      if (key in values) el.textContent = values[key];
    }
    canvas.dataset.seed = String(model.seed);
    canvas.dataset.n = String(model.n);
    canvas.dataset.dist = model.dist;
  }

  function render() {
    const s = size();
    lastSize = s;
    canvas.innerHTML = renderProbabilityPlotSVG(model, { ...s, id: state.id, xLabel: state.xLabel });
    writeStats();
  }

  function positions() {
    const map = new Map();
    for (const c of canvas.querySelectorAll('.pplot__point')) {
      map.set(c.dataset.i, { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) });
    }
    return map;
  }

  function drawLine(line, { delay = 0, duration = 600 } = {}) {
    if (!line) return;
    const len = Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value);
    line.style.strokeDasharray = `${len}`;
    const anim = line.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration, delay, easing: EASE_OUT, fill: 'backwards' },
    );
    anim.onfinish = () => {
      line.style.strokeDasharray = '';
    };
  }

  function announce(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function transition(kind) {
    const before = positions();
    const sameN = before.size === state.n;
    model = simulateProbabilityPlot(state);
    render();
    const points = [...canvas.querySelectorAll('.pplot__point')];
    const fit = canvas.querySelector('.pplot__fit');

    if (prefersReducedMotion()) {
      // Reduced motion keeps the acknowledgement, drops the travel.
      for (const p of points) p.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160 });
    } else if (sameN) {
      // Ranks keep their plotting positions; each order statistic slides to its new value.
      points.forEach((p, i) => {
        const old = before.get(p.dataset.i);
        const dx = old.x - Number(p.getAttribute('cx'));
        const dy = old.y - Number(p.getAttribute('cy'));
        p.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 460, delay: Math.min(i * 5, 180), easing: EASE_OUT, fill: 'backwards' },
        );
      });
      drawLine(fit, { delay: 120, duration: 420 });
    } else {
      points.forEach((p, i) => {
        p.animate(
          [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, delay: Math.min(i * 3, 200), easing: EASE_OUT, fill: 'backwards' },
        );
      });
      drawLine(fit, { delay: 160, duration: 420 });
    }

    const verb = kind === 'resample' ? 'New sample drawn' : 'Sample updated';
    announce(
      `${verb}: n = ${model.n} from ${model.population.label}; mean ${formatNumber(model.mean)}, standard deviation ${formatNumber(model.sd)}, r = ${formatNumber(model.fit.r, 3)}.`,
    );
  }

  function intro() {
    if (prefersReducedMotion()) return 0;
    const rulings = [...canvas.querySelectorAll('.pplot__ruling')];
    for (const line of rulings) {
      const rank = Number(line.dataset.rank) || 0;
      line.animate(
        [{ transform: 'scaleX(0)', opacity: 0.2 }, { transform: 'scaleX(1)', opacity: 1 }],
        { duration: 560, delay: Math.min(rank * 42, 620), easing: EASE_OUT, fill: 'backwards' },
      );
    }
    for (const el of canvas.querySelectorAll('.pplot__vline, .pplot__labels, .pplot__frame')) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay: 160, easing: EASE_OUT, fill: 'backwards' });
    }
    // Points settle from the middle of the distribution outward, mirroring the rulings.
    const points = [...canvas.querySelectorAll('.pplot__point')];
    const order = points
      .map((p) => ({ p, d: Math.abs(model.z[Number(p.dataset.i)]) }))
      .sort((a, b) => a.d - b.d);
    order.forEach(({ p }, k) => {
      p.animate(
        [
          { opacity: 0, transform: 'translateY(-26px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 540, delay: 520 + Math.min(k * 14, 560), easing: EASE_OUT, fill: 'backwards' },
      );
    });
    drawLine(canvas.querySelector('.pplot__fit'), { delay: 1080, duration: 640 });
    return 1720;
  }

  // Controls.
  figure.querySelector('[data-pplot-resample]')?.addEventListener('click', () => {
    state.seed = freshSeed();
    transition('resample');
  });
  for (const input of figure.querySelectorAll('input[data-pplot-dist]')) {
    input.checked = input.value === state.dist;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.dist = input.value;
      transition('dist');
    });
  }
  for (const input of figure.querySelectorAll('input[data-pplot-n]')) {
    input.checked = Number(input.value) === state.n;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.n = Number(input.value);
      transition('n');
    });
  }

  // Re-render at true pixel size so labels keep their printed size at any width.
  render();
  if ('ResizeObserver' in globalThis) {
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const s = size();
        if (Math.abs(s.width - lastSize.width) > 1 || Math.abs(s.height - lastSize.height) > 1) render();
      });
    }).observe(canvas);
  }

  figure.classList.add('is-live');
  return { intro, redraw: () => transition('resample') };
}

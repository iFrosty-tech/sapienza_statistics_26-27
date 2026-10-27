/**
 * Panel 1 (§3): m attackers over n systems, live. Each attacker is one
 * trajectory of the penetration score (assumption A1): it attacks the n
 * systems in sequence and adds Xᵢ after system i. The reader chooses the
 * increment model, p, n, m, the quantity drawn (Sₖ, Sₖ/k or Sₖ/√k), ε and the
 * seed; the panel draws the m trajectories against the theoretical mean and
 * the band of two standard deviations, and beside them, sideways, the
 * histogram of the quantity across the attackers at an intermediate step t
 * (draggable) and at n. A table sets the simulated mean and variance at t and
 * at n against theory, with the share of attackers whose average score lies at
 * least ε from μ.
 *
 * The run is simulated once per change of model, p, n, m or seed
 * (simulateTrajectories of src/lib/penetration.js) and decimated to the pixel
 * columns of the plot. Motion: Play lets the attackers advance system by
 * system, the trajectories growing column by column on their own canvas; a
 * change of quantity, p or seed morphs every trajectory from its old shape to
 * its new one, so that the spread is seen to open (Sₖ), collapse (Sₖ/k) or
 * hold (Sₖ/√k). Under reduced motion the final state is drawn at once and a
 * blink acknowledges the change. Nothing runs while the panel is off screen.
 */

import { freshSeed, normPdf } from '../lib/normal.js';
import { prefersReducedMotion } from '../lib/figures.js';
import { NORMALIZATIONS, incrementLaw, scoreMoments, simulateTrajectories } from '../lib/penetration.js';
import { DURATION, announce, attachPanel, blink, choiceGroup, panelFrame } from '../hw03/motion.js';
import { clearLayer, formFont, readPalette, sizeLayer, watchSize, watchVisibility } from './canvas.js';
import {
  SIM_M_STOPS,
  SIM_N_STOPS,
  clampP,
  decimatePaths,
  easeOut,
  envelopeOnGrid,
  formatNumber,
  frontAt,
  histogramGroup,
  latticeHistogram,
  lerpInto,
  nearestStop,
  niceTicks,
  parseMountOptions,
  parseSeed,
  playDuration,
  pointsUpTo,
  quantityDomain,
  scoresAt,
  simulatorLayout,
  simulatorReadout,
  simulatorSummary,
  trajectoryAlpha,
  trajectoryGrid,
} from './model.js';

/** The drawn quantity at a running step k. */
const RUNNING = { total: 'Sₖ', average: 'Sₖ/k', normalized: 'Sₖ/√k' };
const MORPH_MS = DURATION.settle;

const ICONS = {
  play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h2.75v11H4zM9.25 2.5H12v11H9.25z" fill="currentColor"/></svg>',
  reset: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 2.5h1.75v11H3zM13 2.5v11L5.75 8z" fill="currentColor"/></svg>',
};

function rangeField({ key, caption, min, max, value, valueText, output }) {
  return (
    `<label class="sim-range" data-sim-field="${key}">` +
    `<span class="sim-range__head"><span class="caption caption--math">${caption}</span>` +
    `<output class="sim-range__value" data-sim-out="${key}">${output}</output></span>` +
    `<input type="range" data-sim-input="${key}" min="${min}" max="${max}" step="1" value="${value}" aria-valuetext="${valueText}" />` +
    `</label>`
  );
}

function body(s) {
  const nIndex = nearestStop(SIM_N_STOPS, s.n);
  const mIndex = nearestStop(SIM_M_STOPS, s.m);
  const quantity = Object.values(NORMALIZATIONS).map((q) => ({
    value: q.id,
    label: `${q.label}<span class="sim-choice__note">${q.name.toLowerCase()}</span>`,
  }));
  return (
    `<div class="sim-controls">` +
    choiceGroup({
      name: 'sim-model',
      legend: 'Increment model',
      options: [
        { value: 'bernoulli', label: 'Bernoulli<span class="sim-choice__note">{0, 1}</span>' },
        { value: 'rademacher', label: 'Rademacher<span class="sim-choice__note">{−1, +1}</span>' },
      ],
      checked: s.model,
    }) +
    rangeField({ key: 'p', caption: 'Success probability p', min: 1, max: 99, value: Math.round(s.p * 100), valueText: `p = ${s.p.toFixed(2)}`, output: s.p.toFixed(2) }) +
    rangeField({ key: 'n', caption: 'Systems n', min: 0, max: SIM_N_STOPS.length - 1, value: nIndex, valueText: `n = ${s.n} systems`, output: s.n.toLocaleString('en-GB') }) +
    rangeField({ key: 'm', caption: 'Attackers m', min: 0, max: SIM_M_STOPS.length - 1, value: mIndex, valueText: `m = ${s.m} attackers`, output: s.m.toLocaleString('en-GB') }) +
    `<div class="sim-controls__wide">` +
    choiceGroup({ name: 'sim-quantity', legend: 'Quantity drawn', options: quantity, checked: s.normalization }) +
    `</div>` +
    rangeField({ key: 'eps', caption: 'Deviation ε', min: 1, max: 25, value: Math.round(s.eps * 100), valueText: `ε = ${s.eps.toFixed(2)}`, output: s.eps.toFixed(2) }) +
    `<div class="sim-seed">` +
    `<label class="text-field"><span class="caption">Seed</span>` +
    `<input type="text" inputmode="numeric" data-sim-seed value="${s.seed}" autocomplete="off" spellcheck="false" aria-describedby="sim-seed-note" /></label>` +
    `<button type="button" class="form-button" data-sim-reseed>New seed</button>` +
    `<span class="text-field__note sim-seed__note" id="sim-seed-note" data-sim-seed-note>Mulberry32; any whole number from 0 to 4294967295.</span>` +
    `</div>` +
    `</div>` +
    `<div class="sim-transport">` +
    `<button type="button" class="form-button" data-sim-play aria-pressed="false">${ICONS.play}<span data-sim-play-label>Play</span></button>` +
    `<button type="button" class="form-button" data-sim-reset>${ICONS.reset}<span>Reset</span></button>` +
    `<p class="sim-transport__progress" data-sim-progress></p>` +
    `</div>` +
    `<div class="sim-figure">` +
    `<div class="sim-canvas" data-sim-canvas role="img" aria-label="Trajectories of the attackers">` +
    `<canvas class="sim-layer" data-layer="base"></canvas>` +
    `<canvas class="sim-layer" data-layer="paths"></canvas>` +
    `<canvas class="sim-layer sim-layer--top" data-layer="over"></canvas>` +
    `</div>` +
    `<label class="sim-step"><span class="sim-range__head"><span class="caption caption--math">Intermediate step t</span>` +
    `<output class="sim-range__value" data-sim-out="t"></output></span>` +
    `<input type="range" data-sim-input="t" min="1" max="${s.n}" step="1" value="${s.t}" /></label>` +
    `<ul class="sim-legend" aria-label="Key">` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 8 L8 4 L14 6 L21 2" class="sim-legend__path"/></svg>One attacker’s trajectory</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 5 H21" class="sim-legend__mean"/></svg>Theoretical mean</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><rect x="1" y="1" width="20" height="8" class="sim-legend__band"/><path d="M1 1.5 H21 M1 8.5 H21" class="sim-legend__edge"/></svg>Mean ± 2 standard deviations</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 5 H21" class="sim-legend__eps"/></svg>μ ± ε (on Sₖ/k)</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><rect x="1" y="2" width="13" height="6" class="sim-legend__bar"/><path d="M1 9 C8 9 12 1 21 1" class="sim-legend__curve"/></svg>Histogram across attackers, with the normal law of equal mean and variance</li>` +
    `</ul>` +
    `</div>` +
    `<div class="data-table--scroll" tabindex="0" role="region" aria-label="Simulated and theoretical moments at t and at n">` +
    `<table class="data-table sim-readout" data-sim-table></table></div>` +
    `<p class="demo-panel__lede sim-readout__note">In the last row the simulated column is the share of the m attackers whose average score Sₖ/k lies at least ε from μ, and the theory column its exact binomial probability: by the law of large numbers both tend to 0 as k grows.</p>`
  );
}

export function mountSimulatorDemo(mount) {
  const options = parseMountOptions(mount.dataset);
  const s = { model: 'bernoulli', p: options.p, n: 1000, m: 100, normalization: 'total', eps: 0.05, seed: options.seed, t: 250 };

  const { panel, $ } = panelFrame({
    id: 'demo-sim',
    number: 1,
    title: 'Trajectories of m attackers over n systems<span class="pplot__provenance">Simulated</span>',
    lede:
      'Each attacker attacks the n systems in turn and adds its score Xᵢ after system i, so that each of the m red paths is one trajectory of the random walk Sₖ = X₁ + … + Xₖ. Choose the quantity drawn to see its spread across the attackers grow like √k, shrink like 1/√k or hold; drag the step t, or press Play to let the attackers advance.',
    body: body(s),
    provenance: '',
  });

  const canvasWrap = $('[data-sim-canvas]');
  const layers = {
    base: $('[data-layer="base"]'),
    paths: $('[data-layer="paths"]'),
    over: $('[data-layer="over"]'),
  };
  const input = (key) => $(`[data-sim-input="${key}"]`);
  const output = (key) => $(`[data-sim-out="${key}"]`);
  const seedField = $('[data-sim-seed]');
  const seedNote = $('[data-sim-seed-note]');
  const playButton = $('[data-sim-play]');
  const playLabel = $('[data-sim-play-label]');
  const progress = $('[data-sim-progress]');
  const table = $('[data-sim-table]');
  const provenance = $('.demo-panel__provenance');
  const status = $('[data-status]');
  const pField = $('[data-sim-field="p"]');

  let law = null;
  let paths = null;
  let layout = null;
  let ctx = null;
  let pal = null;
  let scene = null; // the target drawing, in screen units
  let shown = null; // what is drawn now (the target, or a morph towards it)
  let morph = null;
  let front = s.n; // the step the attackers have reached
  let committed = 0; // grid points already drawn on the paths layer
  let playing = false;
  let playStart = 0;
  let raf = 0;
  let visible = true;
  let announceTimer = 0;
  let readoutFrame = 0;
  const stops = [];

  /* ------------------------------------------------------------ simulation */

  function simulate() {
    law = incrementLaw(s.model, { p: s.p });
    paths = simulateTrajectories({ law, n: s.n, m: s.m, seed: s.seed });
  }

  const xOf = (k) => layout.plot.x + (layout.plot.w * k) / s.n;
  const yScale = ([d0, d1]) => (v) => layout.plot.y + layout.plot.h * (1 - (v - d0) / (d1 - d0));
  const valueAt = ([d0, d1], y) => d0 + (1 - (y - layout.plot.y) / layout.plot.h) * (d1 - d0);

  function buildScene() {
    const grid = trajectoryGrid(s.n, Math.max(40, Math.floor(layout.plot.w)));
    const values = decimatePaths(paths, grid, s.normalization);
    const env = envelopeOnGrid(law, s.normalization, grid.xs, 2);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const domain = quantityDomain({ law, normalization: s.normalization, observed: [lo, hi], envelope: env });
    const y = yScale(domain);
    return {
      grid,
      xs: Float32Array.from(grid.xs, xOf),
      domain,
      normalization: s.normalization,
      ys: Float32Array.from(values, y),
      mean: Float32Array.from(env.mean, y),
      lo: Float32Array.from(env.lo, y),
      hi: Float32Array.from(env.hi, y),
    };
  }

  const cloneScene = (sc) => ({ ...sc, domain: [...sc.domain], ys: sc.ys.slice(), mean: sc.mean.slice(), lo: sc.lo.slice(), hi: sc.hi.slice() });

  /** Shows a new target: as a morph when the old drawing has the same points, else at once with a blink. */
  function present(next, { canMorph }) {
    const same = shown && canMorph && shown.ys.length === next.ys.length && shown.grid.points === next.grid.points;
    scene = next;
    if (same && !prefersReducedMotion()) {
      morph = { from: cloneScene(shown), start: performance.now(), fromNorm: shown.normalization };
      shown = cloneScene(shown);
      shown.normalization = next.normalization;
      shown.grid = next.grid;
      shown.xs = next.xs;
      request();
      return;
    }
    morph = null;
    shown = cloneScene(next);
    committed = front >= s.n ? next.grid.points : pointsUpTo(next.grid, front);
    drawBase();
    drawPaths();
    drawOverlay();
    if (same || canMorph === false) blink(canvasWrap);
  }

  /* ---------------------------------------------------------------- drawing */

  function drawTicks(c, domain, ticks, alpha) {
    const y = yScale(domain);
    const { plot, strips } = layout;
    const right = strips[1].x + strips[1].w;
    c.globalAlpha = alpha;
    c.lineWidth = 1;
    c.font = formFont(pal, 10.5);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (const v of ticks) {
      const py = Math.round(y(v)) + 0.5;
      if (py < plot.y - 0.5 || py > plot.y + plot.h + 0.5) continue;
      c.strokeStyle = v === 0 ? pal.ruling : pal.rulingMinor;
      c.beginPath();
      c.moveTo(plot.x, py);
      c.lineTo(right, py);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(formatNumber(v, 3), plot.x - 6, py);
    }
    c.globalAlpha = 1;
  }

  function drawBase() {
    const c = ctx.base;
    clearLayer(c);
    const { plot, strips } = layout;
    const e = morph ? easeOut((performance.now() - morph.start) / MORPH_MS) : 1;
    const count = plot.h < 220 ? 4 : 6;
    // The old scale fades out where it stood and the new one fades in where it will stand.
    if (morph) drawTicks(c, morph.from.domain, niceTicks(...morph.from.domain, count), 1 - e);
    drawTicks(c, scene.domain, niceTicks(...scene.domain, count), e);

    // vertical rulings at round numbers of systems
    c.font = formFont(pal, 10.5);
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const k of niceTicks(0, s.n, plot.w < 300 ? 3 : 5)) {
      const px = Math.round(xOf(k)) + 0.5;
      c.strokeStyle = pal.rulingMinor;
      c.beginPath();
      c.moveTo(px, plot.y);
      c.lineTo(px, plot.y + plot.h);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(k.toLocaleString('en-GB'), px, plot.y + plot.h + 6);
    }

    // the band of two standard deviations, printed under the trajectories
    const { xs, lo, hi } = shown;
    c.fillStyle = pal.rulingMinor;
    c.globalAlpha = 0.7;
    c.save();
    c.beginPath();
    c.rect(plot.x, plot.y, plot.w, plot.h);
    c.clip();
    c.beginPath();
    c.moveTo(xs[0], hi[0]);
    for (let i = 1; i < xs.length; i += 1) c.lineTo(xs[i], hi[i]);
    for (let i = xs.length - 1; i >= 0; i -= 1) c.lineTo(xs[i], lo[i]);
    c.closePath();
    c.fill();
    c.restore();
    c.globalAlpha = 1;

    // frame of the plot and baselines of the two histograms
    c.strokeStyle = pal.rulingInk;
    c.lineWidth = 1.25;
    c.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
    c.lineWidth = 1;
    for (const strip of strips) {
      c.beginPath();
      c.moveTo(Math.round(strip.x) + 0.5, plot.y);
      c.lineTo(Math.round(strip.x) + 0.5, plot.y + plot.h);
      c.stroke();
    }

    // axis titles
    c.fillStyle = pal.rulingInk;
    c.font = formFont(pal, 10.5, 600);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(`${NORMALIZATIONS[scene.normalization].name}, ${RUNNING[scene.normalization]}`, 4, plot.y - 10);
    c.textAlign = 'center';
    c.fillText('Systems attacked, k', plot.x + plot.w / 2, plot.y + plot.h + 32);
  }

  function pathStyle(c) {
    c.strokeStyle = pal.plot;
    c.globalAlpha = trajectoryAlpha(s.m);
    c.lineWidth = s.m <= 3 ? 1.5 : s.m <= 20 ? 1.25 : 1;
    c.lineJoin = 'round';
  }

  /** Draws the points [from, to) of every trajectory on the paths layer, joined to the point before. */
  function strokePaths(from, to) {
    if (to <= from) return;
    const c = ctx.paths;
    const P = shown.grid.points;
    const { xs, ys } = shown;
    pathStyle(c);
    c.save();
    c.beginPath();
    c.rect(layout.plot.x, layout.plot.y, layout.plot.w, layout.plot.h);
    c.clip();
    const start = Math.max(0, from - 1);
    for (let j = 0; j < s.m; j += 1) {
      const base = j * P;
      c.beginPath();
      c.moveTo(xs[start], ys[base + start]);
      for (let i = start + 1; i < to; i += 1) c.lineTo(xs[i], ys[base + i]);
      if (to - start === 1) c.lineTo(xs[start] + 0.5, ys[base + start]);
      c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function drawPaths() {
    clearLayer(ctx.paths);
    strokePaths(0, committed);
  }

  function drawHistogram(c, strip, k, alpha) {
    if (k < 1) return;
    const { plot } = layout;
    const domain = scene.domain;
    const y = yScale(domain);
    const scores = scoresAt(paths, k);
    const span = law.high - law.low;
    const d = NORMALIZATIONS[scene.normalization].divisor(k);
    let kMin = Infinity;
    let kMax = -Infinity;
    for (const v of scores) {
      const K = (v - k * law.low) / span;
      if (K < kMin) kMin = K;
      if (K > kMax) kMax = K;
    }
    const pxPerK = (plot.h * span) / (d * (domain[1] - domain[0]));
    const group = histogramGroup({ kSpan: kMax - kMin + 1, m: s.m, pxPerK });
    const h = latticeHistogram(scores, { law, k, normalization: scene.normalization, group });
    const th = scoreMoments(law, k)[scene.normalization];
    const peakBar = Math.max(...h.bins.map((b) => b.density));
    const peak = Math.max(peakBar, normPdf(0) / th.sd);
    const sx = (strip.w - 3) / peak;
    c.globalAlpha = alpha;
    c.fillStyle = pal.plot;
    for (const b of h.bins) {
      if (!b.count) continue;
      const top = y(b.hi);
      const bottom = y(b.lo);
      const inset = bottom - top > 4 ? 0.5 : 0;
      c.fillRect(strip.x + 1, top + inset, Math.max(1, b.density * sx), Math.max(1, bottom - top - 2 * inset));
    }
    c.strokeStyle = pal.ink;
    c.lineWidth = 1.25;
    c.beginPath();
    for (let py = plot.y; py <= plot.y + plot.h; py += 2) {
      const v = valueAt(domain, py);
      const px = strip.x + 1 + (normPdf((v - th.mean) / th.sd) / th.sd) * sx;
      if (py === plot.y) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  function drawOverlay() {
    const c = ctx.over;
    clearLayer(c);
    const { plot, strips } = layout;
    const { xs, mean, lo, hi } = shown;
    const e = morph ? easeOut((performance.now() - morph.start) / MORPH_MS) : 1;

    c.save();
    c.beginPath();
    c.rect(plot.x, plot.y, plot.w, plot.h);
    c.clip();

    // μ ± ε on the average score, faded in or out where it stands
    const epsLines = [];
    if (scene.normalization === 'average') epsLines.push([scene.domain, morph && morph.fromNorm !== 'average' ? e : 1]);
    if (morph?.fromNorm === 'average' && scene.normalization !== 'average') epsLines.push([morph.from.domain, 1 - e]);
    for (const [domain, alpha] of epsLines) {
      const y = yScale(domain);
      c.globalAlpha = alpha;
      c.strokeStyle = pal.inkSoft;
      c.setLineDash([1.5, 3]);
      c.lineWidth = 1.25;
      for (const v of [law.mean - s.eps, law.mean + s.eps]) {
        c.beginPath();
        c.moveTo(plot.x, y(v));
        c.lineTo(plot.x + plot.w, y(v));
        c.stroke();
      }
      c.setLineDash([]);
      c.globalAlpha = 1;
    }

    // the edges of the band and the theoretical mean
    c.strokeStyle = pal.rulingInk;
    c.lineWidth = 1;
    c.setLineDash([5, 3]);
    for (const edge of [lo, hi]) {
      c.beginPath();
      c.moveTo(xs[0], edge[0]);
      for (let i = 1; i < xs.length; i += 1) c.lineTo(xs[i], edge[i]);
      c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = pal.ink;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(xs[0], mean[0]);
    for (let i = 1; i < xs.length; i += 1) c.lineTo(xs[i], mean[i]);
    c.stroke();

    // the attackers on their way: the segment towards the front, and a point at each head
    const P = shown.grid.points;
    if (front < s.n && committed > 0 && committed < P) {
      const i0 = committed - 1;
      const f = Math.min(1, Math.max(0, (front - shown.grid.xs[i0]) / (shown.grid.xs[committed] - shown.grid.xs[i0])));
      const hx = xs[i0] + (xs[committed] - xs[i0]) * f;
      pathStyle(c);
      for (let j = 0; j < s.m; j += 1) {
        const a = shown.ys[j * P + i0];
        c.beginPath();
        c.moveTo(xs[i0], a);
        c.lineTo(hx, a + (shown.ys[j * P + committed] - a) * f);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = pal.plot;
      const r = s.m > 100 ? 1.6 : s.m > 20 ? 2 : 2.75;
      c.beginPath();
      for (let j = 0; j < s.m; j += 1) {
        const a = shown.ys[j * P + i0];
        const hy = a + (shown.ys[j * P + committed] - a) * f;
        c.moveTo(hx + r, hy);
        c.arc(hx, hy, r, 0, 2 * Math.PI);
      }
      c.fill();
    }
    c.restore();

    // the intermediate step t
    const reached = front >= s.t;
    const tx = Math.round(xOf(s.t)) + 0.5;
    c.strokeStyle = reached ? pal.ink : pal.inkFaint;
    c.lineWidth = 1;
    if (!reached) c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(tx, plot.y);
    c.lineTo(tx, plot.y + plot.h);
    c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.arc(tx, plot.y, 4.5, 0, 2 * Math.PI);
    c.fillStyle = reached ? pal.plot : pal.paper;
    c.fill();
    c.lineWidth = 1.25;
    c.strokeStyle = reached ? pal.paper : pal.ink;
    c.stroke();
    c.font = `italic ${formFont(pal, 11, 600)}`;
    c.fillStyle = pal.ink;
    // the name of the cursor, inside the frame beside the handle, clear of the axis title
    c.textAlign = tx > plot.x + plot.w - 16 ? 'right' : 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('t', tx + (c.textAlign === 'left' ? 6 : -6), plot.y + 17);

    // the histograms across the attackers, at t and at the front; narrow strips name the step only
    const k = Math.floor(front);
    const histAlpha = morph ? e : 1;
    const wide = strips[0].w >= 76;
    c.font = formFont(pal, 10.5, 600);
    c.fillStyle = pal.rulingInk;
    c.textAlign = 'left';
    c.fillText(wide ? `at t = ${s.t.toLocaleString('en-GB')}` : 't', strips[0].x, plot.y - 10);
    const atFront = k >= s.n ? ['n', s.n] : ['k', k];
    c.fillText(wide ? `at ${atFront[0]} = ${atFront[1].toLocaleString('en-GB')}` : atFront[0], strips[1].x, plot.y - 10);
    if (reached) drawHistogram(c, strips[0], s.t, histAlpha);
    drawHistogram(c, strips[1], k, histAlpha);
  }

  /* ------------------------------------------------------------- animation */

  function request() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    let again = false;
    if (morph) {
      const e = easeOut((now - morph.start) / MORPH_MS);
      const { from } = morph;
      lerpInto(shown.ys, from.ys, scene.ys, e);
      lerpInto(shown.mean, from.mean, scene.mean, e);
      lerpInto(shown.lo, from.lo, scene.lo, e);
      lerpInto(shown.hi, from.hi, scene.hi, e);
      lerpInto(shown.domain, from.domain, scene.domain, e);
      drawBase();
      drawPaths();
      if (e >= 1) morph = null;
      else again = true;
    }
    if (playing) {
      front = frontAt(now - playStart, playDuration(s.n), s.n);
      const upto = pointsUpTo(shown.grid, front);
      if (upto > committed) {
        strokePaths(committed, upto);
        committed = upto;
      }
      progress.textContent = progressText();
      if (front >= s.n) {
        setPlaying(false);
        scheduleReadout();
      } else again = true;
    }
    drawOverlay();
    if (again) request();
  }

  function progressText() {
    if (front >= s.n) return `All ${s.n.toLocaleString('en-GB')} systems attacked by every attacker.`;
    if (front < 1) return 'No system attacked yet.';
    return `System ${Math.floor(front).toLocaleString('en-GB')} of ${s.n.toLocaleString('en-GB')}.`;
  }

  function setPlaying(on) {
    playing = on;
    playButton.setAttribute('aria-pressed', String(on));
    playLabel.textContent = on ? 'Pause' : front > 0 && front < s.n ? 'Resume' : 'Play';
    playButton.querySelector('svg').outerHTML = on ? ICONS.pause : ICONS.play;
    progress.textContent = progressText();
  }

  function play() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (prefersReducedMotion()) {
      // No travel: the final state at once, acknowledged by a blink.
      front = s.n;
      committed = shown.grid.points;
      drawPaths();
      drawOverlay();
      setPlaying(false);
      blink(canvasWrap);
      scheduleReadout();
      return;
    }
    morph = null;
    if (front >= s.n) {
      front = 0;
      committed = 0;
      shown = cloneScene(scene);
      drawBase();
      clearLayer(ctx.paths);
    }
    playStart = performance.now() - (front / s.n) * playDuration(s.n);
    setPlaying(true);
    request();
  }

  function reset() {
    front = 0;
    committed = 0;
    if (morph) {
      morph = null;
      shown = cloneScene(scene);
      drawBase();
    }
    clearLayer(ctx.paths);
    drawOverlay();
    setPlaying(false);
  }

  /** Any change of the run itself finishes the attack: every attacker has crossed the n systems. */
  function finish() {
    if (playing) setPlaying(false);
    front = s.n;
  }

  /* --------------------------------------------------------------- readout */

  function renderTable(readout) {
    const label = NORMALIZATIONS[s.normalization].label;
    const [t, n] = readout.steps;
    const head =
      `<thead><tr><th scope="col" rowspan="2">${label}</th>` +
      `<th scope="colgroup" colspan="2" class="is-number">After t = ${t.toLocaleString('en-GB')} systems</th>` +
      `<th scope="colgroup" colspan="2" class="is-number">After n = ${n.toLocaleString('en-GB')} systems</th></tr>` +
      `<tr><th scope="col" class="is-number">Simulated</th><th scope="col" class="is-number">Theory</th>` +
      `<th scope="col" class="is-number">Simulated</th><th scope="col" class="is-number">Theory</th></tr></thead>`;
    const rows = readout.rows
      .map(
        (r) =>
          `<tr><th scope="row">${r.label}</th>` +
          r.cells.map((cell) => `<td class="is-number">${formatNumber(cell.simulated)}</td><td class="is-number">${formatNumber(cell.theory)}</td>`).join('') +
          `</tr>`,
      )
      .join('');
    table.innerHTML = `<caption class="visually-hidden">Moments of ${label} across the ${s.m} attackers, simulated against theory</caption>${head}<tbody>${rows}</tbody>`;
  }

  function scheduleReadout({ now = false } = {}) {
    if (!readoutFrame) {
      readoutFrame = requestAnimationFrame(() => {
        readoutFrame = 0;
        const readout = simulatorReadout({ law, paths, n: s.n, t: s.t, normalization: s.normalization, eps: s.eps });
        renderTable(readout);
        const label = NORMALIZATIONS[s.normalization].label;
        canvasWrap.setAttribute(
          'aria-label',
          `Trajectories of ${s.m} attackers over ${s.n} systems, drawn as ${label}, with the theoretical mean and the band of two standard deviations; ` +
            `beside them, histograms of ${label} across the attackers after t = ${s.t} and after n = ${s.n} systems. The table below gives their moments.`,
        );
        clearTimeout(announceTimer);
        announceTimer = setTimeout(
          () => announce(status, simulatorSummary({ law, n: s.n, m: s.m, t: s.t, normalization: s.normalization, eps: s.eps, seed: s.seed }, readout)),
          now ? 0 : 900,
        );
      });
    }
  }

  function renderProvenance() {
    provenance.textContent =
      `Simulated in the browser: Mulberry32 generator, seed ${s.seed}; attacker j uses draws j·n + 1 to (j + 1)·n of one stream, ` +
      `${(s.m * s.n).toLocaleString('en-GB')} draws in all. Theory: Sₙ = n·low + (high − low)·K with K binomial.`;
  }

  /* --------------------------------------------------------------- changes */

  /** Re-runs the simulation and shows it; a morph is possible when the shape of the run is unchanged. */
  function rerun({ canMorph }) {
    finish();
    simulate();
    if (!layout) return;
    present(buildScene(), { canMorph });
    setPlaying(false);
    renderProvenance();
    scheduleReadout();
  }

  function syncT() {
    const tInput = input('t');
    tInput.max = String(s.n);
    tInput.value = String(s.t);
    tInput.setAttribute('aria-valuetext', `t = ${s.t} of ${s.n} systems`);
    output('t').textContent = `t = ${s.t.toLocaleString('en-GB')}`;
  }

  function setT(t) {
    const next = Math.min(s.n, Math.max(1, Math.round(t)));
    if (next === s.t) return;
    s.t = next;
    syncT();
    if (layout && !raf) drawOverlay();
    scheduleReadout();
  }

  function setRange(key, valueText, text) {
    input(key).setAttribute('aria-valuetext', valueText);
    output(key).textContent = text;
  }

  let rerunFrame = 0;
  /** Coalesces the input events of a dragged slider into one simulation per frame. */
  function rerunSoon(opts) {
    cancelAnimationFrame(rerunFrame);
    rerunFrame = requestAnimationFrame(() => rerun(opts));
  }

  for (const radio of panel.querySelectorAll('input[name="sim-model"]')) {
    radio.addEventListener('change', () => {
      s.model = radio.value;
      input('p').disabled = s.model !== 'bernoulli';
      pField.classList.toggle('is-disabled', s.model !== 'bernoulli');
      rerun({ canMorph: true });
    });
  }
  input('p').addEventListener('input', () => {
    s.p = clampP(Number(input('p').value) / 100);
    setRange('p', `p = ${s.p.toFixed(2)}`, s.p.toFixed(2));
    rerunSoon({ canMorph: true });
  });
  input('n').addEventListener('input', () => {
    const n = SIM_N_STOPS[Number(input('n').value)];
    if (n === s.n) return;
    s.t = Math.max(1, Math.round((s.t / s.n) * n));
    s.n = n;
    setRange('n', `n = ${n} systems`, n.toLocaleString('en-GB'));
    syncT();
    rerunSoon({ canMorph: false });
  });
  input('m').addEventListener('input', () => {
    const m = SIM_M_STOPS[Number(input('m').value)];
    if (m === s.m) return;
    s.m = m;
    setRange('m', `m = ${m} attackers`, m.toLocaleString('en-GB'));
    rerunSoon({ canMorph: false });
  });
  input('eps').addEventListener('input', () => {
    s.eps = Number(input('eps').value) / 100;
    setRange('eps', `ε = ${s.eps.toFixed(2)}`, s.eps.toFixed(2));
    if (layout && !raf) drawOverlay();
    scheduleReadout();
  });
  for (const radio of panel.querySelectorAll('input[name="sim-quantity"]')) {
    radio.addEventListener('change', () => {
      s.normalization = radio.value;
      if (playing) setPlaying(false);
      if (!layout) return;
      present(buildScene(), { canMorph: true });
      scheduleReadout({ now: true });
    });
  }

  function commitSeed(seed) {
    s.seed = seed;
    seedField.value = String(seed);
    seedField.removeAttribute('aria-invalid');
    seedNote.removeAttribute('data-kind');
    seedNote.textContent = 'Mulberry32; any whole number from 0 to 4294967295.';
    rerun({ canMorph: true });
  }
  seedField.addEventListener('change', () => {
    const parsed = parseSeed(seedField.value);
    if (!parsed.ok) {
      seedField.setAttribute('aria-invalid', 'true');
      seedNote.dataset.kind = 'error';
      seedNote.textContent = `${parsed.message} The run still uses seed ${s.seed}.`;
      return;
    }
    if (parsed.seed !== s.seed) commitSeed(parsed.seed);
  });
  $('[data-sim-reseed]').addEventListener('click', () => commitSeed(freshSeed()));
  playButton.addEventListener('click', play);
  $('[data-sim-reset]').addEventListener('click', reset);
  input('t').addEventListener('input', () => setT(Number(input('t').value)));

  // Dragging the step t on the plot itself; the slider below is the keyboard path.
  const over = layers.over;
  let dragging = false;
  const tFromEvent = (event) => {
    const rect = over.getBoundingClientRect();
    return ((event.clientX - rect.left - layout.plot.x) / layout.plot.w) * s.n;
  };
  over.addEventListener('pointerdown', (event) => {
    if (!layout) return;
    const rect = over.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < layout.plot.x - 8 || x > layout.plot.x + layout.plot.w + 8) return;
    dragging = true;
    over.setPointerCapture(event.pointerId);
    setT(tFromEvent(event));
  });
  over.addEventListener('pointermove', (event) => {
    if (dragging) setT(tFromEvent(event));
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    over.releasePointerCapture?.(event.pointerId);
  };
  over.addEventListener('pointerup', endDrag);
  over.addEventListener('pointercancel', endDrag);

  /* ------------------------------------------------------------------ mount */

  simulate();
  syncT();
  renderProvenance();
  attachPanel(mount, panel);
  pal = readPalette(panel);

  stops.push(
    watchSize(canvasWrap, ({ width, height }) => {
      layout = simulatorLayout(width, height);
      ctx = {
        base: sizeLayer(layers.base, width, height),
        paths: sizeLayer(layers.paths, width, height),
        over: sizeLayer(layers.over, width, height),
      };
      panel.style.setProperty('--sim-plot-x', `${layout.plot.x}px`);
      panel.style.setProperty('--sim-plot-w', `${layout.plot.w}px`);
      morph = null;
      shown = null;
      present(buildScene(), { canMorph: null });
      if (playing) request();
    }),
  );
  stops.push(
    watchVisibility(panel, (isVisible) => {
      visible = isVisible;
      if (!isVisible) {
        cancelAnimationFrame(raf);
        raf = 0;
        if (playing) playStart = performance.now() - (front / s.n) * playDuration(s.n);
      } else if (playing || morph) {
        if (playing) playStart = performance.now() - (front / s.n) * playDuration(s.n);
        request();
      }
    }),
  );
  document.fonts?.ready.then(() => {
    if (layout && !raf) {
      drawBase();
      drawOverlay();
    }
  });
  setPlaying(false);
  scheduleReadout();

  return function destroy() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(readoutFrame);
    cancelAnimationFrame(rerunFrame);
    clearTimeout(announceTimer);
    for (const stop of stops) stop();
  };
}

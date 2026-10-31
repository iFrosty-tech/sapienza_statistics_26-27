/**
 * Panel 1 (§3): m hackers over n systems, live. The reader chooses n and m; the
 * law of the scores is fixed. For each of the two estimates the panel draws the
 * running paths of a few hackers against the exact band of two standard
 * deviations and, beside them, the histogram across all m hackers at the step
 * reached, against its normal approximation. A table sets the two averages
 * against μ and σ².
 *
 * The motion is the algorithm. Play starts every hacker from an empty state and
 * advances all of them through Welford's recurrences one system at a time
 * (src/hw06/model.js): the paths grow and the histograms tighten around the
 * theoretical value while the two averages stay on it, which is the argument of
 * the page in one view. Both vertical axes are fixed, so that the narrowing is
 * the spread itself and not a change of scale. A change of n or m finishes the
 * run at once and eases the bars of the histograms from the old shape to the
 * new one. Under reduced motion the final state is drawn at once and a blink
 * acknowledges the change. Nothing runs while the panel is off screen.
 */

import { freshSeed, normPdf } from '../lib/normal.js';
import { prefersReducedMotion } from '../lib/figures.js';
import { DURATION, announce, attachPanel, blink, panelFrame } from '../hw03/motion.js';
import { clearLayer, formFont, readPalette, sizeLayer, watchSize, watchVisibility } from '../hw04/canvas.js';
import { formatNumber, frontAt, nearestStop, niceTicks, playDuration } from '../hw04/model.js';
import {
  DOMAINS,
  M_STOPS,
  N_STOPS,
  advanceRun,
  bandAt,
  barGroup,
  createRun,
  easeBars,
  estimates,
  groupBars,
  histogramBars,
  panelLayout,
  parseMountOptions,
  readRun,
  runSummary,
} from './model.js';

const QUANTITIES = [
  { key: 'mean', caption: 'Running sampling mean', name: 'Sampling mean' },
  { key: 'variance', caption: 'Running sampling variance', name: 'Sampling variance' },
];

const ICONS = {
  play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h2.75v11H4zM9.25 2.5H12v11H9.25z" fill="currentColor"/></svg>',
};

const count = (v) => v.toLocaleString('en-GB');

function rangeField({ key, caption, stops, value, noun }) {
  return (
    `<label class="sim-range" data-smp-field="${key}">` +
    `<span class="sim-range__head"><span class="caption caption--math">${caption}</span>` +
    `<output class="sim-range__value" data-smp-out="${key}">${count(value)}</output></span>` +
    `<input type="range" data-smp-input="${key}" min="0" max="${stops.length - 1}" step="1" value="${nearestStop(stops, value)}" aria-valuetext="${key} = ${count(value)} ${noun}" />` +
    `</label>`
  );
}

function body(s) {
  const figures = QUANTITIES.map(
    (q) => `<div class="smp-canvas" data-smp-canvas="${q.key}" role="img" aria-label="${q.caption}"><canvas class="sim-layer"></canvas></div>`,
  ).join('');
  return (
    `<div class="sim-controls">` +
    rangeField({ key: 'n', caption: 'Systems per hacker n', stops: N_STOPS, value: s.n, noun: 'systems' }) +
    rangeField({ key: 'm', caption: 'Hackers m', stops: M_STOPS, value: s.m, noun: 'hackers' }) +
    `</div>` +
    `<div class="sim-transport">` +
    `<button type="button" class="form-button" data-smp-play aria-pressed="false">${ICONS.play}<span data-smp-play-label>Play</span></button>` +
    `<button type="button" class="form-button" data-smp-resample>New sample</button>` +
    `<p class="sim-transport__progress" data-smp-progress></p>` +
    `</div>` +
    `<div class="smp-figures">${figures}</div>` +
    `<ul class="sim-legend" aria-label="Key">` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 8 L8 4 L14 6 L21 2" class="sim-legend__path"/></svg>One hacker’s running estimate</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 5 H21" class="sim-legend__mean"/></svg>μ or σ²</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><rect x="1" y="1" width="20" height="8" class="sim-legend__band"/></svg>Exact ± 2 standard deviations</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><rect x="1" y="2" width="13" height="6" class="sim-legend__bar"/><path d="M1 9 C8 9 12 1 21 1" class="sim-legend__curve"/></svg>All hackers at the step reached, with the normal approximation</li>` +
    `<li><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" class="clt-legend__point"/></svg>Average over the hackers</li>` +
    `</ul>` +
    `<div class="data-table--scroll" tabindex="0" role="region" aria-label="The two averages against theory">` +
    `<table class="data-table data-table--compact data-table--math sim-readout smp-readout" data-smp-table></table></div>`
  );
}

export function mountSamplingDemo(mount) {
  const options = parseMountOptions(mount.dataset);
  const s = { n: 200, m: 1000, seed: options.seed };

  const { panel, $ } = panelFrame({
    id: 'demo-smp',
    number: 1,
    title: 'm hackers over n systems<span class="pplot__provenance">Simulated</span>',
    lede:
      'Each hacker’s scores go through Welford’s recurrences as they arrive. Press Play to advance every hacker one system at a time and watch the two histograms tighten around μ and σ² while the averages stay on them; move n and m to repeat the experiment.',
    body: body(s),
    provenance: '',
  });

  const input = (key) => $(`[data-smp-input="${key}"]`);
  const output = (key) => $(`[data-smp-out="${key}"]`);
  const playButton = $('[data-smp-play]');
  const playLabel = $('[data-smp-play-label]');
  const progress = $('[data-smp-progress]');
  const table = $('[data-smp-table]');
  const provenance = $('.demo-panel__provenance');
  const status = $('[data-status]');

  const views = Object.fromEntries(
    QUANTITIES.map((q) => {
      const wrap = $(`[data-smp-canvas="${q.key}"]`);
      return [q.key, { ...q, wrap, canvas: wrap.querySelector('canvas'), ctx: null, layout: null, size: null, shown: null, from: null, target: null }];
    }),
  );

  let run = null;
  let pal = null;
  let front = 0; // the step the hackers have reached, fractional while playing
  let playing = false;
  let playStart = 0;
  let raf = 0;
  let visible = true;
  let ease = null; // { start } while the bars ease towards a new target
  let announceTimer = 0;
  let readoutTick = 0;
  let rerunFrame = 0;
  const stops = [];

  /* ------------------------------------------------------------ simulation */

  /** A new run of the same n, m and seed, complete. */
  function simulate() {
    run = createRun(s);
    advanceRun(run, s.n);
    front = s.n;
  }

  /* ---------------------------------------------------------------- bars */

  function targetBars(view) {
    const bins = Math.max(8, Math.floor(view.layout.plot.h / 2));
    if (run.k < (view.key === 'mean' ? 1 : 2)) return { counts: new Float32Array(bins), peak: 0 };
    return histogramBars(estimates(run, view.key), DOMAINS[view.key], bins);
  }

  /** The expected number of hackers in a bar under the normal approximation, at the value v. */
  function normalCount(view, bars, v) {
    const band = bandAt(view.key, run.k);
    if (!band) return 0;
    const [d0, d1] = DOMAINS[view.key];
    return (normPdf((v - band.centre) / band.sd) / band.sd) * run.m * ((d1 - d0) / bars);
  }

  function retarget({ animate }) {
    for (const view of Object.values(views)) {
      if (!view.layout) continue;
      const next = targetBars(view);
      const same = view.shown?.length === next.counts.length;
      view.from = same && animate ? view.shown.slice() : next.counts.slice();
      view.target = next.counts;
      view.shown = same && animate ? view.shown : next.counts.slice();
    }
    ease = animate ? { start: performance.now() } : null;
  }

  /* ------------------------------------------------------------- drawing */

  function drawView(view) {
    const { ctx: c, layout, key, shown, size } = view;
    const { plot, strip } = layout;
    const domain = DOMAINS[key];
    const [d0, d1] = domain;
    const y = (v) => plot.y + plot.h * (1 - (v - d0) / (d1 - d0));
    const x = (k) => plot.x + (plot.w * k) / s.n;
    const k = Math.floor(front);
    clearLayer(c);

    // the rulings, printed under everything
    c.lineWidth = 1;
    c.font = formFont(pal, 10.5);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    const right = strip.x + strip.w;
    for (const v of niceTicks(d0, d1, 5)) {
      const py = Math.round(y(v)) + 0.5;
      c.strokeStyle = pal.rulingMinor;
      c.beginPath();
      c.moveTo(plot.x, py);
      c.lineTo(right, py);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(formatNumber(v, 3), plot.x - 6, py);
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (const v of niceTicks(0, s.n, plot.w < 300 ? 3 : 5)) {
      const px = Math.round(x(v)) + 0.5;
      c.strokeStyle = pal.rulingMinor;
      c.beginPath();
      c.moveTo(px, plot.y);
      c.lineTo(px, plot.y + plot.h);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(count(v), px, plot.y + plot.h + 6);
    }

    // the exact band of two standard deviations
    c.save();
    c.beginPath();
    c.rect(plot.x, plot.y, plot.w, plot.h);
    c.clip();
    const first = key === 'mean' ? 1 : 2;
    const step = Math.max(1, Math.floor(s.n / plot.w));
    const edge = [];
    for (let i = first; i <= s.n; i += step) edge.push(i);
    if (edge.at(-1) !== s.n) edge.push(s.n);
    c.fillStyle = pal.rulingMinor;
    c.globalAlpha = 0.7;
    c.beginPath();
    edge.forEach((i, at) => {
      const b = bandAt(key, i);
      if (at) c.lineTo(x(i), y(b.high));
      else c.moveTo(x(i), y(b.high));
    });
    for (const i of edge.slice().reverse()) c.lineTo(x(i), y(bandAt(key, i).low));
    c.closePath();
    c.fill();
    c.globalAlpha = 1;

    // the theoretical value runs on under the histogram, where the average is read against it
    const centre = bandAt(key, Math.max(first, 2)).centre;
    c.restore();
    c.strokeStyle = pal.ink;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(plot.x, y(centre));
    c.lineTo(right, y(centre));
    c.stroke();

    // the running paths, as far as the hackers have come
    c.save();
    c.beginPath();
    c.rect(plot.x, plot.y, plot.w, plot.h);
    c.clip();
    c.strokeStyle = pal.plot;
    c.globalAlpha = 0.7;
    c.lineWidth = 1;
    c.lineJoin = 'round';
    const pathStep = Math.max(1, Math.floor(s.n / (2 * plot.w)));
    for (const path of run.paths) {
      const values = path[key];
      c.beginPath();
      let pen = false;
      for (let i = first - 1; i < k; i += i + 1 >= k - 1 ? 1 : pathStep) {
        const v = values[i];
        if (Number.isNaN(v)) continue;
        if (pen) c.lineTo(x(i + 1), y(v));
        else c.moveTo(x(i + 1), y(v));
        pen = true;
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    if (k >= first && k < s.n) {
      c.fillStyle = pal.plot;
      c.beginPath();
      for (const path of run.paths) {
        const py = y(path[key][k - 1]);
        c.moveTo(x(k) + 2.25, py);
        c.arc(x(k), py, 2.25, 0, 2 * Math.PI);
      }
      c.fill();
    }
    c.restore();

    // the frame and the histogram's baseline
    c.strokeStyle = pal.rulingInk;
    c.lineWidth = 1.25;
    c.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(Math.round(strip.x) + 0.5, plot.y);
    c.lineTo(Math.round(strip.x) + 0.5, plot.y + plot.h);
    c.stroke();

    // the histogram across all hackers, sideways on the same axis
    if (shown) {
      const group = barGroup(view.target ?? shown);
      const bars = groupBars(shown, group);
      const drawn = bars.counts.length;
      const barH = (plot.h * group) / shown.length;
      const band = bandAt(key, run.k);
      const peak = Math.max(bars.peak, band ? normalCount(view, shown.length / group, band.centre) : 0, 1);
      const scale = (strip.w - 4) / peak;
      c.fillStyle = pal.plot;
      for (let b = 0; b < drawn; b += 1) {
        if (bars.counts[b] < 0.5) continue;
        // Whole pixel rows, so that neighbouring bars join without a seam.
        const top = Math.max(plot.y, Math.round(plot.y + plot.h - (b + 1) * barH));
        const bottom = Math.round(plot.y + plot.h - b * barH);
        c.fillRect(strip.x + 1, top, Math.max(1, bars.counts[b] * scale), Math.max(1, bottom - top));
      }
      if (band) {
        c.strokeStyle = pal.ink;
        c.lineWidth = 1.25;
        c.beginPath();
        for (let py = plot.y; py <= plot.y + plot.h; py += 1) {
          const v = d0 + (1 - (py - plot.y) / plot.h) * (d1 - d0);
          const px = strip.x + 1 + normalCount(view, shown.length / group, v) * scale;
          if (py === plot.y) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
    }

    // the average over the hackers, on the baseline of the histogram
    const reading = readRun(run)[key];
    if (reading.average !== null) {
      const py = y(Math.min(d1, reading.average));
      c.beginPath();
      c.arc(strip.x + 1, py, 4, 0, 2 * Math.PI);
      c.fillStyle = pal.plot;
      c.fill();
      c.strokeStyle = pal.paper;
      c.lineWidth = 1.25;
      c.stroke();
    }

    // printed captions
    c.fillStyle = pal.rulingInk;
    c.font = formFont(pal, 10.5, 600);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(view.caption, 4, plot.y - 10);
    c.textAlign = 'left';
    c.fillText(size.width >= 420 ? `at k = ${count(k)}` : `k = ${count(k)}`, strip.x, plot.y - 10);
    c.textAlign = 'center';
    c.fillText('Systems attempted, k', plot.x + plot.w / 2, plot.y + plot.h + 32);
  }

  function drawAll() {
    for (const view of Object.values(views)) if (view.layout) drawView(view);
  }

  /* ------------------------------------------------------------- animation */

  function request() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    let again = false;
    if (ease) {
      const x = (now - ease.start) / DURATION.slide;
      for (const view of Object.values(views)) if (view.layout) easeBars(view.shown, view.from, view.target, x);
      if (x >= 1) ease = null;
      else again = true;
    }
    if (playing) {
      front = frontAt(now - playStart, playDuration(s.n), s.n);
      advanceRun(run, front);
      retarget({ animate: false });
      progress.textContent = progressText();
      readoutTick += 1;
      if (readoutTick % 6 === 0) renderTable();
      if (front >= s.n) {
        setPlaying(false);
        renderTable();
        scheduleAnnouncement();
      } else again = true;
    }
    drawAll();
    if (again) request();
  }

  function progressText() {
    const k = Math.floor(front);
    if (k >= s.n) return `All ${count(s.n)} systems attempted by every hacker.`;
    if (k < 1) return 'No system attempted yet.';
    return `System ${count(k)} of ${count(s.n)}.`;
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
      renderTable();
      return;
    }
    if (prefersReducedMotion()) {
      // No travel: the final state at once, acknowledged by a blink.
      for (const view of Object.values(views)) blink(view.wrap);
      return;
    }
    if (front >= s.n) {
      run = createRun(s);
      front = 0;
    }
    ease = null;
    playStart = performance.now() - (front / s.n) * playDuration(s.n);
    setPlaying(true);
    request();
  }

  /* --------------------------------------------------------------- readout */

  function renderTable() {
    const r = readRun(run);
    const k = count(r.k);
    const cell = (v, digits = 4) => `<td class="is-number">${v === null ? '—' : formatNumber(v, digits)}</td>`;
    const row = (name, q) =>
      `<tr><th scope="row">${name}</th>${cell(q.theory)}${cell(q.average)}${cell(q.standardError, 2)}<td class="is-number">${q.z === null ? '—' : q.z.toFixed(2).replace('-', '−')}</td>${cell(q.sd)}${cell(q.exactSd)}</tr>`;
    table.innerHTML =
      `<caption class="visually-hidden">The averages of ${count(r.m)} hackers after ${k} systems against theory</caption>` +
      `<thead><tr><th scope="col">After k = ${k}</th><th scope="col" class="is-number">Theory</th><th scope="col" class="is-number">Average</th>` +
      `<th scope="col" class="is-number">Std error</th><th scope="col" class="is-number">z</th><th scope="col" class="is-number">SD across hackers</th><th scope="col" class="is-number">Exact SD</th></tr></thead>` +
      `<tbody>${row(QUANTITIES[0].name, r.mean)}${row(QUANTITIES[1].name, r.variance)}</tbody>`;
  }

  function scheduleAnnouncement() {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(status, runSummary(run, readRun(run))), 700);
  }

  function renderProvenance() {
    provenance.textContent =
      `Simulated in the browser: Mulberry32 generator, seed ${s.seed}, read system by system; ` +
      `one uniform per score, ${count(s.m * s.n)} draws in all. The study behind the tables uses its own streams.`;
  }

  /* --------------------------------------------------------------- changes */

  /** A complete new run, shown at once; the bars ease to their new shape unless motion is reduced. */
  function rerun() {
    const reduced = prefersReducedMotion();
    if (playing) setPlaying(false);
    simulate();
    retarget({ animate: !reduced });
    setPlaying(false);
    renderProvenance();
    renderTable();
    scheduleAnnouncement();
    if (reduced) for (const view of Object.values(views)) blink(view.wrap);
    if (ease) request();
    else drawAll();
  }

  /** Coalesces the input events of a dragged slider into one simulation per frame. */
  function rerunSoon() {
    cancelAnimationFrame(rerunFrame);
    rerunFrame = requestAnimationFrame(rerun);
  }

  function bindRange(key, stopsList, noun) {
    input(key).addEventListener('input', () => {
      const value = stopsList[Number(input(key).value)];
      if (value === s[key]) return;
      s[key] = value;
      input(key).setAttribute('aria-valuetext', `${key} = ${count(value)} ${noun}`);
      output(key).textContent = count(value);
      rerunSoon();
    });
  }
  bindRange('n', N_STOPS, 'systems');
  bindRange('m', M_STOPS, 'hackers');
  playButton.addEventListener('click', play);
  $('[data-smp-resample]').addEventListener('click', () => {
    s.seed = freshSeed();
    rerun();
  });

  /* ------------------------------------------------------------------ mount */

  simulate();
  renderProvenance();
  renderTable();
  attachPanel(mount, panel);
  pal = readPalette(panel);

  for (const view of Object.values(views)) {
    stops.push(
      watchSize(view.wrap, ({ width, height }) => {
        view.size = { width, height };
        view.layout = panelLayout(width, height);
        view.ctx = sizeLayer(view.canvas, width, height);
        retarget({ animate: false });
        drawAll();
      }),
    );
  }
  stops.push(
    watchVisibility(panel, (isVisible) => {
      visible = isVisible;
      if (!isVisible) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (playing || ease) {
        if (playing) playStart = performance.now() - (front / s.n) * playDuration(s.n);
        request();
      }
    }),
  );
  document.fonts?.ready.then(() => {
    if (!raf) drawAll();
  });
  setPlaying(false);

  return function destroy() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(rerunFrame);
    clearTimeout(announceTimer);
    for (const stop of stops) stop();
  };
}

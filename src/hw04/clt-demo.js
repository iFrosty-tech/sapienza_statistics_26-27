/**
 * Panel 2 (§7): the central limit theorem in the Rademacher model, live. For
 * the n chosen by the reader the panel draws the exact law of Sₙ/√n, bars on
 * its lattice of spacing 2/√n rescaled to a density, against the standard
 * normal density, optionally with the histogram of m simulated attackers, and
 * reports the exact Kolmogorov distance with its Berry–Esseen bound. Below, a
 * ridgeline sets the laws for n = 1, 2, 4, …, 1,024 one behind the other, as
 * on a sheet seen obliquely, ending in front with their limit N(0, 1).
 *
 * Every law, distance and bound comes from src/lib/penetration.js (through
 * src/hw04/model.js). Motion: Step through n walks the powers of two, each
 * staircase morphing into the next, so that the bars are seen to narrow and
 * settle under the bell; the chosen law is the red ridge of the landscape.
 * Under reduced motion each step is drawn at once and acknowledged by a blink.
 * Nothing runs while the panel is off screen.
 */

import { freshSeed, normPdf } from '../lib/normal.js';
import { prefersReducedMotion } from '../lib/figures.js';
import { incrementLaw, simulateScores } from '../lib/penetration.js';
import { DURATION, announce, attachPanel, blink, choiceGroup, panelFrame } from '../hw03/motion.js';
import { clearLayer, formFont, readPalette, sizeLayer, watchSize, watchVisibility } from './canvas.js';
import {
  CLT_N_STOPS,
  CLT_PLAYLIST,
  DEFAULT_SEED,
  cltExactLaw,
  cltReadout,
  cltSampleBins,
  cltSummary,
  easeOut,
  formatNumber,
  lerpInto,
  nearestStop,
  niceTicks,
  ridgeGeometry,
  stepDensity,
} from './model.js';

const RADEMACHER = incrementLaw('rademacher');
const Z_MAX = 4;
const Y_MAX = 0.45;
const N_MAX = CLT_N_STOPS.at(-1);
const SAMPLE_SIZES = [0, 200, 1000, 5000];
const MORPH_MS = DURATION.settle + 140;
const HOLD_MS = 1000;
const N_NOTE = 'Any whole number from 1 to 2,048; the scale steps through the powers of two and three times them.';

const ICONS = {
  play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h2.75v11H4zM9.25 2.5H12v11H9.25z" fill="currentColor"/></svg>',
};

const stat = (key, term) => `<div><dt>${term}</dt><dd data-clt-stat="${key}">—</dd></div>`;

function body(s) {
  return (
    `<div class="clt-controls">` +
    `<div class="clt-n">` +
    `<label class="sim-range"><span class="sim-range__head"><span class="caption caption--math">Systems n</span></span>` +
    `<input type="range" data-clt-range min="0" max="${CLT_N_STOPS.length - 1}" step="1" value="${nearestStop(CLT_N_STOPS, s.n)}" aria-valuetext="n = ${s.n}" /></label>` +
    `<label class="text-field clt-n__exact"><span class="caption caption--math">n, exactly</span>` +
    `<input type="number" data-clt-n min="1" max="${N_MAX}" step="1" value="${s.n}" inputmode="numeric" aria-describedby="clt-n-note" /></label>` +
    `<span class="text-field__note clt-n__note" id="clt-n-note" data-clt-n-note>${N_NOTE}</span>` +
    `</div>` +
    choiceGroup({
      name: 'clt-sample',
      legend: 'Simulated attackers',
      options: SAMPLE_SIZES.map((m) => ({ value: String(m), label: m === 0 ? 'None' : m.toLocaleString('en-GB') })),
      checked: String(s.m),
    }) +
    `</div>` +
    `<div class="sim-transport">` +
    `<button type="button" class="form-button" data-clt-play aria-pressed="false">${ICONS.play}<span data-clt-play-label>Step through 1, 2, 4, …, 1,024</span></button>` +
    `<button type="button" class="form-button" data-clt-resample>New sample</button>` +
    `</div>` +
    `<div class="clt-figure">` +
    `<div class="clt-canvas" data-clt-main role="img" aria-label="The exact law of Sₙ/√n against the standard normal density"><canvas class="sim-layer"></canvas></div>` +
    `<ul class="sim-legend" aria-label="Key">` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 9.5 V4.5 H8 V1.5 H15 V5.5 H21 V9.5" class="clt-legend__law"/></svg>Exact law of Sₙ/√n, as a density on its lattice</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><path d="M1 9 C7 9 8 1 11 1 C14 1 15 9 21 9" class="sim-legend__curve"/></svg>Standard normal density φ</li>` +
    `<li><svg width="22" height="10" aria-hidden="true"><circle cx="6" cy="6" r="2.5" class="clt-legend__point"/><circle cx="15" cy="3.5" r="2.5" class="clt-legend__point"/></svg>Simulated attackers: histogram density, bars cut on the lattice</li>` +
    `</ul>` +
    `</div>` +
    `<dl class="pplot__stats pplot__stats--math clt-stats">` +
    stat('n', 'n') +
    stat('spacing', 'Lattice spacing 2/√n') +
    stat('distance', 'Dₙ = sup |Fₙ − Φ|') +
    stat('bound', 'Berry–Esseen bound') +
    stat('scaled', '√n · Dₙ') +
    stat('sample', 'Sample distance D̂') +
    stat('dkw', 'DKW radius, 95%') +
    `</dl>` +
    `<p class="demo-panel__lede clt-stats__note">The sample distance is the Kolmogorov distance from Φ of the empirical law of the m simulated attackers. With probability at least 0.95 that empirical law lies within the DKW radius of the exact law, so that the sample distance differs from Dₙ by no more than the radius.</p>` +
    `<div class="clt-figure">` +
    `<p class="caption caption--math clt-ridge__title">The exact laws for n = 1, 2, 4, …, 1,024, from back to front, and their limit N(0, 1)</p>` +
    `<div class="clt-ridge" data-clt-ridge role="img"><canvas class="sim-layer sim-layer--top clt-ridge__canvas"></canvas></div>` +
    `</div>`
  );
}

export function mountCltDemo(mount) {
  const s = { n: 16, m: 0, seed: DEFAULT_SEED };

  const { panel, $ } = panelFrame({
    id: 'demo-clt',
    number: 2,
    title: 'The law of Sₙ/√n against the standard normal',
    lede:
      'In the Rademacher model Sₙ/√n takes the values (2k − n)/√n, k = 0, …, n, a lattice whose spacing 2/√n shrinks as n grows. Choose n, or step through its powers of two, to watch the exact law settle under the normal density; the Kolmogorov distance between the two falls like 1/√n, inside the Berry–Esseen bound.',
    body: body(s),
    provenance: '',
  });

  const mainWrap = $('[data-clt-main]');
  const ridgeWrap = $('[data-clt-ridge]');
  const mainCanvas = mainWrap.querySelector('canvas');
  const ridgeCanvas = ridgeWrap.querySelector('canvas');
  const range = $('[data-clt-range]');
  const nField = $('[data-clt-n]');
  const nNote = $('[data-clt-n-note]');
  const playButton = $('[data-clt-play]');
  const playLabel = $('[data-clt-play-label]');
  const resample = $('[data-clt-resample]');
  const provenance = $('.demo-panel__provenance');
  const status = $('[data-status]');
  const statCell = (key) => $(`[data-clt-stat="${key}"]`);

  const ridgeLaws = CLT_PLAYLIST.map(cltExactLaw);

  let pal = null;
  let main = null; // { ctx, width, height, plot, zs }
  let ridge = null; // { ctx, width, height, shapes }
  let target = null; // density of the exact law at the pixel columns
  let shown = null;
  let morph = null;
  let scores = null; // simulated Sₙ of the m attackers
  let cells = null; // their histogram on the lattice
  let readout = null;
  let raf = 0;
  let visible = true;
  let playing = false;
  let playTimer = 0;
  let pendingStep = -1;
  let announceTimer = 0;
  let inputFrame = 0;
  const stops = [];

  /* ---------------------------------------------------------------- model */

  function compute() {
    const law = cltExactLaw(s.n);
    scores = s.m > 0 ? simulateScores({ law: RADEMACHER, checkpoints: [s.n], m: s.m, seed: s.seed }).scores[0] : null;
    cells = binSample();
    readout = cltReadout(s.n, scores);
    target = main ? stepDensity(law, main.zs) : null;
  }

  function binSample() {
    return scores && main ? cltSampleBins(scores, s.n, main.plot.w / (2 * Z_MAX)) : null;
  }

  /* -------------------------------------------------------------- drawing */

  function layoutMain(width, height) {
    const plot = { x: 40, y: 12, w: width - 40 - 10, h: height - 12 - 40 };
    const zs = Float64Array.from({ length: Math.max(1, Math.round(plot.w)) }, (_, c) => -Z_MAX + (2 * Z_MAX * (c + 0.5)) / plot.w);
    return { plot, zs };
  }

  function drawMain() {
    const { ctx: c, plot, zs } = main;
    clearLayer(c);
    const xOf = (z) => plot.x + (plot.w * (z + Z_MAX)) / (2 * Z_MAX);
    const yOf = (d) => plot.y + plot.h * (1 - d / Y_MAX);
    const e = morph ? easeOut((performance.now() - morph.start) / MORPH_MS) : 1;

    // rulings and labels
    c.lineWidth = 1;
    c.font = formFont(pal, 10.5);
    c.textBaseline = 'middle';
    c.textAlign = 'right';
    for (const d of niceTicks(0, 0.4, 4)) {
      const y = Math.round(yOf(d)) + 0.5;
      c.strokeStyle = pal.rulingMinor;
      c.beginPath();
      c.moveTo(plot.x, y);
      c.lineTo(plot.x + plot.w, y);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(formatNumber(d, 2), plot.x - 6, y);
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let z = -Z_MAX; z <= Z_MAX; z += 1) {
      const x = Math.round(xOf(z)) + 0.5;
      c.strokeStyle = z === 0 ? pal.ruling : pal.rulingMinor;
      c.beginPath();
      c.moveTo(x, plot.y);
      c.lineTo(x, plot.y + plot.h);
      c.stroke();
      c.fillStyle = pal.inkSoft;
      c.fillText(formatNumber(z), x, plot.y + plot.h + 6);
    }
    c.fillStyle = pal.rulingInk;
    c.font = formFont(pal, 10.5, 600);
    c.fillText('Sₙ/√n', plot.x + plot.w / 2, plot.y + plot.h + 24);

    // the exact law: a staircase filled on the paper, outlined in green ink
    c.save();
    c.beginPath();
    c.rect(plot.x, plot.y, plot.w, plot.h);
    c.clip();
    const base = plot.y + plot.h;
    c.fillStyle = pal.rulingMinor;
    c.beginPath();
    c.moveTo(plot.x, base);
    for (let i = 0; i < zs.length; i += 1) {
      const y = yOf(shown[i]);
      c.lineTo(plot.x + i, y);
      c.lineTo(plot.x + i + 1, y);
    }
    c.lineTo(plot.x + zs.length, base);
    c.closePath();
    c.fill();
    c.strokeStyle = pal.rulingInk;
    c.lineWidth = 1;
    c.stroke();

    // the standard normal density
    c.strokeStyle = pal.ink;
    c.lineWidth = 1.5;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < zs.length; i += 1) {
      const y = yOf(normPdf(zs[i]));
      if (i === 0) c.moveTo(plot.x + 0.5, y);
      else c.lineTo(plot.x + i + 0.5, y);
    }
    c.stroke();

    // the simulated attackers: one point per bar of their histogram, at its density
    if (cells) {
      const r = 2.75;
      c.globalAlpha = e;
      c.fillStyle = pal.plot;
      c.strokeStyle = pal.paper;
      c.lineWidth = 1;
      c.beginPath();
      for (const cell of cells) {
        if (Math.abs(cell.z) > Z_MAX || cell.count === 0) continue;
        const x = xOf(cell.z);
        const y = yOf(Math.min(cell.density, Y_MAX));
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, 2 * Math.PI);
      }
      c.fill();
      c.stroke();
      c.globalAlpha = 1;
    }
    c.restore();

    c.strokeStyle = pal.rulingInk;
    c.lineWidth = 1.25;
    c.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
    c.save();
    c.translate(10, plot.y + plot.h / 2);
    c.rotate(-Math.PI / 2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = pal.rulingInk;
    c.font = formFont(pal, 10.5, 600);
    c.fillText('Density', 0, 0);
    c.restore();
  }

  /** The ridges, built once per size: the staircase of each law above its baseline, and the bell in front. */
  function buildRidges(width, height) {
    const count = ridgeLaws.length + 1;
    return Array.from({ length: count }, (_, i) => {
      const g = ridgeGeometry(i, count, { width, height });
      const columns = Math.max(40, Math.round(g.x1 - g.x0));
      const zs = Float64Array.from({ length: columns }, (_, c) => -Z_MAX + (2 * Z_MAX * (c + 0.5)) / columns);
      const density = i < ridgeLaws.length ? stepDensity(ridgeLaws[i], zs) : Float64Array.from(zs, normPdf);
      const step = (g.x1 - g.x0) / columns;
      const path = new Path2D();
      path.moveTo(g.x0, g.base);
      for (let c = 0; c < columns; c += 1) {
        const y = g.base - (g.amp * density[c]) / Y_MAX;
        if (i < ridgeLaws.length) {
          path.lineTo(g.x0 + c * step, y);
          path.lineTo(g.x0 + (c + 1) * step, y);
        } else path.lineTo(g.x0 + (c + 0.5) * step, y);
      }
      path.lineTo(g.x1, g.base);
      return { g, path, n: i < ridgeLaws.length ? ridgeLaws[i].n : null };
    });
  }

  function drawRidges() {
    const { ctx: c, shapes } = ridge;
    clearLayer(c);
    const selected = CLT_PLAYLIST.indexOf(s.n);
    c.font = formFont(pal, 10.5);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    shapes.forEach(({ g, path, n }, i) => {
      const isLimit = n === null;
      const isSelected = i === selected;
      c.fillStyle = pal.paper;
      c.fill(path);
      c.strokeStyle = pal.rulingMinor;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(g.x0, Math.round(g.base) + 0.5);
      c.lineTo(g.x1, Math.round(g.base) + 0.5);
      c.stroke();
      c.strokeStyle = isSelected ? pal.plot : isLimit ? pal.ink : pal.rulingInk;
      c.lineWidth = isSelected || isLimit ? 1.5 : 1;
      c.lineJoin = 'round';
      c.stroke(path);
      c.fillStyle = isSelected ? pal.ink : isLimit ? pal.ink : pal.inkSoft;
      c.font = formFont(pal, 10.5, isSelected || isLimit ? 700 : 500);
      c.fillText(isLimit ? 'N(0, 1)' : n.toLocaleString('en-GB'), g.x0 - 8, g.base - 3);
    });
    ridgeWrap.setAttribute(
      'aria-label',
      `Ridgeline of the exact laws of Sₙ/√n for n = 1, 2, 4, …, 1,024, from the back to the front, ending with the standard normal density in front: ` +
        `the staircases fill in towards the bell curve.${selected >= 0 ? ` The law for n = ${s.n} is drawn in red.` : ''}`,
    );
  }

  /* ------------------------------------------------------------- readout */

  function renderReadout() {
    const r = readout;
    statCell('n').textContent = r.n.toLocaleString('en-GB');
    statCell('spacing').textContent = formatNumber(r.spacing);
    statCell('distance').textContent = formatNumber(r.distance);
    statCell('bound').textContent = formatNumber(r.bound);
    statCell('scaled').textContent = formatNumber(r.scaled);
    statCell('sample').textContent = r.sample ? formatNumber(r.sample.distance) : '—';
    statCell('dkw').textContent = r.sample ? formatNumber(r.sample.dkw) : '—';
    mainWrap.setAttribute(
      'aria-label',
      `Exact law of Sₙ/√n for n = ${r.n}, bars of width ${formatNumber(r.spacing)} rescaled to a density, against the standard normal density` +
        `${r.sample ? `, with the histogram of ${r.sample.m} simulated attackers` : ''}. ` +
        `Kolmogorov distance ${formatNumber(r.distance)}, Berry–Esseen bound ${formatNumber(r.bound)}.`,
    );
    provenance.textContent =
      `Exact law: Sₙ = 2K − n with K binomial (n, 1/2); Φ through the regularised incomplete gamma function; Berry–Esseen constant 0.4748 (Shevtsova, 2011).` +
      (s.m > 0 ? ` Sample: Mulberry32 generator, seed ${s.seed}, ${s.m.toLocaleString('en-GB')} attackers.` : '');
    resample.disabled = s.m === 0;
    clearTimeout(announceTimer);
    if (playing && s.n !== CLT_PLAYLIST.at(-1)) return;
    announceTimer = setTimeout(() => announce(status, cltSummary(r)), 900);
  }

  /* ------------------------------------------------------------ animation */

  function request() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (!morph) return;
    const e = easeOut((now - morph.start) / MORPH_MS);
    lerpInto(shown, morph.from, target, e);
    drawMain();
    if (e >= 1) morph = null;
    else request();
  }

  /** Shows the state of s: morphing from the drawn staircase, or at once with a blink. */
  function show({ animate }) {
    compute();
    renderReadout();
    if (!main) return;
    if (animate && shown && !prefersReducedMotion()) {
      morph = { from: shown.slice(), start: performance.now() };
      request();
    } else {
      morph = null;
      shown = target.slice();
      drawMain();
      if (animate) blink(mainWrap);
    }
    if (ridge) drawRidges();
  }

  function syncN() {
    range.value = String(nearestStop(CLT_N_STOPS, s.n));
    range.setAttribute('aria-valuetext', `n = ${s.n}`);
    nField.value = String(s.n);
    nField.removeAttribute('aria-invalid');
    nNote.removeAttribute('data-kind');
    nNote.textContent = N_NOTE;
  }

  function setN(n, { animate = true } = {}) {
    s.n = n;
    syncN();
    show({ animate });
  }

  function setPlaying(on) {
    playing = on;
    playButton.setAttribute('aria-pressed', String(on));
    playLabel.textContent = on ? 'Pause' : 'Step through 1, 2, 4, …, 1,024';
    playButton.querySelector('svg').outerHTML = on ? ICONS.pause : ICONS.play;
  }

  function step(i) {
    playTimer = 0;
    if (!visible) {
      pendingStep = i;
      return;
    }
    setN(CLT_PLAYLIST[i]);
    if (i === CLT_PLAYLIST.length - 1) {
      setPlaying(false);
      return;
    }
    playTimer = setTimeout(() => step(i + 1), MORPH_MS + HOLD_MS);
  }

  function play() {
    if (playing) {
      clearTimeout(playTimer);
      pendingStep = -1;
      setPlaying(false);
      renderReadout();
      return;
    }
    const at = CLT_PLAYLIST.indexOf(s.n);
    setPlaying(true);
    step(at < 0 || at === CLT_PLAYLIST.length - 1 ? 0 : at + 1);
  }

  function stopPlaying() {
    if (!playing) return;
    clearTimeout(playTimer);
    pendingStep = -1;
    setPlaying(false);
  }

  /* -------------------------------------------------------------- inputs */

  range.addEventListener('input', () => {
    stopPlaying();
    const n = CLT_N_STOPS[Number(range.value)];
    cancelAnimationFrame(inputFrame);
    inputFrame = requestAnimationFrame(() => setN(n));
  });
  nField.addEventListener('change', () => {
    const text = nField.value.trim();
    const n = Number(text);
    if (!/^\d+$/.test(text) || n < 1 || n > N_MAX) {
      nField.setAttribute('aria-invalid', 'true');
      nNote.dataset.kind = 'error';
      nNote.textContent = `n must be a whole number from 1 to 2,048; the panel still shows n = ${s.n}.`;
      return;
    }
    stopPlaying();
    if (n !== s.n) setN(n);
    else syncN();
  });
  for (const radio of panel.querySelectorAll('input[name="clt-sample"]')) {
    radio.addEventListener('change', () => {
      s.m = Number(radio.value);
      show({ animate: false });
    });
  }
  resample.addEventListener('click', () => {
    s.seed = freshSeed();
    show({ animate: false });
    blink(mainWrap);
  });
  playButton.addEventListener('click', play);
  ridgeCanvas.addEventListener('click', (event) => {
    if (!ridge) return;
    const rect = ridgeCanvas.getBoundingClientRect();
    const y = event.clientY - rect.top;
    let best = 0;
    ridge.shapes.slice(0, ridgeLaws.length).forEach(({ g }, i) => {
      if (Math.abs(g.base - g.amp * 0.3 - y) < Math.abs(ridge.shapes[best].g.base - ridge.shapes[best].g.amp * 0.3 - y)) best = i;
    });
    stopPlaying();
    if (CLT_PLAYLIST[best] !== s.n) setN(CLT_PLAYLIST[best]);
  });

  /* --------------------------------------------------------------- mount */

  compute();
  renderReadout();
  attachPanel(mount, panel);
  pal = readPalette(panel);

  stops.push(
    watchSize(mainWrap, ({ width, height }) => {
      main = { ctx: sizeLayer(mainCanvas, width, height), ...layoutMain(width, height) };
      morph = null;
      cells = binSample();
      target = stepDensity(cltExactLaw(s.n), main.zs);
      shown = target.slice();
      drawMain();
    }),
  );
  stops.push(
    watchSize(ridgeWrap, ({ width, height }) => {
      ridge = { ctx: sizeLayer(ridgeCanvas, width, height), shapes: buildRidges(width, height) };
      drawRidges();
    }),
  );
  stops.push(
    watchVisibility(panel, (isVisible) => {
      visible = isVisible;
      if (!isVisible) {
        cancelAnimationFrame(raf);
        raf = 0;
        if (playTimer) {
          clearTimeout(playTimer);
          playTimer = 0;
          pendingStep = Math.min(CLT_PLAYLIST.length - 1, CLT_PLAYLIST.indexOf(s.n) + 1);
        }
        return;
      }
      if (morph) request();
      if (playing && pendingStep >= 0) {
        const i = pendingStep;
        pendingStep = -1;
        playTimer = setTimeout(() => step(i), HOLD_MS);
      }
    }),
  );
  document.fonts?.ready.then(() => {
    if (main && !morph) drawMain();
    if (ridge) drawRidges();
  });

  return function destroy() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(inputFrame);
    clearTimeout(playTimer);
    clearTimeout(announceTimer);
    for (const stop of stops) stop();
  };
}

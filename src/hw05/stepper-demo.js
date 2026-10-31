/**
 * Panel 1 (§6): the recurrences, one observation at a time. The reader steps
 * through a short sequence, typed in or drawn from a seed, and sees the previous
 * mean, the new observation, the new mean, the rectangle whose area is added and
 * the running sum of squares as accumulated area.
 *
 * Motion thesis. The focal moment is the step itself: the mean slides towards the
 * observation by 1/k of the way, the rectangle opens from the diagonal, and its
 * area joins the ledger, in that order, so that the eye follows (10) from left to
 * right. Stepping backwards, moving the slider or changing the sequence is a
 * state change, not an event, and is acknowledged by a blink. Under reduced motion
 * every step is acknowledged by the blink alone. The state is drawn in full before
 * any animation starts, so an interrupted or failed animation hides nothing. Play
 * stops at the last step, and it pauses while the panel is off screen.
 */

import { DURATION, EASE_OUT, announce, attachPanel, blink, panelFrame, reducedMotion } from '../hw03/motion.js';
import { watchSize, watchVisibility } from '../hw04/canvas.js';
import { parseSeed } from '../hw04/model.js';
import { freshSeed } from '../lib/normal.js';
import { DEFAULT_SEQUENCE, MAX_VALUES, clampStep, drawSequence, formatValue, parseSequence, planeDomain, stepEquation, stepSummary, stepsOf } from './model.js';
import { ledgerSvg, planeSvg } from './scene.js';

const PLANE_SIZE = 360;
const PLAY_INTERVAL = 1400;
const DEFAULT_SEED = 20261031;

const ICONS = {
  back: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M12 2.5v11L4 8z" fill="currentColor"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11L12 8z" fill="currentColor"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 2.5h2.75v11H4zM9.25 2.5H12v11H9.25z" fill="currentColor"/></svg>',
};

const statistic = (key, caption) => `<div><dt>${caption}</dt><dd data-step-out="${key}"></dd></div>`;

function body(values, seed) {
  return (
    `<div class="stepper">` +
    `<div class="stepper__plane" data-step-plane></div>` +
    `<div class="stepper__side">` +
    `<dl class="pplot__stats pplot__stats--math stepper__stats">` +
    statistic('k', 'Step k') +
    statistic('x', 'New value') +
    statistic('old', 'Previous mean') +
    statistic('mean', 'New mean') +
    statistic('area', 'Area added') +
    statistic('ss', 'Sum of squares SS') +
    statistic('variance', 'Variance s²') +
    `</dl>` +
    `<p class="stepper__equation" data-step-equation></p>` +
    `</div>` +
    `<div class="stepper__ledger" data-step-ledger></div>` +
    `</div>` +
    `<div class="sim-transport">` +
    `<button type="button" class="form-button" data-step-back>${ICONS.back}<span>Back</span></button>` +
    `<button type="button" class="form-button" data-step-next>${ICONS.next}<span>Next</span></button>` +
    `<button type="button" class="form-button" data-step-play aria-pressed="false">${ICONS.play}<span data-step-play-label>Play</span></button>` +
    `<p class="sim-transport__progress" data-step-progress></p>` +
    `</div>` +
    `<label class="sim-step"><span class="sim-range__head"><span class="caption caption--math">Step k</span>` +
    `<output class="sim-range__value" data-step-slider-out></output></span>` +
    `<input type="range" data-step-slider min="1" max="${values.length}" step="1" value="${values.length > 1 ? 2 : 1}" /></label>` +
    `<div class="sim-controls">` +
    `<form class="stepper__sequence sim-controls__wide" data-step-form novalidate>` +
    `<label class="text-field"><span class="caption">Sequence</span>` +
    `<input type="text" data-step-values value="${values.join(', ')}" autocomplete="off" spellcheck="false" aria-describedby="step-values-note" /></label>` +
    `<button type="submit" class="form-button">Apply</button>` +
    `<button type="button" class="form-button" data-step-worked>Table 1 data</button>` +
    `<span class="text-field__note sim-seed__note" id="step-values-note" data-step-values-note>Up to ${MAX_VALUES} values, separated by commas or spaces.</span>` +
    `</form>` +
    `<div class="sim-seed sim-controls__wide">` +
    `<label class="text-field"><span class="caption">Seed</span>` +
    `<input type="text" inputmode="numeric" data-step-seed value="${seed}" autocomplete="off" spellcheck="false" aria-describedby="step-seed-note" /></label>` +
    `<div class="stepper__draw"><button type="button" class="form-button" data-step-draw>Draw</button>` +
    `<button type="button" class="form-button" data-step-reseed>New seed</button></div>` +
    `<span class="text-field__note sim-seed__note" id="step-seed-note" data-step-seed-note>Mulberry32; eight values on the scale of 0 to 10.</span>` +
    `</div>` +
    `</div>`
  );
}

/**
 * @param {HTMLElement} mount the div.demo of the page
 */
export function mountStepperDemo(mount) {
  const parsedSeed = parseSeed(mount.dataset.seed ?? DEFAULT_SEED);
  const state = {
    values: [...DEFAULT_SEQUENCE],
    steps: stepsOf(DEFAULT_SEQUENCE),
    domain: planeDomain(DEFAULT_SEQUENCE),
    k: 2,
    seed: parsedSeed.ok ? parsedSeed.seed : DEFAULT_SEED,
    playing: false,
    visible: true,
    timer: 0,
    ledgerWidth: 640,
  };

  const { panel, $ } = panelFrame({
    id: 'panel-stepper',
    number: 1,
    title: 'The recurrence, one observation at a time',
    lede: 'Each step places a new observation on the diagonal, moves the mean by 1/k of the way towards it, and adds the rectangle between them to the running sum of squares.',
    body: body(state.values, state.seed),
    provenance: 'Computed in the browser by src/lib/welford.js, the code of Listing 1.',
  });

  const plane = $('[data-step-plane]');
  const ledger = $('[data-step-ledger]');
  const slider = $('[data-step-slider]');
  const backButton = $('[data-step-back]');
  const nextButton = $('[data-step-next]');
  const playButton = $('[data-step-play]');
  const status = $('[data-status]');
  const valuesInput = $('[data-step-values]');
  const valuesNote = $('[data-step-values-note]');
  const seedInput = $('[data-step-seed]');
  const seedNote = $('[data-step-seed-note]');
  const NOTES = { values: valuesNote.textContent, seed: seedNote.textContent };

  const setOut = (key, text) => {
    $(`[data-step-out="${key}"]`).textContent = text;
  };

  function drawPlane(step) {
    plane.innerHTML = planeSvg(step, {
      id: 'stepper-plane',
      domain: state.domain,
      size: PLANE_SIZE,
      title: `Step ${step.k} of ${state.steps.length}`,
      desc: stepSummary(step, state.steps.length),
    });
  }

  function drawLedger() {
    ledger.innerHTML = ledgerSvg(state.steps, state.k, {
      id: 'stepper-ledger',
      width: state.ledgerWidth,
      title: 'The running sum of squares as accumulated area',
      desc: `After step ${state.k} the areas add up to ${formatValue(state.steps[state.k - 1].ss)}.`,
    });
  }

  /** Writes the whole state: anything animated afterwards starts from a complete drawing. */
  function draw() {
    const count = state.steps.length;
    const step = state.steps[state.k - 1];
    drawPlane(step);
    drawLedger();
    setOut('k', `${step.k} of ${count}`);
    setOut('x', formatValue(step.x));
    setOut('old', step.oldMean === null ? '—' : formatValue(step.oldMean));
    setOut('mean', formatValue(step.mean));
    setOut('area', step.oldMean === null ? '—' : formatValue(step.area));
    setOut('ss', formatValue(step.ss));
    setOut('variance', formatValue(step.variance));
    $('[data-step-equation]').textContent = stepEquation(step);
    $('[data-step-progress]').textContent = `Observation ${step.k} of ${count}`;
    $('[data-step-slider-out]').textContent = String(step.k);
    slider.max = String(count);
    slider.value = String(step.k);
    slider.setAttribute('aria-valuetext', `Step ${step.k} of ${count}`);
    backButton.setAttribute('aria-disabled', String(step.k === 1));
    nextButton.setAttribute('aria-disabled', String(step.k === count));
  }

  /** The focal sequence: mean, rectangle, ledger. Each element is complete before its animation starts. */
  function animateStep(step, previous) {
    const options = { duration: DURATION.slide, easing: EASE_OUT };
    const scene = plane.querySelector('svg');
    const point = scene.querySelector('[data-el="observation"]');
    const mean = scene.querySelector('[data-el="new-mean"]');
    const rectangle = scene.querySelector('[data-el="rectangle"]');
    const segment = ledger.querySelector('[data-current="true"]');
    if (previous) {
      const dx = Number(previous.cx) - Number(point.getAttribute('cx'));
      const dy = Number(previous.cy) - Number(point.getAttribute('cy'));
      point.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], options);
    }
    if (mean) {
      const from = Number(mean.dataset.fromY) - Number(mean.getAttribute('cy'));
      mean.animate?.([{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }], options);
    }
    if (rectangle) {
      rectangle.style.transformOrigin = `${rectangle.dataset.cx}px ${rectangle.dataset.cy}px`;
      rectangle.animate?.([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: DURATION.settle, delay: 160, easing: EASE_OUT, fill: 'backwards' });
    }
    if (segment) {
      segment.style.transformOrigin = `${segment.getAttribute('x')}px 0`;
      segment.animate?.([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DURATION.settle, delay: 420, easing: EASE_OUT, fill: 'backwards' });
    }
  }

  /** Moves to step k and acknowledges it: travel for one step forwards, a blink for anything else. */
  function goTo(k, { silent = false } = {}) {
    const target = clampStep(k, state.steps.length);
    const forward = target === state.k + 1;
    const point = plane.querySelector('[data-el="observation"]');
    const previous = point ? { cx: point.getAttribute('cx'), cy: point.getAttribute('cy') } : null;
    state.k = target;
    draw();
    const step = state.steps[target - 1];
    if (forward && !reducedMotion()) animateStep(step, previous);
    else blink(plane.querySelector('svg'));
    if (!silent) announce(status, stepSummary(step, state.steps.length));
  }

  function setPlaying(playing) {
    state.playing = playing;
    clearInterval(state.timer);
    playButton.setAttribute('aria-pressed', String(playing));
    playButton.querySelector('svg').outerHTML = playing ? ICONS.pause : ICONS.play;
    $('[data-step-play-label]').textContent = playing ? 'Pause' : 'Play';
    if (!playing) return;
    state.timer = setInterval(() => {
      if (!state.visible) return;
      if (state.k >= state.steps.length) {
        setPlaying(false);
        return;
      }
      goTo(state.k + 1, { silent: true });
    }, PLAY_INTERVAL);
  }

  function setSequence(values) {
    setPlaying(false);
    state.values = values;
    state.steps = stepsOf(values);
    state.domain = planeDomain(values);
    state.k = clampStep(2, values.length);
    draw();
    blink(plane.querySelector('svg'));
    announce(status, `New sequence of ${values.length} values. ${stepSummary(state.steps[state.k - 1], values.length)}`);
  }

  const noteProblem = (input, note, message, fallback) => {
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    note.textContent = message || fallback;
    if (message) note.dataset.kind = 'error';
    else delete note.dataset.kind;
  };

  function applySequence() {
    const result = parseSequence(valuesInput.value);
    noteProblem(valuesInput, valuesNote, result.ok ? '' : result.message, NOTES.values);
    if (result.ok) setSequence(result.values);
  }

  function drawFromSeed() {
    const result = parseSeed(seedInput.value);
    noteProblem(seedInput, seedNote, result.ok ? '' : result.message, NOTES.seed);
    if (!result.ok) return;
    state.seed = result.seed;
    const values = drawSequence(state.seed);
    valuesInput.value = values.join(', ');
    noteProblem(valuesInput, valuesNote, '', NOTES.values);
    setSequence(values);
  }

  backButton.addEventListener('click', () => {
    if (state.k > 1) goTo(state.k - 1);
  });
  nextButton.addEventListener('click', () => {
    if (state.k < state.steps.length) goTo(state.k + 1);
  });
  playButton.addEventListener('click', () => {
    if (state.playing) {
      setPlaying(false);
      return;
    }
    if (state.k >= state.steps.length) goTo(1, { silent: true });
    setPlaying(true);
  });
  slider.addEventListener('input', () => {
    setPlaying(false);
    goTo(Number(slider.value));
  });
  $('[data-step-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    applySequence();
  });
  $('[data-step-worked]').addEventListener('click', () => {
    valuesInput.value = DEFAULT_SEQUENCE.join(', ');
    noteProblem(valuesInput, valuesNote, '', NOTES.values);
    setSequence([...DEFAULT_SEQUENCE]);
  });
  $('[data-step-draw]').addEventListener('click', drawFromSeed);
  $('[data-step-reseed]').addEventListener('click', () => {
    seedInput.value = String(freshSeed());
    drawFromSeed();
  });
  seedInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    drawFromSeed();
  });

  attachPanel(mount, panel);
  draw();
  // The strip is redrawn at its true width, so that its type never shrinks on a phone. Only a change of
  // width redraws it, because a redraw cancels the animation of a segment that has just started.
  watchSize(ledger, ({ width }) => {
    if (width === state.ledgerWidth) return;
    state.ledgerWidth = width;
    drawLedger();
  });
  watchVisibility(panel, (visible) => {
    state.visible = visible;
  });
}

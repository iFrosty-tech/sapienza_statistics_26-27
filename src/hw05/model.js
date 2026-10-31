/**
 * The pure part of the stepper of homework 4, exercise 1: reading a sequence,
 * the steps of the recurrences, every form of the recurrence printed on the
 * page, the plane on which the increment of SS is a rectangle, the ledger of
 * accumulated area and the readouts. Nothing here touches the DOM, so that
 * every rule the panel follows is tested in Node (test/hw05-model.test.js).
 *
 * The mean and the sum of squares come from the single implementation in
 * src/lib/welford.js. recurrenceForms alone recomputes them, once per printed
 * form, because each form is what it checks.
 */

import { deriveSeed } from '../lib/kg-study.js';
import { createRandom } from '../lib/random.js';
import { createAccumulator, push, sampleVariance } from '../lib/welford.js';

/** The data set of the worked trace (Table 1 of the page). */
export const DEFAULT_SEQUENCE = Object.freeze([2, 4, 4, 4, 5, 5, 7, 9]);
export const MIN_VALUES = 2;
export const MAX_VALUES = 16;
const MAX_MAGNITUDE = 1000;
const DRAW_LENGTH = 8;
const DRAW_TOP = 10;

/** Segments of the ledger shorter than this many pixels carry no label. */
export const LEDGER_MIN_LABEL = 26;

/**
 * Reads the values typed into the panel, separated by commas, semicolons or spaces.
 * @param {string} raw
 * @returns {{ ok: true, values: number[] } | { ok: false, message: string }}
 */
export function parseSequence(raw) {
  const parts = String(raw ?? '').trim().split(/[\s,;]+/).filter(Boolean);
  if (parts.length < MIN_VALUES) {
    return { ok: false, message: `Enter at least ${MIN_VALUES} values, separated by commas or spaces.` };
  }
  if (parts.length > MAX_VALUES) {
    return { ok: false, message: `Enter at most ${MAX_VALUES} values; this sequence has ${parts.length}.` };
  }
  const values = [];
  for (const part of parts) {
    const value = Number(part.replace(/−/g, '-'));
    if (!Number.isFinite(value)) return { ok: false, message: `“${part}” is not a number; use digits such as 4 or 2.5.` };
    if (Math.abs(value) > MAX_MAGNITUDE) return { ok: false, message: `“${part}” is out of range; keep values between −${MAX_MAGNITUDE} and ${MAX_MAGNITUDE}.` };
    values.push(value);
  }
  return { ok: true, values };
}

/**
 * A short sequence of values with one decimal, uniform on 0 to 10.
 * @param {number} seed
 * @param {number} [length]
 */
export function drawSequence(seed, length = DRAW_LENGTH) {
  const random = createRandom(deriveSeed(seed, 'stepper:sequence'));
  return Array.from({ length }, () => Math.round(random.uniform() * DRAW_TOP * 10) / 10);
}

/**
 * One record per observation. `width` is the innovation xₖ − x̄ₖ₋₁ and `height` the
 * residual xₖ − x̄ₖ, the sides of the rectangle whose area is added to SS. The first
 * observation has no previous mean, so it has neither sides nor area.
 * @param {number[]} values
 */
export function stepsOf(values) {
  const state = createAccumulator();
  return values.map((x) => {
    const first = state.k === 0;
    const oldMean = first ? null : state.mean;
    const oldSs = state.ss;
    push(state, x);
    return {
      k: state.k,
      x,
      oldMean,
      mean: state.mean,
      width: first ? 0 : x - oldMean,
      height: first ? 0 : x - state.mean,
      area: state.ss - oldSs,
      oldSs,
      ss: state.ss,
      variance: sampleVariance(state),
    };
  });
}

/**
 * Every recurrence the page prints, run from its own previous value. Index k − 1
 * holds the value after k observations.
 * @param {number[]} values
 */
export function recurrenceForms(values) {
  const n = values.length;
  const series = () => new Float64Array(n).fill(NaN);
  const forms = {
    mean: series(),
    ssProduct: series(),
    ssSquare: series(),
    varianceScaled: series(),
    varianceMirror: series(),
    populationMirror: series(),
  };
  let mean = 0;
  let ssProduct = 0;
  let ssSquare = 0;
  let scaled = 0; // s²₁ does not exist; the term that holds it vanishes at k = 2
  let mirror = 0;
  let population = 0;
  values.forEach((x, i) => {
    const k = i + 1;
    const innovation = x - mean;
    mean += innovation / k;
    const residual = x - mean;
    const increment = innovation * residual;
    ssProduct += increment;
    ssSquare += ((k - 1) / k) * innovation ** 2;
    population += (increment - population) / k;
    forms.mean[i] = mean;
    forms.ssProduct[i] = ssProduct;
    forms.ssSquare[i] = ssSquare;
    forms.populationMirror[i] = population;
    if (k >= 2) {
      scaled = ((k - 2) / (k - 1)) * scaled + innovation ** 2 / k;
      mirror += (increment - mirror) / (k - 1);
      forms.varianceScaled[i] = scaled;
      forms.varianceMirror[i] = mirror;
    }
  });
  return forms;
}

/** A step of the panel as a whole number from 1 to `count`. */
export function clampStep(step, count) {
  const value = Number.isFinite(step) ? Math.round(step) : 1;
  return Math.min(count, Math.max(1, value));
}

/** The interval of data values drawn on both axes of the plane. */
export function planeDomain(values) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.08, 0.5);
  return [low - padding, high + padding];
}

/**
 * The pixels of a square plane: one data unit has the same length on both axes,
 * so that a rectangle on it has the area it means.
 * @param {[number, number]} domain
 * @param {{ size: number, margin: number }} options
 */
export function planeScale([low, high], { size, margin }) {
  const inner = size - 2 * margin;
  const unit = inner / (high - low);
  return {
    x: (v) => margin + (v - low) * unit,
    y: (v) => margin + (high - v) * unit,
    unit,
    low,
    high,
    near: margin,
    far: size - margin,
  };
}

/**
 * The rectangle of a step: opposite corners (x̄ₖ₋₁, x̄ₖ) and (xₖ, xₖ), the second on
 * the diagonal of the plane. Both sides have the sign of the innovation, so its
 * area is never negative.
 * @returns {{ x: number, y: number, width: number, height: number, corner: [number, number] } | null}
 */
export function rectangleOf(step, scale) {
  if (step.oldMean === null) return null;
  const left = Math.min(step.oldMean, step.x);
  const right = Math.max(step.oldMean, step.x);
  const bottom = Math.min(step.mean, step.x);
  const top = Math.max(step.mean, step.x);
  return {
    x: scale.x(left),
    y: scale.y(top),
    width: (right - left) * scale.unit,
    height: (top - bottom) * scale.unit,
    corner: [scale.x(step.x), scale.y(step.x)],
  };
}

/**
 * The areas added up to step `upTo`, end to end. The strip has one height, so its
 * length is the running SS, on the scale at which the final SS fills `width`.
 * @param {ReturnType<typeof stepsOf>} steps
 * @param {number} upTo
 * @param {number} width
 */
export function ledgerSegments(steps, upTo, width) {
  const total = steps.at(-1).ss;
  if (!(total > 0)) return [];
  const per = width / total;
  return steps
    .filter((s) => s.k > 1 && s.k <= upTo && s.area > 0)
    .map((s) => {
      const length = s.area * per;
      return { k: s.k, area: s.area, start: s.oldSs * per, length, current: s.k === upTo, labelled: length >= LEDGER_MIN_LABEL };
    });
}

/** A value for a readout: three decimals at most, a true minus sign, and no negative zero. */
export function formatValue(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return String(rounded).replace('-', '−');
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (k) => String(k).replace(/\d/g, (d) => SUBSCRIPTS[Number(d)]);

/** The recurrence of the step with its numbers substituted. */
export function stepEquation(step) {
  if (step.oldMean === null) return 'SS₁ = 0: one observation has no spread';
  const [x, old, mean] = [step.x, step.oldMean, step.mean].map(formatValue);
  return `SS${subscript(step.k)} = ${formatValue(step.oldSs)} + (${x} − ${old})(${x} − ${mean}) = ${formatValue(step.ss)}`;
}

/** The step in one sentence, for assistive technology. */
export function stepSummary(step, count) {
  const head = `Step ${step.k} of ${count}: observation ${formatValue(step.x)}.`;
  if (step.oldMean === null) return `${head} The mean starts at ${formatValue(step.mean)} and SS is 0.`;
  return `${head} The mean moves from ${formatValue(step.oldMean)} to ${formatValue(step.mean)}; a rectangle of area ${formatValue(step.area)} is added, so SS is ${formatValue(step.ss)}.`;
}

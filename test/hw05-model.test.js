/**
 * The pure part of the stepper of homework 4, exercise 1 (src/hw05/model.js and
 * src/hw05/scene.js): reading a sequence, the steps of the recurrences, every
 * form of the recurrence printed on the page, the plane on which the increment
 * of SS is a rectangle, the ledger of accumulated area and the readouts. The
 * DOM is not involved, so that every rule the panel follows is tested in Node.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningEstimates } from '../src/lib/welford.js';
import {
  DEFAULT_SEQUENCE,
  LEDGER_MIN_LABEL,
  MAX_VALUES,
  MIN_VALUES,
  clampStep,
  drawSequence,
  formatValue,
  ledgerSegments,
  parseSequence,
  planeDomain,
  planeScale,
  recurrenceForms,
  rectangleOf,
  stepEquation,
  stepSummary,
  stepsOf,
} from '../src/hw05/model.js';
import { ledgerSvg, planeSvg } from '../src/hw05/scene.js';

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≉ ${b}`);
const directMean = (values, k) => values.slice(0, k).reduce((s, x) => s + x, 0) / k;
const directSs = (values, k) => {
  const m = directMean(values, k);
  return values.slice(0, k).reduce((s, x) => s + (x - m) ** 2, 0);
};
const SAMPLES = [DEFAULT_SEQUENCE, [1.5, -2.25, 8, 8, 0.1, 3, -7], [10, 0, 10, 0, 10, 0]];

test('parseSequence reads numbers separated by commas or spaces and keeps their order', () => {
  assert.deepEqual(parseSequence('2, 4 4,4  5').values, [2, 4, 4, 4, 5]);
  assert.deepEqual(parseSequence('−1.5, 2.25, 0').values, [-1.5, 2.25, 0]);
  assert.deepEqual(parseSequence(' 3;4 ').values, [3, 4]);
  assert.equal(parseSequence('1, 2').ok, true);
});

test('parseSequence names the problem and the recovery for an unusable sequence', () => {
  const few = parseSequence('5');
  assert.equal(few.ok, false);
  assert.match(few.message, new RegExp(`at least ${MIN_VALUES}`));
  const many = parseSequence(Array(MAX_VALUES + 1).fill(1).join(' '));
  assert.equal(many.ok, false);
  assert.match(many.message, new RegExp(`at most ${MAX_VALUES}`));
  const bad = parseSequence('1, two, 3');
  assert.equal(bad.ok, false);
  assert.match(bad.message, /“two”/);
  assert.equal(parseSequence('1, 1e9').ok, false);
  assert.equal(parseSequence('1, Infinity').ok, false);
  assert.equal(parseSequence('').ok, false);
});

test('drawSequence is reproducible from the seed, and every value has one decimal on the scale of 0 to 10', () => {
  assert.deepEqual(drawSequence(7), drawSequence(7));
  assert.notDeepEqual(drawSequence(7), drawSequence(8));
  const values = drawSequence(20261031);
  assert.equal(values.length, 8);
  for (const v of values) {
    assert.ok(v >= 0 && v <= 10, String(v));
    assert.equal(Math.round(v * 10) / 10, v);
  }
  assert.equal(drawSequence(1, 5).length, 5);
});

test('stepsOf follows the mean and the sum of squares of src/lib/welford.js, step by step', () => {
  for (const values of SAMPLES) {
    const steps = stepsOf(values);
    const running = runningEstimates(values);
    assert.equal(steps.length, values.length);
    steps.forEach((s, i) => {
      assert.equal(s.k, i + 1);
      assert.equal(s.x, values[i]);
      assert.equal(s.mean, running.mean[i]);
      assert.equal(s.ss, running.ss[i]);
      if (i > 0) {
        assert.equal(s.oldMean, running.mean[i - 1]);
        assert.equal(s.variance, running.variance[i]);
      }
      near(s.ss, directSs(values, s.k));
    });
  }
});

test('stepsOf gives the sides of the rectangle and its area; the sides never disagree in sign', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  assert.equal(steps[1].width, 2); // x₂ − x̄₁ = 4 − 2
  assert.equal(steps[1].height, 1); // x₂ − x̄₂ = 4 − 3
  assert.equal(steps[1].area, 2);
  assert.equal(steps.at(-1).ss, 32);
  assert.equal(steps.at(-1).mean, 5);
  for (const values of SAMPLES) {
    for (const s of stepsOf(values).slice(1)) {
      near(s.area, s.width * s.height);
      assert.ok(s.width * s.height >= 0, `step ${s.k}`);
      near(s.height, ((s.k - 1) / s.k) * s.width);
    }
  }
  // The first observation has no previous mean: it adds nothing to SS.
  const first = steps[0];
  assert.equal(first.oldMean, null);
  assert.equal(first.width, 0);
  assert.equal(first.area, 0);
  assert.ok(Number.isNaN(first.variance));
});

test('each form of the recurrence printed on the page reaches the definition at every step', () => {
  for (const values of SAMPLES) {
    const forms = recurrenceForms(values);
    values.forEach((_, i) => {
      const k = i + 1;
      const ss = directSs(values, k);
      near(forms.mean[i], directMean(values, k)); // (3) Knuth
      near(forms.ssProduct[i], ss); // SSₖ₋₁ + (xₖ − x̄ₖ₋₁)(xₖ − x̄ₖ)
      near(forms.ssSquare[i], ss); // SSₖ₋₁ + ((k − 1)/k)(xₖ − x̄ₖ₋₁)²
      near(forms.populationMirror[i], ss / k); // σ̂²ₖ = σ̂²ₖ₋₁ + [(xₖ − x̄ₖ₋₁)(xₖ − x̄ₖ) − σ̂²ₖ₋₁]/k
      if (k >= 2) {
        near(forms.varianceScaled[i], ss / (k - 1)); // s²ₖ = ((k − 2)/(k − 1))s²ₖ₋₁ + (xₖ − x̄ₖ₋₁)²/k
        near(forms.varianceMirror[i], ss / (k - 1)); // s²ₖ = s²ₖ₋₁ + [(xₖ − x̄ₖ₋₁)(xₖ − x̄ₖ) − s²ₖ₋₁]/(k − 1)
      }
    });
    assert.ok(Number.isNaN(forms.varianceScaled[0]));
    assert.ok(Number.isNaN(forms.varianceMirror[0]));
  }
});

test('SS never decreases along the recurrence', () => {
  for (const values of SAMPLES) {
    const steps = stepsOf(values);
    for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i].ss >= steps[i - 1].ss);
  }
});

test('clampStep keeps a step inside the sequence', () => {
  assert.equal(clampStep(0, 8), 1);
  assert.equal(clampStep(3, 8), 3);
  assert.equal(clampStep(9, 8), 8);
  assert.equal(clampStep(2.6, 8), 3);
  assert.equal(clampStep(Number.NaN, 8), 1);
});

test('the plane is square, shares its scale on both axes and holds every value of the sequence', () => {
  const [low, high] = planeDomain(DEFAULT_SEQUENCE);
  assert.ok(low <= 2 && high >= 9);
  assert.ok(high > low);
  // A constant sequence still has a plane to be drawn on.
  const [l, h] = planeDomain([3, 3, 3]);
  assert.ok(l < 3 && h > 3);
  const scale = planeScale([0, 10], { size: 300, margin: 40 });
  assert.equal(scale.x(0), 40);
  assert.equal(scale.x(10), 260 + 0);
  assert.equal(scale.y(0), 260);
  assert.equal(scale.y(10), 40);
  near(scale.x(7) - scale.x(3), scale.y(3) - scale.y(7));
});

test('the rectangle runs from (x̄ₖ₋₁, x̄ₖ) to the point (xₖ, xₖ) of the diagonal, in the units of the data', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  const scale = planeScale([0, 10], { size: 300, margin: 40 });
  const unit = scale.x(1) - scale.x(0);
  const r = rectangleOf(steps[1], scale); // old mean 2, new mean 3, x = 4
  assert.equal(r.x, scale.x(2));
  assert.equal(r.y, scale.y(4));
  assert.equal(r.width, 2 * unit);
  assert.equal(r.height, 1 * unit);
  near(r.width * r.height, steps[1].area * unit * unit);
  assert.deepEqual(r.corner, [scale.x(4), scale.y(4)]);
  // An observation below the mean opens the rectangle on the other side of the diagonal.
  const down = rectangleOf(stepsOf([4, 2])[1], scale); // old mean 4, new mean 3, x = 2
  assert.equal(down.x, scale.x(2));
  assert.equal(down.y, scale.y(3));
  assert.equal(down.width, 2 * unit);
  assert.equal(down.height, 1 * unit);
  assert.equal(rectangleOf(steps[0], scale), null);
});

test('the ledger lays the areas end to end: its length is the running SS on the scale of the final SS', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  const segments = ledgerSegments(steps, 8, 320);
  assert.equal(segments.length, 7); // the first observation adds nothing
  near(segments.at(-1).start + segments.at(-1).length, 320);
  assert.equal(segments[0].start, 0);
  near(segments[0].length, (2 / 32) * 320);
  for (let i = 1; i < segments.length; i += 1) near(segments[i].start, segments[i - 1].start + segments[i - 1].length);
  // Stopping at step 3 shows the area so far, on the same scale.
  const part = ledgerSegments(steps, 3, 320);
  assert.equal(part.length, 2);
  near(part.at(-1).start + part.at(-1).length, (steps[2].ss / 32) * 320);
  assert.equal(part.at(-1).current, true);
  assert.equal(part[0].current, false);
  // Segments too thin for a label carry none.
  assert.equal(segments.find((s) => s.k === 4).labelled, segments.find((s) => s.k === 4).length >= LEDGER_MIN_LABEL);
  // A constant sequence accumulates nothing and does not divide by zero.
  assert.deepEqual(ledgerSegments(stepsOf([3, 3, 3]), 3, 320), []);
});

test('formatValue prints three decimals at most, with a true minus sign', () => {
  assert.equal(formatValue(4), '4');
  assert.equal(formatValue(10 / 3), '3.333');
  assert.equal(formatValue(-2.5), '−2.5');
  assert.equal(formatValue(0.1 + 0.2), '0.3');
  assert.equal(formatValue(-1e-12), '0');
  assert.equal(formatValue(Number.NaN), '—');
});

test('stepEquation substitutes the step into the recurrence, and stepSummary announces it', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  assert.equal(stepEquation(steps[1]), 'SS₂ = 0 + (4 − 2)(4 − 3) = 2');
  assert.equal(stepEquation(steps[7]), 'SS₈ = 13.714 + (9 − 4.429)(9 − 5) = 32');
  assert.equal(stepEquation(steps[0]), 'SS₁ = 0: one observation has no spread');
  const summary = stepSummary(steps[1], 8);
  assert.match(summary, /Step 2 of 8/);
  assert.match(summary, /mean moves from 2 to 3/);
  assert.match(summary, /area 2/);
  assert.match(summary, /SS is 2/);
  assert.match(stepSummary(steps[0], 8), /Step 1 of 8/);
});

test('the scene draws the step on the plane with the three marks and the rectangle', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  const svg = planeSvg(steps[1], { id: 't', domain: [0, 10], size: 300, title: 'Step', desc: 'Step 2' });
  assert.match(svg, /<svg[^>]*viewBox="0 0 300 300"/);
  assert.match(svg, /data-el="rectangle"/);
  assert.match(svg, /data-el="new-mean"/);
  assert.match(svg, /data-el="old-mean"/);
  assert.match(svg, /data-el="observation"/);
  assert.match(svg, /<title id="t-title">Step<\/title>/);
  // No rectangle and no previous mean before the second observation.
  const first = planeSvg(steps[0], { id: 'u', domain: [0, 10], size: 300, title: 'Step', desc: 'Step 1' });
  assert.doesNotMatch(first, /data-el="rectangle"/);
  assert.doesNotMatch(first, /data-el="old-mean"/);
  assert.match(first, /data-el="observation"/);
});

test('the ledger scene prints the running SS and marks the current step', () => {
  const steps = stepsOf(DEFAULT_SEQUENCE);
  const svg = ledgerSvg(steps, 5, { id: 'l', width: 400, title: 'Ledger', desc: 'SS' });
  assert.equal((svg.match(/data-el="segment"/g) ?? []).length, 4);
  assert.match(svg, /data-current="true"/);
  assert.match(svg, /<title id="l-title">Ledger<\/title>/);
});

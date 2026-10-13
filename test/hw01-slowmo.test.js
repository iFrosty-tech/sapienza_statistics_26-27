/**
 * The timeline of the slowed-down view of homework 1 (src/hw01/slowmo-timeline.js):
 * the group operations of a scalar multiplication on the toy curve
 * y² = x³ + 7 over F₁₇, each with its line modulo p, third point, reflection,
 * result and the arithmetic printed beside the sheet, and the phases in which
 * the view draws one operation. Expected values are those of the assignment
 * (G = (1, 5), 6G = (5, 8)) and of Tables 2 and 3 of the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS,
  PHASE_MS,
  SPEED,
  buildTimeline,
  cubicBezier,
  easeOut,
  explainInverse,
  phasePlan,
  phaseProgress,
} from '../src/hw01/slowmo-timeline.js';
import { TOY_CURVE, isOnCurve } from '../src/lib/toy-curve.js';

const xy = (P) => (P === null ? null : [P.x, P.y]);
const onCurve = (P) => isOnCurve(TOY_CURVE, { x: BigInt(P.x), y: BigInt(P.y) });
const mod = (v, p) => ((v % p) + p) % p;

test('k = 6 by repeated addition: five operations from 2G to 6G = (5, 8)', () => {
  const tl = buildTimeline({ k: 6, method: 'repeated' });
  assert.equal(tl.p, 17);
  assert.equal(tl.n, 9, 'G = (1, 5) has order 9');
  assert.deepEqual(xy(tl.base), [1, 5]);
  assert.equal(tl.ops.length, 5);
  assert.deepEqual(tl.ops.map((o) => xy(o.result)), [[2, 10], [5, 9], [12, 1], [12, 16], [5, 8]]);
  assert.deepEqual(tl.ops.map((o) => o.k), [2, 3, 4, 5, 6]);
  assert.deepEqual(tl.ops.map((o) => o.index), [2, 3, 4, 5, 6]);
  assert.deepEqual(tl.ops.map((o) => o.kind), ['double', 'add', 'add', 'add', 'add'], '2G = G + G is a tangent');
  assert.deepEqual(tl.ops.map((o) => o.step), [1, 2, 3, 4, 5]);
  assert.deepEqual(tl.ops.map((o) => o.lambda), [2, 5, 1, 12, 1], 'the slopes of Table 2');
  assert.deepEqual(xy(tl.result), [5, 8]);
  assert.equal(tl.resultK, 6);
  assert.equal(tl.states.length, 6, 'one accumulator state before and after every operation');
  assert.deepEqual(xy(tl.states[0].point), [1, 5], 'repeated addition starts from G');
  assert.equal(tl.states[0].k, 1);
  const last = tl.ops.at(-1);
  assert.deepEqual([last.iP, last.iQ, last.kP, last.kQ], [5, 1, 5, 1]);
  assert.equal(last.text, '6G = 5G + G = (5, 8)');
  assert.equal(last.bit, null);
});

test('k = 6 by double-and-add: load G, then double, add, double (indices 2, 3, 6)', () => {
  const tl = buildTimeline({ k: 6, method: 'double-and-add' });
  assert.equal(tl.bits, '110');
  assert.deepEqual(tl.ops.map((o) => o.kind), ['load', 'double', 'add', 'double']);
  assert.deepEqual(tl.ops.filter((o) => o.kind !== 'load').map((o) => o.index), [2, 3, 6]);
  assert.deepEqual(tl.ops.map((o) => [o.bitIndex, o.bit]), [[0, 1], [1, 1], [1, 1], [2, 0]]);
  assert.deepEqual(xy(tl.ops[0].result), [1, 5]);
  assert.equal(tl.ops[0].line, null);
  assert.deepEqual(xy(tl.ops.at(-1).result), [5, 8]);
  assert.equal(tl.ops.at(-1).text, '6G = 3G + 3G = (5, 8)');
  assert.equal(tl.states[0].point, undefined, 'nothing is loaded before the leading bit');
  assert.deepEqual(xy(tl.result), [5, 8]);
});

test('the modular inverse is explained with its check, as in 10⁻¹ ≡ 12 (mod 17)', () => {
  const e = explainInverse(10, 17);
  assert.equal(e.inverse, 12);
  assert.equal(e.text, '10⁻¹ ≡ 12 (mod 17) because 10·12 = 120 = 7·17 + 1');
  assert.equal(e.html, '10<sup>−1</sup> ≡ 12 (mod 17) because 10·12 = 120 = 7·17 + 1');
  assert.equal(explainInverse(-11, 17).inverse, 3, 'a negative value is reduced first: −11 ≡ 6, 6·3 = 18');
  assert.throws(() => explainInverse(0, 17), RangeError);
  // 2G = G + G: the tangent at (1, 5) has slope 3·1²·(2·5)⁻¹ = 3·12 ≡ 2.
  const op = buildTimeline({ k: 2, method: 'repeated' }).ops[0];
  assert.ok(op.formulas.inverse.includes('10<sup>−1</sup> ≡ 12 (mod 17) because 10·12 = 120 = 7·17 + 1'));
  assert.ok(op.formulas.lambda.includes('≡ 2 (mod 17)'), op.formulas.lambda);
  for (const key of ['operands', 'lambda', 'nu', 'x3', 'yPrime', 'y3', 'result']) {
    assert.equal(typeof op.formulas[key], 'string', `formula ${key}`);
  }
  assert.ok(op.formulas.x3.includes('2<sup>2</sup> − 1 − 1 = 2'), op.formulas.x3);
  // 6G = 5G + G: x₃ = 1² − 12 − 1 = −12 ≡ 5, y′ = 1·5 + 4 = 9, y₃ = −9 ≡ 8.
  const sixth = buildTimeline({ k: 6, method: 'repeated' }).ops.at(-1);
  assert.ok(sixth.formulas.x3.includes('= −12 ≡ 5 (mod 17)'), sixth.formulas.x3);
  assert.ok(sixth.formulas.yPrime.includes('1·5 + 4 = 9'), sixth.formulas.yPrime);
  assert.ok(sixth.formulas.y3.includes('−9 ≡ 8 (mod 17)'), sixth.formulas.y3);
});

test('k = 9 ends at O through a vertical line, and k = 10 continues with O + G = G', () => {
  const nine = buildTimeline({ k: 9, method: 'repeated' });
  const last = nine.ops.at(-1);
  assert.equal(last.kind, 'inverse');
  assert.equal(last.result, null);
  assert.equal(last.index, 0);
  assert.equal(last.third, null);
  assert.deepEqual(last.line && [last.line.vertical, last.line.x], [true, 1]);
  assert.equal(last.line.segments.length, 1);
  assert.equal(nine.result, null);
  assert.equal(last.text, '9G = 8G + G = O');
  const ten = buildTimeline({ k: 10, method: 'repeated' });
  const after = ten.ops.at(-1);
  assert.equal(after.kind, 'identity');
  assert.equal(after.P, null);
  assert.deepEqual(xy(after.result), [1, 5]);
  assert.equal(after.k, 10);
  assert.equal(after.index, 1);
  assert.equal(after.line, null);
  assert.ok(after.formulas.operands.includes('identity'), after.formulas.operands);
});

test('doubling a point with y = 0 gives O by a vertical tangent', () => {
  const tl = buildTimeline({ base: { x: 3, y: 0 }, k: 2, method: 'repeated' });
  assert.equal(tl.n, 2);
  const op = tl.ops[0];
  assert.equal(op.kind, 'double');
  assert.equal(op.result, null);
  assert.equal(op.lambda, null);
  assert.deepEqual([op.line.vertical, op.line.x], [true, 3]);
  const dbl = buildTimeline({ base: { x: 3, y: 0 }, k: 3, method: 'double-and-add' });
  assert.deepEqual(dbl.ops.map((o) => o.kind), ['load', 'double', 'identity']);
  assert.deepEqual(xy(dbl.result), [3, 0]);
});

test('every third point lies on its line modulo p and on the curve; lines carry their p lattice points', () => {
  for (const base of [{ x: 1, y: 5 }, { x: 6, y: 6 }, { x: 8, y: 3 }]) {
    for (const method of ['repeated', 'double-and-add']) {
      const tl = buildTimeline({ base, k: method === 'repeated' ? 40 : 9999, method });
      for (const op of tl.ops) {
        if (op.third) {
          assert.equal(op.third.y, mod(op.lambda * op.third.x + op.nu, 17), `${op.text}: R′ on the line`);
          assert.ok(onCurve(op.third), `${op.text}: R′ on the curve`);
          assert.deepEqual([op.result.x, op.result.y], [op.third.x, mod(-op.third.y, 17)], 'R = −R′');
        }
        if (op.result) assert.ok(onCurve(op.result));
        if (op.line && !op.line.vertical) {
          assert.equal(op.line.points.length, 17);
          assert.ok(op.line.points.some((q) => q.x === op.third.x && q.y === op.third.y));
          assert.equal(mod(op.line.slope - op.lambda, 17), 0, 'the drawn slope is a representative of λ');
          assert.ok(Math.abs(op.line.slope) <= 8, 'the representative with the fewest wraps');
          assert.ok(op.line.segments.length >= 1);
          assert.equal(op.line.ticks.length, 17);
          assert.ok(op.line.ticks.every((t, i, a) => t > 0 && t < 1 && (i === 0 || t > a[i - 1])), 'ticks in drawing order');
        }
        assert.equal(op.index, mod(op.k, tl.n));
      }
    }
  }
});

test('parameters are validated against the limits of each method', () => {
  assert.equal(LIMITS.repeated, 60);
  assert.equal(LIMITS.doubleAndAdd, 9999);
  assert.throws(() => buildTimeline({ k: 61, method: 'repeated' }), RangeError);
  assert.throws(() => buildTimeline({ k: 0, method: 'double-and-add' }), RangeError);
  assert.throws(() => buildTimeline({ k: 10000, method: 'double-and-add' }), RangeError);
  assert.throws(() => buildTimeline({ k: 2.5, method: 'repeated' }), RangeError);
  assert.throws(() => buildTimeline({ base: { x: 1, y: 6 }, k: 2, method: 'repeated' }), RangeError, 'base off the curve');
  assert.throws(() => buildTimeline({ k: 2, method: 'binary' }), RangeError);
  assert.equal(buildTimeline({ k: 1, method: 'repeated' }).ops.length, 0, 'k = 1: G itself, no operation');
});

test('one operation unfolds in phases: operands, line, third point, reflection, landing, clearing', () => {
  const add = buildTimeline({ k: 3, method: 'repeated' }).ops[1]; // 2G + G
  assert.equal(add.kind, 'add');
  const plan = phasePlan(add);
  assert.deepEqual(plan.map((ph) => ph.name), ['operands', 'line', 'third', 'reflect', 'land', 'clear']);
  assert.deepEqual(plan.map((ph) => ph.duration), [250, 900, 300, 500, 400, 200]);
  assert.equal(PHASE_MS.line, 900);
  const total = plan.at(-1).start + plan.at(-1).duration;
  assert.equal(total, 2550);
  const start = phaseProgress(add, 0);
  assert.equal(start.active, 'operands');
  assert.equal(start.operands, 0);
  assert.equal(start.done, false);
  const mid = phaseProgress(add, 250 + 450);
  assert.equal(mid.active, 'line');
  assert.equal(mid.operands, 1);
  assert.ok(Math.abs(mid.line - 0.5) < 1e-12);
  assert.equal(mid.third, 0);
  const end = phaseProgress(add, total);
  assert.equal(end.done, true);
  for (const name of ['operands', 'line', 'third', 'reflect', 'land', 'clear']) assert.equal(end[name], 1);
  // A vertical line has no reflection; O + G has no line at all; loading G only lands.
  const inverse = buildTimeline({ k: 9, method: 'repeated' }).ops.at(-1);
  assert.deepEqual(phasePlan(inverse).map((ph) => ph.name), ['operands', 'line', 'third', 'land', 'clear']);
  assert.equal(phaseProgress(inverse, 99999).reflect, null);
  const identity = buildTimeline({ k: 10, method: 'repeated' }).ops.at(-1);
  assert.deepEqual(phasePlan(identity).map((ph) => ph.name), ['operands', 'land', 'clear']);
  const load = buildTimeline({ k: 6, method: 'double-and-add' }).ops[0];
  assert.deepEqual(phasePlan(load).map((ph) => ph.name), ['operands', 'land']);
  assert.deepEqual(SPEED, { slow: 2, normal: 1, fast: 0.5 });
});

test('the easing of arrivals is the site curve cubic-bezier(0.16, 1, 0.3, 1)', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  let prev = 0;
  for (let i = 1; i <= 100; i += 1) {
    const v = easeOut(i / 100);
    assert.ok(v >= prev - 1e-12, 'monotone');
    prev = v;
  }
  assert.ok(easeOut(0.3) > 0.8, 'a strong deceleration');
  const linear = cubicBezier(0, 0, 1, 1);
  assert.ok(Math.abs(linear(0.37) - 0.37) < 1e-6);
});

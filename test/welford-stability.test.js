/**
 * The numerical study of homework 4, exercise 1 (src/lib/welford-stability.js):
 * the exact sum of squares of a sample of doubles in rational arithmetic, its
 * correctly rounded value, the condition number, the three algorithms, the
 * relative error measured exactly, and the sweep of the condition number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/lib/welford.js';
import {
  conditionNumber,
  decomposeDouble,
  exactSumOfSquares,
  PUBLISHED_BOUNDS,
  fitLogLogSlope,
  rationalToNumber,
  relativeError,
  runStabilityStudy,
  textbookSumOfSquares,
  twoPassSumOfSquares,
  welfordSumOfSquares,
} from '../src/lib/welford-stability.js';

const DATA = [2, 4, 4, 4, 5, 5, 7, 9];
const dyadic = ({ mantissa, exponent }) => (exponent >= 0 ? mantissa * 2n ** BigInt(exponent) : null);

test('decomposeDouble writes a double as an exact integer times a power of two', () => {
  assert.deepEqual(decomposeDouble(0), { mantissa: 0n, exponent: 0 });
  // 3.5 = 7 · 2⁻¹ once the trailing zeros of the mantissa are removed.
  assert.deepEqual(decomposeDouble(3.5), { mantissa: 7n, exponent: -1 });
  assert.deepEqual(decomposeDouble(-3.5), { mantissa: -7n, exponent: -1 });
  // The smallest subnormal is 2⁻¹⁰⁷⁴.
  assert.deepEqual(decomposeDouble(5e-324), { mantissa: 1n, exponent: -1074 });
  // 0.1 is not one tenth: its mantissa is odd, of 52 bits, over 2⁵⁵.
  assert.deepEqual(decomposeDouble(0.1), { mantissa: 3602879701896397n, exponent: -55 });
  assert.equal(dyadic(decomposeDouble(1e22)), 10n ** 22n);
  assert.throws(() => decomposeDouble(Infinity), RangeError);
  assert.throws(() => decomposeDouble(NaN), RangeError);
});

test('rationalToNumber rounds an exact quotient to the nearest double, ties to even', () => {
  // Division of two doubles is correctly rounded, so it is the reference for small integers.
  for (const [p, q] of [[1n, 3n], [2n, 3n], [14n, 3n], [1n, 10n], [22n, 7n], [123456789n, 987654321n]]) {
    assert.equal(rationalToNumber(p, q), Number(p) / Number(q), `${p}/${q}`);
  }
  assert.equal(rationalToNumber(0n, 5n), 0);
  assert.equal(rationalToNumber(-1n, 3n), -1 / 3);
  assert.equal(rationalToNumber(1n, -3n), -1 / 3);
  // Operands far beyond the range of a double.
  assert.equal(rationalToNumber(10n ** 400n, 3n * 10n ** 400n), 1 / 3);
  // Halfway between two doubles the even mantissa wins; just above halfway the upper one does.
  const two53 = 2n ** 53n;
  assert.equal(rationalToNumber(two53 + 1n, 1n), 2 ** 53);
  assert.equal(rationalToNumber(two53 + 3n, 1n), 2 ** 53 + 4);
  assert.equal(rationalToNumber(2n * two53 + 3n, 2n), 2 ** 53 + 2);
  // The sticky bit: a remainder far below the last place still breaks the tie upwards.
  assert.equal(rationalToNumber(10n ** 40n * (two53 + 1n) + 1n, 10n ** 40n), 2 ** 53 + 2);
  // The bottom of the subnormal range.
  assert.equal(rationalToNumber(1n, 2n ** 1074n), 5e-324);
  assert.throws(() => rationalToNumber(1n, 0n), RangeError);
});

test('exactSumOfSquares gives the exact rational value on hand cases', () => {
  const value = (data) => {
    const { numerator, denominator } = exactSumOfSquares(data);
    return rationalToNumber(numerator, denominator);
  };
  assert.equal(value(DATA), 32);
  assert.equal(value([1, 2, 3]), 2);
  // 1, 2, 4: mean 7/3, so that SS = 21 − 49/3 = 14/3, not a dyadic number.
  const { numerator, denominator } = exactSumOfSquares([1, 2, 4]);
  assert.equal(numerator * 3n, 14n * denominator);
  // 0.5 and 0.25: mean 3/8, so that SS = 2 · (1/8)² = 1/32.
  assert.equal(value([0.5, 0.25]), 1 / 32);
  // The double nearest 0.2 is exactly twice the one nearest 0.1, so that SS = a²/2 for a = 0.1d.
  const a = exactSumOfSquares([0.1, 0.2]);
  const m = 3602879701896397n;
  assert.equal(a.numerator * 2n ** 111n, m * m * a.denominator);
  // A sample of one and a constant sample have no spread at all.
  assert.equal(value([7.5]), 0);
  assert.equal(value([0.1, 0.1, 0.1]), 0);
  // Rounding in the data is part of the data: 1e16 + 1 is 1e16 as a double, and SS is exactly zero.
  assert.equal(value([1e16, 1e16 + 1]), 0);
  assert.throws(() => exactSumOfSquares([]), RangeError);
});

test('exactSumOfSquares stays exact where the doubles disagree by forty orders of magnitude', () => {
  // 1 and 2⁻¹⁰⁰: n·∑x² − (∑x)² = (1 − 2⁻¹⁰⁰)², so that SS = (1 − 2⁻¹⁰⁰)²/2.
  const small = 2 ** -100;
  const { numerator, denominator } = exactSumOfSquares([1, small]);
  const scale = 2n ** 100n;
  assert.equal(numerator * 2n * scale * scale, (scale - 1n) ** 2n * denominator);
});

test('conditionNumber is κ = ‖x‖₂/√SS = √(1 + n·x̄²/SS)', () => {
  // 1, 2, 3: ‖x‖² = 14 and SS = 2, so that κ² = 7 = 1 + 3·4/2.
  assert.equal(conditionNumber([1, 2, 3]), Math.sqrt(7));
  // A sample of mean zero is perfectly conditioned.
  assert.equal(conditionNumber([-1, 1]), 1);
  assert.equal(conditionNumber([-3, 1, 2]), 1);
  // κ is unchanged when the data are scaled.
  assert.equal(conditionNumber([2, 4, 6]), Math.sqrt(7));
  // A constant sample has no sum of squares to be sensitive about.
  assert.equal(conditionNumber([5, 5, 5]), Infinity);
  // κ ≈ |x̄|/s for small spread: c ± 1 has x̄ = c and SS = 2.
  assert.ok(Math.abs(conditionNumber([1e6 - 1, 1e6 + 1]) - 1e6) < 1);
});

test('the three algorithms agree on well-conditioned data and name the right formulas', () => {
  assert.equal(textbookSumOfSquares(DATA), 32);
  assert.equal(twoPassSumOfSquares(DATA), 32);
  assert.equal(welfordSumOfSquares(DATA), 32);
  // The textbook formula squares the sum: on 0.1, 0.2, 0.3 it keeps its rounding.
  const data = [0.1, 0.2, 0.3];
  const sum = data.reduce((s, x) => s + x, 0);
  const squares = data.reduce((s, x) => s + x * x, 0);
  assert.equal(textbookSumOfSquares(data), squares - (sum * sum) / 3);
  // The two-pass algorithm uses the computed mean, then sums the squared deviations.
  const mean = sum / 3;
  assert.equal(twoPassSumOfSquares(data), data.reduce((s, x) => s + (x - mean) ** 2, 0));
  // Welford's is the single implementation of src/lib/welford.js, not a second copy.
  assert.equal(welfordSumOfSquares(data), summarize(data).ss);
});

test('relativeError is measured against the exact rational, not against a rounded value', () => {
  // 0.1d − 1/10 = 2⁻⁵⁵/10·(…): the double exceeds one tenth by 5.55 · 10⁻¹⁸, a relative 5.55 · 10⁻¹⁷.
  const exact = { numerator: 1n, denominator: 10n };
  const r = relativeError(0.1, exact);
  assert.ok(Math.abs(r - 5.551115123125783e-17) < 1e-30, String(r));
  assert.equal(relativeError(0.5, { numerator: 1n, denominator: 2n }), 0);
  // A negative computed value is an error beyond 100%.
  assert.equal(relativeError(-1, { numerator: 1n, denominator: 1n }), 2);
  assert.equal(relativeError(0, { numerator: 3n, denominator: 1n }), 1);
  // Nothing can be relative to zero: a perfect zero is no error, anything else is infinite.
  assert.equal(relativeError(0, { numerator: 0n, denominator: 1n }), 0);
  assert.equal(relativeError(1e-20, { numerator: 0n, denominator: 1n }), Infinity);
});

test('fitLogLogSlope recovers a power law and rejects a degenerate fit', () => {
  const points = [1, 10, 100, 1000].map((x) => ({ x, y: 3 * x ** 2 }));
  const { slope, count } = fitLogLogSlope(points);
  assert.ok(Math.abs(slope - 2) < 1e-12);
  assert.equal(count, 4);
  assert.ok(Number.isNaN(fitLogLogSlope([{ x: 1, y: 1 }]).slope));
  // Zeros cannot be drawn on logarithmic axes, so they do not enter the fit.
  const withZero = fitLogLogSlope([...points, { x: 1e4, y: 0 }]);
  assert.equal(withZero.count, 4);
});

const params = {
  seed: 20261031,
  n: 200,
  replicates: 12,
  shifts: [0, 1e2, 1e4, 1e6, 1e7, 1e8, 3e8, 1e9],
  fit: {
    textbook: { algorithm: 'textbook', low: 1e3, high: 3e7 },
    welford: { algorithm: 'welford', low: 1e2, high: 1e9 },
    twoPassFlat: { algorithm: 'twoPass', low: 1, high: 1e7 },
  },
  scores: { p: 0.3, top: 10, n: 400, replicates: 12 },
};
const study = runStabilityStudy(params);

test('the study is reproducible from its seed and sweeps κ with the shift', () => {
  assert.deepEqual(runStabilityStudy(params), study);
  assert.equal(study.points.length, params.shifts.length);
  const kappas = study.points.map((p) => p.kappa);
  for (let i = 1; i < kappas.length; i += 1) assert.ok(kappas[i] > kappas[i - 1], `κ grows with the shift at ${i}`);
  assert.ok(kappas[0] < 1.5, `unshifted data are well conditioned, κ = ${kappas[0]}`);
  assert.ok(kappas.at(-1) > 5e8, `the sweep passes κ = 10⁸, reached ${kappas.at(-1)}`);
  assert.notDeepEqual(runStabilityStudy({ ...params, seed: 7 }).points[0], study.points[0]);
});

test('the medians separate the algorithms, each worst error bounds its median, and Welford stays non-negative', () => {
  for (const p of study.points) {
    for (const name of ['textbook', 'twoPass', 'welford']) {
      const a = p.algorithms[name];
      assert.ok(a.worst >= a.median, `${name} at κ = ${p.kappa}`);
      assert.ok(a.median >= 0, `${name} at κ = ${p.kappa}`);
    }
    assert.equal(p.algorithms.welford.negative, 0, `Welford returned a negative SS at κ = ${p.kappa}`);
    assert.equal(p.algorithms.twoPass.negative, 0);
  }
  const at = (k) => study.points.find((p) => p.kappa > k);
  // Near κ = 10⁴: the textbook formula has lost about eight digits, the other two almost none.
  assert.ok(at(5e3).algorithms.textbook.median > 1e-11);
  assert.ok(at(5e3).algorithms.welford.median < 1e-10);
  assert.ok(at(5e3).algorithms.twoPass.median < 1e-13);
  // Near κ = 10⁸ the textbook formula has no correct digit left, while Welford still has several.
  const lost = at(5e7).algorithms.textbook;
  assert.ok(lost.median > 0.1, `textbook median ${lost.median}`);
  assert.ok(lost.negative > 0, 'the textbook formula goes negative');
  assert.ok(at(5e7).algorithms.welford.median < 1e-4);
});

test('the measured slopes sit near two for the textbook formula and near one for updating', () => {
  assert.ok(Math.abs(study.slopes.textbook.slope - 2) < 0.25, `textbook ${study.slopes.textbook.slope}`);
  assert.ok(Math.abs(study.slopes.welford.slope - 1) < 0.25, `Welford ${study.slopes.welford.slope}`);
  assert.ok(study.slopes.textbook.count >= 3);
  assert.ok(study.slopes.welford.count >= 3);
  // Two fits of one algorithm: below its second-order term the two-pass error does not follow κ at all.
  assert.ok(Math.abs(study.slopes.twoPassFlat.slope) < 0.25, `two-pass ${study.slopes.twoPassFlat.slope}`);
  assert.equal(study.slopes.twoPassFlat.algorithm, 'twoPass');
});

test('every measured error stays under its published bound where that bound is informative', () => {
  for (const name of ['textbook', 'twoPass', 'welford']) {
    assert.ok(study.boundRatios[name] > 0, name);
    assert.ok(study.boundRatios[name] <= 1, `${name}: ${study.boundRatios[name]}`);
  }
  assert.equal(PUBLISHED_BOUNDS.textbook(10, 100), 10 * 1e4 * 2 ** -53);
  assert.equal(PUBLISHED_BOUNDS.welford(10, 100), 10 * 100 * 2 ** -53);
  assert.equal(PUBLISHED_BOUNDS.twoPass(10, 100), 10 * 2 ** -53 + 100 * 1e4 * 2 ** -106);
});

test('the scores of exercise 2 are well conditioned and every algorithm is accurate on them', () => {
  const { kappa, algorithms } = study.scores;
  // κ² ≈ 1 + μ²/σ² = 1 + 2.25/7.75 for the score law X = B·Y of exercise 2.
  assert.ok(Math.abs(kappa - Math.sqrt(1 + 2.25 / 7.75)) < 0.03, String(kappa));
  for (const name of ['textbook', 'twoPass', 'welford']) {
    assert.ok(algorithms[name].worst < 1e-13, `${name}: ${algorithms[name].worst}`);
    assert.equal(algorithms[name].negative, 0);
  }
});

test('the study rejects a sample too small to have a variance', () => {
  assert.throws(() => runStabilityStudy({ ...params, n: 1 }), RangeError);
  assert.throws(() => runStabilityStudy({ ...params, replicates: 0 }), RangeError);
});

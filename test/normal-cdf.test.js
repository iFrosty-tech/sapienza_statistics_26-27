/**
 * Homework 5, exercise 2: the methods of src/lib/normal-cdf.js against the 80-digit reference, the reference
 * against known values and against the table of the web, and the orders of the quadrature rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HYBRID_CUTOFF,
  approximation26217,
  continuedFraction,
  continuedFractionPhi,
  erf,
  erfTaylor,
  hybrid,
  maclaurin,
  numericalRecipesPhi,
  phi,
  referencePhi,
  simpson,
  trapezoid,
} from '../src/lib/normal-cdf.js';
import { WEB_ERF } from '../src/lib/hw07-study.js';

const relative = (v, r) => Math.abs(v - r) / r;
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('the reference reproduces known values of the standard normal distribution function', () => {
  assert.equal(referencePhi(0).value, 0.5);
  assert.equal(referencePhi(1).value, 0.8413447460685429);
  assert.equal(referencePhi(2).value, 0.9772498680518208);
  near(referencePhi(-1.959963984540054).value, 0.025, 1e-16);
  // Φ(−8) = 6.22096057427178e-16 and Φ(−10) = 7.619853024160527e-24.
  assert.ok(relative(referencePhi(-8).value, 6.22096057427178e-16) < 1e-13);
  assert.ok(relative(referencePhi(-10).value, 7.619853024160527e-24) < 1e-13);
});

test('the reference is symmetric and carries 80 digits', () => {
  for (const x of [0.3, 1.7, 4.2, 9.1]) {
    assert.equal(referencePhi(x).tail, referencePhi(-x).value);
    assert.equal(referencePhi(-x).tail, referencePhi(-x).value);
  }
  assert.match(referencePhi(1).text, /^0\.8413447460685429485852325456320379224779129667266043909873944502429914/);
  assert.throws(() => referencePhi(13), RangeError);
  assert.throws(() => referencePhi(Infinity), RangeError);
});

test('the reference agrees with the table of the web to its nine decimals', () => {
  for (const row of WEB_ERF) {
    const erfRef = 2 * referencePhi(row.z * Math.SQRT2).value - 1;
    assert.ok(Math.abs(erfRef - row.erf) <= 5e-10, `erf ${row.z}`);
    const erfcRef = 2 * referencePhi(-row.z * Math.SQRT2).value;
    assert.ok(Math.abs(erfcRef - row.erfc) <= 5e-10, `erfc ${row.z}`);
  }
});

test('the hybrid method agrees with the table of the web to its rounding', () => {
  for (const row of WEB_ERF) {
    assert.ok(Math.abs(erf(row.z) - row.erf) <= 5e-10, `erf ${row.z}`);
    assert.ok(Math.abs(2 * hybrid(-row.z * Math.SQRT2).value - row.erfc) <= 5e-10, `erfc ${row.z}`);
  }
});

test('the hybrid method keeps the relative accuracy of the tail up to x = 10', () => {
  for (let x = 0.25; x <= 10; x += 0.25) {
    const ref = referencePhi(-x).value;
    assert.ok(relative(hybrid(-x).value, ref) < 1e-13, `x = ${x}`);
    assert.ok(relative(hybrid(-x).tail, ref) < 1e-13, `tail at x = ${x}`);
    assert.ok(Math.abs(hybrid(x).value - referencePhi(x).value) < 3e-16, `upper half at x = ${x}`);
  }
  assert.equal(hybrid(0).value, 0.5);
  assert.equal(hybrid(50).value, 1);
  assert.equal(hybrid(-50).value, 0);
  assert.ok(Number.isNaN(hybrid(NaN).value));
});

test('the hybrid method switches methods at the cutoff and the two sides agree', () => {
  const below = hybrid(HYBRID_CUTOFF - 1e-9);
  const above = hybrid(HYBRID_CUTOFF);
  // Φ itself moves by φ(2)·10⁻⁹ over the gap, so the two sides agree to that and to the roundoff.
  assert.ok(Math.abs(below.value - above.value) < 1e-9 * phi(HYBRID_CUTOFF) + 1e-14);
  assert.ok(below.cost < above.cost, 'the series is cheaper than the fraction near the cutoff');
});

test('the series (11) is accurate in the centre and the number of terms grows with x', () => {
  for (const x of [0.1, 0.5, 1, 2, 3]) {
    assert.ok(Math.abs(maclaurin(x).value - referencePhi(x).value) < 3e-16, `x = ${x}`);
  }
  assert.ok(maclaurin(5).cost > maclaurin(1).cost);
});

test('the error-function series loses the tail, and the Maclaurin series loses it later', () => {
  const ref = referencePhi(-6).value;
  assert.ok(relative(erfTaylor(-6).value, ref) > 1e-3);
  assert.ok(relative(maclaurin(-6).value, ref) < 1e-6);
  assert.ok(relative(erfTaylor(-8).value, referencePhi(-8).value) > 1);
});

test('the continued fraction needs x > 0 and converges faster in the tail', () => {
  assert.throws(() => continuedFraction(0), RangeError);
  assert.throws(() => continuedFraction(-1), RangeError);
  assert.ok(relative(continuedFraction(3).value, referencePhi(-3).value) < 1e-14);
  assert.ok(continuedFraction(5).cost < continuedFraction(1).cost);
  assert.equal(continuedFractionPhi(0).value, 0.5);
  near(continuedFractionPhi(2).value + continuedFractionPhi(-2).value, 1, 1e-15);
});

test('the two approximations keep the error they promise, and the Numerical Recipes fit keeps it in the tail', () => {
  for (let x = -10; x <= 10; x += 0.25) {
    const ref = referencePhi(x).value;
    assert.ok(Math.abs(approximation26217(x).value - ref) < 7.5e-8, `A&S at ${x}`);
    // The lower tail is what the fit returns for x ≤ 0; for x > 0 it returns 1 − tail, which a double cannot resolve.
    if (x <= 0) assert.ok(relative(numericalRecipesPhi(x).value, ref) < 1.3e-7, `NR at ${x}`);
  }
  // The absolute bound says nothing about the tail: the relative error of A&S grows.
  assert.ok(relative(approximation26217(-8).value, referencePhi(-8).value) > 1e-3);
});

test('the quadrature rules have the orders of their error terms', () => {
  const x = 1.5;
  const ref = referencePhi(x).value;
  const t = (n) => Math.abs(trapezoid(x, n).value - ref);
  const s = (n) => Math.abs(simpson(x, n).value - ref);
  near(t(16) / t(32), 4, 0.2);
  near(s(8) / s(16), 16, 1.5);
  assert.throws(() => simpson(1, 5), RangeError);
  // Equation (8): the integral minus the trapezoidal sum is −h²/12 [φ'(x) − φ'(0)] to leading order.
  const h = x / 64;
  const predicted = (-(h * h) / 12) * (-x * phi(x));
  near(ref - trapezoid(x, 64).value, predicted, Math.abs(predicted) * 0.02);
});

test('erf is odd, and erf(z) = 2Φ(z√2) − 1', () => {
  near(erf(0.7), -erf(-0.7), 1e-15);
  near(erf(1), 2 * referencePhi(Math.SQRT2).value - 1, 1e-15);
  assert.equal(erf(0), 0);
});

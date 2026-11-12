/**
 * Homework 5, exercise 1: the Riemann and Lebesgue sums of src/lib/integration.js against exact values, the
 * exactness of the Lebesgue sum on step functions, the identity that turns it into a Riemann sum of the
 * distribution function, and the integer sums of the Dirichlet and Thomae functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCTIONS,
  dirichletSums,
  functionByKey,
  lebesgue,
  lebesgueSlabs,
  lebesgueSum,
  levelsOf,
  measureAtLeast,
  riemannSum,
  sampledLebesgueSum,
  thomaeLevelCounts,
  thomaeSums,
  totients,
} from '../src/lib/integration.js';

const near = (a, b, tol, message = '') => assert.ok(Math.abs(a - b) <= tol, `${message} ${a} vs ${b}`);

test('the midpoint sum of every smooth function is close to its exact integral', () => {
  for (const key of ['sin', 'square', 'sinc']) {
    const fn = functionByKey(key);
    near(riemannSum(fn, 2000, 'mid'), fn.exact, 1e-6, key);
  }
  near(riemannSum(functionByKey('abs'), 2000, 'mid'), 0.25, 1e-6);
});

test('the exact value of sin(x)/x is the sine integral of pi', () => {
  // Si(π) = ∫₀^π sin t / t dt, by a composite Simpson rule on the smooth integrand.
  const f = functionByKey('sinc').f;
  const n = 20000;
  const h = Math.PI / n;
  let sum = f(0) + f(Math.PI);
  for (let k = 1; k < n; k += 1) sum += (k % 2 ? 4 : 2) * f(k * h);
  near((sum * h) / 3, functionByKey('sinc').exact, 1e-12);
});

test('the Lebesgue sum of a step function is exact for every number of levels', () => {
  for (const key of ['step', 'indicator']) {
    const fn = functionByKey(key);
    for (const N of [1, 2, 3, 7, 10, 101, 1001]) near(lebesgue(fn, N).value, fn.exact, 1e-12, `${key} N=${N}`);
  }
});

test('at an even n the left and midpoint sums of a step function are exact, at an odd n every rule is off by about 1/n', () => {
  const step = functionByKey('step');
  near(riemannSum(step, 1000, 'left'), 2, 1e-12);
  near(riemannSum(step, 1000, 'mid'), 2, 1e-12);
  for (const rule of ['left', 'mid', 'right']) near(Math.abs(riemannSum(step, 1001, rule) - 2) * 1001, 1, 0.01, rule);
});

test('the Lebesgue sum is a lower sum whose error is below the step of the levels times the length', () => {
  for (const fn of FUNCTIONS.filter((f) => !f.unbounded)) {
    for (const N of [5, 50, 500]) {
      const { value, h } = lebesgueSum(fn, N);
      assert.ok(value <= fn.exact + 1e-12, `${fn.key} N=${N} is above the integral`);
      assert.ok(fn.exact - value <= h * (fn.b - fn.a) + 1e-12, `${fn.key} N=${N} is farther than h(b − a)`);
    }
  }
});

test('the Lebesgue sum is m(b − a) plus h times the sum of the distribution function over the levels, equation (3)', () => {
  for (const fn of FUNCTIONS.filter((f) => !f.unbounded)) {
    const N = 40;
    const { levels, h } = levelsOf(fn, N);
    let sum = fn.lo * (fn.b - fn.a);
    for (let k = 1; k <= N; k += 1) sum += h * measureAtLeast(fn, levels[k]);
    near(sum, lebesgueSum(fn, N).value, 1e-12, fn.key);
  }
});

test('the superlevel sets agree with the function they invert', () => {
  for (const fn of FUNCTIONS) {
    for (const c of [0.1, 0.4, 0.8, 1.5, 2.5]) {
      for (const [x0, x1] of fn.superlevel(c)) {
        if (x1 <= x0) continue;
        const inside = x0 + (x1 - x0) / 2;
        assert.ok(fn.f(inside) >= c - 1e-9, `${fn.key} c=${c} at ${inside}`);
      }
    }
  }
});

test('the slabs of a Lebesgue sum add up to the sum and cover the domain', () => {
  for (const fn of FUNCTIONS) {
    const N = 12;
    const slabs = lebesgueSlabs(fn, N);
    near(slabs.reduce((s, k) => s + k.area, 0), lebesgue(fn, N).value, 1e-9, fn.key);
    near(slabs.reduce((s, k) => s + k.measure, 0), fn.b - fn.a, 1e-9, `${fn.key} measure`);
  }
});

test('the left sum of an unbounded function is infinite and the other sums converge to the integral', () => {
  const fn = functionByKey('inverseRoot');
  assert.equal(riemannSum(fn, 100, 'left'), Infinity);
  near(riemannSum(fn, 100000, 'mid'), 2, 0.01);
  near(lebesgue(fn, 100000).value, 2, 0.02);
});

test('the Lebesgue sum with sampled preimages is seeded and close to the integral', () => {
  const fn = functionByKey('sin');
  const a = sampledLebesgueSum(fn, 200, 20000, 7);
  assert.equal(a, sampledLebesgueSum(fn, 200, 20000, 7));
  assert.notEqual(a, sampledLebesgueSum(fn, 200, 20000, 8));
  near(a, 2, 0.05);
});

test('the Dirichlet sums depend on the tags and not on n, and the Darboux sums are 1 and 0', () => {
  for (const n of [1, 2, 7, 100, 1001]) {
    const d = dirichletSums(n);
    assert.equal(d.rational, 1);
    assert.equal(d.irrational, 0);
    assert.equal(d.upper, 1);
    assert.equal(d.lower, 0);
    assert.ok(d.alternating > 0 && d.alternating <= 1);
  }
});

test('the totients and the level sets of the Thomae function', () => {
  assert.deepEqual([...totients(10)], [0, 1, 1, 2, 2, 4, 2, 6, 4, 6, 4]);
  // Fractions of [0, 1] in lowest terms with denominator at most m: 0/1, 1/1, then 1/2, 1/3, 2/3, …
  assert.deepEqual(thomaeLevelCounts(5), [0, 2, 3, 5, 7, 11]);
});

test('the Thomae sums are exact: small cases by hand, and the bounds of the text', () => {
  // n = 2: pieces [0, 1/2] and [1/2, 1]; both contain a fraction of denominator 1 or 2, so the upper sum is (1 + 1/2)/2 ... checked below.
  near(thomaeSums(2).upper, (1 + 1) / 2, 1e-15);
  // Right-end tags 1/2 and 1: f = 1/2 and 1, so the sum is (1/2 + 1)/2.
  assert.equal(thomaeSums(2).rational, 0.75);
  // n = 3: tags 1/3, 2/3, 1 have f = 1/3, 1/3, 1; the piece [1/3, 2/3] contains 1/2, of denominator 2.
  near(thomaeSums(3).rational, (1 / 3 + 1 / 3 + 1) / 3, 1e-15);
  near(thomaeSums(3).upper, (1 + 1 / 2 + 1) / 3, 1e-15);
  for (const n of [10, 97, 360, 1000]) {
    const t = thomaeSums(n);
    assert.ok(t.lower === 0 && t.irrational === 0);
    let divisors = 0;
    for (let d = 1; d <= n; d += 1) if (n % d === 0) divisors += 1;
    assert.ok(t.rational <= divisors / n + 1e-15, `n = ${n}`);
    assert.ok(t.upper >= t.rational, `the upper sum is above a sum with tags, n = ${n}`);
  }
  assert.ok(thomaeSums(10000).upper < thomaeSums(100).upper / 5);
});

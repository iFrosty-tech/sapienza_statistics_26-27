/**
 * Homework 5, exercise 2: the standard normal distribution function
 *
 *   Φ(x) = ∫_{−∞}^{x} φ(t) dt,   φ(t) = e^{−t²/2} / √(2π),
 *
 * computed by the families of methods the assignment names, each returning its value and its cost:
 *
 *   trapezoid, simpson   numerical integration of φ from 0 to x, Φ(x) = ½ + ∫₀ˣ φ
 *   maclaurin            Φ(x) = ½ + φ(x) ∑ x^{2k+1}/(2k+1)!!, every term positive
 *   erfTaylor            Φ(x) = ½[1 + erf(x/√2)] with the alternating Taylor series of erf
 *   continuedFraction    the continued fraction of the tail, Q(x) = φ(x)/(x + 1/(x + 2/(x + …)))
 *   hybrid               the Maclaurin series near the centre and the continued fraction in the tails
 *   approximation26217   Abramowitz and Stegun 26.2.17, a polynomial in 1/(1 + px) of five terms
 *
 * and the reference against which they are all measured: `referencePhi`, the value of Φ at the exact
 * binary value of a double, computed in fixed-point integer arithmetic with 80 decimal digits.
 */

import { normCdf as numericalRecipes } from './normal.js';

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const SQRT2 = Math.SQRT2;
const EPS = 2 ** -53;

/** The standard normal density. */
export const phi = (t) => Math.exp(-0.5 * t * t) / SQRT_2PI;

/** Results are { value, cost } where `cost` counts the terms, panels or evaluations of the method. */

/* ----------------------------------------------------- numerical integration */

/** Φ(x) = ½ + ∫₀ˣ φ by the composite trapezoidal rule with n panels (n + 1 evaluations of φ). */
export function trapezoid(x, n) {
  const h = x / n;
  let sum = 0.5 * (phi(0) + phi(x));
  for (let k = 1; k < n; k += 1) sum += phi(k * h);
  return { value: 0.5 + sum * h, cost: n + 1 };
}

/** Φ(x) = ½ + ∫₀ˣ φ by the composite Simpson rule with n panels, n even (n + 1 evaluations of φ). */
export function simpson(x, n) {
  if (n % 2 !== 0) throw new RangeError('Simpson needs an even number of panels.');
  const h = x / n;
  let sum = phi(0) + phi(x);
  for (let k = 1; k < n; k += 1) sum += (k % 2 === 1 ? 4 : 2) * phi(k * h);
  return { value: 0.5 + (sum * h) / 3, cost: n + 1 };
}

/* --------------------------------------------------------------- series */

const MAX_TERMS = 4000;

/**
 * Φ(x) = ½ + φ(x) ∑_{k≥0} x^{2k+1}/(2k+1)!!, with (2k+1)!! = 1·3·5⋯(2k+1). Every term is positive, so
 * nothing cancels inside the sum; the series stops when a term no longer changes it in double precision.
 */
export function maclaurin(x) {
  let term = x;
  let sum = x;
  let k = 0;
  while (Math.abs(term) > EPS * Math.abs(sum) * 0.01 && k < MAX_TERMS) {
    k += 1;
    term *= (x * x) / (2 * k + 1);
    sum += term;
  }
  return { value: 0.5 + phi(x) * sum, cost: k + 1 };
}

/**
 * Φ(x) = ½[1 + erf(x/√2)] with erf(z) = (2/√π) ∑ (−1)^k z^{2k+1}/(k!(2k+1)), the Taylor series of the error
 * function. It converges for every z, but its terms alternate and grow before they fall, and they
 * cancel: for large x the sum is a small difference of large numbers.
 */
export function erfTaylor(x) {
  const z = x / SQRT2;
  let power = z; // (−1)^k z^{2k+1}/k!
  let sum = z;
  let k = 0;
  while (Math.abs(power) / (2 * k + 1) > 1e-20 && k < MAX_TERMS) {
    k += 1;
    power *= -(z * z) / k;
    sum += power / (2 * k + 1);
  }
  return { value: 0.5 + sum / Math.sqrt(Math.PI), cost: k + 1 };
}

/* ------------------------------------------------------ continued fraction */

/**
 * The upper tail Q(x) = 1 − Φ(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + …)))) for x > 0, evaluated by the modified
 * Lentz method, which stops when the correction to the fraction is below the roundoff. The fraction
 * converges for every x > 0 but slowly near 0 and quickly in the tail.
 */
export function continuedFraction(x) {
  if (!(x > 0)) throw new RangeError('The continued fraction is for x > 0.');
  const tiny = 1e-300;
  // The fraction f = b₀ + a₁/(b₁ + a₂/(b₂ + …)) has b_j = x for every j and a_j = j.
  let f = x;
  let C = x;
  let D = 0;
  let j = 0;
  for (; j < MAX_TERMS; j += 1) {
    const a = j + 1;
    D = x + a * D;
    if (D === 0) D = tiny;
    C = x + a / C;
    if (C === 0) C = tiny;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return { value: phi(x) / f, cost: j + 1 };
}

/** Φ(x) from the continued fraction of the tail, for any x (the fraction itself needs x > 0). */
export function continuedFractionPhi(x) {
  if (x === 0) return { value: 0.5, cost: 0 };
  const r = continuedFraction(Math.abs(x));
  return { value: x > 0 ? 1 - r.value : r.value, cost: r.cost };
}

/** The point beyond which the hybrid method leaves the series for the fraction. */
export const HYBRID_CUTOFF = 2;

/**
 * Φ(x) to full double precision, with the relative accuracy of the tails kept: the Maclaurin series for
 * |x| < 2, and for the tails the continued fraction, with Φ(−x) = 1 − Φ(x).
 * @returns {{ value: number, tail: number, cost: number }} `tail` is min(Φ(x), 1 − Φ(x)), which keeps its relative accuracy
 */
export function hybrid(x) {
  if (Number.isNaN(x)) return { value: NaN, tail: NaN, cost: 0 };
  const ax = Math.abs(x);
  if (ax < HYBRID_CUTOFF) {
    // The series is summed at −|x|, so that the tail is the quantity it returns, and Φ(|x|) is its complement.
    const r = maclaurin(-ax);
    return { value: x >= 0 ? 1 - r.value : r.value, tail: r.value, cost: r.cost };
  }
  if (ax > 40) return { value: x > 0 ? 1 : 0, tail: 0, cost: 0 };
  const r = continuedFraction(ax);
  return { value: x > 0 ? 1 - r.value : r.value, tail: r.value, cost: r.cost };
}

/* ------------------------------------------------------------ approximations */

/**
 * Abramowitz and Stegun, formula 26.2.17: for x ≥ 0, Q(x) ≈ φ(x)(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵), t = 1/(1 + px).
 * The absolute error is below 7.5·10⁻⁸. Five multiplications and one exponential.
 */
export function approximation26217(x) {
  const p = 0.2316419;
  const b = [0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const t = 1 / (1 + p * Math.abs(x));
  let poly = 0;
  for (let i = 4; i >= 0; i -= 1) poly = (poly + b[i]) * t;
  const tail = phi(x) * poly; // Q(|x|)
  return { value: x >= 0 ? 1 - tail : tail, cost: 5 };
}

/** The Chebyshev fit of erfc of Numerical Recipes, already used by the site's probability plots. */
export function numericalRecipesPhi(x) {
  return { value: numericalRecipes(x), cost: 10 };
}

/* --------------------------------------------------------------------- erf */

/** erf(z) = 2Φ(z√2) − 1 by the hybrid method. */
export function erf(z) {
  const h = hybrid(z * SQRT2);
  return z >= 0 ? 1 - 2 * h.tail : 2 * h.tail - 1;
}

/** erfc(z) = 2Φ(−z√2), with the relative accuracy of the tail. */
export function erfc(z) {
  const h = hybrid(-z * SQRT2);
  return 2 * h.value;
}

/* ============================================================== the reference */

const DIGITS = 80;
const ONE = 10n ** BigInt(DIGITS);

/** Newton's integer square root. */
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** arctan(1/m) in fixed point, from the series ∑ (−1)^k / ((2k+1) m^{2k+1}). */
function arctanInverse(m) {
  const m2 = BigInt(m * m);
  let power = ONE / BigInt(m);
  let sum = power;
  for (let k = 1; power > 0n; k += 1) {
    power /= m2;
    const term = power / BigInt(2 * k + 1);
    sum += k % 2 === 0 ? term : -term;
  }
  return sum;
}

let piFixed = null;
/** π in fixed point by Machin's formula, π = 16 arctan(1/5) − 4 arctan(1/239). */
function pi() {
  piFixed ??= 16n * arctanInverse(5) - 4n * arctanInverse(239);
  return piFixed;
}

/** e^{−y} in fixed point for y ≥ 0 (a fixed-point number), by halving the argument, the Taylor series, and squaring. */
function expNegative(y) {
  let halvings = 0;
  let r = y;
  while (r > ONE / 2n) {
    r /= 2n;
    halvings += 1;
  }
  let term = ONE;
  let sum = ONE;
  for (let k = 1; term !== 0n; k += 1) {
    term = (-term * r) / ONE / BigInt(k);
    sum += term;
  }
  for (let i = 0; i < halvings; i += 1) sum = (sum * sum) / ONE;
  return sum;
}

/** The exact value of a finite double as a fixed-point integer (rounded toward zero at 80 digits). */
function fixedPoint(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let e = exponent - 1075;
  if (exponent === 0) e = -1074;
  else mantissa |= 1n << 52n;
  const magnitude = e >= 0 ? (mantissa << BigInt(e)) * ONE : (mantissa * ONE) >> BigInt(-e);
  return x < 0 ? -magnitude : magnitude;
}

/** A fixed-point number as a double, correctly rounded from its decimal digits, and as a decimal string. */
function toNumber(fixed) {
  const negative = fixed < 0n;
  const digits = (negative ? -fixed : fixed).toString().padStart(DIGITS + 1, '0');
  const text = `${negative ? '-' : ''}${digits.slice(0, -DIGITS)}.${digits.slice(-DIGITS)}`;
  return { value: Number(text), text };
}

/**
 * Φ(x) at the exact binary value of the double x, to about 80 decimal digits, by the Maclaurin series
 * in integer arithmetic, Φ(x) = ½ + φ(x) ∑ x^{2k+1}/(2k+1)!!, and the lower tail Φ(−|x|) = ½ − φ(|x|) ∑ … for the sign
 * flipped. Valid for |x| ≤ 12, where the 80 digits outlast the terms of size up to e^{x²/2} ≈ 10³¹.
 * @returns {{ value: number, tail: number, text: string, tailText: string }}
 *   `value` is Φ(x) and `tail` is min(Φ(x), 1 − Φ(x)), each correctly rounded to a double
 */
export function referencePhi(x) {
  if (!Number.isFinite(x) || Math.abs(x) > 12) throw new RangeError('referencePhi is for |x| ≤ 12.');
  const ax = fixedPoint(Math.abs(x));
  const x2 = (ax * ax) / ONE;
  // φ(|x|) = e^{−x²/2} / √(2π)
  const density = (expNegative(x2 / 2n) * ONE) / isqrt(2n * pi() * ONE);
  let term = ax;
  let sum = ax;
  for (let k = 1; term !== 0n; k += 1) {
    term = (term * x2) / ONE / BigInt(2 * k + 1);
    sum += term;
  }
  const upperHalf = ONE / 2n + (density * sum) / ONE; // Φ(|x|)
  const lowerTail = ONE / 2n - (density * sum) / ONE; // Φ(−|x|)
  const small = toNumber(lowerTail);
  const phiX = x >= 0 ? toNumber(upperHalf) : small;
  return { value: phiX.value, tail: small.value, text: phiX.text, tailText: small.text };
}

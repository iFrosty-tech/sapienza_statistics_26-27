/**
 * Numerical helpers for the normal distribution and for normal probability plots.
 *
 * Every function is pure and dependency-free so that the same module runs in the
 * browser (interactive figures) and in Node at build time (pre-rendered figures).
 */

/* Coefficients of P. J. Acklam's rational approximation to the inverse normal CDF.
 * Relative error below 1.15e-9 over the whole open interval (0, 1). */
const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
];
const D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
  3.754408661907416,
];
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

/**
 * Quantile function of the standard normal distribution, Phi^-1(p).
 * @param {number} p probability in the open interval (0, 1)
 * @returns {number} z such that Phi(z) = p
 */
export function invNorm(p) {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return Number.NaN;
  }
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
    );
  }
  if (p > P_HIGH) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
  );
}

/**
 * Standard normal CDF, Phi(z), via the Chebyshev-fitted complementary error
 * function of Numerical Recipes (fractional error below 1.2e-7).
 * @param {number} z
 * @returns {number}
 */
export function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const erfc =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t * (1.00002368 +
        t * (0.37409196 +
        t * (0.09678418 +
        t * (-0.18628806 +
        t * (0.27886807 +
        t * (-1.13520398 +
        t * (1.48851587 +
        t * (-0.82215223 +
        t * 0.17087277)))))))),
    );
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
}

/** Standard normal density, phi(z). */
export function normPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Mulberry32: a small, fast, seedable 32-bit pseudo-random generator.
 * Seeding makes every simulated figure reproducible from the seed it reports.
 * @param {number} seed unsigned 32-bit integer
 * @returns {() => number} generator of uniforms in [0, 1)
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new simulation (not cryptographic; reproducibility only). */
export function freshSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}

/**
 * Box–Muller transform: n independent standard normal variates.
 * @param {() => number} rng uniform generator on [0, 1)
 * @param {number} n
 */
export function boxMuller(rng, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const u1 = 1 - rng(); // (0, 1], keeps log finite
    const u2 = rng();
    const radius = Math.sqrt(-2 * Math.log(u1));
    out[i] = radius * Math.cos(2 * Math.PI * u2);
    if (i + 1 < n) out[i + 1] = radius * Math.sin(2 * Math.PI * u2);
  }
  return out;
}

/**
 * Populations available to simulations. Each `draw` returns n variates.
 * `label` is the conventional notation used in captions.
 */
export const DISTRIBUTIONS = {
  normal: {
    label: 'N(0, 1)',
    name: 'standard normal',
    draw: (rng, n) => boxMuller(rng, n),
  },
  lognormal: {
    label: 'LN(0, 0.75²)',
    name: 'log-normal, right-skewed',
    draw: (rng, n) => boxMuller(rng, n).map((z) => Math.exp(0.75 * z)),
  },
  uniform: {
    label: 'U(−√3, √3)',
    name: 'uniform, light-tailed',
    draw: (rng, n) =>
      Array.from({ length: n }, () => Math.sqrt(3) * (2 * rng() - 1)),
  },
};

/**
 * Plotting positions p_i = (i − a) / (n + 1 − 2a), i = 1..n.
 * The default a = 0.375 gives Blom's positions, (i − 0.375) / (n + 0.25),
 * which are nearly unbiased for normal order statistics.
 * @param {number} n
 * @param {number} [a=0.375]
 */
export function plottingPositions(n, a = 0.375) {
  return Array.from({ length: n }, (_, k) => (k + 1 - a) / (n + 1 - 2 * a));
}

/** Arithmetic mean. */
export function mean(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample standard deviation with the n − 1 denominator. */
export function sampleSd(xs) {
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / (xs.length - 1));
}

/**
 * Ordinary least-squares fit y = intercept + slope · x, plus Pearson's r.
 * @param {number[]} xs
 * @param {number[]} ys
 */
export function linearFit(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  return {
    slope,
    intercept: my - slope * mx,
    r: sxy / Math.sqrt(sxx * syy),
  };
}

/**
 * Everything a normal probability plot needs for one simulated sample.
 * The reference line regresses the ordered sample on the normal scores, so its
 * intercept and slope estimate the location and scale of a normal population;
 * r is the probability-plot correlation coefficient.
 * @param {{ n: number, seed: number, dist?: keyof DISTRIBUTIONS }} options
 */
export function simulateProbabilityPlot({ n, seed, dist = 'normal' }) {
  const population = DISTRIBUTIONS[dist] ?? DISTRIBUTIONS.normal;
  const rng = createRng(seed);
  const sample = population.draw(rng, n).sort((x, y) => x - y);
  const p = plottingPositions(n);
  const z = p.map(invNorm);
  const fit = linearFit(z, sample);
  return {
    n,
    seed: seed >>> 0,
    dist: DISTRIBUTIONS[dist] ? dist : 'normal',
    population,
    sample,
    p,
    z,
    mean: mean(sample),
    sd: sampleSd(sample),
    fit,
  };
}

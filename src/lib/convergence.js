/**
 * Studies of the modes of convergence, of the laws of large numbers and of the
 * central limit theorem, for homework 7.
 *
 * Wherever a probability has a closed form it is computed exactly (the sums of
 * independent exponentials are gamma variables, the mean of Cauchy variables is
 * Cauchy); simulation is used for what has none: the paths of independent
 * sequences, the running means and the variance of a sum of dependent terms.
 *
 * Pure and dependency-light; runs in Node at build time.
 */

import { gammaP, gammaQ, normalCdf } from './stats.js';
import { createRandom } from './random.js';

/* ------------------------------------------------------------------ the four sequences */

/**
 * Four sequences of random variables, each a limit candidate for 0 (or for Z):
 *
 *   indicator   X_n = 1{U_n < 1/n}      independent, P(X_n ≠ 0) = 1/n
 *   spike       X_n = n·1{U_n < 1/n²}   independent, P(X_n ≠ 0) = 1/n²
 *
 * The quantities are exact: the probability that X_n differs from 0, the
 * second moment E[X_n²], and the probability that some X_k with n < k ≤ N
 * differs from 0, which for independent terms is a telescoping product.
 */
export const SEQUENCES = Object.freeze({
  indicator: {
    name: 'Indicator',
    pNonzero: (n) => 1 / n,
    secondMoment: (n) => 1 / n,
    /** P(max_{n<k≤N} |X_k| > ε) for ε < 1: 1 − ∏(1 − 1/k) = 1 − n/N. */
    pExceedAfter: (n, N) => 1 - n / N,
    /** The value of X_k when the uniform draw is u. */
    value: (k, u) => (u < 1 / k ? 1 : 0),
  },
  spike: {
    name: 'Spike',
    pNonzero: (n) => 1 / (n * n),
    secondMoment: () => 1,
    /** 1 − ∏(1 − 1/k²) = 1 − n(N + 1) / ((n + 1)N). */
    pExceedAfter: (n, N) => 1 - (n * (N + 1)) / ((n + 1) * N),
    value: (k, u) => (u < 1 / (k * k) ? k : 0),
  },
});

/** P(|X_n − Z| > ε) for X_n = (−1)ⁿ Z with Z standard normal and odd n: X_n = −Z, so 2(1 − Φ(ε/2)). */
export const alternatingSignGap = (epsilon) => 2 * (1 - normalCdf(epsilon / 2));

/**
 * The index of the last nonzero term of each simulated path of a sequence, up
 * to N (0 for a path that is zero throughout). A path has an exceedance after
 * n exactly when its last index exceeds n.
 * @returns {Int32Array} one entry per path
 */
export function lastNonzeroIndex(sequence, { paths, N, seed }) {
  const { uniform } = createRandom(seed);
  const last = new Int32Array(paths);
  for (let p = 0; p < paths; p += 1) {
    for (let k = 1; k <= N; k += 1) if (sequence.value(k, uniform()) !== 0) last[p] = k;
  }
  return last;
}

/** The fraction of paths with a nonzero term in (n, N], from the last indices. */
export const exceedanceFraction = (last, n) => last.reduce((s, k) => s + (k > n ? 1 : 0), 0) / last.length;

/* ------------------------------------------------------------------ laws of large numbers */

const exponential = (u) => -Math.log(1 - u);
const cauchy = (u) => Math.tan(Math.PI * (u - 0.5));

/** Samplers by name; each maps one uniform on [0, 1) to one variate. */
export const LAWS = Object.freeze({
  exponential: { name: 'Exponential(1)', mean: 1, draw: exponential },
  cauchy: { name: 'Cauchy', mean: null, draw: cauchy },
});

/** Running means X̄₁, …, X̄_n of `paths` independent samples (one array per path). */
export function runningMeans(law, { paths, n, seed }) {
  const { uniform } = createRandom(seed);
  return Array.from({ length: paths }, () => {
    const out = new Array(n);
    let sum = 0;
    for (let k = 1; k <= n; k += 1) {
      sum += LAWS[law].draw(uniform());
      out[k - 1] = sum / k;
    }
    return out;
  });
}

/**
 * Exact P(|X̄_n − 1| > ε) for X₁, …, X_n independent Exponential(1): the sum is
 * Gamma(n, 1), so the two tails are incomplete gamma functions.
 */
export function exponentialMeanTail(n, epsilon) {
  const lower = epsilon >= 1 ? 0 : gammaP(n, n * (1 - epsilon));
  return lower + gammaQ(n, n * (1 + epsilon));
}

/** P(|X̄_n| > ε) for Cauchy variables: the mean of n standard Cauchy variables is standard Cauchy, for every n. */
export const cauchyMeanTail = (epsilon) => 1 - (2 / Math.PI) * Math.atan(epsilon);

/** Chebyshev's bound σ²/(nε²), capped at 1. */
export const chebyshevBound = (n, epsilon, variance = 1) => Math.min(1, variance / (n * epsilon * epsilon));

/** The normal approximation 2(1 − Φ(ε√n/σ)) to the same probability, computed as Q(1/2, z²/2) so that it keeps its digits far in the tail. */
export const normalTail = (n, epsilon, sigma = 1) => gammaQ(0.5, (epsilon * epsilon * n) / (2 * sigma * sigma));

/* ------------------------------------------------------------------ central limit theorem */

/**
 * P(Z_n ≤ z) for the standardised sum of n independent Exponential(1)
 * variables, Z_n = (S_n − n)/√n, exactly.
 */
export function standardisedSumCdf(n, z) {
  const x = n + Math.sqrt(n) * z;
  return x <= 0 ? 0 : gammaP(n, x);
}

/** The Kolmogorov distance sup_z |P(Z_n ≤ z) − Φ(z)| on a fine grid (the law is continuous, so no jump is missed). */
export function kolmogorovDistance(n, { step = 0.002, limit = 6 } = {}) {
  let worst = 0;
  for (let z = -limit; z <= limit; z += step) {
    worst = Math.max(worst, Math.abs(standardisedSumCdf(n, z) - normalCdf(z)));
  }
  return worst;
}

/** E|X − 1|³ for X ~ Exponential(1), the third absolute central moment, in closed form: 12/e − 2. */
export const EXPONENTIAL_THIRD_ABSOLUTE_MOMENT = 12 / Math.E - 2;

/** The Berry–Esseen bound C·ρ/(σ³√n) with C = 0.4748 (Shevtsova, 2011) and σ = 1. */
export const berryEsseenBound = (n, { rho = EXPONENTIAL_THIRD_ABSOLUTE_MOMENT, constant = 0.4748 } = {}) => (constant * rho) / Math.sqrt(n);

/** Simulated standardised means (X̄_n − 1)√n of Exponential(1) samples. */
export function standardisedMeans(n, { replicates, seed }) {
  const { uniform } = createRandom(seed);
  const out = new Float64Array(replicates);
  for (let r = 0; r < replicates; r += 1) {
    let sum = 0;
    for (let k = 0; k < n; k += 1) sum += exponential(uniform());
    out[r] = (sum - n) / Math.sqrt(n);
  }
  return out;
}

/** Histogram of values in bins of the given width from `from` to `to`; returns counts and the number outside. */
export function binCounts(values, { from, to, width }) {
  const bins = Math.round((to - from) / width);
  const counts = new Array(bins).fill(0);
  let outside = 0;
  for (const v of values) {
    const k = Math.floor((v - from) / width);
    if (k >= 0 && k < bins) counts[k] += 1;
    else outside += 1;
  }
  return { counts, outside };
}

/* ------------------------------------------------------------------ why √n */

/** Var(S_n) for equicorrelated terms with variance σ² and correlation ρ: σ²·n·(1 + (n − 1)ρ). */
export const equicorrelatedVariance = (n, rho, sigma2 = 1) => sigma2 * n * (1 + (n - 1) * rho);

/**
 * The standard deviation of the centred sum S_n − nμ for independent
 * Exponential(1) terms and for equicorrelated normal terms (correlation ρ,
 * unit variance), estimated from `replicates` simulated paths at the sizes in
 * `ns`; the sums are the partial sums of one path, so the sizes share draws.
 * @returns {{ n: number, independent: number, dependent: number }[]}
 */
export function sumSpread({ ns, replicates, rho, seed }) {
  const { uniform } = createRandom(seed);
  const top = Math.max(...ns);
  const squares = { independent: ns.map(() => 0), dependent: ns.map(() => 0) };
  const normal = () => {
    const u1 = 1 - uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * uniform());
  };
  for (let r = 0; r < replicates; r += 1) {
    const common = normal();
    let independent = 0;
    let dependent = 0;
    let idx = 0;
    for (let k = 1; k <= top; k += 1) {
      independent += exponential(uniform()) - 1;
      dependent += Math.sqrt(rho) * common + Math.sqrt(1 - rho) * normal();
      if (k === ns[idx]) {
        squares.independent[idx] += independent * independent;
        squares.dependent[idx] += dependent * dependent;
        idx += 1;
      }
    }
  }
  return ns.map((n, i) => ({
    n,
    independent: Math.sqrt(squares.independent[i] / replicates),
    dependent: Math.sqrt(squares.dependent[i] / replicates),
  }));
}

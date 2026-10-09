/**
 * Statistical functions used to test hash outputs against the behaviour of an
 * ideal random function: special functions (gamma, incomplete gamma, erfc),
 * the chi-square and binomial distributions, the NIST SP 800-22 frequency and
 * runs tests, goodness-of-fit helpers and birthday-bound formulas.
 *
 * Pure and dependency-free; runs in Node at build time and in the browser.
 * Numerical methods follow Press et al., "Numerical Recipes", chapter 6.
 */

import { normCdf } from './normal.js';

/* ------------------------------------------------------------------------ */
/* Special functions                                                         */
/* ------------------------------------------------------------------------ */

/* Lanczos approximation coefficients (g = 7, n = 9), accurate to ~1e-15. */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0 (reflection formula below 0.5). */
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i += 1) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

const EPS = 1e-15;
const FPMIN = Number.MIN_VALUE / EPS;
const MAX_ITER = 10_000;

/* Series expansion of P(a, x), valid and fast for x < a + 1. */
function gammaSeries(a, x) {
  let ap = a;
  let sum = 1 / a;
  let term = sum;
  for (let i = 0; i < MAX_ITER; i += 1) {
    ap += 1;
    term *= x / ap;
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/* Continued fraction of Q(a, x) by the modified Lentz method, for x ≥ a + 1. */
function gammaContinuedFraction(a, x) {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Regularized lower incomplete gamma function P(a, x) = γ(a, x) / Γ(a). */
export function gammaP(a, x) {
  if (!(a > 0) || !(x >= 0)) throw new Error('gammaP needs a > 0 and x ≥ 0');
  if (x === 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaContinuedFraction(a, x);
}

/** Regularized upper incomplete gamma function Q(a, x) = 1 − P(a, x). */
export function gammaQ(a, x) {
  if (!(a > 0) || !(x >= 0)) throw new Error('gammaQ needs a > 0 and x ≥ 0');
  if (x === 0) return 1;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
}

/** Complementary error function, from the normal CDF of src/lib/normal.js. */
export function erfc(x) {
  return 2 * normCdf(-x * Math.SQRT2);
}

/** Standard normal CDF Φ(z). */
export const normalCdf = normCdf;

/* ------------------------------------------------------------------------ */
/* Distributions                                                             */
/* ------------------------------------------------------------------------ */

/** Upper-tail probability P(X > x) for X ~ χ²(df): the p-value of a chi-square statistic. */
export function chiSquareSf(x, df) {
  return gammaQ(df / 2, x / 2);
}

/** Lower-tail probability P(X ≤ x) for X ~ χ²(df). */
export function chiSquareCdf(x, df) {
  return gammaP(df / 2, x / 2);
}

/** ln C(n, k). */
export function lnChoose(n, k) {
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/** Binomial probability P(X = k) for X ~ Bin(n, p), computed in log space. */
export function binomialPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** The whole pmf of Bin(n, p) as an array of length n + 1. */
export function binomialPmfTable(n, p) {
  return Array.from({ length: n + 1 }, (_, k) => binomialPmf(n, k, p));
}

/** Standardised count: (count − np) / sqrt(np(1 − p)) for a count of successes in n Bernoulli(p) trials. */
export function zScore(count, n, p) {
  return (count - n * p) / Math.sqrt(n * p * (1 - p));
}

/* ------------------------------------------------------------------------ */
/* NIST SP 800-22 tests                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Frequency (monobit) test, SP 800-22 section 2.1, from the number of ones.
 * H0: the bits are independent fair coin flips; S = ones − zeros is then
 * approximately N(0, n) and the p-value is erfc(|S| / sqrt(2n)).
 */
export function monobitFromCounts(ones, n) {
  const s = 2 * ones - n;
  return erfc(Math.abs(s) / Math.sqrt(2 * n));
}

/** Frequency (monobit) test on an array of 0/1 values. */
export function monobitP(bits) {
  let ones = 0;
  for (const b of bits) ones += b;
  return monobitFromCounts(ones, bits.length);
}

/**
 * Runs test, SP 800-22 section 2.3. A run is a maximal block of identical
 * bits; under H0 the number of runs V has mean 2nπ(1 − π) + 1 where π is the
 * proportion of ones, and
 *   p = erfc( |V − 2nπ(1 − π)| / (2 sqrt(2n) π(1 − π)) ).
 * The test only applies when the frequency test is not already failed, that
 * is when |π − 1/2| < 2 / sqrt(n); otherwise p is reported as 0.
 * @param {ArrayLike<number>} bits
 * @returns {{ p: number, runs: number, pi: number, applicable: boolean }}
 */
export function runsTestP(bits) {
  const n = bits.length;
  let ones = 0;
  for (let i = 0; i < n; i += 1) ones += bits[i];
  const pi = ones / n;
  let runs = 1;
  for (let i = 1; i < n; i += 1) if (bits[i] !== bits[i - 1]) runs += 1;
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) return { p: 0, runs, pi, applicable: false };
  const expected = 2 * n * pi * (1 - pi);
  const p = erfc(Math.abs(runs - expected) / (2 * Math.sqrt(2 * n) * pi * (1 - pi)));
  return { p, runs, pi, applicable: true };
}

/* C(a, b) as a double, zero outside 0 ≤ b ≤ a. */
function choose(a, b) {
  if (b < 0 || a < 0 || b > a) return 0;
  return Math.exp(lnChoose(a, b));
}

/**
 * Number of binary strings of length n with k ones and exactly r runs.
 * With m = ⌊r/2⌋: an even number of runs 2m splits the ones into m blocks
 * and the zeros into m blocks, starting with either symbol; an odd number
 * 2m + 1 starts and ends with the same symbol, which has one block more.
 */
export function runsCount(n, k, r) {
  if (k === 0 || k === n) return r === 1 ? 1 : 0;
  const m = Math.floor(r / 2);
  if (r % 2 === 0) return 2 * choose(k - 1, m - 1) * choose(n - k - 1, m - 1);
  return choose(k - 1, m) * choose(n - k - 1, m - 1) + choose(k - 1, m - 1) * choose(n - k - 1, m);
}

/**
 * Exact null distribution of the runs-test p-value for strings of n
 * independent fair bits, as probabilities over `bins` equal intervals of
 * [0, 1]. For short strings the statistic takes few values, so the
 * p-value is far from uniform even under the null hypothesis, and a
 * histogram of p-values must be compared with this distribution rather
 * than with a flat one. Strings failing the frequency precondition
 * (p-value 0, "not applicable" in SP 800-22) are excluded and their total
 * probability returned as `inapplicable`.
 */
export function runsTestPValueDistribution(n, { bins = 10 } = {}) {
  const probs = new Array(bins).fill(0);
  let applicable = 0;
  const scale = -n * Math.LN2;
  for (let k = 0; k <= n; k += 1) {
    const pi = k / n;
    if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) continue;
    const expected = 2 * n * pi * (1 - pi);
    const denominator = 2 * Math.sqrt(2 * n) * pi * (1 - pi);
    for (let r = 1; r <= n; r += 1) {
      const count = runsCount(n, k, r);
      if (count === 0) continue;
      const probability = Math.exp(Math.log(count) + scale);
      const p = erfc(Math.abs(r - expected) / denominator);
      probs[Math.min(bins - 1, Math.floor(p * bins))] += probability;
      applicable += probability;
    }
  }
  return { bins: probs.map((v) => v / applicable), applicable, inapplicable: 1 - applicable };
}

/* ------------------------------------------------------------------------ */
/* Goodness of fit                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Pearson's chi-square goodness-of-fit statistic Σ (O − E)² / E with its
 * p-value; df = categories − 1 − ddof (ddof counts parameters estimated from
 * the data).
 */
export function chiSquareGoodnessOfFit(observed, expected, { ddof = 0 } = {}) {
  if (observed.length !== expected.length) throw new Error('observed and expected need the same length');
  let statistic = 0;
  for (let i = 0; i < observed.length; i += 1) {
    if (expected[i] <= 0) throw new Error(`expected count must be positive (category ${i})`);
    const diff = observed[i] - expected[i];
    statistic += (diff * diff) / expected[i];
  }
  const df = observed.length - 1 - ddof;
  return { statistic, df, p: chiSquareSf(statistic, df) };
}

/**
 * Chi-square test of observed counts of a Bin(n, p) variable, with the
 * categories 0..n merged from both tails until every bin has an expected
 * count of at least `minExpected` (the usual rule of thumb for the
 * chi-square approximation).
 * @param {number[]} counts observed counts for k = 0..n
 */
export function binnedBinomialChiSquare(counts, n, p, { minExpected = 5 } = {}) {
  const total = counts.reduce((a, b) => a + b, 0);
  const pmf = binomialPmfTable(n, p);
  const bins = [];
  let from = 0;
  let observed = 0;
  let expected = 0;
  for (let k = 0; k <= n; k += 1) {
    observed += counts[k];
    expected += total * pmf[k];
    if (expected >= minExpected) {
      bins.push({ from, to: k, observed, expected });
      from = k + 1;
      observed = 0;
      expected = 0;
    }
  }
  if (from <= n) {
    // Remainder on the right tail: merge it into the last bin (or keep it
    // alone when the sample is too small for any bin to reach the threshold).
    const last = bins.pop() ?? { from: 0, observed: 0, expected: 0 };
    bins.push({ from: last.from, to: n, observed: last.observed + observed, expected: last.expected + expected });
  }
  if (bins.length < 2) {
    return { statistic: 0, df: 0, p: Number.NaN, bins, note: 'too few observations for a chi-square test' };
  }
  const fit = chiSquareGoodnessOfFit(
    bins.map((b) => b.observed),
    bins.map((b) => b.expected),
  );
  return { ...fit, bins };
}

/* ------------------------------------------------------------------------ */
/* Proof-of-work race                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Nakamoto's estimate of the probability that an attacker holding a fraction
 * q of the hash rate eventually overtakes the honest chain, given that the
 * honest chain is z blocks ahead (Bitcoin whitepaper, section 11). The
 * attacker's progress while the honest miners find z blocks is Poisson with
 * mean λ = z·q/p, and from a deficit of d blocks the catch-up probability is
 * (q/p)^d, so
 *   P = 1 − Σ_{k=0}^{z} (λ^k e^{−λ} / k!) · (1 − (q/p)^{z−k}).
 * With q ≥ 1/2 the attacker always catches up.
 */
export function attackerSuccessProbability(q, z) {
  if (!(q >= 0 && q < 1)) throw new Error('q must be a probability below 1');
  const p = 1 - q;
  if (q >= p) return 1;
  const lambda = (z * q) / p;
  const ratio = q / p;
  let sum = 0;
  let poisson = Math.exp(-lambda); // λ^0 e^{−λ} / 0!
  for (let k = 0; k <= z; k += 1) {
    if (k > 0) poisson *= lambda / k;
    sum += poisson * (1 - ratio ** (z - k));
  }
  return Math.max(0, 1 - sum);
}

/* ------------------------------------------------------------------------ */
/* Birthday bound                                                            */
/* ------------------------------------------------------------------------ */

/** Expected number of colliding pairs among n uniform values on `bits` bits: C(n, 2) / 2^bits. */
export function expectedCollidingPairs(n, bits) {
  return ((n * (n - 1)) / 2) * 2 ** -bits;
}

/**
 * Probability that m values drawn uniformly from a space of the given size
 * contain at least one repeat. Exact: 1 − Π_{i<m} (1 − i / size), computed in
 * log space; otherwise the approximation 1 − exp(−m(m − 1) / (2 size)). Both use
 * expm1, so that probabilities far below the double-precision epsilon (such as
 * collisions among 160-bit addresses) are not rounded to zero.
 */
export function collisionProbability(m, size, { exact = false } = {}) {
  if (m <= 1) return 0;
  if (m > size) return 1;
  if (!exact) return -Math.expm1((-m * (m - 1)) / (2 * size));
  let logNoCollision = 0;
  for (let i = 1; i < m; i += 1) logNoCollision += Math.log1p(-i / size);
  return -Math.expm1(logNoCollision);
}

/* ------------------------------------------------------------------------ */
/* Binomial proportions and the geometric law                                */
/* ------------------------------------------------------------------------ */

/** The 0.975 quantile of the standard normal distribution. */
export const Z_95 = 1.959963984540054;

/**
 * Wilson score interval for a binomial proportion (Wilson, 1927): the set of
 * p for which |k − np| / sqrt(np(1 − p)) ≤ z. Unlike the Wald interval it
 * stays inside [0, 1] and keeps its coverage for proportions near 0, the
 * regime of checksum acceptance rates.
 * @param {number} k successes
 * @param {number} n trials (n > 0)
 * @param {{ z?: number }} [options] normal quantile, 1.96 for 95 %
 * @returns {{ low: number, high: number, center: number }}
 */
export function wilsonInterval(k, n, { z = Z_95 } = {}) {
  if (!(n > 0) || k < 0 || k > n) throw new Error('wilsonInterval needs 0 ≤ k ≤ n and n > 0');
  const phat = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denominator;
  const half = (z / denominator) * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  // The bounds are exactly 0 for k = 0 and 1 for k = n; set them so that round-off does not show.
  const low = k === 0 ? 0 : Math.max(0, center - half);
  const high = k === n ? 1 : Math.min(1, center + half);
  return { low, high, center };
}

/**
 * Exact two-sided binomial test of H0: X ~ Bin(n, p) for an observed k. The
 * p-value is the total probability of the outcomes no more likely than k
 * (the rule of R's binom.test), with a relative tolerance of 1e-7 for ties.
 */
export function binomialTestTwoSided(k, n, p) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k > n) throw new Error('binomialTestTwoSided needs integers 0 ≤ k ≤ n');
  const observed = binomialPmf(n, k, p);
  const threshold = observed * (1 + 1e-7);
  let total = 0;
  for (let i = 0; i <= n; i += 1) {
    const pi = binomialPmf(n, i, p);
    if (pi <= threshold) total += pi;
  }
  return Math.min(1, total);
}

/** P(T = t) for T ~ Geometric(p) on {1, 2, …}, the number of trials up to the first success. */
export function geometricPmf(t, p) {
  if (!Number.isInteger(t) || t < 1) return 0;
  return Math.exp((t - 1) * Math.log1p(-p)) * p;
}

/** P(T ≤ t) for T ~ Geometric(p) on {1, 2, …}: 1 − (1 − p)^t. */
export function geometricCdf(t, p) {
  if (t < 1) return 0;
  return -Math.expm1(Math.floor(t) * Math.log1p(-p));
}

/**
 * Bayes' theorem for a discrete partition and for a proportion with a beta
 * prior, for homework 7: posterior probabilities of a diagnostic test, the
 * beta–binomial update, and the summaries (mean, mode, credible interval) of
 * the posterior beta law.
 *
 * Pure and dependency-light; runs in Node at build time.
 */

import { lnGamma } from './stats.js';

/* ------------------------------------------------------------------ discrete partitions */

/**
 * Bayes' theorem over a partition: posterior_i = prior_i · likelihood_i / Σ_j prior_j · likelihood_j.
 * @param {number[]} prior probabilities of the hypotheses (sum 1)
 * @param {number[]} likelihood probability of the observed data under each hypothesis
 * @returns {{ posterior: number[], evidence: number }} the evidence is P(data), the denominator
 */
export function bayesUpdate(prior, likelihood) {
  if (prior.length !== likelihood.length) throw new RangeError('bayesUpdate: prior and likelihood differ in length.');
  const total = prior.reduce((s, p) => s + p, 0);
  if (Math.abs(total - 1) > 1e-9) throw new RangeError('bayesUpdate: the prior must sum to 1.');
  const evidence = prior.reduce((s, p, i) => s + p * likelihood[i], 0);
  if (!(evidence > 0)) throw new RangeError('bayesUpdate: the data have probability zero under every hypothesis.');
  return { posterior: prior.map((p, i) => (p * likelihood[i]) / evidence), evidence };
}

/**
 * A diagnostic test with the given sensitivity P(+ | D) and specificity
 * P(− | not D), applied to a population with the given prevalence. Returns the
 * posterior probability of disease after one positive test, after two
 * independent positive tests (the first posterior is the prior of the second),
 * and the natural frequencies in `population` people.
 */
export function diagnosticTest({ prevalence, sensitivity, specificity, population = 100000 }) {
  const first = bayesUpdate([prevalence, 1 - prevalence], [sensitivity, 1 - specificity]);
  const second = bayesUpdate(first.posterior, [sensitivity, 1 - specificity]);
  return {
    positive: first.evidence,
    afterOne: first.posterior[0],
    afterTwo: second.posterior[0],
    truePositives: population * prevalence * sensitivity,
    falsePositives: population * (1 - prevalence) * (1 - specificity),
  };
}

/* ------------------------------------------------------------------ the beta law */

/** The beta density Beta(a, b) at x in [0, 1] (a, b ≥ 1). */
export function betaPdf(x, a, b) {
  if (x < 0 || x > 1) return 0;
  if ((x === 0 && a < 1) || (x === 1 && b < 1)) return Infinity;
  const logDensity = (a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) + lnGamma(a + b) - lnGamma(a) - lnGamma(b);
  return Math.exp(Number.isNaN(logDensity) ? 0 : logDensity);
}

/** Continued fraction of the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x, a, b) {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

/** The beta distribution function, the regularised incomplete beta function I_x(a, b). */
export function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(x, a, b)) / a : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** The p-quantile of Beta(a, b), by bisection on the distribution function. */
export function betaQuantile(p, a, b) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (betaCdf(mid, a, b) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * The beta–binomial update: a Beta(a, b) prior on a proportion and k successes
 * in n trials give a Beta(a + k, b + n − k) posterior. The posterior mean is a
 * weighted average of the prior mean and the sample proportion, with weights
 * (a + b)/(a + b + n) and n/(a + b + n).
 */
export function betaBinomial({ a, b, k, n }) {
  if (!(a > 0 && b > 0) || k < 0 || k > n) throw new RangeError('betaBinomial needs a, b > 0 and 0 ≤ k ≤ n.');
  const pa = a + k;
  const pb = b + n - k;
  return {
    a: pa,
    b: pb,
    mean: pa / (pa + pb),
    mode: pa > 1 && pb > 1 ? (pa - 1) / (pa + pb - 2) : null,
    sd: Math.sqrt((pa * pb) / ((pa + pb) ** 2 * (pa + pb + 1))),
    interval: { low: betaQuantile(0.025, pa, pb), high: betaQuantile(0.975, pa, pb) },
    priorMean: a / (a + b),
    priorWeight: (a + b) / (a + b + n),
    dataWeight: n / (a + b + n),
  };
}

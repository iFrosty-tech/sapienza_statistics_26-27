/**
 * The penetration process of homework 04: n systems attacked in sequence by
 * each of m attackers, the score of an attacker being a random walk with
 * independent and identically distributed increments X₁, X₂, …
 *
 *   Bernoulli model   Xᵢ ∈ {0, 1},   P(Xᵢ = 1) = p
 *   Rademacher model  Xᵢ ∈ {−1, +1}, P(Xᵢ = +1) = P(Xᵢ = −1) = 1/2
 *
 * Both increments are written X = low + (high − low)·B with B ~ Bernoulli(q),
 * so that the total score Sₙ = n·low + (high − low)·K with K ~ Bin(n, q): the
 * exact law of every quantity of the study is an affine image of a binomial
 * law, and the simulations can be checked against it.
 *
 * Attacker j is one sample trajectory. All attackers draw from one seeded
 * Mulberry32 stream (src/lib/random.js), attacker after attacker, so that the
 * m·n draws of a run never overlap (the generator has period 2³²) and adding
 * attackers to a run leaves the trajectories of the first ones unchanged.
 */

import { createRandom } from './random.js';
import { mean as sampleMean, sampleSd } from './normal.js';
import { binomialPmf, gammaP } from './stats.js';

/** The two increment models, with the notation used in captions. */
export const MODELS = {
  bernoulli: { id: 'bernoulli', label: 'Bernoulli', support: '{0, 1}' },
  rademacher: { id: 'rademacher', label: 'Rademacher', support: '{−1, +1}' },
};

/**
 * The three quantities of the study, Sₙ / n^exponent.
 * Their variance is n·σ² / n^(2·exponent): it grows as n, decays as 1/n, or stays at σ².
 */
export const NORMALIZATIONS = {
  total: { id: 'total', label: 'Sₙ', name: 'Total score', exponent: 0, divisor: () => 1 },
  average: { id: 'average', label: 'Sₙ/n', name: 'Average score', exponent: 1, divisor: (n) => n },
  normalized: { id: 'normalized', label: 'Sₙ/√n', name: 'Normalized total score', exponent: 0.5, divisor: (n) => Math.sqrt(n) },
};

/** Shevtsova's (2011) constant of the Berry–Esseen inequality for i.i.d. summands. */
export const BERRY_ESSEEN_CONSTANT = 0.4748;

/** Period of the Mulberry32 stream shared by the attackers of one run. */
const STREAM_PERIOD = 2 ** 32;

/**
 * Standard normal distribution function Φ(z) = (1 + sign(z)·P(1/2, z²/2))/2, accurate to
 * rounding through the incomplete gamma function of src/lib/stats.js. The Kolmogorov distances
 * of the study fall to a few 10⁻⁴, below which the faster approximation of src/lib/normal.js
 * (fractional error up to 1.2·10⁻⁷) would start to matter.
 */
export function standardNormalCdf(z) {
  const half = 0.5 * gammaP(0.5, 0.5 * z * z);
  return z >= 0 ? 0.5 + half : 0.5 - half;
}

/**
 * The law of one increment.
 * @param {'bernoulli' | 'rademacher'} model
 * @param {{ p?: number }} [options] success probability of the Bernoulli model, 0 < p < 1
 * @returns {{ model: string, label: string, q: number, low: number, high: number, mean: number, variance: number, absThird: number }}
 *   absThird is E|X − μ|³, the third absolute central moment used by Berry–Esseen
 */
export function incrementLaw(model, { p } = {}) {
  if (model === 'bernoulli') {
    if (!(p > 0 && p < 1)) throw new RangeError('The Bernoulli model needs 0 < p < 1');
    return {
      model,
      label: MODELS.bernoulli.label,
      q: p,
      low: 0,
      high: 1,
      mean: p,
      variance: p * (1 - p),
      absThird: p * (1 - p) * (p * p + (1 - p) * (1 - p)),
    };
  }
  if (model === 'rademacher') {
    return { model, label: MODELS.rademacher.label, q: 0.5, low: -1, high: 1, mean: 0, variance: 1, absThird: 1 };
  }
  throw new RangeError(`Unknown increment model: ${model}`);
}

/**
 * Theoretical mean, variance and standard deviation of Sₙ, Sₙ/n and Sₙ/√n.
 * @param {ReturnType<typeof incrementLaw>} law
 * @param {number} n
 */
export function scoreMoments(law, n) {
  const out = {};
  for (const { id, divisor } of Object.values(NORMALIZATIONS)) {
    const d = divisor(n);
    const variance = (n * law.variance) / (d * d);
    out[id] = { mean: (n * law.mean) / d, variance, sd: Math.sqrt(variance) };
  }
  return out;
}

function checkRun(checkpoints, m) {
  if (!Number.isInteger(m) || m < 1) throw new RangeError('The number of attackers m must be a positive integer');
  if (checkpoints.length === 0) throw new RangeError('At least one checkpoint n is needed');
  checkpoints.forEach((n, i) => {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`Checkpoint ${n} is not a positive integer`);
    if (i > 0 && n <= checkpoints[i - 1]) throw new RangeError('Checkpoints must be strictly increasing');
  });
  const nMax = checkpoints[checkpoints.length - 1];
  if (m * nMax > STREAM_PERIOD) {
    throw new RangeError(`m·n = ${m * nMax} draws exceed the period 2^32 of the generator`);
  }
  return nMax;
}

/**
 * Total scores of m attackers at increasing numbers of systems n.
 * Attacker j consumes draws j·nMax + 1, …, (j + 1)·nMax of the stream.
 * @param {{ law: ReturnType<typeof incrementLaw>, checkpoints: number[], m: number, seed: number }} run
 * @returns {{ checkpoints: number[], scores: Int32Array[] }} scores[c][j] = S at checkpoints[c] for attacker j
 */
export function simulateScores({ law, checkpoints, m, seed }) {
  const nMax = checkRun(checkpoints, m);
  const { uniform } = createRandom(seed);
  const { q, low, high } = law;
  const scores = checkpoints.map(() => new Int32Array(m));
  for (let j = 0; j < m; j += 1) {
    let s = 0;
    let c = 0;
    for (let i = 1; i <= nMax; i += 1) {
      s += uniform() < q ? high : low;
      if (i === checkpoints[c]) {
        scores[c][j] = s;
        c += 1;
      }
    }
  }
  return { checkpoints: [...checkpoints], scores };
}

/**
 * Whole trajectories S₀ = 0, S₁, …, Sₙ of m attackers, from the same stream as simulateScores
 * (so the two agree for the same seed when n equals the last checkpoint).
 * @param {{ law: ReturnType<typeof incrementLaw>, n: number, m: number, seed: number }} run
 * @returns {Int32Array[]} one array of length n + 1 per attacker
 */
export function simulateTrajectories({ law, n, m, seed }) {
  checkRun([n], m);
  const { uniform } = createRandom(seed);
  const { q, low, high } = law;
  const paths = [];
  for (let j = 0; j < m; j += 1) {
    const path = new Int32Array(n + 1);
    for (let i = 1; i <= n; i += 1) path[i] = path[i - 1] + (uniform() < q ? high : low);
    paths.push(path);
  }
  return paths;
}

/**
 * Scores divided by n^exponent of the chosen normalisation.
 * @param {ArrayLike<number>} scores total scores Sₙ
 * @param {number} n
 * @param {keyof typeof NORMALIZATIONS} normalization
 */
export function normalizeScores(scores, n, normalization) {
  const d = NORMALIZATIONS[normalization].divisor(n);
  return Float64Array.from(scores, (s) => s / d);
}

/** Sample mean and unbiased sample variance. */
export function sampleMoments(values) {
  const sd = values.length > 1 ? sampleSd(values) : NaN;
  return { mean: sampleMean(values), variance: sd * sd };
}

/**
 * Exact law of Sₙ: score[k] = n·low + (high − low)·k with probability C(n, k) q^k (1 − q)^(n − k).
 * @returns {{ score: Float64Array, prob: Float64Array }}
 */
export function exactScoreLaw(law, n) {
  const score = new Float64Array(n + 1);
  const prob = new Float64Array(n + 1);
  for (let k = 0; k <= n; k += 1) {
    score[k] = n * law.low + (law.high - law.low) * k;
    prob[k] = binomialPmf(n, k, law.q);
  }
  return { score, prob };
}

/**
 * Whether |Sₙ/n − μ| ≥ ε, decided on the binomial count k = (Sₙ − n·low)/(high − low)
 * as |k − nq| ≥ nε/(high − low), with a relative tolerance so that a deviation of
 * exactly ε is counted despite rounding.
 */
function deviationTest(law, n, eps) {
  const threshold = (n * eps) / (law.high - law.low);
  const cut = threshold - 1e-9 * Math.max(1, threshold);
  const centre = n * law.q;
  return (k) => Math.abs(k - centre) >= cut;
}

/** Exact P(|Sₙ/n − μ| ≥ ε). */
export function exactExceedance(law, n, eps) {
  const far = deviationTest(law, n, eps);
  let p = 0;
  for (let k = 0; k <= n; k += 1) if (far(k)) p += binomialPmf(n, k, law.q);
  return Math.min(1, p);
}

/** Fraction of simulated total scores with |Sₙ/n − μ| ≥ ε. */
export function empiricalExceedance(scores, law, n, eps) {
  const far = deviationTest(law, n, eps);
  const span = law.high - law.low;
  let count = 0;
  for (const s of scores) if (far((s - n * law.low) / span)) count += 1;
  return count / scores.length;
}

/** Chebyshev's bound σ²/(nε²) on P(|Sₙ/n − μ| ≥ ε), capped at 1. */
export function chebyshevBound(law, n, eps) {
  return Math.min(1, law.variance / (n * eps * eps));
}

/** Hoeffding's bound 2·exp(−2nε²/(high − low)²) on P(|Sₙ/n − μ| ≥ ε), capped at 1. */
export function hoeffdingBound(law, n, eps) {
  const span = law.high - law.low;
  return Math.min(1, 2 * Math.exp((-2 * n * eps * eps) / (span * span)));
}

/**
 * Kolmogorov distance sup_x |F̂(x) − F(x)| between the empirical law of a sample and a
 * continuous distribution function F. At a value shared by several observations both the
 * left limit and the value of the empirical function are compared with F.
 * @param {ArrayLike<number>} values
 * @param {(x: number) => number} cdf
 */
export function kolmogorovDistance(values, cdf) {
  const sorted = Float64Array.from(values).sort();
  const m = sorted.length;
  let d = 0;
  let i = 0;
  while (i < m) {
    const x = sorted[i];
    let j = i;
    while (j < m && sorted[j] === x) j += 1;
    const f = cdf(x);
    d = Math.max(d, Math.abs(i / m - f), Math.abs(j / m - f));
    i = j;
  }
  return d;
}

/**
 * Exact Kolmogorov distance between the law of the standardised sum (Sₙ − nμ)/(σ√n) and N(0, 1).
 * In the Rademacher model the standardised sum is Sₙ/√n itself.
 */
export function exactKolmogorovDistance(law, n) {
  const { score, prob } = exactScoreLaw(law, n);
  const centre = n * law.mean;
  const scale = Math.sqrt(n * law.variance);
  let below = 0;
  let d = 0;
  for (let k = 0; k <= n; k += 1) {
    const f = standardNormalCdf((score[k] - centre) / scale);
    const above = below + prob[k];
    d = Math.max(d, Math.abs(below - f), Math.abs(above - f));
    below = above;
  }
  return d;
}

/** Berry–Esseen bound C·E|X − μ|³/(σ³√n) on the distance computed by exactKolmogorovDistance, capped at 1. */
export function berryEsseenBound(law, n, constant = BERRY_ESSEEN_CONSTANT) {
  return Math.min(1, (constant * law.absThird) / (law.variance ** 1.5 * Math.sqrt(n)));
}

/**
 * Half-width of the Dvoretzky–Kiefer–Wolfowitz band (with Massart's constant): with probability
 * at least 1 − α the empirical distribution function of m attackers lies within this distance
 * of the true one, uniformly in x.
 */
export function dkwRadius(m, alpha = 0.05) {
  return Math.sqrt(Math.log(2 / alpha) / (2 * m));
}

/**
 * Probability that at least one of m independent attackers reaches a total score ≥ threshold
 * after n systems: 1 − P(Sₙ < threshold)^m.
 */
export function probabilityAnyAttackerReaches(law, n, m, threshold) {
  const { score, prob } = exactScoreLaw(law, n);
  let single = 0;
  for (let k = 0; k <= n; k += 1) if (score[k] >= threshold) single += prob[k];
  if (single >= 1) return 1;
  return -Math.expm1(m * Math.log1p(-single));
}

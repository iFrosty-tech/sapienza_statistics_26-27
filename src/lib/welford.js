/**
 * Knuth's recurrence for the mean and Welford's recurrence for the corrected
 * sum of squares SSₖ = ∑ᵢ₌₁ᵏ (xᵢ − x̄ₖ)², shared by the two exercises of
 * homework 4. For k ≥ 1, from x̄₀ = 0 and SS₀ = 0,
 *
 *   x̄ₖ  = x̄ₖ₋₁ + (xₖ − x̄ₖ₋₁)/k
 *   SSₖ = SSₖ₋₁ + (xₖ − x̄ₖ₋₁)(xₖ − x̄ₖ)
 *
 * One pass, three numbers of state and no observation stored. The sample
 * variance s²ₖ = SSₖ/(k − 1) needs k ≥ 2; both variances are NaN where they
 * are undefined.
 */

/** The state of the recurrences before any observation. */
export function createAccumulator() {
  return { k: 0, mean: 0, ss: 0 };
}

/**
 * Adds one observation to the state, in place.
 * @param {{ k: number, mean: number, ss: number }} state
 * @param {number} x
 * @returns the same state, so that calls can be chained
 */
export function push(state, x) {
  state.k += 1;
  const innovation = x - state.mean;
  state.mean += innovation / state.k;
  state.ss += innovation * (x - state.mean);
  return state;
}

/** s²ₖ = SSₖ/(k − 1), the unbiased estimator of σ². NaN below two observations. */
export function sampleVariance({ k, ss }) {
  return k < 2 ? NaN : ss / (k - 1);
}

/** SSₖ/k, the variance of the data themselves. NaN with no observation. */
export function populationVariance({ k, ss }) {
  return k < 1 ? NaN : ss / k;
}

/** The estimates of a whole sequence. */
export function summarize(values) {
  const state = createAccumulator();
  for (const x of values) push(state, x);
  return {
    n: state.k,
    mean: state.mean,
    ss: state.ss,
    sampleVariance: sampleVariance(state),
    populationVariance: populationVariance(state),
  };
}

/**
 * The estimates after each observation: index k − 1 holds x̄ₖ, SSₖ and s²ₖ.
 * @returns {{ mean: Float64Array, ss: Float64Array, variance: Float64Array }}
 */
export function runningEstimates(values) {
  const n = values.length;
  const mean = new Float64Array(n);
  const ss = new Float64Array(n);
  const variance = new Float64Array(n);
  const state = createAccumulator();
  for (let i = 0; i < n; i += 1) {
    push(state, values[i]);
    mean[i] = state.mean;
    ss[i] = state.ss;
    variance[i] = sampleVariance(state);
  }
  return { mean, ss, variance };
}

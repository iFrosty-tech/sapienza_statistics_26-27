/**
 * Diffusion in Keccak-f[1600]: how a one-bit difference between two states
 * spreads, step mapping by step mapping (θ, ρ, π, χ, ι), over the 24 rounds.
 *
 * For n random 1600-bit states and twins differing in one uniformly chosen
 * bit, the number of differing state bits is recorded after every step of the
 * first rounds and after every complete round. Under the idealisation of a
 * random permutation the two outputs are independent uniform strings, so the
 * final difference is Bin(1600, ½): mean 800, standard deviation 20.
 *
 * Exact facts of the first round, checked by the tests:
 *   - θ adds to every bit a[x][y][z] the parities of two columns,
 *     C[x − 1][z] and C[x + 1][z − 1]. Flipping the single bit (x0, y0, z0)
 *     flips exactly one column parity, C[x0][z0]. That parity enters the five
 *     bits of column (x0 + 1, z0) (as their C[x − 1][z]) and the five bits of
 *     column (x0 − 1, z0 + 1) (as their C[x + 1][z − 1]). These two columns
 *     differ from each other and from the bit's own column, so nothing
 *     cancels, and since θ is linear the output difference is θ(difference):
 *     the flipped bit plus 5 + 5 bits, exactly 11, whatever the state.
 *   - ρ rotates lanes and π permutes them: both move bits without changing
 *     their number, so the count stays 11.
 *   - ι adds the same round constant to both states, so the difference is
 *     unchanged. Only χ (the one non-linear step) can change the count in a
 *     state-dependent way.
 *
 * States come from the seeded statistical generator of random.js, which is
 * adequate for a simulation; real key material must come from a CSPRNG.
 */

import { createState, keccakStep, keccakRound, KECCAK_STEPS, KECCAK_ROUNDS, stateToBytes } from './keccak.js';
import { createRandom } from './random.js';
import { bytesToHex } from './bytes.js';
import { binnedBinomialChiSquare, binomialPmfTable } from './stats.js';

/** Number of leading rounds whose individual steps are recorded. */
export const DIFFUSION_STEP_ROUNDS = 3;

const STEP_SYMBOLS = Object.freeze({ theta: 'θ', rho: 'ρ', pi: 'π', chi: 'χ', iota: 'ι' });

/* Population count of a 32-bit word. */
function popcount32(v) {
  let x = v - ((v >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/* Number of differing bits between two states. */
function stateDistance(a, b) {
  let d = 0;
  for (let i = 0; i < 50; i += 1) d += popcount32(a[i] ^ b[i]);
  return d;
}

/* A random state from the generator: 50 uniform 32-bit words. */
function randomState(rnd) {
  const s = createState();
  for (let i = 0; i < 50; i += 1) s[i] = rnd.uint32();
  return s;
}

/* Bit index i = 64(x + 5y) + z of the state, as lane coordinates. */
function bitCoordinates(index) {
  const lane = index >> 6;
  return { index, x: lane % 5, y: Math.floor(lane / 5), z: index & 63 };
}

/* A copy of the state with bit `index` flipped (word index >> 5, bit index & 31). */
function flippedCopy(state, index) {
  const twin = Uint32Array.from(state);
  twin[index >> 5] ^= 1 << (index & 31);
  return twin;
}

/* Quantile of sorted values by linear interpolation (Hyndman–Fan type 7). */
function quantileSorted(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

function summarize(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const ss = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  const sorted = Float64Array.from(values).sort();
  return {
    mean,
    sd: n > 1 ? Math.sqrt(ss / (n - 1)) : 0,
    min: sorted[0],
    max: sorted[n - 1],
    q1: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    q3: quantileSorted(sorted, 0.75),
  };
}

/* The checkpoint list: every step of the first rounds, then every complete round. */
function checkpointList(rounds) {
  const list = [];
  for (let r = 1; r <= Math.min(DIFFUSION_STEP_ROUNDS, rounds); r += 1) {
    for (const step of KECCAK_STEPS) list.push({ label: `R${r} ${STEP_SYMBOLS[step]}`, round: r, step });
  }
  for (let r = 1; r <= rounds; r += 1) list.push({ label: `R${r}`, round: r, step: 'round' });
  return list;
}

/**
 * W7. Difference counts after every step of rounds 1–3 and after every round.
 * @param {{ seed?: number, n?: number, rounds?: number }} options
 * @returns {{ seed: number, n: number, rounds: number,
 *   checkpoints: { label: string, round: number, step: string, mean: number, sd: number,
 *     min: number, max: number, q1: number, median: number, q3: number }[],
 *   final: { counts: number[], pmf: number[], mean: number, sd: number, expectedMean: number,
 *     expectedSd: number, statistic: number, df: number, p: number, bins: object[] } }}
 */
export function keccakDiffusion({ seed = 1600, n = 10000, rounds = KECCAK_ROUNDS } = {}) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > KECCAK_ROUNDS) throw new Error('rounds must be 1 to 24');
  const rnd = createRandom(seed);
  const checkpoints = checkpointList(rounds);
  const stepCount = 5 * Math.min(DIFFUSION_STEP_ROUNDS, rounds);
  const values = checkpoints.map(() => new Array(n));
  for (let s = 0; s < n; s += 1) {
    const a = randomState(rnd);
    const b = flippedCopy(a, rnd.int(1600));
    let c = 0;
    for (let r = 0; r < Math.min(DIFFUSION_STEP_ROUNDS, rounds); r += 1) {
      for (const step of KECCAK_STEPS) {
        keccakStep(a, step, r);
        keccakStep(b, step, r);
        values[c][s] = stateDistance(a, b);
        c += 1;
      }
    }
    for (let r = 0; r < rounds; r += 1) {
      if (r >= DIFFUSION_STEP_ROUNDS) {
        keccakRound(a, r);
        keccakRound(b, r);
      }
      values[stepCount + r][s] = r < DIFFUSION_STEP_ROUNDS ? values[5 * r + 4][s] : stateDistance(a, b);
    }
  }
  const finalValues = values.at(-1);
  const counts = new Array(1601).fill(0);
  for (const d of finalValues) counts[d] += 1;
  const fit = binnedBinomialChiSquare(counts, 1600, 0.5);
  const finalSummary = summarize(finalValues);
  return {
    seed,
    n,
    rounds,
    checkpoints: checkpoints.map((cp, i) => ({ ...cp, ...summarize(values[i]) })),
    final: {
      counts,
      pmf: binomialPmfTable(1600, 0.5),
      mean: finalSummary.mean,
      sd: finalSummary.sd,
      expectedMean: 800,
      expectedSd: 20,
      statistic: fit.statistic,
      df: fit.df,
      p: fit.p,
      bins: fit.bins,
    },
  };
}

/**
 * One sample of W7 for the 3-D state figure: the 1600-bit difference mask
 * before the first round and after every step of the first rounds. Each mask
 * is the hex encoding of the 200-byte FIPS 202 string of the XOR of the two
 * states, so state bit i = 64(x + 5y) + z is bit (i mod 8) of byte ⌊i / 8⌋.
 * @param {number} seed
 * @param {{ rounds?: number }} [options] number of rounds traced step by step
 * @returns {{ seed: number, flipped: { index: number, x: number, y: number, z: number },
 *   steps: { label: string, round: number, step: string, count: number, mask: string }[] }}
 */
export function keccakDiffusionTrace(seed, { rounds = DIFFUSION_STEP_ROUNDS } = {}) {
  const rnd = createRandom(seed);
  const a = randomState(rnd);
  const flipped = bitCoordinates(rnd.int(1600));
  const b = flippedCopy(a, flipped.index);
  const record = (label, round, step) => {
    const diff = createState();
    for (let i = 0; i < 50; i += 1) diff[i] = a[i] ^ b[i];
    return { label, round, step, count: stateDistance(a, b), mask: bytesToHex(stateToBytes(diff)) };
  };
  const steps = [record('input', 0, 'input')];
  for (let r = 0; r < rounds; r += 1) {
    for (const step of KECCAK_STEPS) {
      keccakStep(a, step, r);
      keccakStep(b, step, r);
      steps.push(record(`R${r + 1} ${STEP_SYMBOLS[step]}`, r + 1, step));
    }
  }
  return { seed, flipped, steps };
}

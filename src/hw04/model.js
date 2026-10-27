/**
 * The pure part of the two interactive panels of homework 04: reading the
 * mount point, the scales of the controls, the pacing of the animations, the
 * decimation of the trajectories to pixel columns, the theoretical envelope,
 * the plotted domain, the lattice-aligned histograms drawn beside the
 * trajectories, the readouts against theory, the exact law of Sₙ/√n and the
 * geometry of its ridgeline. Nothing here touches the DOM, so that every rule
 * the panels follow is tested in Node (test/hw04-demos.test.js).
 *
 * Every simulation, exact law, bound and distribution function comes from
 * src/lib/penetration.js; this module only arranges them for drawing.
 *
 *   parseMountOptions, parseSeed, SIM_N_STOPS, SIM_M_STOPS, nearestStop
 *                                          controls and mount point
 *   easeOut, playDuration, frontAt, trajectoryAlpha, lerpInto
 *                                          motion
 *   trajectoryGrid, decimatePaths, pointsUpTo, scoresAt, envelopeOnGrid,
 *   quantityDomain, histogramGroup, latticeHistogram, simulatorLayout,
 *   simulatorReadout, simulatorSummary     the simulator panel (§3)
 *   CLT_N_STOPS, CLT_PLAYLIST, cltExactLaw, stepDensity, cltSampleBins,
 *   cltReadout, cltSummary, ridgeGeometry  the central limit panel (§7)
 *   formatNumber, niceTicks                both
 */

import {
  NORMALIZATIONS,
  berryEsseenBound,
  dkwRadius,
  empiricalExceedance,
  exactExceedance,
  exactKolmogorovDistance,
  exactScoreLaw,
  incrementLaw,
  kolmogorovDistance,
  normalizeScores,
  sampleMoments,
  scoreMoments,
  standardNormalCdf,
} from '../lib/penetration.js';

/** Seed of the simulator when the mount point names none: a fixed value keeps the page reproducible. */
export const DEFAULT_SEED = 20261027;
/** Success probability of the Bernoulli model when the mount point names none. */
export const DEFAULT_P = 0.3;

const SEED_LIMIT = 2 ** 32;
const P_MIN = 0.01;
const P_MAX = 0.99;

/** Systems per attacker, on a log-like scale of six stops per decade. */
export const SIM_N_STOPS = [10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000];
/** Attackers, on the same scale. */
export const SIM_M_STOPS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500];
/** n of the central limit panel: the powers of two and three times the powers of two. */
export const CLT_N_STOPS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048];
/** The values of n the central limit panel steps through. */
export const CLT_PLAYLIST = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

const RADEMACHER = incrementLaw('rademacher');

/* ------------------------------------------------------- controls and mount */

const SEED_MESSAGE = 'The seed must be a whole number from 0 to 4294967295.';

/** Reads a seed typed by the reader: a whole number from 0 to 2³² − 1. */
export function parseSeed(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,10}$/.test(text) || Number(text) >= SEED_LIMIT) return { ok: false, message: SEED_MESSAGE };
  return { ok: true, seed: Number(text) };
}

/** Rounds p to the step of its control (0.01) and clamps it to 0.01 … 0.99. */
export function clampP(p) {
  return Math.min(P_MAX, Math.max(P_MIN, Math.round(p * 100) / 100));
}

/**
 * The options of the simulator read from its mount point: data-seed and data-p
 * as plain numbers, with the defaults when an attribute is absent or unusable.
 * @param {{ seed?: string, p?: string }} dataset
 */
export function parseMountOptions(dataset = {}) {
  const seed = parseSeed(dataset.seed);
  const p = String(dataset.p ?? '').trim() === '' ? Number.NaN : Number(dataset.p);
  return { seed: seed.ok ? seed.seed : DEFAULT_SEED, p: Number.isFinite(p) ? clampP(p) : DEFAULT_P };
}

/** Index of the stop closest to `value` on a logarithmic scale. */
export function nearestStop(stops, value) {
  const v = Math.log(Math.max(value, 1e-300));
  let best = 0;
  for (let i = 1; i < stops.length; i += 1) {
    if (Math.abs(Math.log(stops[i]) - v) < Math.abs(Math.log(stops[best]) - v)) best = i;
  }
  return best;
}

/* ------------------------------------------------------------------ motion */

/** Exponential deceleration, close to the site's cubic-bezier(0.16, 1, 0.3, 1); clamped to [0, 1]. */
export function easeOut(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return (1 - 2 ** (-10 * x)) / (1 - 2 ** -10);
}

/** Duration in ms of a run of the attackers through n systems: longer for more systems, from 2.6 s to 5.6 s. */
export function playDuration(n) {
  return 1500 + 1100 * Math.log10(n);
}

/** The step reached by the attackers after `elapsed` ms: every system takes the same time. */
export function frontAt(elapsed, duration, n) {
  return Math.min(1, Math.max(0, elapsed / duration)) * n;
}

/** Opacity of one trajectory: overlapping paths darken where attackers crowd, so the ink reads as density. */
export function trajectoryAlpha(m) {
  return Math.min(1, Math.max(0.06, 2.2 / Math.sqrt(m)));
}

/** out[i] = a[i] + (b[i] − a[i])·e. */
export function lerpInto(out, a, b, e) {
  for (let i = 0; i < out.length; i += 1) out[i] = a[i] + (b[i] - a[i]) * e;
  return out;
}

/* ------------------------------------------------------------ trajectories */

/**
 * The steps at which a trajectory is drawn. When the n steps fit in the pixel
 * columns every step k = 1 … n is a point; otherwise the steps are cut into
 * `columns` contiguous ranges and each range gives two points at its centre,
 * its extreme values, so that no excursion is lost however long the walk.
 * @returns {{ n: number, points: number, perColumn: boolean, xs: Float64Array, ranges: Int32Array | null }}
 *   ranges[2c], ranges[2c + 1] are the first and last step of column c
 */
export function trajectoryGrid(n, columns) {
  const cols = Math.max(1, Math.floor(columns));
  if (n <= 2 * cols) {
    return { n, points: n, perColumn: false, xs: Float64Array.from({ length: n }, (_, i) => i + 1), ranges: null };
  }
  const ranges = new Int32Array(2 * cols);
  const xs = new Float64Array(2 * cols);
  for (let c = 0; c < cols; c += 1) {
    const k0 = 1 + Math.floor((c * n) / cols);
    const k1 = Math.floor(((c + 1) * n) / cols);
    ranges[2 * c] = k0;
    ranges[2 * c + 1] = k1;
    xs[2 * c] = (k0 + k1) / 2;
    xs[2 * c + 1] = (k0 + k1) / 2;
  }
  return { n, points: 2 * cols, perColumn: true, xs, ranges };
}

/**
 * The plotted quantity of every trajectory on the grid: Sₖ/d(k) at each step,
 * or, per column, its minimum and maximum in the order they occur.
 * @param {Int32Array[]} paths trajectories S₀ … Sₙ of simulateTrajectories
 * @param {ReturnType<typeof trajectoryGrid>} grid
 * @param {keyof typeof NORMALIZATIONS} normalization
 * @returns {Float32Array} m·points values, attacker after attacker
 */
export function decimatePaths(paths, grid, normalization) {
  const { divisor } = NORMALIZATIONS[normalization];
  const P = grid.points;
  const out = new Float32Array(paths.length * P);
  const inv = new Float64Array(grid.n + 1);
  for (let k = 1; k <= grid.n; k += 1) inv[k] = 1 / divisor(k);
  paths.forEach((path, j) => {
    const base = j * P;
    if (!grid.perColumn) {
      for (let k = 1; k <= grid.n; k += 1) out[base + k - 1] = path[k] * inv[k];
      return;
    }
    const { ranges } = grid;
    for (let c = 0; c < P / 2; c += 1) {
      let lo = Infinity;
      let hi = -Infinity;
      let iLo = 0;
      let iHi = 0;
      for (let k = ranges[2 * c]; k <= ranges[2 * c + 1]; k += 1) {
        const v = path[k] * inv[k];
        if (v < lo) {
          lo = v;
          iLo = k;
        }
        if (v > hi) {
          hi = v;
          iHi = k;
        }
      }
      out[base + 2 * c] = iLo <= iHi ? lo : hi;
      out[base + 2 * c + 1] = iLo <= iHi ? hi : lo;
    }
  });
  return out;
}

/** Number of grid points at or before the front (the step the attackers have reached). */
export function pointsUpTo(grid, front) {
  const { xs } = grid;
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= front) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Total scores Sₖ of every attacker after k systems. */
export function scoresAt(paths, k) {
  return Int32Array.from(paths, (path) => path[k]);
}

/* ------------------------------------------------------------------ theory */

/** Theoretical mean and mean ± z·sd of the chosen quantity at the steps xs (scoreMoments of the library). */
export function envelopeOnGrid(law, normalization, xs, z = 2) {
  const mean = new Float64Array(xs.length);
  const lo = new Float64Array(xs.length);
  const hi = new Float64Array(xs.length);
  xs.forEach((k, i) => {
    const q = scoreMoments(law, k)[normalization];
    mean[i] = q.mean;
    lo[i] = q.mean - z * q.sd;
    hi[i] = q.mean + z * q.sd;
  });
  return { mean, lo, hi };
}

function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * The plotted range of the quantity. Sₙ/n lives on the support of one increment,
 * [low, high], at every step, so that its collapse onto μ is drawn to one scale;
 * Sₙ and Sₙ/√n are given the range of the data, the envelope and 0, padded by 5%.
 * @param {{ law: object, normalization: string, observed: [number, number], envelope: { lo: ArrayLike<number>, hi: ArrayLike<number> } }} args
 */
export function quantityDomain({ law, normalization, observed, envelope }) {
  if (normalization === 'average') return [law.low, law.high];
  const lo = Math.min(0, observed[0], extent(envelope.lo)[0]);
  const hi = Math.max(0, observed[1], extent(envelope.hi)[1]);
  const pad = 0.05 * (hi - lo || 1);
  return [lo - pad, hi + pad];
}

/* -------------------------------------------------------------- histograms */

/**
 * How many consecutive lattice values one bar of a histogram holds: enough for
 * a bar 3 px tall, and no more bars over the observed range than Rice's rule,
 * 2·m^(1/3), allows.
 * @param {{ kSpan: number, m: number, pxPerK: number }} args kSpan lattice values observed, pxPerK pixels per lattice step
 */
export function histogramGroup({ kSpan, m, pxPerK }) {
  const byPixels = Math.ceil(3 / Math.max(pxPerK, 1e-9) - 1e-9);
  const bins = Math.max(4, Math.ceil(2 * Math.cbrt(m)));
  const byData = Math.ceil(kSpan / bins);
  return Math.max(1, byPixels, byData);
}

/**
 * The histogram of the quantity across the attackers after k systems. The total
 * score lives on the lattice Sₖ = k·low + (high − low)·K, K = 0 … k, so bars are
 * cut on K, `group` lattice values each, aligned at multiples of `group`: no bar
 * holds more lattice values than another, and no comb appears.
 * @param {Int32Array} scores total scores Sₖ of the attackers
 * @returns {{ bins: { lo: number, hi: number, count: number, density: number }[], width: number, group: number }}
 *   lo and hi in units of the quantity; density = count/(m·width)
 */
export function latticeHistogram(scores, { law, k, normalization, group = 1 }) {
  const span = law.high - law.low;
  const d = NORMALIZATIONS[normalization].divisor(k);
  const m = scores.length;
  let bMin = Infinity;
  let bMax = -Infinity;
  const index = Int32Array.from(scores, (s) => {
    const b = Math.floor(Math.round((s - k * law.low) / span) / group);
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
    return b;
  });
  const counts = new Int32Array(bMax - bMin + 1);
  for (const b of index) counts[b - bMin] += 1;
  const width = (group * span) / d;
  const edge = (b) => (k * law.low + span * (b * group - 0.5)) / d;
  const bins = Array.from(counts, (count, i) => ({
    lo: edge(bMin + i),
    hi: edge(bMin + i + 1),
    count,
    density: count / (m * width),
  }));
  return { bins, width, group };
}

/* ------------------------------------------------------------------ format */

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/**
 * A value as printed in a readout: `digits` significant figures, grouped
 * thousands, a true minus sign, and a power of ten below 0.001 or from 10⁵.
 */
export function formatNumber(x, digits = 4) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a < 1e-3 || a >= 1e5) {
    let e = Math.floor(Math.log10(a));
    let mantissa = Number((a / 10 ** e).toPrecision(digits));
    if (mantissa >= 10) {
      mantissa /= 10;
      e += 1;
    }
    const power = String(e).replace(/[-\d]/g, (c) => SUPERSCRIPT[c]);
    return `${sign}${String(mantissa)} × 10${power}`;
  }
  return sign + a.toLocaleString('en-GB', { maximumSignificantDigits: digits });
}

/** Round tick values (steps of 1, 2 or 5 times a power of ten) inside [lo, hi], about `count` intervals. */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9 * step; i += 1) {
    ticks.push(Number((i * step).toFixed(12)) || 0);
  }
  return ticks;
}

/* ----------------------------------------------------------------- layout */

/**
 * The drawing of the simulator: the trajectories on the left, then the two
 * sideways histograms (at t and at n) sharing the plot's vertical scale.
 */
export function simulatorLayout(width, height) {
  const left = 46;
  const right = 4;
  const top = 26;
  const bottom = 36;
  const gap = 10;
  const stripW = Math.min(120, Math.max(40, Math.round(width * 0.12)));
  const plotW = width - left - right - 2 * (stripW + gap);
  const plot = { x: left, y: top, w: plotW, h: height - top - bottom };
  const s0 = plot.x + plot.w + gap;
  return { plot, strips: [{ x: s0, w: stripW }, { x: s0 + stripW + gap, w: stripW }] };
}

/* ---------------------------------------------------------------- readouts */

/**
 * The readout of the simulator: the simulated and theoretical mean and variance
 * of the drawn quantity after t and after n systems, and the share of attackers
 * whose average score Sₖ/k lies at least ε from μ against its exact probability
 * (the law of large numbers, whatever quantity is drawn).
 */
export function simulatorReadout({ law, paths, n, t, normalization, eps }) {
  const steps = [t, n];
  const cells = steps.map((k) => {
    const scores = scoresAt(paths, k);
    const sim = sampleMoments(normalizeScores(scores, k, normalization));
    const theory = scoreMoments(law, k)[normalization];
    return {
      mean: { simulated: sim.mean, theory: theory.mean },
      variance: { simulated: sim.variance, theory: theory.variance },
      exceedance: { simulated: empiricalExceedance(scores, law, k, eps), theory: exactExceedance(law, k, eps) },
    };
  });
  const row = (id, label) => ({ id, label, cells: cells.map((c) => c[id]) });
  return {
    steps,
    rows: [row('mean', 'Mean'), row('variance', 'Variance'), row('exceedance', `P(|Sₖ/k − μ| ≥ ε)`)],
  };
}

const plural = (count, word) => `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;

/** The words announced for a state of the simulator: parameters, then the readout at n. */
export function simulatorSummary({ law, n, m, t, normalization, eps, seed }, readout) {
  const model = law.model === 'bernoulli' ? `Bernoulli, p = ${formatNumber(law.q, 2)}` : 'Rademacher';
  const label = NORMALIZATIONS[normalization].label;
  const [mean, variance, exceed] = readout.rows;
  return (
    `${model}; ${plural(m, 'attacker')} over ${plural(n, 'system')}, seed ${seed}; quantity ${label}. ` +
    `After n systems: simulated mean ${formatNumber(mean.cells[1].simulated)} against ${formatNumber(mean.cells[1].theory)}, ` +
    `simulated variance ${formatNumber(variance.cells[1].simulated)} against ${formatNumber(variance.cells[1].theory)}. ` +
    `At step t = ${t.toLocaleString('en-GB')} the variance is ${formatNumber(variance.cells[0].simulated)} against ${formatNumber(variance.cells[0].theory)}. ` +
    `Share of attackers with an average score at least ε = ${formatNumber(eps, 2)} from μ after n systems: ` +
    `${formatNumber(exceed.cells[1].simulated)}, exact probability ${formatNumber(exceed.cells[1].theory)}.`
  );
}

/* -------------------------------------------------------------------- CLT */

/**
 * The exact law of Sₙ/√n in the Rademacher model: the values z = (2k − n)/√n,
 * k = 0 … n, on a lattice of spacing 2/√n, with their probabilities rescaled to
 * a density (probability / spacing), so that the bars can face the normal density.
 */
export function cltExactLaw(n) {
  const { score, prob } = exactScoreLaw(RADEMACHER, n);
  const root = Math.sqrt(n);
  const spacing = 2 / root;
  return {
    n,
    spacing,
    z: Float64Array.from(score, (s) => s / root),
    prob,
    density: Float64Array.from(prob, (q) => q / spacing),
  };
}

/** The staircase of bars of an exact law, each centred on its lattice point, read at the points xs. */
export function stepDensity(law, xs) {
  const root = Math.sqrt(law.n);
  return Float64Array.from(xs, (x) => {
    const k = Math.round((x * root + law.n) / 2);
    return k >= 0 && k <= law.n ? law.density[k] : 0;
  });
}

/**
 * The histogram of simulated Sₙ/√n, cut on its lattice by the rules of the
 * simulator's histograms (histogramGroup, latticeHistogram): at large n a bar
 * holds several lattice values, so that 1,000 attackers do not scatter over
 * a thousand cells of spacing 2/√n.
 * @param {Int32Array} scores simulated Sₙ of m attackers
 * @param {number} n
 * @param {number} pxPerUnit pixels per unit of Sₙ/√n on the chart
 * @returns {{ z: number, density: number, count: number }[]} z the centre of each bar
 */
export function cltSampleBins(scores, n, pxPerUnit) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of scores) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  const group = histogramGroup({ kSpan: (hi - lo) / 2 + 1, m: scores.length, pxPerK: (pxPerUnit * 2) / Math.sqrt(n) });
  const { bins } = latticeHistogram(scores, { law: RADEMACHER, k: n, normalization: 'normalized', group });
  return bins.map((b) => ({ z: (b.lo + b.hi) / 2, density: b.density, count: b.count }));
}

/**
 * The readout of the central limit panel: the exact Kolmogorov distance Dₙ
 * between the law of Sₙ/√n and N(0, 1), its Berry–Esseen bound, √n·Dₙ, and for
 * a simulated sample its own distance to Φ with the 95% DKW radius.
 * @param {number} n
 * @param {Int32Array | null} [scores] simulated Sₙ of m attackers
 */
export function cltReadout(n, scores = null) {
  const distance = exactKolmogorovDistance(RADEMACHER, n);
  const bound = berryEsseenBound(RADEMACHER, n);
  return {
    n,
    spacing: 2 / Math.sqrt(n),
    distance,
    bound,
    scaled: Math.sqrt(n) * distance,
    sample: scores
      ? {
          m: scores.length,
          distance: kolmogorovDistance(normalizeScores(scores, n, 'normalized'), standardNormalCdf),
          dkw: dkwRadius(scores.length),
        }
      : null,
  };
}

/** The words announced for a state of the central limit panel. */
export function cltSummary(r) {
  let text =
    `Rademacher model, n = ${r.n.toLocaleString('en-GB')}: Sₙ/√n lives on a lattice of spacing ${formatNumber(r.spacing)}. ` +
    `Exact Kolmogorov distance to the standard normal ${formatNumber(r.distance)}, Berry–Esseen bound ${formatNumber(r.bound)}; ` +
    `√n times the distance is ${formatNumber(r.scaled)}.`;
  if (r.sample) {
    text += ` A simulated sample of ${plural(r.sample.m, 'attacker')} lies at distance ${formatNumber(r.sample.distance)} from Φ; the 95% DKW radius is ${formatNumber(r.sample.dkw)}.`;
  }
  return text;
}

/**
 * Where ridge i of `count` sits in the ridgeline of laws: the back ridge (n = 1)
 * high, narrow and shifted right, the front one (the normal limit) low and wide,
 * as on a sheet seen obliquely. A left margin holds the labels.
 * @returns {{ x0: number, x1: number, base: number, amp: number, depth: number }}
 */
export function ridgeGeometry(i, count, { width, height }) {
  const depth = count > 1 ? i / (count - 1) : 1;
  const left = 56;
  const right = width - 8;
  const usable = right - left;
  const scale = 0.78 + 0.22 * depth;
  const amp = 0.42 * height * scale;
  const backBase = 0.42 * height * 0.78 + 6;
  const frontBase = height - 20;
  const base = backBase + (frontBase - backBase) * depth;
  const w = usable * (0.72 + 0.28 * depth);
  const cx = (left + right) / 2 + (1 - depth) * 0.05 * usable;
  return { x0: cx - w / 2, x1: cx + w / 2, base, amp, depth };
}

/**
 * The pure parts of the two interactive panels of homework 04
 * (src/hw04/model.js): reading the mount point, the scales of the controls,
 * the pacing of the animations, the decimation of the trajectories to pixel
 * columns, the theoretical envelope, the plotted domain, the lattice-aligned
 * histograms drawn beside the trajectories, the readouts against theory, the
 * exact law of Sₙ/√n drawn by the central limit panel, and the geometry of its
 * ridgeline of laws.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NORMALIZATIONS,
  berryEsseenBound,
  dkwRadius,
  empiricalExceedance,
  exactExceedance,
  exactKolmogorovDistance,
  incrementLaw,
  kolmogorovDistance,
  normalizeScores,
  sampleMoments,
  scoreMoments,
  simulateScores,
  simulateTrajectories,
  standardNormalCdf,
} from '../src/lib/penetration.js';
import {
  CLT_N_STOPS,
  CLT_PLAYLIST,
  DEFAULT_P,
  DEFAULT_SEED,
  SIM_M_STOPS,
  SIM_N_STOPS,
  cltExactLaw,
  cltReadout,
  cltSampleBins,
  cltSummary,
  easeOut,
  envelopeOnGrid,
  formatNumber,
  frontAt,
  histogramGroup,
  latticeHistogram,
  lerpInto,
  nearestStop,
  niceTicks,
  parseMountOptions,
  parseSeed,
  playDuration,
  pointsUpTo,
  quantityDomain,
  ridgeGeometry,
  scoresAt,
  simulatorLayout,
  simulatorReadout,
  simulatorSummary,
  stepDensity,
  trajectoryAlpha,
  trajectoryGrid,
  decimatePaths,
} from '../src/hw04/model.js';

const BERNOULLI = incrementLaw('bernoulli', { p: 0.3 });
const RADEMACHER = incrementLaw('rademacher');
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

/* ------------------------------------------------------------ mount point */

test('parseMountOptions reads data-seed and data-p as plain numbers', () => {
  assert.deepEqual(parseMountOptions({ seed: '12345', p: '0.25' }), { seed: 12345, p: 0.25 });
  assert.deepEqual(parseMountOptions({ seed: ' 4294967295 ', p: '0.5' }), { seed: 4294967295, p: 0.5 });
});

test('parseMountOptions falls back to the defaults when an attribute is absent or unusable', () => {
  assert.deepEqual(parseMountOptions({}), { seed: DEFAULT_SEED, p: DEFAULT_P });
  assert.deepEqual(parseMountOptions({ seed: 'abc', p: 'x' }), { seed: DEFAULT_SEED, p: DEFAULT_P });
  assert.deepEqual(parseMountOptions({ seed: '-3', p: '' }), { seed: DEFAULT_SEED, p: DEFAULT_P });
  assert.deepEqual(parseMountOptions({ seed: '1.5' }), { seed: DEFAULT_SEED, p: DEFAULT_P });
  assert.deepEqual(parseMountOptions({ seed: '4294967296' }), { seed: DEFAULT_SEED, p: DEFAULT_P });
  assert.ok(Number.isInteger(DEFAULT_SEED) && DEFAULT_SEED >= 0 && DEFAULT_SEED < 2 ** 32);
  assert.ok(DEFAULT_P > 0 && DEFAULT_P < 1);
});

test('parseMountOptions clamps p to the range of the control, 0.01 to 0.99', () => {
  assert.equal(parseMountOptions({ p: '0' }).p, 0.01);
  assert.equal(parseMountOptions({ p: '1' }).p, 0.99);
  assert.equal(parseMountOptions({ p: '0.123' }).p, 0.12);
});

test('parseSeed accepts the whole numbers 0 to 4294967295 and names the fix otherwise', () => {
  assert.deepEqual(parseSeed(' 0 '), { ok: true, seed: 0 });
  assert.deepEqual(parseSeed('4294967295'), { ok: true, seed: 4294967295 });
  for (const bad of ['', '-1', '2.5', 'seed', '4294967296', '1e3']) {
    const r = parseSeed(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.message, /0 to 4294967295/);
  }
});

/* ----------------------------------------------------------------- scales */

test('the scales of n and m are increasing, log-like and within the stated ranges', () => {
  for (const [stops, lo, hi] of [
    [SIM_N_STOPS, 10, 5000],
    [SIM_M_STOPS, 1, 500],
    [CLT_N_STOPS, 1, 2048],
  ]) {
    assert.equal(stops[0], lo);
    assert.equal(stops.at(-1), hi);
    for (let i = 1; i < stops.length; i += 1) {
      assert.ok(stops[i] > stops[i - 1]);
      assert.ok(stops[i] / stops[i - 1] <= 2.01, `${stops[i - 1]} → ${stops[i]}`);
    }
  }
  assert.deepEqual(CLT_PLAYLIST, [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]);
  for (const n of CLT_PLAYLIST) assert.ok(CLT_N_STOPS.includes(n), `${n} is a stop of the n scale`);
  // m·n of the largest simulation stays far below the period of the generator
  assert.ok(SIM_N_STOPS.at(-1) * SIM_M_STOPS.at(-1) <= 2_500_000);
});

test('nearestStop finds the stop closest on a logarithmic scale', () => {
  assert.equal(nearestStop(SIM_N_STOPS, 1000), SIM_N_STOPS.indexOf(1000));
  assert.equal(nearestStop(SIM_N_STOPS, 1), 0);
  assert.equal(nearestStop(SIM_N_STOPS, 1e9), SIM_N_STOPS.length - 1);
  assert.equal(SIM_N_STOPS[nearestStop(SIM_N_STOPS, 1100)], 1000);
  assert.equal(SIM_N_STOPS[nearestStop(SIM_N_STOPS, 1300)], 1500);
});

/* ----------------------------------------------------------------- motion */

test('easeOut runs from 0 to 1, increasing, and decelerates', () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeOut(-1), 0);
  assert.equal(easeOut(2), 1);
  let prev = 0;
  for (let x = 0.05; x <= 1; x += 0.05) {
    const y = easeOut(x);
    assert.ok(y >= prev && y >= x - 1e-12);
    prev = y;
  }
});

test('playDuration grows with n and stays between 2 and 6 seconds', () => {
  assert.ok(SIM_N_STOPS.length > 0);
  let prev = 0;
  for (const n of SIM_N_STOPS) {
    const d = playDuration(n);
    assert.ok(d >= 2000 && d <= 6000, `${n}: ${d}`);
    assert.ok(d > prev);
    prev = d;
  }
});

test('frontAt advances the attackers at a constant pace from system 0 to system n', () => {
  assert.equal(frontAt(0, 4000, 1000), 0);
  assert.equal(frontAt(1000, 4000, 1000), 250);
  assert.equal(frontAt(4000, 4000, 1000), 1000);
  assert.equal(frontAt(9000, 4000, 1000), 1000);
  assert.equal(frontAt(-5, 4000, 1000), 0);
});

test('trajectoryAlpha is opaque for a few attackers and fades as m grows, never below 0.06', () => {
  assert.equal(trajectoryAlpha(1), 1);
  assert.equal(trajectoryAlpha(4), 1);
  let prev = 1;
  for (const m of SIM_M_STOPS) {
    const a = trajectoryAlpha(m);
    assert.ok(a <= prev && a >= 0.06);
    prev = a;
  }
});

test('lerpInto interpolates two arrays into a third', () => {
  const out = new Float32Array(3);
  lerpInto(out, Float32Array.of(0, 10, -4), Float32Array.of(10, 10, 4), 0.25);
  assert.deepEqual([...out], [2.5, 10, -2]);
  lerpInto(out, Float32Array.of(1, 2, 3), Float32Array.of(7, 8, 9), 1);
  assert.deepEqual([...out], [7, 8, 9]);
});

/* ------------------------------------------------------------ trajectories */

test('trajectoryGrid keeps every step when n fits in the pixel columns', () => {
  const g = trajectoryGrid(10, 600);
  assert.equal(g.perColumn, false);
  assert.equal(g.points, 10);
  assert.deepEqual([...g.xs], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('trajectoryGrid cuts steps 1…n into disjoint, contiguous columns of two points each', () => {
  const n = 5000;
  const columns = 640;
  const g = trajectoryGrid(n, columns);
  assert.equal(g.perColumn, true);
  assert.equal(g.points, 2 * columns);
  assert.equal(g.ranges.length, 2 * columns);
  assert.equal(g.ranges[0], 1);
  assert.equal(g.ranges.at(-1), n);
  for (let c = 0; c < columns; c += 1) {
    const k0 = g.ranges[2 * c];
    const k1 = g.ranges[2 * c + 1];
    assert.ok(k1 >= k0);
    if (c > 0) assert.equal(k0, g.ranges[2 * c - 1] + 1);
    assert.equal(g.xs[2 * c], (k0 + k1) / 2);
    assert.equal(g.xs[2 * c + 1], (k0 + k1) / 2);
  }
});

test('decimatePaths gives the exact quantity at every step when nothing is cut', () => {
  const paths = simulateTrajectories({ law: BERNOULLI, n: 12, m: 3, seed: 7 });
  const g = trajectoryGrid(12, 400);
  for (const id of Object.keys(NORMALIZATIONS)) {
    const ys = decimatePaths(paths, g, id);
    assert.equal(ys.length, 3 * 12);
    for (let j = 0; j < 3; j += 1) {
      for (let k = 1; k <= 12; k += 1) close(ys[j * 12 + k - 1], paths[j][k] / NORMALIZATIONS[id].divisor(k), 1e-5);
    }
  }
});

test('decimatePaths keeps the minimum and the maximum of every column, in the order they occur', () => {
  const n = 3000;
  const paths = simulateTrajectories({ law: RADEMACHER, n, m: 4, seed: 11 });
  const g = trajectoryGrid(n, 250);
  for (const id of Object.keys(NORMALIZATIONS)) {
    const ys = decimatePaths(paths, g, id);
    const { divisor } = NORMALIZATIONS[id];
    for (let j = 0; j < 4; j += 1) {
      for (let c = 0; c < 250; c += 1) {
        let lo = Infinity;
        let hi = -Infinity;
        let iLo = 0;
        let iHi = 0;
        for (let k = g.ranges[2 * c]; k <= g.ranges[2 * c + 1]; k += 1) {
          const v = paths[j][k] / divisor(k);
          if (v < lo) [lo, iLo] = [v, k];
          if (v > hi) [hi, iHi] = [v, k];
        }
        const a = ys[j * g.points + 2 * c];
        const b = ys[j * g.points + 2 * c + 1];
        const [first, second] = iLo <= iHi ? [lo, hi] : [hi, lo];
        close(a, first, 1e-5);
        close(b, second, 1e-5);
      }
    }
  }
});

test('pointsUpTo counts the grid points reached by the front', () => {
  const g = trajectoryGrid(10, 600);
  assert.equal(pointsUpTo(g, 0), 0);
  assert.equal(pointsUpTo(g, 0.99), 0);
  assert.equal(pointsUpTo(g, 1), 1);
  assert.equal(pointsUpTo(g, 4.5), 4);
  assert.equal(pointsUpTo(g, 10), 10);
  const h = trajectoryGrid(5000, 100);
  assert.equal(pointsUpTo(h, 5000), 200);
  assert.equal(pointsUpTo(h, h.xs[9]), 10);
});

test('scoresAt reads the total score of every attacker after k systems', () => {
  const paths = simulateTrajectories({ law: BERNOULLI, n: 50, m: 6, seed: 3 });
  const s = scoresAt(paths, 20);
  assert.ok(s instanceof Int32Array);
  assert.deepEqual([...s], paths.map((p) => p[20]));
  // the same stream as simulateScores at the last checkpoint
  const { scores } = simulateScores({ law: BERNOULLI, checkpoints: [50], m: 6, seed: 3 });
  assert.deepEqual([...scoresAt(paths, 50)], [...scores[0]]);
});

/* ------------------------------------------------------------------ theory */

test('envelopeOnGrid is the theoretical mean ± z standard deviations of the chosen quantity', () => {
  const xs = Float64Array.of(1, 10, 100, 1000);
  for (const id of Object.keys(NORMALIZATIONS)) {
    const env = envelopeOnGrid(BERNOULLI, id, xs, 2);
    xs.forEach((k, i) => {
      const { mean, sd } = scoreMoments(BERNOULLI, k)[id];
      close(env.mean[i], mean, 1e-9);
      close(env.lo[i], mean - 2 * sd, 1e-9);
      close(env.hi[i], mean + 2 * sd, 1e-9);
    });
  }
  // the spread of the three quantities: grows as √k, decays as 1/√k, stays constant
  const total = envelopeOnGrid(RADEMACHER, 'total', xs, 2);
  const average = envelopeOnGrid(RADEMACHER, 'average', xs, 2);
  const normalized = envelopeOnGrid(RADEMACHER, 'normalized', xs, 2);
  close(total.hi[3] / total.hi[1], 10, 1e-9);
  close(average.hi[1] / average.hi[3], 10, 1e-9);
  close(normalized.hi[0], normalized.hi[3], 1e-9);
});

test('quantityDomain is the support for Sₙ/n and covers data, envelope and 0 otherwise', () => {
  assert.deepEqual(quantityDomain({ law: BERNOULLI, normalization: 'average', observed: [0.1, 0.9], envelope: { lo: [0], hi: [1] } }), [0, 1]);
  assert.deepEqual(quantityDomain({ law: RADEMACHER, normalization: 'average', observed: [-1, 1], envelope: { lo: [-1], hi: [1] } }), [-1, 1]);
  const [lo, hi] = quantityDomain({
    law: RADEMACHER,
    normalization: 'total',
    observed: [-80, 95],
    envelope: { lo: Float64Array.of(-2, -63), hi: Float64Array.of(2, 63) },
  });
  assert.ok(lo < -80 && hi > 95);
  assert.ok(hi - lo < 1.2 * 175);
  const [lo2, hi2] = quantityDomain({
    law: BERNOULLI,
    normalization: 'normalized',
    observed: [3, 20],
    envelope: { lo: Float64Array.of(4), hi: Float64Array.of(19) },
  });
  assert.ok(lo2 <= 0 && hi2 > 20);
});

/* -------------------------------------------------------------- histograms */

test('histogramGroup merges lattice values so that bars are tall enough and not too many', () => {
  assert.equal(histogramGroup({ kSpan: 10, m: 500, pxPerK: 12 }), 1);
  // at least 3 pixels per bar
  assert.equal(histogramGroup({ kSpan: 10, m: 500, pxPerK: 0.5 }), 6);
  // at most about 2·m^(1/3) bars over the observed range (Rice's rule)
  const g = histogramGroup({ kSpan: 400, m: 125, pxPerK: 50 });
  assert.equal(g, 40);
  for (const args of [{ kSpan: 1, m: 1, pxPerK: 100 }, { kSpan: 4000, m: 500, pxPerK: 0.01 }]) {
    const k = histogramGroup(args);
    assert.ok(Number.isInteger(k) && k >= 1);
  }
});

test('latticeHistogram bins whole lattice points, counts every attacker once and integrates to 1', () => {
  for (const [law, normalization] of [
    [BERNOULLI, 'total'],
    [BERNOULLI, 'average'],
    [RADEMACHER, 'normalized'],
    [RADEMACHER, 'total'],
  ]) {
    const k = 400;
    const paths = simulateTrajectories({ law, n: k, m: 200, seed: 21 });
    const scores = scoresAt(paths, k);
    for (const group of [1, 3, 7]) {
      const h = latticeHistogram(scores, { law, k, normalization, group });
      assert.equal(h.bins.reduce((s, b) => s + b.count, 0), 200);
      close(h.bins.reduce((s, b) => s + b.density * (b.hi - b.lo), 0), 1, 1e-9);
      for (let i = 1; i < h.bins.length; i += 1) close(h.bins[i].lo, h.bins[i - 1].hi, 1e-9);
      const values = normalizeScores(scores, k, normalization);
      for (const v of values) {
        const hits = h.bins.filter((b) => v >= b.lo && v < b.hi);
        assert.equal(hits.length, 1);
      }
      // each bin holds exactly `group` lattice points: its width is group × the lattice spacing
      const spacing = (law.high - law.low) / NORMALIZATIONS[normalization].divisor(k);
      for (const b of h.bins) close(b.hi - b.lo, group * spacing, 1e-9);
    }
  }
});

/* ------------------------------------------------------------------ format */

test('formatNumber prints values with four significant figures, a true minus and powers of ten', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(0.30123), '0.3012');
  assert.equal(formatNumber(-0.30123), '−0.3012');
  assert.equal(formatNumber(1250.44), '1,250');
  assert.equal(formatNumber(3), '3');
  assert.equal(formatNumber(0.00021), '2.1 × 10⁻⁴');
  assert.equal(formatNumber(-0.000012346), '−1.235 × 10⁻⁵');
  assert.equal(formatNumber(123456), '1.235 × 10⁵');
  assert.equal(formatNumber(Number.NaN), '—');
  assert.equal(formatNumber(Infinity), '—');
  assert.equal(formatNumber(0.5, 2), '0.5');
});

test('niceTicks are round values inside the range, about the number asked for', () => {
  assert.deepEqual(niceTicks(0, 1000, 5), [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(niceTicks(-1, 1, 4), [-1, -0.5, 0, 0.5, 1]);
  const t = niceTicks(-3.7, 41.2, 5);
  assert.ok(t.length >= 3 && t.length <= 8);
  for (const v of t) assert.ok(v >= -3.7 && v <= 41.2);
  assert.deepEqual(niceTicks(2, 2, 5), [2]);
});

/* ----------------------------------------------------------------- layout */

test('simulatorLayout puts the plot and the two sideways histograms side by side without overlap', () => {
  for (const width of [320, 360, 640, 1100]) {
    const { plot, strips } = simulatorLayout(width, 320);
    assert.equal(strips.length, 2);
    assert.ok(plot.x > 0 && plot.w > 150, `${width}: plot ${plot.w}`);
    assert.ok(strips[0].x >= plot.x + plot.w);
    assert.ok(strips[1].x >= strips[0].x + strips[0].w);
    assert.ok(strips[1].x + strips[1].w <= width);
    assert.ok(strips[0].w >= 40);
    assert.ok(plot.y > 0 && plot.y + plot.h < 320);
  }
});

/* ---------------------------------------------------------------- readouts */

test('simulatorReadout sets the simulated mean and variance at t and at n against theory', () => {
  const law = BERNOULLI;
  const n = 600;
  const t = 150;
  const paths = simulateTrajectories({ law, n, m: 80, seed: 5 });
  for (const normalization of Object.keys(NORMALIZATIONS)) {
    const r = simulatorReadout({ law, paths, n, t, normalization, eps: 0.05 });
    assert.deepEqual(r.steps, [t, n]);
    const [mean, variance, exceed] = r.rows;
    assert.equal(mean.id, 'mean');
    assert.equal(variance.id, 'variance');
    assert.equal(exceed.id, 'exceedance');
    [t, n].forEach((k, i) => {
      const sim = sampleMoments(normalizeScores(scoresAt(paths, k), k, normalization));
      const th = scoreMoments(law, k)[normalization];
      close(mean.cells[i].simulated, sim.mean);
      close(mean.cells[i].theory, th.mean);
      close(variance.cells[i].simulated, sim.variance);
      close(variance.cells[i].theory, th.variance);
      // the law of large numbers row speaks of Sₖ/k whatever quantity is drawn
      close(exceed.cells[i].simulated, empiricalExceedance(scoresAt(paths, k), law, k, 0.05));
      close(exceed.cells[i].theory, exactExceedance(law, k, 0.05));
    });
  }
});

test('simulatorReadout has no sample variance with a single attacker', () => {
  const paths = simulateTrajectories({ law: RADEMACHER, n: 50, m: 1, seed: 9 });
  const r = simulatorReadout({ law: RADEMACHER, paths, n: 50, t: 10, normalization: 'total', eps: 0.1 });
  assert.ok(Number.isNaN(r.rows[1].cells[0].simulated));
  assert.equal(r.rows[1].cells[0].theory, 10);
});

test('simulatorSummary states the parameters and the readout at n in words', () => {
  const law = RADEMACHER;
  const paths = simulateTrajectories({ law, n: 1000, m: 100, seed: 2 });
  const readout = simulatorReadout({ law, paths, n: 1000, t: 250, normalization: 'average', eps: 0.05 });
  const text = simulatorSummary({ law, n: 1000, m: 100, t: 250, normalization: 'average', eps: 0.05, seed: 2 }, readout);
  assert.match(text, /Rademacher/);
  assert.match(text, /100 attackers/);
  assert.match(text, /1,000 systems/);
  assert.match(text, /Sₙ\/n/);
  assert.match(text, /seed 2/);
  assert.ok(text.includes(formatNumber(readout.rows[0].cells[1].simulated)));
  const bern = simulatorSummary(
    { law: BERNOULLI, n: 1000, m: 100, t: 250, normalization: 'total', eps: 0.05, seed: 2 },
    simulatorReadout({ law: BERNOULLI, paths: simulateTrajectories({ law: BERNOULLI, n: 1000, m: 100, seed: 2 }), n: 1000, t: 250, normalization: 'total', eps: 0.05 }),
  );
  assert.match(bern, /Bernoulli, p = 0\.3/);
});

/* -------------------------------------------------------------------- CLT */

test('cltExactLaw is the law of Sₙ/√n on its lattice of spacing 2/√n, rescaled to a density', () => {
  const one = cltExactLaw(1);
  assert.deepEqual([...one.z], [-1, 1]);
  one.density.forEach((d) => close(d, 0.25)); // binomialPmf goes through lnGamma: exact to rounding
  assert.equal(one.spacing, 2);
  for (const n of [2, 7, 64, 1000]) {
    const law = cltExactLaw(n);
    close(law.spacing, 2 / Math.sqrt(n));
    assert.equal(law.z.length, n + 1);
    close(law.density.reduce((s, d) => s + d * law.spacing, 0), 1, 1e-9);
    for (let k = 0; k <= n; k += 1) {
      close(law.z[k], (2 * k - n) / Math.sqrt(n), 1e-12);
      close(law.density[k], law.density[n - k], 1e-12);
    }
  }
});

test('stepDensity reads the staircase of bars centred on the lattice points', () => {
  const law = cltExactLaw(1);
  const d = stepDensity(law, Float64Array.of(-3, -1.5, -1, -0.001, 0, 0.5, 1.999, 2, 3));
  [0, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0, 0].forEach((v, i) => close(d[i], v));
  const four = cltExactLaw(4); // z = −2, −1, 0, 1, 2 with spacing 1
  const e = stepDensity(four, Float64Array.of(0, 0.49, 0.51, -2.4, -2.6));
  close(e[0], 6 / 16);
  close(e[1], 6 / 16);
  close(e[2], 4 / 16);
  close(e[3], 1 / 16);
  assert.equal(e[4], 0);
});

test('cltSampleBins groups the simulated Sₙ/√n on its lattice like the simulator histograms', () => {
  for (const [n, m, pxPerUnit] of [[16, 1000, 70], [1024, 1000, 70], [64, 200, 400]]) {
    const { scores } = simulateScores({ law: RADEMACHER, checkpoints: [n], m, seed: 13 });
    const bins = cltSampleBins(scores[0], n, pxPerUnit);
    const spacing = 2 / Math.sqrt(n);
    const values = [...scores[0]];
    const kSpan = (Math.max(...values) - Math.min(...values)) / 2 + 1;
    const group = histogramGroup({ kSpan, m, pxPerK: pxPerUnit * spacing });
    const expected = latticeHistogram(scores[0], { law: RADEMACHER, k: n, normalization: 'normalized', group });
    assert.equal(bins.length, expected.bins.length);
    bins.forEach((b, i) => {
      close(b.z, (expected.bins[i].lo + expected.bins[i].hi) / 2);
      close(b.density, expected.bins[i].density);
    });
    assert.equal(bins.reduce((t, b) => t + b.count, 0), m);
    close(bins.reduce((t, b) => t + b.density * group * spacing, 0), 1, 1e-9);
  }
  // with a fine lattice and 1,000 attackers the bars hold several lattice values each
  const { scores } = simulateScores({ law: RADEMACHER, checkpoints: [1024], m: 1000, seed: 13 });
  const bins = cltSampleBins(scores[0], 1024, 70);
  assert.ok(bins.length <= 24, `${bins.length} bins`);
});

test('cltReadout reports the exact Kolmogorov distance, its Berry–Esseen bound and the sample against N(0, 1)', () => {
  for (const n of [1, 16, 1024]) {
    const r = cltReadout(n);
    close(r.distance, exactKolmogorovDistance(RADEMACHER, n));
    close(r.bound, berryEsseenBound(RADEMACHER, n));
    close(r.scaled, Math.sqrt(n) * r.distance);
    close(r.spacing, 2 / Math.sqrt(n));
    assert.ok(r.distance <= r.bound);
    assert.equal(r.sample, null);
  }
  const n = 256;
  const { scores } = simulateScores({ law: RADEMACHER, checkpoints: [n], m: 1000, seed: 4 });
  const r = cltReadout(n, scores[0]);
  close(r.sample.distance, kolmogorovDistance(normalizeScores(scores[0], n, 'normalized'), standardNormalCdf));
  close(r.sample.dkw, dkwRadius(1000));
  assert.equal(r.sample.m, 1000);
  // √n·Dₙ tends to 1/√(2π) for the Rademacher lattice: the rate 1/√n is attained
  close(cltReadout(1024).scaled, 1 / Math.sqrt(2 * Math.PI), 0.01);
});

test('cltSummary states n, the distance and the bound in words', () => {
  const text = cltSummary(cltReadout(16));
  assert.match(text, /n = 16/);
  assert.match(text, /Kolmogorov distance/);
  assert.match(text, /Berry–Esseen bound/);
  assert.ok(text.includes(formatNumber(cltReadout(16).distance)));
});

test('ridgeGeometry stacks the laws from the back (n = 1) to the front (the normal limit)', () => {
  const box = { width: 600, height: 240 };
  const count = CLT_PLAYLIST.length + 1;
  let prev = null;
  for (let i = 0; i < count; i += 1) {
    const g = ridgeGeometry(i, count, box);
    assert.ok(g.x0 >= 0 && g.x1 <= box.width && g.x1 > g.x0);
    assert.ok(g.base <= box.height && g.base - g.amp >= 0);
    if (prev) {
      assert.ok(g.base > prev.base, 'nearer ridges sit lower');
      assert.ok(g.x1 - g.x0 >= prev.x1 - prev.x0, 'and are not narrower');
    }
    prev = g;
  }
});

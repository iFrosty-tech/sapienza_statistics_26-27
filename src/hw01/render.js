/**
 * Composition of the homework figures from experiment data: which chart each
 * experiment becomes, the statistics quoted in its caption, and the markup
 * of a "series" (one hash function) inside a figure. Shared by the build-time
 * provider (homework/01/figures.js) and the page script, so a figure redrawn
 * in the browser is the same figure the build printed.
 */

import {
  escapeXml,
  renderCollisionCurve,
  renderCurveScatter,
  renderHeatMap,
  renderHistogram,
  renderLogLog,
  renderNakamoto,
  renderZStrip,
} from '../lib/charts.js';
import { modelFromSample } from '../lib/normal.js';
import { formatNumber, renderProbabilityPlotSVG } from '../lib/probability-plot.js';
import { attackerSuccessProbability, binomialPmfTable, collisionProbability } from '../lib/stats.js';

/** The hash functions compared, in display order. */
export const SERIES = Object.freeze(['scalar', 'pedersen', 'sha256']);
export const SERIES_LABEL = Object.freeze({
  scalar: 'Toy hash, scalar variant',
  pedersen: 'Toy hash, Pedersen variant',
  sha256: 'SHA-256',
});

/** Figure kinds that carry one chart per hash function. */
export const SERIES_KINDS = Object.freeze(['bitFrequency', 'byteFrequency', 'hammingWeight', 'avalanche', 'sac', 'runs', 'collisions']);

/** p-values as printed in the captions. */
export function formatP(p) {
  if (!Number.isFinite(p)) return 'n/a';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

const fmt = (v, d = 2) => (Number.isFinite(v) ? formatNumber(v, d) : 'n/a');
const int = (v) => String(Math.round(v));

function heightFor(kind, width) {
  const ratio = { paper: 0.52, zstrip: 0.34, histogram: 0.42, collision: 0.42, scatter: 0.72, nakamoto: 0.44 }[kind] ?? 0.42;
  const h = width * ratio;
  return Math.round(Math.min(kind === 'scatter' ? 640 : 480, Math.max(kind === 'zstrip' ? 220 : 260, h)));
}

function binomialBins(counts, { from, to, total, n = 256, p = 0.5 }) {
  const pmf = binomialPmfTable(n, p);
  const bins = [];
  for (let k = from; k <= to; k += 1) bins.push({ label: String(k), observed: counts[k] ?? 0, expected: total * pmf[k] });
  return bins;
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Probability that a Bin(trials, ½) count lies more than `threshold` standard
 * deviations from its mean. The cell counts of the strict-avalanche matrix are
 * discrete, so this exact tail, not the normal 5%, is the expected proportion
 * of cells flagged as "|z| > 1.96" (5.95% for 48 trials, 7.03% for 8).
 * @param {number} trials
 * @param {number} threshold in standard deviations
 */
export function exactTwoSidedTail(trials, threshold = 1.96) {
  const pmf = binomialPmfTable(trials, 0.5);
  const sd = Math.sqrt(trials / 4);
  let tail = 0;
  for (let k = 0; k <= trials; k += 1) if (Math.abs(k - trials / 2) / sd > threshold) tail += pmf[k];
  return tail;
}

/* ------------------------------------------------------------- charts */

/**
 * The chart area of a figure for one experiment result.
 * @param {string} kind
 * @param {object} data experiment result (full or compacted)
 * @param {{ id: string, width?: number, rasterize?: Function }} options
 * @returns {string} HTML
 */
export function renderChart(kind, data, { id, width = 960, rasterize } = {}) {
  const label = SERIES_LABEL[data.variant] ?? data.variant ?? '';
  switch (kind) {
    case 'bitFrequency': {
      const model = modelFromSample(data.z, {
        seed: data.seed,
        label: 'standardised bit frequencies',
        title: `Normal probability plot of the 256 standardised bit frequencies, ${label}`,
        description:
          'Each point is the z-score of one output bit position over the sample of digests; under the null hypothesis the points follow the straight line of slope one through the origin.',
      });
      const paper = renderProbabilityPlotSVG(model, { width, height: heightFor('paper', width), id: `${id}-paper`, xLabel: 'z-score of the bit frequency' });
      const strip = renderZStrip({
        id: `${id}-strip`,
        title: `z-score of the frequency of ones at each of the 256 output bit positions, ${label}`,
        desc: `Lollipops above or below the ±1.96 band are the positions whose frequency of ones departs from one half at the 5% level; ${data.beyondTwoSigma ?? '—'} of 256 do, against 12.8 expected.`,
        z: data.z,
        width,
        height: heightFor('zstrip', width),
      });
      return `<div class="chart-figure__panel chart-figure__panel--paper">${paper}</div><div class="chart-figure__panel">${strip}</div>`;
    }
    case 'byteFrequency': {
      const bins = data.counts.map((observed, v) => ({ label: String(v), observed, expected: data.expectedPerValue }));
      return renderHistogram({
        id,
        title: `Frequency of the 256 byte values over ${data.n} digests, ${label}`,
        desc: `Bars are observed counts per byte value; the flat step is the expected count ${fmt(data.expectedPerValue, 1)} under uniformity.`,
        bins,
        width,
        height: heightFor('histogram', width),
        xLabel: 'Byte value',
        yLabel: 'Count',
        labelEvery: 32,
      });
    }
    case 'hammingWeight':
    case 'avalanche': {
      const total = sum(data.counts);
      const bins = binomialBins(data.counts, { from: 88, to: 168, total });
      const isWeight = kind === 'hammingWeight';
      return renderHistogram({
        id,
        title: isWeight
          ? `Hamming weight of ${total} digests against the binomial law Bin(256, ½), ${label}`
          : `Hamming distance between the digests of ${total} message pairs differing in one bit, against Bin(256, ½), ${label}`,
        desc: `Bars are observed counts for each value from 88 to 168; the step line is the expected count under Bin(256, ½), mean 128 and standard deviation 8.`,
        bins,
        width,
        height: heightFor('histogram', width),
        xLabel: isWeight ? 'Number of ones in the digest' : 'Number of output bits changed',
        yLabel: 'Count',
        labelEvery: 8,
      });
    }
    case 'sac': {
      const rows = data.inputBits;
      const cols = 256;
      const map = renderHeatMap({
        id: `${id}-map`,
        rows,
        cols,
        flips: data.flips,
        trials: data.trials,
        rasterize,
        alt: `Heat map of the strict-avalanche matrix for ${label}: ${rows} input bits by 256 output bits, each cell the proportion of ${data.trials} trials in which the output bit changed; mean ${fmt(data.mean, 3)}, range ${fmt(data.min, 2)} to ${fmt(data.max, 2)}.`,
      });
      const counts = new Array(data.trials + 1).fill(0);
      for (const f of data.flips) counts[f] += 1;
      // The histogram sits beside the map above 52rem (a 1.2fr : 1fr grid) and below it otherwise.
      const histWidth = width < 832 ? width : Math.round((width - 24) / 2.2);
      const hist = renderHistogram({
        id: `${id}-hist`,
        title: `Distribution of the ${rows * cols} cell counts of the strict-avalanche matrix, ${label}`,
        desc: `Bars are the number of cells with each flip count out of ${data.trials} trials; the step is the expectation under Bin(${data.trials}, ½).`,
        bins: binomialBins(counts, { from: 0, to: data.trials, total: rows * cols, n: data.trials }),
        width: histWidth,
        height: Math.round(Math.max(260, histWidth * 0.7)),
        xLabel: `Flips out of ${data.trials} trials`,
        yLabel: 'Cells',
        labelEvery: data.trials >= 24 ? 8 : 2,
      });
      return `<div class="sac"><div class="sac__map">${map}</div><div class="sac__hist">${hist}</div></div>`;
    }
    case 'runs': {
      const expected = data.expectedPValueHistogram ?? new Array(10).fill(data.applicable / 10);
      const bins = data.pValueHistogram.map((observed, k) => ({ label: `${(k / 10).toFixed(1)}–${((k + 1) / 10).toFixed(1)}`, observed, expected: expected[k] }));
      return renderHistogram({
        id,
        title: `Distribution of the runs-test p-values of ${data.applicable} digests, ${label}`,
        desc: 'Bars count digests whose runs-test p-value falls in each decile; the step is the exact distribution of the p-value for 256-bit strings of independent fair bits, which is not flat because the number of runs is a discrete statistic.',
        bins,
        width,
        height: heightFor('histogram', width),
        xLabel: 'Runs-test p-value',
        yLabel: 'Digests',
      });
    }
    case 'collisions': {
      const { curve, n } = data;
      const space = 2 ** curve.bits;
      const theory = [];
      const step = Math.max(1, Math.round(n / 160));
      for (let m = 0; m <= n; m += step) theory.push({ m, p: collisionProbability(m, space, { exact: true }) });
      if (theory.at(-1).m !== n) theory.push({ m: n, p: collisionProbability(n, space, { exact: true }) });
      let halfPoint = null;
      for (let m = 2; m <= n; m += 1) {
        if (collisionProbability(m, space, { exact: true }) >= 0.5) {
          halfPoint = m;
          break;
        }
      }
      return renderCollisionCurve({
        id,
        title: `Probability of at least one collision among m digests truncated to ${curve.bits} bits, ${label}`,
        desc: `The line is the exact birthday probability for a space of 2^${curve.bits} values; the points are the proportion of ${curve.subsets} random subsets of size m, drawn from ${n} digests, that contained a repeat, with 95% error bars.`,
        points: curve.points,
        theory,
        subsets: curve.subsets,
        halfPoint,
        width,
        height: heightFor('collision', width),
        xLabel: 'Sample size m',
        yLabel: 'P(at least one collision)',
      });
    }
    case 'ecdlp': {
      const series = [
        { key: 'bsgs', label: 'Baby-step giant-step', points: data.rows.map((r) => ({ x: r.baseOrder, y: r.meanBsgsSteps })) },
        { key: 'brute', label: 'Exhaustive search', points: data.rows.map((r) => ({ x: r.baseOrder, y: r.meanBruteForceSteps })) },
      ];
      return renderLogLog({
        id,
        title: 'Point operations needed to solve the discrete logarithm against the order of the group, on log₂ axes',
        desc: 'Filled points are the mean cost of baby-step giant-step over random challenges, open points the mean cost of exhaustive search, on curves y² = x³ + 7 over primes from 2^7 to 2^14; the dashed references are √n and n/2, and the right panel extends them to the order of secp256k1, 2^256, where √n is 2^128.',
        series,
        references: [
          { label: '√n', exponent: 0.5 },
          { label: 'n / 2', exponent: 1, factor: 0.5 },
        ],
        marks: data.marks,
        width,
        xLabel: 'Group order n',
        yLabel: 'Point operations',
      });
    }
    case 'smallCurve':
      return renderCurveScatter({
        id,
        title: `All ${data.points.length} affine points of y² = x³ + 7 over the field of ${data.p} elements`,
        desc: `The points show no visible pattern apart from the mirror symmetry about y = p/2, since −(x, y) = (x, p − y). With the point at infinity the group has order ${data.order}.`,
        p: data.p,
        points: data.points,
        width,
        height: heightFor('scatter', width),
      });
    case 'nakamoto': {
      const curves = data.qs.map((q) => ({
        q,
        label: `q = ${q}`,
        values: Array.from({ length: data.zMax + 1 }, (_, z) => ({ z, p: attackerSuccessProbability(q, z) })),
      }));
      return renderNakamoto({
        id,
        title: 'Probability that an attacker overtakes the honest chain, against the number of confirmations, for several shares of the hash rate',
        desc: `Each curve is Nakamoto's catch-up probability for an attacker holding the fraction q of the hash rate; the dotted ruling marks z = ${data.markZ} confirmations.`,
        curves,
        markZ: data.markZ,
        width,
        height: heightFor('nakamoto', width),
      });
    }
    default:
      throw new Error(`renderChart: unknown kind "${kind}"`);
  }
}

/* -------------------------------------------------------------- stats */

/** The statistics a figure caption quotes, as display strings. */
export function statsOf(kind, data) {
  const base = { series: SERIES_LABEL[data.variant] ?? '', seed: String(data.seed ?? '') };
  switch (kind) {
    case 'bitFrequency': {
      const model = modelFromSample(data.z);
      return {
        ...base,
        n: int(data.n),
        bits: int(data.totalBits),
        onesFraction: fmt(data.onesFraction, 4),
        monobitP: formatP(data.monobitP),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
        maxAbsZ: fmt(data.maxAbsZ, 2),
        beyondTwoSigma: int(data.beyondTwoSigma),
        expectedBeyondTwoSigma: fmt(data.expectedBeyondTwoSigma, 1),
        slope: fmt(model.fit.slope, 3),
        intercept: fmt(model.fit.intercept, 3),
        r: fmt(model.fit.r, 4),
        sd: fmt(model.sd, 3),
      };
    }
    case 'byteFrequency':
      return {
        ...base,
        n: int(data.n),
        bytes: int(32 * data.n),
        expected: fmt(data.expectedPerValue, 1),
        min: int(data.min),
        max: int(data.max),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
      };
    case 'hammingWeight':
      return { ...base, n: int(data.n), mean: fmt(data.mean, 2), sd: fmt(data.sd, 2), statistic: fmt(data.statistic, 1), df: int(data.df), p: formatP(data.p) };
    case 'avalanche':
      return {
        ...base,
        n: int(data.pairs),
        mean: fmt(data.mean, 2),
        sd: fmt(data.sd, 2),
        unchanged: int(data.unchanged),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
      };
    case 'sac':
      return {
        ...base,
        trials: int(data.trials),
        inputBits: int(data.inputBits),
        cells: int(data.inputBits * 256),
        hashes: int(data.trials * (data.inputBits + 1)),
        mean: fmt(data.mean, 4),
        min: fmt(data.min, 3),
        max: fmt(data.max, 3),
        maxAbsZ: fmt(data.maxAbsZ, 2),
        beyondTwoSigma: fmt(100 * data.fractionBeyondTwoSigma, 1),
        expectedBeyondTwoSigma: fmt(100 * exactTwoSidedTail(data.trials, 1.96), 2),
      };
    case 'runs': {
      const a = data.adjacent;
      return {
        ...base,
        n: int(data.n),
        applicable: int(data.applicable),
        meanRuns: fmt(data.meanRuns, 1),
        expectedRuns: int(data.expectedRuns),
        uniformityStatistic: fmt(data.uniformityStatistic, 1),
        uniformityP: formatP(data.uniformityP),
        passing: fmt(100 * data.proportionPassing, 2),
        passingLow: fmt(100 * data.passingInterval[0], 2),
        passingHigh: fmt(100 * data.passingInterval[1], 2),
        n00: int(a.table['00']),
        n01: int(a.table['01']),
        n10: int(a.table['10']),
        n11: int(a.table['11']),
        adjacentStatistic: fmt(a.statistic, 2),
        adjacentP: formatP(a.p),
        lag1: fmt(a.lag1Correlation, 4),
      };
    }
    case 'collisions': {
      const out = { ...base, n: int(data.n), bits: int(data.curve.bits), subsets: int(data.curve.subsets) };
      for (const t of data.truncations) {
        out[`t${t.bits}expected`] = fmt(t.expectedPairs, 1);
        out[`t${t.bits}observed`] = int(t.observedPairs);
        out[`t${t.bits}distinct`] = int(t.distinctValues);
        out[`t${t.bits}expectedDistinct`] = fmt(t.expectedDistinct, 1);
      }
      const space = 2 ** data.curve.bits;
      let half = null;
      for (let m = 2; m <= data.n; m += 1) {
        if (collisionProbability(m, space, { exact: true }) >= 0.5) {
          half = m;
          break;
        }
      }
      out.halfPoint = half === null ? 'n/a' : int(half);
      const first = data.curve.points.find((pt) => pt.empirical >= 0.5);
      out.empiricalHalf = first ? int(first.m) : 'n/a';
      return out;
    }
    default:
      return base;
  }
}

/** The fields the page needs to redraw a chart at another width. */
export function compactData(kind, data) {
  switch (kind) {
    case 'bitFrequency':
      return { variant: data.variant, n: data.n, seed: data.seed, z: data.z.map((v) => +v.toFixed(3)), beyondTwoSigma: data.beyondTwoSigma };
    case 'byteFrequency':
      return { variant: data.variant, n: data.n, seed: data.seed, counts: data.counts, expectedPerValue: data.expectedPerValue };
    case 'hammingWeight':
    case 'avalanche':
      return { variant: data.variant, n: data.n, seed: data.seed, counts: data.counts };
    case 'runs':
      return {
        variant: data.variant,
        n: data.n,
        seed: data.seed,
        pValueHistogram: data.pValueHistogram,
        expectedPValueHistogram: data.expectedPValueHistogram,
        applicable: data.applicable,
      };
    case 'collisions':
      return { variant: data.variant, n: data.n, seed: data.seed, curve: data.curve };
    case 'sac':
      return null; // the raster is pixel-based; the page redraws it only after a fresh run
    default:
      return null;
  }
}

/* ------------------------------------------------------------- markup */

/**
 * One series of a figure: the chart, and the compact data for redrawing.
 * @param {string} kind
 * @param {object} data
 * @param {{ id: string, series: string, hidden?: boolean, width?: number, rasterize?: Function }} options
 */
export function renderSeries(kind, data, { id, series, hidden = false, width = 960, rasterize }) {
  const chart = renderChart(kind, data, { id, width, rasterize });
  const compact = compactData(kind, data);
  return (
    `<div class="chart-figure__series" data-fig-series="${escapeXml(series)}"${hidden ? ' hidden' : ''}>` +
    `<div class="chart-figure__chart" data-fig-chart>${chart}</div>` +
    (compact ? `<script type="application/json" data-fig-data>${JSON.stringify(compact)}</script>` : '') +
    `</div>`
  );
}

/** The statistics of every series of a figure, for the page script. */
export function renderStatsScript(statsBySeries) {
  return `<script type="application/json" data-fig-stats>${JSON.stringify(statsBySeries)}</script>`;
}

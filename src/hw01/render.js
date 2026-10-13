/**
 * Figures of homework 01, shared by the build-time provider
 * (homework/01/figures.js) and the page script, so that a figure redrawn in
 * the browser is the figure the build printed.
 *
 * The study of src/lib/kg-study.js (runStudy) is cut into figure series:
 *   seriesFromStudy(kind, study, key)  compact, JSON-safe data of one series
 *   statsOf(kind, data)                the strings its caption prints
 *   renderChart(kind, data, options)   its chart, at a given width
 * Series keys are those of the study: T17 (G = (1, 5), the assignment's base
 * point), T17g (the generator (6, 6)), S1031, O1051 and O16477, enumerated
 * exhaustively; secp256k1 and keccak, sampled; keccak<orbit key> for
 * Keccak-256(k) mod p over the same k as that orbit; and 'all' for figures
 * with a single series.
 *
 * Every caption grid has four cells, c1 … c4 with headings c1h … c4h, so
 * that a figure whose series differ in kind (an enumeration and a sample)
 * prints the statistics that fit each one. Values that do not exist print as
 * an em dash, never as NaN.
 */

import {
  escapeXml,
  renderBitProfile,
  renderCurveScatter,
  renderHeatMap,
  renderHistogram,
  renderLineChart,
  renderLogLog,
  renderScatter,
  renderZStrip,
} from '../lib/charts.js';
import { formatNumber } from '../lib/probability-plot.js';
import { binomialPmfTable, chiSquareSf, poissonPmf } from '../lib/stats.js';

/* ------------------------------------------------------------ series */

/** The sampled series: everything else is an exhaustive enumeration. */
export const SAMPLED = Object.freeze(['secp256k1', 'keccak']);
export const isSampled = (key) => SAMPLED.includes(key);

/** The series of each figure kind, in display order. */
export const FIGURE_SERIES = Object.freeze({
  coordHist: Object.freeze(['T17g', 'S1031', 'O1051', 'O16477', 'secp256k1', 'keccak']),
  occupancy: Object.freeze(['S1031', 'O1051', 'O16477', 'keccakO1051', 'keccakO16477']),
  bitFreq: Object.freeze(['T17g', 'O1051', 'O16477', 'secp256k1', 'keccak']),
  avalanche: Object.freeze(['O1051', 'O16477', 'secp256k1', 'keccak']),
  pointCloud: Object.freeze(['all']),
  sequence: Object.freeze(['all']),
  ecdlp: Object.freeze(['all']),
  dblAddCost: Object.freeze(['all']),
});

/** The series printed by the build (the others are revealed by the radio buttons). */
export const DEFAULT_SERIES = Object.freeze({
  coordHist: 'O1051',
  occupancy: 'O1051',
  bitFreq: 'O1051',
  avalanche: 'O1051',
  pointCloud: 'all',
  sequence: 'all',
  ecdlp: 'all',
  dblAddCost: 'all',
});

/** Figure kinds whose sampled series the page can redraw on a fresh sample. */
export const RESAMPLABLE = Object.freeze(['coordHist', 'bitFreq', 'avalanche']);

/** Private keys drawn by the browser for a new sample (the build uses more). */
export const RESAMPLE_N = 1024;

/* A prime field named by its order, as printed on the charts (Libre Franklin has no subscript digits). */
const field = (p) => `p = ${p}`;

const LABEL = {
  T17: `${field(17)}, G = (1, 5)`,
  T17g: `${field(17)}, G = (6, 6)`,
  S1031: field(1031),
  O1051: field(1051),
  O16477: field(16477),
  secp256k1: 'secp256k1',
  keccak: 'Keccak-256',
};

/** The name of a series as printed in captions. */
export function labelOf(key) {
  if (LABEL[key]) return LABEL[key];
  if (key.startsWith('keccak')) return `Keccak-256 mod p, ${LABEL[key.slice(6)] ?? key.slice(6)}`;
  return key;
}

/* ------------------------------------------------------------ formats */

const DASH = '—';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** p-values as printed in captions and tables ('n/a' when a test has no p-value). */
export function formatP(p) {
  if (!finite(p)) return 'n/a';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

/** A fixed-point number with a typographic minus; a rounded zero never carries a sign. */
export function fmt(v, digits = 2) {
  if (!finite(v)) return DASH;
  const s = formatNumber(v, digits);
  return /^−0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** An integer with thousands separators (en-GB). */
export function int(v) {
  return finite(v) ? Math.round(v).toLocaleString('en-GB') : DASH;
}

/** A chi-square statistic: two decimals, one from 100 upwards. */
const chi = (v) => (finite(v) ? fmt(v, Math.abs(v) >= 100 ? 1 : 2) : DASH);

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '−': '⁻', '-': '⁻' };

/** An integer exponent in Unicode superscript digits, for plain text only (titles, descriptions, JSON). */
export const superscript = (s) => String(s).replace(/[0-9−-]/g, (c) => SUPERSCRIPT[c]);

/**
 * A large number in scientific notation, as its parts: { mantissa: '8.68', exponent: '76' }
 * (exponent null below 10^6, where the mantissa is the number itself). The page sets the
 * exponent as a real superscript, 8.68 × 10<sup>76</sup>; a display string never carries a caret.
 */
export function sciParts(v, digits = 2) {
  if (!finite(v)) return { mantissa: DASH, exponent: null };
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e < 6) return { mantissa: fmt(v, 1), exponent: null };
  return { mantissa: (v / 10 ** e).toFixed(digits), exponent: String(e) };
}

/** A large number as plain text, "8.68 × 10⁷⁶" (Unicode superscripts; markup uses sciParts). */
export function formatSci(v, digits = 2) {
  const { mantissa, exponent } = sciParts(v, digits);
  return exponent === null ? mantissa : `${mantissa} × 10${superscript(exponent)}`;
}

/* The four caption cells c1 … c4 and their headings. */
function grid(cells) {
  const out = {};
  cells.forEach(([head, value], i) => {
    out[`c${i + 1}h`] = head;
    out[`c${i + 1}`] = value;
  });
  return out;
}

const r4 = (v) => (finite(v) ? Math.round(v * 1e4) / 1e4 : v);
const r3 = (v) => (finite(v) ? Math.round(v * 1e3) / 1e3 : v);

/**
 * Probability that a Bin(trials, ½) count lies more than `threshold` standard
 * deviations from its mean: the exact expected proportion of flagged cells
 * of a matrix of binomial counts (5.95% for 48 trials, 7.03% for 8).
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

/* ------------------------------------------------------- provenance */

function orbitInfo(study, key) {
  for (const entry of study.meta?.curves ?? []) {
    for (const base of entry.bases) if (base.key === key) return { entry, base };
  }
  throw new Error(`no orbit "${key}" in the study`);
}

const orbitKey = (key) => (key.startsWith('keccak') && key !== 'keccak' ? key.slice(6) : key);

/* What a series is: an enumeration of an orbit, or a sample of secp256k1 keys. */
function provenanceOf(study, key) {
  if (isSampled(key)) {
    const { seed, sizes, origin } = study.meta;
    const where = origin === 'browser' ? 'Simulation redrawn in this browser' : 'Simulation';
    const digest = key === 'keccak' ? '; H(k) is Keccak-256 of k as 32 big-endian bytes' : '';
    return {
      key,
      label: labelOf(key),
      sampled: true,
      provenance: 'Simulated',
      population: `${where}: N = ${int(sizes.secpN)} private keys drawn uniformly from [1, n − 1], seed ${seed}${digest}`,
    };
  }
  const { entry, base } = orbitInfo(study, orbitKey(key));
  const m = base.n - 1;
  const what = key.startsWith('keccak')
    ? `Enumeration: Keccak-256(k) mod ${entry.p} for every k = 1, …, ${int(m)}, k as 32 big-endian bytes`
    : `Enumeration: all ${int(m)} points kG, k = 1, …, ${int(m)}, of the subgroup of order ${int(base.n)} generated by G = (${base.x}, ${base.y}) on y² = x³ + 7 (mod ${entry.p})`;
  return { key, label: labelOf(key), sampled: false, provenance: 'Enumeration', population: what, p: entry.p, n: base.n };
}

/* ------------------------------------------------- data of one series */

/* The structural Monte Carlo null of an enumerated coordinate (kg-study.js, structuralNull). */
const pickStructural = (s) =>
  s && {
    replicates: s.replicates,
    seed: s.seed,
    distinct: s.distinct,
    multiplicity: s.multiplicity,
    vif: s.vif,
    mean: s.mean,
    q95: s.q95,
    pValue: s.pValue,
    closedUnderNegation: s.closedUnderNegation,
  };

const pickCoord = (d) =>
  d && {
    counts: d.counts,
    expected: d.expected.map(r4),
    total: d.total,
    bins: d.bins,
    statistic: d.statistic,
    df: d.df,
    pValue: d.pValue,
    ...(d.structural ? { structural: pickStructural(d.structural) } : {}),
  };

const pickOccupancy = (o) =>
  o && { p: o.p, total: o.total, lambda: o.lambda, counts: o.counts, statistic: o.test.statistic, df: o.test.df, pValue: o.test.pValue };

/**
 * The data of one series of a figure, cut from a study (runStudy, or the
 * partial study a browser resample returns), compact and JSON-safe.
 * @param {string} kind a key of FIGURE_SERIES, or 'sac'
 * @param {object} study
 * @param {string} key
 */
export function seriesFromStudy(kind, study, key) {
  switch (kind) {
    case 'coordHist': {
      const e = study.E1[key];
      const hash = key === 'keccak';
      const meta = provenanceOf(study, key);
      return {
        ...meta,
        perValue: !meta.sampled && e.x.bins === meta.p,
        xName: hash ? 'H(k)' : 'x',
        x: pickCoord(hash ? e.digest : e.x),
        y: hash ? null : pickCoord(e.y),
      };
    }
    case 'occupancy': {
      const e = study.E2[orbitKey(key)];
      const hash = key.startsWith('keccak');
      return {
        ...provenanceOf(study, key),
        xName: hash ? 'H(k) mod p' : 'x',
        x: pickOccupancy(hash ? e.keccakModP : e.x),
        y: hash ? null : pickOccupancy(e.y),
      };
    }
    case 'bitFreq': {
      const meta = provenanceOf(study, key);
      if (meta.sampled) {
        const d = key === 'keccak' ? study.E3.keccak.digest : study.E3.secp256k1.x;
        const statistic = d.zHalf.reduce((s, z) => s + z * z, 0);
        return {
          ...meta,
          n: d.total,
          bits: d.bits,
          z: d.zHalf.map(r3),
          statistic,
          df: d.bits,
          pValue: chiSquareSf(statistic, d.bits),
          maxAbsZ: d.maxAbsZHalf,
          beyondTwoSigma: d.zHalf.filter((z) => Math.abs(z) > 1.96).length,
          monobitP: d.overall.pValue,
        };
      }
      const d = study.E3[key].x;
      return {
        ...meta,
        n: d.total,
        bits: d.bits,
        observed: d.frequency.map(r4),
        expected: d.expected.map(r4),
        maxAbsZExact: d.maxAbsZExact,
        maxAbsZHalf: d.maxAbsZHalf,
        monobitP: d.overall.pValue,
      };
    }
    case 'avalanche': {
      const meta = provenanceOf(study, key);
      if (meta.sampled) {
        const a = study.E6[key].avalanche;
        return {
          ...meta,
          flipSeed: a.seed,
          counts: a.counts,
          trials: a.trials,
          discarded: a.discarded,
          outputBits: 256,
          mean: a.mean,
          sd: a.sd,
          expectedMean: a.expectedMean,
          statistic: a.statistic,
          df: a.df,
          pValue: a.pValue,
        };
      }
      const a = study.E6[key];
      return {
        ...meta,
        counts: a.counts,
        // The exact law of two distinct points of the orbit, as probabilities.
        reference: a.reference.map((c) => Math.round((c / a.allPairs) * 1e9) / 1e9),
        pairs: a.pairs,
        allPairs: a.allPairs,
        discarded: a.discarded,
        inputBits: a.inputBits,
        outputBits: 2 * a.bits,
        mean: a.mean,
        sd: a.sd,
        expectedMean: a.expectedMean,
        statistic: a.test.statistic,
        df: a.test.df,
        pValue: a.test.pValue,
      };
    }
    case 'pointCloud':
      return {
        key: 'all',
        label: 'Point clouds',
        provenance: 'Enumeration',
        panels: ['T17g', 'O1051', 'O16477'].map((k) => {
          const e = study.E4[k];
          const c = e.cloud;
          // A systematic subsample of at most 2,000 points (evenly spaced in k) keeps the page light.
          const stride = Math.ceil(c.count / 2000);
          const keep = (_, i) => i % stride === 0;
          return {
            key: k,
            p: c.p,
            n: c.n,
            xs: c.xs.filter(keep),
            ys: c.ys.filter(keep),
            cells: {
              per: e.cells.cellsPerAxis,
              total: e.cells.total,
              statistic: e.cells.statistic,
              df: e.cells.df,
              pValue: e.cells.pValue,
              minExpected: e.cells.minExpected,
              illustrative: e.cells.illustrative,
            },
            mirrored: e.mirror.mirrored,
            total: e.mirror.total,
          };
        }),
      };
    case 'sequence': {
      const t = study.E5.T17.periodic;
      const c = study.E4.O1051.cloud;
      if (c.count !== c.n - 1) throw new Error('the sequence figure needs the whole orbit of O1051');
      const e5 = study.E5.O1051;
      return {
        key: 'all',
        label: 'Sequences',
        provenance: 'Enumeration',
        toy: { k: t.k, xs: t.xs, n: t.n, p: 17, base: t.base },
        orbit: { p: c.p, n: c.n, xs: c.xs },
        r: {
          toyKx: study.E5.T17.kx.r,
          toyLag1: study.E5.T17.lag1.r,
          kx: e5.kx.r,
          ky: e5.ky.r,
          lag1: e5.lag1.r,
          mirror: e5.mirror.r,
        },
      };
    }
    case 'ecdlp': {
      const e = study.E7;
      return {
        key: 'all',
        label: 'Discrete logarithm',
        provenance: 'Simulated',
        seed: e.seed,
        targets: e.targets,
        rows: e.curves.map((c) => ({ p: c.p, n: c.n, bsgs: c.bsgs.mean, brute: c.bruteForce.mean })),
        // The dashed references: n/2 for exhaustive search, 1.5·√n for this baby-step giant-step.
        references: { bruteFactor: 0.5, bsgsFactor: 1.5 },
        fit: {
          bruteSlope: e.fit.bruteForce.slope,
          bsgsSlope: e.fit.bsgs.slope,
          bruteR: e.fit.bruteForce.r,
          bsgsR: e.fit.bsgs.r,
          bruteAt256: e.fit.bruteForce.log2At256,
          bsgsAt256: e.fit.bsgs.log2At256,
          theoryBrute: e.fit.theoryAt256.bruteForce,
          theoryBsgs: e.fit.theoryAt256.bsgs,
        },
      };
    }
    case 'dblAddCost': {
      const e = study.E8;
      return {
        key: 'all',
        label: 'Cost of kG',
        bits: e.bits,
        repeated: e.log2RepeatedAddition.map(r4),
        doubleAndAdd: e.log2DoubleAndAdd.map(r4),
        meanRepeated: e.repeatedAddition.at(-1),
        meanDoubleAndAdd: e.doubleAndAdd.at(-1),
        assignment: e.assignment,
      };
    }
    case 'sac':
      return {
        key: 'all',
        label: 'Strict avalanche criterion',
        provenance: 'Simulated',
        maps: ['secp256k1', 'keccak'].map((k) => {
          const s = study.E6[k].sac;
          return {
            key: k,
            counts: s.counts,
            trials: s.trials,
            meanFrequency: s.meanFrequency,
            maxAbsDeviation: s.maxAbsDeviation,
            maxAbsZ: s.maxAbsZ,
            statistic: s.statistic,
            df: s.df,
            pValue: s.pValue,
            beyond: s.beyond,
            expectedBeyond: s.expectedBeyond,
            discarded: s.discarded,
          };
        }),
      };
    default:
      throw new Error(`seriesFromStudy: unknown kind "${kind}"`);
  }
}

/* ---------------------------------------------------------- layout */

const PAIR_MIN = 560;
const GAP = 16;

/**
 * Panels side by side (up to `columns` when the figure is at least 560px
 * wide) or stacked; each part receives its pixel width and returns
 * { title, html }. The column count is printed as data-columns.
 */
function panels(parts, width, { columns = 2, maxStacked = Infinity } = {}) {
  const cols = parts.length > 1 && width >= PAIR_MIN ? Math.min(columns, parts.length) : 1;
  const w = cols === 1 ? Math.min(width, maxStacked) : Math.floor((width - GAP * (cols - 1)) / cols);
  const html = parts
    .map((part) => {
      const { title, html: chart } = part(w);
      return `<div class="chart-panel">${title ? `<p class="chart-panel__title">${escapeXml(title)}</p>` : ''}${chart}</div>`;
    })
    .join('');
  return `<div class="chart-panels" data-columns="${cols}">${html}</div>`;
}

const histHeight = (w) => Math.round(Math.min(340, Math.max(220, w * 0.62)));
/* Fig. 3 is a little taller, so that the labels of its marks fit between the lines and the frame. */
const costHeight = (w) => Math.round(Math.min(340, Math.max(260, w * 0.72)));

/* Margins of the small multiples of Fig. 8, and a point radius that covers about a quarter of the square. */
const CLOUD_MARGIN = Object.freeze({ top: 8, right: 8, bottom: 46, left: 44 });
const cloudRadius = (side, count) => Math.round(Math.min(3.5, Math.max(0.9, side * Math.sqrt(0.25 / (Math.PI * count)))) * 10) / 10;

/* ------------------------------------------------------------ charts */

/* A label written with ^{…} exponents (the chart markup of charts.js) as plain text, with Unicode superscripts. */
const plain = (s) => String(s).replace(/\^\{([^}]*)\}/g, (_, e) => superscript(e));

function coordPanel(d, data, coord, id) {
  const hash = coord === 'H(k)';
  return (w) => {
    const bins = d.counts.map((observed, j) => ({ label: String(j), observed, expected: d.expected[j] }));
    const fractions = [
      [0, '0'],
      [0.25, '0.25'],
      [0.5, '0.5'],
      [0.75, '0.75'],
      [1, '1'],
    ];
    const edgeTicks = data.perValue ? undefined : fractions.map(([f, label]) => ({ at: f * d.bins, label }));
    const scale = hash ? 'H(k) / 2^{256}' : data.perValue ? coord : `${coord} / p`;
    const s = d.structural;
    const structural = s
      ? ` A structural Monte Carlo null that keeps the multiplicities${s.closedUnderNegation ? ' and the mirror pairs' : ''} of the orbit (${int(s.replicates)} replicates) gives a mean of ${chi(s.mean)} and P = ${formatP(s.pValue)}.`
      : '';
    return {
      title: hash ? 'Digest H(k)' : coord === 'x' ? 'Abscissa x' : 'Ordinate y',
      html: renderHistogram({
        id: `${id}-${hash ? 'h' : coord}`,
        title: `Distribution of ${plain(scale)} for ${data.label}, in ${d.bins} bins`,
        desc: `Bars are the observed counts of the ${int(d.total)} values in each bin; the step line is the exact expected count under the uniform law on the integers of the range, χ² = ${chi(d.statistic)} with ${d.df} degrees of freedom.${structural}`,
        bins,
        width: w,
        height: histHeight(w),
        xLabel: scale,
        yLabel: 'Count',
        labelEvery: data.perValue && w < 420 ? 2 : 1,
        edgeTicks,
      }),
    };
  };
}

function occupancyPanel(o, data, coord, id) {
  return (w) => {
    const top = Math.max(5, o.counts.length - 1);
    const bins = Array.from({ length: top + 1 }, (_, m) => ({
      label: String(m),
      observed: o.counts[m] ?? 0,
      expected: o.p * poissonPmf(m, o.lambda),
    }));
    return {
      title: coord === 'x' ? 'Abscissa x' : coord === 'y' ? 'Ordinate y' : 'Keccak-256(k) mod p',
      html: renderHistogram({
        id: `${id}-${coord === 'x' || coord === 'y' ? coord : 'h'}`,
        title: `How many of the ${int(o.p)} field values occur m times, ${coord} for ${data.label}`,
        desc: `Bars count the field values hit exactly m times by the ${int(o.total)} values; the step line is p times the Poisson probability of m for a random function with mean θ = ${fmt(o.lambda, 3)} occurrences per value.`,
        bins,
        width: w,
        height: histHeight(w),
        xLabel: 'Times a value occurs, m',
        yLabel: 'Field values',
      }),
    };
  };
}

function avalancheBins(data) {
  if (data.reference) {
    return data.counts.map((observed, m) => ({ label: String(m), observed, expected: data.pairs * data.reference[m] }));
  }
  const pmf = binomialPmfTable(256, 0.5);
  const bins = [];
  for (let m = 88; m <= 168; m += 1) bins.push({ label: String(m), observed: data.counts[m] ?? 0, expected: data.trials * pmf[m] });
  return bins;
}

/**
 * The chart area of one series of a figure.
 * @param {string} kind
 * @param {object} data from seriesFromStudy (or its JSON copy)
 * @param {{ id: string, width?: number, rasterize?: Function }} options rasterize is needed by 'sac'
 * @returns {string} HTML
 */
export function renderChart(kind, data, { id, width = 640, rasterize } = {}) {
  switch (kind) {
    case 'coordHist': {
      const parts = [coordPanel(data.x, data, data.xName, id)];
      if (data.y) parts.push(coordPanel(data.y, data, 'y', id));
      return panels(parts, width);
    }
    case 'occupancy': {
      const parts = [occupancyPanel(data.x, data, data.xName === 'x' ? 'x' : 'h', id)];
      if (data.y) parts.push(occupancyPanel(data.y, data, 'y', id));
      return panels(parts, width);
    }
    case 'bitFreq': {
      if (data.z) {
        return renderZStrip({
          id,
          title: `z-score of the frequency of ones at each of the 256 bit positions of ${data.key === 'keccak' ? 'the Keccak-256 digest' : 'x(kG)'}, ${data.label}`,
          desc: `Each lollipop is the standardised count of ones at one bit position over ${int(data.n)} outputs; under uniformity about 5% of them, 12.8, fall outside the ±1.96 band; here ${data.beyondTwoSigma} do.`,
          z: data.z,
          width,
          height: Math.round(Math.min(340, Math.max(220, width * 0.4))),
          xLabel: 'Bit position j (0 = least significant)',
        });
      }
      const bits = data.observed.map((observed, j) => {
        const q = data.expected[j];
        const half = 1.96 * Math.sqrt((q * (1 - q)) / data.n);
        return { observed, expected: q, low: Math.max(0, q - half), high: Math.min(1, q + half) };
      });
      return renderBitProfile({
        id,
        title: `Proportion of ones at each of the ${data.bits} bit positions of x(kG), ${data.label}`,
        desc: `Points are the observed proportions over all ${int(data.n)} points; ink ticks the exact proportion q_j of a uniform variable on [0, p); vertical lines the 95% range of a uniform random sample of the same size. The top bit is rarely set because p is not a power of two.`,
        bits,
        width,
        height: Math.round(Math.min(320, Math.max(220, width * 0.42))),
      });
    }
    case 'avalanche': {
      const bins = avalancheBins(data);
      return renderHistogram({
        id,
        title: `Hamming distance between the outputs for k and for k with one bit flipped, ${data.label}`,
        desc: data.reference
          ? `Bars count the ${int(data.pairs)} pairs of keys that differ in one bit, each pair once, by the number of the ${data.outputBits} coordinate bits of x‖y that change; the step line is the exact law of the distance between two distinct points of the orbit, over all ${int(data.allPairs)} pairs, scaled to the same number of pairs.`
          : `Bars count the ${int(data.trials)} flips by the number of the 256 output bits that change, from 88 to 168; the step line is the binomial law Bin(256, ½), mean 128 and standard deviation 8.`,
        bins,
        width,
        height: histHeight(width),
        xLabel: 'Output bits changed',
        yLabel: data.reference ? 'Pairs' : 'Flips',
        labelEvery: data.reference ? (width < 420 ? 4 : 2) : 8,
      });
    }
    case 'pointCloud':
      return panels(
        data.panels.map((c) => (w) => ({
          title: `${field(c.p)} · ${c.xs.length === c.n - 1 ? `all ${int(c.n - 1)} points` : `${int(c.xs.length)} of ${int(c.n - 1)} points`}`,
          html: renderCurveScatter({
            id: `${id}-${c.key}`,
            title: `The points kG of the subgroup of order ${int(c.n)} on y² = x³ + 7 (mod ${c.p})`,
            desc: `${int(c.xs.length)} points, mirror line y = p/2; ${int(c.mirrored)} of ${int(c.total)} points have their mirror image (x, p − y) in the set.`,
            p: c.p,
            points: c.xs.map((x, i) => ({ x, y: c.ys[i] })),
            width: w,
            height: w,
            margin: CLOUD_MARGIN,
            radius: cloudRadius(w - CLOUD_MARGIN.left - CLOUD_MARGIN.right, c.xs.length),
          }),
        })),
        width,
        { columns: 3, maxStacked: 420 },
      );
    case 'sequence': {
      const { toy, orbit } = data;
      const marks = [];
      for (let k = toy.n; k <= toy.k.at(-1); k += toy.n) marks.push({ x: k, label: 'O' });
      const top = renderScatter({
        id: `${id}-toy`,
        title: `x(kG) against k for G = (${toy.base.x}, ${toy.base.y}) on y² = x³ + 7 (mod ${toy.p}), k = 1 … ${toy.k.at(-1)}`,
        desc: `The sequence repeats with period ${toy.n}, the order of G; at every multiple of ${toy.n} the point kG is O, which has no coordinates.`,
        series: [{ key: 'toy', points: toy.k.map((k, i) => ({ x: k, y: toy.xs[i] })), connect: true }],
        xDomain: [0, toy.k.at(-1) + 1],
        yDomain: [0, toy.p],
        vMarks: marks,
        width,
        height: Math.round(Math.min(280, Math.max(200, width * 0.34))),
        xLabel: 'k',
        yLabel: 'x(kG)',
        radius: 3,
      });
      const m = orbit.n - 1;
      const pair = panels(
        [
          (w) => ({
            title: `${field(orbit.p)}: x(kG) against k`,
            html: renderScatter({
              id: `${id}-orbit`,
              title: `x(kG) against k = 1 … ${int(m)} on y² = x³ + 7 (mod ${orbit.p})`,
              desc: `Each point is one multiple of G; ordered in k, the abscissas show no trend (r(k, x) = ${fmt(data.r.kx, 3)}).`,
              series: [{ key: 'orbit', points: orbit.xs.map((x, i) => ({ x: i + 1, y: x })) }],
              xDomain: [0, orbit.n],
              yDomain: [0, orbit.p],
              width: w,
              height: w,
              xLabel: 'k',
              yLabel: 'x(kG)',
              radius: 1.4,
            }),
          }),
          (w) => ({
            title: `${field(orbit.p)}: pairs of abscissas`,
            html: renderScatter({
              id: `${id}-pairs`,
              title: `Pairs of abscissas for y² = x³ + 7 (mod ${orbit.p}): x(kG) against x((n − k)G) and against x((k + 1)G)`,
              desc: `The mirror pairs lie on the identity line, since (n − k)G = −kG has the same abscissa (r = ${fmt(data.r.mirror, 3)}); the consecutive pairs fill the square (lag-one r = ${fmt(data.r.lag1, 3)}).`,
              series: [
                { key: 'lag', label: 'x(kG), x((k + 1)G)', mark: 'ring', points: orbit.xs.slice(0, m - 1).map((x, i) => ({ x, y: orbit.xs[i + 1] })) },
                { key: 'mirror', label: 'x(kG), x((n − k)G)', points: orbit.xs.map((x, i) => ({ x, y: orbit.xs[m - 1 - i] })) },
              ],
              xDomain: [0, orbit.p],
              yDomain: [0, orbit.p],
              identity: true,
              legend: true,
              square: true,
              width: w,
              height: w + 30,
              xLabel: 'x(kG)',
              yLabel: 'Paired abscissa',
              radius: 1.5,
            }),
          }),
        ],
        width,
      );
      return `<div class="chart-panel"><p class="chart-panel__title">${field(toy.p)}: x(kG) against k, G = (${toy.base.x}, ${toy.base.y})</p>${top}</div>${pair}`;
    }
    case 'ecdlp': {
      const f = data.fit;
      const { bruteFactor, bsgsFactor } = data.references;
      // Line, label, extrapolated mark and tokens all use the same references: n/2 and 1.5·√n.
      return renderLogLog({
        id,
        title: 'Group operations needed to recover k from Q = kG against the order n of G, on log₂ axes',
        desc: `Filled points are the mean cost of baby-step giant-step and open points the mean cost of exhaustive search over ${data.targets} random keys on each of ${data.rows.length} curves y² = x³ + 7 of prime order; the dashed references are ${bsgsFactor}·√n and n/2, the expected costs of the two methods, and the right panel extends them to n ≈ 2²⁵⁶, the order of secp256k1, where the marks give about 2 to the power ${fmt(f.theoryBsgs, 1)} and 2 to the power ${fmt(f.theoryBrute, 0)} operations. Fitted slopes: ${fmt(f.bruteSlope, 3)} (exhaustive) and ${fmt(f.bsgsSlope, 3)} (BSGS).`,
        series: [
          { key: 'bsgs', label: 'Baby-step giant-step', points: data.rows.map((r) => ({ x: r.n, y: r.bsgs })) },
          { key: 'brute', label: 'Exhaustive search', points: data.rows.map((r) => ({ x: r.n, y: r.brute })) },
        ],
        references: [
          { label: `${bsgsFactor}√n`, exponent: 0.5, factor: bsgsFactor },
          { label: 'n/2', exponent: 1, factor: bruteFactor },
        ],
        marks: [
          { x: 2 ** 256, y: 2 ** f.theoryBrute, label: `Exhaustive ≈ 2^{${fmt(f.theoryBrute, 0)}}` },
          { x: 2 ** 256, y: 2 ** f.theoryBsgs, label: `BSGS ≈ 2^{${fmt(f.theoryBsgs, 1)}}` },
        ],
        width,
        xLabel: 'Order n of G',
        yLabel: 'Group operations',
      });
    }
    case 'dblAddCost': {
      const line = (to) =>
        [
          { key: 'repeated', label: 'Repeated addition', values: data.repeated },
          { key: 'binary', label: 'Double-and-add', values: data.doubleAndAdd },
        ].map((s) => ({ key: s.key, label: s.label, points: data.bits.slice(0, to).map((L, i) => ({ x: L, y: s.values[i] })) }));
      const a = data.assignment;
      return panels(
        [
          (w) => ({
            title: 'Bit lengths 1 to 16',
            html: renderLineChart({
              id: `${id}-small`,
              title: 'Mean number of group operations to compute kG for an L-bit k, L = 1 … 16, on a log₂ scale',
              desc: `Repeated addition needs k − 1 additions, double-and-add L − 1 doublings and on average (L − 1)/2 additions; the marks are the exact counts for the assignment's k = ${a.k} = ${a.bits}₂: ${a.repeatedAddition} additions against ${a.doubleAndAdd.total} operations.`,
              series: line(16),
              // The two marks sit one above the other at L = 3: the upper label goes above, the lower below.
              marks: [
                { x: 3, y: Math.log2(a.repeatedAddition), label: `k = ${a.k}: ${a.repeatedAddition}`, prefer: ['nw', 'n', 'w'] },
                { x: 3, y: Math.log2(a.doubleAndAdd.total), label: `k = ${a.k}: ${a.doubleAndAdd.total}`, prefer: ['se', 'e', 's'] },
              ],
              xDomain: [0, 16],
              yDomain: [0, 16],
              yFormat: 'pow2',
              width: w,
              height: costHeight(w),
              xLabel: 'Bit length L of k',
              yLabel: 'Group operations',
            }),
          }),
          (w) => ({
            title: 'Bit lengths 1 to 256',
            html: renderLineChart({
              id: `${id}-large`,
              title: 'Mean number of group operations to compute kG for an L-bit k, L = 1 … 256, on a log₂ scale',
              desc: `At L = 256, the size of a secp256k1 key, repeated addition needs about ${formatSci(data.meanRepeated)} additions and double-and-add ${fmt(data.meanDoubleAndAdd, 1)} operations on average.`,
              series: line(256),
              marks: [
                { x: 256, y: data.repeated.at(-1), label: 'secp256k1', prefer: ['w', 'sw', 'nw'] },
                { x: 256, y: data.doubleAndAdd.at(-1), label: 'secp256k1', prefer: ['nw', 'n', 'w'] },
              ],
              xDomain: [1, 256],
              // Headroom above 2^256 keeps the label of the top mark inside the frame.
              yDomain: [0, 288],
              yFormat: 'pow2',
              width: w,
              height: costHeight(w),
              xLabel: 'Bit length L of k',
              yLabel: 'Group operations',
            }),
          }),
        ],
        width,
      );
    }
    case 'sac': {
      const NAME = { secp256k1: 'x(kG) on secp256k1', keccak: 'Keccak-256(k)' };
      const maps = data.maps.map(
        (s) =>
          `<div class="sac-map"><p class="chart-panel__title">${escapeXml(NAME[s.key])}</p>` +
          renderHeatMap({
            id: `${id}-${s.key}`,
            rows: 256,
            cols: 256,
            flips: s.counts,
            trials: s.trials,
            rasterize,
            lo: 0.4,
            hi: 0.6,
            xLabel: 'Output bit j',
            yLabel: 'Input bit i of k',
            alt: `Strict-avalanche matrix of ${NAME[s.key]}: 256 input bits by 256 output bits, each pixel the proportion of ${s.trials} keys for which output bit j changed when input bit i was flipped, on a grey scale from 0.4 (paper) to 0.6 (ink); largest deviation from one half ${fmt(s.maxAbsDeviation, 3)}.`,
          }) +
          '</div>',
      );
      return `<div class="sac-pair">${maps.join('')}</div>`;
    }
    default:
      throw new Error(`renderChart: unknown kind "${kind}"`);
  }
}

/* -------------------------------------------------------------- stats */

const hits = (prefix, counts) => Object.fromEntries(counts.map((c, m) => [`${prefix}${m}`, int(c)]));
const multiplicity = (counts) =>
  counts
    .map((c, m) => [m, c])
    .filter(([, c]) => c > 0)
    .map(([m, c]) => `${m}: ${int(c)}`)
    .join('; ');

/*
 * A p-value as printed in a sentence: "P = 0.252", "P < 0.001", or why there is none. A capital P,
 * because p is the prime of the field everywhere on the page.
 */
export const pEq = (s) => (s === DASH ? DASH : s === 'n/a' ? 'no p-value (no degrees of freedom left)' : s.startsWith('<') ? `P ${s}` : `P = ${s}`);

const TIMES = ['never', 'once', 'twice', 'three times', 'four times', 'five times', 'six times'];

/* The occupancy of F_p in words, most frequent multiplicity first: "546 values twice, 505 never". */
function pattern(counts) {
  const used = counts.map((c, m) => [m, c]).filter(([, c]) => c > 0);
  if (used.length === 1 && used[0][0] === 1) return 'every value once';
  return used
    .reverse()
    .map(([m, c], i) => `${int(c)}${i === 0 ? ` value${c === 1 ? '' : 's'}` : ''} ${TIMES[m] ?? `${m} times`}`)
    .join(', ');
}

/**
 * The statistics a figure caption prints, as display strings: named values
 * (cited in the text as {{fig.<figure>.<series>.<name>}}) and the four grid
 * cells c1 … c4 with their headings c1h … c4h. Every p-value <name> also
 * comes as <name>Eq, ready for a sentence ("P = 0.252", "P < 0.001"). Display
 * strings are plain text (the page inserts them as text): a power is written
 * with Unicode superscripts here, and as markup by the page where it shows.
 */
export function statsOf(kind, data) {
  const stats = statsOfKind(kind, data);
  for (const [key, value] of Object.entries(stats)) {
    if (/(^|\.)p$|P$/.test(key)) stats[`${key}Eq`] = pEq(value);
  }
  return stats;
}

function statsOfKind(kind, data) {
  const base = { series: data.label ?? '', provenance: data.provenance ?? '', population: data.population ?? '' };
  switch (kind) {
    case 'coordHist': {
      const { x, y } = data;
      // Enumerations: the chi-square against the structural Monte Carlo null; χ²(B − 1) is only a yardstick.
      const structural = (d, prefix) => {
        const n = d?.structural;
        return {
          [`${prefix}StructuralMean`]: n ? chi(n.mean) : DASH,
          [`${prefix}StructuralQ95`]: n ? chi(n.q95) : DASH,
          [`${prefix}StructuralP`]: n ? formatP(n.pValue) : DASH,
          [`${prefix}Vif`]: n ? fmt(n.vif, 2) : DASH,
          [`${prefix}Distinct`]: n ? int(n.distinct) : DASH,
          [`${prefix}Multiplicity`]: n ? fmt(n.multiplicity, 2) : DASH,
        };
      };
      const s = {
        ...base,
        xName: data.xName,
        n: int(x.total),
        bins: int(x.bins),
        xStatistic: chi(x.statistic),
        xDf: int(x.df),
        xP: formatP(x.pValue),
        ...structural(x, 'x'),
        yStatistic: y ? chi(y.statistic) : DASH,
        yDf: y ? int(y.df) : DASH,
        yP: y ? formatP(y.pValue) : DASH,
        ...structural(y, 'y'),
        replicates: x.structural ? int(x.structural.replicates) : DASH,
      };
      const binning = data.perValue ? 'one bin per field value' : `${x.bins} bins of equal width`;
      const nullNote = x.structural
        ? `; P from a structural Monte Carlo null of ${s.replicates} replicates that keep the multiplicity of every value and, for y, the mirror pairs {y, p − y} (seeds ${x.structural.seed} and ${y.structural.seed}); χ²(${s.xDf}) is a yardstick only`
        : '';
      s.population = `${base.population}; ${binning}${y ? '' : '; a digest has no second coordinate'}${nullNote}`;
      const enumerated = Boolean(x.structural);
      return {
        ...s,
        ...grid([
          [`${s.xName}: χ²(${s.xDf})`, s.xStatistic],
          enumerated ? [`${s.xName}: P, structural null`, s.xStructuralP] : [`${s.xName}: p-value`, s.xP],
          [y ? `y: χ²(${s.yDf})` : 'y: χ²', s.yStatistic],
          enumerated ? ['y: P, structural null', s.yStructuralP] : ['y: p-value', s.yP],
        ]),
      };
    }
    case 'occupancy': {
      const { x, y } = data;
      const s = {
        ...base,
        xName: data.xName,
        p: int(x.p),
        n: int(x.total),
        lambda: fmt(x.lambda, 3),
        xStatistic: chi(x.statistic),
        xDf: int(x.df),
        xP: formatP(x.pValue),
        xMultiplicity: multiplicity(x.counts),
        xPattern: pattern(x.counts),
        ...hits('xHits', x.counts),
        yStatistic: y ? chi(y.statistic) : DASH,
        yDf: y ? int(y.df) : DASH,
        yP: y ? formatP(y.pValue) : DASH,
        yMultiplicity: y ? multiplicity(y.counts) : DASH,
        yPattern: y ? pattern(y.counts) : DASH,
        ...(y ? hits('yHits', y.counts) : {}),
      };
      s.population = `${base.population}; ${s.n} values on ${s.p} cells, a mean of ${s.lambda} per value; reference: the Poisson occupancy of a random function with that mean, which is estimated from the data (one degree of freedom less)`;
      return {
        ...s,
        ...grid([
          [`${s.xName}: χ²(${s.xDf}) against Poisson`, s.xStatistic],
          [`${s.xName}: p-value`, s.xP],
          [y ? `y: χ²(${s.yDf}) against Poisson` : 'y: χ²', s.yStatistic],
          ['y: p-value', s.yP],
        ]),
      };
    }
    case 'bitFreq': {
      if (data.z) {
        const s = {
          ...base,
          n: int(data.n),
          bits: int(data.bits),
          statistic: chi(data.statistic),
          df: int(data.df),
          p: formatP(data.pValue),
          maxAbsZ: fmt(data.maxAbsZ, 2),
          beyondTwoSigma: int(data.beyondTwoSigma),
          expectedBeyondTwoSigma: fmt(0.05 * data.bits, 1),
          monobitP: formatP(data.monobitP),
        };
        s.population = `${base.population}; monobit test on all ${int(data.n * data.bits)} bits: ${pEq(s.monobitP)}`;
        return {
          ...s,
          ...grid([
            [`χ²(${s.df}) against ½`, s.statistic],
            ['p-value', s.p],
            ['max |z|', s.maxAbsZ],
            [`|z| > 1.96 (expected ${s.expectedBeyondTwoSigma})`, s.beyondTwoSigma],
          ]),
        };
      }
      const top = data.bits - 1;
      const s = {
        ...base,
        n: int(data.n),
        bits: int(data.bits),
        maxAbsZExact: fmt(data.maxAbsZExact, 2),
        maxAbsZHalf: fmt(data.maxAbsZHalf, 2),
        monobitP: formatP(data.monobitP),
        topBit: String(top),
        topObserved: fmt(data.observed[top], 4),
        topExpected: fmt(data.expected[top], 4),
      };
      s.population = `${base.population}; x written with ${data.bits} bits`;
      return {
        ...s,
        ...grid([
          ['max |z|, exact expectation', s.maxAbsZExact],
          ['max |z|, against ½', s.maxAbsZHalf],
          [`Bit ${top}: proportion of ones`, s.topObserved],
          [`Bit ${top}: exact expectation`, s.topExpected],
        ]),
      };
    }
    case 'avalanche': {
      const s = {
        ...base,
        ...(data.sampled ? { trials: int(data.trials) } : { pairs: int(data.pairs), allPairs: int(data.allPairs) }),
        discarded: int(data.discarded),
        outputBits: int(data.outputBits),
        mean: fmt(data.mean, 2),
        sd: fmt(data.sd, 2),
        expectedMean: fmt(data.expectedMean, 2),
        statistic: chi(data.statistic),
        df: int(data.df),
        p: formatP(data.pValue),
      };
      s.population = data.sampled
        ? `${base.population}; one random bit of each key flipped (flip seed ${data.flipSeed}), ${s.discarded} discarded; reference Bin(256, ½)`
        : `${base.population}; each of the ${data.inputBits} bits of every k flipped, every pair {k, k′} counted once: ${s.pairs} pairs, and ${s.discarded} flips discarded because k′ left [1, n − 1]; reference: the exact law of the distance between two distinct points of the orbit, over all ${s.allPairs} pairs`;
      return {
        ...s,
        ...grid([
          ['Mean distance', s.mean],
          [data.sampled ? 'Expected mean' : 'Mean, two distinct points', s.expectedMean],
          [`χ²(${s.df})`, s.statistic],
          ['p-value', s.p],
        ]),
      };
    }
    case 'pointCloud': {
      const s = { ...base };
      for (const c of data.panels) {
        // The cell test runs on the half-grid y < p/2 (the other half is its mirror image).
        s[`${c.key}.cells`] = `${c.cells.per} × ${c.cells.per}`;
        s[`${c.key}.cellsPoints`] = int(c.cells.total);
        s[`${c.key}.cellsStatistic`] = chi(c.cells.statistic);
        s[`${c.key}.cellsDf`] = int(c.cells.df);
        s[`${c.key}.cellsP`] = formatP(c.cells.pValue);
        s[`${c.key}.cellsMinExpected`] = fmt(c.cells.minExpected, 2);
        s[`${c.key}.cellsIllustrative`] = c.cells.illustrative ? 'illustrative only, expected counts below 5' : 'a test';
        s[`${c.key}.mirrored`] = int(c.mirrored);
        s[`${c.key}.total`] = int(c.total);
        s[`${c.key}.drawn`] = int(c.xs.length);
      }
      const cell = (k) =>
        data.panels.find((panel) => panel.key === k).cells.illustrative
          ? `${s[`${k}.cellsStatistic`]}, illustrative only`
          : `${s[`${k}.cellsStatistic`]}, ${pEq(s[`${k}.cellsP`])}`;
      const [a, b, c] = data.panels.map((panel) => panel.key);
      return {
        ...s,
        ...grid([
          [`${field(17)}: half-grid χ²(${s[`${a}.cellsDf`]})`, cell(a)],
          [`${field(1051)}: half-grid χ²(${s[`${b}.cellsDf`]})`, cell(b)],
          [`${field(16477)}: half-grid χ²(${s[`${c}.cellsDf`]})`, cell(c)],
          [
            'Points whose mirror (x, p − y) is present',
            data.panels.every((panel) => panel.mirrored === panel.total)
              ? 'All, in all three'
              : data.panels.map((panel) => `${int(panel.mirrored)} of ${int(panel.total)}`).join('; '),
          ],
        ]),
      };
    }
    case 'sequence': {
      const s = {
        ...base,
        'T17.period': int(data.toy.n),
        'T17.kMax': int(data.toy.k.at(-1)),
        'T17.kxR': fmt(data.r.toyKx, 3),
        'T17.lag1R': fmt(data.r.toyLag1, 3),
        'O1051.points': int(data.orbit.n - 1),
        'O1051.kxR': fmt(data.r.kx, 3),
        'O1051.kyR': fmt(data.r.ky, 3),
        'O1051.lag1R': fmt(data.r.lag1, 3),
        'O1051.mirrorR': fmt(data.r.mirror, 3),
      };
      return {
        ...s,
        ...grid([
          [`${field(17)}: period of x(kG)`, s['T17.period']],
          [`${field(1051)}: r(k, x)`, s['O1051.kxR']],
          [`${field(1051)}: lag-one r`, s['O1051.lag1R']],
          [`${field(1051)}: mirror r`, s['O1051.mirrorR']],
        ]),
      };
    }
    case 'ecdlp': {
      const f = data.fit;
      const last = data.rows.at(-1);
      const s = {
        ...base,
        population: `Simulation: ${data.targets} keys k drawn uniformly from [1, n − 1] on each of ${data.rows.length} curves y² = x³ + 7 of prime order, p = ${int(data.rows[0].p)} … ${int(last.p)}, seed ${data.seed}`,
        curves: int(data.rows.length),
        targets: int(data.targets),
        seed: String(data.seed),
        smallestP: int(data.rows[0].p),
        largestP: int(last.p),
        largestN: int(last.n),
        largestBruteMean: int(last.brute),
        largestBsgsMean: int(last.bsgs),
        largestSqrtN: int(Math.sqrt(last.n)),
        // The references drawn as dashed lines, at the largest curve: n/2 and 1.5·√n.
        bsgsReference: `${data.references.bsgsFactor}√n`,
        bruteReference: 'n/2',
        largestBsgsReference: int(data.references.bsgsFactor * Math.sqrt(last.n)),
        largestBruteReference: int(data.references.bruteFactor * last.n),
        bruteSlope: fmt(f.bruteSlope, 3),
        bsgsSlope: fmt(f.bsgsSlope, 3),
        bruteR: fmt(f.bruteR, 4),
        bsgsR: fmt(f.bsgsR, 4),
        bruteAt256: fmt(f.bruteAt256, 1),
        bsgsAt256: fmt(f.bsgsAt256, 1),
        theoryBruteAt256: fmt(f.theoryBrute, 1),
        theoryBsgsAt256: fmt(f.theoryBsgs, 1),
      };
      return {
        ...s,
        ...grid([
          ['Slope, exhaustive search', s.bruteSlope],
          ['Slope, baby-step giant-step', s.bsgsSlope],
          ['Fit at n ≈ 2²⁵⁶, exhaustive (log₂)', s.bruteAt256],
          ['Fit at n ≈ 2²⁵⁶, baby-step giant-step (log₂)', s.bsgsAt256],
        ]),
      };
    }
    case 'dblAddCost': {
      const a = data.assignment;
      const s = {
        ...base,
        k: String(a.k),
        bits: a.bits,
        repeated: int(a.repeatedAddition),
        doublings: int(a.doubleAndAdd.doublings),
        additions: int(a.doubleAndAdd.additions),
        total: int(a.doubleAndAdd.total),
        result: a.result,
        meanRepeated256: formatSci(data.meanRepeated),
        // The same number for markup: {{…Mantissa}} × 10<sup>{{…Exponent}}</sup>.
        meanRepeated256Mantissa: sciParts(data.meanRepeated).mantissa,
        meanRepeated256Exponent: sciParts(data.meanRepeated).exponent ?? '0',
        log2Repeated256: fmt(data.repeated.at(-1), 1),
        meanDoubleAndAdd256: fmt(data.meanDoubleAndAdd, 1),
      };
      return {
        ...s,
        ...grid([
          [`k = ${s.k}: repeated addition`, `${s.repeated} additions`],
          [`k = ${s.k}: double-and-add`, `${s.total} operations`],
          ['256-bit k: repeated addition', s.meanRepeated256],
          ['256-bit k: double-and-add', s.meanDoubleAndAdd256],
        ]),
      };
    }
    case 'sac': {
      const s = { ...base };
      for (const m of data.maps) {
        s[`${m.key}.trials`] = int(m.trials);
        s[`${m.key}.cells`] = int(256 * 256);
        s[`${m.key}.meanFrequency`] = fmt(m.meanFrequency, 4);
        s[`${m.key}.maxAbsDeviation`] = fmt(m.maxAbsDeviation, 3);
        s[`${m.key}.maxAbsZ`] = fmt(m.maxAbsZ, 2);
        s[`${m.key}.statistic`] = chi(m.statistic);
        s[`${m.key}.df`] = int(m.df);
        s[`${m.key}.p`] = formatP(m.pValue);
        s[`${m.key}.beyond`] = int(m.beyond);
        s[`${m.key}.expectedBeyond`] = fmt(m.expectedBeyond, 1);
        s[`${m.key}.discarded`] = int(m.discarded);
      }
      return s;
    }
    default:
      return base;
  }
}

/* ------------------------------------------------------------- markup */

/** The fields the page needs to redraw a chart at another width (null: the figure is not redrawn). */
export function compactData(kind, data) {
  return kind in FIGURE_SERIES ? data : null;
}

/* JSON inside <script>: "<" is escaped so that the data can never close the element. */
const jsonText = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * One series of a figure: the chart, and the compact data for redrawing.
 * @param {string} kind
 * @param {object} data
 * @param {{ id: string, series: string, hidden?: boolean, width?: number, rasterize?: Function }} options
 */
export function renderSeries(kind, data, { id, series, hidden = false, width = 640, rasterize }) {
  const chart = renderChart(kind, data, { id, width, rasterize });
  const compact = compactData(kind, data);
  return (
    `<div class="chart-figure__series" data-fig-series="${escapeXml(series)}"${hidden ? ' hidden' : ''}>` +
    `<div class="chart-figure__chart" data-fig-chart>${chart}</div>` +
    (compact ? `<script type="application/json" data-fig-data>${jsonText(compact)}</script>` : '') +
    `</div>`
  );
}

/** The statistics of every series of a figure, for the page script. */
export function renderStatsScript(statsBySeries) {
  return `<script type="application/json" data-fig-stats>${jsonText(statsBySeries)}</script>`;
}

/**
 * Figures of homework 02, shared by the build-time provider
 * (homework/02/figures.js) and the page script, so that a figure redrawn in
 * the browser is the figure the build printed.
 *
 *   - Chart kinds (renderChart, statsOf, compactData, renderSeries): the
 *     statistical experiments of §4, one or more "series" per figure.
 *   - Static figures: the pipeline ledger, the explorer output, the BIP-39
 *     bit grouping, the HD tree, the Keccak state lattice, the EIP-55
 *     breakdown, the timeline and the digest comparator. Each takes plain
 *     data (the output of deriveEthereumAccount, checksumBreakdown, …) and
 *     returns markup; the interactive versions of §3 and §5 mount on them.
 */

import {
  escapeXml,
  renderBandChart,
  renderCapacityBars,
  renderHistogram,
  renderIntervalDots,
  renderZStrip,
} from '../lib/charts.js';
import { formatNumber } from '../lib/probability-plot.js';
import { binomialPmfTable } from '../lib/stats.js';
import { bytesToHex } from '../lib/bytes.js';
import { sha256 } from '../lib/sha256.js';
import { fractionalYear } from './timeline.js';
import { bitDistance, bitString, hexToBitString, onesRuns, stripFraction } from './bits.js';

/* ------------------------------------------------------------ formats */

/** p-values as printed in captions and tables. */
export function formatP(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return 'n/a';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/**
 * A positive number with `digits` significant digits, in scientific notation
 * (8.4 × 10²⁸) outside [10⁻³, 10⁶).
 */
export function formatSci(x, digits = 3) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  if (x === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(x)));
  if (exponent >= -3 && exponent < 6) return String(Number(x.toPrecision(digits)));
  const [mantissa, exp] = x.toExponential(digits - 1).split('e');
  const e = String(Number(exp));
  return `${mantissa} × 10${[...e].map((c) => SUPERSCRIPT[c]).join('')}`;
}

const fmt = (v, d = 2) => (Number.isFinite(v) ? formatNumber(v, d) : 'n/a');
const int = (v) => (Number.isFinite(v) ? String(Math.round(v)) : 'n/a');
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const hex = (bytes) => (typeof bytes === 'string' ? bytes : bytesToHex(bytes));

/** JSON for an inline <script type="application/json">, safe against "</script>". */
export function jsonScript(value, attribute) {
  return `<script type="application/json" ${attribute}>${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}

/* ------------------------------------------------------------- labels */

export const STAGE_LABEL = Object.freeze({
  entropy: 'Entropy',
  mnemonic: 'Mnemonic (word indices)',
  seed: 'Seed',
  privateKey: 'Private key',
  publicKey: 'Public key (x ‖ y)',
  publicKeyX: 'Public key, x-coordinate',
  address: 'Address',
  checksummedAddress: 'Checksummed address',
});

export const MEASURE_LABEL = Object.freeze({
  weight: 'Hamming weight',
  avalanche: 'Avalanche distance',
  sibling: 'Distance to the sibling key',
});

const MEASURE_LAW = Object.freeze({
  weight: 'number of ones',
  avalanche: 'bits changed by one flipped entropy bit',
  sibling: "bits that differ between the keys at m/44'/60'/0'/0/0 and m/44'/60'/0'/0/1",
});

/** Chart kinds whose figures carry one or more series. */
export const SERIES_KINDS = Object.freeze(['entropyLedger', 'stages', 'addressBits', 'diffusion', 'vanity', 'addressCase', 'errorRates']);

/** The series a figure shows before any choice is made. */
export const DEFAULT_SERIES = Object.freeze({
  entropyLedger: 'w12',
  stages: 'address.avalanche',
  addressBits: 'all',
  diffusion: 'all',
  vanity: 'k1',
  addressCase: 'random',
  errorRates: 'all',
});

/* -------------------------------------------------------------- series */

const STAGES = Object.freeze(['seed', 'privateKey', 'publicKeyX', 'address']);
const MEASURES = Object.freeze(['weight', 'avalanche', 'sibling']);

/**
 * The series of one stage-and-measure histogram from a pipelineSample result.
 * @returns {object | null}
 */
export function stageSeries(pipeline, stage, measure) {
  const s = pipeline.stages[stage]?.[measure];
  if (!s) return null;
  return {
    stage,
    measure,
    bits: pipeline.stages[stage].bits,
    n: pipeline.n,
    seed: pipeline.seed,
    counts: s.counts,
    mean: s.mean,
    sd: s.sd,
    expectedMean: s.expectedMean,
    expectedSd: s.expectedSd,
    statistic: s.statistic,
    df: s.df,
    p: s.p,
  };
}

/** Every stage-and-measure series of a pipelineSample result, keyed "stage.measure". */
export function stagesSeriesOf(pipeline) {
  const out = {};
  for (const stage of STAGES) {
    for (const measure of MEASURES) {
      const s = stageSeries(pipeline, stage, measure);
      if (s) out[`${stage}.${measure}`] = s;
    }
  }
  return out;
}

function proportionRow(label, s, expected) {
  return { label, estimate: s.rate, low: s.interval.low, high: s.interval.high, expected, n: s.trials ?? s.n };
}

/**
 * The series of a chart kind, from the provider's experiment results:
 * { ledger, acceptance: { w12, w24 }, substitution: { w12, w24 }, pipeline,
 *   diffusion, vanity: { k1, k2 }, addressCase, errors }.
 * @returns {Record<string, object>}
 */
export function seriesOf(kind, results) {
  switch (kind) {
    case 'entropyLedger':
      return Object.fromEntries(
        [12, 24].map((words) => [
          `w${words}`,
          {
            words,
            rows: results.ledger.rows.map((r) => ({ stage: r.stage, ...r[`words${words}`] })),
          },
        ]),
      );
    case 'stages':
      return stagesSeriesOf(results.pipeline);
    case 'addressBits': {
      const a = results.pipeline.addressBits;
      return { all: { n: results.pipeline.n, seed: results.pipeline.seed, z: a.z, statistic: a.statistic, df: a.df, p: a.p, monobitP: a.monobitP, maxAbsZ: a.maxAbsZ } };
    }
    case 'diffusion': {
      const d = results.diffusion;
      return { all: { n: d.n, seed: d.seed, checkpoints: d.checkpoints, final: { mean: d.final.mean, sd: d.final.sd, statistic: d.final.statistic, df: d.final.df, p: d.final.p } } };
    }
    case 'vanity':
      return Object.fromEntries(
        Object.entries(results.vanity).map(([key, v]) => [
          key,
          {
            seed: v.seed,
            searches: v.searches,
            prefixNibbles: v.prefixNibbles,
            addressesGenerated: v.addressesGenerated,
            histogram: v.histogram.map(({ from, to, observed, expected }) => ({ from, to, observed, expected })),
            statistic: v.statistic,
            df: v.df,
            p: v.p,
            mean: v.mean,
            sd: v.sd,
            interval: v.interval,
            expectedMean: v.expectedMean,
            leadingZeros: { statistic: v.leadingZeros.test.statistic, df: v.leadingZeros.test.df, p: v.leadingZeros.test.p },
          },
        ]),
      );
    case 'addressCase': {
      const c = results.addressCase;
      const pick = (s) => ({ counts: s.counts, mean: s.mean, sd: s.sd, expectedMean: s.expectedMean, expectedSd: s.expectedSd, statistic: s.statistic, df: s.df, p: s.p });
      const out = { random: { population: 'random', n: c.n, seed: c.seed, letters: pick(c.random.letters), upper: pick(c.random.upper) } };
      if (c.real) out.real = { population: 'real', n: c.real.n, seed: results.pipeline?.seed ?? c.seed, letters: pick(c.real.letters), upper: pick(c.real.upper) };
      return out;
    }
    case 'errorRates': {
      const { acceptance, substitution, errors } = results;
      const rows = [
        proportionRow('BIP-39, 12 words: random word sequence accepted', { ...acceptance.w12, trials: acceptance.w12.n }, acceptance.w12.expectedRate),
        proportionRow('BIP-39, 12 words: one substituted word undetected', substitution.w12.overall, substitution.w12.overall.expectedRate),
        proportionRow('BIP-39, 24 words: random word sequence accepted', { ...acceptance.w24, trials: acceptance.w24.n }, acceptance.w24.expectedRate),
        proportionRow('BIP-39, 24 words: one substituted word undetected', substitution.w24.overall, substitution.w24.overall.expectedRate),
        proportionRow('EIP-55: random letter case accepted', errors.randomCase, errors.randomCase.expectedRate),
        proportionRow('EIP-55: one substituted character undetected', errors.substitution, errors.substitution.expectedRate),
      ];
      return { all: { rows, seeds: [acceptance.w12.seed, substitution.w12.seed, errors.seed] } };
    }
    default:
      throw new Error(`seriesOf: unknown kind "${kind}"`);
  }
}

/* -------------------------------------------------------------- charts */

function heightFor(kind, width) {
  const ratio = { histogram: 0.42, zstrip: 0.34, band: 0.46, pair: 0.3 }[kind] ?? 0.42;
  return Math.round(Math.min(460, Math.max(kind === 'pair' ? 200 : 250, width * ratio)));
}

function binomialBins(counts, bits, p, total, { from, to }) {
  const pmf = binomialPmfTable(bits, p);
  const bins = [];
  for (let k = from; k <= to; k += 1) bins.push({ label: String(k), observed: counts[k] ?? 0, expected: total * pmf[k] });
  return bins;
}

/* The range mean ± `spread` standard deviations of Bin(bits, p), clipped to [0, bits]. */
function binomialRange(bits, p, spread) {
  const mean = bits * p;
  const sd = Math.sqrt(bits * p * (1 - p));
  return { from: Math.max(0, Math.floor(mean - spread * sd)), to: Math.min(bits, Math.ceil(mean + spread * sd)) };
}

const binLabel = (b) => (b.to === null || b.to === undefined ? `≥ ${b.from}` : b.from === b.to ? String(b.from) : `${b.from}–${b.to}`);

const STEP_GLYPH = Object.freeze({ theta: 'θ', rho: 'ρ', pi: 'π', chi: 'χ', iota: 'ι' });

/**
 * The chart of one series.
 * @param {string} kind
 * @param {object} data a series of seriesOf (or its compact form)
 * @param {{ id: string, width?: number }} options
 * @returns {string} SVG markup
 */
export function renderChart(kind, data, { id, width = 960 } = {}) {
  const narrow = width < 520;
  switch (kind) {
    case 'entropyLedger':
      return renderCapacityBars({
        id,
        title: `Representation size and maximum entropy of every stage of the pipeline, ${data.words}-word mnemonic`,
        desc: `For each stage, the hollow bar is the number of bits of its representation and the filled bar the number of bits of entropy it can carry: ${data.rows
          .map((r) => `${STAGE_LABEL[r.stage] ?? r.stage}, ${r.entropyBits} of ${r.representationBits}`)
          .join('; ')}.`,
        rows: data.rows.map((r) => ({ label: STAGE_LABEL[r.stage] ?? r.stage, total: r.representationBits, part: r.entropyBits })),
        max: 512,
        width,
        rowHeight: narrow ? 42 : 44,
        xLabel: 'Bits',
        totalLabel: 'Representation',
        partLabel: 'Maximum entropy',
      });
    case 'stages': {
      const total = sum(data.counts);
      const range = binomialRange(data.bits, 0.5, 4.5);
      const bins = binomialBins(data.counts, data.bits, 0.5, total, range);
      const stage = STAGE_LABEL[data.stage] ?? data.stage;
      return renderHistogram({
        id,
        title: `${MEASURE_LABEL[data.measure]} of the ${stage.toLowerCase()} (${data.bits} bits) over ${total} simulated wallets, against Bin(${data.bits}, ½)`,
        desc: `Bars are the observed counts of the ${MEASURE_LAW[data.measure]} for each value from ${range.from} to ${range.to}; the step line is the expected count under Bin(${data.bits}, ½), mean ${data.bits / 2} and standard deviation ${fmt(Math.sqrt(data.bits) / 2, 2)}.`,
        bins,
        width,
        height: heightFor('histogram', width),
        xLabel: data.measure === 'weight' ? 'Number of ones' : 'Number of differing bits',
        yLabel: 'Wallets',
        labelEvery: narrow ? 16 : 8,
      });
    }
    case 'addressBits':
      return renderZStrip({
        id,
        title: `z-score of the frequency of ones at each of the 160 address bit positions, over ${data.n} simulated addresses`,
        desc: 'Lollipops beyond the dashed ±1.96 rules are the positions whose frequency of ones departs from one half at the 5% level; 8 of 160 are expected to do so under uniformity.',
        z: data.z,
        width,
        height: heightFor('zstrip', width),
        xLabel: 'Address bit position j',
      });
    case 'diffusion': {
      const points = [];
      for (const c of data.checkpoints) {
        if (c.step !== 'round') {
          const glyph = STEP_GLYPH[c.step] ?? c.step;
          points.push({ label: c.label, tick: narrow && !['theta', 'chi'].includes(c.step) ? '' : glyph, mean: c.mean, q1: c.q1, q3: c.q3 });
        } else if (c.round > 3) {
          const shown = narrow ? c.round % 8 === 0 : c.round % 4 === 0;
          points.push({ label: c.label, tick: shown ? String(c.round) : '', mean: c.mean, q1: c.q1, q3: c.q3 });
        }
      }
      const stepCount = points.findIndex((p) => !p.label.includes(' '));
      const groups = [0, 1, 2]
        .filter((r) => (r + 1) * 5 <= stepCount)
        .map((r) => ({ from: 5 * r, to: 5 * r + 4, label: narrow ? `R${r + 1}` : `Round ${r + 1}` }));
      if (stepCount >= 0 && stepCount < points.length) groups.push({ from: stepCount, to: points.length - 1, label: narrow ? 'Rounds 4–24' : 'Rounds 4 to 24 (complete rounds)' });
      return renderBandChart({
        id,
        title: `Number of differing state bits after each step of rounds 1 to 3 and after each later round of Keccak-f[1600], ${data.n} simulated state pairs`,
        desc: `Points are the mean number of differing bits between two states that start one bit apart; the band is the interquartile range; the dashed reference is 800, the mean of Bin(1600, ½). After round 1 the mean is ${fmt(data.checkpoints.find((c) => c.label === 'R1 χ')?.mean ?? NaN, 1)}; after round 24 it is ${fmt(data.final.mean, 1)}.`,
        points,
        references: [{ value: 800, label: 'Bin(1600, ½) mean, 800' }],
        groups,
        yLog: true,
        yDomain: [1, 2500],
        width,
        height: heightFor('band', width),
        xLabel: 'Step mapping (rounds 1 to 3) and round number',
        yLabel: 'Differing bits',
      });
    }
    case 'vanity': {
      const bins = data.histogram.map((b) => ({ label: binLabel(b), observed: b.observed, expected: b.expected }));
      return renderHistogram({
        id,
        title: `Trials needed to find an address with ${data.prefixNibbles} leading zero hex digit${data.prefixNibbles > 1 ? 's' : ''}, ${data.searches} simulated searches`,
        desc: `Bars are the observed number of searches whose trial count falls in each bin; bins are cut at the twentieths of the geometric law with success probability 1/${16 ** data.prefixNibbles}, and the step is the expected count under that law.`,
        bins,
        width,
        height: heightFor('histogram', width),
        xLabel: 'Trials until success',
        yLabel: 'Searches',
        labelEvery: narrow ? 4 : 2,
      });
    }
    case 'addressCase': {
      const panel = (key, p, label, axis) => {
        const s = data[key];
        const total = sum(s.counts);
        const range = binomialRange(40, p, 4);
        return renderHistogram({
          id: `${id}-${key}`,
          title: `${label} in ${total} ${data.population === 'real' ? 'pipeline' : 'uniformly random'} addresses, against Bin(40, ${p === 6 / 16 ? '6/16' : '3/16'})`,
          desc: `Bars are observed counts for each value from ${range.from} to ${range.to}; the step is the expected count under Bin(40, ${p === 6 / 16 ? '6/16' : '3/16'}), mean ${fmt(40 * p, 1)}.`,
          bins: binomialBins(s.counts, 40, p, total, range),
          width: narrow ? width : Math.round((width - 24) / 2),
          height: heightFor('pair', narrow ? width : width / 2) + 40,
          xLabel: axis,
          yLabel: '',
          labelEvery: 2,
        });
      };
      return (
        `<div class="hw02-pair">` +
        `<div class="hw02-pair__panel">${panel('letters', 6 / 16, 'Letters a–f among the 40 hex digits', 'Letters L')}</div>` +
        `<div class="hw02-pair__panel">${panel('upper', 3 / 16, 'Upper-case letters after EIP-55', 'Upper-case letters U')}</div>` +
        `</div>`
      );
    }
    case 'errorRates':
      return renderIntervalDots({
        id,
        title: 'Probability that a random error passes the BIP-39 and EIP-55 checks: exact value and Monte Carlo estimate',
        desc: `For each check, the ink tick is the exact probability, the point the simulated proportion and the line its 95% Wilson interval: ${data.rows
          .map((r) => `${r.label}, exact ${formatSci(r.expected, 3)}, estimate ${formatSci(r.estimate, 3)}`)
          .join('; ')}.`,
        rows: data.rows,
        xDomain: [1e-5, 1],
        width,
        rowHeight: narrow ? 50 : 46,
        xLabel: 'Probability (logarithmic scale)',
      });
    default:
      throw new Error(`renderChart: unknown kind "${kind}"`);
  }
}

/* --------------------------------------------------------------- stats */

/** The statistics a figure caption quotes, as display strings. */
export function statsOf(kind, data) {
  switch (kind) {
    case 'entropyLedger': {
      const by = Object.fromEntries(data.rows.map((r) => [r.stage, r]));
      return {
        words: String(data.words),
        entropy: int(by.entropy?.entropyBits),
        seedBits: int(by.seed?.representationBits),
        addressEntropy: int(by.address?.entropyBits),
      };
    }
    case 'stages':
      return {
        series: `${STAGE_LABEL[data.stage]}, ${MEASURE_LABEL[data.measure].toLowerCase()}`,
        bits: int(data.bits),
        n: int(data.n),
        seed: String(data.seed),
        mean: fmt(data.mean, 2),
        sd: fmt(data.sd, 2),
        expectedMean: fmt(data.expectedMean, 0),
        expectedSd: fmt(data.expectedSd, 2),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
      };
    case 'addressBits':
      return {
        n: int(data.n),
        seed: String(data.seed),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
        monobitP: formatP(data.monobitP),
        maxAbsZ: fmt(data.maxAbsZ, 2),
        beyondTwoSigma: int(data.z.filter((v) => Math.abs(v) > 1.959963984540054).length),
      };
    case 'diffusion': {
      const at = (label) => data.checkpoints.find((c) => c.label === label);
      return {
        n: int(data.n),
        seed: String(data.seed),
        r1theta: fmt(at('R1 θ')?.mean, 2),
        r1chi: fmt(at('R1 χ')?.mean, 2),
        r2: fmt(at('R2')?.mean, 1),
        r3: fmt(at('R3')?.mean, 1),
        r4: fmt(at('R4')?.mean, 1),
        finalMean: fmt(data.final.mean, 2),
        finalSd: fmt(data.final.sd, 2),
        statistic: fmt(data.final.statistic, 1),
        df: int(data.final.df),
        p: formatP(data.final.p),
      };
    }
    case 'vanity':
      return {
        series: `${data.prefixNibbles} leading zero hex digit${data.prefixNibbles > 1 ? 's' : ''}`,
        k: int(data.prefixNibbles),
        searches: int(data.searches),
        seed: String(data.seed),
        generated: int(data.addressesGenerated),
        mean: fmt(data.mean, 2),
        low: fmt(data.interval.low, 1),
        high: fmt(data.interval.high, 1),
        expectedMean: int(data.expectedMean),
        sd: fmt(data.sd, 1),
        statistic: fmt(data.statistic, 1),
        df: int(data.df),
        p: formatP(data.p),
        lzStatistic: fmt(data.leadingZeros.statistic, 2),
        lzDf: int(data.leadingZeros.df),
        lzP: formatP(data.leadingZeros.p),
      };
    case 'addressCase':
      return {
        series: data.population === 'real' ? 'Addresses from the pipeline sample' : 'Uniformly random 160-bit strings',
        n: int(data.n),
        seed: String(data.seed),
        lMean: fmt(data.letters.mean, 3),
        lSd: fmt(data.letters.sd, 3),
        lStatistic: fmt(data.letters.statistic, 1),
        lDf: int(data.letters.df),
        lP: formatP(data.letters.p),
        uMean: fmt(data.upper.mean, 3),
        uSd: fmt(data.upper.sd, 3),
        uStatistic: fmt(data.upper.statistic, 1),
        uDf: int(data.upper.df),
        uP: formatP(data.upper.p),
      };
    case 'errorRates':
      return { rows: int(data.rows.length) };
    default:
      return {};
  }
}

/** The fields the page needs to redraw a chart at another width. */
export function compactData(kind, data) {
  switch (kind) {
    case 'addressBits':
      return { ...data, z: data.z.map((v) => +v.toFixed(3)) };
    case 'diffusion':
      return {
        ...data,
        checkpoints: data.checkpoints.map(({ label, round, step, mean, q1, q3 }) => ({ label, round, step, mean: +mean.toFixed(2), q1, q3 })),
      };
    case 'vanity':
      return { ...data, histogram: data.histogram.map((b) => ({ ...b, expected: +b.expected.toFixed(3) })) };
    default:
      return data;
  }
}

/* -------------------------------------------------------------- markup */

/**
 * One series of a figure. A hidden series ships its data only: its controls
 * exist only when scripting runs, which then draws it on demand.
 * @param {string} kind
 * @param {object} data
 * @param {{ id: string, series: string, hidden?: boolean, width?: number }} options
 */
export function renderSeries(kind, data, { id, series, hidden = false, width = 960 }) {
  const chart = hidden ? '' : renderChart(kind, data, { id, width });
  return (
    `<div class="chart-figure__series" data-fig-series="${escapeXml(series)}"${hidden ? ' hidden' : ''}>` +
    `<div class="chart-figure__chart" data-fig-chart>${chart}</div>` +
    jsonScript(compactData(kind, data), 'data-fig-data') +
    `</div>`
  );
}

/** The statistics of every series of a figure, for the page script. */
export function renderStatsScript(statsBySeries) {
  return jsonScript(statsBySeries, 'data-fig-stats');
}

/* ------------------------------------------------------ pipeline ledger */

/** The operation classes of §2, as printed on the ledger tags. */
export const OPERATION_CLASS = Object.freeze({
  generation: 'Generation',
  encodingChecksum: 'Encoding + checksum',
  stretching: 'Derivation · key stretching',
  hd: 'Derivation · HD',
  publicKey: 'Public-key',
  hashing: 'Hashing',
  truncation: 'Hashing · truncation',
  checksumEncoding: 'Checksum + encoding',
});

/** The operation that maps each stage of the ledger to the next one. */
export const PIPELINE_LINKS = Object.freeze(['BIP-39 encoding', 'PBKDF2-HMAC-SHA512', 'BIP-32 / BIP-44', 'secp256k1', 'Keccak-256', 'Last 20 bytes', 'EIP-55']);

/** For each hex digit of a checksummed address, '1' when EIP-55 prints it in upper case. */
export function casePattern(checksummed) {
  return [...checksummed.slice(2)].map((c) => (c >= 'A' && c <= 'F' ? '1' : '0')).join('');
}

/**
 * The eight stages of the pipeline with their values and their bits (in
 * reading order), from the output of deriveEthereumAccount.
 * @param {object} account
 */
export function pipelineStages(account) {
  const words = account.words.length;
  const cs = account.checksumBits.length;
  const stages = [
    { key: 'entropy', name: 'Entropy', standard: 'BIP-39', cls: 'generation', operation: `ENT = ${account.entropyBits.length} random bits`, value: hex(account.entropy), bitString: account.entropyBits },
    { key: 'mnemonic', name: 'Mnemonic', standard: 'BIP-39', cls: 'encodingChecksum', operation: `CS = ${cs} bits of SHA-256(entropy) appended; ${words} words of 11 bits`, value: account.mnemonic, bitString: account.entropyBits + account.checksumBits },
    { key: 'seed', name: 'Seed', standard: 'BIP-39', cls: 'stretching', operation: 'PBKDF2-HMAC-SHA512, 2048 iterations, salt "mnemonic" + passphrase', value: hex(account.seed), bitString: bitString(account.seed) },
    { key: 'privateKey', name: 'Private key', standard: 'BIP-32 / BIP-44', cls: 'hd', operation: `master key from HMAC-SHA512 with key "Bitcoin seed", then CKDpriv along ${account.path}`, value: hex(account.privateKey), bitString: bitString(account.privateKey) },
    { key: 'publicKey', name: 'Public key', standard: 'secp256k1', cls: 'publicKey', operation: 'K = k · G, uncompressed 04 ‖ x ‖ y; the strip shows x ‖ y', value: hex(account.publicKey), bitString: bitString(account.publicKey.subarray(1)) },
    { key: 'digest', name: 'Keccak-256 digest', standard: 'Keccak-256', cls: 'hashing', operation: 'Keccak-256(x ‖ y), 32 bytes', value: hex(account.keccakDigest), bitString: bitString(account.keccakDigest) },
    { key: 'address', name: 'Address', standard: 'Ethereum', cls: 'truncation', operation: 'the last 20 bytes of the digest, in lower-case hex', value: account.address, bitString: bitString(account.keccakDigest.subarray(12)) },
    { key: 'checksummed', name: 'Checksummed address', standard: 'EIP-55', cls: 'checksumEncoding', operation: 'letter case from Keccak-256 of the lower-case hex', value: account.checksummed, bitString: bitString(account.keccakDigest.subarray(12)), casePattern: casePattern(account.checksummed) },
  ];
  return stages.map((s, i) => ({ ...s, bits: s.bitString.length, link: PIPELINE_LINKS[i] ?? null }));
}

/**
 * A thin ruled strip (its frame is the border of the outer span) as wide as
 * the stage's share of 512 bits, its 1-bits marked in plot red; under a checksummed address, a second row marks the
 * hex digits that EIP-55 prints in upper case.
 * @param {string} key
 * @param {string} bits '0'/'1' string
 * @param {{ casePattern?: string }} [options]
 */
export function renderBitStrip(key, bits, { casePattern: cases } = {}) {
  const n = bits.length;
  const h = cases ? 7 : 4;
  const marks = onesRuns(bits)
    .map(([start, length]) => `M${start} 0h${length}v4h-${length}z`)
    .join('');
  const caseRow = cases
    ? `<path class="strip__case" d="${[...cases]
        .map((c, i) => (c === '1' ? `M${4 * i + 0.5} 5h3v2h-3z` : ''))
        .join('')}"/>`
    : '';
  return (
    `<span class="strip" data-strip="${escapeXml(key)}" style="--strip:${stripFraction(n)}">` +
    `<svg class="strip__bits" viewBox="0 0 ${n} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    `<path class="strip__marks" d="${marks}"/>` +
    caseRow +
    `</svg></span>`
  );
}

/**
 * Fig. "pipeline ledger": one ruled row per stage, its operation class tag,
 * the operation, the bit strip and the value of the worked example, each row
 * linked to the next by the operation that produces it.
 * @param {object} account output of deriveEthereumAccount
 */
export function renderPipelineLedger(account) {
  const rows = pipelineStages(account).map((s, i) => {
    const upper = s.casePattern ? [...s.casePattern].filter((c) => c === '1').length : 0;
    const note = s.casePattern ? `<span class="ledger__strip-note">lower row: the ${upper} letters printed in upper case</span>` : '';
    const link = s.link
      ? `<p class="ledger__link"><svg class="ledger__arrow" viewBox="0 0 10 26" width="10" height="26" aria-hidden="true" focusable="false"><path class="ledger__arrow-line" d="M5 0V25"/><path class="ledger__arrow-head" d="M1.5 20.5L5 25l3.5-4.5"/></svg>` +
        `<span class="visually-hidden">Next stage by </span><span class="ledger__link-label">${escapeXml(s.link)}</span></p>`
      : '';
    return (
      `<li class="ledger__stage" data-pipeline-stage="${s.key}" style="--i:${i}">` +
      `<div class="ledger__head">` +
      `<span class="ledger__no" aria-hidden="true">${i + 1}</span>` +
      `<span class="ledger__name">${escapeXml(s.name)}</span>` +
      `<span class="ledger__std">${escapeXml(s.standard)}</span>` +
      `<span class="ledger__class" data-class="${s.cls}">${escapeXml(OPERATION_CLASS[s.cls])}</span>` +
      `</div>` +
      `<p class="ledger__strip"><span class="ledger__track">${renderBitStrip(s.key, s.bitString, { casePattern: s.casePattern })}</span>` +
      `<span class="ledger__bits">${s.bits} bits</span>${note}</p>` +
      `<p class="ledger__op">${escapeXml(s.operation)}</p>` +
      `<p class="ledger__value"><code data-pipeline-value="${s.key}">${escapeXml(s.value)}</code></p>` +
      link +
      `</li>`
    );
  });
  return `<ol class="ledger" data-pipeline-stages>${rows.join('')}</ol>`;
}

/* ------------------------------------------------------ explorer output */

/**
 * The output panel of the live explorer for one account: every intermediate
 * value, grouped under the operation class that produced it.
 * @param {object} account output of deriveEthereumAccount
 */
export function renderExplorerOutput(account) {
  const cell = (key, caption, value, { wide = false, mono = true } = {}) =>
    `<div class="demo__cell${wide ? ' demo__cell--wide' : ''}"><span class="caption" data-explorer-caption="${key}">${escapeXml(caption)}</span>` +
    `<span class="demo__value${mono ? ' demo__value--mono' : ''}" data-explorer-out="${key}">${escapeXml(value)}</span></div>`;
  const group = (cls, cells) =>
    `<div class="explorer__group"><dt><span class="ledger__class" data-class="${cls}">${escapeXml(OPERATION_CLASS[cls])}</span></dt>` +
    `<dd class="demo__grid">${cells.join('')}</dd></div>`;
  return (
    `<dl class="explorer__out">` +
    group('generation', [cell('entropy', `Entropy (${account.entropyBits.length} bits)`, hex(account.entropy), { wide: true })]) +
    group('encodingChecksum', [
      cell('indices', 'Word indices (11 bits each)', account.wordIndices.join(' '), { mono: false }),
      cell('checksum', 'Checksum bits', account.checksumBits),
    ]) +
    group('stretching', [cell('seed', 'Seed (512 bits)', hex(account.seed), { wide: true })]) +
    group('hd', [
      cell('master', 'Master private key', hex(account.master.privateKey), { wide: true }),
      cell('path', 'Derivation path', account.path, { mono: false }),
      cell('privateKey', 'Private key k', hex(account.privateKey)),
    ]) +
    group('publicKey', [cell('publicKey', 'Public key K = k · G (uncompressed)', hex(account.publicKey), { wide: true })]) +
    group('hashing', [cell('digest', 'Keccak-256(x ‖ y)', hex(account.keccakDigest), { wide: true })]) +
    group('truncation', [cell('address', 'Address (last 20 bytes)', account.address, { wide: true })]) +
    group('checksumEncoding', [cell('checksummed', 'Checksummed address (EIP-55)', account.checksummed, { wide: true })]) +
    `</dl>`
  );
}

/* -------------------------------------------------------- BIP-39 bits */

/**
 * Fig. "BIP-39 bit grouping": the entropy bits and the checksum bits as one
 * stream, cut by 11-bit brackets into word indices.
 * @param {object} account output of deriveEthereumAccount (or deriveLenient)
 */
export function renderBip39Grouping(account) {
  const ent = account.entropyBits.length;
  const cs = account.checksumBits.length;
  const firstByte = sha256(account.entropy)[0].toString(2).padStart(8, '0');
  const cellOf = (b, extra = '') => `<span class="bip39__bit${extra}${b === '1' ? ' is-one' : ''}">${b}</span>`;
  const words = account.words.map((word, i) => {
    const bits = account.wordIndices[i].toString(2).padStart(11, '0');
    const isLast = i === account.words.length - 1;
    const cells = isLast
      ? [...bits.slice(0, 11 - cs)].map((b) => cellOf(b)).join('') + `<span class="bip39__cs">${[...bits.slice(11 - cs)].map((b) => cellOf(b, ' is-cs')).join('')}</span>`
      : [...bits].map((b) => cellOf(b)).join('');
    const spoken = isLast ? `${bits.slice(0, 11 - cs)}, checksum ${bits.slice(11 - cs)}` : bits;
    return (
      `<li class="bip39__word" data-bip39-word="${i}">` +
      `<span class="bip39__cells" aria-hidden="true">${cells}</span>` +
      `<svg class="bip39__bracket" viewBox="0 0 110 8" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0.75 0V6.5H109.25V0"/></svg>` +
      `<span class="bip39__label" aria-hidden="true"><span class="bip39__pos">${i + 1}</span>` +
      `<span class="bip39__text">${escapeXml(word)}</span>` +
      `<span class="bip39__index">${account.wordIndices[i]}</span></span>` +
      `<span class="visually-hidden">Word ${i + 1}, ${escapeXml(word)}: bits ${spoken}, index ${account.wordIndices[i]}.</span>` +
      `</li>`
    );
  });
  return (
    `<div class="bip39">` +
    `<dl class="bip39__sum">` +
    `<div><dt>Entropy</dt><dd>${ent} bits</dd></div>` +
    `<div><dt>SHA-256(entropy), first byte</dt><dd><span class="bip39__cs-legend">${firstByte.slice(0, cs)}</span>${firstByte.slice(cs)}</dd></div>` +
    `<div><dt>Checksum CS = ENT / 32</dt><dd>${cs} bits</dd></div>` +
    `<div><dt>Words</dt><dd>(${ent} + ${cs}) / 11 = ${account.words.length}</dd></div>` +
    `</dl>` +
    `<ol class="bip39__words">${words.join('')}</ol>` +
    `</div>`
  );
}

/* ------------------------------------------------------------- HD tree */

/**
 * The tree drawn by Fig. "HD tree": the trunk m/44'/60'/0'/0 and three
 * leaves m/44'/60'/0'/0/i.
 * @param {{ account: object, siblings: { path: string, checksummed: string }[] }} example
 */
export function hdTreeModel(example) {
  const level = ['master', 'purpose', 'coin type', 'account', 'change'];
  const trunk = example.account.chain.slice(0, 5).map((c, i) => ({
    path: c.path,
    label: i === 0 ? 'm' : c.path.split('/').at(-1),
    hardened: c.hardened,
    role: level[i],
  }));
  const leaves = example.siblings.map((s) => ({ path: s.path, label: s.path.split('/').at(-1), address: s.checksummed }));
  return { trunk, leaves };
}

/**
 * The HD tree as SVG: hardened edges as double rules, normal edges as single
 * rules, so the distinction prints in ink alone.
 * @param {{ trunk: { path: string, label: string, hardened: boolean, role: string }[],
 *   leaves: { path: string, label: string, address: string }[] }} model
 * @param {{ id: string }} options
 */
export function renderHdTree(model, { id }) {
  const W = 600;
  const box = { w: 46, h: 26 };
  const step = 54;
  const x0 = 18;
  const trunkY = (i) => 14 + i * step;
  const leafTop = trunkY(model.trunk.length - 1) + step;
  const leafStep = 44;
  const leafX = x0 + 120;
  const H = leafTop + (model.leaves.length - 1) * leafStep + box.h + 14;
  const out = [
    `<svg class="hdtree" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="${id}-title ${id}-desc">`,
    `<title id="${id}-title">Derivation tree of the BIP-44 path m/44'/60'/0'/0 and its first ${model.leaves.length} addresses</title>`,
    `<desc id="${id}-desc">From the master node m, three hardened derivations (purpose 44', coin type 60', account 0') drawn as double rules, then the normal derivation of the external chain 0 and of the address indices ${model.leaves.map((l) => l.label).join(', ')}, drawn as single rules. Leaves: ${model.leaves.map((l) => `${l.path}, ${l.address}`).join('; ')}.</desc>`,
  ];
  const edge = (x1, y1, x2, y2, hardened, k) => {
    const lines = [];
    if (hardened) {
      // Two parallel rules, offset perpendicular to the edge.
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (-(y2 - y1) / len) * 2;
      const ny = ((x2 - x1) / len) * 2;
      for (const s of [-1, 1]) {
        lines.push(`<line class="hdtree__rule" x1="${(x1 + s * nx).toFixed(1)}" y1="${(y1 + s * ny).toFixed(1)}" x2="${(x2 + s * nx).toFixed(1)}" y2="${(y2 + s * ny).toFixed(1)}"/>`);
      }
    } else {
      lines.push(`<line class="hdtree__rule" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
    }
    return `<g class="hdtree__edge" data-edge="${hardened ? 'hardened' : 'normal'}" data-hdtree-edge="${k}">${lines.join('')}</g>`;
  };
  const cx = x0 + box.w / 2;
  const edges = [];
  let k = 0;
  model.trunk.forEach((n, i) => {
    if (i === 0) return;
    edges.push(edge(cx, trunkY(i - 1) + box.h, cx, trunkY(i), n.hardened, k));
    k += 1;
  });
  const parentBottom = trunkY(model.trunk.length - 1) + box.h;
  model.leaves.forEach((leaf, j) => {
    edges.push(edge(cx, parentBottom, leafX, leafTop + j * leafStep + box.h / 2, false, k));
    k += 1;
  });
  out.push(`<g class="hdtree__layer hdtree__layer--edges">${edges.join('')}</g>`);

  const nodes = [];
  model.trunk.forEach((n, i) => {
    const y = trunkY(i);
    nodes.push(
      `<g class="hdtree__node" data-hdtree-node="${escapeXml(n.path)}">` +
        `<rect x="${x0}" y="${y}" width="${box.w}" height="${box.h}"/>` +
        `<text class="hdtree__label" x="${cx}" y="${y + 17}" text-anchor="middle">${escapeXml(n.label)}</text>` +
        `<text class="hdtree__role" x="${x0 + box.w + 14}" y="${y + 11}">${escapeXml(n.role)}</text>` +
        `<text class="hdtree__path" x="${x0 + box.w + 14}" y="${y + 24}">${escapeXml(n.path)}</text>` +
        `</g>`,
    );
  });
  model.leaves.forEach((leaf, j) => {
    const y = leafTop + j * leafStep;
    nodes.push(
      `<g class="hdtree__node hdtree__node--leaf" data-hdtree-node="${escapeXml(leaf.path)}">` +
        `<rect x="${leafX}" y="${y}" width="${box.w}" height="${box.h}"/>` +
        `<text class="hdtree__label" x="${leafX + box.w / 2}" y="${y + 17}" text-anchor="middle">${escapeXml(leaf.label)}</text>` +
        `<text class="hdtree__path" x="${leafX + box.w + 12}" y="${y + 11}">${escapeXml(leaf.path)}</text>` +
        `<text class="hdtree__address" x="${leafX + box.w + 12}" y="${y + 25}">${escapeXml(leaf.address)}</text>` +
        `</g>`,
    );
  });
  out.push(`<g class="hdtree__layer hdtree__layer--nodes">${nodes.join('')}</g>`);
  out.push(
    `<g class="hdtree__legend" aria-hidden="true">` +
      `<line class="hdtree__rule hdtree__swatch" x1="${W - 196}" y1="16" x2="${W - 166}" y2="16"/><line class="hdtree__rule hdtree__swatch" x1="${W - 196}" y1="20" x2="${W - 166}" y2="20"/>` +
      `<text class="hdtree__role" x="${W - 158}" y="22">hardened, index ≥ 2³¹</text>` +
      `<line class="hdtree__rule hdtree__swatch" x1="${W - 196}" y1="40" x2="${W - 166}" y2="40"/>` +
      `<text class="hdtree__role" x="${W - 158}" y="44">normal, index &lt; 2³¹</text>` +
      `</g>`,
  );
  out.push('</svg>');
  return out.join('');
}

/* ------------------------------------------------------- Keccak lattice */

/**
 * Fig. "Keccak state": the 5 × 5 × 64 bits of the Keccak-f[1600] state in
 * an orthographic projection at a fixed angle, the bits that differ between
 * two states (one checkpoint of keccakDiffusionTrace) in plot red. State bit
 * i = 64(x + 5y) + z is bit (i mod 8) of byte ⌊i / 8⌋ of the mask.
 * @param {{ mask: string, label: string, count: number }} step
 * @param {{ id: string, width?: number, yaw?: number, pitch?: number }} options
 */
export function renderKeccakLattice(step, { id, width = 720, yaw = -0.5, pitch = 0.38 } = {}) {
  const bytes = step.mask.match(/../g).map((h) => parseInt(h, 16));
  const zGap = 0.62;
  const project = (x, y, z) => {
    // World: u along the lane (z), v across (x), w up (y); yaw about w, then pitch about the screen axis.
    const u = (z - 31.5) * zGap;
    const v = x - 2;
    const w = 2 - y;
    const u1 = u * Math.cos(yaw) - v * Math.sin(yaw);
    const v1 = u * Math.sin(yaw) + v * Math.cos(yaw);
    const w2 = w * Math.cos(pitch) + v1 * Math.sin(pitch);
    const depth = v1 * Math.cos(pitch) - w * Math.sin(pitch);
    return { sx: u1, sy: -w2, depth };
  };
  const points = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      for (let z = 0; z < 64; z += 1) {
        const i = 64 * (x + 5 * y) + z;
        const on = (bytes[i >> 3] >> (i & 7)) & 1;
        points.push({ ...project(x, y, z), on });
      }
    }
  }
  const xs = points.map((p) => p.sx);
  const ys = points.map((p) => p.sy);
  const pad = 22;
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const scale = (width - 2 * pad) / (Math.max(...xs) - minX);
  const height = Math.round((Math.max(...ys) - minY) * scale + 2 * pad + 22);
  const sx = (p) => (pad + (p.sx - minX) * scale).toFixed(1);
  const sy = (p) => (pad + (p.sy - minY) * scale).toFixed(1);
  points.sort((a, b) => b.depth - a.depth);
  const path = (on) =>
    points
      .filter((p) => p.on === on)
      .map((p) => `M${sx(p)} ${sy(p)}h0`)
      .join('');
  const origin = project(0, 0, 0);
  const zEnd = project(0, 0, 63);
  return (
    `<svg class="lattice" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" data-lattice-checkpoint="${escapeXml(step.label)}">` +
    `<title id="${id}-title">The 1600 bits of the Keccak-f[1600] state after ${escapeXml(step.label)}, as a 5 × 5 × 64 lattice</title>` +
    `<desc id="${id}-desc">Each dot is one bit of the state, arranged by its lane coordinates x and y (5 by 5) and its position z along the 64-bit lane. The ${step.count} red dots are the bits in which two states that started one bit apart differ after ${escapeXml(step.label)}; the other ${1600 - step.count} bits agree.</desc>` +
    `<path class="lattice__bit" d="${path(0)}"/>` +
    `<path class="lattice__bit is-different" d="${path(1)}"/>` +
    `<g class="lattice__axes" aria-hidden="true">` +
    `<text class="lattice__axis" x="${sx(origin)}" y="${(Number(sy(origin)) - 10).toFixed(1)}" text-anchor="middle">z = 0</text>` +
    `<text class="lattice__axis" x="${sx(zEnd)}" y="${(Number(sy(zEnd)) - 10).toFixed(1)}" text-anchor="middle">z = 63</text>` +
    `<text class="lattice__axis" x="${pad}" y="${height - 6}">5 × 5 lanes (x, y) × 64 bits (z); ${step.count} of 1600 bits differ after ${escapeXml(step.label)}</text>` +
    `</g></svg>`
  );
}

/* ------------------------------------------------------------- EIP-55 */

/**
 * Fig. "EIP-55": every hex digit of the address with the nibble of
 * Keccak-256(lower-case address) that sets its case.
 * @param {ReturnType<import('../lib/ethereum.js').checksumBreakdown>} b
 */
export function renderEip55Breakdown(b) {
  const mark = (c) => {
    if (!c.isLetter) return '';
    return `<svg class="eip55__mark" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="3.4"/></svg>`;
  };
  const cells = b.characters.map((c) => {
    const kind = c.isLetter ? (c.upper ? 'upper' : 'lower') : 'digit';
    const sr = c.isLetter ? `${c.upper ? 'upper' : 'lower'} case, nibble ${c.nibble.toString(16)}` : `digit, nibble ${c.nibble.toString(16)}`;
    return (
      `<li class="eip55__char" data-case="${kind}" data-eip55-index="${c.index}">` +
      `<span class="eip55__glyph">${escapeXml(c.char)}</span>` +
      `<span class="eip55__nibble">${c.nibble.toString(16)}</span>` +
      mark(c) +
      `<span class="visually-hidden">${sr}</span>` +
      `</li>`
    );
  });
  return (
    `<div class="eip55">` +
    `<p class="eip55__line"><span class="caption">Lower-case address</span><code>${escapeXml(b.lowercase)}</code></p>` +
    `<p class="eip55__line"><span class="caption">Keccak-256 of its 40 ASCII hex digits</span><code>${escapeXml(b.hash)}</code></p>` +
    `<ol class="eip55__chars" aria-label="The 40 hex digits of the checksummed address with their hash nibbles">${cells.join('')}</ol>` +
    `<p class="eip55__line"><span class="caption">Checksummed address</span><code>${escapeXml(b.checksummed)}</code></p>` +
    `</div>`
  );
}

/* ----------------------------------------------------------- timeline */

/**
 * Fig. "timeline": the events of §5 in chronological order, one ruled row
 * each; the space between rows grows with the time between events. An event
 * with a draft (or memo, or conference) date and a final date prints both.
 * @param {readonly object[]} events TIMELINE
 * @param {{ id: string }} options
 */
export function renderTimeline(events, { id }) {
  let previous = null;
  const items = events.map((e, i) => {
    const t = fractionalYear(e.first?.date ?? e.date);
    const gap = previous === null ? 0 : Math.min(8, Math.max(0, t - previous));
    previous = fractionalYear(e.date);
    const year = (e.first?.date ?? e.date).slice(0, 4);
    const dates = e.first
      ? `<span class="timeline__date-line"><span class="timeline__mark is-first" aria-hidden="true"></span>${escapeXml(e.first.dateLabel)} <span class="timeline__qual">${escapeXml(e.first.label)}</span></span>` +
        `<span class="timeline__date-line"><span class="timeline__mark" aria-hidden="true"></span>${escapeXml(e.dateLabel)} <span class="timeline__qual">final</span></span>`
      : `<span class="timeline__date-line"><span class="timeline__mark" aria-hidden="true"></span>${escapeXml(e.dateLabel)}</span>`;
    return (
      `<li class="timeline__event" data-kind="${e.kind}" data-timeline-event="${e.id}" style="--gap:${gap.toFixed(2)};--i:${i}">` +
      `<span class="timeline__year" aria-hidden="true">${year}</span>` +
      `<span class="timeline__dates">${dates}</span>` +
      `<span class="timeline__text"><span class="timeline__title">${escapeXml(e.title)}</span><span class="timeline__detail">${escapeXml(e.detail)}</span></span>` +
      `</li>`
    );
  });
  return `<ol class="timeline" id="${id}" data-timeline-events>${items.join('')}</ol>`;
}

/* ----------------------------------------------------------- digests */

/** The domain-separation suffix appended to the message before the pad10*1 padding (FIPS 202). */
export const DIGEST_SUFFIX = Object.freeze({ keccak256: '0x01', sha3_256: '0x06' });

/**
 * Fig. "digest comparator": the digests of one input under four functions;
 * Keccak-256 and SHA3-256 sit side by side with their padding suffixes and
 * the number of bits in which they differ.
 * @param {{ input: string, rows: { key?: string, name: string, bits: number, hex: string }[] }} data
 */
export function renderDigestTable({ input, rows }) {
  const keyOf = (r) => r.key ?? r.name;
  const keccak = rows.find((r) => r.key === 'keccak256');
  const sha3 = rows.find((r) => r.key === 'sha3_256');
  const twins = keccak && sha3 && keccak.hex.length === sha3.hex.length ? bitDistance(hexToBitString(keccak.hex), hexToBitString(sha3.hex)) : null;
  const body = rows
    .map((r) => {
      const suffix = DIGEST_SUFFIX[r.key];
      return (
        `<div class="digests__row"${suffix ? ' data-twin' : ''} data-digest-row="${escapeXml(keyOf(r))}"><dt><span class="digests__name">${escapeXml(r.name)}</span><span class="digests__bits">${r.bits} bits</span>` +
        (suffix ? `<span class="digests__pad">Padding suffix <span class="digests__pad-value">${suffix}</span></span>` : '') +
        `</dt><dd><code class="digests__hex" data-digest="${escapeXml(keyOf(r))}">${escapeXml(r.hex)}</code></dd></div>`
      );
    })
    .join('');
  const note =
    twins === null
      ? ''
      : `<p class="digests__twins" data-digests-twins="${twins}">Keccak-256 and SHA3-256 of the same input differ in <span class="tabular" data-digests-twins-count>${twins}</span> of 256 bits: ` +
        `the same permutation Keccak-f[1600] and the same rate of 1088 bits, with the padding suffix 0x01 against 0x06.</p>`;
  return `<div class="digests-frame"><dl class="digests" data-digests-input="${escapeXml(input)}">${body}</dl>${note}</div>`;
}

/**
 * Build-time figure provider of homework 02 (called by src/build/site-plugin.js).
 *
 * Runs the statistical experiments of §4 with the fixed seeds and sample sizes
 * of PARAMS, computes the worked example used throughout the page (the Hardhat
 * test mnemonic, empty passphrase, m/44'/60'/0'/0/0) and returns the figures'
 * HTML together with the values quoted in the text as {{fig.…}} tokens.
 *
 * The experiment results are cached under node_modules/.cache/hw02/, keyed by
 * PARAMS, the source of every library they depend on and the source of this
 * provider, so that a dev reload is instant and any change to the code
 * recomputes everything. The worked example is recomputed on every build
 * (about 50 ms) and checked against its published values: a mismatch stops
 * the build.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, utf8Bytes } from '../../src/lib/bytes.js';
import { sha256Hex } from '../../src/lib/sha256.js';
import { sha512Hex } from '../../src/lib/sha512.js';
import { keccak256Hex, sha3_256Hex } from '../../src/lib/keccak.js';
import { serializeExtendedKey, neuter } from '../../src/lib/bip32.js';
import { checksumBreakdown, deriveEthereumAccount } from '../../src/lib/ethereum.js';
import { entropyToMnemonic } from '../../src/lib/bip39.js';
import { createRandom } from '../../src/lib/random.js';
import { formatNumber } from '../../src/lib/probability-plot.js';
import * as study from '../../src/lib/wallet-study.js';
import { keccakDiffusion, keccakDiffusionTrace } from '../../src/lib/keccak-diffusion.js';
import {
  DEFAULT_SERIES,
  SERIES_KINDS,
  formatP,
  formatSci,
  hdTreeModel,
  jsonScript,
  renderBip39Grouping,
  renderDigestTable,
  renderEip55Breakdown,
  renderExplorerOutput,
  renderHdTree,
  renderKeccakLattice,
  renderPipelineLedger,
  renderSeries,
  renderStatsScript,
  renderTimeline,
  seriesOf,
  statsOf,
} from '../../src/hw02/render.js';
import { TIMELINE } from '../../src/hw02/timeline.js';

/** Every simulated number on the page follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  acceptance: { seed: 2039, n: 100000 }, // W2, 12 and 24 words
  substitution: { seed: 2040, n: 100000 }, // W3, 12 and 24 words
  wordIndex: { seed: 2041, n: 12000 }, // W4
  pipeline: { seed: 2042, n: 1500 }, // W5 and W6
  diffusion: { seed: 1600, n: 10000 }, // W7
  trace: { seed: 1601, checkpoint: 'R2 θ' }, // one sample of W7 for the state lattice
  vanity: { seed: 2044, k1: 2000, k2: 300 }, // W8, searches for 1 and 2 leading zero hex digits
  addressCase: { seed: 2045, n: 20000 }, // W9
  errors: { seed: 2046, n: 200000, caseFlipAddresses: 20 }, // W10
  rate: { seed: 7, accounts: 40 }, // mnemonic-to-address rate for W11
});

/** The worked example: published by Hardhat with the address it must reproduce. */
export const EXAMPLE = Object.freeze({
  mnemonic: 'test test test test test test test test test test test junk',
  passphrase: '',
  indices: [0, 1, 2],
  expectedAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  expectedPrivateKey: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
});

/** Published digests of the empty input (EIP-1052; NIST SHA3-256 example). */
const EMPTY_DIGESTS = Object.freeze({
  keccak256: 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
  sha3_256: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
});

/* The cache key covers the parameters, the libraries and this provider itself. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/wallet-study.js',
  'src/lib/keccak-diffusion.js',
  'src/lib/stats.js',
  'src/lib/keccak.js',
  'src/lib/bip39.js',
  'src/lib/bip32.js',
  'src/lib/ethereum.js',
  'src/lib/secp256k1.js',
  'src/lib/sha256.js',
  'src/lib/sha512.js',
  'src/lib/ripemd160.js',
  'src/lib/base58.js',
  'src/lib/bytes.js',
  'src/lib/random.js',
  'src/lib/normal.js',
  'src/data/bip39-english.js',
];

/* ----------------------------------------------------- worked example */

/** The worked example: the account at m/44'/60'/0'/0/0 and its two siblings, checked against Hardhat. */
export function computeExample() {
  const derive = (index) => deriveEthereumAccount(EXAMPLE.mnemonic, { passphrase: EXAMPLE.passphrase, index });
  const account = derive(0);
  if (account.checksummed !== EXAMPLE.expectedAddress) {
    throw new Error(`[hw02] worked example: address ${account.checksummed} differs from the published ${EXAMPLE.expectedAddress}`);
  }
  if (bytesToHex(account.privateKey) !== EXAMPLE.expectedPrivateKey) {
    throw new Error('[hw02] worked example: the private key differs from the published Hardhat key of account #0');
  }
  const siblings = EXAMPLE.indices.map((i) => {
    const a = i === 0 ? account : derive(i);
    return { index: i, path: a.path, checksummed: a.checksummed };
  });
  const changeNode = account.chain.at(-2).node;
  return {
    account,
    siblings,
    eip55: checksumBreakdown(account.address),
    xprvMaster: serializeExtendedKey(account.master, 'xprv'),
    xpubChange: serializeExtendedKey(neuter(changeNode), 'xpub'),
    changePath: account.chain.at(-2).path,
  };
}

/** The four digests of the comparator for one input, checked against the published empty-input values. */
export function computeDigests(input = '') {
  const bytes = utf8Bytes(input);
  const rows = [
    { key: 'sha256', name: 'SHA-256', bits: 256, hex: sha256Hex(bytes) },
    { key: 'sha512', name: 'SHA-512', bits: 512, hex: sha512Hex(bytes) },
    { key: 'keccak256', name: 'Keccak-256', bits: 256, hex: keccak256Hex(bytes) },
    { key: 'sha3_256', name: 'SHA3-256', bits: 256, hex: sha3_256Hex(bytes) },
  ];
  if (input === '') {
    for (const [key, expected] of Object.entries(EMPTY_DIGESTS)) {
      if (rows.find((r) => r.key === key).hex !== expected) throw new Error(`[hw02] ${key} of the empty input differs from its published value`);
    }
  }
  return { input, rows };
}

/** Tokens of the worked example and of the digest comparator. */
export function exampleTokens(example, digests = computeDigests('')) {
  const a = example.account;
  const t = {};
  const set = (key, value) => {
    t[key] = String(value);
  };
  const xy = bytesToHex(a.publicKey.subarray(1));
  set('example.mnemonic', a.mnemonic);
  set('example.passphrase', a.passphrase === '' ? 'empty' : a.passphrase);
  set('example.words', a.words.length);
  set('example.entropy', bytesToHex(a.entropy));
  set('example.entropyBits', a.entropyBits.length);
  set('example.checksumBits', a.checksumBits);
  set('example.checksumLength', a.checksumBits.length);
  set('example.indices', a.wordIndices.join(', '));
  set('example.firstIndex', a.wordIndices[0]);
  set('example.lastIndex', a.wordIndices.at(-1));
  set('example.lastWord', a.words.at(-1));
  set('example.seed', bytesToHex(a.seed));
  set('example.masterKey', bytesToHex(a.master.privateKey));
  set('example.masterChainCode', bytesToHex(a.master.chainCode));
  set('example.xprvMaster', example.xprvMaster);
  set('example.changePath', example.changePath);
  set('example.xpubChange', example.xpubChange);
  set('example.path', a.path);
  set('example.privateKey', bytesToHex(a.privateKey));
  set('example.chainCode', bytesToHex(a.node.chainCode));
  set('example.publicKey', bytesToHex(a.publicKey));
  set('example.publicKeyX', xy.slice(0, 64));
  set('example.publicKeyY', xy.slice(64));
  set('example.publicKeyCompressed', bytesToHex(a.publicKeyCompressed));
  set('example.keccak', bytesToHex(a.keccakDigest));
  set('example.addressLower', a.address);
  set('example.address', a.checksummed);
  set('example.letters', example.eip55.letterCount);
  set('example.upper', example.eip55.characters.filter((c) => c.upper).length);
  set('example.eip55Hash', example.eip55.hash);
  for (const s of example.siblings) {
    set(`example.path${s.index}`, s.path);
    set(`example.address${s.index}`, s.checksummed);
  }
  set('digests.input', digests.input === '' ? 'the empty string' : digests.input);
  for (const r of digests.rows) set(`digests.${r.key}`, r.hex);
  return t;
}

/* -------------------------------------------------------- experiments */

/* Mnemonic-to-address rate of this implementation, single thread, for W11. */
function measureRate() {
  const rnd = createRandom(PARAMS.rate.seed);
  const mnemonics = Array.from({ length: PARAMS.rate.accounts }, () => entropyToMnemonic(rnd.bytes(16)));
  deriveEthereumAccount(mnemonics[0]); // warm up: builds the generator tables
  const t0 = performance.now();
  for (const m of mnemonics) deriveEthereumAccount(m);
  return PARAMS.rate.accounts / ((performance.now() - t0) / 1000);
}

function computeAll() {
  const p = PARAMS;
  const pipeline = study.pipelineSample({ seed: p.pipeline.seed, n: p.pipeline.n });
  return {
    ledger: study.entropyLedger(),
    acceptance: {
      w12: study.checksumAcceptance({ seed: p.acceptance.seed, n: p.acceptance.n, words: 12 }),
      w24: study.checksumAcceptance({ seed: p.acceptance.seed, n: p.acceptance.n, words: 24 }),
    },
    substitution: {
      w12: study.substitutionDetection({ seed: p.substitution.seed, n: p.substitution.n, words: 12 }),
      w24: study.substitutionDetection({ seed: p.substitution.seed, n: p.substitution.n, words: 24 }),
    },
    wordIndex: study.wordIndexUniformity({ seed: p.wordIndex.seed, n: p.wordIndex.n }),
    pipeline,
    diffusion: keccakDiffusion({ seed: p.diffusion.seed, n: p.diffusion.n }),
    vanity: {
      k1: study.vanitySearch({ seed: p.vanity.seed, prefixNibbles: 1, searches: p.vanity.k1 }),
      k2: study.vanitySearch({ seed: p.vanity.seed, prefixNibbles: 2, searches: p.vanity.k2 }),
    },
    addressCase: study.addressCase({ seed: p.addressCase.seed, n: p.addressCase.n, realAddresses: pipeline.addresses }),
    errors: study.checksumErrorDetection({ seed: p.errors.seed, n: p.errors.n, caseFlipAddresses: p.errors.caseFlipAddresses }),
    rate: measureRate(),
  };
}

let memo = null;

function loadOrCompute(root) {
  const source = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + source)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw02');
  const file = resolve(dir, `${key}.json`);
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.pipeline) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = computeAll();
    const ms = performance.now() - t0;
    value = { computedAt: new Date().toISOString(), ms, results };
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, file);
    console.log(`[hw02] experiments computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw02/${key}.json`);
  }
  memo = { key, value };
  return value;
}

/* ------------------------------------------------------------- tokens */

const dec = (v, d) => (Number.isFinite(v) ? formatNumber(v, d) : 'n/a');
const grouped = (v) => Math.round(v).toLocaleString('en-GB');
const years = (y) => (y === null ? 'n/a' : y < 1000 ? dec(y, 2) : formatSci(y, 3));

function proportionTokens(set, prefix, s, { count = 'count', trials = 'n' } = {}) {
  set(`${prefix}.n`, grouped(s[trials]));
  set(`${prefix}.count`, grouped(s[count]));
  set(`${prefix}.rate`, dec(s.rate, 5));
  set(`${prefix}.expected`, dec(s.expectedRate, 5));
  set(`${prefix}.expectedCount`, dec(s[trials] * s.expectedRate, 1));
  set(`${prefix}.low`, dec(s.interval.low, 5));
  set(`${prefix}.high`, dec(s.interval.high, 5));
  set(`${prefix}.p`, formatP(s.p));
}

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { results, ms, computedAt } = loadOrCompute(root);
  const example = computeExample();
  const digests = computeDigests('');
  const html = {};
  const tokens = exampleTokens(example, digests);
  const set = (key, value) => {
    tokens[key] = String(value);
  };

  /* Experiment figures: one or more series per figure, the default one drawn. */
  for (const kind of SERIES_KINDS) {
    const series = seriesOf(kind, results);
    const statsBySeries = {};
    const parts = Object.entries(series).map(([key, data]) => {
      statsBySeries[key] = statsOf(kind, data);
      for (const [stat, value] of Object.entries(statsBySeries[key])) set(`${kind}.${key}.${stat}`, value);
      return renderSeries(kind, data, { id: `${kind}-${key.replace('.', '-')}`, series: key, hidden: key !== DEFAULT_SERIES[kind] });
    });
    html[kind] = parts.join('') + renderStatsScript(statsBySeries);
  }

  /* Static figures of §3 and §5, with the data their interactive versions mount on. */
  const a = example.account;
  html.pipeline = renderPipelineLedger(a);
  html.explorer = renderExplorerOutput(a);
  html.bip39 = renderBip39Grouping(a);
  const tree = hdTreeModel(example);
  html.hdtree =
    renderHdTree(tree, { id: 'hdtree-svg' }) +
    jsonScript({ ...tree, changePath: example.changePath, xpubChange: example.xpubChange }, 'data-hdtree-model');
  const trace = keccakDiffusionTrace(PARAMS.trace.seed);
  const shown = trace.steps.find((s) => s.label === PARAMS.trace.checkpoint);
  if (!shown) throw new Error(`[hw02] unknown Keccak trace checkpoint ${PARAMS.trace.checkpoint}`);
  html.keccak3d =
    `<div class="lattice-frame">${renderKeccakLattice(shown, { id: 'keccak3d-svg' })}</div>` +
    jsonScript({ ...trace, shown: PARAMS.trace.checkpoint }, 'data-keccak3d-trace');
  html.eip55 = renderEip55Breakdown(example.eip55) + jsonScript(example.eip55, 'data-eip55-breakdown');
  html.timeline = renderTimeline(TIMELINE, { id: 'timeline-list' });
  html.digests = renderDigestTable(digests);

  set('keccak3d.seed', PARAMS.trace.seed);
  set('keccak3d.checkpoint', shown.label);
  set('keccak3d.count', shown.count);
  set('keccak3d.flipX', trace.flipped.x);
  set('keccak3d.flipY', trace.flipped.y);
  set('keccak3d.flipZ', trace.flipped.z);
  set('keccak3d.steps', trace.steps.length);

  /* Parameters and provenance. */
  for (const [name, value] of Object.entries(PARAMS)) {
    if (typeof value !== 'object') continue;
    for (const [field, v] of Object.entries(value)) set(`params.${name}.${field}`, typeof v === 'number' && v >= 10000 ? grouped(v) : v);
  }
  set('params.computeSeconds', (ms / 1000).toFixed(1));
  set('params.computedAt', computedAt.slice(0, 10));

  /* W1: entropy ledger and the invalid-key probability. */
  const inv = results.ledger.invalidKey;
  set('ledger.invalidKeyProbability', formatSci(inv.probabilityFloat, 4));
  set('ledger.invalidKeyLog2', dec(inv.log2, 3));

  /* W2, W3, W4: Table 2. */
  for (const words of [12, 24]) {
    const acc = results.acceptance[`w${words}`];
    proportionTokens(set, `checksum.w${words}`, { ...acc, count: acc.valid });
    const sub = results.substitution[`w${words}`];
    proportionTokens(set, `substitution.w${words}.overall`, sub.overall, { count: 'undetected', trials: 'trials' });
    proportionTokens(set, `substitution.w${words}.last`, sub.lastWord, { count: 'undetected', trials: 'trials' });
    proportionTokens(set, `substitution.w${words}.other`, sub.otherWords, { count: 'undetected', trials: 'trials' });
    set(`substitution.w${words}.lastExact`, `${2 ** (11 - words / 3) - 1}/2047`);
  }
  const wi = results.wordIndex;
  for (const [name, fit] of [['pooled', wi.pooled], ['last', wi.lastWord]]) {
    set(`wordIndex.${name}.statistic`, dec(fit.statistic, 1));
    set(`wordIndex.${name}.df`, fit.df);
    set(`wordIndex.${name}.p`, formatP(fit.p));
    set(`wordIndex.${name}.expected`, dec(fit.expectedPerCell, 2));
    set(`wordIndex.${name}.count`, grouped(fit.counts.reduce((x, y) => x + y, 0)));
  }

  /* W10: EIP-55 error detection (Fig. errorRates and §4.8). */
  const e = results.errors;
  set('eip55.exactPercent', dec(e.exact.acceptPercent, 4));
  set('eip55.exact', formatSci(e.exact.acceptProbability, 4));
  set('eip55.noLetter', formatSci(e.exact.noLetterProbability, 3));
  for (const name of ['randomCase', 'substitution']) {
    const s = e[name];
    set(`eip55.${name}.n`, grouped(s.n));
    set(`eip55.${name}.accepted`, s.accepted);
    set(`eip55.${name}.expectedAccepted`, dec(s.expectedAccepted, 1));
    set(`eip55.${name}.rate`, formatSci(s.rate, 3));
    set(`eip55.${name}.low`, formatSci(s.interval.low, 3));
    set(`eip55.${name}.high`, formatSci(s.interval.high, 3));
    set(`eip55.${name}.p`, formatP(s.p));
    set(`eip55.${name}.rb`, formatSci(s.raoBlackwell.estimate, 4));
    set(`eip55.${name}.rbSe`, formatSci(s.raoBlackwell.se, 2));
  }
  set('eip55.caseFlip.addresses', e.caseFlip.addresses);
  set('eip55.caseFlip.tested', e.caseFlip.lettersTested);
  set('eip55.caseFlip.detected', e.caseFlip.detected);

  /* W11: brute-force scale at the measured rate (Table 4). */
  const brute = study.bruteForceScale({ addressesPerSecond: results.rate });
  set('brute.rate', dec(results.rate, 1));
  for (const s of brute.searchSpaces) {
    set(`brute.b${s.bits}.expectedTrials`, formatSci(s.expectedTrials, 3));
    set(`brute.b${s.bits}.exhaustTrials`, formatSci(s.exhaustTrials, 3));
    set(`brute.b${s.bits}.expectedYears`, years(s.expectedYears));
    set(`brute.b${s.bits}.exhaustYears`, years(s.exhaustYears));
  }
  for (const c of brute.collisions) {
    const k = Math.round(Math.log10(c.m));
    set(`brute.c${k}.m`, formatSci(c.m, 1));
    set(`brute.c${k}.probability`, formatSci(c.probability, 3));
  }
  set('brute.rhoCoefficient', dec(brute.rho.coefficient, 3));
  set('brute.rhoLog2', dec(brute.rho.log2Additions, 2));

  return { html, tokens };
}

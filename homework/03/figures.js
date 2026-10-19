/**
 * Build-time figure provider of homework 03 (called by src/build/site-plugin.js).
 *
 * Runs the experiments of src/lib/caesar-study.js (key recovery of the Caesar
 * cipher against ciphertext length, the statistical properties of one long
 * message under both schemes, repeated encryption) and of
 * src/lib/ecc-attack-study.js (the cost of the attacks on the restricted key
 * space of the toy scheme), on the corpus of src/data/hw03/ derived by
 * scripts/hw03-corpus.mjs, renders every figure and table of the page and
 * returns them with the values quoted in the text as {{fig.…}} tokens.
 *
 * The results are cached under node_modules/.cache/hw03/<key>.json, the key
 * being a hash of PARAMS, of the source of every module and data file listed
 * in DEPENDENCIES and of this file, so that a dev reload is instant and any
 * change to the code or the corpus recomputes everything; the rendering is
 * redone on every build from the cached JSON.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/03/index.html)
 *   keySpaces      Table 1, the key spaces of the Caesar cipher, the toy scheme and secp256k1
 *   repeated       Table 2, the same message encrypted twice under each scheme
 *   letters        Fig. 1, letter histograms of a message and of its Caesar ciphertext, byte histogram of its toy-EC ciphertext
 *   statistics     Table 3, index of coincidence and χ² tests of the same texts
 *   success        Fig. 2, success rate of key recovery against ciphertext length, per method
 *   rank           Fig. 3, mean rank of the true key against ciphertext length
 *   caesarSummary  Table 4, success at selected lengths and the lengths reaching 95% and 99%
 *   attack         Fig. 4, group operations of the three attacks against the key size
 *   attackCost     Table 5, the fitted cost extrapolated to 128- and 256-bit keys
 *   corpus         Table A1, the books of the corpus with the SHA-256 of each normalised text
 *
 * Tokens ({{fig.<key>}}); every value is a display string.
 *   params.{seed, windows, compareChars, toyBits, keysPerBits, smoothing, computeSeconds, computedAt, cacheKey,
 *     bruteMaxBits, bsgsMaxBits, kangarooMaxBits}
 *   corpus.{books, trainingBooks, trainingLetters, trainingWords, heldoutTitle, heldoutAuthor, heldoutLetters,
 *     bigrams, trigrams, dictionaryWords, dictionaryCoverage, heldoutYear, heldoutMaxChars, trainingStatsSha,
 *     heldoutSha}
 *   caesar.baseline, caesar.<method>.{l95, l99, label} and caesar.<method>.L<L>.{rate, low, high, rank}
 *     (methods chiSquare, logLikelihood, bigram, trigram, exhaustive; L in the grid of the study)
 *   caesar.exhaustiveRate (candidate decryptions per second), caesar.exhaustiveMicroseconds (one search)
 *   compare.{chars, letters, bytes, key, privateKey, messageHead, caesarHead, eccHead, isShift}
 *   compare.ic.{english, uniform26, uniform256, plainLetters, caesarLetters, plainBytes, eccBytes}
 *   compare.<test>.{statistic, df, p, pEq} (plainVsEnglish, caesarVsEnglish, caesarVsShiftedEnglish,
 *     caesarVsUniform26, plainBytesVsUniform256, eccBytesVsUniform256)
 *   repeat.{message, privateKey, publicKey, caesarKey, caesarCiphertext, eccR1, eccR2, eccC1, eccC2, eccTag1,
 *     differingBits, totalBits, ephemeral, sharedX, keystream}
 *   attack.<method>.{slope, intercept, r, rate, seconds, maxBits, at128, at256} (brute, bsgs, kangaroo; at… are
 *     base-2 exponents of the extrapolated operations), attack.rho.log2, attack.fastRate,
 *   attack.brute.{meanSecondsToy, worstSecondsToy}, attack.rho.{yearsMeasured, yearsFast, universeAges}
 *   demo.{k, bsgsOperations, bruteOperations, kangarooOperations, message, ephemeralBits, ephemeral,
 *     ephemeralOperations, ephemeralMessage}
 *   keySpace.<caesar|toy|secp256k1>.log2
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { createRandom } from '../../src/lib/random.js';
import { deriveSeed } from '../../src/lib/kg-study.js';
import {
  METHODS,
  caesarModels,
  compareStatistics,
  drawWindow,
  letterPositions,
  recoverWith,
  repeatedEncryption,
  runCaesarStudy,
} from '../../src/lib/caesar-study.js';
import { encrypt as caesarEncrypt } from '../../src/lib/caesar.js';
import { attackCostTable, keySpaces, measureAttackCost } from '../../src/lib/ecc-attack-study.js';
import { encrypt as eccEncrypt, generateKeyPair } from '../../src/lib/toy-ecc-encryption.js';
import { decryptWithoutKey, recoverEphemeral } from '../../src/lib/restricted-key-attack.js';
import { escapeXml } from '../../src/lib/charts.js';
import {
  FIGURE_KINDS,
  durationFromLog2Seconds,
  figureData,
  fmt,
  sciFromLog2,
  formatP,
  int,
  methodLabel,
  pEq,
  percent,
  renderAttackTable,
  renderCaesarSummary,
  renderKeySpaces,
  renderRepeated,
  renderSeries,
  renderStatisticsTable,
} from '../../src/hw03/render.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seed: 20261019, // every stream of the study is derived from it (deriveSeed)
  windows: 2000, // ciphertexts per length in the Caesar study
  smoothing: 0.01, // pseudo-count of an n-gram absent from the training corpus
  compareChars: 20000, // characters of the message of Fig. 1 and Table 3
  toyBits: 20, // private keys of the toy scheme lie in [1, 2^20]
  keysPerBits: 8, // random keys per key size in Fig. 4
  ranges: Object.freeze({
    'brute-force': Object.freeze([8, 10, 12, 14, 16, 18, 20]),
    bsgs: Object.freeze([8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]),
    kangaroo: Object.freeze([8, 10, 12, 14, 16, 18, 20, 22, 24]),
  }),
  ephemeralBits: 20, // the restricted ephemeral of the design-weakness demonstration
  buildWidth: 640, // pixel width of the printed charts; the page may redraw them at their true width
});

/* The cache key covers the parameters, every module and data file the study depends on, and this provider. */
const SELF = fileURLToPath(import.meta.url);
const DEPENDENCIES = [
  'src/lib/caesar-study.js',
  'src/lib/caesar.js',
  'src/lib/ecc-attack-study.js',
  'src/lib/restricted-key-attack.js',
  'src/lib/toy-ecc-encryption.js',
  'src/lib/secp256k1.js',
  'src/lib/keccak.js',
  'src/lib/bytes.js',
  'src/lib/random.js',
  'src/lib/normal.js',
  'src/lib/stats.js',
  'src/lib/kg-study.js',
  'src/data/hw03/training-stats.json',
  'src/data/hw03/heldout.txt',
  'src/data/hw03/corpus-manifest.json',
];

/** The corpus of the study: the training statistics, the held-out text and the manifest. */
export function loadCorpus(root) {
  const dir = resolve(root, 'src/data/hw03');
  return {
    stats: JSON.parse(readFileSync(resolve(dir, 'training-stats.json'), 'utf8')),
    text: readFileSync(resolve(dir, 'heldout.txt'), 'utf8').trim(),
    manifest: JSON.parse(readFileSync(resolve(dir, 'corpus-manifest.json'), 'utf8')),
  };
}

/* Candidate decryptions per second of the exhaustive search with its dictionary test, on 100-letter windows. */
function exhaustiveRate({ text, stats }) {
  const models = caesarModels(stats, { smoothing: PARAMS.smoothing });
  const positions = letterPositions(text);
  const random = createRandom(deriveSeed(PARAMS.seed, 'exhaustive-rate'));
  const ciphertexts = Array.from({ length: 400 }, () => caesarEncrypt(drawWindow(text, positions, 100, random), random.int(26)));
  recoverWith('exhaustive', ciphertexts[0], models); // warm up
  const t0 = performance.now();
  for (const c of ciphertexts) recoverWith('exhaustive', c, models);
  const seconds = (performance.now() - t0) / 1000;
  return (ciphertexts.length * 26) / seconds;
}

/* The attacks of §6 on the worked example: k from Q by each solver, and a restricted ephemeral from R. */
function demonstration(repeat) {
  const bits = PARAMS.toyBits;
  const run = (method) => decryptWithoutKey(repeat.ecc.first, repeat.publicKey, bits, method, method === 'kangaroo' ? { random: createRandom(deriveSeed(PARAMS.seed, 'demo-kangaroo')) } : {});
  const bsgs = run('bsgs');
  const brute = run('brute-force');
  const kangaroo = run('kangaroo');
  if (!bsgs.found || bsgs.k.toString() !== repeat.privateKey || bsgs.message !== repeat.message) throw new Error('[hw03] demonstration: BSGS did not recover the key');
  if (brute.k?.toString() !== repeat.privateKey || kangaroo.k?.toString() !== repeat.privateKey) throw new Error('[hw03] demonstration: a solver did not recover the key');
  // A design weakness independent of k: a full-size key with a short ephemeral scalar.
  const random = createRandom(deriveSeed(PARAMS.seed, 'demo-ephemeral'));
  const strong = generateKeyPair({ bits: 254, random });
  const weak = eccEncrypt(repeat.message, strong.publicKey, { ephemeralBits: PARAMS.ephemeralBits, random });
  const eph = recoverEphemeral(weak, strong.publicKey, PARAMS.ephemeralBits, 'bsgs');
  if (!eph.found || eph.message !== repeat.message) throw new Error('[hw03] demonstration: the restricted ephemeral was not recovered');
  return {
    k: bsgs.k.toString(),
    message: bsgs.message,
    bsgsOperations: bsgs.operations,
    bruteOperations: brute.operations,
    kangarooOperations: kangaroo.operations,
    ephemeralBits: PARAMS.ephemeralBits,
    ephemeral: eph.ephemeral.toString(),
    ephemeralOperations: eph.operations,
    ephemeralMessage: eph.message,
  };
}

function computeAll(corpus) {
  const { text, stats } = corpus;
  const p = PARAMS;
  const t = {};
  const time = (name, f) => {
    const t0 = performance.now();
    const value = f();
    t[name] = (performance.now() - t0) / 1000;
    return value;
  };
  const caesar = time('caesar', () => runCaesarStudy({ text, stats, windows: p.windows, seed: p.seed, smoothing: p.smoothing }));
  const compare = time('compare', () => compareStatistics({ text, stats, chars: p.compareChars, seed: p.seed, bits: p.toyBits }));
  const repeat = time('repeat', () => repeatedEncryption({ seed: p.seed, bits: p.toyBits }));
  const attack = time('attack', () => measureAttackCost({ seed: p.seed, keysPerBits: p.keysPerBits, ranges: p.ranges }));
  const demo = time('demo', () => demonstration(repeat));
  const rate = time('rate', () => exhaustiveRate(corpus));
  return { caesar, compare, repeat, attack, demo, exhaustiveRate: rate, seconds: t };
}

let memo = null;

function loadOrCompute(root) {
  const source = [...DEPENDENCIES.map((f) => resolve(root, f)), SELF].map((f) => readFileSync(f, 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + source)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw03');
  const file = resolve(dir, `${key}.json`);
  let value = null;
  if (existsSync(file)) {
    // A truncated or corrupt cache file falls back to recomputation instead of breaking the build.
    try {
      value = JSON.parse(readFileSync(file, 'utf8'));
      if (!value?.results?.attack) value = null;
    } catch {
      value = null;
    }
  }
  if (!value) {
    const t0 = performance.now();
    const results = computeAll(loadCorpus(root));
    const ms = performance.now() - t0;
    const text = JSON.stringify({ key, computedAt: new Date().toISOString(), ms, results });
    mkdirSync(dir, { recursive: true });
    // Written to a temporary file and renamed, so an interrupted write never leaves a partial cache.
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    value = JSON.parse(text);
    console.log(`[hw03] study computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw03/${key}.json`);
  }
  memo = { key, value };
  return value;
}

/* The age of the universe in years (about 13.8 billion), the yardstick of the infeasibility argument of §6. */
const AGE_OF_UNIVERSE_YEARS = 1.38e10;

/* Table: the books of the corpus, with their role and the SHA-256 of each normalised text (the manifest). */
function renderCorpus(manifest) {
  const rows = manifest.books.map(
    (b) =>
      `<tr><td class="is-number">${b.id}</td><th scope="row"><cite>${escapeXml(b.title)}</cite></th><td>${escapeXml(b.author)}</td>` +
      `<td class="is-number">${b.year}</td><td>${b.role === 'heldout' ? 'Held out' : 'Training'}</td>` +
      `<td class="is-number">${int(b.normalisedLetters)}</td><td><code>${escapeXml(b.normalisedSha256.slice(0, 16))}…</code></td></tr>`,
  );
  const head = ['Gutenberg no.', 'Title', 'Author', 'Year', 'Role', 'Letters', 'SHA-256, normalised text'];
  const cls = (i) => ([0, 3, 5].includes(i) ? ' class="is-number"' : '');
  return (
    `<table class="data-table data-table--compact data-table--hw03"><thead><tr>${head.map((h, i) => `<th scope="col"${cls(i)}>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

/* Token-safe names of the methods and solvers. */
const METHOD_TOKEN = { 'chi-square': 'chiSquare', 'log-likelihood': 'logLikelihood', bigram: 'bigram', trigram: 'trigram', exhaustive: 'exhaustive' };
const SOLVER_TOKEN = { 'brute-force': 'brute', bsgs: 'bsgs', kangaroo: 'kangaroo' };

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { key: cacheKey, results, ms, computedAt } = loadOrCompute(root);
  const { manifest, stats } = loadCorpus(root);
  const html = {};
  const tokens = {};
  const token = (k, value) => {
    tokens[k] = String(value);
  };

  /* Chart figures. */
  for (const kind of FIGURE_KINDS) {
    html[kind] = renderSeries(kind, figureData(kind, results), { id: kind, width: PARAMS.buildWidth });
  }

  /* Tables. */
  const spaces = keySpaces({ toyBits: PARAMS.toyBits });
  const costTable = attackCostTable(results.attack);
  html.keySpaces = renderKeySpaces(spaces, { caesarRate: results.exhaustiveRate, bruteRate: results.attack.methods['brute-force'].rate });
  html.repeated = renderRepeated(results.repeat);
  html.statistics = renderStatisticsTable(results.compare);
  html.caesarSummary = renderCaesarSummary(results.caesar);
  html.attackCost = renderAttackTable(costTable);
  html.corpus = renderCorpus(manifest);

  /* Parameters and provenance (Appendix). */
  token('params.seed', PARAMS.seed);
  token('params.windows', int(PARAMS.windows));
  token('params.smoothing', PARAMS.smoothing);
  token('params.compareChars', int(PARAMS.compareChars));
  token('params.toyBits', PARAMS.toyBits);
  token('params.keysPerBits', PARAMS.keysPerBits);
  token('params.bruteMaxBits', Math.max(...PARAMS.ranges['brute-force']));
  token('params.bsgsMaxBits', Math.max(...PARAMS.ranges.bsgs));
  token('params.kangarooMaxBits', Math.max(...PARAMS.ranges.kangaroo));
  token('params.computeSeconds', (ms / 1000).toFixed(1));
  token('params.computedAt', computedAt.slice(0, 10));
  token('params.cacheKey', cacheKey);

  /* The corpus. */
  const training = manifest.books.filter((b) => b.role === 'training');
  const heldout = manifest.books.find((b) => b.role === 'heldout');
  token('corpus.books', manifest.books.length);
  token('corpus.trainingBooks', training.length);
  token('corpus.trainingLetters', int(stats.letters.total));
  token('corpus.trainingWords', int(stats.words.total));
  token('corpus.heldoutTitle', heldout.title);
  token('corpus.heldoutAuthor', heldout.author);
  token('corpus.heldoutLetters', int(manifest.outputs['heldout.txt'].letters));
  token('corpus.bigrams', int(stats.bigrams.distinct));
  token('corpus.trigrams', int(stats.trigrams.distinct));
  token('corpus.dictionaryWords', int(stats.words.list.length));
  token('corpus.dictionaryCoverage', percent(stats.words.coverage));
  token('corpus.heldoutYear', heldout.year);
  token('corpus.heldoutMaxChars', int(manifest.outputs['heldout.txt'].maxChars));
  token('corpus.trainingStatsSha', manifest.outputs['training-stats.json'].sha256);
  token('corpus.heldoutSha', manifest.outputs['heldout.txt'].sha256);

  /* §5: the Caesar study. */
  const caesar = results.caesar;
  token('caesar.baseline', fmt(caesar.baseline, 4));
  for (const m of METHODS) {
    const v = caesar.methods[m];
    const name = METHOD_TOKEN[m];
    token(`caesar.${name}.label`, methodLabel(m));
    token(`caesar.${name}.l95`, v.l95 ?? 'not reached');
    token(`caesar.${name}.l99`, v.l99 ?? 'not reached');
    for (const pt of v.points) {
      token(`caesar.${name}.L${pt.L}.rate`, percent(pt.rate));
      token(`caesar.${name}.L${pt.L}.low`, percent(pt.low));
      token(`caesar.${name}.L${pt.L}.high`, percent(pt.high));
      token(`caesar.${name}.L${pt.L}.rank`, fmt(pt.meanRank, 2));
    }
  }
  token('caesar.exhaustiveRate', int(results.exhaustiveRate));
  token('caesar.exhaustiveMicroseconds', fmt((26 / results.exhaustiveRate) * 1e6, 0));

  /* §4: the statistical properties of the two schemes. */
  const c = results.compare;
  for (const k of ['chars', 'letters', 'bytes']) token(`compare.${k}`, int(c[k]));
  token('compare.key', c.key);
  token('compare.privateKey', c.privateKey);
  token('compare.messageHead', c.messageHead);
  token('compare.caesarHead', c.caesarHead);
  token('compare.eccHead', c.eccHead);
  token('compare.isShift', c.isShift ? 'yes' : 'no');
  for (const [k, v] of Object.entries(c.ic)) token(`compare.ic.${k}`, fmt(v, 4));
  for (const [k, v] of Object.entries(c.tests)) {
    token(`compare.${k}.statistic`, fmt(v.statistic, v.statistic >= 100 ? 0 : 1));
    token(`compare.${k}.df`, v.df);
    token(`compare.${k}.p`, formatP(v.p));
    token(`compare.${k}.pEq`, pEq(v.p));
  }

  /* §2 and §4: the worked example and repeated encryption. */
  const r = results.repeat;
  token('repeat.message', r.message);
  token('repeat.privateKey', r.privateKey);
  token('repeat.publicKey', r.publicKey);
  token('repeat.caesarKey', r.caesar.key);
  token('repeat.caesarCiphertext', r.caesar.first);
  token('repeat.eccR1', r.ecc.first.R);
  token('repeat.eccR2', r.ecc.second.R);
  token('repeat.eccC1', r.ecc.first.c);
  token('repeat.eccC2', r.ecc.second.c);
  token('repeat.eccTag1', r.ecc.first.tag);
  token('repeat.differingBits', r.ecc.differingBits);
  token('repeat.totalBits', r.ecc.totalBits);
  token('repeat.ephemeral', r.ecc.trace.ephemeral);
  token('repeat.sharedX', r.ecc.trace.sharedX);
  token('repeat.keystream', r.ecc.trace.keystream);

  /* §6: the attacks. */
  for (const [m, v] of Object.entries(results.attack.methods)) {
    const name = SOLVER_TOKEN[m];
    token(`attack.${name}.slope`, fmt(v.fit.slope, 3));
    token(`attack.${name}.intercept`, fmt(v.fit.intercept, 2));
    token(`attack.${name}.r`, fmt(v.fit.r, 4));
    token(`attack.${name}.rate`, int(v.rate));
    token(`attack.${name}.seconds`, fmt(v.totalSeconds, 1));
    token(`attack.${name}.maxBits`, Math.max(...v.points.map((q) => q.bits)));
    for (const row of costTable.rows.filter((q) => q.method === m)) token(`attack.${name}.at${row.bits}`, fmt(row.log2Operations, 1));
  }
  token('attack.rho.log2', fmt(costTable.rho.log2Operations, 1));
  token('attack.fastRate', '10¹²');
  /* The toy key by brute force at the measured rate, on average (2^(b−1) additions) and at worst (2^b). */
  const bruteRate = results.attack.methods['brute-force'].rate;
  token('attack.brute.meanSecondsToy', fmt(2 ** (PARAMS.toyBits - 1) / bruteRate, 1));
  token('attack.brute.worstSecondsToy', fmt(2 ** PARAMS.toyBits / bruteRate, 1));
  /* Pollard's rho on the full group: at the measured brute-force rate, at 10¹² op/s, and against the age of the universe. */
  const rhoLog2SecondsMeasured = costTable.rho.log2Operations - Math.log2(bruteRate);
  token('attack.rho.yearsMeasured', durationFromLog2Seconds(rhoLog2SecondsMeasured));
  token('attack.rho.yearsFast', durationFromLog2Seconds(costTable.rho.log2SecondsFast));
  token('attack.rho.universeAges', sciFromLog2(costTable.rho.log2SecondsFast - Math.log2(365.25 * 86400) - Math.log2(AGE_OF_UNIVERSE_YEARS), 1));
  const d = results.demo;
  token('demo.k', d.k);
  token('demo.message', d.message);
  token('demo.bsgsOperations', int(d.bsgsOperations));
  token('demo.bruteOperations', int(d.bruteOperations));
  token('demo.kangarooOperations', int(d.kangarooOperations));
  token('demo.ephemeralBits', d.ephemeralBits);
  token('demo.ephemeral', d.ephemeral);
  token('demo.ephemeralOperations', int(d.ephemeralOperations));
  token('demo.ephemeralMessage', d.ephemeralMessage);
  for (const s of spaces) token(`keySpace.${s.key}.log2`, fmt(s.log2, 2));
  /* §4 and §7: the general substitution cipher, the birthday bound and a full table of the toy key space. */
  let log2Factorial26 = 0;
  for (let i = 2; i <= 26; i += 1) log2Factorial26 += Math.log2(i);
  token('keySpace.substitution.log2', fmt(log2Factorial26, 1));
  token('keySpace.toy.birthday', int(Math.sqrt(2 * Math.LN2 * 2 ** PARAMS.toyBits)));
  token('keySpace.toy.tableMB', fmt((2 ** PARAMS.toyBits * 33) / 1e6, 1));

  /* §5: the information a letter carries about the key, under the unigram model of the training corpus. */
  const letterTotal = stats.letters.counts.reduce((s, x) => s + x, 0);
  const entropy = -stats.letters.counts.reduce((s, x) => (x > 0 ? s + (x / letterTotal) * Math.log2(x / letterTotal) : s), 0);
  const redundancy = Math.log2(26) - entropy;
  token('corpus.letterEntropy', fmt(entropy, 2));
  token('corpus.redundancy', fmt(redundancy, 2));
  token('corpus.unicity', fmt(Math.log2(26) / redundancy, 1));

  return { html, tokens };
}

/**
 * The statistical experiments of homework 03 on the Caesar cipher, and the
 * comparison of its statistical properties with those of the toy elliptic-curve
 * scheme of src/lib/toy-ecc-encryption.js.
 *
 *   caesarModels(stats)            the reference models of the training corpus
 *   runCaesarStudy(options)        success rate of key recovery against ciphertext length
 *   indexOfCoincidence(counts)     Σ n_i(n_i − 1) / (N(N − 1))
 *   compareStatistics(options)     letter and byte statistics of one long message under both schemes
 *   repeatedEncryption(options)    the same message encrypted twice under both schemes
 *
 * Every function is pure apart from the seeded generators it is given (no file
 * system, no DOM), so that the same code runs in the build (homework/03/figures.js)
 * and in a browser worker. The corpus statistics and the held-out text are
 * passed in as arguments (src/data/hw03/, derived by scripts/hw03-corpus.mjs).
 *
 * Design of the length study. For each ciphertext length L (in letters) N
 * windows of exactly L letters are drawn uniformly from the held-out text, which
 * shares no author with the training corpus. Each window keeps its spaces, as a
 * Caesar ciphertext of a written message would, and is encrypted with a key
 * drawn uniformly from 0 … 25. Every method attacks the same windows under the
 * same keys, so the comparison between methods is paired. A key counts as
 * recovered when it is the method's best key; ties at the top are broken
 * uniformly at random with the study's generator, so that a method that cannot
 * separate the keys (no letters, no n-gram, no dictionary word) scores the
 * chance level 1/26 on average instead of the bias of a fixed order. The rank
 * of the true key is its mid-rank among tied scores (1 is best).
 */

import {
  decrypt,
  dictionaryRecognizer,
  encrypt as caesarEncrypt,
  letterCounts,
  ngramModelFromCounts,
  recoverByChiSquare,
  recoverByExhaustiveSearch,
  recoverByLogLikelihood,
  recoverByNgram,
} from './caesar.js';
import { createRandom } from './random.js';
import { deriveSeed } from './kg-study.js';
import { chiSquareGoodnessOfFit, wilsonInterval } from './stats.js';
import { decrypt as eccDecrypt, encryptTrace, generateKeyPair } from './toy-ecc-encryption.js';
import { bytesToHex, utf8Bytes } from './bytes.js';

/** Ciphertext lengths of the study, in letters. */
export const LENGTHS = Object.freeze([1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500]);

/** The recovery methods, in display order. */
export const METHODS = Object.freeze(['chi-square', 'log-likelihood', 'bigram', 'trigram', 'exhaustive']);

/** Printed names of the methods. */
export const METHOD_LABELS = Object.freeze({
  'chi-square': 'χ² of letter frequencies',
  'log-likelihood': 'Letter log-likelihood',
  bigram: 'Bigram score',
  trigram: 'Trigram score',
  exhaustive: 'Exhaustive search, dictionary',
});

/** Default pseudo-count of an n-gram absent from the training corpus (the floor of src/lib/caesar.js). */
export const NGRAM_SMOOTHING = 0.01;

/**
 * The reference models of the training corpus: letter frequencies, the bigram
 * and trigram models and the dictionary recogniser of the exhaustive search.
 * @param {{ letters: { counts: number[] }, bigrams: { counts: Record<string, number> },
 *   trigrams: { counts: Record<string, number> }, words: { list: string[] } }} stats
 *   the contents of src/data/hw03/training-stats.json
 * @param {{ smoothing?: number }} [options]
 */
export function caesarModels(stats, { smoothing = NGRAM_SMOOTHING } = {}) {
  const total = stats.letters.counts.reduce((s, c) => s + c, 0);
  return {
    frequencies: stats.letters.counts.map((c) => c / total),
    bigram: ngramModelFromCounts(stats.bigrams.counts, 2, { smoothing }),
    trigram: ngramModelFromCounts(stats.trigrams.counts, 3, { smoothing }),
    recognise: dictionaryRecognizer(stats.words.list),
    words: stats.words.list.length,
    smoothing,
  };
}

/** Runs one method on a ciphertext. */
export function recoverWith(method, ciphertext, models) {
  switch (method) {
    case 'chi-square':
      return recoverByChiSquare(ciphertext, models.frequencies);
    case 'log-likelihood':
      return recoverByLogLikelihood(ciphertext, models.frequencies);
    case 'bigram':
      return recoverByNgram(ciphertext, models.bigram);
    case 'trigram':
      return recoverByNgram(ciphertext, models.trigram);
    case 'exhaustive':
      return recoverByExhaustiveSearch(ciphertext, models.recognise);
    default:
      throw new Error(`unknown method ${method}`);
  }
}

/** Positions of the letters A–Z of a normalised text. */
export function letterPositions(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) out.push(i);
  }
  return Int32Array.from(out);
}

/**
 * A window of exactly `L` letters of `text` (with the spaces between them),
 * starting at a letter drawn uniformly among those that leave room for L letters.
 */
export function drawWindow(text, positions, L, random) {
  if (L < 1 || L > positions.length) throw new RangeError('window length out of range');
  const start = random.int(positions.length - L + 1);
  return text.slice(positions[start], positions[start + L - 1] + 1);
}

/**
 * The outcome of one recovery for the true key: success after a random
 * tie-break among the best keys, the mid-rank of the true key and the score
 * margin between the best and the second-best key (in the method's units,
 * always non-negative).
 */
export function assess(result, trueKey, random) {
  const { ranking, better } = result;
  const sign = better === 'lower' ? -1 : 1;
  const value = (entry) => sign * entry.score; // higher is better
  const best = Math.max(...ranking.map(value));
  const top = ranking.filter((e) => value(e) === best);
  const truth = ranking.find((e) => e.key === trueKey);
  const above = ranking.filter((e) => value(e) > value(truth)).length;
  const ties = ranking.filter((e) => value(e) === value(truth)).length;
  const chosen = top.length === 1 ? top[0].key : top[random.int(top.length)].key;
  const sorted = ranking.map(value).sort((a, b) => b - a);
  return { success: chosen === trueKey, rank: above + (ties + 1) / 2, margin: sorted[0] - sorted[1], tied: top.length };
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The smallest length of the grid from which the success rate stays at or
 * above `threshold` for every longer length, or null when it is never reached.
 * @param {{ L: number, rate: number }[]} points in increasing L
 */
export function smallestLength(points, threshold) {
  let found = null;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].rate >= threshold) found = points[i].L;
    else break;
  }
  return found;
}

/**
 * The success of every method against the length of the ciphertext.
 * @param {{ text: string, stats: object, lengths?: number[], windows?: number, seed?: number,
 *   methods?: string[], smoothing?: number, onProgress?: (done: number, total: number) => void }} options
 * @returns {{ meta: object, baseline: number, methods: Record<string, { points: object[], l95: number|null, l99: number|null }> }}
 */
export function runCaesarStudy({
  text,
  stats,
  lengths = LENGTHS,
  windows = 2000,
  seed = 20261019,
  methods = METHODS,
  smoothing = NGRAM_SMOOTHING,
  onProgress,
}) {
  const models = caesarModels(stats, { smoothing });
  const positions = letterPositions(text);
  const out = Object.fromEntries(methods.map((m) => [m, { points: [] }]));
  let done = 0;
  for (const L of lengths) {
    // One stream per length for the windows and keys, one for the tie-breaks.
    const draw = createRandom(deriveSeed(seed, `caesar-L${L}`));
    const ties = createRandom(deriveSeed(seed, `caesar-ties-L${L}`));
    const acc = Object.fromEntries(methods.map((m) => [m, { successes: 0, ranks: 0, margins: [], tied: 0 }]));
    for (let w = 0; w < windows; w += 1) {
      const plaintext = drawWindow(text, positions, L, draw);
      const key = draw.int(26);
      const ciphertext = caesarEncrypt(plaintext, key);
      for (const m of methods) {
        const a = assess(recoverWith(m, ciphertext, models), key, ties);
        const s = acc[m];
        if (a.success) s.successes += 1;
        s.ranks += a.rank;
        s.margins.push(a.margin);
        if (a.tied > 1) s.tied += 1;
      }
      done += 1;
      if (onProgress && done % 500 === 0) onProgress(done, lengths.length * windows);
    }
    for (const m of methods) {
      const s = acc[m];
      const ci = wilsonInterval(s.successes, windows);
      out[m].points.push({
        L,
        n: windows,
        successes: s.successes,
        rate: s.successes / windows,
        low: ci.low,
        high: ci.high,
        meanRank: s.ranks / windows,
        medianMargin: median(s.margins),
        tiedShare: s.tied / windows,
      });
    }
  }
  for (const m of methods) {
    out[m].l95 = smallestLength(out[m].points, 0.95);
    out[m].l99 = smallestLength(out[m].points, 0.99);
  }
  return {
    meta: {
      seed,
      windows,
      lengths: [...lengths],
      methods: [...methods],
      smoothing,
      heldoutLetters: positions.length,
      bigramDistinct: models.bigram.distinct,
      trigramDistinct: models.trigram.distinct,
      dictionaryWords: models.words,
    },
    baseline: 1 / 26,
    methods: out,
  };
}

/* ------------------------------------------------------------------------ */
/* Statistical properties of the two schemes                                 */
/* ------------------------------------------------------------------------ */

/**
 * The index of coincidence of a table of counts: the probability that two
 * symbols drawn without replacement are equal, Σ n_i(n_i − 1) / (N(N − 1)).
 * It is unchanged by any permutation of the symbols, a Caesar shift included.
 */
export function indexOfCoincidence(counts) {
  let n = 0;
  let pairs = 0;
  for (const c of counts) {
    n += c;
    pairs += c * (c - 1);
  }
  return n > 1 ? pairs / (n * (n - 1)) : 0;
}

/** The 256 counts of the byte values of a byte string. */
export function byteCounts(bytes) {
  const counts = new Array(256).fill(0);
  for (const b of bytes) counts[b] += 1;
  return counts;
}

/** A message of about `chars` characters of `text`, from a seeded start, cut at word boundaries. */
export function sampleMessage(text, chars, random) {
  if (chars >= text.length) return text.trim();
  let start = random.int(text.length - chars);
  start = text.indexOf(' ', start) + 1;
  let end = text.lastIndexOf(' ', start + chars);
  if (end <= start) end = start + chars;
  return text.slice(start, end);
}

/**
 * Letter and byte statistics of one long message: its plaintext, its Caesar
 * ciphertext under a seeded non-zero key, and its toy-ECC ciphertext under a
 * seeded restricted key pair. The byte distribution of the ECC ciphertext is
 * tested against the uniform law on 256 values.
 * @param {{ text: string, stats: object, chars?: number, seed?: number, bits?: number }} options
 */
export function compareStatistics({ text, stats, chars = 20000, seed = 20261019, bits = 20 }) {
  const random = createRandom(deriveSeed(seed, 'compare'));
  const message = sampleMessage(text, chars, random);
  const key = 1 + random.int(25);
  const caesar = caesarEncrypt(message, key);
  const eccRandom = createRandom(deriveSeed(seed, 'compare-ecc'));
  const pair = generateKeyPair({ bits, random: eccRandom });
  const trace = encryptTrace(message, pair.publicKey, { random: eccRandom });
  if (eccDecrypt(trace.ciphertext, pair.privateKey) !== message) throw new Error('compareStatistics: ECC round trip failed');

  const plainLetters = letterCounts(message);
  const caesarLetters = letterCounts(caesar);
  const plainBytes = byteCounts(utf8Bytes(message));
  const eccBytes = byteCounts(trace.cipherBytes);
  const nLetters = plainLetters.reduce((s, c) => s + c, 0);
  const nBytes = trace.cipherBytes.length;
  const total = stats.letters.counts.reduce((s, c) => s + c, 0);
  const english = stats.letters.counts.map((c) => c / total);
  const englishExpected = english.map((p) => p * nLetters);
  const shifted = englishExpected.map((_, i) => englishExpected[(i - key + 26) % 26]);
  const uniform256 = new Array(256).fill(nBytes / 256);
  const uniform26 = new Array(26).fill(nLetters / 26);
  const isShift = caesarLetters.every((c, i) => c === plainLetters[(i - key + 26) % 26]);
  const test = (obs, exp) => {
    const r = chiSquareGoodnessOfFit(obs, exp);
    return { statistic: r.statistic, df: r.df, p: r.p };
  };
  return {
    seed,
    key,
    bits,
    privateKey: pair.privateKey.toString(),
    chars: message.length,
    letters: nLetters,
    bytes: nBytes,
    messageHead: message.slice(0, 80),
    caesarHead: caesar.slice(0, 80),
    eccHead: bytesToHex(trace.cipherBytes.subarray(0, 40)),
    english,
    plainLetters,
    caesarLetters,
    plainBytes,
    eccBytes,
    isShift,
    ic: {
      english: english.reduce((s, p) => s + p * p, 0),
      uniform26: 1 / 26,
      uniform256: 1 / 256,
      plainLetters: indexOfCoincidence(plainLetters),
      caesarLetters: indexOfCoincidence(caesarLetters),
      plainBytes: indexOfCoincidence(plainBytes),
      eccBytes: indexOfCoincidence(eccBytes),
    },
    tests: {
      plainVsEnglish: test(plainLetters, englishExpected),
      caesarVsEnglish: test(caesarLetters, englishExpected),
      caesarVsShiftedEnglish: test(caesarLetters, shifted),
      caesarVsUniform26: test(caesarLetters, uniform26),
      plainBytesVsUniform256: test(plainBytes, uniform256),
      eccBytesVsUniform256: test(eccBytes, uniform256),
    },
  };
}

/**
 * The same message encrypted twice under each scheme with the same key: the
 * Caesar cipher is deterministic, the toy ECC scheme draws a fresh ephemeral
 * scalar each time. Both ciphertexts decrypt to the message.
 * @param {{ message?: string, seed?: number, bits?: number, caesarKey?: number }} [options]
 */
export function repeatedEncryption({ message = 'MEET ME AT THE OLD BRIDGE AT TEN', seed = 20261019, bits = 20, caesarKey = 3 } = {}) {
  const random = createRandom(deriveSeed(seed, 'repeat'));
  const pair = generateKeyPair({ bits, random });
  const first = encryptTrace(message, pair.publicKey, { random });
  const second = encryptTrace(message, pair.publicKey, { random });
  const c1 = caesarEncrypt(message, caesarKey);
  const c2 = caesarEncrypt(message, caesarKey);
  let differing = 0;
  for (let i = 0; i < first.cipherBytes.length; i += 1) {
    let x = first.cipherBytes[i] ^ second.cipherBytes[i];
    while (x) {
      differing += x & 1;
      x >>= 1;
    }
  }
  return {
    message,
    bits,
    privateKey: pair.privateKey.toString(),
    publicKey: pair.publicKeyHex,
    caesar: { key: caesarKey, first: c1, second: c2, equal: c1 === c2, decrypted: decrypt(c1, caesarKey) },
    ecc: {
      first: first.ciphertext,
      second: second.ciphertext,
      // The intermediate values of the first encryption, for the worked example.
      trace: {
        ephemeral: first.ephemeral.toString(16),
        sharedX: first.S.x.toString(16).padStart(64, '0'),
        keystream: bytesToHex(first.keystream),
      },
      equal: first.ciphertext.c === second.ciphertext.c && first.ciphertext.R === second.ciphertext.R,
      differingBits: differing,
      totalBits: first.cipherBytes.length * 8,
      decryptedFirst: eccDecrypt(first.ciphertext, pair.privateKey),
      decryptedSecond: eccDecrypt(second.ciphertext, pair.privateKey),
    },
  };
}

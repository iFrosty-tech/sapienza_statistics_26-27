/**
 * The Caesar cipher on the 26-letter Latin alphabet and the statistical
 * cryptanalysis of it.
 *
 * The cipher rotates every letter by a fixed key k (mod 26), preserving case
 * and leaving every non-letter unchanged. Because the same shift is applied to
 * every position, the letter frequencies of the plaintext survive encryption
 * and are merely permuted; the key is therefore recoverable by comparing the
 * letter distribution of each of the 26 candidate decryptions with a reference
 * distribution of the language. The module offers three such comparisons — a
 * Pearson χ² goodness-of-fit statistic, the multinomial log-likelihood (the
 * maximum-likelihood estimator of the shift) and an n-gram log-probability
 * score — together with an exhaustive search that shows why a key search needs
 * an explicit plaintext-recognition criterion.
 *
 * The reference frequencies are a parameter, not a hard-coded table, so that
 * the library commits to no particular corpus. Each recovery method returns a
 * full ranking over the 26 keys together with the best key, and reports whether
 * the ciphertext carried any information at all.
 *
 * Teaching code: no attempt at performance or constant-time behaviour.
 */
import { chiSquareGoodnessOfFit } from './stats.js';

/** The alphabet whose letters the cipher rotates, in order. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SIZE = 26;
const A_UPPER = 65;
const A_LOWER = 97;

/** The key reduced to [0, 26); throws on a non-integer key. */
export function normalizeKey(key) {
  if (typeof key !== 'number' || !Number.isInteger(key)) throw new TypeError('the key must be an integer');
  return ((key % SIZE) + SIZE) % SIZE;
}

/** Rotates one character code by `shift`, leaving non-letters untouched. */
function shiftCharCode(code, shift) {
  if (code >= A_UPPER && code <= A_UPPER + 25) return A_UPPER + ((code - A_UPPER + shift) % SIZE);
  if (code >= A_LOWER && code <= A_LOWER + 25) return A_LOWER + ((code - A_LOWER + shift) % SIZE);
  return code;
}

/** Encrypts `text` with the Caesar shift `key` (normalised mod 26). */
export function encrypt(text, key) {
  const shift = normalizeKey(key);
  let out = '';
  for (let i = 0; i < text.length; i += 1) out += String.fromCharCode(shiftCharCode(text.charCodeAt(i), shift));
  return out;
}

/** Decrypts `text`, the inverse shift of {@link encrypt}. */
export function decrypt(text, key) {
  return encrypt(text, SIZE - normalizeKey(key));
}

/** The uppercase letters A–Z of `text`, with case folded and everything else removed. */
export function lettersOnly(text) {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= A_UPPER && code <= A_UPPER + 25) out += text[i];
    else if (code >= A_LOWER && code <= A_LOWER + 25) out += String.fromCharCode(code - 32);
  }
  return out;
}

/** The 26 counts of the letters A … Z in `text`, case-insensitive. */
export function letterCounts(text) {
  const counts = new Array(SIZE).fill(0);
  const letters = lettersOnly(text);
  for (let i = 0; i < letters.length; i += 1) counts[letters.charCodeAt(i) - A_UPPER] += 1;
  return counts;
}

/** The relative frequencies of A … Z in `text` (all zero when there are no letters). */
export function letterFrequencies(text) {
  const counts = letterCounts(text);
  const total = counts.reduce((s, c) => s + c, 0);
  return total === 0 ? counts : counts.map((c) => c / total);
}

/* ------------------------------------------------------------------------ */
/* N-gram models                                                             */
/* ------------------------------------------------------------------------ */

/**
 * The counts of the overlapping n-grams of `text`. Only letters are kept and
 * case is folded; n-grams are never allowed to span a word boundary (a run of
 * non-letters), so that the model describes within-word letter sequences
 * rather than artefacts of punctuation and spacing.
 * @returns {Map<string, number>}
 */
export function ngramCounts(text, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
  const counts = new Map();
  for (const word of text.split(/[^A-Za-z]+/)) {
    const w = word.toUpperCase();
    for (let i = 0; i + n <= w.length; i += 1) {
      const gram = w.slice(i, i + n);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Builds an n-gram model of log-probabilities from counts. Seen n-grams get
 * ln(count / total); unseen ones get the floor ln(smoothing / total), which is
 * strictly below every seen value when 0 < smoothing < 1.
 */
function modelFromMap(counts, n, smoothing) {
  if (!(smoothing > 0)) throw new RangeError('smoothing must be positive');
  let total = 0;
  for (const c of counts.values()) total += c;
  if (total === 0) throw new RangeError('the training text has no n-grams of this length');
  const logProb = new Map();
  for (const [gram, c] of counts) logProb.set(gram, Math.log(c / total));
  return Object.freeze({ n, total, distinct: logProb.size, floor: Math.log(smoothing / total), logProb });
}

/**
 * An n-gram model trained on `corpus`.
 * @param {string} corpus the reference text
 * @param {number} n the n-gram length (2 = bigram, 4 = quadgram)
 * @param {{ smoothing?: number }} [options] pseudo-count for unseen n-grams (default 0.01)
 */
export function buildNgramModel(corpus, n, { smoothing = 0.01 } = {}) {
  return modelFromMap(ngramCounts(corpus, n), n, smoothing);
}

/** An n-gram model rebuilt from serialised counts (e.g. loaded at build time). */
export function ngramModelFromCounts(counts, n, { smoothing = 0.01 } = {}) {
  return modelFromMap(new Map(Object.entries(counts)), n, smoothing);
}

/** The log-probability the model assigns to a single n-gram (floored when unseen). */
export function ngramLogProb(model, gram) {
  return model.logProb.get(gram.toUpperCase()) ?? model.floor;
}

/**
 * The total log-probability the model assigns to `text`: the sum of the
 * log-probabilities of its overlapping within-word n-grams. A text with no
 * n-gram of the model's length scores 0.
 */
export function ngramScore(text, model) {
  let score = 0;
  for (const [gram, c] of ngramCounts(text, model.n)) score += c * ngramLogProb(model, gram);
  return score;
}

/* ------------------------------------------------------------------------ */
/* Key recovery                                                              */
/* ------------------------------------------------------------------------ */

/** Validates a 26-entry table of non-negative expected frequencies with positive sum. */
function checkExpected(expectedFreqs) {
  if (!Array.isArray(expectedFreqs) || expectedFreqs.length !== SIZE) {
    throw new RangeError('expectedFreqs must have 26 entries');
  }
  let sum = 0;
  for (const f of expectedFreqs) {
    if (!(f >= 0)) throw new RangeError('expected frequencies must be non-negative');
    sum += f;
  }
  if (sum <= 0) throw new RangeError('expected frequencies must have a positive sum');
  return sum;
}

/** Rotates a 26-vector of counts as a decryption by `key` would (counts[i] ← counts[i + key]). */
function countsAfterDecrypt(counts, key) {
  const out = new Array(SIZE);
  for (let i = 0; i < SIZE; i += 1) out[i] = counts[(i + key) % SIZE];
  return out;
}

/**
 * Assembles a ranking result from a per-key score. `better` is 'lower' (χ²) or
 * 'higher' (log-likelihood, n-gram). When the ciphertext is uninformative every
 * key ties; the ranking is then left in key order and key 0 is returned.
 */
function rankKeys(scoreOf, { better, informative, method, letters, extra }) {
  const ranking = [];
  for (let key = 0; key < SIZE; key += 1) ranking.push({ key, score: scoreOf(key), ...(extra ? extra(key) : {}) });
  if (informative) {
    ranking.sort((a, b) => (better === 'lower' ? a.score - b.score : b.score - a.score));
  }
  return { method, better, informative, letters, key: ranking[0].key, ranking };
}

/**
 * Recovers the key by Pearson's χ² goodness-of-fit of the decrypted letter
 * counts against the expected English frequencies. The best key minimises χ².
 * With no letters there is no information: all keys tie and key 0 is returned.
 * @param {string} ciphertext
 * @param {number[]} expectedFreqs 26 relative frequencies (any positive scale)
 */
export function recoverByChiSquare(ciphertext, expectedFreqs) {
  const sum = checkExpected(expectedFreqs);
  const counts = letterCounts(ciphertext);
  const n = counts.reduce((s, c) => s + c, 0);
  const expected = expectedFreqs.map((f) => (n * f) / sum);
  const safe = expected.map((e) => (e > 0 ? e : Number.MIN_VALUE));
  const scoreOf = (key) => chiSquareGoodnessOfFit(countsAfterDecrypt(counts, key), safe).statistic;
  return rankKeys(scoreOf, { better: 'lower', informative: n > 0, method: 'chi-square', letters: n });
}

/**
 * Recovers the key by the multinomial log-likelihood Σ O·ln p of the decrypted
 * counts under the expected frequencies — the maximum-likelihood estimator of
 * the shift. The best key maximises the log-likelihood.
 */
export function recoverByLogLikelihood(ciphertext, expectedFreqs) {
  const sum = checkExpected(expectedFreqs);
  const counts = letterCounts(ciphertext);
  const n = counts.reduce((s, c) => s + c, 0);
  const logP = expectedFreqs.map((f) => Math.log((f > 0 ? f : Number.MIN_VALUE) / sum));
  const scoreOf = (key) => {
    const d = countsAfterDecrypt(counts, key);
    let ll = 0;
    for (let i = 0; i < SIZE; i += 1) ll += d[i] * logP[i];
    return ll;
  };
  return rankKeys(scoreOf, { better: 'higher', informative: n > 0, method: 'log-likelihood', letters: n });
}

/**
 * Recovers the key by the n-gram log-probability of each candidate decryption
 * under `model`. The best key maximises the score. A ciphertext with fewer
 * than n letters yields no n-gram and is uninformative.
 */
export function recoverByNgram(ciphertext, model) {
  const letters = lettersOnly(ciphertext).length;
  const hasNgram = [...ngramCounts(ciphertext, model.n).values()].some((c) => c > 0);
  const scoreOf = (key) => ngramScore(decrypt(ciphertext, key), model);
  return rankKeys(scoreOf, { better: 'higher', informative: hasNgram, method: `${model.n}-gram`, letters });
}

/**
 * The fraction of whitespace-delimited words of `text` whose uppercase form is
 * in the dictionary `words` (a Set of uppercase words). Returns 0 when `text`
 * has no words.
 */
export function wordHitRate(text, words) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    const w = lettersOnly(token);
    if (w.length > 0 && words.has(w)) hits += 1;
  }
  return hits / tokens.length;
}

/**
 * Builds a plaintext recogniser from a word list: a function mapping a
 * candidate plaintext to its dictionary word-hit rate.
 * @param {string[]} wordList words (any case)
 */
export function dictionaryRecognizer(wordList) {
  const words = new Set(wordList.map((w) => w.toUpperCase()));
  return (plaintext) => wordHitRate(plaintext, words);
}

/**
 * Exhaustive search over the 26 keys. Unlike the frequency methods, a brute
 * search of the key space has no intrinsic ordering: it needs an explicit
 * criterion `isPlausible(plaintext)` that recognises the language (a word-hit
 * rate, a predicate, an n-gram score). The ranking records each candidate
 * plaintext. When the criterion separates nothing (every key scores the same),
 * the result is reported as uninformative.
 * @param {string} ciphertext
 * @param {(plaintext: string, key: number) => number|boolean} isPlausible
 */
export function recoverByExhaustiveSearch(ciphertext, isPlausible) {
  const letters = lettersOnly(ciphertext).length;
  const plaintexts = new Array(SIZE);
  const scoreOf = (key) => {
    const plaintext = decrypt(ciphertext, key);
    plaintexts[key] = plaintext;
    const verdict = isPlausible(plaintext, key);
    return typeof verdict === 'boolean' ? (verdict ? 1 : 0) : verdict;
  };
  const scores = Array.from({ length: SIZE }, (_, key) => scoreOf(key));
  const informative = scores.some((s) => s !== scores[0]);
  return rankKeys((key) => scores[key], {
    better: 'higher',
    informative,
    method: 'exhaustive',
    letters,
    extra: (key) => ({ plaintext: plaintexts[key] }),
  });
}

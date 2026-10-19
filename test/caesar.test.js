/**
 * The Caesar cipher of src/lib/caesar.js and the three statistical key-recovery
 * methods (Pearson χ², multinomial log-likelihood, n-gram scoring), plus the
 * exhaustive search that needs a plaintext-recognition criterion.
 *
 * The plaintext and the training text are short original paragraphs written for
 * these tests, so that the n-gram model is never trained on the text it scores.
 * The English letter frequencies are those of R. E. Lewand, "Cryptological
 * Mathematics", Mathematical Association of America (2000), in per cent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABET,
  normalizeKey,
  encrypt,
  decrypt,
  lettersOnly,
  letterCounts,
  letterFrequencies,
  ngramCounts,
  buildNgramModel,
  ngramModelFromCounts,
  ngramLogProb,
  ngramScore,
  recoverByChiSquare,
  recoverByLogLikelihood,
  recoverByNgram,
  recoverByExhaustiveSearch,
  wordHitRate,
  dictionaryRecognizer,
} from '../src/lib/caesar.js';
import { chiSquareGoodnessOfFit } from '../src/lib/stats.js';

/* Lewand (2000), relative frequencies of A … Z in English text, per cent. */
const LEWAND_2000 = [
  8.167, 1.492, 2.782, 4.253, 12.702, 2.228, 2.015, 6.094, 6.966, 0.153, 0.772, 4.025, 2.406,
  6.749, 7.507, 1.929, 0.095, 5.987, 6.327, 9.056, 2.758, 0.978, 2.36, 0.15, 1.974, 0.074,
];

const PLAINTEXT =
  'Statistical inference begins with a model of how the data were generated. In the study of ' +
  'classical ciphers the model is remarkably simple: every letter of the plaintext is replaced by ' +
  'the letter a fixed number of positions further along the alphabet. Because the substitution is ' +
  'the same for every position, the frequencies of the letters survive encryption unchanged and are ' +
  'merely rotated. An analyst who knows how often each letter occurs in ordinary English can ' +
  'therefore compare the observed counts with the expected ones under each of the twenty six ' +
  'possible shifts and select the shift that fits best.';

const TRAINING =
  'The theory of probability provides the language in which uncertainty is described and measured. ' +
  'When a message is transmitted through a channel that an adversary can observe, the security of the ' +
  'communication depends on how much information the observed symbols reveal about the secret key. ' +
  'Shannon showed that a cipher is perfectly secret only when the key is at least as long as the ' +
  'message and is never used twice. Every practical system falls short of this ideal, and the ' +
  'question is then how many symbols an opponent must intercept before the remaining uncertainty ' +
  'about the key vanishes. For a simple substitution of the letters of a natural language the answer ' +
  'is remarkably small, because the language itself is highly redundant: some letters are far more ' +
  'common than others, certain pairs of letters occur together again and again, and whole words such ' +
  'as the, and, of and that account for a large share of any ordinary text. A statistician who ' +
  'collects these regularities from a reference corpus can measure how well each candidate decryption ' +
  'agrees with them and can rank the candidates accordingly.';

const KEYS = [1, 3, 7, 13, 19, 25];

const isRanking = (result) => {
  assert.equal(result.ranking.length, 26);
  assert.deepEqual(
    result.ranking.map((r) => r.key).sort((a, b) => a - b),
    Array.from({ length: 26 }, (_, i) => i),
  );
  assert.equal(result.key, result.ranking[0].key);
};

test('the alphabet has the 26 Latin letters', () => {
  assert.equal(ALPHABET, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

test('encrypt shifts letters, preserves case and leaves other characters unchanged', () => {
  assert.equal(encrypt('Hello, World!', 3), 'Khoor, Zruog!');
  assert.equal(encrypt('xyz XYZ', 3), 'abc ABC');
  assert.equal(encrypt('Café 2026', 1), 'Dbgé 2026');
  assert.equal(encrypt('', 5), '');
});

test('keys are normalised modulo 26 and must be integers', () => {
  assert.equal(normalizeKey(29), 3);
  assert.equal(normalizeKey(-23), 3);
  assert.equal(normalizeKey(-26), 0);
  assert.equal(encrypt(PLAINTEXT, 29), encrypt(PLAINTEXT, 3));
  assert.equal(encrypt(PLAINTEXT, -23), encrypt(PLAINTEXT, 3));
  assert.equal(encrypt(PLAINTEXT, 26), PLAINTEXT);
  assert.throws(() => encrypt('abc', 1.5), TypeError);
  assert.throws(() => encrypt('abc', '3'), TypeError);
});

test('decrypt inverts encrypt for every key', () => {
  for (let k = -30; k <= 30; k += 1) assert.equal(decrypt(encrypt(PLAINTEXT, k), k), PLAINTEXT);
});

test('letter counts and frequencies fold case and ignore non-letters', () => {
  assert.equal(lettersOnly('Ab, c-Dé!'), 'ABCD');
  const counts = letterCounts('Aab! z');
  assert.equal(counts.length, 26);
  assert.equal(counts[0], 2);
  assert.equal(counts[1], 1);
  assert.equal(counts[25], 1);
  assert.equal(counts.reduce((s, c) => s + c, 0), 4);
  const f = letterFrequencies(PLAINTEXT);
  assert.ok(Math.abs(f.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  assert.deepEqual(letterFrequencies('123 !'), new Array(26).fill(0));
});

test('encryption rotates the letter counts', () => {
  const before = letterCounts(PLAINTEXT);
  const after = letterCounts(encrypt(PLAINTEXT, 4));
  for (let i = 0; i < 26; i += 1) assert.equal(after[(i + 4) % 26], before[i]);
});

test('n-gram counts and models keep word boundaries (n-grams never span them)', () => {
  // "abab, ba" has within-word bigrams AB, BA, AB (first word) and BA (second word).
  const counts = ngramCounts('abab, ba', 2);
  assert.deepEqual([...counts.entries()].sort(), [['AB', 2], ['BA', 2]]);
  // Two one-letter words yield no bigram, so they contribute nothing.
  assert.equal(ngramCounts('a b', 2).size, 0);
  const model = buildNgramModel('abab, ba', 2);
  assert.equal(model.n, 2);
  assert.equal(model.total, 4);
  assert.equal(model.distinct, 2);
  assert.ok(Math.abs(ngramLogProb(model, 'AB') - Math.log(2 / 4)) < 1e-12);
  assert.ok(Math.abs(ngramLogProb(model, 'ba') - Math.log(2 / 4)) < 1e-12);
  // Unseen n-grams receive the floor ln(smoothing / total), below every seen n-gram.
  assert.ok(Math.abs(ngramLogProb(model, 'ZZ') - Math.log(0.01 / 4)) < 1e-12);
  assert.equal(buildNgramModel('abab, ba', 2, { smoothing: 0.5 }).floor, Math.log(0.5 / 4));
  assert.ok(Math.abs(ngramScore('ABA', model) - Math.log(2 / 4) - Math.log(2 / 4)) < 1e-12);
  assert.equal(ngramScore('A', model), 0);
  // A model rebuilt from serialised counts is the same model.
  const rebuilt = ngramModelFromCounts(Object.fromEntries(ngramCounts(TRAINING, 3)), 3);
  assert.equal(ngramScore(PLAINTEXT, rebuilt), ngramScore(PLAINTEXT, buildNgramModel(TRAINING, 3)));
  assert.throws(() => buildNgramModel('abc', 0), RangeError);
  assert.throws(() => buildNgramModel('a', 2), RangeError);
  assert.throws(() => buildNgramModel('abcd', 2, { smoothing: 0 }), RangeError);
});

test('χ² recovers the key of a paragraph and its score is Pearson’s statistic', () => {
  for (const k of KEYS) {
    const ciphertext = encrypt(PLAINTEXT, k);
    const result = recoverByChiSquare(ciphertext, LEWAND_2000);
    isRanking(result);
    assert.equal(result.key, k);
    assert.equal(result.method, 'chi-square');
    assert.equal(result.better, 'lower');
    assert.equal(result.informative, true);
    for (let i = 1; i < 26; i += 1) assert.ok(result.ranking[i - 1].score <= result.ranking[i].score);
    const n = lettersOnly(PLAINTEXT).length;
    assert.equal(result.letters, n);
    const total = LEWAND_2000.reduce((s, x) => s + x, 0);
    const expected = LEWAND_2000.map((x) => (n * x) / total);
    const { statistic } = chiSquareGoodnessOfFit(letterCounts(PLAINTEXT), expected);
    assert.ok(Math.abs(result.ranking[0].score - statistic) < 1e-9);
  }
});

test('the multinomial log-likelihood recovers the key and is Σ O·ln p', () => {
  for (const k of KEYS) {
    const result = recoverByLogLikelihood(encrypt(PLAINTEXT, k), LEWAND_2000);
    isRanking(result);
    assert.equal(result.key, k);
    assert.equal(result.better, 'higher');
    for (let i = 1; i < 26; i += 1) assert.ok(result.ranking[i - 1].score >= result.ranking[i].score);
    const total = LEWAND_2000.reduce((s, x) => s + x, 0);
    const ll = letterCounts(PLAINTEXT).reduce((s, o, i) => s + o * Math.log(LEWAND_2000[i] / total), 0);
    assert.ok(Math.abs(result.ranking[0].score - ll) < 1e-9);
  }
});

test('bigram and quadgram scores recover the key with a model trained on another text', () => {
  for (const n of [2, 4]) {
    const model = buildNgramModel(TRAINING, n);
    for (const k of KEYS) {
      const result = recoverByNgram(encrypt(PLAINTEXT, k), model);
      isRanking(result);
      assert.equal(result.key, k, `n = ${n}, key ${k}`);
      assert.equal(result.method, `${n}-gram`);
      assert.equal(result.better, 'higher');
      assert.ok(Math.abs(result.ranking[0].score - ngramScore(PLAINTEXT, model)) < 1e-9);
    }
  }
});

test('exhaustive search lists the 26 candidates and needs a recognition criterion', () => {
  const words = TRAINING.split(/[^A-Za-z]+/).filter(Boolean);
  const recognize = dictionaryRecognizer(words);
  assert.ok(wordHitRate(PLAINTEXT, new Set(words.map((w) => w.toUpperCase()))) > 0.4);
  assert.equal(wordHitRate('123', new Set(['THE'])), 0);
  for (const k of KEYS) {
    const ciphertext = encrypt(PLAINTEXT, k);
    const result = recoverByExhaustiveSearch(ciphertext, recognize);
    isRanking(result);
    assert.equal(result.key, k);
    assert.equal(result.method, 'exhaustive');
    assert.equal(result.ranking[0].plaintext, PLAINTEXT);
    assert.equal(result.ranking.find((r) => r.key === 0).plaintext, ciphertext);
  }
  // Without a criterion that separates English from noise every key ties: no decision.
  const blind = recoverByExhaustiveSearch(encrypt(PLAINTEXT, 5), () => 0);
  assert.equal(blind.informative, false);
  assert.equal(blind.key, 0);
  // A boolean predicate is accepted and read as 1 / 0.
  const predicate = recoverByExhaustiveSearch(encrypt('the cat', 9), (t) => t.startsWith('the'));
  assert.equal(predicate.key, 9);
  assert.equal(predicate.ranking[0].score, 1);
});

test('a ciphertext without letters carries no information: all keys tie and key 0 is returned', () => {
  const model = buildNgramModel(TRAINING, 2);
  for (const result of [
    recoverByChiSquare('', LEWAND_2000),
    recoverByLogLikelihood('2026 — !?', LEWAND_2000),
    recoverByNgram('', model),
  ]) {
    isRanking(result);
    assert.equal(result.letters, 0);
    assert.equal(result.informative, false);
    assert.equal(result.key, 0);
    assert.deepEqual(result.ranking.map((r) => r.key), Array.from({ length: 26 }, (_, i) => i));
    assert.ok(result.ranking.every((r) => r.score === result.ranking[0].score));
  }
});

test('very short texts still produce a full ranking', () => {
  const model = buildNgramModel(TRAINING, 2);
  for (const result of [
    recoverByChiSquare('Hi', LEWAND_2000),
    recoverByLogLikelihood('Hi', LEWAND_2000),
    recoverByNgram('Hi', model),
    recoverByNgram('H', model),
  ]) {
    isRanking(result);
  }
  assert.equal(recoverByNgram('H', model).informative, false);
  assert.equal(recoverByChiSquare('Hi', LEWAND_2000).informative, true);
});

test('expected frequencies are validated', () => {
  assert.throws(() => recoverByChiSquare('abc', LEWAND_2000.slice(1)), RangeError);
  assert.throws(() => recoverByChiSquare('abc', new Array(26).fill(0)), RangeError);
  assert.throws(() => recoverByLogLikelihood('abc', [-1, ...LEWAND_2000.slice(1)]), RangeError);
});

/**
 * The model of English used by the cryptanalysis panel of homework 03 (§5),
 * built in the browser from the same training statistics as the study:
 * letter frequencies, within-word bigram and trigram models with the study's
 * pseudo-count, and the dictionary of the exhaustive search. Only the derived
 * statistics of src/data/hw03/training-stats.json ship with the page; the
 * held-out text never does.
 *
 * It mirrors caesarModels and recoverWith of src/lib/caesar-study.js, which
 * cannot be imported here: that module depends on the study code of homework
 * 01, which builds a ladder of curves when it is loaded.
 */

import stats from './training-stats.json' with { type: 'json' };
import {
  dictionaryRecognizer,
  ngramModelFromCounts,
  recoverByChiSquare,
  recoverByExhaustiveSearch,
  recoverByLogLikelihood,
  recoverByNgram,
} from '../../lib/caesar.js';

/** The pseudo-count of an n-gram absent from the training corpus, as in the study. */
export const NGRAM_SMOOTHING = 0.01;

/** The recovery methods of §5.2, in display order. */
export const METHODS = Object.freeze(['chi-square', 'log-likelihood', 'bigram', 'trigram', 'exhaustive']);

/** Printed names of the methods. */
export const METHOD_LABELS = Object.freeze({
  'chi-square': 'χ² distance',
  'log-likelihood': 'Likelihood',
  bigram: 'Bigrams',
  trigram: 'Trigrams',
  exhaustive: 'Dictionary',
});

/** The score each method ranks the keys by, as an axis title. */
export const SCORE_LABELS = Object.freeze({
  'chi-square': 'χ² distance, lower is better',
  'log-likelihood': 'Log-likelihood, higher is better',
  bigram: 'Bigram log-probability, higher is better',
  trigram: 'Trigram log-probability, higher is better',
  exhaustive: 'Share of dictionary words, higher is better',
});

const letterTotal = stats.letters.counts.reduce((s, c) => s + c, 0);

/** The reference models of the training corpus. */
export const models = Object.freeze({
  frequencies: stats.letters.counts.map((c) => c / letterTotal),
  bigram: ngramModelFromCounts(stats.bigrams.counts, 2, { smoothing: NGRAM_SMOOTHING }),
  trigram: ngramModelFromCounts(stats.trigrams.counts, 3, { smoothing: NGRAM_SMOOTHING }),
  recognise: dictionaryRecognizer(stats.words.list),
  words: stats.words.list.length,
  trainingLetters: letterTotal,
});

/** Runs one method of §5.2 on a ciphertext and returns its ranking of the 26 keys. */
export function recoverWith(method, ciphertext) {
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

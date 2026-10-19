/**
 * Derivation of the English corpus statistics of homework 03 (the Caesar
 * cipher study of src/lib/caesar-study.js).
 *
 *   node scripts/hw03-corpus.mjs [--raw <directory>] [--offline]
 *
 * Downloads the public-domain books listed in BOOKS from Project Gutenberg
 * (https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt) into the raw
 * directory (default node_modules/.cache/hw03-corpus/), keeps only the text
 * between the "*** START OF" and "*** END OF" markers, so that the Project
 * Gutenberg header, licence and footer are removed, and normalises it:
 * diacritics are stripped (NFD), apostrophes inside words are dropped
 * ("don't" → "DONT"), every other run of non-letters becomes one space and the
 * letters are folded to upper case. With --offline nothing is downloaded and
 * every book must already be in the raw directory.
 *
 * Outputs, in src/data/hw03/:
 *   corpus-manifest.json  the books (id, title, author, role), the SHA-256 of
 *                         each stripped text and of each normalised text, and
 *                         the sizes of everything derived
 *   training-stats.json   from the training books only: the 26 letter counts,
 *                         the within-word bigram and trigram counts (n-grams
 *                         never span a space, as in src/lib/caesar.js) and the
 *                         most frequent words
 *   heldout.txt           the normalised held-out book (a different author,
 *                         never used for training), cut at a word boundary to
 *                         at most HELDOUT_MAX_CHARS characters
 *
 * The training statistics and the held-out text are therefore disjoint by
 * construction. Re-running the script on the same downloads reproduces the
 * files byte for byte.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/hw03');

/** The books of the corpus: six training books by six authors and one held-out book by a seventh. */
export const BOOKS = Object.freeze([
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', year: 1813, role: 'training' },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', year: 1859, role: 'training' },
  { id: 2701, title: 'Moby-Dick; or, The Whale', author: 'Herman Melville', year: 1851, role: 'training' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', year: 1892, role: 'training' },
  { id: 84, title: 'Frankenstein; or, The Modern Prometheus', author: 'Mary Wollstonecraft Shelley', year: 1818, role: 'training' },
  { id: 74, title: 'The Adventures of Tom Sawyer', author: 'Mark Twain', year: 1876, role: 'training' },
  { id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', year: 1890, role: 'heldout' },
]);

/** Number of most frequent training words kept for the dictionary recogniser of the exhaustive search. */
export const COMMON_WORDS = 2000;

/** Maximum length of the committed held-out text, in characters. */
export const HELDOUT_MAX_CHARS = 400000;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The text between the Project Gutenberg start and end markers (the lines of the markers excluded). */
export function stripGutenberg(raw) {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/m);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/m);
  if (start < 0 || end < 0 || end <= start) throw new Error('Project Gutenberg start/end markers not found');
  const afterStart = text.indexOf('\n', start) + 1;
  return text.slice(afterStart, end).trim();
}

/** Upper-case letters A–Z separated by single spaces (see the header). */
export function normalise(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([A-Za-z])['’]([A-Za-z])/g, '$1$2')
    .replace(/[^A-Za-z]+/g, ' ')
    .trim()
    .toUpperCase();
}

function letterCounts(text) {
  const counts = new Array(26).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i) - 65;
    if (c >= 0 && c < 26) counts[c] += 1;
  }
  return counts;
}

function ngramCounts(words, n) {
  const counts = new Map();
  for (const w of words) {
    for (let i = 0; i + n <= w.length; i += 1) {
      const g = w.slice(i, i + n);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  // Sorted by count, then alphabetically, so that the file is stable.
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}

function wordCounts(words) {
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

async function fetchBook(id, rawDir, offline) {
  const file = resolve(rawDir, `pg${id}.txt`);
  if (!existsSync(file)) {
    if (offline) throw new Error(`pg${id}.txt is missing from ${rawDir} (--offline)`);
    const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    console.log(`downloaded ${url}`);
  }
  return readFileSync(file, 'utf8');
}

function parseArgs(argv) {
  const args = { raw: resolve(ROOT, 'node_modules/.cache/hw03-corpus'), offline: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--raw') args.raw = resolve(argv[(i += 1)]);
    else if (argv[i] === '--offline') args.offline = true;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return args;
}

async function main() {
  const { raw, offline } = parseArgs(process.argv.slice(2));
  mkdirSync(raw, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const books = [];
  for (const book of BOOKS) {
    const stripped = stripGutenberg(await fetchBook(book.id, raw, offline));
    const text = normalise(stripped);
    books.push({ ...book, stripped, text });
  }

  const training = books.filter((b) => b.role === 'training');
  const heldout = books.find((b) => b.role === 'heldout');
  if (new Set(training.map((b) => b.author)).has(heldout.author)) throw new Error('the held-out author is also a training author');

  const trainingWords = training.flatMap((b) => b.text.split(' '));
  const letters = training.map((b) => letterCounts(b.text)).reduce((acc, c) => acc.map((v, i) => v + c[i]));
  const bigrams = ngramCounts(trainingWords, 2);
  const trigrams = ngramCounts(trainingWords, 3);
  const words = wordCounts(trainingWords);
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

  const stats = {
    description:
      'Letter, within-word bigram and trigram counts and the most frequent words of the training books of corpus-manifest.json, normalised by scripts/hw03-corpus.mjs.',
    letters: { alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', total: letters.reduce((s, v) => s + v, 0), counts: letters },
    bigrams: { n: 2, total: sum(bigrams), distinct: Object.keys(bigrams).length, counts: bigrams },
    trigrams: { n: 3, total: sum(trigrams), distinct: Object.keys(trigrams).length, counts: trigrams },
    words: {
      total: trainingWords.length,
      distinct: words.length,
      kept: COMMON_WORDS,
      coverage: words.slice(0, COMMON_WORDS).reduce((s, [, c]) => s + c, 0) / trainingWords.length,
      list: words.slice(0, COMMON_WORDS).map(([w]) => w),
    },
  };

  let held = heldout.text;
  if (held.length > HELDOUT_MAX_CHARS) held = held.slice(0, held.lastIndexOf(' ', HELDOUT_MAX_CHARS));
  const statsText = `${JSON.stringify(stats)}\n`;
  const heldText = `${held}\n`;
  writeFileSync(resolve(OUT, 'training-stats.json'), statsText);
  writeFileSync(resolve(OUT, 'heldout.txt'), heldText);

  const manifest = {
    description:
      'Public-domain English texts from Project Gutenberg used by homework 03. Each text was stripped of the Project Gutenberg header and footer (between the "*** START OF" and "*** END OF" markers) and normalised by scripts/hw03-corpus.mjs.',
    source: 'https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt',
    normalisation:
      'NFD with diacritics removed; apostrophes inside words dropped; every other run of non-letters replaced by one space; letters folded to upper case.',
    books: books.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      year: b.year,
      role: b.role,
      strippedChars: b.stripped.length,
      strippedSha256: sha256(b.stripped),
      normalisedLetters: letterCounts(b.text).reduce((s, v) => s + v, 0),
      normalisedSha256: sha256(b.text),
    })),
    outputs: {
      'training-stats.json': { bytes: Buffer.byteLength(statsText), sha256: sha256(statsText) },
      'heldout.txt': {
        bytes: Buffer.byteLength(heldText),
        sha256: sha256(heldText),
        letters: letterCounts(held).reduce((s, v) => s + v, 0),
        truncated: held.length < heldout.text.length,
        maxChars: HELDOUT_MAX_CHARS,
      },
    },
  };
  writeFileSync(resolve(OUT, 'corpus-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `training: ${stats.letters.total} letters, ${stats.bigrams.distinct} bigrams, ${stats.trigrams.distinct} trigrams; ` +
      `held-out: ${manifest.outputs['heldout.txt'].letters} letters (${manifest.outputs['heldout.txt'].bytes} bytes)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

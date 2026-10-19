/**
 * The pure part of the four interactive panels of homework 03: input parsing,
 * the view models the panels draw, the expected costs of the attacks and the
 * formats of their readouts. Nothing here touches the DOM, so that every rule
 * the panels follow is tested in Node (test/hw03-demos.test.js).
 *
 *   parseCaesarKey, shiftedCounts, alphabetStripOffset, cipherStripOffset,
 *   nearestCongruent                       the Caesar panel (§3)
 *   eccEncryptionSteps, xorRows, wrongKey, tamperCiphertext, bitDifference
 *                                          the encryption panel (§2)
 *   rankingView, evidenceNote, SAMPLE_SENTENCES
 *                                          the cryptanalysis panel (§5)
 *   KEY_RECOVERY_BITS, expectedOperations, progressView,
 *   formatDuration, formatRate, parseRate  the key-recovery panel (§6)
 */

import { encrypt as caesarEncrypt, letterCounts } from '../lib/caesar.js';
import { compress } from '../lib/secp256k1.js';
import { bytesToHex, hexToBytes } from '../lib/bytes.js';

const DASH = '—';
const SIZE = 26;

/* ------------------------------------------------------------- Caesar */

/** Reads a Caesar key typed by the reader: a whole number from 0 to 25. */
export function parseCaesarKey(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,2}$/.test(text) || Number(text) > 25) {
    return { ok: false, message: 'The key must be a whole number from 0 to 25.' };
  }
  return { ok: true, key: Number(text) };
}

/**
 * The letter counts of a text and of its Caesar ciphertext under `key`. The
 * second is the first rotated by the key: cipher[(i + key) mod 26] = plain[i].
 */
export function shiftedCounts(text, key) {
  const plain = letterCounts(text);
  const cipher = letterCounts(caesarEncrypt(text, key));
  return { plain, cipher, letters: plain.reduce((s, c) => s + c, 0), max: Math.max(0, ...plain) };
}

/** The index of coincidence Σ n_i(n_i − 1) / (N(N − 1)) of 26 counts (eq. 7); null below two letters. */
export function indexOfCoincidence(counts) {
  const n = counts.reduce((s, c) => s + c, 0);
  if (n < 2) return null;
  return counts.reduce((s, c) => s + c * (c - 1), 0) / (n * (n - 1));
}

/** Offset, in cells, of the strip A…Z A…Z A…Z so that the cell under plaintext letter i shows (i + k) mod 26. */
export const alphabetStripOffset = (key) => ((key % SIZE) + SIZE) % SIZE;

/** Offset of a strip of plaintext counts so that ciphertext cell j shows the count of plaintext letter (j − k) mod 26. */
export const cipherStripOffset = (key) => (SIZE - alphabetStripOffset(key)) % SIZE;

/** The value congruent to `target` modulo 26 that is closest to `current`: the shortest way round the wheel. */
export function nearestCongruent(current, target) {
  const delta = ((((target - current) % SIZE) + SIZE) % SIZE);
  return delta > SIZE / 2 ? current + delta - SIZE : current + delta;
}

/* ---------------------------------------------------------------- ECC */

/**
 * The intermediate values of one encryption, in the order of §2.2, from the
 * trace of src/lib/toy-ecc-encryption.js: the ephemeral scalar, the points R
 * and S (compressed), the keystream cut into its Keccak-256 blocks, the masked
 * bytes and the tag.
 */
export function eccEncryptionSteps(trace) {
  const ks = trace.keystream;
  const blocks = [];
  for (let i = 0; i * 32 < ks.length; i += 1) blocks.push({ counter: i, hex: bytesToHex(ks.subarray(i * 32, i * 32 + 32)) });
  return [
    { id: 'r', label: 'Ephemeral scalar r, uniform on [1, n − 1]', value: trace.ephemeral.toString(16).padStart(64, '0') },
    { id: 'R', label: 'Ephemeral point R = rG, compressed', value: trace.ciphertext.R },
    { id: 'S', label: 'Shared point S = rQ, compressed', value: bytesToHex(compress(trace.S)) },
    { id: 'keystream', label: 'Keystream K, Keccak-256 blocks in counter mode', value: bytesToHex(ks), blocks },
    { id: 'c', label: 'Masked bytes c = m ⊕ K', value: trace.ciphertext.c },
    { id: 'tag', label: 'Tag t = H(TAG ‖ comp(S) ‖ c)', value: trace.ciphertext.tag },
  ];
}

const hex2 = (b) => b.toString(16).padStart(2, '0');

/** A byte shown as a character: printable ASCII as itself, the space as ␠, anything else as a middle dot. */
function byteGlyph(b) {
  if (b === 0x20) return '␠';
  if (b > 0x20 && b < 0x7f) return String.fromCharCode(b);
  return '·';
}

/** The first `limit` positions of the exclusive or c = m ⊕ K, as rows of two-digit hex. */
export function xorRows(messageBytes, keystream, cipherBytes, limit = 12) {
  const n = Math.min(limit, messageBytes.length);
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    char: byteGlyph(messageBytes[i]),
    m: hex2(messageBytes[i]),
    k: hex2(keystream[i]),
    c: hex2(cipherBytes[i]),
  }));
}

/** A key that is certainly wrong but still in the restricted range [1, 2^bits]. */
export function wrongKey(k, bits) {
  return k === 2n ** BigInt(bits) ? k - 1n : k + 1n;
}

/** The ciphertext with one bit of c flipped (the tag if the message is empty). */
export function tamperCiphertext(ciphertext) {
  const field = ciphertext.c.length > 0 ? 'c' : 'tag';
  const bytes = hexToBytes(ciphertext[field]);
  bytes[0] ^= 0x01;
  return { ...ciphertext, [field]: bytesToHex(bytes) };
}

/** The number of differing bits between two hex strings of the same length. */
export function bitDifference(a, b) {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/* ------------------------------------------------------ cryptanalysis */

/**
 * The 26 keys of one recovery, ready to draw: the mid-rank of every key among
 * tied scores (1 is best), the score rescaled to [0, 1] with the best key at 1
 * and the worst at 0, and flags for the best key and for the true key when it
 * is known. `rows` is in rank order, `byKey` in key order.
 */
export function rankingView(result, { trueKey = null } = {}) {
  const goodness = (s) => (result.better === 'lower' ? -s.score : s.score);
  const scored = result.ranking.map((r) => ({ key: r.key, score: r.score, g: goodness(r), plaintext: r.plaintext }));
  const gs = scored.map((r) => r.g);
  const hi = Math.max(...gs);
  const lo = Math.min(...gs);
  const informative = result.informative && hi > lo;
  const rows = scored.map((r) => {
    const better = scored.filter((o) => o.g > r.g).length;
    const ties = scored.filter((o) => o.g === r.g).length - 1;
    return {
      key: r.key,
      score: r.score,
      plaintext: r.plaintext,
      rank: informative ? 1 + better + ties / 2 : (SIZE + 1) / 2,
      share: informative ? (r.g - lo) / (hi - lo) : 0,
      isBest: informative && r.g === hi,
      isTrue: trueKey !== null && r.key === trueKey,
    };
  });
  rows.sort((a, b) => a.rank - b.rank || a.key - b.key);
  const byKey = [...rows].sort((a, b) => a.key - b.key);
  const topTies = rows.filter((r) => r.isBest).length;
  return {
    method: result.method,
    better: result.better,
    letters: result.letters,
    informative,
    bestKey: informative ? result.key : null,
    topTies,
    trueRank: trueKey === null ? null : (rows.find((r) => r.key === trueKey)?.rank ?? null),
    rows,
    byKey,
  };
}

/**
 * A warning when the ciphertext cannot support a reliable answer: no letters,
 * a criterion that ties every key, or fewer than ten letters (§5.4). Null when
 * the evidence is adequate.
 */
export function evidenceNote({ letters, informative, method }) {
  if (letters === 0) return 'The ciphertext contains no letters: there is nothing to rank, and every key ties.';
  if (!informative) {
    if (method === 'exhaustive') {
      return 'No candidate decryption contains a dictionary word, so every key scores the same: the search returns a tie, not an answer.';
    }
    const n = method === 'trigram' ? 3 : 2;
    return `The ciphertext contains no ${n}-letter sequence inside a word, so every key scores the same: the method returns a tie, not an answer.`;
  }
  if (letters < 10) {
    return `Only ${letters} letters: below about ten letters no method is reliable (§5.4), and the best key may be one of several plausible shifts.`;
  }
  return null;
}

/**
 * Short public-domain sentences for the cryptanalysis panel, none from the
 * training books or the held-out novel of §5. The last two are deliberately
 * hard: a short Latin sentence violates the English model.
 */
export const SAMPLE_SENTENCES = Object.freeze([
  {
    text: 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.',
    source: 'Abraham Lincoln, Gettysburg Address (1863)',
  },
  {
    text: 'I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach.',
    source: 'Henry David Thoreau, Walden (1854)',
  },
  {
    text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
    source: "Lewis Carroll, Alice's Adventures in Wonderland (1865)",
  },
  {
    text: 'There is grandeur in this view of life, with its several powers, having been originally breathed into a few forms or into one.',
    source: 'Charles Darwin, On the Origin of Species (1859)',
  },
  {
    text: 'I have just returned from a visit to my landlord, the solitary neighbour that I shall be troubled with.',
    source: 'Emily Brontë, Wuthering Heights (1847)',
  },
  { text: 'There was no possibility of taking a walk that day.', source: 'Charlotte Brontë, Jane Eyre (1847)' },
  { text: 'Listen to them, the children of the night. What music they make!', source: 'Bram Stoker, Dracula (1897)' },
  { text: 'To be, or not to be, that is the question.', source: 'William Shakespeare, Hamlet (c. 1600)' },
  { text: 'Veni, vidi, vici.', source: 'Attributed to Julius Caesar by Suetonius; Latin, outside the English model' },
]);

/* ------------------------------------------------------- key recovery */

/** Key sizes offered by the key-recovery panel; brute force above `bruteWarn` bits takes long. */
export const KEY_RECOVERY_BITS = Object.freeze({ min: 8, max: 28, default: 16, bruteWarn: 20 });

/**
 * The constant of the kangaroo's cost in units of 2^(b/2): the implementation
 * runs a tame walk of 4·2^(b/2) jumps and restarts on a miss, and the mean
 * operation counts of Figure 4 lie between 8.4 and 9.5 times 2^(b/2) for every
 * key size from 8 to 24 bits.
 */
export const KANGAROO_CONSTANT = 9;

/**
 * The expected number of group operations of each attack on a key uniform on
 * [1, 2^bits]: (2^b − 1)/2 additions for brute force; m − 1 + m/2 with
 * m = ⌈2^(b/2)⌉ for baby-step giant-step; and, for the kangaroo, whose
 * constant has no closed form for this implementation, 9 · 2^(b/2), the mean
 * measured by the study (Figure 4).
 */
export function expectedOperations(method, bits) {
  const w = 2 ** bits;
  switch (method) {
    case 'brute-force':
      return { value: (w - 1) / 2, formula: '(2^b − 1)/2 ≈ 2^(b−1)' };
    case 'bsgs': {
      const m = Math.ceil(Math.sqrt(w));
      return { value: m - 1 + m / 2, formula: 'm − 1 + m/2 ≈ 1.5 · 2^(b/2)' };
    }
    case 'kangaroo':
      return { value: KANGAROO_CONSTANT * Math.sqrt(w), formula: `≈ ${KANGAROO_CONSTANT} · 2^(b/2), the mean of Figure 4` };
    default:
      throw new Error(`unknown method ${method}`);
  }
}

/** A formula of expectedOperations as HTML, its powers of two set as superscripts. */
export function formulaHtml(formula) {
  return String(formula)
    .replace(/2\^\(([^)]+)\)/g, '2<sup>$1</sup>')
    .replace(/2\^([A-Za-z0-9]+)/g, '2<sup>$1</sup>');
}

/**
 * Solver progress as the panel shows it: the operations spent so far and the
 * share of the key space already excluded. Brute force reports the step j of
 * 2^b; baby-step giant-step the giant step i of m, after a table of m − 1
 * additions; the kangaroo its operations, with no share of the interval
 * excluded, since its walk is not a scan.
 */
export function progressView(method, bits, done, total) {
  if (method === 'brute-force') return { operations: done, fraction: done / total };
  if (method === 'bsgs') return { operations: total - 1 + done, fraction: done / total };
  return { operations: done, fraction: null };
}

/** A duration in milliseconds, printed at a precision that suits its size. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return DASH;
  if (ms < 1) return `${(Math.round(ms * 10) / 10).toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(Math.round(ms / 10) / 100).toFixed(2)} s`;
  if (ms < 60_000) return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
  if (ms < 3_600_000) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)} min ${s % 60} s`;
  }
  const min = Math.round(ms / 60_000);
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Group operations per second. */
export function formatRate(operations, ms) {
  if (!(ms > 0) || !Number.isFinite(operations)) return DASH;
  return `${Math.round(operations / (ms / 1000)).toLocaleString('en-GB')} op/s`;
}

/** A rate printed by the build ('245,712') read back as a number; null when absent. */
export function parseRate(text) {
  const digits = String(text ?? '').replace(/[^0-9.]/g, '');
  return digits ? Number(digits) : null;
}

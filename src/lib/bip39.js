/**
 * BIP-39, "Mnemonic code for generating deterministic keys"
 * (https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).
 *
 * Generation: ENT bits of entropy (ENT ∈ {128, 160, 192, 224, 256}) are
 * followed by CS = ENT / 32 checksum bits, the first bits of SHA-256(entropy);
 * the ENT + CS bits are cut into groups of 11, and each group indexes a word
 * of the 2048-word list. 12 to 24 words result.
 *
 * Seed: the mnemonic sentence (UTF-8, NFKD) is the password and the string
 * "mnemonic" + passphrase (UTF-8, NFKD) the salt of PBKDF2-HMAC-SHA-512 with
 * 2048 iterations; the 64-byte output is the seed handed to BIP-32. Any
 * passphrase yields a seed: the checksum protects the words, not the
 * passphrase.
 */

import { BIP39_ENGLISH } from '../data/bip39-english.js';
import { sha256 } from './sha256.js';
import { pbkdf2HmacSha512 } from './sha512.js';
import { utf8Bytes } from './bytes.js';

const WORD_INDEX = new Map(BIP39_ENGLISH.map((w, i) => [w, i]));

/** Allowed entropy sizes in bits. */
export const ENTROPY_BITS = Object.freeze([128, 160, 192, 224, 256]);

/** PBKDF2 iteration count fixed by BIP-39. */
export const PBKDF2_ITERATIONS = 2048;

/** An error with a machine-readable `code` (and, for unknown words, `word` and `position`). */
export class Bip39Error extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'Bip39Error';
    this.code = code;
    Object.assign(this, details);
  }
}

/** The bits of a byte string as a '0'/'1' string, most significant bit of each byte first. */
function bitString(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(2).padStart(8, '0');
  return s;
}

/** The first CS = ENT / 32 bits of SHA-256(entropy). */
function checksumBits(entropy) {
  return bitString(sha256(entropy)).slice(0, (entropy.length * 8) / 32);
}

/** Unicode NFKD, surrounding white space removed, words separated by single spaces. */
export function normalizeMnemonic(mnemonic) {
  return mnemonic.normalize('NFKD').trim().split(/\s+/).filter(Boolean).join(' ');
}

/**
 * The mnemonic sentence encoding the given entropy.
 * @param {Uint8Array} entropy 16, 20, 24, 28 or 32 bytes
 * @returns {string} words separated by single spaces
 */
export function entropyToMnemonic(entropy) {
  if (!ENTROPY_BITS.includes(entropy.length * 8)) {
    throw new Bip39Error('INVALID_ENTROPY_LENGTH', `entropy must be ${ENTROPY_BITS.join(', ')} bits, not ${entropy.length * 8}`);
  }
  const bits = bitString(entropy) + checksumBits(entropy);
  const words = [];
  for (let i = 0; i < bits.length; i += 11) words.push(BIP39_ENGLISH[parseInt(bits.slice(i, i + 11), 2)]);
  return words.join(' ');
}

/**
 * Splits a mnemonic into words and indices; throws on a bad length or an unknown word.
 * @returns {{ words: string[], indices: number[] }}
 */
function parseWords(mnemonic) {
  const normalized = normalizeMnemonic(mnemonic);
  const words = normalized === '' ? [] : normalized.split(' ');
  if (words.length < 12 || words.length > 24 || words.length % 3 !== 0) {
    throw new Bip39Error('INVALID_WORD_COUNT', `a mnemonic has 12, 15, 18, 21 or 24 words, not ${words.length}`);
  }
  const indices = words.map((word, position) => {
    const index = WORD_INDEX.get(word);
    if (index === undefined) {
      throw new Bip39Error('UNKNOWN_WORD', `"${word}" (word ${position + 1}) is not in the BIP-39 English list`, { word, position });
    }
    return index;
  });
  return { words, indices };
}

/**
 * Teaching breakdown of a mnemonic: its 11-bit word indices, the entropy bits,
 * the checksum bits it carries and the ones SHA-256 prescribes. A failed
 * checksum is reported (checksumValid = false), not thrown; a bad length or
 * an unknown word throws a Bip39Error.
 * @param {string} mnemonic
 */
export function mnemonicBreakdown(mnemonic) {
  const { words, indices } = parseWords(mnemonic);
  const indexBits = indices.map((k) => k.toString(2).padStart(11, '0'));
  const bits = indexBits.join('');
  const checksumBitLength = bits.length / 33; // ENT + CS = 33 · CS
  const entropyBitLength = bits.length - checksumBitLength;
  const entropyBits = bits.slice(0, entropyBitLength);
  const entropy = new Uint8Array(entropyBitLength / 8);
  for (let i = 0; i < entropy.length; i += 1) entropy[i] = parseInt(entropyBits.slice(8 * i, 8 * i + 8), 2);
  const carried = bits.slice(entropyBitLength);
  const expected = checksumBits(entropy);
  return {
    words,
    indices,
    indexBits,
    entropy,
    entropyBits,
    entropyBitLength,
    checksumBits: carried,
    expectedChecksumBits: expected,
    checksumBitLength,
    checksumValid: carried === expected,
  };
}

/**
 * The entropy encoded by a valid mnemonic.
 * @param {string} mnemonic
 * @returns {Uint8Array}
 * @throws {Bip39Error} code INVALID_WORD_COUNT, UNKNOWN_WORD or INVALID_CHECKSUM
 */
export function mnemonicToEntropy(mnemonic) {
  const b = mnemonicBreakdown(mnemonic);
  if (!b.checksumValid) {
    throw new Bip39Error('INVALID_CHECKSUM', `checksum bits ${b.checksumBits} differ from the expected ${b.expectedChecksumBits}`);
  }
  return b.entropy;
}

/** True when the mnemonic has a valid length, known words and a matching checksum. */
export function validateMnemonic(mnemonic) {
  try {
    mnemonicToEntropy(mnemonic);
    return true;
  } catch (error) {
    if (error instanceof Bip39Error) return false;
    throw error;
  }
}

/**
 * The 64-byte BIP-39 seed: PBKDF2-HMAC-SHA-512(password = NFKD(mnemonic),
 * salt = "mnemonic" + NFKD(passphrase), 2048 iterations, 64 bytes).
 * The mnemonic is used exactly as given (after NFKD); it is not validated,
 * as the standard prescribes.
 * @param {string} mnemonic
 * @param {string} [passphrase='']
 * @returns {Uint8Array}
 */
export function mnemonicToSeed(mnemonic, passphrase = '') {
  const password = utf8Bytes(mnemonic.normalize('NFKD'));
  const salt = utf8Bytes(`mnemonic${passphrase}`.normalize('NFKD'));
  return pbkdf2HmacSha512(password, salt, PBKDF2_ITERATIONS, 64);
}

/**
 * Base58 and Base58Check, the text encodings of Bitcoin, used by BIP-32 for
 * extended keys (xprv…, xpub…).
 *
 * Base58 writes a byte string as a big-endian number in base 58 over an
 * alphabet without the look-alike characters 0, O, I and l; every leading
 * zero byte becomes a leading '1'. Base58Check appends a 4-byte checksum, the
 * first bytes of SHA-256(SHA-256(payload)), so that a mistyped string is
 * rejected instead of decoding to a different key. It is an encoding with
 * error detection, not a cryptographic protection.
 */

import { concatBytes, bytesEqual } from './bytes.js';
import { sha256 } from './sha256.js';

/** The Bitcoin Base58 alphabet. */
export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const DIGIT = new Map([...BASE58_ALPHABET].map((c, i) => [c, i]));

/**
 * Base58 encoding of a byte string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base58Encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  // Repeated division by 58 of the big-endian number, digit array in base 58 (least significant first).
  const digits = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let k = 0; k < digits.length; k += 1) {
      carry += digits[k] * 256;
      digits[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '1'.repeat(zeros);
  for (let k = digits.length - 1; k >= 0; k -= 1) out += BASE58_ALPHABET[digits[k]];
  return out;
}

/**
 * Decodes a Base58 string.
 * @param {string} text
 * @returns {Uint8Array}
 * @throws on a character outside the alphabet
 */
export function base58Decode(text) {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros += 1;
  const bytes = []; // base 256, least significant first
  for (let i = zeros; i < text.length; i += 1) {
    const value = DIGIT.get(text[i]);
    if (value === undefined) throw new Error(`invalid Base58 character ${JSON.stringify(text[i])} at position ${i}`);
    let carry = value;
    for (let k = 0; k < bytes.length; k += 1) {
      carry += bytes[k] * 58;
      bytes[k] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let k = 0; k < bytes.length; k += 1) out[out.length - 1 - k] = bytes[k];
  return out;
}

/** The 4-byte Base58Check checksum: SHA-256(SHA-256(payload))[0..4]. */
export function base58Checksum(payload) {
  return sha256(sha256(payload)).subarray(0, 4);
}

/** Base58Check encoding: Base58(payload ‖ checksum). */
export function base58CheckEncode(payload) {
  return base58Encode(concatBytes(payload, base58Checksum(payload)));
}

/**
 * Decodes Base58Check text and verifies its checksum.
 * @param {string} text
 * @returns {Uint8Array} the payload, without the checksum
 * @throws when the string is too short or the checksum does not match
 */
export function base58CheckDecode(text) {
  const raw = base58Decode(text);
  if (raw.length < 4) throw new Error('Base58Check string is too short to hold a checksum');
  const payload = raw.subarray(0, raw.length - 4);
  if (!bytesEqual(raw.subarray(raw.length - 4), base58Checksum(payload))) {
    throw new Error('Base58Check checksum mismatch');
  }
  return Uint8Array.from(payload);
}

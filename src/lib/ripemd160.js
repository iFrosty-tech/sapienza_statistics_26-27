/**
 * RIPEMD-160, written from its description: H. Dobbertin, A. Bosselaers and
 * B. Preneel, "RIPEMD-160: A strengthened version of RIPEMD", Fast Software
 * Encryption, LNCS 1039, Springer, 1996, pp. 71–82.
 *
 * Its only role on this site is inside BIP-32: the fingerprint of an extended
 * key is the first 4 bytes of HASH160(K) = RIPEMD-160(SHA-256(K)), where K is
 * the compressed public key. Two parallel lines of 80 steps each process every
 * 64-byte block; words and the length are little-endian, as in MD4 and MD5.
 */

import { bytesToHex } from './bytes.js';

/* Message word selected at step j, left line (r) and right line (r'). */
const R_LEFT = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
];
const R_RIGHT = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
];

/* Left-rotation amounts at step j, left line (s) and right line (s'). */
const S_LEFT = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
];
const S_RIGHT = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
];

/* Additive constants per round of 16 steps: integer parts of 2^30·√2, √3, √5, √7
 * (left) and 2^30·∛2, ∛3, ∛5, ∛7 (right). */
const K_LEFT = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const K_RIGHT = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

const H0 = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

const rol = (x, n) => (x << n) | (x >>> (32 - n));

/** The five boolean functions, selected by round number 0..4. */
function f(round, x, y, z) {
  switch (round) {
    case 0: return x ^ y ^ z;
    case 1: return (x & y) | (~x & z);
    case 2: return (x | ~y) ^ z;
    case 3: return (x & z) | (y & ~z);
    default: return x ^ (y | ~z);
  }
}

/** Compresses one 64-byte block (16 little-endian words X) into the state h. */
function compress(h, X) {
  let al = h[0], bl = h[1], cl = h[2], dl = h[3], el = h[4];
  let ar = h[0], br = h[1], cr = h[2], dr = h[3], er = h[4];
  for (let j = 0; j < 80; j += 1) {
    const round = j >> 4;
    // Left line uses f in the order 0, 1, 2, 3, 4; the right line in reverse.
    let t = (rol((al + f(round, bl, cl, dl) + X[R_LEFT[j]] + K_LEFT[round]) | 0, S_LEFT[j]) + el) | 0;
    al = el; el = dl; dl = rol(cl, 10); cl = bl; bl = t;
    t = (rol((ar + f(4 - round, br, cr, dr) + X[R_RIGHT[j]] + K_RIGHT[round]) | 0, S_RIGHT[j]) + er) | 0;
    ar = er; er = dr; dr = rol(cr, 10); cr = br; br = t;
  }
  const t = (h[1] + cl + dr) | 0;
  h[1] = (h[2] + dl + er) | 0;
  h[2] = (h[3] + el + ar) | 0;
  h[3] = (h[4] + al + br) | 0;
  h[4] = (h[0] + bl + cr) | 0;
  h[0] = t;
}

/**
 * RIPEMD-160 digest of a byte string.
 * @param {Uint8Array} message
 * @returns {Uint8Array} 20-byte digest
 */
export function ripemd160(message) {
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = message.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  const h = Int32Array.from(H0);
  const X = new Int32Array(16);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) X[i] = view.getInt32(offset + 4 * i, true);
    compress(h, X);
  }
  const digest = new Uint8Array(20);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 5; i += 1) out.setInt32(4 * i, h[i], true);
  return digest;
}

/** RIPEMD-160 digest as lower-case hexadecimal. */
export function ripemd160Hex(message) {
  return bytesToHex(ripemd160(message));
}

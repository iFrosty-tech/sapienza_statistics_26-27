/**
 * SHA-256 written from the specification (NIST FIPS PUB 180-4, section 6.2),
 * synchronous and dependency-free, so that the same code hashes at build time
 * in Node and interactively in the browser.
 *
 * It exists here as the reference point of the homework: a standard hash
 * function whose output distribution the toy elliptic-curve hash is compared
 * against. Nothing on the site relies on it for security.
 */

import { bytesToHex } from './bytes.js';

/* First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/* First 32 bits of the fractional parts of the square roots of the first 8 primes. */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/**
 * Processes one 64-byte block (16 big-endian words) into the running state.
 * @param {Uint32Array} state eight working words, updated in place
 * @param {Uint32Array} w message schedule buffer of 64 words
 * @param {DataView} view view over the message
 * @param {number} offset byte offset of the block
 */
function compress(state, w, view, offset) {
  for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + 4 * t);
  for (let t = 16; t < 64; t += 1) {
    const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
    const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
    w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
  }

  let [a, b, c, d, e, f, g, h] = state;
  for (let t = 0; t < 64; t += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }
  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

/**
 * SHA-256 digest of a byte string.
 * @param {Uint8Array} message
 * @returns {Uint8Array} 32-byte digest
 */
export function sha256(message) {
  const bitLength = BigInt(message.length) * 8n;
  // Padding: 0x80, then zeros up to 56 (mod 64) bytes, then the 64-bit length.
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Number(bitLength >> 32n));
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn));

  const state = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) compress(state, w, view, offset);

  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) out.setUint32(4 * i, state[i]);
  return digest;
}

/** SHA-256 digest as lower-case hexadecimal. */
export function sha256Hex(message) {
  return bytesToHex(sha256(message));
}

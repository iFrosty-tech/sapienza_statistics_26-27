/**
 * SHA-512 (NIST FIPS PUB 180-4, section 6.4), HMAC-SHA-512 (RFC 2104) and
 * PBKDF2-HMAC-SHA-512 (RFC 8018, section 5.2), written from the
 * specifications, synchronous and dependency-free.
 *
 * In the wallet pipeline, PBKDF2-HMAC-SHA-512 stretches a BIP-39 mnemonic into
 * the 512-bit seed, and HMAC-SHA-512 is the pseudo-random function of every
 * BIP-32 derivation step.
 *
 * Representation: JavaScript has no native 64-bit unsigned arithmetic, and
 * BigInt is slow, so every 64-bit word is held as two unsigned 32-bit halves
 * (high, low). Additions propagate the carry from the low half; rotations
 * and shifts recombine the halves. Arrays named *Hi / *Lo hold the halves.
 *
 * Teaching code: no constant-time guarantees. It must not handle real keys.
 */

import { bytesToHex, utf8Bytes } from './bytes.js';

const TWO_32 = 0x100000000;

/* ------------------------------------------------------------------------ */
/* Constants (FIPS 180-4, sections 4.2.3 and 5.3.5)                          */
/* ------------------------------------------------------------------------ */

/** The first `count` primes. */
function firstPrimes(count) {
  const primes = [];
  for (let n = 2; primes.length < count; n += 1) {
    if (primes.every((p) => n % p !== 0)) primes.push(n);
  }
  return primes;
}

/** floor(a^(1/k)) for a non-negative BigInt, by Newton's method. */
function integerRoot(a, k) {
  if (a < 2n) return a;
  const kb = BigInt(k);
  let x = 1n << BigInt(Math.ceil(a.toString(2).length / k) + 1);
  for (;;) {
    const y = ((kb - 1n) * x + a / x ** (kb - 1n)) / kb;
    if (y >= x) return x;
    x = y;
  }
}

/* The constants are the first 64 bits of the fractional parts of square roots
 * (initial hash value) and cube roots (round constants) of the first primes:
 * frac(p^(1/k))·2^64 = floor((p·2^(64k))^(1/k)) mod 2^64. */
const MASK_64 = (1n << 64n) - 1n;
const PRIMES = firstPrimes(80);

/** The 80 round constants K_t, as BigInt (FIPS 180-4, section 4.2.3). */
export const SHA512_K = Object.freeze(PRIMES.map((p) => integerRoot(BigInt(p) << 192n, 3) & MASK_64));

/** The initial hash value H(0), as BigInt (FIPS 180-4, section 5.3.5). */
export const SHA512_H0 = Object.freeze(PRIMES.slice(0, 8).map((p) => integerRoot(BigInt(p) << 128n, 2) & MASK_64));

const splitHi = (words) => Uint32Array.from(words, (w) => Number(w >> 32n));
const splitLo = (words) => Uint32Array.from(words, (w) => Number(w & 0xffffffffn));
const K_HI = splitHi(SHA512_K);
const K_LO = splitLo(SHA512_K);
const H0_HI = splitHi(SHA512_H0);
const H0_LO = splitLo(SHA512_H0);

/* ------------------------------------------------------------------------ */
/* Compression function                                                      */
/* ------------------------------------------------------------------------ */

/**
 * One application of the SHA-512 compression function.
 * @param {Uint32Array} hHi high halves of the eight state words (updated in place)
 * @param {Uint32Array} hLo low halves of the eight state words (updated in place)
 * @param {Uint32Array} wHi message schedule, 80 high halves; entries 0..15 hold the block
 * @param {Uint32Array} wLo message schedule, 80 low halves; entries 0..15 hold the block
 */
function compress(hHi, hLo, wHi, wLo) {
  for (let t = 16; t < 80; t += 1) {
    // σ0(x) = ROTR^1(x) ⊕ ROTR^8(x) ⊕ SHR^7(x)
    let xh = wHi[t - 15];
    let xl = wLo[t - 15];
    const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
    const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
    // σ1(x) = ROTR^19(x) ⊕ ROTR^61(x) ⊕ SHR^6(x)
    xh = wHi[t - 2];
    xl = wLo[t - 2];
    const s1h = ((xh >>> 19) | (xl << 13)) ^ ((xl >>> 29) | (xh << 3)) ^ (xh >>> 6);
    const s1l = ((xl >>> 19) | (xh << 13)) ^ ((xh >>> 29) | (xl << 3)) ^ ((xl >>> 6) | (xh << 26));
    // W_t = σ1(W_{t−2}) + W_{t−7} + σ0(W_{t−15}) + W_{t−16}
    const lo = (s1l >>> 0) + wLo[t - 7] + (s0l >>> 0) + wLo[t - 16];
    wHi[t] = (s1h >>> 0) + wHi[t - 7] + (s0h >>> 0) + wHi[t - 16] + Math.floor(lo / TWO_32);
    wLo[t] = lo;
  }

  let ah = hHi[0], al = hLo[0], bh = hHi[1], bl = hLo[1], ch = hHi[2], cl = hLo[2], dh = hHi[3], dl = hLo[3];
  let eh = hHi[4], el = hLo[4], fh = hHi[5], fl = hLo[5], gh = hHi[6], gl = hLo[6], hh = hHi[7], hl = hLo[7];

  for (let t = 0; t < 80; t += 1) {
    // Σ1(e) = ROTR^14(e) ⊕ ROTR^18(e) ⊕ ROTR^41(e)
    const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
    const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
    // Ch(e, f, g) = (e ∧ f) ⊕ (¬e ∧ g)
    const chh = (eh & fh) ^ (~eh & gh);
    const chl = (el & fl) ^ (~el & gl);
    // T1 = h + Σ1(e) + Ch(e, f, g) + K_t + W_t
    const t1l = hl + (S1l >>> 0) + (chl >>> 0) + K_LO[t] + wLo[t];
    const t1h = hh + (S1h >>> 0) + (chh >>> 0) + K_HI[t] + wHi[t] + Math.floor(t1l / TWO_32);
    // Σ0(a) = ROTR^28(a) ⊕ ROTR^34(a) ⊕ ROTR^39(a)
    const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
    const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
    // Maj(a, b, c) = (a ∧ b) ⊕ (a ∧ c) ⊕ (b ∧ c)
    const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch);
    const majl = (al & bl) ^ (al & cl) ^ (bl & cl);
    // T2 = Σ0(a) + Maj(a, b, c)
    const t2l = (S0l >>> 0) + (majl >>> 0);
    const t2h = (S0h >>> 0) + (majh >>> 0) + Math.floor(t2l / TWO_32);

    hh = gh; hl = gl;
    gh = fh; gl = fl;
    fh = eh; fl = el;
    const el2 = dl + (t1l >>> 0);
    eh = (dh + t1h + Math.floor(el2 / TWO_32)) >>> 0;
    el = el2 >>> 0;
    dh = ch; dl = cl;
    ch = bh; cl = bl;
    bh = ah; bl = al;
    const al2 = (t1l >>> 0) + (t2l >>> 0);
    ah = (t1h + t2h + Math.floor(al2 / TWO_32)) >>> 0;
    al = al2 >>> 0;
  }

  const finals = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
  for (let i = 0; i < 8; i += 1) {
    const lo = hLo[i] + finals[2 * i + 1];
    hHi[i] = hHi[i] + finals[2 * i] + Math.floor(lo / TWO_32);
    hLo[i] = lo;
  }
}

/* ------------------------------------------------------------------------ */
/* Hashing                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Hashes `message` into the running state, as if `prefixLength` bytes (a
 * multiple of 128) had already been compressed into it, and applies the
 * final padding: 0x80, zeros up to 112 (mod 128) bytes, then the 128-bit
 * big-endian bit length of the whole input.
 */
function absorbAndPad(hHi, hLo, message, prefixLength) {
  const paddedLength = Math.ceil((message.length + 17) / 128) * 128;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = (prefixLength + message.length) * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / TWO_32));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const wHi = new Uint32Array(80);
  const wLo = new Uint32Array(80);
  for (let offset = 0; offset < paddedLength; offset += 128) {
    for (let t = 0; t < 16; t += 1) {
      wHi[t] = view.getUint32(offset + 8 * t);
      wLo[t] = view.getUint32(offset + 8 * t + 4);
    }
    compress(hHi, hLo, wHi, wLo);
  }
}

/** Big-endian serialisation of the eight state words. */
function stateToBytes(hHi, hLo) {
  const out = new Uint8Array(64);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) {
    view.setUint32(8 * i, hHi[i]);
    view.setUint32(8 * i + 4, hLo[i]);
  }
  return out;
}

const asBytes = (value) => (typeof value === 'string' ? utf8Bytes(value) : value);

/**
 * SHA-512 digest of a byte string.
 * @param {Uint8Array} message
 * @returns {Uint8Array} 64-byte digest
 */
export function sha512(message) {
  const hHi = Uint32Array.from(H0_HI);
  const hLo = Uint32Array.from(H0_LO);
  absorbAndPad(hHi, hLo, message, 0);
  return stateToBytes(hHi, hLo);
}

/** SHA-512 digest as lower-case hexadecimal. */
export function sha512Hex(message) {
  return bytesToHex(sha512(message));
}

/* ------------------------------------------------------------------------ */
/* HMAC (RFC 2104)                                                           */
/* ------------------------------------------------------------------------ */

const BLOCK = 128;

/**
 * The two HMAC midstates: the SHA-512 state after compressing the single
 * block K ⊕ ipad (inner) or K ⊕ opad (outer). A key longer than the block
 * is first replaced by its digest; a shorter one is padded with zeros.
 */
function hmacMidstates(key) {
  const k = new Uint8Array(BLOCK);
  k.set(key.length > BLOCK ? sha512(key) : key);
  const inner = { hi: Uint32Array.from(H0_HI), lo: Uint32Array.from(H0_LO) };
  const outer = { hi: Uint32Array.from(H0_HI), lo: Uint32Array.from(H0_LO) };
  const wHi = new Uint32Array(80);
  const wLo = new Uint32Array(80);
  const view = new DataView(k.buffer);
  for (const [state, pad] of [[inner, 0x36363636], [outer, 0x5c5c5c5c]]) {
    for (let t = 0; t < 16; t += 1) {
      wHi[t] = view.getUint32(8 * t) ^ pad;
      wLo[t] = view.getUint32(8 * t + 4) ^ pad;
    }
    compress(state.hi, state.lo, wHi, wLo);
  }
  return { inner, outer };
}

/** HMAC from precomputed midstates: H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ data)). */
function hmacFromMidstates({ inner, outer }, data) {
  const iHi = Uint32Array.from(inner.hi);
  const iLo = Uint32Array.from(inner.lo);
  absorbAndPad(iHi, iLo, data, BLOCK);
  const oHi = Uint32Array.from(outer.hi);
  const oLo = Uint32Array.from(outer.lo);
  absorbAndPad(oHi, oLo, stateToBytes(iHi, iLo), BLOCK);
  return stateToBytes(oHi, oLo);
}

/**
 * HMAC-SHA-512 (RFC 2104 with H = SHA-512, block size 128 bytes).
 * @param {Uint8Array | string} key strings are encoded as UTF-8
 * @param {Uint8Array | string} data
 * @returns {Uint8Array} 64-byte tag
 */
export function hmacSha512(key, data) {
  return hmacFromMidstates(hmacMidstates(asBytes(key)), asBytes(data));
}

/* ------------------------------------------------------------------------ */
/* PBKDF2 (RFC 8018, section 5.2)                                            */
/* ------------------------------------------------------------------------ */

/**
 * PBKDF2 with HMAC-SHA-512 as the pseudo-random function:
 *   T_i = U_1 ⊕ U_2 ⊕ … ⊕ U_c,  U_1 = PRF(P, S ‖ INT(i)),  U_j = PRF(P, U_{j−1}),
 *   DK = the first dkLen bytes of T_1 ‖ T_2 ‖ …
 *
 * The HMAC midstates of the password are computed once. Every U_j with j ≥ 2
 * is a 64-byte message, so the inner and the outer hash each fit in a single
 * pre-padded block: one iteration costs exactly two compressions.
 *
 * @param {Uint8Array | string} password
 * @param {Uint8Array | string} salt
 * @param {number} iterations c ≥ 1
 * @param {number} dkLen derived key length in bytes, ≥ 1
 * @returns {Uint8Array}
 */
export function pbkdf2HmacSha512(password, salt, iterations, dkLen) {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('PBKDF2 needs a positive integer number of iterations');
  if (!Number.isInteger(dkLen) || dkLen < 1) throw new Error('PBKDF2 needs a positive derived key length');
  const midstates = hmacMidstates(asBytes(password));
  const saltBytes = asBytes(salt);
  const { inner, outer } = midstates;

  // Message schedule shared by the two single-block hashes. Words 8..15 hold
  // the fixed padding of a 64-byte message that follows one 128-byte key
  // block: 0x80, zeros, and the bit length (128 + 64)·8 = 1536. They are set
  // once, because compress only writes words 16..79.
  const wHi = new Uint32Array(80);
  const wLo = new Uint32Array(80);
  const hHi = new Uint32Array(8);
  const hLo = new Uint32Array(8);
  const uHi = new Uint32Array(8);
  const uLo = new Uint32Array(8);
  const tHi = new Uint32Array(8);
  const tLo = new Uint32Array(8);
  wHi[8] = 0x80000000;
  wLo[8] = 0;
  for (let t = 9; t < 15; t += 1) wHi[t] = wLo[t] = 0;
  wHi[15] = 0;
  wLo[15] = (BLOCK + 64) * 8;

  const blocks = Math.ceil(dkLen / 64);
  const out = new Uint8Array(blocks * 64);
  const block = new Uint8Array(saltBytes.length + 4);
  block.set(saltBytes);
  for (let i = 1; i <= blocks; i += 1) {
    new DataView(block.buffer).setUint32(saltBytes.length, i);
    const u1 = hmacFromMidstates(midstates, block);
    const view = new DataView(u1.buffer);
    for (let k = 0; k < 8; k += 1) {
      uHi[k] = tHi[k] = view.getUint32(8 * k);
      uLo[k] = tLo[k] = view.getUint32(8 * k + 4);
    }
    for (let j = 2; j <= iterations; j += 1) {
      // Inner hash of U_{j−1}.
      wHi.set(uHi, 0);
      wLo.set(uLo, 0);
      hHi.set(inner.hi);
      hLo.set(inner.lo);
      compress(hHi, hLo, wHi, wLo);
      // Outer hash of the inner digest gives U_j.
      wHi.set(hHi, 0);
      wLo.set(hLo, 0);
      uHi.set(outer.hi);
      uLo.set(outer.lo);
      compress(uHi, uLo, wHi, wLo);
      for (let k = 0; k < 8; k += 1) {
        tHi[k] ^= uHi[k];
        tLo[k] ^= uLo[k];
      }
    }
    out.set(stateToBytes(tHi, tLo), (i - 1) * 64);
  }
  return out.slice(0, dkLen);
}

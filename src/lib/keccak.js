/**
 * The Keccak-f[1600] permutation, the Keccak sponge, Keccak-256 and SHA3-256,
 * written from NIST FIPS PUB 202, "SHA-3 Standard: Permutation-Based Hash and
 * Extendable-Output Functions" (2015), and the Keccak reference (Bertoni,
 * Daemen, Peeters, Van Assche, "The Keccak reference", version 3.0, 2011).
 *
 * State layout
 *   The 1600-bit state is a 5 × 5 array of 64-bit lanes. Lane (x, y), with
 *   x, y ∈ {0, …, 4}, has index x + 5y. Bit z ∈ {0, …, 63} of a lane is its
 *   bit of weight 2^z. As a byte string (FIPS 202, section 3.1.2 and
 *   Appendix B.1) lane (x, y) occupies bytes 8(x + 5y) … 8(x + 5y) + 7 in
 *   little-endian order, so state bit 64(x + 5y) + z is bit (z mod 8), from
 *   the least significant, of byte 8(x + 5y) + ⌊z / 8⌋.
 *
 *   In memory the state is a Uint32Array of 50 entries: entry 2(x + 5y) is
 *   the low half (bits 0 … 31) of lane (x, y) and entry 2(x + 5y) + 1 its high
 *   half (bits 32 … 63).
 *
 * Steps and rounds
 *   One round is Rnd = ι ∘ χ ∘ π ∘ ρ ∘ θ; Keccak-f[1600] applies rounds
 *   0 … 23. The step functions are exported individually so that a figure can
 *   show the state after each of them.
 *
 * Sponge, Keccak-256 and SHA3-256
 *   Both hashes are the sponge on Keccak-f[1600] with rate 1088 bits
 *   (136 bytes) and capacity 512 bits. They differ only in the bits appended
 *   to the message before the pad10*1 rule: none for the original Keccak
 *   (used by Ethereum, "Keccak-256"), and the domain-separation bits 01 for
 *   SHA3-256. In bytes, the first padding byte is 0x01 for Keccak and 0x06 for
 *   SHA-3, and the last byte of the block receives 0x80.
 *
 * Teaching code: no side-channel protection.
 */

import { bytesToHex } from './bytes.js';

/** The five step mappings of a round, in the order they are applied. */
export const KECCAK_STEPS = Object.freeze(['theta', 'rho', 'pi', 'chi', 'iota']);

/** Number of rounds of Keccak-f[1600] (12 + 2ℓ with ℓ = 6). */
export const KECCAK_ROUNDS = 24;

/* ------------------------------------------------------------------------ */
/* Constants, generated from their definitions                              */
/* ------------------------------------------------------------------------ */

/**
 * rc(t) of FIPS 202, Algorithm 5: output bit of the LFSR with polynomial
 * x^8 + x^6 + x^5 + x^4 + 1, after t steps from the state 1.
 */
function rcBit(t) {
  if (t % 255 === 0) return 1;
  let r = 0x01; // bit k of r is R[k]
  for (let i = 1; i <= t % 255; i += 1) {
    r <<= 1; // R = 0 ‖ R
    if (r & 0x100) r ^= 0x171; // R[0], R[4], R[5], R[6] ^= R[8]; then truncate to 8 bits
  }
  return r & 1;
}

/** The 24 round constants RC[i_r] as BigInt (FIPS 202, Algorithm 6). */
export const ROUND_CONSTANTS = Object.freeze(
  Array.from({ length: KECCAK_ROUNDS }, (_, ir) => {
    let rc = 0n;
    for (let j = 0; j <= 6; j += 1) if (rcBit(j + 7 * ir)) rc |= 1n << BigInt(2 ** j - 1);
    return rc;
  }),
);

/** Rotation offsets of ρ, indexed by x + 5y (FIPS 202, Algorithm 2). */
export const RHO_OFFSETS = Object.freeze(
  (() => {
    const offsets = new Array(25).fill(0);
    let x = 1;
    let y = 0;
    for (let t = 0; t < 24; t += 1) {
      offsets[x + 5 * y] = (((t + 1) * (t + 2)) / 2) % 64;
      [x, y] = [y, (2 * x + 3 * y) % 5];
    }
    return offsets;
  })(),
);

const RC_LO = Uint32Array.from(ROUND_CONSTANTS, (c) => Number(c & 0xffffffffn));
const RC_HI = Uint32Array.from(ROUND_CONSTANTS, (c) => Number(c >> 32n));

/* ------------------------------------------------------------------------ */
/* State helpers                                                             */
/* ------------------------------------------------------------------------ */

/** A new all-zero state. */
export function createState() {
  return new Uint32Array(50);
}

/** Lane (x, y) as a 64-bit BigInt. */
export function getLane(state, x, y) {
  const i = 2 * (x + 5 * y);
  return (BigInt(state[i + 1]) << 32n) | BigInt(state[i]);
}

/** Sets lane (x, y) from a BigInt in [0, 2^64). */
export function setLane(state, x, y, value) {
  const i = 2 * (x + 5 * y);
  state[i] = Number(value & 0xffffffffn);
  state[i + 1] = Number((value >> 32n) & 0xffffffffn);
}

/** The state as the 200-byte string of FIPS 202 (lanes little-endian). */
export function stateToBytes(state) {
  const out = new Uint8Array(200);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 50; i += 1) view.setUint32(4 * i, state[i], true);
  return out;
}

/** The state encoded by a 200-byte string. */
export function bytesToState(bytes) {
  if (bytes.length !== 200) throw new Error('a Keccak-f[1600] state has 200 bytes');
  const state = createState();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 50; i += 1) state[i] = view.getUint32(4 * i, true);
  return state;
}

/** The 1600 state bits (0/1), bit 64(x + 5y) + z being bit z of lane (x, y). */
export function stateToBits(state) {
  const bits = new Uint8Array(1600);
  for (let i = 0; i < 50; i += 1) {
    const word = state[i];
    for (let b = 0; b < 32; b += 1) bits[32 * i + b] = (word >>> b) & 1;
  }
  return bits;
}

/** The state whose bits (ordered as in stateToBits) are given. */
export function bitsToState(bits) {
  if (bits.length !== 1600) throw new Error('a Keccak-f[1600] state has 1600 bits');
  const state = createState();
  for (let i = 0; i < 50; i += 1) {
    let word = 0;
    for (let b = 0; b < 32; b += 1) word |= (bits[32 * i + b] & 1) << b;
    state[i] = word;
  }
  return state;
}

/* ------------------------------------------------------------------------ */
/* Step mappings (FIPS 202, section 3.2), in place                           */
/* ------------------------------------------------------------------------ */

const C = new Uint32Array(10);
const D = new Uint32Array(10);
const B = new Uint32Array(50);

/** θ: every bit is XORed with the parities of two neighbouring columns. */
function theta(A) {
  for (let x = 0; x < 5; x += 1) {
    C[2 * x] = A[2 * x] ^ A[2 * x + 10] ^ A[2 * x + 20] ^ A[2 * x + 30] ^ A[2 * x + 40];
    C[2 * x + 1] = A[2 * x + 1] ^ A[2 * x + 11] ^ A[2 * x + 21] ^ A[2 * x + 31] ^ A[2 * x + 41];
  }
  for (let x = 0; x < 5; x += 1) {
    const prev = 2 * ((x + 4) % 5);
    const next = 2 * ((x + 1) % 5);
    // D[x] = C[x − 1] ⊕ ROT(C[x + 1], 1)
    const lo = C[next];
    const hi = C[next + 1];
    D[2 * x] = C[prev] ^ ((lo << 1) | (hi >>> 31));
    D[2 * x + 1] = C[prev + 1] ^ ((hi << 1) | (lo >>> 31));
  }
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const i = 2 * (x + 5 * y);
      A[i] ^= D[2 * x];
      A[i + 1] ^= D[2 * x + 1];
    }
  }
}

/** ρ: lane (x, y) is rotated by RHO_OFFSETS[x + 5y] towards higher z. */
function rho(A) {
  for (let lane = 1; lane < 25; lane += 1) {
    const n = RHO_OFFSETS[lane];
    const lo = A[2 * lane];
    const hi = A[2 * lane + 1];
    if (n === 0) continue;
    if (n < 32) {
      A[2 * lane] = (lo << n) | (hi >>> (32 - n));
      A[2 * lane + 1] = (hi << n) | (lo >>> (32 - n));
    } else if (n === 32) {
      A[2 * lane] = hi;
      A[2 * lane + 1] = lo;
    } else {
      const m = n - 32;
      A[2 * lane] = (hi << m) | (lo >>> (32 - m));
      A[2 * lane + 1] = (lo << m) | (hi >>> (32 - m));
    }
  }
}

/** π: A′[x, y] = A[(x + 3y) mod 5, x], a permutation of the lanes. */
function pi(A) {
  B.set(A);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const to = 2 * (x + 5 * y);
      const from = 2 * (((x + 3 * y) % 5) + 5 * x);
      A[to] = B[from];
      A[to + 1] = B[from + 1];
    }
  }
}

/** χ: A′[x, y] = A[x, y] ⊕ (¬A[x + 1, y] ∧ A[x + 2, y]), the only non-linear step. */
function chi(A) {
  for (let y = 0; y < 5; y += 1) {
    const row = 10 * y;
    for (let k = 0; k < 10; k += 1) B[k] = A[row + k];
    for (let x = 0; x < 5; x += 1) {
      const x1 = 2 * ((x + 1) % 5);
      const x2 = 2 * ((x + 2) % 5);
      A[row + 2 * x] = B[2 * x] ^ (~B[x1] & B[x2]);
      A[row + 2 * x + 1] = B[2 * x + 1] ^ (~B[x1 + 1] & B[x2 + 1]);
    }
  }
}

/** ι: the round constant is XORed into lane (0, 0). */
function iota(A, roundIndex) {
  A[0] ^= RC_LO[roundIndex];
  A[1] ^= RC_HI[roundIndex];
}

const STEP_FUNCTIONS = { theta, rho, pi, chi, iota };

function checkRound(roundIndex) {
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= KECCAK_ROUNDS) {
    throw new Error(`round index must be an integer in [0, ${KECCAK_ROUNDS - 1}]`);
  }
}

/**
 * Applies one step mapping to the state, in place.
 * @param {Uint32Array} state 50-entry state (see the layout above)
 * @param {'theta' | 'rho' | 'pi' | 'chi' | 'iota'} stepName
 * @param {number} roundIndex round number 0 … 23 (only ι depends on it)
 * @returns {Uint32Array} the same state
 */
export function keccakStep(state, stepName, roundIndex) {
  if (!Object.hasOwn(STEP_FUNCTIONS, stepName)) throw new Error(`unknown Keccak step ${JSON.stringify(stepName)}`);
  checkRound(roundIndex);
  STEP_FUNCTIONS[stepName](state, roundIndex);
  return state;
}

/** Applies round `roundIndex` (θ, ρ, π, χ, ι) to the state, in place. */
export function keccakRound(state, roundIndex) {
  checkRound(roundIndex);
  theta(state);
  rho(state);
  pi(state);
  chi(state);
  iota(state, roundIndex);
  return state;
}

/** Keccak-f[1600]: the 24 rounds, in place. */
export function keccakF1600(state) {
  for (let r = 0; r < KECCAK_ROUNDS; r += 1) {
    theta(state);
    rho(state);
    pi(state);
    chi(state);
    iota(state, r);
  }
  return state;
}

/* ------------------------------------------------------------------------ */
/* Sponge (FIPS 202, section 4)                                              */
/* ------------------------------------------------------------------------ */

/** XORs byte b into byte position j (0 … 199) of the state. */
function xorByte(state, j, b) {
  state[j >> 2] ^= b << (8 * (j & 3));
}

/**
 * The sponge construction on Keccak-f[1600] for byte-aligned messages.
 * @param {number} rateBytes rate r / 8, in 1 … 199 (the capacity is 1600 − r bits)
 * @param {number} suffix first padding byte: the domain-separation bits followed by
 *   the first 1 of pad10*1 (0x01 Keccak, 0x06 SHA-3, 0x1F SHAKE)
 * @param {Uint8Array} message
 * @param {number} outLen number of output bytes to squeeze
 * @returns {Uint8Array}
 */
export function keccakSponge(rateBytes, suffix, message, outLen) {
  if (!Number.isInteger(rateBytes) || rateBytes < 1 || rateBytes >= 200) throw new Error('rate must be 1 to 199 bytes');
  if (!Number.isInteger(suffix) || suffix < 1 || suffix > 0xff) throw new Error('suffix must be a byte with at least one bit set');
  const state = createState();
  // Absorb every full block.
  let offset = 0;
  for (; offset + rateBytes <= message.length; offset += rateBytes) {
    for (let j = 0; j < rateBytes; j += 1) xorByte(state, j, message[offset + j]);
    keccakF1600(state);
  }
  // Last, partial block with the padding: suffix byte, zeros, final bit 0x80.
  const rest = message.length - offset;
  for (let j = 0; j < rest; j += 1) xorByte(state, j, message[offset + j]);
  xorByte(state, rest, suffix);
  xorByte(state, rateBytes - 1, 0x80);
  keccakF1600(state);
  // Squeeze.
  const out = new Uint8Array(outLen);
  for (let produced = 0; ; ) {
    const take = Math.min(rateBytes, outLen - produced);
    for (let j = 0; j < take; j += 1) out[produced + j] = (state[j >> 2] >>> (8 * (j & 3))) & 0xff;
    produced += take;
    if (produced >= outLen) break;
    keccakF1600(state);
  }
  return out;
}

/**
 * Keccak-256 as used by Ethereum: the original Keccak padding (suffix 0x01),
 * rate 136 bytes, 32-byte output. Not equal to SHA3-256.
 * @param {Uint8Array} message
 * @returns {Uint8Array}
 */
export function keccak256(message) {
  return keccakSponge(136, 0x01, message, 32);
}

/** Keccak-256 digest as lower-case hexadecimal. */
export function keccak256Hex(message) {
  return bytesToHex(keccak256(message));
}

/**
 * SHA3-256 of FIPS 202: domain-separation bits 01 (suffix 0x06), rate 136
 * bytes, 32-byte output.
 * @param {Uint8Array} message
 * @returns {Uint8Array}
 */
export function sha3_256(message) {
  return keccakSponge(136, 0x06, message, 32);
}

/** SHA3-256 digest as lower-case hexadecimal. */
export function sha3_256Hex(message) {
  return bytesToHex(sha3_256(message));
}

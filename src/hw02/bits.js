/**
 * Bit-level helpers shared by the static figures and their interactive
 * versions: bit strings in reading order (most significant bit of each byte
 * first, as the hex value is written), runs of 1-bits for the bit strips,
 * and the differences that the live avalanche readings count.
 */

/** The largest stage of the pipeline (seed and public key x ‖ y), the full width of a bit strip track. */
export const PIPELINE_MAX_BITS = 512;

/** The bits of a byte string as a '0'/'1' string, most significant bit of each byte first. */
export function bitString(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(2).padStart(8, '0');
  return s;
}

/** The bits of a hex string (optionally after "0x"), four per digit. */
export function hexToBitString(hex) {
  const digits = hex.startsWith('0x') ? hex.slice(2) : hex;
  let s = '';
  for (const c of digits) s += parseInt(c, 16).toString(2).padStart(4, '0');
  return s;
}

/**
 * The runs of consecutive 1-bits of a bit string.
 * @param {string} bits
 * @returns {[number, number][]} [start, length] pairs in reading order
 */
export function onesRuns(bits) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= bits.length; i += 1) {
    const one = bits[i] === '1';
    if (one && start < 0) start = i;
    if (!one && start >= 0) {
      runs.push([start, i - start]);
      start = -1;
    }
  }
  return runs;
}

/** The share of the strip track taken by a value of `bits` bits, clamped to [0, 1]. */
export function stripFraction(bits, maxBits = PIPELINE_MAX_BITS) {
  return Math.min(1, Math.max(0, bits / maxBits));
}

function popcount8(x) {
  let v = x;
  let n = 0;
  while (v) {
    n += v & 1;
    v >>= 1;
  }
  return n;
}

/**
 * The number of positions in which two bit strings, or two byte strings, differ.
 * @param {string | Uint8Array} a
 * @param {string | Uint8Array} b
 */
export function bitDistance(a, b) {
  if (a.length !== b.length) throw new Error('bitDistance compares values of the same length');
  let d = 0;
  if (typeof a === 'string') {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
    return d;
  }
  for (let i = 0; i < a.length; i += 1) d += popcount8(a[i] ^ b[i]);
  return d;
}

/**
 * The hex digits that differ between two digests and the number of bits that changed.
 * With no previous value (empty string) nothing is marked and the count is null.
 * @param {string} previous
 * @param {string} next
 * @returns {{ digits: number[], bits: number | null }}
 */
export function digitDiff(previous, next) {
  if (!previous) return { digits: [], bits: null };
  if (previous.length !== next.length) throw new Error('digitDiff compares digests of the same length');
  const digits = [];
  let bits = 0;
  for (let i = 0; i < next.length; i += 1) {
    const x = parseInt(previous[i], 16) ^ parseInt(next[i], 16);
    if (x) {
      digits.push(i);
      bits += popcount8(x);
    }
  }
  return { digits, bits };
}

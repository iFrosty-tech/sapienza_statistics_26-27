/**
 * Byte-string helpers shared by the hash implementations, the experiments and
 * the page. Everything works on Uint8Array and runs unchanged in Node and in
 * the browser.
 *
 * Bit indexing convention (used by the avalanche experiments): bit i of a byte
 * string is bit (i mod 8) of byte floor(i / 8), counted from the least
 * significant bit. Bit 0 is therefore the low bit of the first byte.
 */

const encoder = new TextEncoder();

/** UTF-8 encoding of a string. */
export function utf8Bytes(text) {
  return encoder.encode(text);
}

/** Lower-case hexadecimal representation of a byte string. */
export function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Parses hexadecimal text (even length, optional 0x prefix) into bytes. */
export function hexToBytes(hex) {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string must have even length');
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('hex string contains non-hexadecimal characters');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Concatenation of byte strings. */
export function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Reads a byte string as an unsigned integer.
 * @param {Uint8Array} bytes
 * @param {'be' | 'le'} order big-endian (most significant byte first) or little-endian
 */
export function bytesToBigInt(bytes, order = 'be') {
  let x = 0n;
  if (order === 'be') {
    for (const b of bytes) x = (x << 8n) | BigInt(b);
  } else if (order === 'le') {
    for (let i = bytes.length - 1; i >= 0; i -= 1) x = (x << 8n) | BigInt(bytes[i]);
  } else {
    throw new Error(`unknown byte order ${order}`);
  }
  return x;
}

/**
 * Writes an unsigned integer into exactly `length` bytes.
 * @param {bigint} x non-negative integer
 * @param {number} length
 * @param {'be' | 'le'} order
 */
export function bigIntToBytes(x, length, order = 'be') {
  if (x < 0n) throw new Error('cannot encode a negative integer');
  if (x >> BigInt(8 * length) !== 0n) throw new Error(`${x} does not fit in ${length} bytes`);
  const out = new Uint8Array(length);
  let v = x;
  for (let i = 0; i < length; i += 1) {
    const b = Number(v & 0xffn);
    out[order === 'le' ? i : length - 1 - i] = b;
    v >>= 8n;
  }
  return out;
}

const POPCOUNT = new Uint8Array(256);
for (let i = 1; i < 256; i += 1) POPCOUNT[i] = POPCOUNT[i >> 1] + (i & 1);

/** Number of 1 bits in a byte string. */
export function hammingWeight(bytes) {
  let w = 0;
  for (const b of bytes) w += POPCOUNT[b];
  return w;
}

/** Number of bit positions at which two byte strings of equal length differ. */
export function hammingDistance(a, b) {
  if (a.length !== b.length) throw new Error('hammingDistance needs byte strings of equal length');
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d += POPCOUNT[a[i] ^ b[i]];
  return d;
}

/** Bit i of a byte string (see the indexing convention above). */
export function bitAt(bytes, i) {
  return (bytes[i >> 3] >> (i & 7)) & 1;
}

/** A copy of the byte string with bit i inverted; the input is left untouched. */
export function flipBit(bytes, i) {
  const out = Uint8Array.from(bytes);
  out[i >> 3] ^= 1 << (i & 7);
  return out;
}

/** The bits of a byte string as an array of 0/1 numbers, in index order. */
export function toBits(bytes) {
  const out = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < out.length; i += 1) out[i] = bitAt(bytes, i);
  return out;
}

/** True when two byte strings have the same length and contents. */
export function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

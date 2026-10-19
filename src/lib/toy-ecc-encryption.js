/**
 * A toy hashed EC-ElGamal (ECIES-style) public-key scheme on secp256k1, built
 * on the key generation Q = kG of homework 1. It is modelled on the integrated
 * encryption scheme but is deliberately simplified and is NOT standard ECIES:
 * there is no cofactor handling, no KDF label, no associated data and no MAC
 * key separation beyond a domain tag. It exists to illustrate the roles of the
 * keys, not to be used for anything real.
 *
 * Roles of the keys
 *   - The receiver owns a long-term private key k and publishes Q = kG. Only k
 *     can recover the shared secret, so Q encrypts and k decrypts.
 *   - The sender draws a fresh ephemeral scalar r, sends R = rG in the clear and
 *     computes the shared secret S = rQ = r(kG) = k(rG) = kR, which the receiver
 *     reconstructs as kR. S never travels; it is the Diffie–Hellman value.
 *
 * Construction
 *   - keystream = Keccak-256(counter(4 bytes big-endian) ‖ "KS" ‖ compress(S)),
 *     concatenated over counter = 0, 1, 2, … until it covers the message. This
 *     is a hash-based stream cipher (a KDF in counter mode), documented here
 *     rather than claimed to match any standard.
 *   - ciphertext c = message ⊕ keystream.
 *   - tag = Keccak-256("TAG" ‖ compress(S) ‖ c): a key-confirmation tag so that
 *     a wrong private key (wrong S) or a tampered c is detected on decryption.
 *     It authenticates with the shared secret; it is not a general-purpose MAC.
 *
 * The private key is restricted to a small range [1, 2^bits] so that the
 * discrete logarithm — and therefore the whole scheme — can be broken live in a
 * browser (see src/lib/restricted-key-attack.js). A real key is a uniform
 * 256-bit scalar; the restriction is the designed weakness of the exercise.
 *
 * Randomness is real (globalThis.crypto.getRandomValues) by default, but every
 * entry point accepts an injectable byte source { bytes(n) } so that the page
 * and the tests can reproduce an experiment from a seed.
 *
 * Teaching code: no constant-time behaviour, no side-channel protection.
 */
import { G, N, mul, compress, isOnCurve, decompress } from './secp256k1.js';
import { keccak256 } from './keccak.js';
import {
  utf8Bytes,
  bytesToHex,
  hexToBytes,
  concatBytes,
  bytesToBigInt,
  bigIntToBytes,
  bytesEqual,
} from './bytes.js';

/**
 * Default size of the restricted private key, in bits. Chosen so that a live
 * brute-force search finishes in a browser worker in a few seconds: the
 * incremental-addition rate measured in test/bench.mjs is about 2.4·10^5
 * group operations per second in Node, so a 20-bit key (2^19 ≈ 5·10^5
 * operations on average) is recovered in roughly two seconds and in under
 * five in the worst case. Baby-step giant-step and Pollard's kangaroo cope
 * with larger ranges; see src/lib/restricted-key-attack.js.
 */
export const TOY_KEY_BITS = 20;

/** Name recorded in every ciphertext object. */
export const SCHEME = 'toy-ec-elgamal-keccak256';

const KS_LABEL = utf8Bytes('KS');
const TAG_LABEL = utf8Bytes('TAG');

/** Thrown when decryption fails the key-confirmation tag (wrong key or tampering). */
export class DecryptionError extends Error {
  constructor(message = 'decryption failed: key-confirmation tag mismatch') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * The real randomness source: cryptographically secure bytes from the host.
 * @type {{ bytes: (n: number) => Uint8Array }}
 */
export const systemRandom = {
  bytes(n) {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  },
};

/**
 * A private key drawn uniformly from the restricted range [1, 2^bits]. The
 * range is inclusive at both ends and holds exactly 2^bits integers (1, 2, …,
 * 2^bits). A fresh draw of ⌈bits/8⌉ bytes is masked to its low `bits` bits,
 * giving a uniform value in [0, 2^bits) with no modular bias, then shifted by
 * one. `bits` must be in [1, 254].
 */
export function randomKeyInRange(bits, random = systemRandom) {
  if (!Number.isInteger(bits) || bits < 1 || bits > 254) throw new RangeError('bits must be in [1, 254]');
  const byteLen = Math.ceil(bits / 8);
  const mask = 2n ** BigInt(bits) - 1n;
  const draw = bytesToBigInt(random.bytes(byteLen), 'be') & mask;
  return draw + 1n;
}

/**
 * A full-range ephemeral scalar, uniform on [1, n − 1], by rejection sampling of
 * 32-byte draws (the modulus n is extremely close to 2^256, so rejection is
 * almost never needed).
 */
export function randomScalar(random = systemRandom) {
  for (;;) {
    const r = bytesToBigInt(random.bytes(32), 'be');
    if (r >= 1n && r < N) return r;
  }
}

/**
 * A secp256k1 key pair with the private key restricted to [1, 2^bits].
 * @param {{ bits?: number, random?: { bytes: (n: number) => Uint8Array } }} [options]
 * @returns {Readonly<{ bits: number, privateKey: bigint, publicKey: {x: bigint, y: bigint}, publicKeyHex: string }>}
 */
export function generateKeyPair({ bits = TOY_KEY_BITS, random = systemRandom } = {}) {
  const privateKey = randomKeyInRange(bits, random);
  const publicKey = mul(G, privateKey);
  return Object.freeze({ bits, privateKey, publicKey, publicKeyHex: bytesToHex(compress(publicKey)) });
}

/**
 * Coerces a public key given as an affine point, compressed hex or compressed
 * bytes into an on-curve affine point.
 */
export function parsePoint(point) {
  let p = point;
  if (typeof p === 'string') p = decompress(hexToBytes(p));
  else if (p instanceof Uint8Array) p = decompress(p);
  if (p === null) throw new Error('the point at infinity is not a valid public key');
  if (!isOnCurve(p)) throw new Error('public key is not on the curve');
  return p;
}

/**
 * The keystream for the shared secret S: Keccak-256 of (counter ‖ "KS" ‖
 * compress(S)) for counter = 0, 1, 2, …, truncated to `length` bytes.
 */
export function deriveKeystream(S, length) {
  const base = concatBytes(KS_LABEL, compress(S));
  const out = new Uint8Array(length);
  let produced = 0;
  for (let counter = 0; produced < length; counter += 1) {
    const block = keccak256(concatBytes(bigIntToBytes(BigInt(counter), 4, 'be'), base));
    const take = Math.min(block.length, length - produced);
    out.set(block.subarray(0, take), produced);
    produced += take;
  }
  return out;
}

/** The key-confirmation tag over the shared secret and the ciphertext bytes. */
function deriveTag(S, cipherBytes) {
  return keccak256(concatBytes(TAG_LABEL, compress(S), cipherBytes));
}

/** XOR of two equal-length byte strings. */
function xorBytes(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i];
  return out;
}

/** Normalises a plaintext argument to bytes and records whether it was a string. */
function toPlaintextBytes(plaintext) {
  if (typeof plaintext === 'string') return { bytes: utf8Bytes(plaintext), encoding: 'utf8' };
  if (plaintext instanceof Uint8Array) return { bytes: plaintext, encoding: 'bytes' };
  throw new TypeError('plaintext must be a string or a Uint8Array');
}

/**
 * Encrypts a message to the public key Q and returns the intermediate values as
 * well as the serialisable ciphertext object — used by the page's step-by-step
 * explainer. See {@link encrypt} for the options.
 */
export function encryptTrace(plaintext, publicKey, { ephemeralBits, random = systemRandom } = {}) {
  const Q = parsePoint(publicKey);
  const { bytes: message, encoding } = toPlaintextBytes(plaintext);
  const ephemeral = ephemeralBits === undefined ? randomScalar(random) : randomKeyInRange(ephemeralBits, random);
  const R = mul(G, ephemeral); // public ephemeral point, sent in the clear
  const S = mul(Q, ephemeral); // shared secret S = rQ = kR
  const keystream = deriveKeystream(S, message.length);
  const cipherBytes = xorBytes(message, keystream);
  const tag = deriveTag(S, cipherBytes);
  const ciphertext = Object.freeze({
    scheme: SCHEME,
    encoding,
    R: bytesToHex(compress(R)),
    c: bytesToHex(cipherBytes),
    tag: bytesToHex(tag),
  });
  return { ephemeral, ephemeralBits: ephemeralBits ?? null, R, S, keystream, cipherBytes, ciphertext };
}

/**
 * Encrypts `plaintext` (a string, encoded UTF-8, or raw bytes) to the public
 * key `publicKey` (an affine point, compressed hex or compressed bytes).
 * @param {string | Uint8Array} plaintext
 * @param {object | string | Uint8Array} publicKey
 * @param {{ ephemeralBits?: number, random?: { bytes: (n: number) => Uint8Array } }} [options]
 *   `ephemeralBits` deliberately restricts the ephemeral scalar to [1, 2^bits]
 *   to model a design weakness (see restricted-key-attack.js); omit it for a
 *   full-range ephemeral. `random` injects a deterministic byte source.
 * @returns {Readonly<{ scheme: string, encoding: string, R: string, c: string, tag: string }>}
 */
export function encrypt(plaintext, publicKey, options = {}) {
  return encryptTrace(plaintext, publicKey, options).ciphertext;
}

/** The shared secret recovered from a ciphertext and the private key: S = kR. */
function sharedSecretFrom(ciphertext, privateKey) {
  return mul(parsePoint(ciphertext.R), privateKey);
}

/** Decodes the recovered message bytes according to the ciphertext's encoding. */
function decodeMessage(bytes, encoding) {
  return encoding === 'bytes' ? bytes : new TextDecoder().decode(bytes);
}

/**
 * Decrypts with the shared secret S directly (no private key). The tag is
 * verified first; a mismatch throws {@link DecryptionError}. Returns the
 * message (string or bytes, matching how it was encrypted).
 */
export function decryptWithSharedPoint(ciphertext, S) {
  const cipherBytes = hexToBytes(ciphertext.c);
  if (!bytesEqual(deriveTag(S, cipherBytes), hexToBytes(ciphertext.tag))) throw new DecryptionError();
  const message = xorBytes(cipherBytes, deriveKeystream(S, cipherBytes.length));
  return decodeMessage(message, ciphertext.encoding ?? 'utf8');
}

/**
 * Decrypts and returns the intermediate values (shared secret, keystream) for
 * the step-by-step explainer. Throws {@link DecryptionError} on a tag mismatch.
 */
export function decryptTrace(ciphertext, privateKey) {
  const S = sharedSecretFrom(ciphertext, privateKey);
  const cipherBytes = hexToBytes(ciphertext.c);
  if (!bytesEqual(deriveTag(S, cipherBytes), hexToBytes(ciphertext.tag))) throw new DecryptionError();
  const keystream = deriveKeystream(S, cipherBytes.length);
  const messageBytes = xorBytes(cipherBytes, keystream);
  return { S, keystream, messageBytes, message: decodeMessage(messageBytes, ciphertext.encoding ?? 'utf8') };
}

/**
 * Decrypts `ciphertext` with the private key `privateKey`. Throws
 * {@link DecryptionError} when the key is wrong or the ciphertext was tampered.
 * @returns {string | Uint8Array} the message in its original form
 */
export function decrypt(ciphertext, privateKey) {
  return decryptTrace(ciphertext, privateKey).message;
}

/**
 * BIP-32, "Hierarchical Deterministic Wallets"
 * (https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), with the
 * path notation used by BIP-44 (m / purpose' / coin_type' / account' / change / address_index).
 *
 * An extended key is a key plus a 32-byte chain code. Child number i is
 *   - hardened (i ≥ 2^31): I = HMAC-SHA512(c_par, 0x00 ‖ ser256(k_par) ‖ ser32(i)),
 *     computable only from the parent private key;
 *   - normal (i < 2^31):   I = HMAC-SHA512(c_par, serP(K_par) ‖ ser32(i)),
 *     computable from the parent public key as well.
 * The child private key is k_i = IL + k_par (mod n), the child public key
 * K_i = IL·G + K_par, and the child chain code c_i = IR, where IL and IR are
 * the left and right 32 bytes of I.
 *
 * Nodes are plain objects:
 *   { depth, parentFingerprint (4 bytes), childIndex, chainCode (32 bytes),
 *     privateKey (32 bytes, or null for a public-only node), publicKey (33-byte compressed point) }
 *
 * When IL ≥ n or the resulting key is zero (or the point at infinity), BIP-32
 * declares the key invalid and tells wallets to proceed with the next index.
 * This module throws a Bip32Error with code 'INVALID_KEY' instead, so that
 * the caller sees the event; its probability is below 2^-127.
 *
 * Teaching code: no constant-time arithmetic. It must not handle real keys.
 */

import { hmacSha512 } from './sha512.js';
import { sha256 } from './sha256.js';
import { ripemd160 } from './ripemd160.js';
import { base58CheckEncode, base58CheckDecode } from './base58.js';
import { G, N, mul, add, compress, decompress, mod, INFINITY } from './secp256k1.js';
import { bytesToBigInt, bigIntToBytes, concatBytes, utf8Bytes } from './bytes.js';

/** First hardened child number, 2^31. */
export const HARDENED_OFFSET = 0x80000000;

/** Mainnet version bytes of serialised extended keys. */
export const VERSIONS = Object.freeze({ xprv: 0x0488ade4, xpub: 0x0488b21e });

const MASTER_HMAC_KEY = utf8Bytes('Bitcoin seed');

/** An error with a machine-readable `code`. */
export class Bip32Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Bip32Error';
    this.code = code;
  }
}

const ser32 = (i) => bigIntToBytes(BigInt(i), 4);

function checkIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 32) throw new Error(`child index ${index} is not in [0, 2^32)`);
}

/** HASH160(K) = RIPEMD-160(SHA-256(K)); its first 4 bytes are the key fingerprint. */
export function fingerprint(publicKey) {
  return ripemd160(sha256(publicKey)).slice(0, 4);
}

/** Compressed public key of a private key given as 32 bytes. */
function publicFromPrivate(privateKey) {
  return compress(mul(G, bytesToBigInt(privateKey)));
}

/**
 * Builds the master node from I = HMAC-SHA512("Bitcoin seed", S): IL is the
 * master private key and IR the master chain code. Exposed separately from
 * masterKeyFromSeed so that the IL = 0 and IL ≥ n rejections can be shown.
 * @param {Uint8Array} digest the 64 bytes I
 */
export function masterKeyFromDigest(digest) {
  if (digest.length !== 64) throw new Error('the master digest has 64 bytes');
  const IL = digest.slice(0, 32);
  const k = bytesToBigInt(IL);
  if (k === 0n || k >= N) throw new Bip32Error('INVALID_KEY', 'master key is invalid: IL = 0 or IL ≥ n');
  return {
    depth: 0,
    parentFingerprint: new Uint8Array(4),
    childIndex: 0,
    chainCode: digest.slice(32),
    privateKey: IL,
    publicKey: publicFromPrivate(IL),
  };
}

/**
 * Master node of a seed of 128 to 512 bits (BIP-32, "Master key generation").
 * @param {Uint8Array} seed
 */
export function masterKeyFromSeed(seed) {
  if (seed.length < 16 || seed.length > 64) throw new Error('a BIP-32 seed has 16 to 64 bytes (128 to 512 bits)');
  return masterKeyFromDigest(hmacSha512(MASTER_HMAC_KEY, seed));
}

/**
 * CKDpriv: private parent node → private child node.
 * @param {object} node a node with a private key
 * @param {number} index child number in [0, 2^32); ≥ 2^31 is hardened
 */
export function ckdPriv(node, index) {
  checkIndex(index);
  if (!node.privateKey) throw new Error('CKDpriv needs a node with a private key');
  const data =
    index >= HARDENED_OFFSET
      ? concatBytes(new Uint8Array([0]), node.privateKey, ser32(index))
      : concatBytes(node.publicKey, ser32(index));
  const I = hmacSha512(node.chainCode, data);
  const il = bytesToBigInt(I.subarray(0, 32));
  const k = mod(il + bytesToBigInt(node.privateKey), N);
  if (il >= N || k === 0n) throw new Bip32Error('INVALID_KEY', `child ${index} is invalid; BIP-32 proceeds with the next index`);
  const privateKey = bigIntToBytes(k, 32);
  return {
    depth: node.depth + 1,
    parentFingerprint: fingerprint(node.publicKey),
    childIndex: index,
    chainCode: I.slice(32),
    privateKey,
    publicKey: publicFromPrivate(privateKey),
  };
}

/**
 * CKDpub: public parent node → public child node, for normal indices only.
 * @param {object} node any node (only its public key and chain code are used)
 * @param {number} index child number in [0, 2^31)
 */
export function ckdPub(node, index) {
  checkIndex(index);
  if (index >= HARDENED_OFFSET) throw new Error('CKDpub cannot derive a hardened child from a public key');
  const I = hmacSha512(node.chainCode, concatBytes(node.publicKey, ser32(index)));
  const il = bytesToBigInt(I.subarray(0, 32));
  if (il >= N) throw new Bip32Error('INVALID_KEY', `child ${index} is invalid; BIP-32 proceeds with the next index`);
  const point = add(mul(G, il), decompress(node.publicKey));
  if (point === INFINITY) throw new Bip32Error('INVALID_KEY', `child ${index} is the point at infinity`);
  return {
    depth: node.depth + 1,
    parentFingerprint: fingerprint(node.publicKey),
    childIndex: index,
    chainCode: I.slice(32),
    privateKey: null,
    publicKey: compress(point),
  };
}

/** N(): the public-only copy of a node. */
export function neuter(node) {
  return { ...node, privateKey: null };
}

/**
 * Parses a derivation path such as "m/44'/60'/0'/0/0". Hardened components
 * end in ', h or H.
 * @param {string} path
 * @returns {number[]} child numbers (hardened ones offset by 2^31)
 */
export function parsePath(path) {
  const parts = path.split('/');
  if (parts[0] !== 'm') throw new Error(`derivation path ${JSON.stringify(path)} must start with "m"`);
  return parts.slice(1).map((part) => {
    const match = /^(\d+)(['hH]?)$/.exec(part);
    if (!match) throw new Error(`invalid derivation path component ${JSON.stringify(part)}`);
    const n = Number(match[1]);
    if (n >= HARDENED_OFFSET) throw new Error(`derivation path component ${part} exceeds 2^31 − 1`);
    return match[2] ? n + HARDENED_OFFSET : n;
  });
}

/** The path component of a child number, hardened ones written with an apostrophe. */
export function formatIndex(index) {
  return index >= HARDENED_OFFSET ? `${index - HARDENED_OFFSET}'` : String(index);
}

/**
 * Derives every node along a path, starting with the given node as "m".
 * Private nodes use CKDpriv, public-only nodes CKDpub.
 * @returns {{ path: string, index: number | null, hardened: boolean, node: object }[]}
 */
export function derivePathChain(masterNode, path) {
  const chain = [{ path: 'm', index: null, hardened: false, node: masterNode }];
  let node = masterNode;
  let current = 'm';
  for (const index of parsePath(path)) {
    node = node.privateKey ? ckdPriv(node, index) : ckdPub(node, index);
    current = `${current}/${formatIndex(index)}`;
    chain.push({ path: current, index, hardened: index >= HARDENED_OFFSET, node });
  }
  return chain;
}

/** The node at the end of a derivation path. */
export function derivePath(masterNode, path) {
  return derivePathChain(masterNode, path).at(-1).node;
}

/**
 * Serialises a node as a Base58Check extended key (BIP-32, "Serialization format"):
 * version (4) ‖ depth (1) ‖ parent fingerprint (4) ‖ child number (4) ‖ chain code (32) ‖ key (33).
 * @param {object} node
 * @param {'xprv' | 'xpub'} kind
 * @returns {string}
 */
export function serializeExtendedKey(node, kind) {
  if (!Object.hasOwn(VERSIONS, kind)) throw new Error('kind must be "xprv" or "xpub"');
  if (kind === 'xprv' && !node.privateKey) throw new Error('an xprv needs a node with a private key');
  const key = kind === 'xprv' ? concatBytes(new Uint8Array([0]), node.privateKey) : node.publicKey;
  const payload = concatBytes(
    ser32(VERSIONS[kind]),
    new Uint8Array([node.depth]),
    node.parentFingerprint,
    ser32(node.childIndex),
    node.chainCode,
    key,
  );
  return base58CheckEncode(payload);
}

/**
 * Parses and validates a serialised extended key (the checks exercised by
 * BIP-32 test vector 5).
 * @param {string} text
 * @returns {object} a node; privateKey is null for an xpub
 * @throws on a bad checksum, length, version, key prefix, key value or depth-0 fields
 */
export function parseExtendedKey(text) {
  const payload = base58CheckDecode(text);
  if (payload.length !== 78) throw new Error('an extended key has 78 bytes');
  const version = Number(bytesToBigInt(payload.subarray(0, 4)));
  const depth = payload[4];
  const parentFingerprint = payload.slice(5, 9);
  const childIndex = Number(bytesToBigInt(payload.subarray(9, 13)));
  const chainCode = payload.slice(13, 45);
  const key = payload.slice(45);
  if (depth === 0 && parentFingerprint.some((b) => b !== 0)) throw new Error('zero depth with a non-zero parent fingerprint');
  if (depth === 0 && childIndex !== 0) throw new Error('zero depth with a non-zero child index');

  let privateKey = null;
  let publicKey;
  if (version === VERSIONS.xprv) {
    if (key[0] !== 0x00) throw new Error('an xprv key field must start with 0x00');
    const k = bytesToBigInt(key.subarray(1));
    if (k === 0n || k >= N) throw new Error('private key is not in [1, n − 1]');
    privateKey = key.slice(1);
    publicKey = publicFromPrivate(privateKey);
  } else if (version === VERSIONS.xpub) {
    if (key[0] !== 0x02 && key[0] !== 0x03) throw new Error('an xpub key field must be a compressed point (0x02 or 0x03)');
    decompress(key); // throws when x is not on the curve
    publicKey = key;
  } else {
    throw new Error(`unknown extended key version 0x${version.toString(16).padStart(8, '0')}`);
  }
  return { depth, parentFingerprint, childIndex, chainCode, privateKey, publicKey };
}

/**
 * The BIP-32 security caveat ("Implications"): knowing an extended public key
 * and any non-hardened child private key reveals the parent private key,
 *   k_par = k_i − IL (mod n),  with IL from HMAC-SHA512(c_par, serP(K_par) ‖ ser32(i)).
 * Hardened derivation exists to break this.
 * @param {object} parentXpubNode the parent's public node (chain code and public key)
 * @param {Uint8Array} childPrivateKey 32 bytes
 * @param {number} index the child's normal index
 * @returns {Uint8Array} the parent private key (32 bytes)
 * @throws when the index is hardened or the result does not match the parent public key
 */
export function recoverParentPrivateKey(parentXpubNode, childPrivateKey, index) {
  checkIndex(index);
  if (index >= HARDENED_OFFSET) throw new Error('a hardened child does not reveal its parent');
  const I = hmacSha512(parentXpubNode.chainCode, concatBytes(parentXpubNode.publicKey, ser32(index)));
  const k = mod(bytesToBigInt(childPrivateKey) - bytesToBigInt(I.subarray(0, 32)), N);
  const privateKey = bigIntToBytes(k, 32);
  const expected = parentXpubNode.publicKey;
  const actual = publicFromPrivate(privateKey);
  if (actual.some((b, i) => b !== expected[i])) throw new Error('recovered key does not match the parent public key');
  return privateKey;
}

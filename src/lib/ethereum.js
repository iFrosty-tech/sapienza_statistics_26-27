/**
 * From a private key to an Ethereum address, and the complete wallet
 * pipeline mnemonic → seed → BIP-32/BIP-44 key → public key → address.
 *
 *   - Public key: K = k·G on secp256k1, uncompressed as 0x04 ‖ x ‖ y.
 *   - Address: the last 20 bytes of Keccak-256(x ‖ y), the rightmost 160 bits
 *     of the hash of the 64-byte public key (Ethereum Yellow Paper, Shanghai
 *     version, Appendix F, equation (316)).
 *   - Checksum: EIP-55 (https://eips.ethereum.org/EIPS/eip-55). The i-th hex
 *     digit of the address is written in upper case when it is a letter and the
 *     i-th nibble of Keccak-256(lower-case hex address as ASCII) is ≥ 8.
 *   - Path: BIP-44 m / 44' / 60' / account' / change / index, 60 being
 *     Ethereum's SLIP-44 coin type.
 *
 * Teaching code: it must not handle real keys or real recovery phrases.
 */

import { G, N, mul, decompress, encodeUncompressed } from './secp256k1.js';
import { keccak256, keccak256Hex } from './keccak.js';
import { mnemonicBreakdown, mnemonicToSeed, normalizeMnemonic, Bip39Error } from './bip39.js';
import { masterKeyFromSeed, derivePathChain, HARDENED_OFFSET } from './bip32.js';
import { bytesToBigInt, bytesToHex, utf8Bytes } from './bytes.js';

/** BIP-44 purpose and the SLIP-44 coin type of Ether. */
export const BIP44_PURPOSE = 44;
export const ETHEREUM_COIN_TYPE = 60;

/**
 * The 65-byte uncompressed public key 0x04 ‖ x ‖ y of a private key.
 * @param {bigint | Uint8Array} privateKey an integer in [1, n − 1], or its 32-byte big-endian encoding
 */
export function uncompressedPublicKey(privateKey) {
  const k = typeof privateKey === 'bigint' ? privateKey : bytesToBigInt(privateKey);
  if (k <= 0n || k >= N) throw new Error('private key must be in [1, n − 1]');
  return encodeUncompressed(mul(G, k));
}

/** The 64 bytes x ‖ y of a public key given in 33-, 64- or 65-byte form. */
function publicKeyXY(publicKey) {
  if (publicKey.length === 65 && publicKey[0] === 0x04) return publicKey.subarray(1);
  if (publicKey.length === 64) return publicKey;
  if (publicKey.length === 33) return encodeUncompressed(decompress(publicKey)).subarray(1);
  throw new Error('public key must be 33 (compressed), 64 (x ‖ y) or 65 (0x04 ‖ x ‖ y) bytes');
}

/**
 * The address of a public key: "0x" and the last 20 bytes of Keccak-256(x ‖ y), in lower case.
 * @param {Uint8Array} publicKey 33, 64 or 65 bytes
 * @returns {string}
 */
export function publicKeyToAddress(publicKey) {
  return `0x${keccak256Hex(publicKeyXY(publicKey)).slice(24)}`;
}

/** The 40 lower-case hex digits of an address given with or without "0x". */
function addressDigits(address) {
  const digits = address.startsWith('0x') ? address.slice(2) : address;
  if (!/^[0-9a-fA-F]{40}$/.test(digits)) throw new Error('an address has 40 hexadecimal digits, optionally after 0x');
  return digits.toLowerCase();
}

/**
 * Per-character view of the EIP-55 checksum, for teaching.
 * @param {string} address any case, with or without "0x"
 * @returns {{ lowercase: string, checksummed: string, hash: string, letterCount: number,
 *   characters: { index: number, char: string, nibble: number, isLetter: boolean, upper: boolean }[] }}
 */
export function checksumBreakdown(address) {
  const digits = addressDigits(address);
  const hash = keccak256Hex(utf8Bytes(digits));
  const characters = [...digits].map((c, index) => {
    const nibble = parseInt(hash[index], 16);
    const isLetter = c >= 'a' && c <= 'f';
    const upper = isLetter && nibble >= 8;
    return { index, char: upper ? c.toUpperCase() : c, nibble, isLetter, upper };
  });
  return {
    lowercase: `0x${digits}`,
    checksummed: `0x${characters.map((c) => c.char).join('')}`,
    hash,
    letterCount: characters.filter((c) => c.isLetter).length,
    characters,
  };
}

/** The EIP-55 mixed-case form of an address. */
export function toChecksumAddress(address) {
  return checksumBreakdown(address).checksummed;
}

/** True when the string is "0x" plus 40 hex digits whose case matches EIP-55 exactly. */
export function isValidChecksumAddress(address) {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  return toChecksumAddress(address) === address;
}

function checkComponent(name, value) {
  if (!Number.isInteger(value) || value < 0 || value >= HARDENED_OFFSET) {
    throw new Error(`${name} must be an integer in [0, 2^31 − 1]`);
  }
}

/**
 * The whole pipeline, with every intermediate value, for the live explorer.
 * The mnemonic is normalised (NFKD, single spaces) and must be valid.
 * @param {string} mnemonic
 * @param {{ passphrase?: string, account?: number, change?: number, index?: number }} [options]
 */
export function deriveEthereumAccount(mnemonic, { passphrase = '', account = 0, change = 0, index = 0 } = {}) {
  checkComponent('account', account);
  checkComponent('change', change);
  checkComponent('index', index);
  const normalized = normalizeMnemonic(mnemonic);
  const breakdown = mnemonicBreakdown(normalized);
  if (!breakdown.checksumValid) throw new Bip39Error('INVALID_CHECKSUM', 'the mnemonic checksum does not match');

  const seed = mnemonicToSeed(normalized, passphrase);
  const master = masterKeyFromSeed(seed);
  const path = `m/${BIP44_PURPOSE}'/${ETHEREUM_COIN_TYPE}'/${account}'/${change}/${index}`;
  const chain = derivePathChain(master, path);
  const node = chain.at(-1).node;
  const publicKey = encodeUncompressed(decompress(node.publicKey));
  const keccakDigest = keccak256(publicKey.subarray(1));
  const address = `0x${bytesToHex(keccakDigest.subarray(12))}`;
  return {
    mnemonic: normalized,
    passphrase,
    words: breakdown.words,
    wordIndices: breakdown.indices,
    entropy: breakdown.entropy,
    entropyBits: breakdown.entropyBits,
    checksumBits: breakdown.checksumBits,
    seed,
    master,
    path,
    chain,
    node,
    privateKey: node.privateKey,
    publicKey,
    publicKeyCompressed: Uint8Array.from(node.publicKey),
    keccakDigest,
    address,
    checksummed: toChecksumAddress(address),
  };
}

/**
 * The computations behind the live explorer (Figure 2) and the EIP-55 check
 * of Figure 6, kept free of the page so they can be tested:
 *
 *   - parseExplorerInput: reads the form and names what is wrong with it;
 *   - deriveLenient: the pipeline of deriveEthereumAccount, except that a
 *     failed BIP-39 checksum is reported instead of thrown, since BIP-39 lets
 *     software derive the seed from any sentence and only asks it to warn;
 *   - flipEntropyBit and stageDistances: one flipped entropy bit and the
 *     number of bits in which every later stage changes (the avalanche);
 *   - checkChecksumAddress: whether a pasted address follows EIP-55.
 *
 * Teaching code: it must not handle real keys or real recovery phrases.
 */

import { Bip39Error, entropyToMnemonic, mnemonicBreakdown, mnemonicToSeed, normalizeMnemonic } from '../lib/bip39.js';
import { HARDENED_OFFSET, derivePathChain, masterKeyFromSeed } from '../lib/bip32.js';
import { decompress, encodeUncompressed } from '../lib/secp256k1.js';
import { keccak256 } from '../lib/keccak.js';
import { BIP44_PURPOSE, ETHEREUM_COIN_TYPE, toChecksumAddress } from '../lib/ethereum.js';
import { bytesToHex } from '../lib/bytes.js';
import { bitDistance } from './bits.js';

const MAX_COMPONENT = HARDENED_OFFSET - 1;

/** The BIP-44 path of an Ethereum account and address index on the external chain. */
export function pathOf(account, index) {
  return `m/${BIP44_PURPOSE}'/${ETHEREUM_COIN_TYPE}'/${account}'/0/${index}`;
}

function component(text, name) {
  const s = String(text ?? '').trim();
  if (!/^\d+$/.test(s) || Number(s) > MAX_COMPONENT) {
    return { error: `The ${name} must be a whole number from 0 to ${MAX_COMPONENT}.` };
  }
  return { value: Number(s) };
}

/**
 * Reads the explorer form.
 * @param {{ mnemonic: string, passphrase?: string, account: string | number, index: string | number }} input
 * @returns {{ ok: true, mnemonic: string, passphrase: string, account: number, index: number }
 *   | { ok: false, field: 'mnemonic' | 'account' | 'index', message: string, word?: string, position?: number }}
 */
export function parseExplorerInput({ mnemonic, passphrase = '', account, index }) {
  const normalized = normalizeMnemonic(String(mnemonic ?? ''));
  try {
    mnemonicBreakdown(normalized);
  } catch (error) {
    if (!(error instanceof Bip39Error)) throw error;
    if (error.code === 'UNKNOWN_WORD') {
      return {
        ok: false,
        field: 'mnemonic',
        word: error.word,
        position: error.position,
        message: `"${error.word}" (word ${error.position + 1}) is not in the BIP-39 English word list.`,
      };
    }
    const n = normalized === '' ? 0 : normalized.split(' ').length;
    return {
      ok: false,
      field: 'mnemonic',
      message: `A mnemonic has 12, 15, 18, 21 or 24 words; this one has ${n} word${n === 1 ? '' : 's'}.`,
    };
  }
  const a = component(account, 'account');
  if (a.error) return { ok: false, field: 'account', message: a.error };
  const i = component(index, 'address index');
  if (i.error) return { ok: false, field: 'index', message: i.error };
  return { ok: true, mnemonic: normalized, passphrase: String(passphrase ?? ''), account: a.value, index: i.value };
}

/**
 * Every intermediate value of the pipeline, in the shape of
 * deriveEthereumAccount, plus `checksumValid` and `expectedChecksumBits`.
 * Throws only on a bad word count or an unknown word.
 * @param {string} mnemonic
 * @param {{ passphrase?: string, account?: number, index?: number }} [options]
 */
export function deriveLenient(mnemonic, { passphrase = '', account = 0, index = 0 } = {}) {
  const normalized = normalizeMnemonic(mnemonic);
  const breakdown = mnemonicBreakdown(normalized);
  const seed = mnemonicToSeed(normalized, passphrase);
  const master = masterKeyFromSeed(seed);
  const path = pathOf(account, index);
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
    expectedChecksumBits: breakdown.expectedChecksumBits,
    checksumValid: breakdown.checksumValid,
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

/**
 * The mnemonic whose entropy differs from that of `mnemonic` in one bit,
 * with its checksum recomputed (so it is valid).
 * @param {string} mnemonic a sentence of known words and valid length
 * @param {number} bit position in reading order, 0 = most significant bit of the entropy
 * @returns {{ mnemonic: string, bit: number }}
 */
export function flipEntropyBit(mnemonic, bit) {
  const { entropy } = mnemonicBreakdown(mnemonic);
  const total = entropy.length * 8;
  if (!Number.isInteger(bit) || bit < 0 || bit >= total) throw new Error(`the flipped bit must be in [0, ${total})`);
  const flipped = Uint8Array.from(entropy);
  flipped[bit >> 3] ^= 0x80 >> (bit & 7);
  return { mnemonic: entropyToMnemonic(flipped), bit };
}

/**
 * The number of bits in which two accounts differ at every stage, next to
 * the number expected when one entropy bit is flipped and every later stage
 * behaves as an independent uniform value: n / 2 for a stage of n bits; for
 * the word indices, the flipped bit plus half of the CS checksum bits.
 * @returns {{ key: string, label: string, bits: number, distance: number | null, expected: number }[]}
 */
export function stageDistances(a, b) {
  const cs = a.checksumBits.length;
  const rows = [
    { key: 'entropy', label: 'Entropy', x: a.entropyBits, y: b.entropyBits, expected: 1 },
    { key: 'mnemonic', label: 'Word indices', x: a.entropyBits + a.checksumBits, y: b.entropyBits + b.checksumBits, expected: 1 + cs / 2 },
    { key: 'seed', label: 'Seed', x: a.seed, y: b.seed },
    { key: 'privateKey', label: 'Private key', x: a.privateKey, y: b.privateKey },
    { key: 'publicKey', label: 'Public key x ‖ y', x: a.publicKey.subarray(1), y: b.publicKey.subarray(1) },
    { key: 'digest', label: 'Keccak-256 digest', x: a.keccakDigest, y: b.keccakDigest },
    { key: 'address', label: 'Address', x: a.keccakDigest.subarray(12), y: b.keccakDigest.subarray(12) },
  ];
  return rows.map(({ key, label, x, y, expected }) => {
    const bits = typeof x === 'string' ? x.length : x.length * 8;
    return {
      key,
      label,
      bits,
      distance: x.length === y.length ? bitDistance(x, y) : null,
      expected: expected ?? bits / 2,
    };
  });
}

/**
 * Checks the EIP-55 case pattern of a typed address.
 * @param {string} input
 * @returns {{ status: 'empty' | 'malformed' | 'unchecked' | 'valid' | 'invalid', message?: string,
 *   digits?: string, expected?: string, offending?: number }}
 *   offending is the position (0 to 39) of the first hex digit whose case differs from EIP-55
 */
export function checkChecksumAddress(input) {
  const text = String(input ?? '').trim();
  if (text === '') return { status: 'empty' };
  const digits = text.startsWith('0x') || text.startsWith('0X') ? text.slice(2) : text;
  const bad = [...digits].findIndex((c) => !/[0-9a-fA-F]/.test(c));
  if (bad >= 0) {
    return { status: 'malformed', message: `"${digits[bad]}" (character ${bad + 1} after 0x) is not a hexadecimal digit.` };
  }
  if (digits.length !== 40) {
    return { status: 'malformed', message: `An address has 40 hexadecimal digits after 0x; this one has ${digits.length}.` };
  }
  const expected = toChecksumAddress(digits);
  const letters = digits.replace(/[0-9]/g, '');
  if (letters === '' || letters === letters.toLowerCase() || letters === letters.toUpperCase()) {
    return { status: 'unchecked', digits, expected };
  }
  const want = expected.slice(2);
  const offending = [...digits].findIndex((c, i) => c !== want[i]);
  if (offending < 0) return { status: 'valid', digits, expected };
  return { status: 'invalid', digits, expected, offending };
}

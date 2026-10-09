/**
 * BIP-39: wordlist, entropy ⇄ mnemonic, checksum, seed derivation.
 *
 * Vectors:
 *   - Wordlist: bitcoin/bips, bip-0039/english.txt
 *     (https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt).
 *   - Entropy, mnemonic, seed (passphrase "TREZOR") and master xprv: the
 *     reference implementation's vectors, trezor/python-mnemonic vectors.json
 *     (https://raw.githubusercontent.com/trezor/python-mnemonic/master/vectors.json);
 *     the 24 English entries are stored unmodified in test/fixtures/bip39-vectors.json.
 *   - Specification: BIP-39 (https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BIP39_ENGLISH } from '../src/data/bip39-english.js';
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicBreakdown,
  normalizeMnemonic,
} from '../src/lib/bip39.js';
import { masterKeyFromSeed, serializeExtendedKey } from '../src/lib/bip32.js';
import { bytesToHex, hexToBytes, utf8Bytes } from '../src/lib/bytes.js';
import { sha256Hex } from '../src/lib/sha256.js';

const { english: VECTORS } = JSON.parse(readFileSync(new URL('./fixtures/bip39-vectors.json', import.meta.url), 'utf8'));

test('the English wordlist is the published file (2048 words, SHA-256 of the text file)', () => {
  assert.equal(BIP39_ENGLISH.length, 2048);
  assert.ok(Object.isFrozen(BIP39_ENGLISH));
  assert.equal(
    sha256Hex(utf8Bytes(`${BIP39_ENGLISH.join('\n')}\n`)),
    '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda',
  );
  assert.equal(BIP39_ENGLISH[0], 'abandon');
  assert.equal(BIP39_ENGLISH[2047], 'zoo');
});

test('the wordlist is sorted and every word is identified by its first four letters', () => {
  const sorted = [...BIP39_ENGLISH].sort();
  assert.deepEqual(sorted, [...BIP39_ENGLISH]);
  assert.equal(new Set(BIP39_ENGLISH.map((w) => w.slice(0, 4))).size, 2048);
});

test('there are 24 English reference vectors', () => {
  assert.equal(VECTORS.length, 24);
});

for (const [i, [entropy, mnemonic]] of VECTORS.entries()) {
  test(`vector ${i}: entropy ⇄ mnemonic (${entropy.length * 4} bits)`, () => {
    assert.equal(entropyToMnemonic(hexToBytes(entropy)), mnemonic);
    assert.equal(bytesToHex(mnemonicToEntropy(mnemonic)), entropy);
    assert.equal(validateMnemonic(mnemonic), true);
  });
}

test('all 24 vectors: mnemonic → seed with passphrase "TREZOR" → master xprv', () => {
  for (const [i, [, mnemonic, seed, xprv]] of VECTORS.entries()) {
    const derived = mnemonicToSeed(mnemonic, 'TREZOR');
    assert.equal(bytesToHex(derived), seed, `vector ${i} seed`);
    assert.equal(serializeExtendedKey(masterKeyFromSeed(derived), 'xprv'), xprv, `vector ${i} xprv`);
  }
});

test('the empty passphrase gives a different seed (salt is "mnemonic" + passphrase)', () => {
  const [, mnemonic, seed] = VECTORS[0];
  assert.notEqual(bytesToHex(mnemonicToSeed(mnemonic)), seed);
  assert.equal(bytesToHex(mnemonicToSeed(mnemonic, '')), bytesToHex(mnemonicToSeed(mnemonic)));
});

test('mnemonic and passphrase are NFKD-normalised before PBKDF2', () => {
  const [, mnemonic] = VECTORS[0];
  const composed = mnemonicToSeed(mnemonic, 'café');
  const decomposed = mnemonicToSeed(mnemonic, 'café');
  assert.equal(bytesToHex(composed), bytesToHex(decomposed));
});

test('entropyToMnemonic accepts only 128, 160, 192, 224 or 256 bits', () => {
  for (const bytes of [0, 4, 15, 17, 33]) {
    assert.throws(() => entropyToMnemonic(new Uint8Array(bytes)), (e) => e.code === 'INVALID_ENTROPY_LENGTH');
  }
  for (const bytes of [16, 20, 24, 28, 32]) {
    assert.equal(entropyToMnemonic(new Uint8Array(bytes)).split(' ').length, ((bytes * 8) / 32) * 3);
  }
});

test('mnemonicToEntropy distinguishes a bad word count, an unknown word and a failed checksum', () => {
  const twelve = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  assert.throws(() => mnemonicToEntropy(twelve.split(' ').slice(0, 11).join(' ')), (e) => e.code === 'INVALID_WORD_COUNT');
  assert.throws(() => mnemonicToEntropy(`${twelve} abandon`), (e) => e.code === 'INVALID_WORD_COUNT');
  assert.throws(() => mnemonicToEntropy(''), (e) => e.code === 'INVALID_WORD_COUNT');
  assert.throws(
    () => mnemonicToEntropy(twelve.replace('about', 'aboutt')),
    (e) => e.code === 'UNKNOWN_WORD' && e.word === 'aboutt' && e.position === 11,
  );
  assert.throws(() => mnemonicToEntropy(twelve.replace('about', 'abandon')), (e) => e.code === 'INVALID_CHECKSUM');
  assert.equal(validateMnemonic(twelve.replace('about', 'abandon')), false);
  assert.equal(validateMnemonic('not a mnemonic'), false);
});

test('normalizeMnemonic trims and collapses whitespace after NFKD', () => {
  assert.equal(normalizeMnemonic('  abandon \t abandon\nabout '), 'abandon abandon about');
});

test('mnemonicBreakdown exposes entropy bits, checksum bits and the 11-bit word indices', () => {
  const twelve = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const b = mnemonicBreakdown(twelve);
  assert.equal(b.entropyBitLength, 128);
  assert.equal(b.checksumBitLength, 4);
  assert.equal(b.entropyBits, '0'.repeat(128));
  // SHA-256 of 16 zero bytes starts with 0x37, so the checksum is 0011 and "about" is word 3.
  assert.equal(b.checksumBits, '0011');
  assert.equal(b.expectedChecksumBits, '0011');
  assert.equal(b.checksumValid, true);
  assert.deepEqual(b.indices, [...Array(11).fill(0), 3]);
  assert.deepEqual(b.indexBits.at(-1), '00000000011');
  assert.equal(bytesToHex(b.entropy), '00'.repeat(16));
  assert.deepEqual(b.words, twelve.split(' '));
});

test('mnemonicBreakdown reports, rather than throws on, a failed checksum', () => {
  const b = mnemonicBreakdown(VECTORS[23][1].replace(/\S+$/, 'abandon'));
  assert.equal(b.checksumBitLength, 8);
  assert.equal(b.checksumValid, false);
  assert.notEqual(b.checksumBits, b.expectedChecksumBits);
});

test('mnemonicBreakdown agrees with every reference vector', () => {
  for (const [entropy, mnemonic] of VECTORS) {
    const b = mnemonicBreakdown(mnemonic);
    assert.equal(bytesToHex(b.entropy), entropy);
    assert.equal(b.checksumValid, true);
    assert.equal(b.indices.length, mnemonic.split(' ').length);
    assert.equal(b.indexBits.join(''), b.entropyBits + b.checksumBits);
    assert.deepEqual(b.indices.map((k) => BIP39_ENGLISH[k]), mnemonic.split(' '));
  }
});

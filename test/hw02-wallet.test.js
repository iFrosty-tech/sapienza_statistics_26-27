import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveEthereumAccount, toChecksumAddress } from '../src/lib/ethereum.js';
import { mnemonicBreakdown, mnemonicToSeed, validateMnemonic } from '../src/lib/bip39.js';
import { bytesToHex } from '../src/lib/bytes.js';
import {
  parseExplorerInput,
  deriveLenient,
  flipEntropyBit,
  stageDistances,
  checkChecksumAddress,
  pathOf,
} from '../src/hw02/wallet.js';

const HARDHAT = 'test test test test test test test test test test test junk';
const HARDHAT_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ABANDON_BAD = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

test('parseExplorerInput accepts the published test mnemonic and builds the BIP-44 path', () => {
  const r = parseExplorerInput({ mnemonic: `  ${HARDHAT}\n`, passphrase: '', account: '0', index: '2' });
  assert.equal(r.ok, true);
  assert.equal(r.mnemonic, HARDHAT);
  assert.equal(r.account, 0);
  assert.equal(r.index, 2);
  assert.equal(pathOf(r.account, r.index), "m/44'/60'/0'/0/2");
});

test('parseExplorerInput names an unknown word and its position', () => {
  const r = parseExplorerInput({ mnemonic: HARDHAT.replace('junk', 'junkk'), account: '0', index: '0' });
  assert.equal(r.ok, false);
  assert.equal(r.field, 'mnemonic');
  assert.match(r.message, /"junkk"/);
  assert.match(r.message, /word 12/);
});

test('parseExplorerInput reports a wrong word count', () => {
  const r = parseExplorerInput({ mnemonic: 'test test test', account: '0', index: '0' });
  assert.equal(r.ok, false);
  assert.match(r.message, /12, 15, 18, 21 or 24 words/);
  assert.match(r.message, /3 words/);
  const empty = parseExplorerInput({ mnemonic: '   ', account: '0', index: '0' });
  assert.equal(empty.ok, false);
  assert.match(empty.message, /0 words/);
});

test('parseExplorerInput rejects account and index values outside [0, 2^31 − 1]', () => {
  for (const bad of ['-1', '1.5', 'x', '', '2147483648']) {
    const r = parseExplorerInput({ mnemonic: HARDHAT, account: bad, index: '0' });
    assert.equal(r.ok, false, `account ${JSON.stringify(bad)}`);
    assert.equal(r.field, 'account');
  }
  const r = parseExplorerInput({ mnemonic: HARDHAT, account: '0', index: '2147483647' });
  assert.equal(r.ok, true);
});

test('deriveLenient reproduces deriveEthereumAccount for a valid mnemonic', () => {
  const lenient = deriveLenient(HARDHAT, { index: 1 });
  const strict = deriveEthereumAccount(HARDHAT, { index: 1 });
  assert.equal(lenient.checksumValid, true);
  assert.equal(lenient.checksummed, strict.checksummed);
  assert.equal(bytesToHex(lenient.seed), bytesToHex(strict.seed));
  assert.equal(bytesToHex(lenient.keccakDigest), bytesToHex(strict.keccakDigest));
  assert.equal(deriveLenient(HARDHAT).checksummed, HARDHAT_ADDRESS);
});

test('deriveLenient still derives the seed and keys when the checksum is wrong, as BIP-39 permits', () => {
  assert.equal(validateMnemonic(ABANDON_BAD), false);
  const a = deriveLenient(ABANDON_BAD);
  assert.equal(a.checksumValid, false);
  assert.equal(a.checksumBits, '0000');
  assert.equal(a.expectedChecksumBits, mnemonicBreakdown(ABANDON_BAD).expectedChecksumBits);
  assert.equal(bytesToHex(a.seed), bytesToHex(mnemonicToSeed(ABANDON_BAD)));
  assert.equal(a.checksummed, toChecksumAddress(a.address));
});

test('flipEntropyBit changes exactly one entropy bit and returns a mnemonic with a valid checksum', () => {
  const { mnemonic, bit } = flipEntropyBit(HARDHAT, 5);
  assert.equal(bit, 5);
  assert.equal(validateMnemonic(mnemonic), true);
  const before = mnemonicBreakdown(HARDHAT).entropyBits;
  const after = mnemonicBreakdown(mnemonic).entropyBits;
  let diff = 0;
  for (let i = 0; i < before.length; i += 1) diff += before[i] !== after[i] ? 1 : 0;
  assert.equal(diff, 1);
  assert.notEqual(before[5], after[5]);
  assert.throws(() => flipEntropyBit(HARDHAT, 128), /bit/);
});

test('stageDistances compares two accounts stage by stage against n / 2', () => {
  const a = deriveLenient(HARDHAT);
  const b = deriveLenient(flipEntropyBit(HARDHAT, 0).mnemonic);
  const rows = stageDistances(a, b);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['entropy', 'mnemonic', 'seed', 'privateKey', 'publicKey', 'digest', 'address'],
  );
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by.entropy.distance, 1);
  assert.equal(by.entropy.bits, 128);
  assert.equal(by.mnemonic.bits, 132);
  assert.equal(by.mnemonic.expected, 3, 'the flipped bit plus half of the 4 checksum bits');
  assert.equal(by.seed.expected, 256);
  assert.equal(by.publicKey.bits, 512);
  assert.equal(by.address.expected, 80);
  for (const r of rows) assert.ok(r.distance >= 0 && r.distance <= r.bits);
  assert.ok(by.seed.distance > 150 && by.seed.distance < 360, 'avalanche in the seed');
});

test('checkChecksumAddress validates the EIP-55 case pattern and finds the first offending character', () => {
  assert.deepEqual(checkChecksumAddress(HARDHAT_ADDRESS).status, 'valid');
  // f39F… : the first letter "f" must be lower case; upper-casing it breaks the pattern at digit 0.
  const bad = `0xF${HARDHAT_ADDRESS.slice(3)}`;
  const r = checkChecksumAddress(bad);
  assert.equal(r.status, 'invalid');
  assert.equal(r.offending, 0);
  assert.equal(r.expected, HARDHAT_ADDRESS);
  const later = `${HARDHAT_ADDRESS.slice(0, 5)}${HARDHAT_ADDRESS[5].toLowerCase()}${HARDHAT_ADDRESS.slice(6)}`;
  assert.equal(HARDHAT_ADDRESS[5], 'F');
  assert.equal(checkChecksumAddress(later).offending, 3);
  assert.equal(checkChecksumAddress(HARDHAT_ADDRESS.toLowerCase()).status, 'unchecked');
  assert.equal(checkChecksumAddress(`0x${HARDHAT_ADDRESS.slice(2).toUpperCase()}`).status, 'unchecked');
  assert.equal(checkChecksumAddress('').status, 'empty');
  const short = checkChecksumAddress('0x1234');
  assert.equal(short.status, 'malformed');
  assert.match(short.message, /40 hexadecimal digits/);
  const nonHex = checkChecksumAddress(`0x${'g'.padEnd(40, '0')}`);
  assert.equal(nonHex.status, 'malformed');
  assert.match(nonHex.message, /"g"/);
  assert.equal(checkChecksumAddress(HARDHAT_ADDRESS.slice(2)).status, 'valid', '0x prefix optional');
});

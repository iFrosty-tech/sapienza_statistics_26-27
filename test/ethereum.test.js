/**
 * Ethereum addresses: uncompressed public key, Keccak-256 address, EIP-55
 * checksum, and the complete BIP-39 → BIP-32/BIP-44 → address pipeline.
 *
 * Vectors:
 *   - EIP-55, "Mixed-case checksum address encoding", the worked example and
 *     the "Test Cases" list (https://eips.ethereum.org/EIPS/eip-55).
 *   - Hardhat Network default accounts derived from the mnemonic
 *     "test test test test test test test test test test test junk" along
 *     m/44'/60'/0'/0 (configuration reference, addresses of accounts #0 to #2:
 *     https://hardhat.org/hardhat-network/docs/reference; private keys of
 *     accounts #0 and #1 as printed by the node:
 *     https://hardhat.org/hardhat-network/docs/overview).
 *   - The generator G of secp256k1: SEC 2, version 2.0, section 2.4.1
 *     (https://www.secg.org/sec2-v2.pdf).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  uncompressedPublicKey,
  publicKeyToAddress,
  toChecksumAddress,
  isValidChecksumAddress,
  checksumBreakdown,
  deriveEthereumAccount,
} from '../src/lib/ethereum.js';
import { G, encodeUncompressed, compress, mul } from '../src/lib/secp256k1.js';
import { keccak256Hex } from '../src/lib/keccak.js';
import { bytesToHex, hexToBytes, utf8Bytes } from '../src/lib/bytes.js';
import { serializeExtendedKey } from '../src/lib/bip32.js';

const EIP55_CASES = [
  // All caps
  '0x52908400098527886E0F7030069857D2E4169EE7',
  '0x8617E340B3D01FA5F11F306F4090FD50E238070D',
  // All lower
  '0xde709f2102306220921060314715629080e2fb77',
  '0x27b1fdb04752bbc536007a920d24acb045561c26',
  // Normal
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];

const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
const HARDHAT_ACCOUNTS = [
  { index: 0, address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', key: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  { index: 1, address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', key: '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  { index: 2, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', key: null },
];

const flipCase = (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase());

test('the EIP-55 worked example', () => {
  assert.equal(toChecksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'), '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');
});

for (const address of EIP55_CASES) {
  test(`EIP-55 test case ${address}`, () => {
    assert.equal(toChecksumAddress(address.toLowerCase()), address);
    assert.equal(toChecksumAddress(address.slice(2).toUpperCase()), address, 'any input case, with or without 0x');
    assert.equal(isValidChecksumAddress(address), true);
    const letter = [...address].findIndex((c, i) => i >= 2 && /[a-f]/i.test(c));
    const flipped = address.slice(0, letter) + flipCase(address[letter]) + address.slice(letter + 1);
    assert.equal(isValidChecksumAddress(flipped), false, `case flip at ${letter}`);
  });
}

test('isValidChecksumAddress rejects malformed strings; toChecksumAddress throws on them', () => {
  for (const bad of ['', '0x', '0x1234', `0x${'g'.repeat(40)}`, `0x${'a'.repeat(41)}`, `0X${'a'.repeat(40)}x`]) {
    assert.equal(isValidChecksumAddress(bad), false, bad);
    assert.throws(() => toChecksumAddress(bad), /address/, bad);
  }
});

test('checksumBreakdown lists the hash nibble that sets the case of every letter', () => {
  const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  const b = checksumBreakdown(address);
  assert.equal(b.checksummed, address);
  assert.equal(b.lowercase, address.toLowerCase());
  assert.equal(b.hash, keccak256Hex(utf8Bytes(address.slice(2).toLowerCase())));
  assert.equal(b.characters.length, 40);
  for (const [i, c] of b.characters.entries()) {
    assert.equal(c.index, i);
    assert.equal(c.char, address[i + 2]);
    assert.equal(c.nibble, parseInt(b.hash[i], 16));
    assert.equal(c.isLetter, /[a-f]/i.test(c.char));
    assert.equal(c.upper, c.isLetter && c.nibble >= 8);
  }
  assert.equal(b.letterCount, b.characters.filter((c) => c.isLetter).length);
});

test('uncompressedPublicKey(1) is 0x04 ‖ G.x ‖ G.y (SEC 2)', () => {
  const pub = uncompressedPublicKey(1n);
  assert.equal(
    bytesToHex(pub),
    '04' +
      '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
      '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
  );
  assert.equal(bytesToHex(encodeUncompressed(G)), bytesToHex(pub));
  assert.equal(bytesToHex(uncompressedPublicKey(hexToBytes(`${'00'.repeat(31)}01`))), bytesToHex(pub));
  assert.throws(() => uncompressedPublicKey(0n), /private key/);
  assert.throws(() => uncompressedPublicKey(hexToBytes('ff'.repeat(32))), /private key/);
  assert.throws(() => encodeUncompressed(null), /infinity/);
});

test('publicKeyToAddress hashes the 64-byte x ‖ y whichever encoding it is given', () => {
  const point = mul(G, 0x1234567890abcdefn);
  const full = encodeUncompressed(point);
  const address = publicKeyToAddress(full);
  assert.match(address, /^0x[0-9a-f]{40}$/);
  assert.equal(address, `0x${keccak256Hex(full.subarray(1)).slice(24)}`);
  assert.equal(publicKeyToAddress(full.subarray(1)), address);
  assert.equal(publicKeyToAddress(compress(point)), address);
  assert.throws(() => publicKeyToAddress(new Uint8Array(63)), /public key/);
});

for (const account of HARDHAT_ACCOUNTS) {
  test(`Hardhat default account #${account.index}: m/44'/60'/0'/0/${account.index}`, () => {
    const result = deriveEthereumAccount(HARDHAT_MNEMONIC, { index: account.index });
    assert.equal(result.path, `m/44'/60'/0'/0/${account.index}`);
    assert.equal(result.checksummed, account.address);
    assert.equal(result.address, account.address.toLowerCase());
    if (account.key) assert.equal(bytesToHex(result.privateKey), account.key);
  });
}

test('deriveEthereumAccount exposes every intermediate value of the pipeline', () => {
  const r = deriveEthereumAccount(`  ${HARDHAT_MNEMONIC.replaceAll(' ', '  ')} `);
  assert.equal(r.mnemonic, HARDHAT_MNEMONIC);
  assert.equal(r.passphrase, '');
  assert.equal(r.words.length, 12);
  assert.equal(r.wordIndices.length, 12);
  assert.equal(r.entropy.length, 16);
  assert.equal(r.entropyBits.length, 128);
  assert.equal(r.checksumBits.length, 4);
  assert.equal(r.seed.length, 64);
  assert.equal(r.master.depth, 0);
  assert.deepEqual(r.chain.map((c) => c.path), ['m', "m/44'", "m/44'/60'", "m/44'/60'/0'", "m/44'/60'/0'/0", "m/44'/60'/0'/0/0"]);
  assert.equal(r.node, r.chain.at(-1).node);
  assert.equal(r.node.depth, 5);
  assert.equal(r.publicKey.length, 65);
  assert.equal(r.publicKey[0], 0x04);
  assert.equal(bytesToHex(r.publicKeyCompressed), bytesToHex(r.node.publicKey));
  assert.equal(bytesToHex(r.keccakDigest), keccak256Hex(r.publicKey.subarray(1)));
  assert.equal(r.address, `0x${bytesToHex(r.keccakDigest).slice(24)}`);
  assert.equal(r.checksummed, toChecksumAddress(r.address));
  assert.match(serializeExtendedKey(r.master, 'xprv'), /^xprv/);
});

test('deriveEthereumAccount follows the account, change and index options and the passphrase', () => {
  const base = deriveEthereumAccount(HARDHAT_MNEMONIC);
  const other = deriveEthereumAccount(HARDHAT_MNEMONIC, { account: 1, change: 1, index: 3 });
  assert.equal(other.path, "m/44'/60'/1'/1/3");
  assert.notEqual(other.address, base.address);
  const withPassphrase = deriveEthereumAccount(HARDHAT_MNEMONIC, { passphrase: 'TREZOR' });
  assert.notEqual(bytesToHex(withPassphrase.seed), bytesToHex(base.seed));
  assert.notEqual(withPassphrase.address, base.address);
  assert.throws(() => deriveEthereumAccount('test test test'), (e) => e.code === 'INVALID_WORD_COUNT');
  assert.throws(() => deriveEthereumAccount(HARDHAT_MNEMONIC, { index: -1 }), /index/);
});

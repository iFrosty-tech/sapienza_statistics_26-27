/**
 * The live program of homework 1 (src/hw01/program.js): parsing of the private
 * key and the printed report, on the toy curve y² = x³ + 7 over F₁₇ and on
 * secp256k1. The toy output for k = 6 must match the listing printed at build
 * time; the secp256k1 addresses of the private keys 1 and 2 are well known
 * (G itself, and 2G), with their EIP-55 checksums.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRAM_LIMITS,
  ProgramInputError,
  parseBasePoint,
  parsePrivateKey,
  programReport,
  reportText,
} from '../src/hw01/program.js';
import { SECP256K1_N, TOY_BASE } from '../src/lib/toy-curve.js';

const toy = (k, method = 'repeated') => programReport({ curve: 'toy', k: BigInt(k), base: TOY_BASE, method });
const secp = (k, method = 'double-and-add') => programReport({ curve: 'secp256k1', k: BigInt(k), method });

test('the assignment: G, 2G, …, 6G and the toy public key, exactly as the printed listing', () => {
  const report = toy(6);
  assert.equal(
    reportText(report),
    'G = (1, 5)\n2G = (2, 10)\n3G = (5, 9)\n4G = (12, 1)\n5G = (12, 16)\n6G = (5, 8)\n\nTOY PUBLIC KEY: Q = 6G = (5, 8)',
  );
  assert.deepEqual(report.lines.filter((l) => l.strong).map((l) => l.text), ['TOY PUBLIC KEY: Q = 6G = (5, 8)']);
  assert.deepEqual(report.result, { x: 5n, y: 8n });
  assert.equal(report.operations, 5);
});

test('k = 9 reaches the point at infinity, which is not a public key', () => {
  const report = toy(9);
  const text = reportText(report);
  assert.ok(text.includes('8G = (1, 12)\n9G = O (point at infinity)'), text);
  const strong = report.lines.filter((l) => l.strong).map((l) => l.text);
  assert.deepEqual(strong, ['9G = O (point at infinity)']);
  assert.ok(/O is not a valid public key/.test(text) && /multiple of the order of G/.test(text), text);
  assert.equal(report.result, null);
  assert.ok(reportText(toy(10)).endsWith('TOY PUBLIC KEY: Q = 10G = (1, 5)'), 'O + G = G');
});

test('double-and-add for k = 6 prints the bits, one line per operation and the count of operations', () => {
  const lines = reportText(toy(6, 'double-and-add')).split('\n');
  assert.deepEqual(lines, [
    'k = 6 = 110 in binary (3 bits)',
    'bit 1 = 1  load G   R = G = (1, 5)',
    'bit 2 = 1  double   R = 2G = (2, 10)',
    'bit 2 = 1  add G    R = 3G = (5, 9)',
    'bit 3 = 0  double   R = 6G = (5, 8)',
    'Group operations: 3 (repeated addition: 5)',
    '',
    'TOY PUBLIC KEY: Q = 6G = (5, 8)',
  ]);
  const big = reportText(toy(123456789, 'double-and-add'));
  // 123456789 has 27 bits, 16 of them ones: 26 doublings and 15 additions.
  assert.ok(big.includes('Group operations: 41 (repeated addition: 123456788)'), big);
});

test('secp256k1: private key 1 gives G and the address 0x7E5F…5Bdf', () => {
  for (const method of ['repeated', 'double-and-add']) {
    const text = reportText(secp(1, method));
    assert.ok(text.includes('x = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'), text);
    assert.ok(text.includes('y = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'), text);
    assert.ok(text.includes('Ethereum address: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'), text);
    assert.ok(/last 20 bytes of Keccak-256/.test(text));
  }
  const strong = secp(1).lines.filter((l) => l.strong).map((l) => l.text);
  assert.equal(strong[0], 'PUBLIC KEY: Q = G');
  assert.equal(strong.at(-1), 'Ethereum address: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf');
});

test('secp256k1: private key 2 gives the address 0x2B5A…CD6cF by both methods', () => {
  for (const method of ['repeated', 'double-and-add']) {
    assert.ok(reportText(secp(2, method)).includes('Ethereum address: 0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'));
  }
  assert.ok(reportText(secp(6)).includes('Ethereum address: 0xE57bFE9F44b819898F47BF37E5AF72a0783e1141'));
});

test('secp256k1: a full-size key is summarised instead of printing every operation', () => {
  const k = SECP256K1_N - 1n;
  const report = secp(k);
  const text = reportText(report);
  assert.ok(text.includes('k has 256 bits'), text);
  assert.ok(/255 doublings and \d+ additions/.test(text), text);
  assert.ok(!/^bit \d+ =/m.test(text), 'no line per bit');
  // (n − 1)G = −G: the same abscissa as G.
  assert.ok(text.includes('x = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'));
  assert.ok(text.includes('y = 0xb7c52588d95c3b9aa25b0403f1eef75702e84bb7597aabe663b82f6f04ef2777'));
  const small = reportText(secp(255));
  assert.ok(/^bit 8 = 1 {2}add G/m.test(small), 'keys below 2^8 print every operation');
});

test('the private key is parsed in decimal or hexadecimal and checked against each curve and method', () => {
  assert.equal(parsePrivateKey(' 6 ', { curve: 'toy', method: 'repeated' }), 6n);
  assert.equal(parsePrivateKey('0x10', { curve: 'secp256k1', method: 'double-and-add' }), 16n);
  assert.equal(parsePrivateKey('0XfF', { curve: 'toy', method: 'double-and-add' }), 255n);
  assert.equal(parsePrivateKey(String(SECP256K1_N - 1n), { curve: 'secp256k1', method: 'double-and-add' }), SECP256K1_N - 1n);
  const fails = [
    ['', 'toy', 'repeated', /Enter a private key/],
    ['abc', 'toy', 'repeated', /not a whole number/],
    ['6.5', 'toy', 'repeated', /not a whole number/],
    ['0', 'toy', 'repeated', /at least 1/],
    ['-3', 'secp256k1', 'double-and-add', /at least 1/],
    [String(SECP256K1_N), 'secp256k1', 'double-and-add', /smaller than n/],
    ['65', 'secp256k1', 'repeated', /double-and-add/],
    [String(PROGRAM_LIMITS.toyRepeated + 1n), 'toy', 'repeated', /double-and-add/],
    [`0x1${'0'.repeat(64)}`, 'toy', 'double-and-add', /256 bits/],
  ];
  for (const [text, curve, method, message] of fails) {
    assert.throws(() => parsePrivateKey(text, { curve, method }), (e) => e instanceof ProgramInputError && message.test(e.message), `${text}`);
  }
  assert.deepEqual(parseBasePoint('12,16'), { x: 12n, y: 16n });
  assert.throws(() => parseBasePoint('1,6'), ProgramInputError, 'not on the toy curve');
});

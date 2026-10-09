/**
 * Micro-benchmark (not a test). Run with: node test/bench.mjs
 * Homework 01: the cost of building the per-byte tables of the toy hash and the
 * throughput of both generator families and of SHA-256 on 32-byte messages.
 * Homework 02: PBKDF2-HMAC-SHA512, the whole mnemonic-to-address pipeline,
 * Keccak-256 throughput and public-key derivation.
 */
import { ecHash, generatorTable } from '../src/lib/ec-hash.js';
import { sha256 } from '../src/lib/sha256.js';
import { mul, G, N } from '../src/lib/secp256k1.js';
import { createRandom } from '../src/lib/random.js';
import { pbkdf2HmacSha512 } from '../src/lib/sha512.js';
import { keccak256 } from '../src/lib/keccak.js';
import { deriveEthereumAccount, uncompressedPublicKey } from '../src/lib/ethereum.js';

const rnd = createRandom(1);
const messages = Array.from({ length: 2000 }, () => rnd.bytes(32));

function time(label, fn, count) {
  const t0 = performance.now();
  for (let i = 0; i < count; i += 1) fn(i);
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(46)} ${count} ops in ${ms.toFixed(0)} ms  →  ${((count * 1000) / ms).toFixed(0)} ops/s`);
}

for (const variant of ['scalar', 'pedersen']) {
  const t0 = performance.now();
  for (let i = 0; i < 32; i += 1) generatorTable(variant, i);
  console.log(`${variant}: 32 tables of 256 multiples built in ${(performance.now() - t0).toFixed(0)} ms`);
}

time('ecHash scalar, 32-byte messages', (i) => ecHash(messages[i], { variant: 'scalar' }), messages.length);
time('ecHash pedersen, 32-byte messages', (i) => ecHash(messages[i], { variant: 'pedersen' }), messages.length);
time('sha256, 32-byte messages', (i) => sha256(messages[i]), messages.length);
time('mul(G, k) double-and-add, 256-bit k', (i) => mul(G, BigInt(`0x${Buffer.from(messages[i]).toString('hex')}`)), 200);

/* Homework 02: the wallet pipeline. */
const pbkdf2Runs = 20;
let t0 = performance.now();
for (let i = 0; i < pbkdf2Runs; i += 1) pbkdf2HmacSha512(messages[i], 'mnemonic', 2048, 64);
console.log(`PBKDF2-HMAC-SHA512, 2048 iterations: ${((performance.now() - t0) / pbkdf2Runs).toFixed(1)} ms per seed`);

const mnemonic = 'test test test test test test test test test test test junk';
const pipelineRuns = 10;
t0 = performance.now();
for (let i = 0; i < pipelineRuns; i += 1) deriveEthereumAccount(mnemonic, { index: i });
console.log(`mnemonic → address (m/44'/60'/0'/0/i): ${((performance.now() - t0) / pipelineRuns).toFixed(1)} ms per account`);

const block = rnd.bytes(1 << 20);
t0 = performance.now();
keccak256(block);
const keccakMs = performance.now() - t0;
console.log(`keccak256 on 1 MiB: ${keccakMs.toFixed(0)} ms → ${(1000 / keccakMs).toFixed(1)} MiB/s`);
const publicKeys = Array.from({ length: 2000 }, () => rnd.bytes(64));
time('keccak256, 64-byte messages (public keys)', (i) => keccak256(publicKeys[i % publicKeys.length]), 20000);
time('uncompressedPublicKey(k), 256-bit k', (i) => uncompressedPublicKey((BigInt(`0x${Buffer.from(messages[i]).toString('hex')}`) % (N - 1n)) + 1n), 200);

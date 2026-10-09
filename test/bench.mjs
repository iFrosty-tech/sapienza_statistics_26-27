/**
 * Micro-benchmark of the toy hash (not a test). Run with: node test/bench.mjs
 * Reports the cost of building the per-byte tables and the throughput of both
 * generator families and of SHA-256 on 32-byte messages.
 */
import { ecHash, generatorTable } from '../src/lib/ec-hash.js';
import { sha256 } from '../src/lib/sha256.js';
import { mul, G } from '../src/lib/secp256k1.js';
import { createRandom } from '../src/lib/random.js';

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

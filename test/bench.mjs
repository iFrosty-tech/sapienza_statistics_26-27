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

/* Homework 02 experiments at their default sizes (opt-in, about a minute): node test/bench.mjs --experiments */
if (process.argv.includes('--experiments')) {
  const study = await import('../src/lib/wallet-study.js');
  const { keccakDiffusion } = await import('../src/lib/keccak-diffusion.js');
  const fmt = (p) => (Number.isFinite(p) ? p.toPrecision(3) : String(p));
  const rows = [];
  const run = (name, fn, headline) => {
    const start = performance.now();
    const result = fn();
    rows.push([name, ((performance.now() - start) / 1000).toFixed(2), headline(result)]);
    return result;
  };
  run('W1 entropyLedger', () => study.entropyLedger(), (r) => `P(IL ≥ n) = ${r.invalidKey.probability}, log2 = ${r.invalidKey.log2.toFixed(3)}`);
  for (const words of [12, 24]) {
    run(`W2 checksumAcceptance ${words} words`, () => study.checksumAcceptance({ words }),
      (r) => `n ${r.n}, valid ${r.valid}, rate ${r.rate.toPrecision(4)} vs ${r.expectedRate.toPrecision(4)}, p = ${fmt(r.p)}`);
    run(`W3 substitutionDetection ${words} words`, () => study.substitutionDetection({ words }),
      (r) => `n ${r.n}, undetected ${r.overall.undetected}, rate ${r.overall.rate.toPrecision(4)} vs ${r.overall.expectedRate.toPrecision(4)}, p = ${fmt(r.overall.p)}; last word ${r.lastWord.undetected}/${r.lastWord.trials}, p = ${fmt(r.lastWord.p)}`);
  }
  run('W4 wordIndexUniformity', () => study.wordIndexUniformity(),
    (r) => `n ${r.n}, pooled χ² = ${r.pooled.statistic.toFixed(1)}, p = ${fmt(r.pooled.p)}; last word χ² = ${r.lastWord.statistic.toFixed(1)}, p = ${fmt(r.lastWord.p)} (df 2047)`);
  const pipeline = run('W5/W6 pipelineSample', () => study.pipelineSample(), (r) =>
    `n ${r.n}; ` +
    ['seed', 'privateKey', 'publicKeyX', 'address']
      .map((s) => {
        const st = r.stages[s];
        const sibling = st.sibling ? `, sibling mean ${st.sibling.mean.toFixed(2)} p = ${fmt(st.sibling.p)}` : '';
        return `${s}: weight p = ${fmt(st.weight.p)}, avalanche mean ${st.avalanche.mean.toFixed(2)} p = ${fmt(st.avalanche.p)}${sibling}`;
      })
      .join('; ') +
    `; address bits χ²(160) = ${r.addressBits.statistic.toFixed(1)}, p = ${fmt(r.addressBits.p)}`);
  const pipelineSeconds = Number(rows.at(-1)[1]);
  run('W7 keccakDiffusion', () => keccakDiffusion(), (r) => {
    const at = (label) => r.checkpoints.find((c) => c.label === label).mean.toFixed(2);
    return `n ${r.n}, mean after R1 θ ${at('R1 θ')}, R1 χ ${at('R1 χ')}, R2 ${at('R2')}, R3 ${at('R3')}, R24 ${r.final.mean.toFixed(1)} (sd ${r.final.sd.toFixed(1)}), χ² p = ${fmt(r.final.p)}`;
  });
  for (const k of [1, 2]) {
    run(`W8 vanitySearch k = ${k}`, () => study.vanitySearch({ prefixNibbles: k }),
      (r) => `${r.searches} searches, mean ${r.mean.toFixed(2)} [${r.interval.low.toFixed(1)}, ${r.interval.high.toFixed(1)}] vs ${r.expectedMean}, χ²(${r.df}) p = ${fmt(r.p)}; leading zeros χ²(${r.leadingZeros.test.df}) p = ${fmt(r.leadingZeros.test.p)}`);
  }
  run('W9 addressCase', () => study.addressCase({ realAddresses: pipeline.addresses }),
    (r) => `n ${r.n}, L mean ${r.random.letters.mean.toFixed(3)} p = ${fmt(r.random.letters.p)}, U mean ${r.random.upper.mean.toFixed(3)} p = ${fmt(r.random.upper.p)}; real (n ${r.real.n}) L p = ${fmt(r.real.letters.p)}, U p = ${fmt(r.real.upper.p)}`);
  run('W10 checksumErrorDetection', () => study.checksumErrorDetection(),
    (r) => `n ${r.n}; (a) ${r.randomCase.accepted} accepted vs ${r.randomCase.expectedAccepted.toFixed(1)}, p = ${fmt(r.randomCase.p)}, RB ${r.randomCase.raoBlackwell.estimate.toExponential(4)}; (b) ${r.substitution.accepted} accepted, p = ${fmt(r.substitution.p)}; (c) ${r.caseFlip.detected}/${r.caseFlip.lettersTested} detected`);
  // Each pipeline sample derives two full accounts (original and twin A).
  run('W11 bruteForceScale', () => study.bruteForceScale({ addressesPerSecond: (2 * pipeline.n) / pipelineSeconds }),
    (r) => `${r.addressesPerSecond.toFixed(1)} addresses/s: 2^32 in ${r.searchSpaces[0].exhaustYears.toFixed(2)} years; rho log2 = ${r.rho.log2Additions.toFixed(3)}; P(collision, 1e12) = ${r.collisions[2].probability.toExponential(3)}`);
  console.log('\nexperiment | seconds | headline');
  for (const row of rows) console.log(row.join(' | '));
}

/**
 * The wallet-pipeline experiments: exact facts (proved in the module and
 * checked here by enumeration), determinism for a fixed seed, the shapes of
 * the returned data, and loose statistical sanity bounds on small samples.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entropyLedger,
  entropyToIndices,
  indicesChecksumValid,
  countValidLastWordSubstitutions,
  checksumAcceptance,
  substitutionDetection,
  wordIndexUniformity,
  pipelineSample,
  vanitySearch,
  addressCase,
  checksumErrorDetection,
  caseFlipDetection,
  bruteForceScale,
  EIP55_ACCEPT_PROBABILITY,
  EIP55_NO_LETTER_PROBABILITY,
} from '../src/lib/wallet-study.js';
import { entropyToMnemonic, mnemonicBreakdown, validateMnemonic } from '../src/lib/bip39.js';
import { BIP39_ENGLISH } from '../src/data/bip39-english.js';
import { N } from '../src/lib/secp256k1.js';
import { createRandom } from '../src/lib/random.js';
import { isValidChecksumAddress } from '../src/lib/ethereum.js';

const inUnit = (p, msg) => assert.ok(p >= 0 && p <= 1, `${msg ?? 'p'} = ${p}`);
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

/* ------------------------------------------------------------------------ */
/* W1                                                                        */
/* ------------------------------------------------------------------------ */

test('W1 entropy ledger: exact sizes and the BIP-32 invalid-key probability', () => {
  const ledger = entropyLedger();
  const row = (stage) => ledger.rows.find((r) => r.stage === stage);
  assert.deepEqual(
    ledger.rows.map((r) => r.stage),
    ['entropy', 'mnemonic', 'seed', 'privateKey', 'publicKey', 'address', 'checksummedAddress'],
  );
  assert.deepEqual(row('entropy').words12, { representationBits: 128, entropyBits: 128 });
  assert.deepEqual(row('entropy').words24, { representationBits: 256, entropyBits: 256 });
  assert.deepEqual(row('mnemonic').words12, { representationBits: 132, entropyBits: 128 });
  assert.deepEqual(row('mnemonic').words24, { representationBits: 264, entropyBits: 256 });
  assert.equal(row('seed').words12.representationBits, 512);
  assert.equal(row('seed').words12.entropyBits, 128);
  assert.equal(row('privateKey').words24.representationBits, 256);
  assert.equal(row('publicKey').words12.representationBits, 512);
  assert.equal(row('publicKey').compressedBits, 257);
  assert.equal(row('address').words12.entropyBits, 128);
  assert.equal(row('address').words24.entropyBits, 160);
  assert.equal(row('checksummedAddress').words24.entropyBits, 160);
  for (const r of ledger.rows) assert.ok(typeof r.justification === 'string' && r.justification.length > 20);

  const k = ledger.invalidKey;
  assert.equal(BigInt(k.numerator), 2n ** 256n - N);
  assert.equal(BigInt(k.numerator), 0x14551231950b75fc4402da1732fc9bebfn, '2^256 − n in hexadecimal');
  assert.match(k.probability, /^3\.7344\d+e-39$/);
  near(k.log2, -127.65, 0.01);
  near(k.probabilityFloat, Number(2n ** 256n - N) / 2 ** 256, 1e-50);
});

/* ------------------------------------------------------------------------ */
/* BIP-39 index helpers                                                      */
/* ------------------------------------------------------------------------ */

test('index helpers agree with the BIP-39 module', () => {
  const rnd = createRandom(5);
  for (const bytes of [16, 32]) {
    for (let i = 0; i < 20; i += 1) {
      const entropy = rnd.bytes(bytes);
      const indices = entropyToIndices(entropy);
      assert.deepEqual(indices, mnemonicBreakdown(entropyToMnemonic(entropy)).indices);
      assert.equal(indicesChecksumValid(indices), true);
      const mangled = indices.slice();
      mangled[3] = (mangled[3] + 1 + rnd.int(2047)) % 2048;
      assert.equal(indicesChecksumValid(mangled), validateMnemonic(mangled.map((w) => BIP39_ENGLISH[w]).join(' ')));
    }
  }
});

test('W3 exact fact: 127 (12 words) and 7 (24 words) of the 2047 last-word substitutions are valid', () => {
  const rnd = createRandom(77);
  const fixed = [
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'test test test test test test test test test test test junk',
    'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote',
  ];
  for (const m of fixed) assert.ok(validateMnemonic(m), m);
  assert.equal(countValidLastWordSubstitutions(fixed[0]), 127);
  assert.equal(countValidLastWordSubstitutions(fixed[1]), 127);
  assert.equal(countValidLastWordSubstitutions(fixed[2]), 7);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(countValidLastWordSubstitutions(entropyToIndices(rnd.bytes(16))), 127);
    assert.equal(countValidLastWordSubstitutions(entropyToIndices(rnd.bytes(32))), 7);
  }
});

/* ------------------------------------------------------------------------ */
/* W2–W4                                                                     */
/* ------------------------------------------------------------------------ */

test('W2 checksum acceptance of uniformly random word sequences', () => {
  const r12 = checksumAcceptance({ seed: 3, n: 4000, words: 12 });
  assert.equal(r12.expectedRate, 1 / 16);
  assert.equal(r12.n, 4000);
  assert.ok(r12.valid > 150 && r12.valid < 360, `valid = ${r12.valid}`);
  assert.ok(r12.interval.low < r12.rate && r12.rate < r12.interval.high);
  inUnit(r12.p);
  const r24 = checksumAcceptance({ seed: 3, n: 4000, words: 24 });
  assert.equal(r24.expectedRate, 1 / 256);
  assert.ok(r24.valid < 45);
  assert.deepEqual(checksumAcceptance({ seed: 9, n: 300, words: 12 }), checksumAcceptance({ seed: 9, n: 300, words: 12 }));
  assert.throws(() => checksumAcceptance({ seed: 1, n: 10, words: 13 }));
});

test('W3 single-word substitution detection', () => {
  const r = substitutionDetection({ seed: 4, n: 3000, words: 12 });
  near(r.overall.expectedRate, (11 / 12) / 16 + (1 / 12) * (127 / 2047), 1e-15);
  assert.equal(r.positions.length, 12);
  assert.equal(r.positions.reduce((a, p) => a + p.trials, 0), 3000);
  assert.equal(r.positions.reduce((a, p) => a + p.undetected, 0), r.overall.undetected);
  assert.equal(r.positions[11].expectedRate, 127 / 2047);
  assert.equal(r.positions[0].expectedRate, 1 / 16);
  assert.ok(r.overall.rate > 0.03 && r.overall.rate < 0.1, `rate = ${r.overall.rate}`);
  inUnit(r.overall.p);
  inUnit(r.lastWord.p);
  const r24 = substitutionDetection({ seed: 4, n: 500, words: 24 });
  near(r24.overall.expectedRate, (23 / 24) / 256 + (1 / 24) * (7 / 2047), 1e-15);
  assert.equal(r24.positions[23].expectedRate, 7 / 2047);
  assert.deepEqual(substitutionDetection({ seed: 8, n: 200, words: 12 }), substitutionDetection({ seed: 8, n: 200, words: 12 }));
});

test('W4 word-index uniformity', () => {
  const r = wordIndexUniformity({ seed: 6, n: 1000 });
  assert.equal(r.pooled.counts.length, 2048);
  assert.equal(r.lastWord.counts.length, 2048);
  assert.equal(r.pooled.counts.reduce((a, b) => a + b, 0), 11 * 1000);
  assert.equal(r.lastWord.counts.reduce((a, b) => a + b, 0), 1000);
  assert.equal(r.pooled.df, 2047);
  assert.equal(r.lastWord.df, 2047);
  inUnit(r.pooled.p);
  inUnit(r.lastWord.p);
  assert.ok(r.pooled.statistic > 1700 && r.pooled.statistic < 2400, `chi2 = ${r.pooled.statistic}`);
  assert.ok(wordIndexUniformity({}).n >= 2048 * 5, 'default n gives ≥ 5 expected per cell for the last word');
});

/* ------------------------------------------------------------------------ */
/* W5 + W6                                                                   */
/* ------------------------------------------------------------------------ */

test('W5/W6 pipeline sample: shapes, progress and determinism', () => {
  const calls = [];
  const r = pipelineSample({ seed: 2, n: 4, onProgress: (done, total) => calls.push([done, total]) });
  assert.equal(r.n, 4);
  assert.deepEqual(calls.at(-1), [4, 4]);
  const bits = { seed: 512, privateKey: 256, publicKeyX: 256, address: 160 };
  for (const [stage, nbits] of Object.entries(bits)) {
    const s = r.stages[stage];
    assert.equal(s.bits, nbits);
    for (const stat of ['weight', 'avalanche']) {
      assert.equal(s[stat].counts.length, nbits + 1, `${stage}.${stat}`);
      assert.equal(s[stat].counts.reduce((a, b) => a + b, 0), 4);
      assert.equal(s[stat].expectedMean, nbits / 2);
      assert.ok(Math.abs(s[stat].mean - nbits / 2) < nbits / 4);
    }
  }
  assert.ok(r.stages.privateKey.sibling && r.stages.address.sibling);
  assert.equal(r.stages.seed.sibling, undefined);
  assert.equal(r.addressBits.counts.length, 160);
  assert.equal(r.addressBits.z.length, 160);
  assert.equal(r.addresses.length, 4);
  assert.ok(r.addresses.every((a) => /^0x[0-9a-f]{40}$/.test(a)));
  assert.deepEqual(pipelineSample({ seed: 2, n: 2 }).addresses, r.addresses.slice(0, 2));
});

/* ------------------------------------------------------------------------ */
/* W8                                                                        */
/* ------------------------------------------------------------------------ */

test('W8 vanity search: trials are geometric with mean 16^k', () => {
  const r = vanitySearch({ seed: 12, searches: 40, prefixNibbles: 1 });
  assert.equal(r.trials.length, 40);
  assert.equal(r.expectedMean, 16);
  assert.ok(r.trials.every((t) => Number.isInteger(t) && t >= 1));
  assert.ok(r.mean > 5 && r.mean < 40, `mean = ${r.mean}`);
  assert.equal(r.histogram.reduce((a, b) => a + b.observed, 0), 40);
  near(r.histogram.reduce((a, b) => a + b.expected, 0), 40, 1e-9);
  assert.ok(r.addressesGenerated >= r.trials.reduce((a, b) => a + b, 0));
  const lz = r.leadingZeros;
  assert.equal(lz.counts.reduce((a, b) => a + b, 0), r.trials.reduce((a, b) => a + b, 0));
  // Every search ends on its first address with at least k leading zero nibbles.
  assert.equal(lz.counts.slice(1).reduce((a, b) => a + b, 0), 40);
  near(lz.reference[0], 15 / 16, 1e-15);
  near(lz.reference[1], 15 / 256, 1e-15);
  assert.deepEqual(vanitySearch({ seed: 12, searches: 5, prefixNibbles: 1 }).trials, r.trials.slice(0, 5));
});

/* ------------------------------------------------------------------------ */
/* W9 + W10                                                                  */
/* ------------------------------------------------------------------------ */

test('W9 address case statistics', () => {
  const real = pipelineSample({ seed: 2, n: 3 }).addresses;
  const r = addressCase({ seed: 13, n: 2000, realAddresses: real });
  assert.equal(r.random.letters.counts.length, 41);
  assert.equal(r.random.upper.counts.length, 41);
  near(r.random.letters.expectedMean, 40 * (6 / 16), 1e-12);
  near(r.random.upper.expectedMean, 40 * (3 / 16), 1e-12);
  near(r.random.letters.mean, 15, 0.6);
  near(r.random.upper.mean, 7.5, 0.6);
  inUnit(r.random.letters.p);
  inUnit(r.random.upper.p);
  assert.equal(r.real.n, 3);
  assert.equal(addressCase({ seed: 13, n: 10 }).real, null);
});

test('W10 exact EIP-55 probabilities', () => {
  assert.equal(EIP55_ACCEPT_PROBABILITY, (13 / 16) ** 40);
  assert.equal((EIP55_ACCEPT_PROBABILITY * 100).toFixed(4), '0.0247');
  assert.equal(EIP55_NO_LETTER_PROBABILITY, (10 / 16) ** 40);
  // E[2^−L] with L ~ Bin(40, 6/16), summed term by term.
  let e = 0;
  let c = 1;
  for (let l = 0; l <= 40; l += 1) {
    e += c * (6 / 16) ** l * (10 / 16) ** (40 - l) * 2 ** -l;
    c = (c * (40 - l)) / (l + 1);
  }
  near(e, EIP55_ACCEPT_PROBABILITY, 1e-18);
});

test('W10 a case-only typo on one letter is always detected', () => {
  const rnd = createRandom(21);
  const addresses = Array.from({ length: 5 }, () => `0x${Buffer.from(rnd.bytes(20)).toString('hex')}`);
  const r = caseFlipDetection(addresses);
  assert.ok(r.lettersTested > 40);
  assert.equal(r.detected, r.lettersTested);
});

test('W10 Monte Carlo error detection', () => {
  const r = checksumErrorDetection({ seed: 14, n: 3000 });
  assert.equal(r.exact.acceptProbability, EIP55_ACCEPT_PROBABILITY);
  assert.equal(r.randomCase.n, 3000);
  assert.ok(r.randomCase.accepted <= 6);
  near(r.randomCase.raoBlackwell.estimate, EIP55_ACCEPT_PROBABILITY, 3e-4);
  assert.equal(r.substitution.n, 3000);
  assert.ok(r.substitution.accepted <= 6);
  inUnit(r.randomCase.p);
  inUnit(r.substitution.p);
  assert.equal(r.caseFlip.detected, r.caseFlip.lettersTested);
  assert.deepEqual(checksumErrorDetection({ seed: 3, n: 50 }), checksumErrorDetection({ seed: 3, n: 50 }));
});

test('W10 the fast acceptance check agrees with isValidChecksumAddress', async () => {
  const { randomCaseAccepted } = await import('../src/lib/wallet-study.js');
  const rnd = createRandom(31);
  for (let i = 0; i < 200; i += 1) {
    const digits = Buffer.from(rnd.bytes(20)).toString('hex');
    const cased = [...digits].map((c) => (c >= 'a' && rnd.int(2) ? c.toUpperCase() : c)).join('');
    assert.equal(randomCaseAccepted(cased), isValidChecksumAddress(`0x${cased}`));
  }
});

/* ------------------------------------------------------------------------ */
/* W11                                                                       */
/* ------------------------------------------------------------------------ */

test('W11 brute-force and collision scale', () => {
  const r = bruteForceScale({ addressesPerSecond: 100 });
  const s32 = r.searchSpaces.find((s) => s.bits === 32);
  assert.equal(s32.exhaustTrials, 2 ** 32);
  assert.equal(s32.expectedTrials, 2 ** 31);
  near(s32.exhaustSeconds, 2 ** 32 / 100, 1e-6);
  near(s32.exhaustYears, 2 ** 32 / 100 / (365.25 * 86400), 1e-9);
  assert.deepEqual(r.searchSpaces.map((s) => s.bits), [32, 128, 256]);
  assert.deepEqual(r.collisions.map((c) => c.m), [1e6, 1e9, 1e12]);
  for (const c of r.collisions) {
    near(c.probability / ((c.m * (c.m - 1)) / 2 ** 161), 1, 1e-6);
  }
  near(r.rho.log2Additions, 127.8, 0.05);
  near(r.rho.log2Additions, 0.5 * 256 + Math.log2(Math.sqrt(Math.PI / 4)), 1e-9);
});

test('W10 the fast EIP-55 encoder agrees with toChecksumAddress', async () => {
  const { checksumDigits } = await import('../src/lib/wallet-study.js');
  const { toChecksumAddress } = await import('../src/lib/ethereum.js');
  const rnd = createRandom(32);
  for (let i = 0; i < 100; i += 1) {
    const digits = Buffer.from(rnd.bytes(20)).toString('hex');
    assert.equal(checksumDigits(digits), toChecksumAddress(`0x${digits}`).slice(2));
  }
});

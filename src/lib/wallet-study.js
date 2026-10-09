/**
 * The statistical experiments of homework 02: properties of the Ethereum
 * wallet pipeline entropy → BIP-39 mnemonic → seed → BIP-32/BIP-44 key →
 * secp256k1 public key → Keccak-256 address → EIP-55 checksummed address.
 *
 * Every experiment is a pure function of its options ({ seed, n, … }) and
 * returns plain, JSON-serialisable data: counts, histograms, the reference
 * law and a test statistic with its p-value. The same code produces the
 * static figures at build time and the re-sampled ones in a browser worker.
 *
 * Null hypothesis throughout: the hash functions and key derivations behave
 * as random functions (the random-oracle idealisation), so their outputs on
 * distinct inputs are independent uniform bit strings. Where a probability is
 * exact rather than modelled, the comment proves it.
 *
 * Simulation only: the entropy is drawn from the seeded statistical
 * generator of random.js so that every figure is reproducible from its seed.
 * A real wallet must draw its entropy from a cryptographically secure
 * generator (crypto.getRandomValues or the operating system); a seeded or
 * 32-bit generator is exactly the flaw of the Milk Sad and Profanity cases.
 */

import { sha256 } from './sha256.js';
import { keccak256 } from './keccak.js';
import { mnemonicBreakdown, entropyToMnemonic } from './bip39.js';
import { ckdPriv } from './bip32.js';
import { deriveEthereumAccount, toChecksumAddress, isValidChecksumAddress } from './ethereum.js';
import { G, N, mul, decompress, encodeUncompressed, toJacobian, jacobianAddAffine, batchInverse, P } from './secp256k1.js';
import { createRandom } from './random.js';
import { bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, flipBit, hammingDistance, hammingWeight, utf8Bytes } from './bytes.js';
import {
  Z_95,
  binnedBinomialChiSquare,
  binomialPmfTable,
  binomialTestTwoSided,
  chiSquareGoodnessOfFit,
  chiSquareSf,
  collisionProbability,
  expectedCollidingPairs,
  geometricCdf,
  monobitFromCounts,
  wilsonInterval,
  zScore,
} from './stats.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* Mean and sample standard deviation of a variable given its histogram of counts. */
function momentsOfCounts(counts) {
  const total = sum(counts);
  let mean = 0;
  counts.forEach((c, k) => (mean += k * c));
  mean /= total;
  let ss = 0;
  counts.forEach((c, k) => (ss += c * (k - mean) ** 2));
  return { mean, sd: total > 1 ? Math.sqrt(ss / (total - 1)) : 0 };
}

/* Histogram of a Bin(bits, p) variable with its reference pmf and binned chi-square test. */
function binomialSummary(counts, bits, p) {
  const { mean, sd } = momentsOfCounts(counts);
  const fit = binnedBinomialChiSquare(counts, bits, p);
  return {
    counts,
    pmf: binomialPmfTable(bits, p),
    mean,
    sd,
    expectedMean: bits * p,
    expectedSd: Math.sqrt(bits * p * (1 - p)),
    statistic: fit.statistic,
    df: fit.df,
    p: fit.p,
    bins: fit.bins,
  };
}

/* A count of k successes in n Bernoulli trials against a theoretical rate. */
function proportionSummary(k, n, expectedRate) {
  return {
    trials: n,
    count: k,
    rate: k / n,
    expectedRate,
    expectedCount: n * expectedRate,
    interval: wilsonInterval(k, n),
    p: binomialTestTwoSided(k, n, expectedRate),
  };
}

/* ------------------------------------------------------------------------ */
/* BIP-39 on word indices                                                    */
/* ------------------------------------------------------------------------ */

const MNEMONIC_LENGTHS = Object.freeze([12, 15, 18, 21, 24]);

function checkWordCount(words) {
  if (!MNEMONIC_LENGTHS.includes(words)) throw new Error(`a mnemonic has ${MNEMONIC_LENGTHS.join(', ')} words, not ${words}`);
}

/**
 * The 11-bit word indices of the mnemonic of an entropy (BIP-39): the ENT
 * entropy bits followed by the CS = ENT / 32 first bits of SHA-256(entropy),
 * cut into groups of 11, most significant bit first. Equivalent to
 * entropyToMnemonic without the strings, for fast simulation.
 * @param {Uint8Array} entropy 16 to 32 bytes, a multiple of 4
 * @returns {number[]}
 */
export function entropyToIndices(entropy) {
  const ent = entropy.length * 8;
  const cs = ent / 32;
  const checksum = sha256(entropy)[0] >> (8 - cs);
  const bit = (i) => (i < ent ? (entropy[i >> 3] >> (7 - (i & 7))) & 1 : (checksum >> (cs - 1 - (i - ent))) & 1);
  const indices = [];
  for (let start = 0; start < ent + cs; start += 11) {
    let w = 0;
    for (let b = 0; b < 11; b += 1) w = (w << 1) | bit(start + b);
    indices.push(w);
  }
  return indices;
}

/**
 * True when the word indices carry a valid BIP-39 checksum. CS ≤ 8, so the
 * checksum is the low CS bits of the last index and must equal the first CS
 * bits of SHA-256 of the entropy bits that precede it.
 * @param {number[]} indices 12, 15, 18, 21 or 24 integers in [0, 2048)
 */
export function indicesChecksumValid(indices) {
  checkWordCount(indices.length);
  const cs = indices.length / 3;
  const entropy = new Uint8Array((indices.length * 11 - cs) / 8);
  let pos = 0;
  for (const w of indices) {
    for (let b = 10; b >= 0; b -= 1) {
      if (pos < entropy.length * 8 && (w >> b) & 1) entropy[pos >> 3] |= 0x80 >> (pos & 7);
      pos += 1;
    }
  }
  const carried = indices.at(-1) & ((1 << cs) - 1);
  return carried === sha256(entropy)[0] >> (8 - cs);
}

/**
 * The number of the 2047 other words that keep a mnemonic valid when they
 * replace its last word.
 *
 * Exact value 2^(11 − CS) − 1 for a valid mnemonic (127 for 12 words, 7 for
 * 24). Proof: the last word is 11 bits, the final 11 − CS entropy bits
 * followed by the CS checksum bits. The other words fix the remaining entropy
 * bits. For each of the 2^(11 − CS) values of the free entropy bits, the
 * entropy is fully determined, hence so is its checksum, and exactly one of
 * the 2^CS checksum completions is valid. So exactly 2^(11 − CS) last words
 * are valid; one of them is the original, which leaves 2^(11 − CS) − 1
 * valid substitutes, independently of the values taken by SHA-256.
 * @param {string | number[]} mnemonic a mnemonic sentence or its word indices
 */
export function countValidLastWordSubstitutions(mnemonic) {
  const indices = typeof mnemonic === 'string' ? mnemonicBreakdown(mnemonic).indices : mnemonic.slice();
  const original = indices.at(-1);
  let valid = 0;
  for (let w = 0; w < 2048; w += 1) {
    if (w === original) continue;
    indices[indices.length - 1] = w;
    if (indicesChecksumValid(indices)) valid += 1;
  }
  return valid;
}

/* ------------------------------------------------------------------------ */
/* W1 entropy ledger                                                         */
/* ------------------------------------------------------------------------ */

/* num / den in scientific notation, truncated to `digits` significant digits. */
function ratioToScientific(num, den, digits = 20) {
  let exponent = Math.floor(Math.log10(Number(num) / Number(den)));
  for (;;) {
    const shift = digits - 1 - exponent;
    const q = shift >= 0 ? (num * 10n ** BigInt(shift)) / den : num / (den * 10n ** BigInt(-shift));
    const text = q.toString();
    if (text.length > digits) exponent += 1;
    else if (text.length < digits) exponent -= 1;
    else return `${text[0]}.${text.slice(1)}e${exponent}`;
  }
}

/* log2 of a positive BigInt, from its 53 leading bits. */
function log2BigInt(x) {
  const length = x.toString(2).length;
  if (length <= 53) return Math.log2(Number(x));
  return length - 1 + Math.log2(Number(x >> BigInt(length - 53)) / 2 ** 52);
}

/**
 * W1. Representation size and maximum entropy (bits) of every stage, for 12-
 * and 24-word mnemonics with an empty passphrase. Deterministic functions
 * cannot create entropy, H(f(X)) ≤ H(X), so the entropy fixed at generation
 * is an upper bound for every later stage, and the representation size is a
 * second one. Also the probability that a BIP-32 derivation yields IL ≥ n.
 */
export function entropyLedger() {
  const stage = (name, operationClass, operation, r12, h12, r24, h24, justification, extra = {}) => ({
    stage: name,
    operationClass,
    operation,
    words12: { representationBits: r12, entropyBits: h12 },
    words24: { representationBits: r24, entropyBits: h24 },
    ...extra,
    justification,
  });
  const rows = [
    stage('entropy', 'key generation', 'CSPRNG draw of ENT bits', 128, 128, 256, 256,
      'ENT uniform bits drawn by the wallet: every later stage is a function of them, so this is the entropy of the whole pipeline.'),
    stage('mnemonic', 'checksum, encoding', 'BIP-39: CS = ENT/32 bits of SHA-256, 11-bit word indices', 132, 128, 264, 256,
      'ENT + CS bits; the CS checksum bits are a function of the entropy, so they add length but no entropy.'),
    stage('seed', 'key derivation', 'BIP-39: PBKDF2-HMAC-SHA512, 2048 iterations', 512, 128, 512, 256,
      'A deterministic function of mnemonic and passphrase: at most ENT + H(passphrase) bits, here ENT (empty passphrase), not 512.'),
    stage('privateKey', 'key derivation', "BIP-32 CKD along BIP-44 m/44'/60'/0'/0/0", 256, 128, 256, 256,
      'A function of the seed with values in [1, n − 1]: at most min(H(seed), log2(n − 1)) bits, and log2(n − 1) < 256 by about 5.4e-39.'),
    stage('publicKey', 'public-key cryptography', 'secp256k1: K = k·G, encoded as x ‖ y', 512, 128, 512, 256,
      'k ↦ k·G is a bijection, so H(K) = H(k); x ‖ y takes 512 bits but y is fixed by x up to its sign, so 257 bits (the compressed form) suffice.',
      { compressedBits: 257 }),
    stage('address', 'hashing', 'Keccak-256 of x ‖ y, last 20 bytes', 160, 128, 160, 160,
      'Truncation to 160 bits caps the entropy at min(H(K), 160): a 24-word wallet keeps at most 160 of its 256 bits; a 12-word one loses only a negligible amount to collisions.'),
    stage('checksummedAddress', 'checksum, encoding', 'EIP-55: letter case from Keccak-256 of the lower-case hex', 160, 128, 160, 160,
      'The case pattern is a function of the address, so it adds error detection but no entropy: still 160 bits of information in 40 characters.',
      { characters: 40 }),
  ];
  const numerator = 2n ** 256n - N;
  return {
    rows,
    invalidKey: {
      numerator: numerator.toString(),
      denominator: '2^256',
      probability: ratioToScientific(numerator, 2n ** 256n, 20),
      probabilityFloat: Number(numerator) / 2 ** 256,
      log2: log2BigInt(numerator) - 256,
      note: 'P(IL ≥ n) for a uniform 256-bit IL; the master key is also rejected when IL = 0 (one more value in 2^256).',
    },
  };
}

/* ------------------------------------------------------------------------ */
/* W2 checksum acceptance                                                    */
/* ------------------------------------------------------------------------ */

/**
 * W2. n sequences of `words` words drawn uniformly from the 2048-word list;
 * the fraction with a valid checksum. Given the first ENT bits, exactly one of
 * the 2^CS checksum values of the last word is valid, so the rate is exactly
 * 2^−CS = 2^−(words/3): 1/16 for 12 words, 1/256 for 24.
 */
export function checksumAcceptance({ seed = 2039, n = 100000, words = 12 } = {}) {
  checkWordCount(words);
  const rnd = createRandom(seed);
  const indices = new Array(words);
  let valid = 0;
  for (let i = 0; i < n; i += 1) {
    for (let w = 0; w < words; w += 1) indices[w] = rnd.int(2048);
    if (indicesChecksumValid(indices)) valid += 1;
  }
  const s = proportionSummary(valid, n, 2 ** -(words / 3));
  return { seed, n, words, valid, rate: s.rate, expectedRate: s.expectedRate, expectedValid: s.expectedCount, interval: s.interval, p: s.p };
}

/* ------------------------------------------------------------------------ */
/* W3 substitution detection                                                 */
/* ------------------------------------------------------------------------ */

/**
 * W3. n valid mnemonics (uniform entropy); one uniformly chosen word is
 * replaced by a uniformly chosen different word, and the result is checked.
 * A substitution at the last position is undetected with the exact
 * probability (2^(11 − CS) − 1) / 2047 (see countValidLastWordSubstitutions);
 * at any other position the entropy changes while the checksum stays, and in
 * the random-oracle model SHA-256 of the new entropy matches with
 * probability 2^−CS. Overall:
 *   ((words − 1) / words) · 2^−CS + (1 / words) · (2^(11 − CS) − 1) / 2047.
 */
export function substitutionDetection({ seed = 2040, n = 100000, words = 12 } = {}) {
  checkWordCount(words);
  const cs = words / 3;
  const rnd = createRandom(seed);
  const entropyBytes = (words * 4) / 3;
  const lastRate = (2 ** (11 - cs) - 1) / 2047;
  const otherRate = 2 ** -cs;
  const trials = new Array(words).fill(0);
  const undetected = new Array(words).fill(0);
  for (let i = 0; i < n; i += 1) {
    const indices = entropyToIndices(rnd.bytes(entropyBytes));
    const position = rnd.int(words);
    const draw = rnd.int(2047);
    indices[position] = draw >= indices[position] ? draw + 1 : draw;
    trials[position] += 1;
    if (indicesChecksumValid(indices)) undetected[position] += 1;
  }
  const positions = trials.map((t, i) => ({
    position: i + 1,
    trials: t,
    undetected: undetected[i],
    rate: t > 0 ? undetected[i] / t : null,
    expectedRate: i === words - 1 ? lastRate : otherRate,
  }));
  const total = sum(undetected);
  const expectedRate = ((words - 1) / words) * otherRate + (1 / words) * lastRate;
  const summary = (k, t, rate) => {
    if (t === 0) return { trials: 0, undetected: 0, rate: null, expectedRate: rate, interval: null, p: null };
    const s = proportionSummary(k, t, rate);
    return { trials: t, undetected: k, rate: s.rate, expectedRate: rate, interval: s.interval, p: s.p };
  };
  return {
    seed,
    n,
    words,
    checksumBits: cs,
    overall: summary(total, n, expectedRate),
    lastWord: summary(undetected[words - 1], trials[words - 1], lastRate),
    otherWords: summary(total - undetected[words - 1], n - trials[words - 1], otherRate),
    positions,
  };
}

/* ------------------------------------------------------------------------ */
/* W4 word-index uniformity                                                  */
/* ------------------------------------------------------------------------ */

/**
 * W4. Word indices of n 12-word mnemonics from uniform entropy, against the
 * uniform law on 2048 cells: (a) positions 1–11 pooled, which are pure
 * entropy bits; (b) the last word alone, 7 entropy bits followed by 4
 * checksum bits, uniform only if SHA-256 behaves as a random oracle. The
 * default n gives 12000 / 2048 ≈ 5.9 expected counts per cell in (b).
 */
export function wordIndexUniformity({ seed = 2041, n = 12000 } = {}) {
  const rnd = createRandom(seed);
  const pooled = new Array(2048).fill(0);
  const last = new Array(2048).fill(0);
  for (let i = 0; i < n; i += 1) {
    const indices = entropyToIndices(rnd.bytes(16));
    for (let w = 0; w < 11; w += 1) pooled[indices[w]] += 1;
    last[indices[11]] += 1;
  }
  const fit = (counts) => {
    const expected = sum(counts) / 2048;
    const g = chiSquareGoodnessOfFit(counts, new Array(2048).fill(expected));
    return { counts, expectedPerCell: expected, statistic: g.statistic, df: g.df, p: g.p };
  };
  return { seed, n, pooled: fit(pooled), lastWord: fit(last) };
}

/* ------------------------------------------------------------------------ */
/* W5 + W6 the whole pipeline                                                */
/* ------------------------------------------------------------------------ */

/* Address bytes of a compressed public key: the last 20 bytes of Keccak-256(x ‖ y). */
function addressBytesOfCompressed(publicKey) {
  return keccak256(encodeUncompressed(decompress(publicKey)).subarray(1)).subarray(12);
}

/**
 * W5 and W6. For n uniformly random 128-bit entropies, the full pipeline at
 * m/44'/60'/0'/0/0 with an empty passphrase, plus two twins:
 *   A — the same pipeline after flipping one uniformly chosen entropy bit;
 *   B — the sibling account m/44'/60'/0'/0/1 of the original.
 * Per stage (seed 512 bits, private key 256, public-key x 256, address 160):
 * the Hamming weight of the original (uniformity), the Hamming distance to
 * twin A (avalanche) and, for the private key and the address, the distance
 * to twin B (independence of sibling keys). Under H0 each is Bin(bits, ½).
 * Also the number of ones at each of the 160 address bit positions (bit 0 is
 * the most significant bit of the first hex digit), each Bin(n, ½).
 * About 30 ms per sample; onProgress(done, n) is called after every sample.
 * @param {{ seed?: number, n?: number, onProgress?: (done: number, total: number) => void }} options
 */
export function pipelineSample({ seed = 2042, n = 1500, onProgress } = {}) {
  const rnd = createRandom(seed);
  const stageBits = { seed: 512, privateKey: 256, publicKeyX: 256, address: 160 };
  const histogram = (bits) => new Array(bits + 1).fill(0);
  const acc = Object.fromEntries(
    Object.entries(stageBits).map(([name, bits]) => [name, { weight: histogram(bits), avalanche: histogram(bits), sibling: histogram(bits) }]),
  );
  const bitOnes = new Array(160).fill(0);
  const addresses = [];
  const stagesOf = (account) => ({
    seed: account.seed,
    privateKey: account.privateKey,
    publicKeyX: account.publicKey.subarray(1, 33),
    address: account.keccakDigest.subarray(12),
  });
  for (let i = 0; i < n; i += 1) {
    const entropy = rnd.bytes(16);
    const flipped = flipBit(entropy, rnd.int(128));
    const original = deriveEthereumAccount(entropyToMnemonic(entropy));
    const twinA = deriveEthereumAccount(entropyToMnemonic(flipped));
    const sibling = ckdPriv(original.chain.at(-2).node, 1);
    const twinB = { privateKey: sibling.privateKey, address: addressBytesOfCompressed(sibling.publicKey) };
    const o = stagesOf(original);
    const a = stagesOf(twinA);
    for (const name of Object.keys(stageBits)) {
      acc[name].weight[hammingWeight(o[name])] += 1;
      acc[name].avalanche[hammingDistance(o[name], a[name])] += 1;
      if (name in twinB) acc[name].sibling[hammingDistance(o[name], twinB[name])] += 1;
    }
    for (let j = 0; j < 160; j += 1) bitOnes[j] += (o.address[j >> 3] >> (7 - (j & 7))) & 1;
    addresses.push(original.address);
    if (onProgress) onProgress(i + 1, n);
  }
  const stages = {};
  for (const [name, bits] of Object.entries(stageBits)) {
    stages[name] = {
      bits,
      weight: binomialSummary(acc[name].weight, bits, 0.5),
      avalanche: binomialSummary(acc[name].avalanche, bits, 0.5),
    };
    if (name === 'privateKey' || name === 'address') stages[name].sibling = binomialSummary(acc[name].sibling, bits, 0.5);
  }
  const z = bitOnes.map((c) => zScore(c, n, 0.5));
  const statistic = sum(z.map((v) => v * v));
  return {
    seed,
    n,
    path: "m/44'/60'/0'/0/0",
    siblingPath: "m/44'/60'/0'/0/1",
    stages,
    addressBits: {
      counts: bitOnes,
      z,
      statistic,
      df: 160,
      p: chiSquareSf(statistic, 160),
      monobitP: monobitFromCounts(sum(bitOnes), 160 * n),
      maxAbsZ: Math.max(...z.map(Math.abs)),
    },
    addresses,
  };
}

/* ------------------------------------------------------------------------ */
/* W8 vanity search                                                          */
/* ------------------------------------------------------------------------ */

/* Number of leading zero hex digits of a 20-byte address. */
function leadingZeroNibbles(address) {
  let count = 0;
  for (const byte of address) {
    if (byte === 0) count += 2;
    else return count + (byte < 16 ? 1 : 0);
  }
  return count;
}

/* Address bytes of an affine point. */
function addressOfPoint(point) {
  return keccak256(concatBytes(bigIntToBytes(point.x, 32), bigIntToBytes(point.y, 32))).subarray(12);
}

/* The affine points Q + G, Q + 2G, …, Q + count·G, with one batched inversion. */
function nextPoints(point, count) {
  const jacobians = [];
  let j = toJacobian(point);
  for (let i = 0; i < count; i += 1) {
    j = jacobianAddAffine(j, G);
    if (j.Z === 0n) throw new Error('reached the point at infinity');
    jacobians.push(j);
  }
  const zInverses = batchInverse(jacobians.map((q) => q.Z));
  return jacobians.map((q, i) => {
    const zInv2 = (zInverses[i] * zInverses[i]) % P;
    return { x: (q.X * zInv2) % P, y: (q.Y * zInv2 * zInverses[i]) % P };
  });
}

/* Bins of trial counts at the quantiles of Geometric(p), with their expected counts. */
function geometricHistogram(trials, p, binCount) {
  const edges = [];
  for (let b = 1; b < binCount; b += 1) {
    const t = Math.max(1, Math.ceil(Math.log1p(-b / binCount) / Math.log1p(-p)));
    if (t > (edges.at(-1) ?? 0)) edges.push(t);
  }
  const total = trials.length;
  const bins = [];
  let from = 1;
  for (const to of [...edges, null]) {
    const upper = to ?? Number.POSITIVE_INFINITY;
    const probability = (to === null ? 1 : geometricCdf(to, p)) - geometricCdf(from - 1, p);
    bins.push({ from, to, observed: trials.filter((t) => t >= from && t <= upper).length, expected: total * probability, probability });
    from = (to ?? 0) + 1;
  }
  return bins;
}

/*
 * Chi-square test of leading-zero counts that respects the stopping rule. A
 * search stops at its first address with L ≥ k, so the number of such
 * addresses equals the number of searches and is not random. Given which
 * trials stopped a search, the L values are still independent: those of
 * non-final trials follow the law of L given L < k, those of final trials the
 * law of L given L ≥ k, which by memorylessness is k + Geometric(15/16) on
 * {0, 1, …}. The two conditional fits are added (df = sum of their df).
 */
function leadingZeroTest(counts, k) {
  const reference = (j) => (15 / 16) * 16 ** -j;
  const groups = [];
  const nonFinal = counts.slice(0, k);
  const nonFinalTotal = sum(nonFinal);
  if (k > 1 && nonFinalTotal > 0) {
    const mass = 1 - 16 ** -k;
    groups.push({ observed: nonFinal, expected: nonFinal.map((_, j) => (nonFinalTotal * reference(j)) / mass) });
  }
  const finals = counts.slice(k);
  const finalTotal = sum(finals);
  const observed = [];
  const expected = [];
  let rest = finalTotal;
  for (let j = 0; j < finals.length; j += 1) {
    const e = finalTotal * reference(j);
    if (e < 5 || rest - e < 5) break;
    observed.push(finals[j]);
    expected.push(e);
    rest -= e;
  }
  observed.push(finalTotal - sum(observed));
  expected.push(rest);
  if (observed.length > 1) groups.push({ observed, expected });
  let statistic = 0;
  let df = 0;
  for (const g of groups) {
    const fit = chiSquareGoodnessOfFit(g.observed, g.expected);
    statistic += fit.statistic;
    df += fit.df;
  }
  return { statistic, df, p: df > 0 ? chiSquareSf(statistic, df) : Number.NaN, groups };
}

/**
 * W8. A vanity-address search: from a uniformly random private key d, the
 * keys d, d + 1, d + 2, … are tried (the public key advances by one point
 * addition of G) until the lower-case address starts with k zero hex digits.
 * In the random-oracle model every address is an independent uniform string,
 * so the number of trials is Geometric(p = 16^−k) on {1, 2, …} with mean 16^k.
 * Also the number L of leading zero nibbles of every address generated,
 * P(L = j) = (15/16)(1/16)^j (see leadingZeroTest for the stopping rule).
 */
export function vanitySearch({ seed = 2044, prefixNibbles = 1, searches = prefixNibbles === 1 ? 2000 : 300 } = {}) {
  if (!Number.isInteger(prefixNibbles) || prefixNibbles < 1 || prefixNibbles > 3) throw new Error('prefixNibbles must be 1, 2 or 3');
  const rnd = createRandom(seed);
  const p = 16 ** -prefixNibbles;
  const batch = Math.min(64, 16 ** prefixNibbles);
  const trials = [];
  const lz = new Array(41).fill(0);
  for (let s = 0; s < searches; s += 1) {
    const d = (bytesToBigInt(rnd.bytes(32)) % (N - 1n)) + 1n;
    let candidates = [mul(G, d)];
    let count = 0;
    for (let found = false; !found; ) {
      for (const point of candidates) {
        count += 1;
        const leading = leadingZeroNibbles(addressOfPoint(point));
        lz[leading] += 1;
        if (leading >= prefixNibbles) {
          found = true;
          break;
        }
      }
      if (!found) candidates = nextPoints(candidates.at(-1), batch);
    }
    trials.push(count);
  }
  const lastNonZero = lz.findLastIndex((c) => c > 0);
  const counts = lz.slice(0, Math.max(prefixNibbles + 3, lastNonZero + 1));
  const totalTrials = sum(trials);
  const reference = counts.map((_, j) => (15 / 16) * 16 ** -j);
  const histogram = geometricHistogram(trials, p, Math.max(2, Math.min(20, Math.floor(searches / 10))));
  const fit = chiSquareGoodnessOfFit(histogram.map((b) => b.observed), histogram.map((b) => b.expected));
  const mean = totalTrials / searches;
  const sd = Math.sqrt(trials.reduce((a, t) => a + (t - mean) ** 2, 0) / Math.max(1, searches - 1));
  const half = (Z_95 * sd) / Math.sqrt(searches);
  return {
    seed,
    searches,
    prefixNibbles,
    successProbability: p,
    trials,
    addressesGenerated: totalTrials,
    histogram,
    statistic: fit.statistic,
    df: fit.df,
    p: fit.p,
    mean,
    sd,
    interval: { low: mean - half, high: mean + half },
    expectedMean: 1 / p,
    expectedSd: Math.sqrt(1 - p) / p,
    leadingZeros: {
      counts,
      reference,
      expectedCounts: reference.map((r) => totalTrials * r),
      test: leadingZeroTest(counts, prefixNibbles),
    },
  };
}

/* ------------------------------------------------------------------------ */
/* W9 + W10 EIP-55                                                           */
/* ------------------------------------------------------------------------ */

/** P(a uniformly random case pattern passes EIP-55) = E[2^−L], L ~ Bin(40, 6/16): (1 − 6/16 + 3/16)^40 = (13/16)^40. */
export const EIP55_ACCEPT_PROBABILITY = (13 / 16) ** 40;

/** P(an address has no letter a–f, so EIP-55 checks nothing) = (10/16)^40. */
export const EIP55_NO_LETTER_PROBABILITY = (10 / 16) ** 40;

const isHexLetter = (c) => (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

/* The 40 nibbles of Keccak-256 of the lower-case hex digits, which set the EIP-55 case. */
function caseNibbles(lowerDigits) {
  const digest = keccak256(utf8Bytes(lowerDigits));
  const nibbles = new Uint8Array(40);
  for (let i = 0; i < 40; i += 1) nibbles[i] = i & 1 ? digest[i >> 1] & 15 : digest[i >> 1] >> 4;
  return nibbles;
}

/**
 * True when the case of the 40 hex digits (without "0x") matches EIP-55,
 * i.e. isValidChecksumAddress("0x" + digits), without building strings.
 */
export function randomCaseAccepted(digits) {
  const nibbles = caseNibbles(digits.toLowerCase());
  for (let i = 0; i < 40; i += 1) {
    const c = digits[i];
    if (isHexLetter(c) && (c <= 'F') !== nibbles[i] >= 8) return false;
  }
  return true;
}

/** The EIP-55 form of 40 lower-case hex digits (without "0x"), as toChecksumAddress without the prefix. */
export function checksumDigits(lowerDigits) {
  const nibbles = caseNibbles(lowerDigits);
  let out = '';
  for (let i = 0; i < 40; i += 1) {
    const c = lowerDigits[i];
    out += c >= 'a' && nibbles[i] >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/* Letter count L and upper-case count U of the EIP-55 form of lower-case digits. */
function letterAndUpperCounts(digits) {
  const nibbles = caseNibbles(digits);
  let letters = 0;
  let upper = 0;
  for (let i = 0; i < 40; i += 1) {
    if (digits[i] >= 'a') {
      letters += 1;
      if (nibbles[i] >= 8) upper += 1;
    }
  }
  return { letters, upper };
}

function caseStatistics(addressDigits) {
  const letters = new Array(41).fill(0);
  const upper = new Array(41).fill(0);
  for (const digits of addressDigits) {
    const c = letterAndUpperCounts(digits);
    letters[c.letters] += 1;
    upper[c.upper] += 1;
  }
  return { n: addressDigits.length, letters: binomialSummary(letters, 40, 6 / 16), upper: binomialSummary(upper, 40, 3 / 16) };
}

/**
 * W9. Letter statistics of addresses: L, the number of letters a–f among the
 * 40 hex digits, is Bin(40, 6/16) for a uniform address; U, the number of
 * upper-case letters after EIP-55, is Bin(40, 3/16), since a digit is an
 * upper-case letter when it is a letter (6/16) and its hash nibble is ≥ 8 (½).
 * Computed on n uniform 20-byte strings and, when given, on real addresses
 * (for instance those of pipelineSample).
 */
export function addressCase({ seed = 2045, n = 20000, realAddresses = null } = {}) {
  const rnd = createRandom(seed);
  const random = Array.from({ length: n }, () => bytesToHex(rnd.bytes(20)));
  const real = realAddresses ? realAddresses.map((a) => a.replace(/^0x/, '').toLowerCase()) : null;
  return { seed, n, random: caseStatistics(random), real: real ? caseStatistics(real) : null };
}

/**
 * Case-only typos: flipping the case of one letter of a checksummed address
 * is always detected, because the expected case pattern depends only on the
 * lower-case address, which the flip does not change.
 * @param {string[]} addresses
 */
export function caseFlipDetection(addresses) {
  let lettersTested = 0;
  let detected = 0;
  for (const address of addresses) {
    const checksummed = toChecksumAddress(address);
    for (let i = 2; i < 42; i += 1) {
      const c = checksummed[i];
      if (!isHexLetter(c)) continue;
      const flipped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
      lettersTested += 1;
      if (!isValidChecksumAddress(checksummed.slice(0, i) + flipped + checksummed.slice(i + 1))) detected += 1;
    }
  }
  return { addresses: addresses.length, lettersTested, detected };
}

function acceptanceSummary(accepted, n, weights) {
  const s = proportionSummary(accepted, n, EIP55_ACCEPT_PROBABILITY);
  const estimate = sum(weights) / n;
  const sd = Math.sqrt(weights.reduce((a, w) => a + (w - estimate) ** 2, 0) / (n - 1));
  return {
    n,
    accepted,
    rate: s.rate,
    expectedRate: EIP55_ACCEPT_PROBABILITY,
    expectedAccepted: s.expectedCount,
    interval: s.interval,
    p: s.p,
    raoBlackwell: { estimate, se: sd / Math.sqrt(n) },
  };
}

/**
 * W10. EIP-55 error detection.
 *   (a) Random case: a uniform address with a uniformly random case for each
 *       letter passes with probability E[2^−L] = (13/16)^40 ≈ 0.0247 %. The
 *       Rao–Blackwellised estimate averages 2^−L, the conditional acceptance
 *       probability given the letter count, which has a smaller variance
 *       than the 0/1 outcomes.
 *   (b) Single-character substitution: one uniformly chosen digit of a
 *       checksummed address becomes a different hex digit (a letter in either
 *       case with probability ½). The new lower-case address has an
 *       independent hash, so each of its letters matches with probability ½;
 *       its letter count is again Bin(40, 6/16) (the new digit is uniform on
 *       16 values), and the acceptance probability is again (13/16)^40.
 *   (c) Case-only typos are always detected (caseFlipDetection).
 */
export function checksumErrorDetection({ seed = 2046, n = 200000, caseFlipAddresses = 20 } = {}) {
  const rnd = createRandom(seed);
  let acceptedA = 0;
  const weightsA = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const digits = bytesToHex(rnd.bytes(20));
    let cased = '';
    let letters = 0;
    for (const c of digits) {
      if (c >= 'a') {
        letters += 1;
        cased += rnd.int(2) ? c.toUpperCase() : c;
      } else cased += c;
    }
    weightsA[i] = 2 ** -letters;
    if (randomCaseAccepted(cased)) acceptedA += 1;
  }
  let acceptedB = 0;
  const weightsB = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const checksummed = checksumDigits(bytesToHex(rnd.bytes(20)));
    const position = rnd.int(40);
    const old = parseInt(checksummed[position], 16);
    const draw = rnd.int(15);
    let c = (draw >= old ? draw + 1 : draw).toString(16);
    if (c >= 'a' && rnd.int(2)) c = c.toUpperCase();
    const typo = checksummed.slice(0, position) + c + checksummed.slice(position + 1);
    let letters = 0;
    for (const ch of typo) if (isHexLetter(ch)) letters += 1;
    weightsB[i] = 2 ** -letters;
    if (randomCaseAccepted(typo)) acceptedB += 1;
  }
  const flipAddresses = Array.from({ length: caseFlipAddresses }, () => `0x${bytesToHex(rnd.bytes(20))}`);
  return {
    seed,
    n,
    exact: {
      acceptProbability: EIP55_ACCEPT_PROBABILITY,
      acceptPercent: 100 * EIP55_ACCEPT_PROBABILITY,
      noLetterProbability: EIP55_NO_LETTER_PROBABILITY,
    },
    randomCase: acceptanceSummary(acceptedA, n, weightsA),
    substitution: acceptanceSummary(acceptedB, n, weightsB),
    caseFlip: caseFlipDetection(flipAddresses),
  };
}

/* ------------------------------------------------------------------------ */
/* W11 brute-force scale                                                     */
/* ------------------------------------------------------------------------ */

const SECONDS_PER_YEAR = 365.25 * 86400;

/**
 * W11. Orders of magnitude, analytic. Exhausting a space of 2^b equally
 * likely secrets takes 2^b trials, finding a given one 2^(b − 1) on average;
 * 2^32 is the seed space of the Milk Sad (Libbitcoin bx) and Profanity
 * generators, 2^128 a 12-word mnemonic, 2^256 a 24-word one. Times follow
 * from a measured pipeline rate. The collision probability of m uniform
 * 160-bit addresses is ≈ 1 − exp(−m(m − 1)/2^161), and Pollard's rho needs
 * about sqrt(πn/4) ≈ 0.886·sqrt(n) group operations on secp256k1.
 * @param {{ addressesPerSecond?: number | null }} options measured mnemonic-to-address rate
 */
export function bruteForceScale({ addressesPerSecond = null } = {}) {
  const rate = addressesPerSecond;
  const timing = (trials) =>
    rate ? { seconds: trials / rate, years: trials / rate / SECONDS_PER_YEAR } : { seconds: null, years: null };
  const searchSpaces = [
    { bits: 32, label: '32-bit generator seed (Milk Sad, Profanity)' },
    { bits: 128, label: '12-word mnemonic (128-bit entropy)' },
    { bits: 256, label: '24-word mnemonic (256-bit entropy)' },
  ].map(({ bits, label }) => {
    const exhaust = timing(2 ** bits);
    const expected = timing(2 ** (bits - 1));
    return {
      bits,
      label,
      exhaustTrials: 2 ** bits,
      expectedTrials: 2 ** (bits - 1),
      exhaustSeconds: exhaust.seconds,
      exhaustYears: exhaust.years,
      expectedSeconds: expected.seconds,
      expectedYears: expected.years,
    };
  });
  const collisions = [1e6, 1e9, 1e12].map((m) => ({
    m,
    probability: collisionProbability(m, 2 ** 160),
    expectedPairs: expectedCollidingPairs(m, 160),
  }));
  const log2Order = log2BigInt(N);
  const coefficient = Math.sqrt(Math.PI / 4);
  return {
    addressesPerSecond: rate,
    secondsPerYear: SECONDS_PER_YEAR,
    searchSpaces,
    collisions,
    rho: {
      coefficient,
      log2Order,
      log2Additions: Math.log2(coefficient) + log2Order / 2,
    },
  };
}

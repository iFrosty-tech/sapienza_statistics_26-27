/**
 * The pure parts of the interactive panels of homework 03: input parsing,
 * view models of the Caesar strip, the ECC trace and the key ranking, the
 * expected costs of the attacks, the browser language model, and the job the
 * key-recovery worker runs (src/hw03/attack-job.js), exercised end to end on
 * small keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt as caesarEncrypt } from '../src/lib/caesar.js';
import { createRandom } from '../src/lib/random.js';
import { encrypt as eccEncrypt, encryptTrace, generateKeyPair } from '../src/lib/toy-ecc-encryption.js';
import {
  KEY_RECOVERY_BITS,
  SAMPLE_SENTENCES,
  bitDifference,
  cipherStripOffset,
  alphabetStripOffset,
  eccEncryptionSteps,
  evidenceNote,
  expectedOperations,
  formatDuration,
  formatRate,
  formulaHtml,
  indexOfCoincidence,
  nearestCongruent,
  parseCaesarKey,
  parseRate,
  progressView,
  rankingView,
  shiftedCounts,
  tamperCiphertext,
  wrongKey,
  xorRows,
} from '../src/hw03/demo-model.js';
import { METHODS, models, recoverWith } from '../src/data/hw03/browser-model.js';
import { JOB_KINDS, runJob, validateJob } from '../src/hw03/attack-job.js';

/** A deterministic byte source for reproducible key pairs. */
const seeded = (seed) => {
  const rng = createRandom(seed);
  return { bytes: (n) => Uint8Array.from({ length: n }, () => rng.int(256)) };
};

const MESSAGE = 'MEET ME AT THE OLD BRIDGE AT TEN';

/* ------------------------------------------------------------- Caesar */

test('parseCaesarKey accepts the whole numbers 0 to 25 and names the fix otherwise', () => {
  assert.deepEqual(parseCaesarKey(' 3 '), { ok: true, key: 3 });
  assert.deepEqual(parseCaesarKey('0'), { ok: true, key: 0 });
  assert.deepEqual(parseCaesarKey('25'), { ok: true, key: 25 });
  for (const bad of ['', '26', '-1', '2.5', 'three']) {
    const r = parseCaesarKey(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.message, /0 to 25/);
  }
});

test('shiftedCounts: the ciphertext counts are the plaintext counts rotated by the key', () => {
  const { plain, cipher, letters, max } = shiftedCounts(MESSAGE, 3);
  assert.equal(letters, 25);
  assert.equal(max, Math.max(...plain));
  for (let i = 0; i < 26; i += 1) assert.equal(cipher[(i + 3) % 26], plain[i]);
  assert.equal(plain[4], 6); // six Es
  assert.equal(cipher[7], 6); // which become six Hs
});

test('indexOfCoincidence is invariant under the shift and undefined below two letters', () => {
  const { plain, cipher } = shiftedCounts(MESSAGE, 11);
  assert.equal(indexOfCoincidence(plain), indexOfCoincidence(cipher));
  assert.equal(indexOfCoincidence([2, ...new Array(25).fill(0)]), 1);
  assert.equal(indexOfCoincidence([1, ...new Array(25).fill(0)]), null);
});

test('the sliding strips are offset so that each cell shows the right letter or count', () => {
  // Under the plaintext letter i the cipher alphabet shows (i + k) mod 26.
  assert.equal(alphabetStripOffset(3), 3);
  assert.equal(alphabetStripOffset(0), 0);
  // Ciphertext cell j shows plaintext count (j − k) mod 26 from a strip of plaintext counts.
  assert.equal(cipherStripOffset(3), 23);
  assert.equal(cipherStripOffset(0), 0);
  // The animation moves to the congruent position closest to where the strip is.
  assert.equal(nearestCongruent(25, 0), 26);
  assert.equal(nearestCongruent(1, 25), -1);
  assert.equal(nearestCongruent(30, 5), 31);
  assert.equal(nearestCongruent(13, 13), 13);
});

/* ---------------------------------------------------------------- ECC */

test('eccEncryptionSteps lists r, R, S, every keystream block, c and the tag, consistently with the ciphertext', () => {
  const pair = generateKeyPair({ bits: 20, random: seeded(1) });
  const message = 'x'.repeat(40); // 40 bytes: two keystream blocks, the second truncated to 8 bytes
  const trace = encryptTrace(message, pair.publicKey, { random: seeded(2) });
  const steps = eccEncryptionSteps(trace);
  assert.deepEqual(
    steps.map((s) => s.id),
    ['r', 'R', 'S', 'keystream', 'c', 'tag'],
  );
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId.r.value, trace.ephemeral.toString(16).padStart(64, '0'));
  assert.equal(byId.R.value, trace.ciphertext.R);
  assert.match(byId.S.value, /^0[23][0-9a-f]{64}$/);
  assert.equal(byId.keystream.blocks.length, 2);
  assert.deepEqual(byId.keystream.blocks.map((b) => b.counter), [0, 1]);
  assert.equal(byId.keystream.blocks[0].hex.length, 64);
  assert.equal(byId.keystream.blocks[1].hex.length, 16);
  assert.equal(byId.c.value, trace.ciphertext.c);
  assert.equal(byId.tag.value, trace.ciphertext.tag);
});

test('xorRows: each ciphertext byte is the message byte xor the keystream byte', () => {
  const pair = generateKeyPair({ bits: 20, random: seeded(3) });
  const trace = encryptTrace(MESSAGE, pair.publicKey, { random: seeded(4) });
  const rows = xorRows(new TextEncoder().encode(MESSAGE), trace.keystream, trace.cipherBytes, 8);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[0].char, 'M');
  assert.equal(rows[0].m, '4d');
  for (const r of rows) assert.equal(parseInt(r.c, 16), parseInt(r.m, 16) ^ parseInt(r.k, 16));
  assert.equal(rows[4].char, '␠'); // a space is shown as a visible symbol
});

test('wrongKey always differs from k and stays in the restricted range; tamperCiphertext flips one bit of c', () => {
  assert.equal(wrongKey(5n, 20), 6n);
  assert.equal(wrongKey(2n ** 20n, 20), 2n ** 20n - 1n);
  const pair = generateKeyPair({ bits: 20, random: seeded(5) });
  const ct = eccEncrypt(MESSAGE, pair.publicKey, { random: seeded(6) });
  const t = tamperCiphertext(ct);
  assert.notEqual(t.c, ct.c);
  assert.equal(t.R, ct.R);
  assert.equal(t.tag, ct.tag);
  assert.equal(bitDifference(t.c, ct.c), 1);
});

test('bitDifference counts the differing bits of two hex strings of equal length', () => {
  assert.equal(bitDifference('00ff', '00ff'), 0);
  assert.equal(bitDifference('00', 'ff'), 8);
  assert.equal(bitDifference('0f0f', 'f0f1'), 15);
});

/* ------------------------------------------------------ cryptanalysis */

test('the browser model recovers the key of the worked message under every method', () => {
  assert.deepEqual(METHODS, ['chi-square', 'log-likelihood', 'bigram', 'trigram', 'exhaustive']);
  assert.equal(models.frequencies.length, 26);
  const ciphertext = caesarEncrypt(MESSAGE, 3);
  for (const method of METHODS) assert.equal(recoverWith(method, ciphertext).key, 3, method);
});

test('rankingView orders by mid-rank, scales the best score to 1 and flags the best and the true key', () => {
  const ciphertext = caesarEncrypt(MESSAGE, 7);
  const view = rankingView(recoverWith('chi-square', ciphertext), { trueKey: 7 });
  assert.equal(view.rows.length, 26);
  assert.equal(view.bestKey, 7);
  assert.equal(view.trueRank, 1);
  const best = view.rows.find((r) => r.key === 7);
  assert.equal(best.isBest, true);
  assert.equal(best.isTrue, true);
  assert.equal(best.share, 1);
  assert.ok(view.rows.every((r) => r.share >= 0 && r.share <= 1));
  assert.deepEqual(view.byKey.map((r) => r.key), Array.from({ length: 26 }, (_, i) => i));
  assert.equal(Math.min(...view.rows.map((r) => r.share)), 0);
});

test('rankingView: an uninformative ciphertext ties every key at mid-rank 13.5', () => {
  const view = rankingView(recoverWith('trigram', 'Ab'), { trueKey: null });
  assert.equal(view.informative, false);
  assert.ok(view.rows.every((r) => r.rank === 13.5 && r.share === 0 && !r.isBest));
  assert.equal(view.bestKey, null);
  assert.equal(view.trueRank, null);
});

test('evidenceNote warns about missing letters, ties and short ciphertexts, and is silent otherwise', () => {
  assert.match(evidenceNote({ letters: 0, informative: false, method: 'chi-square' }), /no letters/i);
  assert.match(evidenceNote({ letters: 2, informative: false, method: 'trigram' }), /every key/i);
  assert.match(evidenceNote({ letters: 6, informative: true, method: 'bigram' }), /6 letters/);
  assert.equal(evidenceNote({ letters: 40, informative: true, method: 'bigram' }), null);
});

test('the built-in samples are attributed public-domain sentences, distinct from the held-out novel', () => {
  assert.ok(SAMPLE_SENTENCES.length >= 6);
  for (const s of SAMPLE_SENTENCES) {
    assert.ok(s.text.length > 10 && s.source.length > 5);
    assert.doesNotMatch(s.source, /Dorian Gray|Wilde/);
  }
});

/* ------------------------------------------------------- key recovery */

test('expectedOperations: brute force about 2^(b−1), baby-step giant-step 1.5·2^(b/2), kangaroo 9·2^(b/2) as measured', () => {
  assert.equal(expectedOperations('brute-force', 16).value, (2 ** 16 - 1) / 2);
  assert.equal(expectedOperations('bsgs', 16).value, 256 - 1 + 128);
  assert.equal(expectedOperations('kangaroo', 16).value, 9 * 256);
  for (const m of ['brute-force', 'bsgs', 'kangaroo']) assert.match(expectedOperations(m, 16).formula, /2/);
  assert.equal(formulaHtml('(2^b − 1)/2 ≈ 2^(b−1)'), '(2<sup>b</sup> − 1)/2 ≈ 2<sup>b−1</sup>');
});

test('progressView turns solver progress into operations and the share of the key space excluded', () => {
  assert.deepEqual(progressView('brute-force', 16, 4096, 65536), { operations: 4096, fraction: 4096 / 65536 });
  assert.deepEqual(progressView('bsgs', 16, 64, 256), { operations: 255 + 64, fraction: 64 / 256 });
  assert.deepEqual(progressView('kangaroo', 16, 3000, 65536), { operations: 3000, fraction: null });
});

test('formatting: durations, rates and printed rates', () => {
  assert.equal(formatDuration(0.4), '0.4 ms');
  assert.equal(formatDuration(120), '120 ms');
  assert.equal(formatDuration(2345), '2.35 s');
  assert.equal(formatDuration(75_000), '1 min 15 s');
  assert.equal(formatDuration(5_400_000), '1 h 30 min');
  assert.equal(formatRate(245712, 1000), '245,712 op/s');
  assert.equal(formatRate(10, 0), '—');
  assert.equal(parseRate('245,712'), 245712);
  assert.equal(parseRate('—'), null);
});

test('validateJob rejects malformed jobs with a reason', () => {
  assert.deepEqual(JOB_KINDS, ['key', 'ephemeral']);
  const pair = generateKeyPair({ bits: 12, random: seeded(7) });
  const ciphertext = eccEncrypt(MESSAGE, pair.publicKey, { random: seeded(8) });
  const ok = { kind: 'key', method: 'bsgs', bits: 12, publicKey: pair.publicKeyHex, ciphertext };
  assert.deepEqual(validateJob(ok), { ok: true });
  assert.equal(validateJob({ ...ok, method: 'rho' }).ok, false);
  assert.equal(validateJob({ ...ok, bits: KEY_RECOVERY_BITS.max + 1 }).ok, false);
  assert.equal(validateJob({ ...ok, kind: 'other' }).ok, false);
  assert.equal(validateJob({ ...ok, publicKey: 'zz' }).ok, false);
});

test('runJob recovers a 12-bit private key with each method and decrypts the message', () => {
  const pair = generateKeyPair({ bits: 12, random: seeded(9) });
  const ciphertext = eccEncrypt(MESSAGE, pair.publicKey, { random: seeded(10) });
  for (const method of ['brute-force', 'bsgs', 'kangaroo']) {
    const reports = [];
    const r = runJob({ kind: 'key', method, bits: 12, publicKey: pair.publicKeyHex, ciphertext }, (p) => reports.push(p), {
      now: () => 0,
      every: 0,
    });
    assert.equal(r.found, true, method);
    assert.equal(r.k, pair.privateKey.toString(), method);
    assert.equal(r.message, MESSAGE, method);
    assert.ok(r.operations > 0);
    assert.ok(reports.every((p) => p.operations >= 0));
  }
});

test('runJob recovers a restricted ephemeral scalar although the private key is full size', () => {
  const pair = generateKeyPair({ bits: 254, random: seeded(11) });
  const trace = encryptTrace(MESSAGE, pair.publicKey, { ephemeralBits: 12, random: seeded(12) });
  const r = runJob(
    { kind: 'ephemeral', method: 'bsgs', bits: 12, publicKey: pair.publicKeyHex, ciphertext: trace.ciphertext },
    () => {},
  );
  assert.equal(r.found, true);
  assert.equal(r.k, trace.ephemeral.toString());
  assert.equal(r.message, MESSAGE);
});

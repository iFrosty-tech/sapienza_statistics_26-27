/**
 * The Caesar study of src/lib/caesar-study.js on the committed corpus of
 * src/data/hw03/: determinism for a seed, the behaviour of the success rate
 * with the ciphertext length, the tie rule, and the statistical comparison of
 * the two schemes (a Caesar shift permutes the letter histogram and keeps its
 * index of coincidence; the toy EC ciphertext bytes look uniform). Sample sizes
 * are small so that the file runs in a few seconds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRandom } from '../src/lib/random.js';
import {
  METHODS,
  assess,
  compareStatistics,
  drawWindow,
  indexOfCoincidence,
  letterPositions,
  repeatedEncryption,
  runCaesarStudy,
  smallestLength,
} from '../src/lib/caesar-study.js';

const stats = JSON.parse(readFileSync(new URL('../src/data/hw03/training-stats.json', import.meta.url), 'utf8'));
const text = readFileSync(new URL('../src/data/hw03/heldout.txt', import.meta.url), 'utf8').trim();

const small = (seed = 7) => runCaesarStudy({ text, stats, lengths: [1, 5, 20, 500], windows: 60, seed });

test('the study is deterministic for a seed and changes with it', () => {
  const a = small(7);
  const b = small(7);
  const c = small(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(
    a.methods['chi-square'].points.map((p) => p.successes),
    c.methods['chi-square'].points.map((p) => p.successes),
  );
});

test('every method recovers every key of 500-letter ciphertexts and improves with length', () => {
  const s = small();
  for (const m of METHODS) {
    const pts = s.methods[m].points;
    assert.equal(pts.at(-1).rate, 1, `${m} at L = 500`);
    assert.equal(pts.at(-1).meanRank, 1);
    assert.ok(pts[1].rate <= pts.at(-1).rate && pts[0].rate < 0.35, `${m} at L = 1 is near chance`);
    for (const p of pts) assert.ok(p.low <= p.rate && p.rate <= p.high);
  }
  assert.equal(s.baseline, 1 / 26);
});

test('a window holds exactly L letters and starts and ends on a letter', () => {
  const positions = letterPositions(text);
  const random = createRandom(3);
  for (const L of [1, 7, 120]) {
    const w = drawWindow(text, positions, L, random);
    assert.equal(w.replace(/[^A-Z]/g, '').length, L);
    assert.match(w, /^[A-Z].*[A-Z]$|^[A-Z]$/);
  }
});

test('ties at the top are broken at random and ranked at their mid-rank', () => {
  const ranking = Array.from({ length: 26 }, (_, key) => ({ key, score: 0 }));
  const result = { better: 'higher', ranking };
  const random = createRandom(11);
  let wins = 0;
  for (let i = 0; i < 2600; i += 1) {
    const a = assess(result, 5, random);
    assert.equal(a.rank, 13.5);
    assert.equal(a.margin, 0);
    if (a.success) wins += 1;
  }
  assert.ok(wins > 60 && wins < 145, `about 100 of 2600 wins, got ${wins}`);
  const clear = assess({ better: 'lower', ranking: ranking.map((e) => ({ ...e, score: e.key === 5 ? 1 : 9 })) }, 5, random);
  assert.deepEqual([clear.success, clear.rank, clear.margin], [true, 1, 8]);
});

test('smallestLength requires the threshold at every longer length', () => {
  const pts = [0.5, 0.96, 0.9, 0.97, 1].map((rate, i) => ({ L: i + 1, rate }));
  assert.equal(smallestLength(pts, 0.95), 4);
  assert.equal(smallestLength(pts, 1.01), null);
});

test('the Caesar ciphertext is a cyclic shift of the plaintext histogram with the same index of coincidence', () => {
  const c = compareStatistics({ text, stats, chars: 5000, seed: 5 });
  assert.ok(c.isShift);
  assert.equal(c.ic.caesarLetters, c.ic.plainLetters);
  assert.ok(c.ic.plainLetters > 0.06 && c.ic.plainLetters < 0.072, `English IC, got ${c.ic.plainLetters}`);
  assert.ok(Math.abs(c.tests.caesarVsShiftedEnglish.statistic - c.tests.plainVsEnglish.statistic) < 1e-6);
  // The toy EC bytes: an index of coincidence near 1/256 and no evidence against uniformity.
  assert.ok(Math.abs(c.ic.eccBytes - 1 / 256) < 0.0006, `got ${c.ic.eccBytes}`);
  assert.ok(c.tests.eccBytesVsUniform256.p > 0.001);
  assert.ok(c.tests.plainBytesVsUniform256.p < 1e-10);
});

test('the index of coincidence is the probability of drawing two equal symbols', () => {
  assert.equal(indexOfCoincidence([2, 0, 0]), 1);
  assert.equal(indexOfCoincidence([1, 1, 1]), 0);
  assert.equal(indexOfCoincidence([2, 2]), 1 / 3);
});

test('repeated encryption: Caesar is deterministic, the toy EC scheme randomised, both decrypt', () => {
  const r = repeatedEncryption({ seed: 9 });
  assert.ok(r.caesar.equal);
  assert.equal(r.caesar.decrypted, r.message);
  assert.ok(!r.ecc.equal);
  assert.notEqual(r.ecc.first.R, r.ecc.second.R);
  assert.equal(r.ecc.decryptedFirst, r.message);
  assert.equal(r.ecc.decryptedSecond, r.message);
  assert.ok(r.ecc.differingBits > 0.3 * r.ecc.totalBits && r.ecc.differingBits < 0.7 * r.ecc.totalBits);
});

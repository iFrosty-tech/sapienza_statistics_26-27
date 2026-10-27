import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NORMALIZATIONS,
  berryEsseenBound,
  chebyshevBound,
  dkwRadius,
  empiricalExceedance,
  exactExceedance,
  exactKolmogorovDistance,
  exactScoreLaw,
  hoeffdingBound,
  incrementLaw,
  kolmogorovDistance,
  normalizeScores,
  probabilityAnyAttackerReaches,
  sampleMoments,
  scoreMoments,
  simulateScores,
  simulateTrajectories,
  standardNormalCdf,
} from '../src/lib/penetration.js';
import { binomialPmf } from '../src/lib/stats.js';

const close = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('incrementLaw gives the moments of the Bernoulli and Rademacher increments', () => {
  const b = incrementLaw('bernoulli', { p: 0.3 });
  assert.equal(b.low, 0);
  assert.equal(b.high, 1);
  assert.equal(b.q, 0.3);
  close(b.mean, 0.3, 1e-15);
  close(b.variance, 0.21, 1e-15);
  close(b.absThird, 0.3 * 0.7 * (0.3 ** 2 + 0.7 ** 2), 1e-15);

  const r = incrementLaw('rademacher');
  assert.equal(r.low, -1);
  assert.equal(r.high, 1);
  assert.equal(r.q, 0.5);
  assert.equal(r.mean, 0);
  assert.equal(r.variance, 1);
  assert.equal(r.absThird, 1);
});

test('incrementLaw rejects an unknown model and a degenerate p', () => {
  assert.throws(() => incrementLaw('poisson'), RangeError);
  assert.throws(() => incrementLaw('bernoulli', { p: 0 }), RangeError);
  assert.throws(() => incrementLaw('bernoulli', { p: 1 }), RangeError);
  assert.throws(() => incrementLaw('bernoulli'), RangeError);
});

test('scoreMoments scales the variance as n, 1/n and 1 under the three normalisations', () => {
  const law = incrementLaw('bernoulli', { p: 0.2 });
  for (const n of [1, 10, 400]) {
    const m = scoreMoments(law, n);
    close(m.total.mean, n * 0.2, 1e-12);
    close(m.total.variance, n * 0.16, 1e-12);
    close(m.average.mean, 0.2, 1e-12);
    close(m.average.variance, 0.16 / n, 1e-12);
    close(m.normalized.mean, 0.2 * Math.sqrt(n), 1e-12);
    close(m.normalized.variance, 0.16, 1e-12);
  }
  assert.deepEqual(Object.keys(NORMALIZATIONS), ['total', 'average', 'normalized']);
  assert.deepEqual(
    Object.values(NORMALIZATIONS).map((x) => x.exponent),
    [0, 1, 0.5],
  );
});

test('simulateScores is reproducible from its seed and keeps the first attackers when m grows', () => {
  const law = incrementLaw('bernoulli', { p: 0.4 });
  const a = simulateScores({ law, checkpoints: [5, 50], m: 30, seed: 11 });
  const b = simulateScores({ law, checkpoints: [5, 50], m: 30, seed: 11 });
  const c = simulateScores({ law, checkpoints: [5, 50], m: 60, seed: 11 });
  const d = simulateScores({ law, checkpoints: [5, 50], m: 30, seed: 12 });
  assert.deepEqual(a.checkpoints, [5, 50]);
  assert.equal(a.scores.length, 2);
  assert.ok(a.scores[0] instanceof Int32Array);
  assert.equal(a.scores[1].length, 30);
  assert.deepEqual([...a.scores[1]], [...b.scores[1]]);
  assert.deepEqual([...c.scores[1].subarray(0, 30)], [...a.scores[1]]);
  assert.notDeepEqual([...d.scores[1]], [...a.scores[1]]);
});

test('simulateTrajectories passes through the scores of simulateScores at every checkpoint', () => {
  for (const law of [incrementLaw('bernoulli', { p: 0.25 }), incrementLaw('rademacher')]) {
    const n = 64;
    const paths = simulateTrajectories({ law, n, m: 12, seed: 5 });
    const { scores } = simulateScores({ law, checkpoints: [1, 17, n], m: 12, seed: 5 });
    assert.equal(paths.length, 12);
    for (let j = 0; j < 12; j += 1) {
      assert.equal(paths[j].length, n + 1);
      assert.equal(paths[j][0], 0);
      assert.equal(paths[j][1], scores[0][j]);
      assert.equal(paths[j][17], scores[1][j]);
      assert.equal(paths[j][n], scores[2][j]);
      for (let t = 1; t <= n; t += 1) {
        const step = paths[j][t] - paths[j][t - 1];
        assert.ok(step === law.low || step === law.high, `step ${step} outside {${law.low}, ${law.high}}`);
      }
    }
  }
});

test('simulated scores stay on the support of each model', () => {
  const n = 25;
  const bern = simulateScores({ law: incrementLaw('bernoulli', { p: 0.5 }), checkpoints: [n], m: 500, seed: 3 });
  for (const s of bern.scores[0]) assert.ok(s >= 0 && s <= n);
  const rad = simulateScores({ law: incrementLaw('rademacher'), checkpoints: [n], m: 500, seed: 3 });
  for (const s of rad.scores[0]) {
    assert.ok(Math.abs(s) <= n);
    assert.equal(Math.abs(s) % 2, n % 2, 'S_n has the parity of n in the Rademacher model');
  }
});

test('simulateScores rejects invalid checkpoints and a stream longer than the generator period', () => {
  const law = incrementLaw('rademacher');
  assert.throws(() => simulateScores({ law, checkpoints: [], m: 10, seed: 1 }), RangeError);
  assert.throws(() => simulateScores({ law, checkpoints: [10, 5], m: 10, seed: 1 }), RangeError);
  assert.throws(() => simulateScores({ law, checkpoints: [0], m: 10, seed: 1 }), RangeError);
  assert.throws(() => simulateScores({ law, checkpoints: [10], m: 0, seed: 1 }), RangeError);
  assert.throws(() => simulateScores({ law, checkpoints: [2 ** 17], m: 2 ** 16, seed: 1 }), RangeError);
});

test('the sample moments of a large simulation agree with the theory', () => {
  const law = incrementLaw('bernoulli', { p: 0.3 });
  const n = 100;
  const m = 20000;
  const { scores } = simulateScores({ law, checkpoints: [n], m, seed: 2026 });
  const { mean, variance } = sampleMoments(scores[0]);
  // Standard error of the mean is sqrt(21 / 20000) ≈ 0.032; of the variance ≈ 21·sqrt(2/m) ≈ 0.21.
  close(mean, 30, 0.15, 'mean of S_n');
  close(variance, 21, 1.0, 'variance of S_n');

  const avg = sampleMoments(normalizeScores(scores[0], n, 'average'));
  close(avg.mean, mean / n, 1e-12);
  close(avg.variance, variance / n ** 2, 1e-12);
  const norm = sampleMoments(normalizeScores(scores[0], n, 'normalized'));
  close(norm.variance, variance / n, 1e-12);
});

test('exactScoreLaw is the affine image of a binomial law', () => {
  const law = incrementLaw('rademacher');
  const n = 9;
  const exact = exactScoreLaw(law, n);
  assert.equal(exact.score.length, n + 1);
  assert.equal(exact.score[0], -n);
  assert.equal(exact.score[n], n);
  let total = 0;
  let mean = 0;
  let second = 0;
  for (let k = 0; k <= n; k += 1) {
    close(exact.prob[k], binomialPmf(n, k, 0.5), 1e-15);
    total += exact.prob[k];
    mean += exact.prob[k] * exact.score[k];
    second += exact.prob[k] * exact.score[k] ** 2;
  }
  close(total, 1, 1e-12);
  close(mean, 0, 1e-12);
  close(second - mean ** 2, n, 1e-12);
});

test('exactExceedance counts the boundary of |S_n/n − μ| ≥ ε', () => {
  const law = incrementLaw('bernoulli', { p: 0.5 });
  const n = 100;
  let expected = 0;
  for (let k = 0; k <= n; k += 1) if (k <= 45 || k >= 55) expected += binomialPmf(n, k, 0.5);
  close(exactExceedance(law, n, 0.05), expected, 1e-12);

  const rad = incrementLaw('rademacher');
  // S_n/n = 2K/n − 1, so |S_n/n| ≥ 0.1 is |K − 50| ≥ 5 for n = 100.
  close(exactExceedance(rad, n, 0.1), expected, 1e-12);
});

test('empiricalExceedance applies the same event to simulated scores', () => {
  const law = incrementLaw('bernoulli', { p: 0.5 });
  const scores = Int32Array.from([44, 45, 46, 50, 54, 55, 56, 60]);
  assert.equal(empiricalExceedance(scores, law, 100, 0.05), 5 / 8);
});

test('Chebyshev and Hoeffding bound the exact probability of a deviation', () => {
  for (const law of [incrementLaw('bernoulli', { p: 0.3 }), incrementLaw('rademacher')]) {
    for (const n of [10, 100, 1000]) {
      for (const eps of [0.02, 0.05, 0.1]) {
        const exact = exactExceedance(law, n, eps);
        assert.ok(exact <= chebyshevBound(law, n, eps) + 1e-12, `Chebyshev n=${n} ε=${eps}`);
        assert.ok(exact <= hoeffdingBound(law, n, eps) + 1e-12, `Hoeffding n=${n} ε=${eps}`);
      }
    }
  }
  const law = incrementLaw('rademacher');
  close(chebyshevBound(law, 100, 0.1), 1, 1e-12);
  close(chebyshevBound(law, 1000, 0.1), 0.1, 1e-12);
  close(hoeffdingBound(law, 1000, 0.1), 2 * Math.exp(-5), 1e-12);
});

test('standardNormalCdf agrees with tabulated values of Φ to rounding', () => {
  close(standardNormalCdf(0), 0.5, 0);
  close(standardNormalCdf(1), 0.8413447460685429, 1e-15);
  close(standardNormalCdf(-1.959963984540054), 0.025, 1e-15);
  close(standardNormalCdf(-3), 0.0013498980316300946, 1e-17);
});

test('kolmogorovDistance takes both one-sided limits at tied values', () => {
  close(kolmogorovDistance(Float64Array.from([0]), standardNormalCdf), 0.5, 1e-12);
  close(kolmogorovDistance(Float64Array.from([-1, 1]), standardNormalCdf), standardNormalCdf(1) - 0.5, 1e-9);
  close(kolmogorovDistance(Float64Array.from([1, -1, 1, -1]), standardNormalCdf), standardNormalCdf(1) - 0.5, 1e-9);
});

test('the exact distance of the standardised Rademacher sum to N(0,1) obeys Berry–Esseen', () => {
  const law = incrementLaw('rademacher');
  close(exactKolmogorovDistance(law, 1), standardNormalCdf(1) - 0.5, 1e-9);
  let previous = Infinity;
  for (const n of [1, 4, 16, 64, 256, 1024]) {
    const d = exactKolmogorovDistance(law, n);
    assert.ok(d <= berryEsseenBound(law, n), `Berry–Esseen at n=${n}`);
    assert.ok(d < previous, `distance decreases at n=${n}`);
    previous = d;
  }
  // For even n the largest gap is half the atom at 0, so sqrt(n)·D → 1/sqrt(2π).
  close(Math.sqrt(10000) * exactKolmogorovDistance(law, 10000), 1 / Math.sqrt(2 * Math.PI), 0.005);
  close(berryEsseenBound(law, 100), 0.04748, 1e-12);
});

test('dkwRadius is the half-width of the Dvoretzky–Kiefer–Wolfowitz band', () => {
  close(dkwRadius(10000), Math.sqrt(Math.log(40) / 20000), 1e-15);
  close(dkwRadius(100, 0.01), Math.sqrt(Math.log(200) / 200), 1e-15);
});

test('probabilityAnyAttackerReaches grows with the number of attackers', () => {
  const law = incrementLaw('bernoulli', { p: 0.1 });
  const n = 50;
  let single = 0;
  for (let k = 10; k <= n; k += 1) single += binomialPmf(n, k, 0.1);
  close(probabilityAnyAttackerReaches(law, n, 1, 10), single, 1e-12);
  close(probabilityAnyAttackerReaches(law, n, 20, 10), 1 - (1 - single) ** 20, 1e-12);
  assert.ok(probabilityAnyAttackerReaches(law, n, 100, 10) > probabilityAnyAttackerReaches(law, n, 20, 10));
});

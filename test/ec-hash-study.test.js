/**
 * The experiments of the homework: shapes, invariants and loose sanity bounds.
 * They are checked on SHA-256 (fast) and on the scalar variant of the toy
 * hash; the statistical conclusions themselves belong to the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HASHES,
  hashFunction,
  randomMessages,
  bitFrequency,
  byteFrequency,
  hammingWeights,
  avalanche,
  sacMatrix,
  birthdayCollisions,
  runsAndIndependence,
  smallCurvePoints,
  smallCurveOrderOf,
  smallCurveMul,
  smallCurveDiscreteLogBruteForce,
  smallCurveDiscreteLogBsgs,
  ecdlpCostGrowth,
} from '../src/lib/ec-hash-study.js';

const inUnit = (p, msg) => assert.ok(p >= 0 && p <= 1, `${msg}: p = ${p}`);

test('hash functions and message generation', () => {
  assert.deepEqual([...HASHES], ['scalar', 'pedersen', 'sha256']);
  const ms = randomMessages({ n: 5, seed: 1, length: 32 });
  assert.equal(ms.length, 5);
  assert.ok(ms.every((m) => m.length === 32));
  assert.deepEqual([...randomMessages({ n: 2, seed: 9 })[1]], [...randomMessages({ n: 2, seed: 9 })[1]]);
  for (const h of HASHES) assert.equal(hashFunction(h)(ms[0]).length, 32);
  assert.throws(() => hashFunction('md5'));
});

for (const variant of ['sha256', 'scalar']) {
  test(`E1 bit frequency (${variant})`, () => {
    const r = bitFrequency({ variant, n: 500, seed: 11 });
    assert.equal(r.counts.length, 256);
    assert.equal(r.z.length, 256);
    assert.equal(r.df, 256);
    inUnit(r.p, 'chi-square');
    inUnit(r.monobitP, 'monobit');
    assert.ok(r.maxAbsZ < 6, `max |z| = ${r.maxAbsZ}`);
    assert.ok(r.beyondTwoSigma <= 40);
    assert.equal(r.totalBits, 500 * 256);
    assert.ok(Math.abs(r.onesFraction - 0.5) < 0.02);
  });

  test(`E2 byte frequency (${variant})`, () => {
    const r = byteFrequency({ variant, n: 500, seed: 12 });
    assert.equal(r.counts.length, 256);
    assert.equal(r.counts.reduce((a, b) => a + b, 0), 500 * 32);
    assert.equal(r.df, 255);
    inUnit(r.p, 'chi-square');
    assert.ok(r.statistic > 150 && r.statistic < 400, `statistic ${r.statistic}`);
  });

  test(`E3 Hamming weights (${variant})`, () => {
    const r = hammingWeights({ variant, n: 500, seed: 13 });
    assert.equal(r.counts.length, 257);
    assert.equal(r.pmf.length, 257);
    assert.ok(r.mean > 120 && r.mean < 136, `mean ${r.mean}`);
    assert.ok(r.sd > 6 && r.sd < 10, `sd ${r.sd}`);
    inUnit(r.p, 'binned chi-square');
  });

  test(`E4 avalanche (${variant})`, () => {
    const r = avalanche({ variant, n: 500, seed: 14 });
    assert.equal(r.counts.length, 257);
    assert.equal(r.pairs, 500);
    assert.ok(r.mean > 120 && r.mean < 136, `mean ${r.mean}`);
    assert.ok(r.sd > 6 && r.sd < 10, `sd ${r.sd}`);
    assert.equal(r.unchanged, 0, 'a bit flip never leaves the digest unchanged');
    inUnit(r.p, 'binned chi-square');
  });

  test(`E5 strict avalanche matrix (${variant})`, () => {
    const r = sacMatrix({ variant, trials: 12, seed: 15, inputBits: 16 });
    assert.equal(r.inputBits, 16);
    assert.equal(r.outputBits, 256);
    assert.equal(r.flips.length, 16 * 256);
    assert.ok(r.flips.every((c) => c >= 0 && c <= 12));
    assert.ok(r.mean > 0.4 && r.mean < 0.6, `mean ${r.mean}`);
    assert.equal(r.rowMeans.length, 16);
    assert.equal(r.columnMeans.length, 256);
    inUnit(r.fractionBeyondTwoSigma, 'fraction');
  });

  test(`E6 birthday collisions (${variant})`, () => {
    const r = birthdayCollisions({ variant, n: 600, seed: 16, bits: [8, 12, 16], curveBits: 12, subsets: 50 });
    assert.equal(r.n, 600);
    assert.equal(r.truncations.length, 3);
    for (const t of r.truncations) {
      assert.ok(t.observedPairs >= 0);
      assert.ok(Math.abs(t.expectedPairs - (600 * 599) / 2 / 2 ** t.bits) < 1e-9);
      assert.ok(t.distinctValues <= Math.min(600, 2 ** t.bits));
    }
    const t8 = r.truncations[0];
    assert.ok(t8.observedPairs > 200 && t8.observedPairs < 1200, `8-bit collisions ${t8.observedPairs}`);
    assert.equal(r.curve.bits, 12);
    assert.ok(r.curve.points.length > 3);
    for (const pt of r.curve.points) {
      inUnit(pt.empirical, 'empirical');
      inUnit(pt.theory, 'theory');
      assert.ok(pt.m >= 1 && pt.m <= 600);
    }
    assert.equal(r.curve.points.at(-1).m, 600);
  });

  test(`E7 runs test and adjacent-bit independence (${variant})`, () => {
    const r = runsAndIndependence({ variant, n: 500, seed: 17 });
    assert.equal(r.runsPValues.length, 500);
    assert.equal(r.pValueHistogram.length, 10);
    assert.equal(r.pValueHistogram.reduce((a, b) => a + b, 0), r.applicable);
    assert.equal(r.expectedPValueHistogram.length, 10);
    assert.ok(Math.abs(r.expectedPValueHistogram.reduce((a, b) => a + b, 0) - r.applicable) < 1e-6);
    inUnit(r.uniformityP, 'fit of p-values to the exact law');
    assert.ok(r.proportionPassing > 0.95, `proportion ${r.proportionPassing}`);
    assert.ok(r.meanRuns > 120 && r.meanRuns < 136, `mean runs ${r.meanRuns}`);
    assert.deepEqual(Object.keys(r.adjacent.table).sort(), ['00', '01', '10', '11']);
    assert.equal(Object.values(r.adjacent.table).reduce((a, b) => a + b, 0), 500 * 255);
    inUnit(r.adjacent.p, 'adjacent chi-square');
    assert.ok(Math.abs(r.adjacent.lag1Correlation) < 0.05);
  });
}

test('E7 survives a sample with no applicable digest', () => {
  const r = runsAndIndependence({ variant: 'sha256', n: 1, seed: 3 });
  assert.equal(r.runsPValues.length, 1);
  assert.ok(Number.isNaN(r.uniformityP) || (r.uniformityP >= 0 && r.uniformityP <= 1));
});

test('E8 small curves: point enumeration agrees with brute force, logs are found', () => {
  const p = 103n; // 103 ≡ 3 (mod 4)
  const pts = smallCurvePoints(p);
  let brute = 0;
  for (let x = 0n; x < p; x += 1n) {
    for (let y = 0n; y < p; y += 1n) if ((y * y) % p === (x * x * x + 7n) % p) brute += 1;
  }
  assert.equal(pts.points.length, brute);
  assert.equal(pts.order, brute + 1, 'group order counts the point at infinity');
  assert.ok(pts.points.every(({ x, y }) => (y * y) % p === (x * x * x + 7n) % p));

  const base = pts.points[0];
  const order = smallCurveOrderOf(p, base);
  assert.ok(order > 1 && pts.order % order === 0, 'Lagrange: the order of a point divides the group order');
  assert.equal(smallCurveMul(p, base, order), null, 'order · base = ∞');

  const k = 17 % order;
  const target = smallCurveMul(p, base, k);
  const bf = smallCurveDiscreteLogBruteForce(p, base, target, order);
  assert.equal(bf.k, k);
  const bsgs = smallCurveDiscreteLogBsgs(p, base, target, order);
  assert.equal(bsgs.k, k);
  assert.ok(bsgs.steps <= 2 * Math.ceil(Math.sqrt(Number(order))) + 2);

  const growth = ecdlpCostGrowth({ primes: [103n, 211n, 1019n], challenges: 3, seed: 5 });
  assert.equal(growth.length, 3);
  for (const row of growth) {
    assert.ok(row.groupOrder > 0 && row.sqrtOrder > 0);
    assert.ok(row.meanBsgsSteps > 0 && row.meanBruteForceSteps > 0);
    assert.ok(row.rhoEstimate > 0);
  }
});

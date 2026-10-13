/**
 * The statistical study of k ↦ Q = kG (src/lib/kg-study.js).
 *
 * Exact values: the T17 orbits and occupancies were computed by hand from the
 * multiples of G = (1, 5) and (6, 6) on y² = x³ + 7 over F₁₇; the group orders
 * and base points of the larger curves were cross-checked by exhaustive
 * enumeration with the BigInt arithmetic of src/lib/toy-curve.js, and the
 * secp256k1 points against src/lib/secp256k1.js. Multiplicities for p ≡ 1
 * (mod 3) follow from x ↦ x³ being 3-to-1 on F_p^×; for p ≡ 2 (mod 3) it is a
 * bijection, so every ordinate occurs exactly once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LADDER,
  orbit,
  coordinateDistribution,
  occupancy,
  poissonReference,
  keccakModP,
  bitFrequency,
  exactBitExpectation,
  bitStudy,
  pointCloud,
  cellUniformity,
  mirrorSymmetry,
  correlationStudy,
  periodicSequence,
  avalancheSmall,
  secpSample,
  flipSample,
  flippedPoints,
  avalancheSecp,
  sacSecp,
  sacKeccak,
  relatedOutputs,
  primeOrderCurves,
  ecdlpCost,
  doubleAndAddCost,
  runStudy,
} from '../src/lib/kg-study.js';
import { defineCurve, subgroup, multiply, SECP256K1 } from '../src/lib/toy-curve.js';
import { G as SECP_G, N as SECP_N, P as SECP_P, mul as secpMul, equals as secpEquals } from '../src/lib/secp256k1.js';
import { keccak256 } from '../src/lib/keccak.js';
import { bigIntToBytes, bytesToBigInt } from '../src/lib/bytes.js';

const byId = Object.fromEntries(LADDER.map((e) => [e.id, e]));
const T17 = byId.T17;
const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

/** Every orbit of the study: each ladder entry with each of its bases. */
const ORBITS = LADDER.flatMap((entry) => entry.bases.map((base) => ({ entry, base, orbit: orbit(entry, base) })));

test('the curve ladder: computed group orders, base points and orders', () => {
  assert.deepEqual(LADDER.map((e) => e.id), ['T17', 'S1031', 'O1051', 'O16477']);
  const expected = {
    T17: { p: 17, pMod3: 2, groupOrder: 18, base: { x: 1, y: 5 }, n: 9, bits: 5 },
    S1031: { p: 1031, pMod3: 2, groupOrder: 1032, base: { x: 14, y: 407 }, n: 1032, bits: 11 },
    O1051: { p: 1051, pMod3: 1, groupOrder: 1093, base: { x: 3, y: 385 }, n: 1093, bits: 11 },
    O16477: { p: 16477, pMod3: 1, groupOrder: 16693, base: { x: 4, y: 4047 }, n: 16693, bits: 15 },
  };
  for (const [id, want] of Object.entries(expected)) {
    const e = byId[id];
    assert.equal(e.a, 0);
    assert.equal(e.b, 7);
    for (const [key, value] of Object.entries(want)) assert.deepEqual(e[key], value, `${id}.${key}`);
    assert.equal(typeof e.label, 'string');
    assert.equal(typeof e.role, 'string');
  }
  assert.deepEqual(
    T17.bases.map(({ key, x, y, n }) => ({ key, x, y, n })),
    [{ key: 'T17', x: 1, y: 5, n: 9 }, { key: 'T17g', x: 6, y: 6, n: 18 }],
  );
  // The supersingular curve is cyclic: its base point generates the whole group.
  assert.equal(byId.S1031.n, byId.S1031.groupOrder);
  assert.doesNotThrow(() => JSON.stringify(LADDER));
});

test('T17 orbit of the assignment base G = (1, 5)', () => {
  const o = orbit(T17);
  assert.equal(o.n, 9);
  assert.deepEqual([...o.xs], [1, 2, 5, 12, 12, 5, 2, 1]);
  assert.deepEqual([...o.ys], [5, 10, 9, 1, 16, 8, 7, 12]);
  const g = orbit(T17, { x: 6, y: 6 });
  assert.equal(g.n, 18);
  assert.equal(g.xs.length, 17);
});

test('the Number fast path agrees with the BigInt arithmetic of toy-curve.js', () => {
  for (const { entry, base, orbit: o } of ORBITS) {
    const curve = defineCurve({ p: BigInt(entry.p), b: 7n });
    const reference = subgroup(curve, { x: BigInt(base.x), y: BigInt(base.y) });
    assert.equal(o.n, reference.length + 1, base.key);
    assert.equal(o.n, base.n, base.key);
    reference.forEach((P, i) => {
      if (Number(P.x) !== o.xs[i] || Number(P.y) !== o.ys[i]) assert.fail(`${base.key}: k = ${i + 1}`);
    });
  }
});

test('E2 occupancy: exact multiplicities of x and y', () => {
  const t = orbit(T17);
  assert.deepEqual(occupancy(t.xs, 17).multiplicity, { 0: 13, 2: 4 });
  assert.deepEqual(occupancy(t.ys, 17).multiplicity, { 0: 9, 1: 8 });
  const g = orbit(T17, { x: 6, y: 6 });
  assert.deepEqual(occupancy(g.ys, 17).multiplicity, { 1: 17 });
  assert.deepEqual(occupancy(g.xs, 17).multiplicity, { 0: 8, 1: 1, 2: 8 });
  const o = orbit(byId.O1051);
  assert.equal(o.n, 1093);
  assert.deepEqual(occupancy(o.xs, 1051).multiplicity, { 0: 505, 2: 546 });
  assert.deepEqual(occupancy(o.ys, 1051).multiplicity, { 0: 687, 3: 364 });
  // p ≡ 2 (mod 3): the base generates the whole group, and every ordinate occurs exactly once.
  const s = orbit(byId.S1031);
  assert.equal(s.n, byId.S1031.groupOrder);
  assert.deepEqual(occupancy(s.ys, 1031).multiplicity, { 1: 1031 });
  // The dense counts and the Poisson reference cover m = 0 … max.
  const occ = occupancy(o.ys, 1051);
  assert.deepEqual(occ.counts, [687, 0, 0, 364]);
  near(occ.lambda, 1092 / 1051, 1e-15);
  assert.equal(occ.reference.length, 4);
  assert.ok(occ.test.pValue < 1e-10, 'three-to-one ordinates are far from a random function');
});

test('E2 Poisson reference and the Keccak-256 mod p baseline', () => {
  const ref = poissonReference(2, 100, 3);
  near(ref[0], 100 * Math.exp(-2), 1e-12);
  near(ref[3], (100 * Math.exp(-2) * 8) / 6, 1e-12);
  const base = keccakModP(byId.O1051);
  assert.equal(base.values.length, 1092);
  const k1 = Number(bytesToBigInt(keccak256(bigIntToBytes(1n, 32, 'be'))) % 1051n);
  assert.equal(base.values[0], k1);
  const total = Object.entries(base.occupancy.multiplicity).reduce((a, [m, c]) => a + Number(m) * c, 0);
  assert.equal(total, 1092);
  assert.ok(base.occupancy.test.pValue > 1e-4, `a random function fits the Poisson law (p = ${base.occupancy.test.pValue})`);
});

test('E1 coordinate distribution with exact unequal bin widths', () => {
  const d = coordinateDistribution([0, 4, 5, 16, 16], 17, 4);
  assert.deepEqual(d.widths, [5, 4, 4, 4]);
  assert.deepEqual(d.counts, [2, 1, 0, 2]);
  near(d.expected.reduce((a, b) => a + b, 0), 5, 1e-12);
  near(d.expected[0], (5 * 5) / 17, 1e-12);
  assert.equal(d.df, 3);
  // Ordinates of the supersingular curve are exactly uniform: the statistic is 0.
  const s = orbit(byId.S1031);
  const exact = coordinateDistribution(s.ys, 1031, 16);
  near(exact.statistic, 0, 1e-9);
  // BigInt values: the 256-bit range of Keccak digests.
  const big = coordinateDistribution([0n, 2n ** 255n, 2n ** 256n - 1n], 2n ** 256n, 2);
  assert.deepEqual(big.counts, [1, 2]);
  near(big.expected[0], 1.5, 1e-12);
});

test('E3 exact bit expectation and bit frequencies', () => {
  const q = exactBitExpectation(17, 5);
  assert.equal(q[4], 1 / 17);
  // Brute force over [0, p) for a few primes.
  for (const p of [17, 1031, 1051]) {
    const bits = (p - 1).toString(2).length;
    const exact = exactBitExpectation(p, bits);
    for (let j = 0; j < bits; j += 1) {
      let c = 0;
      for (let v = 0; v < p; v += 1) c += (v >> j) & 1;
      near(exact[j], c / p, 1e-15, `p = ${p}, j = ${j}`);
    }
  }
  near(exactBitExpectation(2n ** 256n, 256)[255], 0.5, 1e-15);
  const f = bitFrequency([1, 2, 3, 16], 5);
  assert.deepEqual(f.ones, [2, 2, 0, 0, 1]);
  const fb = bitFrequency([1n, 2n ** 200n + 1n], 256);
  assert.equal(fb.ones[0], 2);
  assert.equal(fb.ones[200], 1);
  const s = bitStudy(orbit(byId.O1051).xs, 1051, 11);
  assert.equal(s.zHalf.length, 11);
  assert.equal(s.zExact.length, 11);
  assert.equal(s.monobit.length, 11);
});

test('E4 point cloud, cell uniformity and mirror symmetry', () => {
  const o = orbit(byId.O16477);
  const cloud = pointCloud(o, 4000);
  assert.equal(cloud.xs.length, 4000);
  assert.equal(cloud.k[0], 1);
  assert.ok(cloud.k.every((k, i) => i === 0 || k > cloud.k[i - 1]));
  assert.equal(cloud.xs[10], o.xs[cloud.k[10] - 1]);
  assert.deepEqual(pointCloud(orbit(T17)).k, [1, 2, 3, 4, 5, 6, 7, 8]);
  const cells = cellUniformity(o.xs, o.ys, o.p, 16);
  assert.equal(cells.counts.length, 16);
  assert.equal(cells.counts.flat().reduce((a, b) => a + b, 0), o.n - 1);
  assert.equal(cells.df, 255);
  for (const { orbit: orb, base } of ORBITS) assert.equal(mirrorSymmetry(orb).fraction, 1, base.key);
});

test('E5 correlations: r(k, x) = 0 on every full orbit and mirror correlation 1', () => {
  for (const { orbit: o, base } of ORBITS) {
    const c = correlationStudy(o);
    assert.ok(Math.abs(c.kx.r) < 1e-12, `${base.key}: r(k, x) = ${c.kx.r}`);
    assert.equal(c.mirror.r, 1, `${base.key}: mirror r`);
    assert.equal(c.mirror.rho, 1, `${base.key}: mirror ρ`);
  }
  const t = correlationStudy(orbit(T17));
  near(t.ky.r, 0.298, 5e-4);
  near(t.lag1.r, 0.545, 5e-4);
  const o = correlationStudy(orbit(byId.O1051));
  near(o.ky.r, 0.037, 5e-4);
  near(o.lag1.r, 0.034, 5e-4);
});

test('E5 periodic sequence of x(kG) on T17: period 9, O at multiples of n', () => {
  const s = periodicSequence(T17, T17.base, 36);
  assert.equal(s.xs.length, 36);
  [9, 18, 27, 36].forEach((k) => {
    assert.equal(s.xs[k - 1], null);
    assert.equal(s.ys[k - 1], null);
  });
  assert.deepEqual(s.xs.slice(0, 9), [1, 2, 5, 12, 12, 5, 2, 1, null]);
  assert.deepEqual(s.xs.slice(9, 18), s.xs.slice(0, 9));
});

test('E6 exhaustive avalanche on a small curve', () => {
  const a = avalancheSmall(byId.O1051);
  assert.equal(a.trials + a.discarded, 1092 * 11);
  assert.equal(a.counts.reduce((x, y) => x + y, 0), a.trials);
  assert.equal(a.counts.length, 23);
  near(a.reference.reduce((x, y) => x + y, 0), 1, 1e-12);
  assert.ok(a.mean > 8 && a.mean < 14, `mean ${a.mean}`);
  const t = avalancheSmall(T17);
  assert.equal(t.trials + t.discarded, 8 * 4);
});

test('secpSample: keys in [1, n − 1], deterministic, points and digests correct', () => {
  const a = secpSample({ N: 12, seed: 7 });
  const b = secpSample({ N: 12, seed: 7 });
  assert.equal(a.keys.length, 12);
  assert.deepEqual(a.keys, b.keys);
  assert.notDeepEqual(secpSample({ N: 12, seed: 8 }).keys, a.keys);
  for (const k of a.keys) assert.ok(k >= 1n && k <= SECP_N - 1n);
  a.keys.forEach((k, i) => {
    assert.ok(secpEquals(a.points[i], secpMul(SECP_G, k)), `key ${i}`);
    assert.equal(a.hashes[i], bytesToBigInt(keccak256(bigIntToBytes(k, 32, 'be'))));
  });
  // Independent check with the affine BigInt arithmetic of toy-curve.js on a subset.
  for (const i of [0, 5]) {
    const Q = multiply(SECP256K1, SECP_G, a.keys[i]);
    assert.ok(Q.x === a.points[i].x && Q.y === a.points[i].y);
  }
});

test('SAC shortcut: Q ± 2^i G equals a fresh multiplication of k ⊕ 2^i', () => {
  const s = secpSample({ N: 3, seed: 11 });
  const bits = [0, 1, 7, 8, 63, 128, 200, 254, 255];
  s.keys.forEach((k, t) => {
    const shortcut = flippedPoints(k, s.points[t], bits);
    bits.forEach((i, j) => {
      const fresh = secpMul(SECP_G, k ^ (1n << BigInt(i)));
      assert.ok(secpEquals(shortcut[j], fresh), `key ${t}, bit ${i}`);
    });
  });
});

test('avalanche, SAC and related outputs on a small secp256k1 sample', () => {
  const s = secpSample({ N: 24, seed: 3 });
  const flipped = flipSample(s, { seed: 99 });
  assert.equal(flipped.bits.length, 24);
  flipped.keys.forEach((kp, i) => assert.ok(secpEquals(flipped.points[i], secpMul(SECP_G, kp))));
  const av = avalancheSecp(s, { seed: 99, flipped });
  assert.equal(av.trials, 24);
  assert.equal(av.ec.counts.reduce((a, b) => a + b, 0), 24);
  assert.equal(av.keccak.counts.length, 257);
  near(av.reference.reduce((a, b) => a + b, 0), 1, 1e-12);
  const rel = relatedOutputs(s, { seed: 99, flipped });
  assert.equal(rel.ec.hits, rel.ec.trials);
  assert.equal(rel.ec.trials, 24);
  assert.equal(rel.keccak.hits, 0);
  const sac = sacSecp(s, { keys: 4 });
  assert.equal(sac.counts.length, 65536);
  assert.equal(sac.trials, 4);
  assert.ok(sac.maxAbsDeviation <= 0.5);
  const sk = sacKeccak(s, { keys: 4 });
  assert.equal(sk.counts.length, 65536);
  near(sk.counts.reduce((a, b) => a + b, 0) / (4 * 65536), 0.5, 0.02);
});

test('E7 discrete-logarithm cost: slopes ≈ 1 (brute force) and ≈ ½ (BSGS)', () => {
  const curves = primeOrderCurves();
  assert.ok(curves.length >= 10 && curves.length <= 14, `${curves.length} curves`);
  assert.ok(curves.some((c) => c.p === 1051 && c.n === 1093));
  assert.ok(curves.some((c) => c.p === 16477 && c.n === 16693));
  const r = ecdlpCost({ targets: 64, seed: 20261013 });
  assert.equal(r.curves.length, curves.length);
  assert.ok(r.fit.bruteForce.slope >= 0.85 && r.fit.bruteForce.slope <= 1.15, `brute force ${r.fit.bruteForce.slope}`);
  assert.ok(r.fit.bsgs.slope >= 0.4 && r.fit.bsgs.slope <= 0.6, `BSGS ${r.fit.bsgs.slope}`);
  near(r.fit.bsgs.log2At256, 128, 6);
  const t17 = r.smoothness.find((s) => s.key === 'T17g');
  assert.deepEqual(t17.factors, [{ prime: 2, exponent: 1 }, { prime: 3, exponent: 2 }]);
  assert.deepEqual(r.smoothness.find((s) => s.key === 'T17').factors, [{ prime: 3, exponent: 2 }]);
});

test('E8 double-and-add against repeated addition', () => {
  const d = doubleAndAddCost(256);
  assert.equal(d.bits.length, 256);
  assert.equal(d.repeatedAddition[1], 1.5);
  assert.equal(d.doubleAndAdd[255], 1.5 * 255);
  near(d.log2RepeatedAddition[255], 255 + Math.log2(1.5), 1e-9);
  assert.equal(d.log2RepeatedAddition[0], null);
  assert.equal(d.assignment.k, 6);
  assert.equal(d.assignment.repeatedAddition, 5);
  assert.equal(d.assignment.bits, '110');
  assert.deepEqual(d.assignment.doubleAndAdd, { doublings: 2, additions: 1, total: 3 });
  assert.equal(d.assignment.result, '(5, 8)');
});

test('runStudy returns JSON-serialisable output keyed by experiment and curve', () => {
  const r = runStudy({ secpN: 16, sacKeys: 2, ecdlpTargets: 8 });
  const json = JSON.stringify(r);
  const back = JSON.parse(json);
  for (const key of ['meta', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']) assert.ok(key in back, key);
  for (const key of ['T17', 'T17g', 'S1031', 'O1051', 'O16477']) assert.ok(key in back.E2, key);
  assert.ok(Array.isArray(back.E4.O1051.cloud.xs));
  assert.equal(back.meta.seed, 20261013);
  assert.equal(back.meta.keys.first.length, 8);
  assert.match(back.meta.keys.first[0], /^[0-9a-f]{64}$/);
  assert.equal(typeof back.meta.secp256k1.n, 'string');
  assert.equal(back.E6.secp256k1.related.hits, back.E6.secp256k1.related.trials);
  assert.ok(Object.values(back.meta.timing).every((ms) => typeof ms === 'number'));
});

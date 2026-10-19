/**
 * The attack-cost study of src/lib/ecc-attack-study.js with small key sizes:
 * every key is recovered, the operation counts are deterministic for a seed,
 * and the fitted growth of log₂(operations) with the key size is about one for
 * brute force and one half for baby-step giant-step and the kangaroo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackCostTable, extrapolate, keySpaces, linearFit, measureAttackCost } from '../src/lib/ecc-attack-study.js';

const ranges = { 'brute-force': [6, 8, 10, 12], bsgs: [6, 8, 10, 12, 14, 16], kangaroo: [8, 10, 12, 14] };
const run = (seed) => measureAttackCost({ seed, keysPerBits: 6, ranges });
const study = run(41);

test('every attack recovers every key', () => {
  for (const m of Object.values(study.methods)) {
    for (const p of m.points) assert.equal(p.found, p.keys);
  }
});

test('operation counts are deterministic for a seed', () => {
  const again = run(41);
  for (const [name, m] of Object.entries(study.methods)) {
    assert.deepEqual(
      m.points.map((p) => p.operations),
      again.methods[name].points.map((p) => p.operations),
    );
  }
  assert.deepEqual(study.meta.privateKeys, again.meta.privateKeys);
});

test('brute force costs k − 1 additions, so the same keys give the same counts', () => {
  for (const p of study.methods['brute-force'].points) {
    const keys = study.meta.privateKeys[p.bits].map(Number);
    assert.deepEqual(p.operations, keys.map((k) => k - 1));
  }
});

test('the fitted slopes are about 1 for brute force and 1/2 for the square-root methods', () => {
  const { 'brute-force': brute, bsgs, kangaroo } = study.methods;
  assert.ok(brute.fit.slope > 0.7 && brute.fit.slope < 1.3, `brute ${brute.fit.slope}`);
  assert.ok(bsgs.fit.slope > 0.4 && bsgs.fit.slope < 0.6, `bsgs ${bsgs.fit.slope}`);
  assert.ok(kangaroo.fit.slope > 0.35 && kangaroo.fit.slope < 0.65, `kangaroo ${kangaroo.fit.slope}`);
});

test('linearFit and extrapolate recover an exact line', () => {
  const fit = linearFit([0, 1, 2, 3].map((x) => ({ x, y: 2 + 0.5 * x })));
  assert.ok(Math.abs(fit.slope - 0.5) < 1e-12 && Math.abs(fit.intercept - 2) < 1e-12 && Math.abs(fit.r - 1) < 1e-12);
  assert.ok(Math.abs(extrapolate(fit, 10) - 7) < 1e-12);
});

test('the extrapolation table and the key spaces', () => {
  const t = attackCostTable(study, { targets: [128] });
  assert.equal(t.rows.length, 3);
  assert.ok(Math.abs(t.rho.log2Operations - 127.83) < 0.01);
  const spaces = keySpaces();
  assert.deepEqual(spaces.map((s) => s.key), ['caesar', 'toy', 'secp256k1']);
  assert.ok(Math.abs(spaces[0].log2 - 4.7004) < 1e-4);
  assert.equal(spaces[1].log2, 20);
  assert.ok(spaces[2].log2 > 255.99 && spaces[2].log2 <= 256);
});

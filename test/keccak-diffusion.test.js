/**
 * Diffusion of a one-bit difference through Keccak-f[1600]: the exact facts
 * of the first round (θ turns one bit into 11, ρ and π permute, ι cancels)
 * and the shapes and determinism of the experiment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keccakDiffusion, keccakDiffusionTrace, DIFFUSION_STEP_ROUNDS } from '../src/lib/keccak-diffusion.js';
import { hexToBytes, hammingWeight, bitAt } from '../src/lib/bytes.js';

test('trace: θ of round 1 maps a one-bit difference to exactly 11 bits, in the proved positions', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const t = keccakDiffusionTrace(seed);
    assert.equal(t.steps.length, 1 + 5 * DIFFUSION_STEP_ROUNDS);
    assert.equal(t.steps[0].label, 'input');
    assert.equal(t.steps[0].count, 1);
    for (const s of t.steps) assert.equal(hammingWeight(hexToBytes(s.mask)), s.count, s.label);
    const theta = t.steps[1];
    assert.equal(theta.label, 'R1 θ');
    assert.equal(theta.count, 11);
    const { x, y, z } = t.flipped;
    const mask = hexToBytes(theta.mask);
    const at = (xx, yy, zz) => bitAt(mask, 64 * (((xx + 5) % 5) + 5 * yy) + ((zz + 64) % 64));
    assert.equal(at(x, y, z), 1);
    for (let yy = 0; yy < 5; yy += 1) {
      assert.equal(at(x + 1, yy, z), 1, 'column (x + 1, z)');
      assert.equal(at(x - 1, yy, z + 1), 1, 'column (x − 1, z + 1)');
    }
    // ρ and π permute bits; ι adds the same constant to both states.
    for (let r = 0; r < DIFFUSION_STEP_ROUNDS; r += 1) {
      const [th, rh, p, ch, io] = t.steps.slice(1 + 5 * r, 6 + 5 * r);
      assert.equal(rh.count, th.count);
      assert.equal(p.count, rh.count);
      assert.equal(io.mask, ch.mask);
    }
  }
});

test('experiment: checkpoints, exact first-round values and the final binomial fit', () => {
  const r = keccakDiffusion({ seed: 9, n: 60 });
  assert.equal(r.n, 60);
  const byLabel = Object.fromEntries(r.checkpoints.map((c) => [c.label, c]));
  for (const label of ['R1 θ', 'R1 ρ', 'R1 π']) {
    assert.equal(byLabel[label].min, 11, label);
    assert.equal(byLabel[label].max, 11, label);
    assert.equal(byLabel[label].mean, 11, label);
    assert.equal(byLabel[label].sd, 0, label);
  }
  assert.deepEqual(byLabel['R1 ι'], { ...byLabel['R1 χ'], label: 'R1 ι', step: 'iota' });
  assert.equal(r.checkpoints.filter((c) => c.step === 'round').length, 24);
  const last = r.checkpoints.at(-1);
  assert.equal(last.round, 24);
  assert.ok(Math.abs(last.mean - 800) < 15, `mean after 24 rounds = ${last.mean}`);
  assert.ok(last.q1 <= last.median && last.median <= last.q3);
  assert.equal(r.final.counts.length, 1601);
  assert.equal(r.final.counts.reduce((a, b) => a + b, 0), 60);
  assert.ok(r.final.p >= 0 && r.final.p <= 1);
  assert.deepEqual(keccakDiffusion({ seed: 9, n: 10 }), keccakDiffusion({ seed: 9, n: 10 }));
});

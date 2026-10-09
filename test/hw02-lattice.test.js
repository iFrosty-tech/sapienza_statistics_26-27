import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keccakDiffusionTrace } from '../src/lib/keccak-diffusion.js';
import {
  LATTICE_SIZE,
  Z_GAP,
  PITCH_LIMIT,
  decodeMask,
  latticePoints,
  rotate,
  project,
  depthOrder,
  clampPitch,
  fitScale,
  maskTransition,
} from '../src/hw02/lattice.js';

test('decodeMask follows the FIPS 202 bit order: bit i is bit (i mod 8) of byte ⌊i / 8⌋', () => {
  const hex = '01' + '00'.repeat(198) + '80';
  const bits = decodeMask(hex);
  assert.equal(bits.length, LATTICE_SIZE);
  assert.equal(bits[0], 1);
  assert.equal(bits[1599], 1);
  assert.equal(bits.reduce((a, b) => a + b, 0), 2);
  assert.throws(() => decodeMask('00'), /400 hex digits/);
});

test('decodeMask agrees with the counts of the Keccak diffusion trace', () => {
  const trace = keccakDiffusionTrace(1601);
  for (const step of trace.steps) {
    const ones = decodeMask(step.mask).reduce((a, b) => a + b, 0);
    assert.equal(ones, step.count, step.label);
  }
  const input = decodeMask(trace.steps[0].mask);
  assert.equal(input[trace.flipped.index], 1, 'the input mask is the flipped bit');
});

test('latticePoints places bit 64(x + 5y) + z at lane (x, y), position z, centred on the origin', () => {
  const pts = latticePoints();
  assert.equal(pts.length, 1600);
  const i = 64 * (3 + 5 * 1) + 10;
  assert.deepEqual([pts[i].x, pts[i].y, pts[i].z], [3, 1, 10]);
  const u = pts.map((p) => p.u);
  assert.ok(Math.abs(Math.min(...u) + Math.max(...u)) < 1e-9, 'symmetric along the lane');
  assert.ok(Math.abs(Math.max(...u) - 31.5 * Z_GAP) < 1e-9);
});

test('rotation preserves distances and the identity view is a plain projection', () => {
  const p = { u: 3, v: -1.5, w: 2 };
  const r = rotate(p, 0.7, -0.3);
  assert.ok(Math.abs(Math.hypot(r.sx, r.sy, r.depth) - Math.hypot(p.u, p.v, p.w)) < 1e-9);
  const id = rotate(p, 0, 0);
  assert.ok(Math.abs(id.sx - 3) < 1e-12 && Math.abs(id.sy + 2) < 1e-12 && Math.abs(id.depth + 1.5) < 1e-12);
});

test('project maps model units to pixels around a centre', () => {
  const s = project({ u: 1, v: 0, w: 1 }, { yaw: 0, pitch: 0, scale: 10, cx: 100, cy: 50 });
  assert.ok(Math.abs(s.x - 110) < 1e-9);
  assert.ok(Math.abs(s.y - 40) < 1e-9, 'screen y grows downwards');
});

test('depthOrder sorts points from the farthest to the nearest', () => {
  const pts = latticePoints();
  const order = depthOrder(pts, 0.4, 0.3);
  assert.equal(order.length, 1600);
  assert.equal(new Set(order).size, 1600);
  const depth = (i) => rotate(pts[i], 0.4, 0.3).depth;
  for (let k = 1; k < order.length; k += 1) assert.ok(depth(order[k - 1]) >= depth(order[k]) - 1e-12);
});

test('clampPitch keeps the view within the pitch limit', () => {
  assert.equal(clampPitch(5), PITCH_LIMIT);
  assert.equal(clampPitch(-5), -PITCH_LIMIT);
  assert.equal(clampPitch(0.1), 0.1);
});

test('fitScale keeps the lattice inside the canvas at every yaw within the pitch limit', () => {
  const pts = latticePoints();
  for (const [width, height] of [
    [720, 380],
    [358, 260],
  ]) {
    const pad = 16;
    const scale = fitScale(width, height, pad);
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.2) {
      for (const pitch of [-PITCH_LIMIT, 0, PITCH_LIMIT]) {
        for (const p of pts) {
          const s = project(p, { yaw, pitch, scale, cx: width / 2, cy: height / 2 });
          assert.ok(s.x >= pad - 1e-6 && s.x <= width - pad + 1e-6, `x inside at yaw ${yaw}`);
          assert.ok(s.y >= pad - 1e-6 && s.y <= height - pad + 1e-6, `y inside at yaw ${yaw}, pitch ${pitch}`);
        }
      }
    }
  }
});

test('maskTransition fades bits that switch on in and bits that switch off out', () => {
  const from = Uint8Array.from([0, 1, 1, 0]);
  const to = Uint8Array.from([0, 1, 0, 1]);
  assert.deepEqual([...maskTransition(from, to, 0)], [0, 1, 1, 0]);
  assert.deepEqual([...maskTransition(from, to, 1)], [0, 1, 0, 1]);
  const half = maskTransition(from, to, 0.5);
  assert.deepEqual([half[0], half[1]], [0, 1]);
  assert.ok(Math.abs(half[2] - 0.5) < 1e-9 && Math.abs(half[3] - 0.5) < 1e-9);
});

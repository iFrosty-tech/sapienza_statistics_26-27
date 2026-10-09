import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keccakDiffusionTrace } from '../src/lib/keccak-diffusion.js';
import {
  LATTICE_SIZE,
  Z_GAP,
  PITCH_LIMIT,
  YAW_LIMIT,
  decodeMask,
  latticePoints,
  rotate,
  project,
  depthOrder,
  clampPitch,
  clampYaw,
  fitScale,
  canvasHeight,
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

test('clampYaw keeps the view within the yaw limit, which contains the default view', () => {
  assert.equal(YAW_LIMIT, 0.6);
  assert.equal(clampYaw(5), YAW_LIMIT);
  assert.equal(clampYaw(-5), -YAW_LIMIT);
  assert.equal(clampYaw(-0.5), -0.5);
});

test('canvasHeight is 0.34 of the width, clamped to [160, 300] px', () => {
  assert.equal(canvasHeight(300), 160);
  assert.equal(canvasHeight(600), 204);
  assert.equal(canvasHeight(1200), 300);
});

/* Largest extents of the projected lattice over a grid of admissible angles, in pixels from the centre. */
function extents(pts, scale) {
  let x = 0;
  let y = 0;
  for (let i = 0; i <= 24; i += 1) {
    const yaw = -YAW_LIMIT + (2 * YAW_LIMIT * i) / 24;
    for (let j = 0; j <= 12; j += 1) {
      const pitch = -PITCH_LIMIT + (2 * PITCH_LIMIT * j) / 12;
      for (const p of pts) {
        const s = project(p, { yaw, pitch, scale, cx: 0, cy: 0 });
        x = Math.max(x, Math.abs(s.x));
        y = Math.max(y, Math.abs(s.y));
      }
    }
  }
  return { x, y };
}

test('fitScale keeps the lattice inside the canvas at every admissible yaw and pitch, and fills it', () => {
  const pts = latticePoints();
  for (const width of [358, 720, 1000]) {
    const height = canvasHeight(width);
    const pad = 16;
    const scale = fitScale(width, height, pad);
    const e = extents(pts, scale);
    assert.ok(e.x <= width / 2 - pad + 1e-6, `x inside at width ${width}`);
    assert.ok(e.y <= height / 2 - pad + 1e-6, `y inside at width ${width}`);
    // The limiting dimension is used to within 2%: no empty band around the drawing.
    const fill = Math.max(e.x / (width / 2 - pad), e.y / (height / 2 - pad));
    assert.ok(fill > 0.98, `fill ${fill.toFixed(3)} at width ${width}`);
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

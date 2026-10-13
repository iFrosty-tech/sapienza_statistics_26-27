/**
 * The torus view of homework 1 (src/hw01/torus.js). F_p × F_p wraps in both
 * coordinates, so the ruled sheet is a torus: the morph rolls the sheet along
 * y into a cylinder and bends the cylinder along x into a torus. The flat
 * layout must coincide with the printed lattice (src/hw01/lattice.js), the
 * torus must close at both seams, a line modulo p must become one closed curve
 * and the reflection y → −y a mirror through the plane of the equators.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  depthOrder,
  liftLine,
  morphNormal,
  morphPoint,
  project,
  rotate,
  sheetPoint,
  torusDims,
  torusPoint,
} from '../src/hw01/torus.js';
import { latticeScale, lineSegments } from '../src/hw01/lattice.js';

const P = 17;
const near = (a, b, eps = 1e-7) => Math.abs(a - b) < eps;
const same3 = (a, b, eps = 1e-7) => near(a.X, b.X, eps) && near(a.Y, b.Y, eps) && near(a.Z, b.Z, eps);
const dist3 = (a, b) => Math.hypot(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
const samples = [-0.5, 0, 1, 2.25, 5, 8, 8.5, 11.75, 16, 16.49];

test('the flat sheet coincides with the printed lattice at t = 0', () => {
  const s = latticeScale({ p: P, width: 440 });
  const view = { cx: s.left + s.size / 2, cy: s.top + s.size / 2, yaw: 0, pitch: 0, distance: 5 * s.size };
  const dims = torusDims(s.size);
  for (const x of samples) {
    for (const y of samples) {
      const flat = sheetPoint(x, y, P, s.size);
      assert.equal(flat.Z, 0);
      const screen = project(flat, view);
      assert.ok(near(screen.x, s.x(x), 1e-9) && near(screen.y, s.y(y), 1e-9), `(${x}, ${y}) on the printed sheet`);
      assert.ok(same3(morphPoint(x, y, P, 0, dims), flat, 1e-12), `morph at t = 0 is the flat layout at (${x}, ${y})`);
    }
  }
  const n = morphNormal(3, 4, P, 0);
  assert.ok(same3(n, { X: 0, Y: 0, Z: -1 }), 'the flat sheet faces the viewer');
});

test('at t = 1 the morph is exactly the torus, with seams glued in both coordinates', () => {
  const dims = torusDims(348);
  assert.ok(near(dims.r, 348 / (2 * Math.PI)), 'the tube is the side of the sheet rolled up');
  assert.ok(dims.R > dims.r, 'a ring torus, not a horn torus');
  for (const x of samples) {
    for (const y of samples) {
      const m = morphPoint(x, y, P, 1, dims);
      const t = torusPoint(x, y, P, dims.R, dims.r);
      assert.ok(same3(m, t, 1e-9), `(${x}, ${y})`);
      const ring = Math.hypot(m.X, m.Z) - dims.R;
      assert.ok(near(ring * ring + m.Y * m.Y, dims.r * dims.r, 1e-6), 'on the surface of the torus');
    }
  }
  for (let v = 0; v <= P; v += 1) {
    assert.ok(same3(morphPoint(v, 0, P, 1, dims), morphPoint(v, P, P, 1, dims), 1e-9), `(${v}, 0) ≡ (${v}, p)`);
    assert.ok(same3(morphPoint(0, v, P, 1, dims), morphPoint(P, v, P, 1, dims), 1e-9), `(0, ${v}) ≡ (p, ${v})`);
    assert.ok(same3(morphPoint(v, -0.5, P, 1, dims), morphPoint(v, P - 0.5, P, 1, dims), 1e-9), 'the edges of the sheet meet');
  }
  const n = morphNormal(2, 7, P, 1);
  assert.ok(near(Math.hypot(n.X, n.Y, n.Z), 1, 1e-12), 'unit normal');
});

test('the reflection y → −y is a mirror through the plane of the equators', () => {
  const { R, r } = torusDims(348);
  for (let x = 0; x < P; x += 1) {
    for (let y = 0; y < P; y += 1) {
      const a = torusPoint(x, y, P, R, r);
      const b = torusPoint(x, (P - y) % P, P, R, r);
      assert.ok(same3(b, { X: a.X, Y: -a.Y, Z: a.Z }, 1e-9), `(${x}, ${y}) and its negative`);
    }
  }
  // The fixed points of the reflection, y = 0 and y = p/2, lie on the equatorial plane Y = 0.
  assert.ok(near(torusPoint(4, 0, P, R, r).Y, 0) && near(torusPoint(4, P / 2, P, R, r).Y, 0));
});

test('the morph is continuous in t, through the change of stage at t = 1/2', () => {
  const dims = torusDims(348);
  for (const [x, y] of [[0, 0], [4, 13], [16, 9], [8, 8.5], [-0.5, 16.49]]) {
    assert.ok(dist3(morphPoint(x, y, P, 0.5 - 1e-9, dims), morphPoint(x, y, P, 0.5 + 1e-9, dims)) < 1e-4, 'stages meet');
    let prev = morphPoint(x, y, P, 0, dims);
    for (let i = 1; i <= 1000; i += 1) {
      const next = morphPoint(x, y, P, i / 1000, dims);
      assert.ok(dist3(prev, next) < 3, `small steps stay small at t = ${i / 1000}`);
      prev = next;
    }
  }
});

test('a line modulo p is lifted as its wrapped segments on the sheet and one closed curve on the torus', () => {
  const dims = torusDims(348);
  for (const line of [{ lambda: 1, nu: 4 }, { lambda: 2, nu: 3 }, { lambda: -5, nu: 0 }, { vertical: true, x: 12 }]) {
    const flat = liftLine(P, line, 0);
    const expected = line.vertical ? lineSegments(P, null, line.x) : lineSegments(P, line.lambda, line.nu);
    assert.equal(flat.length, expected.length, 'one piece per segment while the sheet is open');
    flat.forEach((piece, i) => {
      assert.ok(near(piece[0].x, expected[i].x1, 1e-9) && near(piece[0].y, expected[i].y1, 1e-9));
      assert.ok(near(piece.at(-1).x, expected[i].x2, 1e-9) && near(piece.at(-1).y, expected[i].y2, 1e-9));
    });
    const closed = liftLine(P, line, 1);
    assert.equal(closed.length, 1, 'one curve on the torus');
    const curve = closed[0].map((q) => morphPoint(q.x, q.y, P, 1, dims));
    assert.ok(dist3(curve[0], curve.at(-1)) < 1e-6, 'and it closes');
    for (let i = 1; i < curve.length; i += 1) assert.ok(dist3(curve[i - 1], curve[i]) < 25, 'without jumps');
  }
});

test('rotation keeps distances, projection and depth order', () => {
  const p = { X: 3, Y: -4, Z: 12 };
  const q = rotate(p, 0.7, -0.4);
  assert.ok(near(Math.hypot(q.X, q.Y, q.Z), 13, 1e-12));
  assert.ok(same3(rotate(p, 0, 0), p, 1e-12));
  // Negative pitch tilts the top of the model towards the viewer (smaller Z is nearer).
  assert.ok(rotate({ X: 0, Y: 1, Z: 0 }, 0, -0.5).Z < 0);
  const view = { cx: 100, cy: 50, yaw: 0, pitch: 0, distance: 1000 };
  const near1 = project({ X: 10, Y: 10, Z: -100 }, view);
  const far1 = project({ X: 10, Y: 10, Z: 100 }, view);
  assert.ok(near1.scale > 1 && far1.scale < 1, 'perspective');
  assert.ok(near1.x > far1.x && near1.y < far1.y);
  assert.deepEqual(depthOrder([{ depth: 1 }, { depth: 5 }, { depth: -2 }]), [1, 0, 2], 'farthest first');
});

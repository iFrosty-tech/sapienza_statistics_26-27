/**
 * The lattice of E(F_p) shared by the build and the slowed-down view: the
 * geometry of a line modulo p (its wrapped parallel segments on the square),
 * the scale that places field elements on the sheet, and the SVG with the
 * stable classes the animation addresses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latticeScale, lineSegments, renderLatticeSVG } from '../src/hw01/lattice.js';
import { TOY_BASE, TOY_CURVE, addStep, points, subgroup } from '../src/lib/toy-curve.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const count = (html, needle) => html.split(needle).length - 1;

function assertSegments(actual, expected) {
  assert.equal(actual.length, expected.length, `${actual.length} segments, expected ${expected.length}`);
  actual.forEach((s, i) => {
    const [x1, y1, x2, y2] = expected[i];
    assert.ok(close(s.x1, x1) && close(s.y1, y1) && close(s.x2, x2) && close(s.y2, y2), `segment ${i}: ${JSON.stringify(s)}`);
  });
}

/* True when the lattice point (x, y) lies on one of the segments. */
function onSegments(segments, x, y) {
  return segments.some((s) => {
    if (close(s.x1, s.x2)) return close(s.x1, x) && y >= Math.min(s.y1, s.y2) - 1e-9 && y <= Math.max(s.y1, s.y2) + 1e-9;
    if (x < s.x1 - 1e-9 || x > s.x2 + 1e-9) return false;
    const t = (x - s.x1) / (s.x2 - s.x1);
    return close(s.y1 + t * (s.y2 - s.y1), y);
  });
}

test('the line y = x + 4 (mod 17) unwraps into two parallel segments', () => {
  // The chord of 5G + G = 6G: through (12, 16) and (1, 5), slope 1, intercept 4.
  assertSegments(lineSegments(17, 1, 4), [
    [-0.5, 3.5, 12.5, 16.5],
    [12.5, -0.5, 16.5, 3.5],
  ]);
});

test('the tangent y = 2x + 3 (mod 17) at G wraps twice', () => {
  assertSegments(lineSegments(17, 2, 3), [
    [-0.5, 2, 6.75, 16.5],
    [6.75, -0.5, 15.25, 16.5],
    [15.25, -0.5, 16.5, 2],
  ]);
});

test('a negative slope wraps downwards and BigInt inputs are accepted', () => {
  // λ = 16 ≡ −1: the same lattice points as the descending line y = −x + 5.
  assertSegments(lineSegments(17n, -1n, 5n), [
    [-0.5, 5.5, 5.5, -0.5],
    [5.5, 16.5, 16.5, 5.5],
  ]);
});

test('a horizontal line is one segment and a vertical line is the column x = c', () => {
  assertSegments(lineSegments(17, 0, 3), [[-0.5, 3, 16.5, 3]]);
  assertSegments(lineSegments(17, null, 8), [[8, -0.5, 8, 16.5]]);
  assertSegments(lineSegments(17, Infinity, 25), [[8, -0.5, 8, 16.5]]);
});

test('the segments cover the sheet from edge to edge and pass through all p lattice points of the line', () => {
  const p = 17;
  for (const lambda of [1, 2, 3, 5, 8, 16, -1, -4]) {
    for (const nu of [0, 4, 11]) {
      const segments = lineSegments(p, lambda, nu);
      assert.ok(close(segments[0].x1, -0.5) && close(segments.at(-1).x2, p - 0.5), `λ = ${lambda}: spans the sheet`);
      for (let i = 1; i < segments.length; i += 1) assert.ok(close(segments[i].x1, segments[i - 1].x2), 'contiguous in x');
      for (const s of segments) {
        for (const v of [s.y1, s.y2]) assert.ok(v >= -0.5 - 1e-9 && v <= p - 0.5 + 1e-9, `y = ${v} inside the sheet`);
        assert.ok(close((s.y2 - s.y1) / (s.x2 - s.x1), lambda), 'every segment has the slope λ');
      }
      for (let x = 0; x < p; x += 1) {
        const y = (((lambda * x + nu) % p) + p) % p;
        assert.ok(onSegments(segments, x, y), `λ = ${lambda}, ν = ${nu}: (${x}, ${y}) on the line`);
      }
    }
  }
});

test('the scale centres integer points in their cells and keeps the plot square', () => {
  const s = latticeScale({ p: 17, width: 440 });
  assert.ok(close(s.x(-0.5), s.left) && close(s.x(16.5), s.left + s.size));
  assert.ok(close(s.y(-0.5), s.top + s.size) && close(s.y(16.5), s.top), 'y grows upwards');
  assert.ok(close(s.step * 17, s.size));
  assert.ok(s.left + s.size < s.width && s.top + s.size < s.height);
  assert.equal(s.width, 440);
});

test('the toy-curve lattice draws every point inside the frame, the orbit with labels and the boxed O', () => {
  const all = points(TOY_CURVE);
  const orbit = subgroup(TOY_CURVE, TOY_BASE);
  const svg = renderLatticeSVG({
    p: 17,
    points: all,
    orbit,
    highlight: orbit[5],
    infinity: { label: '9G' },
    id: 'toy',
    title: 'T',
    desc: 'D',
  });
  assert.ok(svg.startsWith('<svg') && svg.includes('role="img"'));
  assert.ok(svg.includes('<title id="toy-title">T</title>') && svg.includes('<desc id="toy-desc">D</desc>'));
  assert.equal(count(svg, 'class="lat__point'), 17);
  assert.equal(count(svg, 'is-orbit'), 8);
  assert.equal(count(svg, 'is-highlight'), 1);
  assert.ok(svg.includes('data-x="5" data-y="8"'));
  assert.equal(count(svg, 'class="lat__label"'), 8);
  assert.ok(svg.includes('>6G<') && svg.includes('>G<'));
  assert.equal(count(svg, 'class="lat__mirror"'), 1);
  assert.equal(count(svg, 'class="lat__infinity"'), 1);
  assert.ok(svg.includes('>9G<'));
  const frame = svg.match(/class="lat__frame" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
  for (const m of svg.matchAll(/class="lat__point[^"]*"[^>]*cx="([\d.]+)" cy="([\d.]+)"/g)) {
    const [cx, cy] = [Number(m[1]), Number(m[2])];
    assert.ok(cx > frame[0] && cx < frame[0] + frame[2] && cy > frame[1] && cy < frame[1] + frame[3], `(${cx}, ${cy}) inside`);
  }
  for (const m of svg.matchAll(/class="lat__infinity"[^>]*>\s*<rect x="([\d.]+)"/g)) assert.ok(Number(m[1]) > frame[0] + frame[2], 'O sits outside the plot');
});

test('one group operation draws its wrapped line, the third point, the drop and the result', () => {
  const orbit = subgroup(TOY_CURVE, TOY_BASE);
  const step = addStep(TOY_CURVE, orbit[4], TOY_BASE); // 5G + G
  const svg = renderLatticeSVG({
    p: 17,
    points: points(TOY_CURVE),
    orbit,
    line: { lambda: step.lambda, nu: step.nu },
    third: step.third,
    result: step.result,
    id: 'op',
    title: 'T',
    desc: 'D',
  });
  assert.equal(count(svg, 'class="lat__segment"'), 2);
  assert.ok(svg.includes('data-seg="0"') && svg.includes('data-seg="1"'));
  assert.equal(count(svg, 'class="lat__linepoint"'), 17, 'the line passes through p lattice points');
  assert.equal(count(svg, 'class="lat__third"'), 1);
  assert.equal(count(svg, 'class="lat__drop"'), 1);
  assert.equal(count(svg, 'class="lat__result"'), 1);
  assert.ok(/class="lat__third"[^>]*data-x="5" data-y="9"/.test(svg), 'R′ = (5, 9)');
  assert.ok(/class="lat__result"[^>]*data-x="5" data-y="8"/.test(svg), '6G = (5, 8)');
  const vertical = renderLatticeSVG({ p: 17, points: [], line: { vertical: true, x: 3n }, id: 'v', title: 'T', desc: 'D' });
  assert.equal(count(vertical, 'class="lat__segment"'), 1);
});

/**
 * The real-curve figure of the group law: the drawn curve must be finite and
 * must contain both branches, including at the cusp x = −∛7 where the
 * radicand x³ + 7 rounds slightly below zero in floating point.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESET, X_MIN, curveY, renderGroupLawSVG } from '../src/hw01/group-law.js';

const curvePath = (svg) => {
  const match = /class="gl__curve" d="([^"]*)"/.exec(svg);
  assert.ok(match, 'the SVG contains the curve path');
  return match[1];
};

test('curveY is finite and zero at the cusp', () => {
  assert.equal(curveY(X_MIN), 0);
  assert.ok(Number.isFinite(curveY(X_MIN + 1e-9)));
  assert.ok(Math.abs(curveY(0) - Math.sqrt(7)) < 1e-12);
});

test('the SVG of every mode contains no NaN', () => {
  for (const mode of ['add', 'double']) {
    const svg = renderGroupLawSVG({ ...PRESET, mode, id: 'gl' });
    assert.ok(!svg.includes('NaN'), `no NaN in the ${mode} figure`);
  }
});

test('the curve path has two mirror-image branches meeting at the cusp', () => {
  const svg = renderGroupLawSVG({ ...PRESET, mode: 'add', id: 'gl' });
  const d = curvePath(svg);
  assert.equal(d[0], 'M');
  assert.equal((d.match(/M/g) ?? []).length, 1, 'a single subpath');
  const points = d
    .slice(1)
    .split('L')
    .map((pair) => pair.split(',').map(Number));
  assert.ok(points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  assert.equal(points.length, 2 * 241, 'upper and lower branch, 241 samples each');
  const half = points.length / 2;
  const cusp = points[half - 1];
  assert.deepEqual(points[half], cusp, 'the branches share the cusp');
  for (let i = 0; i < half; i += 1) {
    const [xu, yu] = points[i];
    const [xl, yl] = points[points.length - 1 - i];
    assert.ok(Math.abs(xu - xl) < 0.11, `abscissas agree at sample ${i}`);
    assert.ok(Math.abs(yu + yl - 2 * cusp[1]) < 0.11, `ordinates mirror in the x-axis at sample ${i}`);
    assert.ok(yu <= cusp[1], 'the first branch lies above the axis');
    assert.ok(yl >= cusp[1], 'the second branch lies below the axis');
  }
  assert.ok(points[0][1] < cusp[1] && points.at(-1)[1] > cusp[1], 'the branches leave the axis');
});

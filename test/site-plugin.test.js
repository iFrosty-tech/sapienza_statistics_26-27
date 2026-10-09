/**
 * The build plugin's figure-provider hook: marker replacement and token
 * namespacing are pure helpers, tested without running Vite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFigureMarkers, figureTokens } from '../src/build/site-plugin.js';

test('@figure markers are replaced by the provider html', () => {
  const html = '<div><!-- @figure id=alpha --></div><p><!--@figure id=beta--></p>';
  const out = applyFigureMarkers(html, { alpha: '<svg a/>', beta: '<svg b/>' }, 'homework/01/index.html');
  assert.equal(out, '<div><svg a/></div><p><svg b/></p>');
});

test('a marker without a provided figure fails the build with the file and id named', () => {
  assert.throws(
    () => applyFigureMarkers('<!-- @figure id=missing -->', { alpha: '' }, 'homework/01/index.html'),
    /homework\/01\/index\.html.*"missing"/,
  );
});

test('figure tokens are namespaced under fig. and validated', () => {
  assert.deepEqual(figureTokens({ 'avalanche.scalar.p': '0.412', 'sac.n': '48' }), {
    'fig.avalanche.scalar.p': '0.412',
    'fig.sac.n': '48',
  });
  assert.throws(() => figureTokens({ 'bad-key': '1' }), /bad-key/);
  assert.throws(() => figureTokens({ ok: 1 }), /string/);
});

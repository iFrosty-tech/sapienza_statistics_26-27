/**
 * Caption statistics of the homework figures: the exact discrete tail used to
 * label the strict-avalanche matrix, and the p-value formatting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactTwoSidedTail, formatP, statsOf } from '../src/hw01/render.js';

test('exact two-sided tail of Bin(trials, ½) beyond 1.96 standard deviations', () => {
  // Bin(48, ½): sd = √12 ≈ 3.464, so |k − 24| > 6.79 means k ≤ 17 or k ≥ 31.
  assert.ok(Math.abs(exactTwoSidedTail(48) - 0.0595) < 0.0005);
  // Bin(8, ½): sd = √2, so |k − 4| > 2.77 means k ≤ 1 or k ≥ 7: 2 · (1 + 8) / 256.
  assert.ok(Math.abs(exactTwoSidedTail(8) - 18 / 256) < 1e-12);
  // A very large number of trials approaches the normal 5%.
  assert.ok(Math.abs(exactTwoSidedTail(4000) - 0.05) < 0.003);
});

test('strict-avalanche statistics quote the exact expected proportion', () => {
  const stats = statsOf('sac', {
    variant: 'sha256',
    seed: 1,
    trials: 48,
    inputBits: 256,
    mean: 0.5,
    min: 0.3,
    max: 0.7,
    maxAbsZ: 3.1,
    fractionBeyondTwoSigma: 0.06,
  });
  assert.equal(stats.expectedBeyondTwoSigma, '5.95');
  assert.equal(stats.beyondTwoSigma, '6.0');
  assert.equal(stats.cells, '65536');
});

test('p-values print to three decimals or as a bound', () => {
  assert.equal(formatP(0.0011), '0.001');
  assert.equal(formatP(0.0004), '< 0.001');
  assert.equal(formatP(0.5), '0.500');
  assert.equal(formatP(NaN), 'n/a');
});

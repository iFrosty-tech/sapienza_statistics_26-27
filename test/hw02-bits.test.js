import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bitString, hexToBitString, onesRuns, stripFraction, bitDistance, digitDiff, PIPELINE_MAX_BITS } from '../src/hw02/bits.js';

test('bitString reads every byte most significant bit first', () => {
  assert.equal(bitString(Uint8Array.from([0x80, 0x01])), '1000000000000001');
  assert.equal(bitString(new Uint8Array(0)), '');
  assert.equal(hexToBitString('a5'), '10100101');
  assert.equal(hexToBitString('0x0f'), '00001111');
});

test('onesRuns merges consecutive 1-bits into [start, length] runs', () => {
  assert.deepEqual(onesRuns('0110111001'), [
    [1, 2],
    [4, 3],
    [9, 1],
  ]);
  assert.deepEqual(onesRuns('0000'), []);
  assert.deepEqual(onesRuns('1111'), [[0, 4]]);
});

test('a bit strip is as wide as its share of the largest stage', () => {
  assert.equal(PIPELINE_MAX_BITS, 512);
  assert.equal(stripFraction(512), 1);
  assert.equal(stripFraction(128), 0.25);
  assert.equal(stripFraction(160), 0.3125);
  assert.equal(stripFraction(1024), 1, 'clamped at the track width');
  assert.equal(stripFraction(0), 0);
});

test('bitDistance counts differing bits of two bit strings or byte strings', () => {
  assert.equal(bitDistance('1010', '1001'), 2);
  assert.equal(bitDistance(Uint8Array.from([0xff, 0x00]), Uint8Array.from([0x0f, 0x01])), 5);
  assert.throws(() => bitDistance('10', '101'), /same length/);
});

test('digitDiff lists the hex digits that changed and counts the changed bits', () => {
  const d = digitDiff('00ff', '01fe');
  assert.deepEqual(d.digits, [1, 3]);
  assert.equal(d.bits, 2);
  const none = digitDiff('abcd', 'abcd');
  assert.deepEqual(none.digits, []);
  assert.equal(none.bits, 0);
  // Without a previous value nothing is marked as changed.
  assert.deepEqual(digitDiff('', 'abcd'), { digits: [], bits: null });
  assert.throws(() => digitDiff('ab', 'abc'), /same length/);
});

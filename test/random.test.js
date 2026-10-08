import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/lib/random.js';

test('createRandom is deterministic for a seed', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  assert.deepEqual([...a.bytes(16)], [...b.bytes(16)]);
  assert.equal(a.uniform(), b.uniform());
  assert.equal(a.int(1000), b.int(1000));
  assert.equal(a.seed, 42);
});

test('values are in range and the byte stream is not degenerate', () => {
  const r = createRandom(7);
  const bytes = r.bytes(4096);
  assert.equal(bytes.length, 4096);
  assert.ok(new Set(bytes).size > 200, 'all byte values should appear in 4096 draws');
  for (let i = 0; i < 1000; i += 1) {
    const u = r.uniform();
    assert.ok(u >= 0 && u < 1);
    const k = r.int(10);
    assert.ok(Number.isInteger(k) && k >= 0 && k < 10);
  }
});

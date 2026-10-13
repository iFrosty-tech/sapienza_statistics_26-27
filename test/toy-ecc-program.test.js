/**
 * The standalone program public/homework/01/toy-ecc.html.
 *
 * Its single inline script is executed in a fresh node:vm context, where
 * `document` is undefined, so only the pure functions run. Values returned from
 * the context belong to another realm, so points are compared through their
 * coordinates or their printed form, never with deepEqual on objects.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TOY_CURVE, TOY_BASE, points, orderOf, multiply, formatPoint } from '../src/lib/toy-curve.js';

const html = readFileSync(new URL('../public/homework/01/toy-ecc.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

function loadProgram() {
  const context = vm.createContext({});
  vm.runInContext(scripts[0], context);
  return context;
}

const G = TOY_BASE;

const ASSIGNMENT_OUTPUT = [
  'G = (1, 5)',
  '2G = (2, 10)',
  '3G = (5, 9)',
  '4G = (12, 1)',
  '5G = (12, 16)',
  '6G = (5, 8)',
  '',
  'TOY PUBLIC KEY: Q = 6G = (5, 8)',
].join('\n');

test('the program is one self-contained file', () => {
  assert.equal(scripts.length, 1, 'exactly one inline script');
  assert.equal((html.match(/<style>/g) ?? []).length, 1, 'exactly one inline style sheet');
  assert.ok(!/<script[^>]*\bsrc=/.test(html), 'no external script');
  assert.ok(!/<link\b/.test(html), 'no external style sheet or font');
  assert.ok(!/https?:\/\//.test(html), 'no network resource');
  assert.ok(!/^\s*import\b/m.test(scripts[0]), 'no module import');
  assert.match(html, /<html lang="en">/);
});

test('the constants mirror the assignment: p = 17, a = 0, b = 7, G = (1, 5), k = 6', () => {
  const program = loadProgram();
  assert.deepEqual([...vm.runInContext('[p, a, b, G.x, G.y, k]', program)], [17n, 0n, 7n, 1n, 5n, 6n]);
  assert.match(scripts[0], /Define the toy curve and the base point G\./);
  assert.match(scripts[0], /Define the private key k\./);
});

test('repeated addition prints G, 2G, …, 6G and the toy public key (5, 8)', () => {
  const program = loadProgram();
  const multiples = program.scalarMultiplyNaive(6n, G);
  assert.deepEqual([...multiples].map(formatPoint), ['(1, 5)', '(2, 10)', '(5, 9)', '(12, 1)', '(12, 16)', '(5, 8)']);
  assert.equal(program.report(6n, G, 'repeated-addition'), ASSIGNMENT_OUTPUT);
  assert.equal(program.formatPoint(null), 'O');
  assert.ok(program.isOnCurve({ x: 5n, y: 8n }));
  assert.ok(!program.isOnCurve({ x: 5n, y: 7n }));
});

test('double-and-add: k = 6 and k = 1234', () => {
  const program = loadProgram();
  const six = program.scalarMultiplyDoubleAndAdd(6n, G);
  assert.equal(six.bits, '110');
  assert.equal(program.formatPoint(six.result), '(5, 8)');
  assert.deepEqual([...six.trace].map((step) => `${step.op} ${step.index}`), ['double 2', 'add 3', 'double 6']);

  const printed = program.report(6n, G, 'double-and-add').split('\n');
  assert.ok(printed.some((line) => line.includes('110')), 'the binary expansion is printed');
  assert.equal(printed.at(-1), 'TOY PUBLIC KEY: Q = 6G = (5, 8)');
  assert.equal(printed.at(-2), '');

  const big = program.scalarMultiplyDoubleAndAdd(1234n, G);
  assert.equal(big.bits, '10011010010');
  assert.equal(big.trace.length, 10 + 4, '10 doublings and 4 additions');
  assert.equal(program.formatPoint(big.result), formatPoint(multiply(TOY_CURVE, G, 1234n)));
  assert.equal(program.formatPoint(big.result), '(1, 5)', '1234 ≡ 1 (mod 9)');
});

test('the program agrees with toy-curve.js for every base point and k = 1 … 40', () => {
  const program = loadProgram();
  const all = points(TOY_CURVE);
  assert.deepEqual([...program.curvePoints()].map(formatPoint), all.map(formatPoint));
  for (const P of all) {
    assert.equal(BigInt(program.orderOf(P)), orderOf(TOY_CURVE, P), `order of ${formatPoint(P)}`);
    const naive = program.scalarMultiplyNaive(40n, P);
    for (let k = 1n; k <= 40n; k += 1n) {
      const expected = formatPoint(multiply(TOY_CURVE, P, k));
      const label = `${k}·${formatPoint(P)}`;
      assert.equal(formatPoint(naive[Number(k) - 1]), expected, `${label} by repeated addition`);
      assert.equal(formatPoint(program.scalarMultiplyDoubleAndAdd(k, P).result), expected, `${label} by double-and-add`);
    }
  }
});

test('k = 9 with G = (1, 5) reaches the point at infinity, which is not a public key', () => {
  const program = loadProgram();
  assert.equal(program.scalarMultiplyNaive(9n, G).at(-1), null);
  assert.equal(program.scalarMultiplyDoubleAndAdd(9n, G).result, null);
  for (const method of ['repeated-addition', 'double-and-add']) {
    const printed = program.report(9n, G, method);
    assert.match(printed, /9G = O \(point at infinity\)/);
    assert.match(printed, /not a valid public key/);
    assert.doesNotMatch(printed, /TOY PUBLIC KEY/);
  }
});

test('input validation', () => {
  const program = loadProgram();
  assert.equal(program.parseScalar('6', 'repeated-addition'), 6n);
  assert.equal(program.parseScalar(' 42 ', 'double-and-add'), 42n);
  assert.equal(program.parseScalar('10000', 'repeated-addition'), 10000n);
  assert.equal(program.parseScalar('10001', 'double-and-add'), 10001n);
  for (const text of ['', '0', '-3', '2.5', 'abc', '1e3']) {
    assert.throws(() => program.parseScalar(text, 'double-and-add'), /k must be/, JSON.stringify(text));
  }
  assert.throws(() => program.parseScalar('10001', 'repeated-addition'), /double-and-add/);
});

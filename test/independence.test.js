import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chiSquareIndependence,
  conditionalByColumn,
  conditionalByRow,
  contingencyTable,
  cramersV,
  expandRecords,
  expectedFrequencies,
  jointFrequencies,
  margins,
  permutationTest,
} from '../src/lib/independence.js';
import { CLASSES, SEX, records } from '../src/data/titanic.js';
import { createRandom } from '../src/lib/random.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const plain = (counts) => counts.map((r) => [...r]);

test('the contingency table is built from the records and equals the counts they came from', () => {
  const sample = records(CLASSES);
  assert.equal(sample.length, 2201);
  assert.deepEqual(contingencyTable(sample, CLASSES.xLevels, CLASSES.fLevels), plain(CLASSES.counts));
});

test('a record outside the levels is an error, not a dropped row', () => {
  assert.throws(() => contingencyTable([{ x: 'Fourth', f: 'Died' }], ['First'], ['Died']), RangeError);
});

test('margins, joint and conditional frequencies are consistent', () => {
  const table = [[10, 20], [30, 40]];
  assert.deepEqual(margins(table), { rows: [30, 70], cols: [40, 60], n: 100 });
  const joint = jointFrequencies(table);
  assert.deepEqual(joint.rows, [0.3, 0.7]);
  assert.deepEqual(joint.cols, [0.4, 0.6]);
  close(joint.cells.flat().reduce((a, b) => a + b, 0), 1);
  for (const row of conditionalByRow(table)) close(row.reduce((a, b) => a + b, 0), 1);
  const byColumn = conditionalByColumn(table);
  close(byColumn[0][0] + byColumn[1][0], 1);
  close(byColumn[0][1] + byColumn[1][1], 1);
  assert.deepEqual(conditionalByRow(table)[0], [1 / 3, 2 / 3]);
});

test('the expected frequencies keep both margins and equal n times the product of the marginal frequencies', () => {
  const table = plain(CLASSES.counts);
  const expected = expectedFrequencies(table);
  const observed = margins(table);
  const kept = margins(expected);
  observed.rows.forEach((r, i) => close(kept.rows[i], r));
  observed.cols.forEach((c, j) => close(kept.cols[j], c));
  close(expected[0][1], (325 * 711) / 2201);
});

test('a table that is exactly independent has statistic 0 and p-value 1', () => {
  const result = chiSquareIndependence([[10, 20], [20, 40]]);
  close(result.statistic, 0);
  assert.equal(result.df, 1);
  close(result.pValue, 1, 1e-9);
});

test('worked 2 x 2 example: expected frequencies, statistic and degrees of freedom', () => {
  // Margins 50/75 and 50/75 of 125 give E = [[20, 30], [30, 45]], every deviation being 10.
  const result = chiSquareIndependence([[30, 20], [20, 55]]);
  const expected = [[20, 30], [30, 45]];
  result.expected.forEach((row, i) => row.forEach((e, j) => close(e, expected[i][j])));
  close(result.statistic, 100 / 20 + 100 / 30 + 100 / 30 + 100 / 45);
  assert.equal(result.df, 1);
  assert.ok(result.pValue > 0 && result.pValue < 0.001);
});

test('Titanic: class and survival are dependent (statistic 190.4 on 3 degrees of freedom)', () => {
  const result = chiSquareIndependence(plain(CLASSES.counts));
  assert.equal(result.df, 3);
  assert.equal(result.statistic.toFixed(1), '190.4');
  assert.ok(result.pValue < 1e-30);
  assert.ok(result.minExpected > 5);
  assert.equal(cramersV(result.statistic, result.n, 4, 2).toFixed(3), '0.294');
});

test('Titanic: sex and survival are associated more strongly than class and survival', () => {
  const result = chiSquareIndependence(plain(SEX.counts));
  assert.equal(result.df, 1);
  assert.equal(result.statistic.toFixed(1), '456.9');
  assert.equal(cramersV(result.statistic, result.n, 2, 2).toFixed(3), '0.456');
});

test('the expansion of a table keeps its counts', () => {
  assert.equal(expandRecords([[2, 1]], ['a'], ['u', 'v']).length, 3);
});

test('permutation test: the observed statistic is the chi-square statistic, and the p-value is at least 1 / (B + 1)', () => {
  const { uniform } = createRandom(7);
  const { statistics, observed, pValue } = permutationTest(records(CLASSES), CLASSES.xLevels, CLASSES.fLevels, { replicates: 200, uniform });
  close(observed, chiSquareIndependence(plain(CLASSES.counts)).statistic, 1e-8);
  assert.equal(statistics.length, 200);
  assert.equal(pValue, 1 / 201);
});

test('permutation test: under independence the mean statistic is near the degrees of freedom', () => {
  const independent = { xLevels: ['a', 'b', 'c'], fLevels: ['u', 'v'], counts: [[50, 50], [100, 100], [30, 30]] };
  const { uniform } = createRandom(11);
  const { statistics, observed } = permutationTest(records(independent), independent.xLevels, independent.fLevels, { replicates: 1000, uniform });
  close(observed, 0, 1e-9);
  const mean = statistics.reduce((a, b) => a + b, 0) / statistics.length;
  assert.ok(Math.abs(mean - 2) < 0.25, `mean ${mean}`);
});

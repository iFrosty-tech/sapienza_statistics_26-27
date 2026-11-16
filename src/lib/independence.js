/**
 * Tests of independence for a bivariate sample of two categorical variables
 * (X, F): the contingency table built from the records, its marginal, joint and
 * conditional frequencies, the frequencies expected under independence, Pearson's
 * chi-square statistic with its p-value, the standardised residuals, Cramér's V,
 * and a permutation test that needs no asymptotic argument.
 *
 * Pure and dependency-light; runs in Node at build time and in the browser.
 */

import { chiSquareSf } from './stats.js';

/**
 * The contingency table of a sample: cell [i][j] counts the records with
 * X = xLevels[i] and F = fLevels[j]. A record whose value is not in its list of
 * levels is an error, never silently dropped.
 * @param {{ x: string, f: string }[]} records
 * @param {string[]} xLevels
 * @param {string[]} fLevels
 * @returns {number[][]}
 */
export function contingencyTable(records, xLevels, fLevels) {
  const table = xLevels.map(() => fLevels.map(() => 0));
  for (const { x, f } of records) {
    const i = xLevels.indexOf(x);
    const j = fLevels.indexOf(f);
    if (i < 0 || j < 0) throw new RangeError(`contingencyTable: unknown level in record (${x}, ${f}).`);
    table[i][j] += 1;
  }
  return table;
}

/** The sample behind a table: one record per count, in row-major order. */
export function expandRecords(table, xLevels, fLevels) {
  const records = [];
  table.forEach((row, i) =>
    row.forEach((count, j) => {
      for (let k = 0; k < count; k += 1) records.push({ x: xLevels[i], f: fLevels[j] });
    }),
  );
  return records;
}

/** Row totals n_i., column totals n_.j and the sample size n. */
export function margins(table) {
  const rows = table.map((row) => row.reduce((a, b) => a + b, 0));
  const cols = table[0].map((_, j) => table.reduce((sum, row) => sum + row[j], 0));
  return { rows, cols, n: rows.reduce((a, b) => a + b, 0) };
}

/** Joint relative frequencies f_ij = n_ij / n, with the marginal frequencies f_i. and f_.j. */
export function jointFrequencies(table) {
  const { rows, cols, n } = margins(table);
  return { cells: table.map((row) => row.map((c) => c / n)), rows: rows.map((r) => r / n), cols: cols.map((c) => c / n) };
}

/** Distribution of F within each level of X: f(j | i) = n_ij / n_i. (each row sums to 1). */
export function conditionalByRow(table) {
  const { rows } = margins(table);
  return table.map((row, i) => row.map((c) => c / rows[i]));
}

/** Distribution of X within each level of F: f(i | j) = n_ij / n_.j (each column sums to 1). */
export function conditionalByColumn(table) {
  const { cols } = margins(table);
  return table.map((row) => row.map((c, j) => c / cols[j]));
}

/** Expected frequencies under independence, E_ij = n_i. n_.j / n. */
export function expectedFrequencies(table) {
  const { rows, cols, n } = margins(table);
  return rows.map((r) => cols.map((c) => (r * c) / n));
}

/**
 * Pearson's chi-square test of independence.
 * @param {number[][]} table
 * @returns {{ statistic: number, df: number, pValue: number, expected: number[][], contributions: number[][],
 *   residuals: number[][], minExpected: number, n: number }}
 */
export function chiSquareIndependence(table) {
  const expected = expectedFrequencies(table);
  const { n } = margins(table);
  const contributions = table.map((row, i) => row.map((o, j) => (o - expected[i][j]) ** 2 / expected[i][j]));
  const residuals = table.map((row, i) => row.map((o, j) => (o - expected[i][j]) / Math.sqrt(expected[i][j])));
  const statistic = contributions.flat().reduce((a, b) => a + b, 0);
  const df = (table.length - 1) * (table[0].length - 1);
  return {
    statistic,
    df,
    pValue: chiSquareSf(statistic, df),
    expected,
    contributions,
    residuals,
    minExpected: Math.min(...expected.flat()),
    n,
  };
}

/** Cramér's V = sqrt(χ² / (n (min(r, c) − 1))), in [0, 1]. */
export function cramersV(statistic, n, rowCount, colCount) {
  return Math.sqrt(statistic / (n * (Math.min(rowCount, colCount) - 1)));
}

/**
 * The permutation distribution of the chi-square statistic: the labels of F are
 * shuffled over the records, which breaks any link with X while keeping both
 * margins fixed, and the statistic is recomputed on each shuffle.
 * @param {{ x: string, f: string }[]} records
 * @param {string[]} xLevels
 * @param {string[]} fLevels
 * @param {{ replicates: number, uniform: () => number }} options `uniform` is a source of numbers in [0, 1)
 * @returns {{ statistics: Float64Array, pValue: number, observed: number }}
 *   pValue = (1 + #{T* ≥ T}) / (B + 1), the smallest value it can take being 1 / (B + 1)
 */
export function permutationTest(records, xLevels, fLevels, { replicates, uniform }) {
  const xs = Int32Array.from(records, (r) => xLevels.indexOf(r.x));
  const fs = Int32Array.from(records, (r) => fLevels.indexOf(r.f));
  const n = xs.length;
  const r = xLevels.length;
  const c = fLevels.length;
  const rows = new Float64Array(r);
  const cols = new Float64Array(c);
  for (let k = 0; k < n; k += 1) {
    rows[xs[k]] += 1;
    cols[fs[k]] += 1;
  }
  const statisticOf = (labels) => {
    const counts = new Float64Array(r * c);
    for (let k = 0; k < n; k += 1) counts[xs[k] * c + labels[k]] += 1;
    let t = 0;
    for (let i = 0; i < r; i += 1) {
      for (let j = 0; j < c; j += 1) {
        const e = (rows[i] * cols[j]) / n;
        t += (counts[i * c + j] - e) ** 2 / e;
      }
    }
    return t;
  };
  const observed = statisticOf(fs);
  const labels = Int32Array.from(fs);
  const statistics = new Float64Array(replicates);
  let atLeast = 0;
  for (let b = 0; b < replicates; b += 1) {
    for (let k = n - 1; k > 0; k -= 1) {
      const m = Math.floor(uniform() * (k + 1));
      const t = labels[k];
      labels[k] = labels[m];
      labels[m] = t;
    }
    statistics[b] = statisticOf(labels);
    if (statistics[b] >= observed) atLeast += 1;
  }
  return { statistics, observed, pValue: (1 + atLeast) / (replicates + 1) };
}

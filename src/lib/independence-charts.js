/**
 * The build-time tables and charts of homework 5 (statistical independence):
 * the contingency table with its margins, the joint and conditional
 * frequencies, the expected frequencies, the contribution of each cell to the
 * chi-square statistic, the summary of the tests, the conditional rates against
 * the marginal rate, and the permutation distribution of the statistic against
 * the chi-square law.
 */

import { renderHistogram } from './charts.js';
import { fmt, int, sci } from './penetration-charts.js';
import { tex } from './welford-charts.js';
import { chiSquareCdf } from './stats.js';
import { conditionalByColumn, conditionalByRow, jointFrequencies, margins } from './independence.js';

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s, cls = 'is-number') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
const table = (cls, head, rows) =>
  `<table class="data-table data-table--hw04 data-table--compact ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const percent = (v, digits = 1) => `${fmt(100 * v, digits)}%`;
const signed = (v, digits = 2) => (v < 0 ? `−${fmt(-v, digits)}` : `+${fmt(v, digits)}`);

/** The header row shared by the tables with one column per level of F, a total column and the label of X. */
function head(data, { total = 'Total' } = {}) {
  return [th(data.xName), ...data.fLevels.map((f) => th(f, 'is-number')), th(total, 'is-number')];
}

/** Table 1: the contingency table with the row and column totals. */
export function renderObservedTable(data, counts) {
  const { rows, cols, n } = margins(counts);
  const body = counts.map((row, i) => `<tr><th scope="row">${data.xLevels[i]}</th>${row.map((c) => td(int(c))).join('')}${td(int(rows[i]))}</tr>`);
  body.push(`<tr class="data-table__total"><th scope="row">Total</th>${cols.map((c) => td(int(c))).join('')}${td(int(n))}</tr>`);
  return table('data-table--independence', head(data), body);
}

/** Table 2: the joint relative frequencies, with the marginal frequencies in the last row and column. */
export function renderJointTable(data, counts) {
  const joint = jointFrequencies(counts);
  const body = joint.cells.map((row, i) => `<tr><th scope="row">${data.xLevels[i]}</th>${row.map((f) => td(fmt(f, 4))).join('')}${td(fmt(joint.rows[i], 4))}</tr>`);
  body.push(`<tr class="data-table__total"><th scope="row">Marginal</th>${joint.cols.map((f) => td(fmt(f, 4))).join('')}${td('1.0000')}</tr>`);
  return table('data-table--independence', head(data, { total: 'Marginal' }), body);
}

/** Table 3: the distribution of F within each level of X, against its marginal distribution. */
export function renderConditionalTable(data, counts) {
  const { cols, n } = margins(counts);
  const conditional = conditionalByRow(counts);
  const body = conditional.map((row, i) => `<tr><th scope="row">${data.xLevels[i]}</th>${row.map((f) => td(percent(f))).join('')}${td('100.0%')}</tr>`);
  body.push(`<tr class="data-table__total"><th scope="row">All</th>${cols.map((c) => td(percent(c / n))).join('')}${td('100.0%')}</tr>`);
  return table('data-table--independence', head(data), body);
}

/** Table 4: the distribution of X within each level of F, against its marginal distribution. */
export function renderConditionalByFactorTable(data, counts) {
  const { rows, n } = margins(counts);
  const conditional = conditionalByColumn(counts);
  const body = conditional.map((row, i) => `<tr><th scope="row">${data.xLevels[i]}</th>${row.map((f) => td(percent(f))).join('')}${td(percent(rows[i] / n))}</tr>`);
  body.push(`<tr class="data-table__total"><th scope="row">Total</th>${data.fLevels.map(() => td('100.0%')).join('')}${td('100.0%')}</tr>`);
  return table('data-table--independence', head(data, { total: 'All' }), body);
}

/** Table 5: the expected frequencies under independence, with the margins they share with Table 1. */
export function renderExpectedTable(data, result, counts) {
  const { rows, cols, n } = margins(counts);
  const body = result.expected.map((row, i) => `<tr><th scope="row">${data.xLevels[i]}</th>${row.map((e) => td(fmt(e, 2))).join('')}${td(int(rows[i]))}</tr>`);
  body.push(`<tr class="data-table__total"><th scope="row">Total</th>${cols.map((c) => td(int(c))).join('')}${td(int(n))}</tr>`);
  return table('data-table--independence', head(data), body);
}

/** Table 6: for each cell the observed and expected counts, its contribution and its standardised residual. */
export function renderCellsTable(data, counts, result) {
  const header = [
    th(data.xName),
    th(data.fName),
    th(tex('O_{ij}'), 'is-number'),
    th(tex('E_{ij}'), 'is-number'),
    th(tex(String.raw`(O_{ij}-E_{ij})^2/E_{ij}`), 'is-number'),
    th(tex(String.raw`(O_{ij}-E_{ij})/\sqrt{E_{ij}}`), 'is-number'),
  ];
  const body = [];
  counts.forEach((row, i) =>
    row.forEach((o, j) => {
      body.push(
        `<tr><th scope="row">${data.xLevels[i]}</th>${td(data.fLevels[j], '')}${td(int(o))}${td(fmt(result.expected[i][j], 2))}${td(fmt(result.contributions[i][j], 2))}${td(signed(result.residuals[i][j]))}</tr>`,
      );
    }),
  );
  body.push(`<tr class="data-table__total"><th scope="row" colspan="2">Sum</th>${td(int(result.n))}${td(int(result.n))}${td(fmt(result.statistic, 2))}${td('')}</tr>`);
  return table('data-table--independence data-table--cells', header, body);
}

/** Table 7: the results of the tests, one row per pair of variables. */
export function renderSummaryTable(rows) {
  const header = [
    th('Pair'),
    th(tex(String.raw`\chi^2`), 'is-number'),
    th('df', 'is-number'),
    th(tex('p'), 'is-number'),
    th(tex('V'), 'is-number'),
    th('Smallest ' + tex('E_{ij}'), 'is-number'),
    th('Permutation ' + tex('p'), 'is-number'),
  ];
  const body = rows.map(
    (r) =>
      `<tr><th scope="row">${r.name}</th>${td(fmt(r.statistic, 1))}${td(String(r.df))}${td(sci(r.pValue, 2))}${td(fmt(r.v, 3))}${td(fmt(r.minExpected, 1))}${td(r.permutationP)}</tr>`,
  );
  return table('data-table--independence', header, body);
}

/** Fig. 1: the rate of one outcome in each level of X, against its marginal rate. */
export function renderRates({ data, counts, level, id, width }) {
  const j = data.fLevels.indexOf(level);
  const { rows, cols, n } = margins(counts);
  return renderHistogram({
    id,
    width,
    height: 340,
    title: `${level} by ${data.xName.toLowerCase()}`,
    desc: `Percentage of each ${data.xName.toLowerCase()} with the outcome ${level.toLowerCase()}, as bars, against the percentage in the whole sample, ${percent(cols[j] / n)}, as a stepped line. ${data.xLevels
      .map((x, i) => `${x}: ${percent(counts[i][j] / rows[i])}`)
      .join('; ')}.`,
    bins: data.xLevels.map((x, i) => ({ label: x, observed: (100 * counts[i][j]) / rows[i], expected: (100 * cols[j]) / n })),
    xLabel: data.xName,
    yLabel: `${level} (%)`,
    yMax: 100,
  });
}

/** Fig. 2: the permutation distribution of the statistic against the density of the chi-square law, in counts. */
export function renderPermutation({ statistics, df, id, width, bins = 16, binWidth = 1 }) {
  const edges = Array.from({ length: bins + 1 }, (_, k) => k * binWidth);
  const counts = new Array(bins).fill(0);
  let beyond = 0;
  for (const t of statistics) {
    const k = Math.floor(t / binWidth);
    if (k < bins) counts[k] += 1;
    else beyond += 1;
  }
  const total = statistics.length;
  const bars = counts.map((observed, k) => ({
    label: String(edges[k]),
    observed,
    expected: total * (chiSquareCdf(edges[k + 1], df) - chiSquareCdf(edges[k], df)),
  }));
  return {
    beyond,
    svg: renderHistogram({
      id,
      width,
      height: 340,
      title: 'Permutation distribution of the chi-square statistic',
      desc: `Histogram of the chi-square statistic over ${int(total)} random permutations of the labels, in bins of width ${binWidth} from 0 to ${bins}, as bars, against the counts expected under the chi-square law with ${df} degrees of freedom, as a stepped line. ${int(beyond)} of the ${int(total)} values exceed ${bins}.`,
      bins: bars,
      xLabel: 'Chi-square statistic',
      yLabel: 'Permutations',
      labelEvery: 2,
    }),
  };
}

/**
 * Build-time figure provider of homework 6, statistical independence (called by
 * src/build/site-plugin.js).
 *
 * The contingency table is constructed from a sample of 2,201 records (X, F), the
 * Titanic data set of src/data/titanic.js, and everything on the page follows from
 * it: the margins, the joint and conditional frequencies, the frequencies expected
 * under independence, Pearson's statistic with its p-value and Cramér's V, and a
 * permutation test in which the labels of F are shuffled PARAMS.replicates times.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/08/index.html)
 *   observed     Table 1, the contingency table of class by outcome, with its margins
 *   joint        Table 2, the joint and marginal relative frequencies
 *   byClass      Table 3, the outcome within each class
 *   byOutcome    Table 4, the class within each outcome
 *   expected     Table 5, the frequencies expected under independence
 *   cells        Table 6, each cell's contribution to the statistic and its residual
 *   summary      Table 7, the tests of class by outcome and of sex by outcome
 *   rates        Fig. 1, the rate of survival in each class against the overall rate
 *   permutation  Fig. 2, the permutation distribution of the statistic against the χ² law
 *   parameters   Table A1, the parameters of the computation
 *
 * Tokens ({{fig.<key>}}); every value is a display string.
 *   data.{n, died, survived, diedShare, survivedShare}
 *   class.{chi, df, p, v, minExpected, permP, permMean, permMax, beyond, top.*, rate.<level>, share.<level>}
 *   sex.{chi, df, p, v, minExpected, permP, rate.<level>}
 *   params.{seed, replicates}
 */

import { CLASSES, SEX, records } from '../../src/data/titanic.js';
import { chiSquareIndependence, contingencyTable, cramersV, margins, permutationTest } from '../../src/lib/independence.js';
import {
  renderCellsTable,
  renderConditionalByFactorTable,
  renderConditionalTable,
  renderExpectedTable,
  renderJointTable,
  renderObservedTable,
  renderPermutation,
  renderRates,
  renderSummaryTable,
} from '../../src/lib/independence-charts.js';
import { createRandom } from '../../src/lib/random.js';
import { fmt, int, renderParametersTable, sci } from '../../src/lib/penetration-charts.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  seed: 20261116, // the master seed; the sex test uses seed + 1
  replicates: 10000, // permutations per test
  buildWidth: 640, // pixel width of the printed charts
});

const percent = (v, digits = 1) => `${fmt(100 * v, digits)}%`;
const signed = (v, digits = 2) => (v < 0 ? `−${fmt(-v, digits)}` : `+${fmt(v, digits)}`);

/** The p-value of a permutation test, as a bound when no permutation reached the observed statistic. */
function permutationText(test, replicates) {
  const atLeast = Math.round(test.pValue * (replicates + 1)) - 1;
  return atLeast === 0 ? `&lt; 1/${int(replicates + 1)}` : fmt(test.pValue, 4);
}

function analyse(data, seed, replicates) {
  const sample = records(data);
  const counts = contingencyTable(sample, data.xLevels, data.fLevels);
  const result = chiSquareIndependence(counts);
  const test = permutationTest(sample, data.xLevels, data.fLevels, { replicates, uniform: createRandom(seed).uniform });
  return { sample, counts, result, test, v: cramersV(result.statistic, result.n, data.xLevels.length, data.fLevels.length) };
}

/**
 * @param {{ root?: string }} [context]
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide() {
  const { seed, replicates, buildWidth } = PARAMS;
  const byClass = analyse(CLASSES, seed, replicates);
  const bySex = analyse(SEX, seed + 1, replicates);
  const { counts, result } = byClass;
  const { rows, cols, n } = margins(counts);
  const survived = CLASSES.fLevels.indexOf('Survived');

  const permutation = renderPermutation({ statistics: byClass.test.statistics, df: result.df, id: 'fig-permutation', width: buildWidth });

  const html = {
    observed: renderObservedTable(CLASSES, counts),
    joint: renderJointTable(CLASSES, counts),
    byClass: renderConditionalTable(CLASSES, counts),
    byOutcome: renderConditionalByFactorTable(CLASSES, counts),
    expected: renderExpectedTable(CLASSES, result, counts),
    cells: renderCellsTable(CLASSES, counts, result),
    summary: renderSummaryTable([
      { name: 'Class and outcome', ...flat(byClass, replicates) },
      { name: 'Sex and outcome', ...flat(bySex, replicates) },
    ]),
    rates: renderRates({ data: CLASSES, counts, level: 'Survived', id: 'fig-rates', width: buildWidth }),
    permutation: permutation.svg,
    parameters: renderParametersTable([
      ['Master seed', String(seed), 'The class test uses it, the sex test seed + 1'],
      ['Permutations', int(replicates), 'Shuffles of the labels of F per test'],
      ['Records', int(n), 'People aboard, Dawson (1995)'],
    ]),
  };

  const tokens = {};
  const token = (key, value) => {
    tokens[key] = String(value);
  };

  token('params.seed', seed);
  token('params.replicates', int(replicates));
  token('data.n', int(n));
  token('data.died', int(cols[0]));
  token('data.survived', int(cols[survived]));
  token('data.diedShare', percent(cols[0] / n));
  token('data.survivedShare', percent(cols[survived] / n));

  CLASSES.xLevels.forEach((level, i) => {
    token(`class.rate.${level}`, percent(counts[i][survived] / rows[i]));
    token(`class.share.${level}`, percent(rows[i] / n));
    token(`class.n.${level}`, int(rows[i]));
  });
  SEX.xLevels.forEach((level, i) => {
    const r = margins(bySex.counts);
    token(`sex.rate.${level}`, percent(bySex.counts[i][survived] / r.rows[i]));
    token(`sex.n.${level}`, int(r.rows[i]));
  });

  for (const [key, a] of [['class', byClass], ['sex', bySex]]) {
    token(`${key}.chi`, fmt(a.result.statistic, 1));
    token(`${key}.df`, a.result.df);
    token(`${key}.p`, sci(a.result.pValue, 2));
    token(`${key}.v`, fmt(a.v, 3));
    token(`${key}.minExpected`, fmt(a.result.minExpected, 1));
    token(`${key}.permP`, permutationText(a.test, replicates));
  }

  /* The cells that depart most from independence. */
  const cells = [];
  CLASSES.xLevels.forEach((x, i) => CLASSES.fLevels.forEach((f, j) => cells.push({ x, f, i, j, residual: result.residuals[i][j] })));
  cells.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  const [first, second] = cells;
  token('class.top.first', `${first.x.toLowerCase()} class, ${first.f.toLowerCase()}`);
  token('class.top.firstResidual', signed(first.residual));
  token('class.top.firstObserved', int(counts[first.i][first.j]));
  token('class.top.firstExpected', fmt(result.expected[first.i][first.j], 1));
  token('class.top.second', `${second.x.toLowerCase()} class, ${second.f.toLowerCase()}`);
  token('class.top.secondResidual', signed(second.residual));
  token('class.top.secondObserved', int(counts[second.i][second.j]));
  token('class.top.secondExpected', fmt(result.expected[second.i][second.j], 1));

  token('class.permMean', fmt(mean(byClass.test.statistics), 2));
  token('class.permMax', fmt(Math.max(...byClass.test.statistics), 1));
  token('class.beyond', int(permutation.beyond));
  token('class.permAtLeast', int(Math.round(byClass.test.pValue * (replicates + 1)) - 1));

  return { html, tokens };
}

function flat(a, replicates) {
  return {
    statistic: a.result.statistic,
    df: a.result.df,
    pValue: a.result.pValue,
    v: a.v,
    minExpected: a.result.minExpected,
    permutationP: permutationText(a.test, replicates),
  };
}

function mean(values) {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

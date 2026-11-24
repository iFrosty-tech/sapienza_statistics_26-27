/**
 * Build-time figure provider of homework 7, modes of convergence and Bayesian
 * inference (called by src/build/site-plugin.js).
 *
 * Exact where a closed form exists (sums of exponentials are gamma variables,
 * posteriors of a proportion are beta laws), simulated where it does not.
 *
 * Figure ids (<!-- @figure id=… --> markers of homework/09/index.html)
 *   sequences     Table 3, the quantities that separate the modes for two independent sequences
 *   exceedance    Fig. 1, the fraction of paths with a further nonzero term after n
 *   meansExp      Fig. 2, running means of exponential samples
 *   meansCauchy   Fig. 3, running means of Cauchy samples
 *   tails         Table 4, P(|mean − μ| > ε) against Chebyshev's bound
 *   cltSmall      Fig. 4, standardised means for small n
 *   cltLarge      Fig. 5, standardised means for large n
 *   berry         Table 5, the Kolmogorov distance against the Berry–Esseen bound
 *   spread        Table 6, the spread of a sum for independent and for correlated terms
 *   diagnostic    Table 7, the posterior probability of disease by prevalence
 *   posteriorSmall, posteriorLarge   Figs. 6 and 7, posterior densities under three priors
 *   influence     Table 8, posterior means as n grows
 *   intervals     Table 9, Wilson and credible intervals
 *   parameters    Table A1, the parameters of the computation
 *
 * Tokens ({{fig.<key>}}); every value is a display string.
 */

import {
  SEQUENCES,
  alternatingSignGap,
  berryEsseenBound,
  binCounts,
  cauchyMeanTail,
  chebyshevBound,
  equicorrelatedVariance,
  exceedanceFraction,
  exponentialMeanTail,
  kolmogorovDistance,
  lastNonzeroIndex,
  normalTail,
  runningMeans,
  standardisedMeans,
  sumSpread,
} from '../../src/lib/convergence.js';
import { betaBinomial, diagnosticTest } from '../../src/lib/bayes.js';
import {
  prob,
  renderBerryEsseenTable,
  renderDiagnosticTable,
  renderExceedance,
  renderIntervalsTable,
  renderPosteriors,
  renderPriorInfluenceTable,
  renderRunningMeans,
  renderSequencesTable,
  renderSpreadTable,
  renderStandardised,
  renderTailsTable,
} from '../../src/lib/hw09-charts.js';
import { wilsonInterval } from '../../src/lib/stats.js';
import { fmt, int, renderParametersTable } from '../../src/lib/penetration-charts.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  seed: 20261124, // the master seed; each study adds a fixed offset
  sequenceLength: 2000, // N, the horizon of the two independent sequences
  sequencePaths: 4000, // simulated paths per sequence
  epsilon: 0.1, // the tolerance of the law of large numbers
  runningPaths: 5, // paths drawn in Figs. 2 and 3
  runningLength: 1000, // sample size of those paths
  cltReplicates: 20000, // standardised means per histogram
  cltSmall: 3,
  cltLarge: 30,
  spreadReplicates: 4000, // paths for the spread of the sum
  rho: 0.3, // correlation of the dependent terms
  buildWidth: 640, // pixel width of the printed charts
});

export const PRIORS = Object.freeze([
  { key: 'uniform', label: 'Uniform', a: 1, b: 1 },
  { key: 'weak', label: 'Weakly informative', a: 2, b: 2 },
  { key: 'misleading', label: 'Misleading', a: 2, b: 18 },
]);

const percent = (v, digits = 1) => `${fmt(100 * v, digits)}%`;

/**
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide() {
  const P = PARAMS;
  const { seed, sequenceLength: N, epsilon, buildWidth } = P;

  /* ---- the two independent sequences */
  const last = {
    indicator: lastNonzeroIndex(SEQUENCES.indicator, { paths: P.sequencePaths, N, seed }),
    spike: lastNonzeroIndex(SEQUENCES.spike, { paths: P.sequencePaths, N, seed: seed + 1 }),
  };
  const ns = [10, 100, 1000];
  const sequenceRows = Object.keys(last).map((key) => ({
    key,
    name: `${SEQUENCES[key].name} sequence`,
    rows: ns.map((n) => ({
      n,
      pNonzero: SEQUENCES[key].pNonzero(n),
      secondMoment: SEQUENCES[key].secondMoment(n),
      exact: SEQUENCES[key].pExceedAfter(n, N),
      simulated: exceedanceFraction(last[key], n),
    })),
  }));
  const grid = Array.from({ length: 101 }, (_, i) => i * (N / 100));
  const curves = [
    { key: 'indicator', label: 'Indicator', points: grid.map((n) => ({ x: n, y: exceedanceFraction(last.indicator, n) })) },
    { key: 'spike', label: 'Spike', points: grid.map((n) => ({ x: n, y: exceedanceFraction(last.spike, n) })) },
  ];

  /* ---- laws of large numbers */
  const lln = { paths: P.runningPaths, n: P.runningLength };
  const exp = runningMeans('exponential', { ...lln, seed: seed + 2 });
  const cauchy = runningMeans('cauchy', { ...lln, seed: seed + 3 });
  const tailRows = [100, 300, 1000, 3000].map((n) => ({
    n,
    chebyshev: chebyshevBound(n, epsilon),
    exact: exponentialMeanTail(n, epsilon),
    normal: normalTail(n, epsilon),
    cauchy: cauchyMeanTail(epsilon),
  }));

  /* ---- central limit theorem */
  const histogram = (n, offset) => {
    const z = standardisedMeans(n, { replicates: P.cltReplicates, seed: seed + offset });
    return { ...binCounts(z, { from: -3, to: 3, width: 0.5 }), from: -3, width: 0.5 };
  };
  const small = histogram(P.cltSmall, 4);
  const large = histogram(P.cltLarge, 5);
  const berryRows = [1, 2, 5, 10, 30, 100, 1000].map((n) => {
    const distance = kolmogorovDistance(n);
    return { n, distance, scaled: Math.sqrt(n) * distance, bound: berryEsseenBound(n) };
  });

  /* ---- why √n */
  const spreadRows = sumSpread({ ns: [10, 100, 1000], replicates: P.spreadReplicates, rho: P.rho, seed: seed + 6 });

  /* ---- Bayes */
  const diagnosticRows = [0.001, 0.01, 0.1, 0.5].map((prevalence) => ({
    prevalence,
    ...diagnosticTest({ prevalence, sensitivity: 0.95, specificity: 0.95 }),
  }));
  const posteriorCurves = (k, n) => PRIORS.map((p) => ({ ...p, a: p.a + k, b: p.b + n - k }));
  const influenceRows = [10, 100, 1000].map((n) => {
    const k = 0.7 * n;
    return { n, proportion: k / n, means: PRIORS.map((p) => betaBinomial({ a: p.a, b: p.b, k, n })) };
  });
  const intervalRows = [10, 100, 1000].map((n) => {
    const k = 0.7 * n;
    return {
      n,
      wilson: wilsonInterval(k, n),
      credible: PRIORS.map((p) => betaBinomial({ a: p.a, b: p.b, k, n }).interval),
    };
  });

  const html = {
    sequences: renderSequencesTable(sequenceRows, { N }),
    exceedance: renderExceedance({ curves, N, paths: P.sequencePaths, id: 'fig-exceedance', width: buildWidth }),
    meansExp: renderRunningMeans({
      paths: exp,
      n: P.runningLength,
      id: 'fig-means-exp',
      width: buildWidth,
      title: 'Running means of Exponential(1) samples',
      desc: `Running means of ${P.runningPaths} independent samples of Exponential(1) variables for sample sizes 1 to ${int(P.runningLength)}; every path settles at the mean 1.`,
      yDomain: [0, 4],
      mean: 1,
    }),
    meansCauchy: renderRunningMeans({
      paths: cauchy,
      n: P.runningLength,
      id: 'fig-means-cauchy',
      width: buildWidth,
      title: 'Running means of Cauchy samples',
      desc: `Running means of ${P.runningPaths} independent samples of standard Cauchy variables for sample sizes 1 to ${int(P.runningLength)}; the paths do not settle, and each still jumps at large n.`,
      yDomain: [-10, 10],
      mean: null,
    }),
    tails: renderTailsTable(tailRows, epsilon),
    cltSmall: renderStandardised({ ...small, replicates: P.cltReplicates, n: P.cltSmall, id: 'fig-clt-small', width: buildWidth }),
    cltLarge: renderStandardised({ ...large, replicates: P.cltReplicates, n: P.cltLarge, id: 'fig-clt-large', width: buildWidth }),
    berry: renderBerryEsseenTable(berryRows),
    spread: renderSpreadTable(spreadRows, P.rho),
    diagnostic: renderDiagnosticTable(diagnosticRows),
    posteriorSmall: renderPosteriors({ curves: posteriorCurves(7, 10), k: 7, n: 10, id: 'fig-posterior-small', width: buildWidth }),
    posteriorLarge: renderPosteriors({ curves: posteriorCurves(70, 100), k: 70, n: 100, id: 'fig-posterior-large', width: buildWidth }),
    influence: renderPriorInfluenceTable(influenceRows, PRIORS),
    intervals: renderIntervalsTable(intervalRows, PRIORS),
    parameters: renderParametersTable([
      ['Master seed', String(seed), 'Each study adds a fixed offset'],
      ['Sequence horizon N', int(N), 'Terms of the two independent sequences'],
      ['Paths per sequence', int(P.sequencePaths), 'Simulated paths, Table 3 and Figure 1'],
      ['Tolerance ε', String(epsilon), 'Law of large numbers, Table 4'],
      ['Running-mean paths', `${P.runningPaths} × ${int(P.runningLength)}`, 'Figures 2 and 3'],
      ['Standardised means', int(P.cltReplicates), `Replicates at n = ${P.cltSmall} and n = ${P.cltLarge}, Figures 4 and 5`],
      ['Spread of the sum', int(P.spreadReplicates), `Paths, Table 6; correlation ρ = ${P.rho}`],
      ['Sensitivity, specificity', '0.95, 0.95', 'Diagnostic test, Table 7'],
      ['Sample proportion', '0.7', 'Beta–binomial update, Figures 6, 7 and Tables 8, 9'],
    ]),
  };

  const tokens = {};
  const token = (key, value) => {
    tokens[key] = String(value);
  };

  token('params.epsilon', epsilon);
  token('params.N', int(N));
  token('params.paths', int(P.sequencePaths));
  token('params.rho', P.rho);
  token('params.spreadReplicates', int(P.spreadReplicates));
  token('params.cltReplicates', int(P.cltReplicates));
  token('params.cltSmall', P.cltSmall);
  token('params.cltLarge', P.cltLarge);

  const at = (key, n) => sequenceRows.find((g) => g.key === key).rows.find((r) => r.n === n);
  token('seq.indicator.exact100', prob(at('indicator', 100).exact));
  token('seq.indicator.sim100', prob(at('indicator', 100).simulated));
  token('seq.spike.exact100', prob(at('spike', 100).exact));
  token('seq.spike.sim100', prob(at('spike', 100).simulated));
  token('seq.spike.exact1000', prob(at('spike', 1000).exact));
  token('seq.alternating.gap', fmt(alternatingSignGap(1), 4));

  token('lln.cauchy', fmt(cauchyMeanTail(epsilon), 4));
  token('lln.exact1000', prob(exponentialMeanTail(1000, epsilon)));
  token('lln.chebyshev1000', prob(chebyshevBound(1000, epsilon)));
  token('lln.exact100', prob(exponentialMeanTail(100, epsilon)));

  token('clt.skewSmall', fmt(2 / Math.sqrt(P.cltSmall), 2));
  token('clt.skewLarge', fmt(2 / Math.sqrt(P.cltLarge), 2));
  token('clt.scaled', fmt(berryRows.at(-1).scaled, 3));
  token('clt.d1', fmt(berryRows[0].distance, 3));
  token('clt.d30', fmt(berryRows[4].distance, 4));
  token('clt.d1000', fmt(berryRows.at(-1).distance, 4));

  token('spread.n1000.independent', fmt(spreadRows.at(-1).independent, 1));
  token('spread.n1000.theory', fmt(Math.sqrt(1000), 1));
  token('spread.n1000.dependent', fmt(spreadRows.at(-1).dependent, 1));
  token('spread.n1000.dependentTheory', fmt(Math.sqrt(equicorrelatedVariance(1000, P.rho)), 1));
  token('spread.limit', fmt(Math.sqrt(P.rho), 3));

  token('bayes.d1.afterOne', percent(diagnosticRows[1].afterOne));
  token('bayes.d1.afterTwo', percent(diagnosticRows[1].afterTwo));
  token('bayes.d1.tp', int(diagnosticRows[1].truePositives));
  token('bayes.d1.fp', int(diagnosticRows[1].falsePositives));
  token('bayes.d0.afterOne', percent(diagnosticRows[0].afterOne));
  token('bayes.d50.afterOne', percent(diagnosticRows[3].afterOne));

  const small10 = influenceRows[0].means;
  token('bayes.n10.uniform', fmt(small10[0].mean, 3));
  token('bayes.n10.misleading', fmt(small10[2].mean, 3));
  token('bayes.n10.misleadingWeight', percent(small10[2].priorWeight, 0));
  token('bayes.n100.uniform', fmt(influenceRows[1].means[0].mean, 3));
  token('bayes.n100.misleading', fmt(influenceRows[1].means[2].mean, 3));
  token('bayes.n100.misleadingWeight', percent(influenceRows[1].means[2].priorWeight, 0));
  token('bayes.n1000.uniform', fmt(influenceRows[2].means[0].mean, 3));
  token('bayes.n1000.misleading', fmt(influenceRows[2].means[2].mean, 3));
  token('bayes.n1000.misleadingWeight', percent(influenceRows[2].means[2].priorWeight, 1));
  token('bayes.laplace', fmt(betaBinomial({ a: 1, b: 1, k: 3, n: 3 }).mean, 1));

  return { html, tokens };
}

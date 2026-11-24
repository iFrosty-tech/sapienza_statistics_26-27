/**
 * The build-time tables and charts of homework 7: the modes of convergence,
 * the laws of large numbers, the central limit theorem, the scaling of a sum,
 * and the Bayesian update of a diagnostic test and of a proportion.
 */

import { renderHistogram, renderLineChart } from './charts.js';
import { fmt, int, sci } from './penetration-charts.js';
import { tex } from './welford-charts.js';
import { normalCdf } from './stats.js';
import { betaPdf } from './bayes.js';

const th = (s, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''}>${s}</th>`;
const td = (s, cls = 'is-number') => `<td${cls ? ` class="${cls}"` : ''}>${s}</td>`;
const table = (cls, head, rows) =>
  `<table class="data-table data-table--hw04 data-table--compact ${cls}"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

/** A probability: fixed point when it is not tiny, scientific notation when it is. */
export const prob = (v) => (v === 0 ? '0' : v < 1e-3 ? sci(v, 2) : fmt(v, 4));
const percent = (v, digits = 1) => `${fmt(100 * v, digits)}%`;

/* ------------------------------------------------------------------ modes of convergence */

/** Table 3: the exact quantities that separate the modes, for the two independent sequences at several n. */
export function renderSequencesTable(rows, { N }) {
  const head = [
    th(tex('n')),
    th(tex('P(X_n \\ne 0)'), 'is-number'),
    th(tex('E[X_n^2]'), 'is-number'),
    th(`${tex('P(\\exists k \\in (n, N]: X_k \\ne 0)')}, exact`, 'is-number'),
    th('same, simulated', 'is-number'),
  ];
  const body = [];
  for (const group of rows) {
    body.push(`<tr class="data-table__total"><th scope="row" colspan="5">${group.name}</th></tr>`);
    for (const r of group.rows) {
      body.push(`<tr><th scope="row">${int(r.n)}</th>${td(prob(r.pNonzero))}${td(prob(r.secondMoment))}${td(prob(r.exact))}${td(prob(r.simulated))}</tr>`);
    }
  }
  return table('data-table--convergence', head, body).replace('<thead>', `<caption class="visually-hidden">N = ${int(N)}</caption><thead>`);
}

/** Fig. 1: the fraction of paths with a nonzero term after n, for the two sequences. */
export function renderExceedance({ curves, N, paths, id, width }) {
  return renderLineChart({
    id,
    width,
    height: 340,
    title: 'Probability of a further nonzero term after n',
    desc: `Fraction of ${int(paths)} simulated paths with a nonzero term among the terms n+1 to ${int(N)}, against n, for the indicator sequence, which declines almost linearly to zero only as n approaches ${int(N)}, and for the spike sequence, which falls to near zero within the first few hundred terms.`,
    series: curves.map((c) => ({ key: c.key, label: c.label, points: c.points })),
    xDomain: [0, N],
    yDomain: [0, 1],
    xLabel: 'Index n',
    yLabel: 'Fraction of paths',
  });
}

/* ------------------------------------------------------------------ laws of large numbers */

/** Figs. 2 and 3: running means of several paths, a reference line at the true mean when there is one. */
export function renderRunningMeans({ paths, n, id, width, title, desc, yDomain, mean }) {
  const series = paths.map((means, i) => ({
    key: `p${i}`,
    points: means.map((y, k) => ({ x: k + 1, y: Math.abs(y) <= Math.max(Math.abs(yDomain[0]), Math.abs(yDomain[1])) ? y : null })),
  }));
  if (mean !== null && mean !== undefined) {
    series.push({ key: 'mean', label: `Mean ${fmt(mean, 0)}`, points: [{ x: 1, y: mean }, { x: n, y: mean }] });
  }
  return renderLineChart({ id, width, height: 320, title, desc, series, xDomain: [0, n], yDomain, xLabel: 'Sample size n', yLabel: 'Running mean' });
}

/** Table 4: the probability that the mean misses its target by more than ε, against Chebyshev's bound. */
export function renderTailsTable(rows, epsilon) {
  const head = [
    th(tex('n')),
    th(`Chebyshev bound ${tex('\\sigma^2/(n\\varepsilon^2)')}`, 'is-number'),
    th(`Exponential(1), exact`, 'is-number'),
    th('Normal approximation', 'is-number'),
    th('Cauchy, exact', 'is-number'),
  ];
  const body = rows.map((r) => `<tr><th scope="row">${int(r.n)}</th>${td(prob(r.chebyshev))}${td(prob(r.exact))}${td(prob(r.normal))}${td(prob(r.cauchy))}</tr>`);
  return table('data-table--convergence', head, body).replace('<thead>', `<caption class="visually-hidden">ε = ${epsilon}</caption><thead>`);
}

/* ------------------------------------------------------------------ central limit theorem */

/** Figs. 4 and 5: standardised means against the standard normal law, in bins of width 1/2. */
export function renderStandardised({ counts, outside, replicates, n, from, width: binWidth, id, width }) {
  const edge = (k) => from + k * binWidth;
  const bins = counts.map((observed, k) => ({
    label: fmt(edge(k), 1),
    observed,
    expected: replicates * (normalCdf(edge(k + 1)) - normalCdf(edge(k))),
  }));
  return renderHistogram({
    id,
    width,
    height: 320,
    title: `Standardised mean of ${n} exponential variables`,
    desc: `Histogram of ${int(replicates)} simulated values of the standardised mean of n = ${n} Exponential(1) variables, in bins of width ${binWidth} from ${from} to ${from + counts.length * binWidth}, against the counts expected from the standard normal law as a stepped line. ${int(outside)} values fall outside the plotted range.`,
    bins,
    xLabel: 'Standardised mean',
    yLabel: 'Replicates',
    labelEvery: 2,
  });
}

/** Table 5: the exact Kolmogorov distance of the standardised sum from the normal law, against the Berry–Esseen bound. */
export function renderBerryEsseenTable(rows) {
  const head = [
    th(tex('n')),
    th(`${tex('D_n = \\sup_z |F_n(z) - \\Phi(z)|')}`, 'is-number'),
    th(tex('\\sqrt{n}\\,D_n'), 'is-number'),
    th('Berry–Esseen bound', 'is-number'),
  ];
  const body = rows.map((r) => `<tr><th scope="row">${int(r.n)}</th>${td(fmt(r.distance, 4))}${td(fmt(r.scaled, 3))}${td(fmt(r.bound, 4))}</tr>`);
  return table('data-table--convergence', head, body);
}

/* ------------------------------------------------------------------ why √n */

/** Table 6: the spread of the centred sum, rescaled by 1, √n and n, for independent and for correlated terms. */
export function renderSpreadTable(rows, rho) {
  const head = [
    th(tex('n')),
    th(`${tex('\\mathrm{sd}(S_n)')}, independent`, 'is-number'),
    th(`${tex('\\mathrm{sd}(S_n)/\\sqrt{n}')}`, 'is-number'),
    th(`${tex('\\mathrm{sd}(S_n)/n')}`, 'is-number'),
    th(`${tex('\\mathrm{sd}(S_n)')}, ${tex(`\\rho = ${rho}`)}`, 'is-number'),
    th(`${tex('\\mathrm{sd}(S_n)/\\sqrt{n}')}`, 'is-number'),
    th(`${tex('\\mathrm{sd}(S_n)/n')}`, 'is-number'),
  ];
  const body = rows.map(
    (r) =>
      `<tr><th scope="row">${int(r.n)}</th>${td(fmt(r.independent, 2))}${td(fmt(r.independent / Math.sqrt(r.n), 3))}${td(fmt(r.independent / r.n, 4))}${td(fmt(r.dependent, 2))}${td(fmt(r.dependent / Math.sqrt(r.n), 3))}${td(fmt(r.dependent / r.n, 4))}</tr>`,
  );
  return table('data-table--convergence', head, body);
}

/* ------------------------------------------------------------------ Bayes */

/** Table 7: the posterior probability of disease after a positive test, by prevalence. */
export function renderDiagnosticTable(rows) {
  const head = [
    th('Prevalence (prior)', 'is-number'),
    th('True positives', 'is-number'),
    th('False positives', 'is-number'),
    th(tex('P(D \\mid +)'), 'is-number'),
    th(tex('P(D \\mid +, +)'), 'is-number'),
  ];
  const body = rows.map(
    (r) => `<tr><th scope="row" class="is-number">${percent(r.prevalence, r.prevalence < 0.01 ? 2 : 1)}</th>${td(int(r.truePositives))}${td(int(r.falsePositives))}${td(percent(r.afterOne))}${td(percent(r.afterTwo))}</tr>`,
  );
  return table('data-table--bayes', head, body);
}

/** Figs. 6 and 7: the posterior densities under several priors, for the same data. */
export function renderPosteriors({ curves, k, n, id, width }) {
  const grid = Array.from({ length: 201 }, (_, i) => i / 200);
  const peak = Math.max(...curves.map((c) => Math.max(...grid.map((x) => betaPdf(x, c.a, c.b)))));
  return renderLineChart({
    id,
    width,
    height: 320,
    title: `Posterior densities for ${k} successes in ${n} trials`,
    desc: `Posterior densities of a proportion after ${k} successes in ${n} trials, under ${curves.length} priors: ${curves.map((c) => `${c.label}, Beta(${c.a}, ${c.b})`).join('; ')}.`,
    series: curves.map((c) => ({ key: c.key, points: grid.map((x) => ({ x, y: betaPdf(x, c.a, c.b) })) })),
    marks: curves.map((c) => {
      const mode = (c.a - 1) / (c.a + c.b - 2);
      return { x: mode, y: betaPdf(mode, c.a, c.b), label: c.label, prefer: c.mark ?? ['ne', 'e', 'nw'] };
    }),
    xDomain: [0, 1],
    yDomain: [0, Math.ceil(peak * 1.05)],
    xLabel: 'Proportion θ',
    yLabel: 'Posterior density',
  });
}

/** Table 8: the posterior mean under each prior as n grows with the sample proportion fixed. */
export function renderPriorInfluenceTable(rows, priors) {
  const head = [th(tex('n')), th('Sample proportion', 'is-number'), ...priors.map((p) => th(`${p.label}, ${tex(`\\mathrm{Beta}(${p.a}, ${p.b})`)}`, 'is-number'))];
  const body = rows.map((r) => `<tr><th scope="row">${int(r.n)}</th>${td(fmt(r.proportion, 3))}${r.means.map((m) => td(fmt(m.mean, 3))).join('')}</tr>`);
  return table('data-table--bayes', head, body);
}

/** Table 9: the Wilson interval and the credible intervals under each prior. */
export function renderIntervalsTable(rows, priors) {
  const head = [th(tex('n')), th('Wilson 95% interval', 'is-number'), ...priors.map((p) => th(`${p.label} 95% credible`, 'is-number'))];
  const span = (i) => `${fmt(i.low, 3)} to ${fmt(i.high, 3)}`;
  const body = rows.map((r) => `<tr><th scope="row">${int(r.n)}</th>${td(span(r.wilson))}${r.credible.map((i) => td(span(i))).join('')}</tr>`);
  return table('data-table--bayes', head, body);
}

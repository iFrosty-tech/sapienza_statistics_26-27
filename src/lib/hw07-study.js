/**
 * The numerical study of homework 5, in two parts that share no data.
 *
 * Exercise 1: for each test function, the Riemann sums (left, midpoint, right) and the Lebesgue sum against the
 * exact integral over a grid of n = N, the measured rate of convergence, the cost, and the sums of the Dirichlet
 * and Thomae functions. Exercise 2: the methods of src/lib/normal-cdf.js against the web table of the error function
 * and against the 80-digit reference, the error profile over x, the convergence of the quadrature rules and the cost.
 *
 * Everything is deterministic except the timings, which are measured on the machine that builds the page and are
 * labelled so; the cache of the provider keeps them stable between reloads.
 */

import { linearFit } from './normal.js';
import { deriveSeed } from './kg-study.js';
import {
  FUNCTIONS,
  counter,
  dirichletSums,
  lebesgue,
  riemannSum,
  sampledLebesgueSum,
  thomaeLevelCounts,
  thomaeSums,
} from './integration.js';
import {
  approximation26217,
  continuedFraction,
  continuedFractionPhi,
  erf,
  erfTaylor,
  hybrid,
  maclaurin,
  numericalRecipesPhi,
  referencePhi,
  simpson,
  trapezoid,
} from './normal-cdf.js';

/**
 * Values of the error function printed in the table of the "Error function" article of Wikipedia
 * (https://en.wikipedia.org/wiki/Error_function, consulted 2026-11-12), to nine decimals: z, erf z and 1 − erf z.
 */
export const WEB_ERF = Object.freeze([
  Object.freeze({ z: 0.1, erf: 0.112462916, erfc: 0.887537084 }),
  Object.freeze({ z: 0.5, erf: 0.520499878, erfc: 0.479500122 }),
  Object.freeze({ z: 1, erf: 0.842700793, erfc: 0.157299207 }),
  Object.freeze({ z: 1.5, erf: 0.966105146, erfc: 0.033894854 }),
  Object.freeze({ z: 2, erf: 0.995322265, erfc: 0.004677735 }),
  Object.freeze({ z: 2.5, erf: 0.999593048, erfc: 0.000406952 }),
  Object.freeze({ z: 3, erf: 0.99997791, erfc: 0.00002209 }),
  Object.freeze({ z: 3.5, erf: 0.999999257, erfc: 0.000000743 }),
]);

/* ====================================================== exercise 1 */

const absOrNaN = (v) => (Number.isFinite(v) ? Math.abs(v) : NaN);

/** The odd integer nearest to 10^(j/4), so that the jump of a step function lies inside a subinterval. */
export const oddGrid = (from, to) => {
  const out = [];
  for (let j = from * 4; j <= to * 4; j += 1) {
    const n = Math.round(10 ** (j / 4));
    const odd = n % 2 === 0 ? n + 1 : n;
    if (!out.includes(odd)) out.push(odd);
  }
  return out;
};

/** The exponent p in error ≈ C·n^(−p), fitted on the points of a series with error above the roundoff floor. */
export function fitRate(ns, errors, { from = 30, floor = 1e-15 } = {}) {
  const xs = [];
  const ys = [];
  ns.forEach((n, i) => {
    if (n >= from && errors[i] > floor && Number.isFinite(errors[i])) {
      xs.push(Math.log10(n));
      ys.push(Math.log10(errors[i]));
    }
  });
  if (errors.every((e) => !Number.isFinite(e))) return { exact: false, diverges: true, slope: NaN, points: 0 };
  if (xs.length < 3) return { exact: true, slope: NaN, points: xs.length };
  return { exact: false, slope: -linearFit(xs, ys).slope, points: xs.length };
}

/** The best time of a few runs of a function, in milliseconds. */
function bestTime(run, repeats = 3) {
  let best = Infinity;
  for (let i = 0; i < repeats; i += 1) {
    const t0 = performance.now();
    run();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

export function runIntegrationStudy(params) {
  const grid = oddGrid(params.grid.from, params.grid.to);
  const functions = FUNCTIONS.map((fn) => {
    const left = [];
    const mid = [];
    const right = [];
    const leb = [];
    for (const n of grid) {
      left.push(riemannSum(fn, n, 'left') - fn.exact);
      mid.push(riemannSum(fn, n, 'mid') - fn.exact);
      right.push(riemannSum(fn, n, 'right') - fn.exact);
      leb.push(lebesgue(fn, n).value - fn.exact);
    }
    const at = params.tableN;
    counter.f = 0;
    const lebAt = lebesgue(fn, at);
    const bisections = counter.f;
    const table = {
      n: at,
      left: riemannSum(fn, at, 'left'),
      mid: riemannSum(fn, at, 'mid'),
      right: riemannSum(fn, at, 'right'),
      lebesgue: lebAt.value,
      lebesgueStep: lebAt.h,
      riemannEvaluations: at,
      lebesgueEvaluations: at + 1,
      bisectionEvaluations: bisections,
    };
    const error = (list) => list.map(absOrNaN);
    const rates = {
      left: fitRate(grid, error(left)),
      mid: fitRate(grid, error(mid)),
      right: fitRate(grid, error(right)),
      lebesgue: fitRate(grid, error(leb)),
    };
    // The cost of a sum of a million terms, by the clock.
    const big = params.timingN;
    const timing = {
      n: big,
      riemannMs: bestTime(() => riemannSum(fn, big, 'mid')),
      lebesgueMs: bestTime(() => lebesgue(fn, big)),
    };
    // The same Lebesgue sum when the preimages are measured by sampling instead of known.
    const sampled = sampledLebesgueSum(fn, params.sampled.levels, params.sampled.points, deriveSeed(params.seed, `sampled:${fn.key}`));
    return { key: fn.key, grid, left, mid, right, lebesgue: leb, table, rates, timing, sampledError: sampled - fn.exact };
  });

  const dirichlet = params.pathological.grid.map(dirichletSums);
  const thomae = params.pathological.grid.map(thomaeSums);
  const thomaeLevels = thomaeLevelCounts(Math.max(...params.pathological.levels));
  return {
    grid,
    functions,
    dirichlet,
    thomae,
    thomaeLevels: params.pathological.levels.map((m) => ({ m, count: thomaeLevels[m] })),
    seeds: { sampled: deriveSeed(params.seed, 'sampled:sin') },
  };
}

/* ====================================================== exercise 2 */

/** The methods of the comparison, with the function that evaluates each at x. */
export const CDF_METHODS = Object.freeze([
  { key: 'trapezoid', label: 'Trapezoid', run: (x, p) => trapezoid(x, p.trapezoidPanels) },
  { key: 'simpson', label: 'Simpson', run: (x, p) => simpson(x, p.simpsonPanels) },
  { key: 'maclaurin', label: 'Maclaurin series', run: (x) => maclaurin(x) },
  { key: 'erfTaylor', label: 'erf series', run: (x) => erfTaylor(x) },
  { key: 'cf', label: 'Continued fraction', run: (x) => continuedFractionPhi(x) },
  { key: 'approximation', label: 'A&S 26.2.17', run: (x) => approximation26217(x) },
  { key: 'recipes', label: 'Numerical Recipes', run: (x) => numericalRecipesPhi(x) },
  { key: 'hybrid', label: 'Hybrid', run: (x) => hybrid(x) },
]);

const relative = (value, reference) => Math.abs(value - reference) / reference;

/** The panels needed for a quadrature rule to bring the absolute error of Φ(x) below a tolerance, by doubling. */
function panelsFor(rule, x, tolerance, reference, limit = 2 ** 21) {
  for (let n = 2; n <= limit; n *= 2) {
    if (Math.abs(rule(x, n).value - reference) < tolerance) return n;
  }
  return null;
}

export function runCdfStudy(params) {
  /* The table of the web against the hybrid method. */
  const web = WEB_ERF.map((row) => {
    const mine = erf(row.z);
    const reference = referencePhi(row.z * Math.SQRT2);
    const exactErf = 2 * reference.value - 1;
    const exactErfc = 2 * reference.tail;
    // 1 − erf: erfc by the method, and the reference of 80 digits.
    return { ...row, mine, mineErfc: 2 * hybrid(-row.z * Math.SQRT2).value, exactErf, exactErfc, phi: 0.5 * (1 + mine) };
  });

  /* Relative error of the lower tail Φ(−x) of every method, on a grid of x. */
  const xs = params.profile.xs;
  const profile = CDF_METHODS.filter((m) => !['trapezoid', 'simpson'].includes(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
    points: xs.map((x) => {
      const ref = referencePhi(-x).value;
      const value = m.run(-x, params).value;
      return { x, y: relative(value, ref) };
    }),
  }));

  /* Absolute error of Φ(x) at selected points, for every method (the table of the page). */
  const accuracy = params.accuracyX.map((x) => {
    const ref = referencePhi(-x);
    const row = { x, phi: ref.value, tail: ref.value };
    for (const m of CDF_METHODS) {
      const r = m.run(-x, params);
      row[m.key] = { value: r.value, relative: relative(r.value, ref.value), cost: r.cost };
    }
    return row;
  });

  /* Convergence of the two quadrature rules with the number of panels. */
  const convergence = params.convergence.x.map((x) => {
    const ref = referencePhi(x).value;
    const panels = params.convergence.panels;
    return {
      x,
      panels,
      trapezoid: panels.map((n) => Math.abs(trapezoid(x, n).value - ref)),
      simpson: panels.map((n) => Math.abs(simpson(x, n).value - ref)),
    };
  });

  /* The cost of reaching an absolute error below the tolerance in Φ(x). */
  const cost = params.cost.x.map((x) => {
    const ref = referencePhi(x).value;
    const tol = params.cost.tolerance;
    const series = (r) => ({ value: r.value, error: Math.abs(r.value - ref), cost: r.cost });
    return {
      x,
      tolerance: tol,
      trapezoid: panelsFor(trapezoid, x, tol, ref),
      simpson: panelsFor(simpson, x, tol, ref),
      maclaurin: series(maclaurin(x)),
      erfTaylor: series(erfTaylor(x)),
      continuedFraction: series({ value: 1 - continuedFraction(x).value, cost: continuedFraction(x).cost }),
      approximation: series(approximation26217(x)),
      hybrid: series(hybrid(x)),
    };
  });

  /* Time per evaluation of each method, on the build machine: the points cycle, so that nothing is folded. */
  const points = params.timing.points;
  const timeOf = (run, calls) => {
    let sink = 0;
    const ms = bestTime(() => {
      for (let i = 0; i < calls; i += 1) sink += run(points[i % points.length]);
    });
    if (sink === Infinity) throw new Error('unreachable');
    return (ms * 1e6) / calls; // nanoseconds
  };
  const timing = {
    trapezoid: timeOf((x) => trapezoid(x, params.trapezoidPanels).value, params.timing.calls),
    simpson: timeOf((x) => simpson(x, params.simpsonPanels).value, params.timing.calls),
    maclaurin: timeOf((x) => maclaurin(x).value, params.timing.calls),
    erfTaylor: timeOf((x) => erfTaylor(x).value, params.timing.calls),
    continuedFraction: timeOf((x) => continuedFraction(x).value, params.timing.calls),
    approximation: timeOf((x) => approximation26217(x).value, params.timing.calls),
    recipes: timeOf((x) => numericalRecipesPhi(x).value, params.timing.calls),
    hybrid: timeOf((x) => hybrid(x).value, params.timing.calls),
    reference: timeOf((x) => referencePhi(x).value, Math.max(20, Math.round(params.timing.calls / 500))),
    n: points.length,
  };

  return { web, profile, accuracy, convergence, cost, timing };
}

export function runStudy(params) {
  return { integration: runIntegrationStudy(params.integration), cdf: runCdfStudy(params.cdf) };
}

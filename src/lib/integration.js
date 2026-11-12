/**
 * Homework 5, exercise 1: the integral of a function on [a, b] computed in the
 * two ways in which it is defined.
 *
 *   Riemann   partition the DOMAIN into n subintervals and add f(tag) · width.
 *   Lebesgue  partition the RANGE into N levels y_k = m + k·h and add
 *             y_k · μ({x : y_k ≤ f(x) < y_{k+1}}), the measure of a preimage.
 *
 * The Lebesgue sum needs the measure of the preimages, so every test function
 * carries its superlevel set {x : f(x) ≥ c} as a union of intervals, found
 * analytically (or, for sin(x)/x, by bisection on a monotone function). The
 * measure of a preimage is then G(y_k) − G(y_{k+1}) with G(c) = μ{f ≥ c}, and
 * the sum is exactly the integral of the simple function that rounds f down to
 * the grid of levels.
 *
 * The Dirichlet and Thomae functions are not given by a formula that can be
 * evaluated on a double (every double is rational), so their sums are
 * computed exactly in integer arithmetic from the number-theoretic structure of
 * the tags and of the subintervals.
 */

import { createRandom } from './random.js';

const { PI, sqrt, sin, asin } = Math;

/* ------------------------------------------------------------ the functions */

/** Evaluation counter of the bisection that inverts sin(x)/x, for the cost accounting. */
export const counter = { f: 0 };

const sinc = (x) => (x === 0 ? 1 : sin(x) / x);

/** The x in [0, π] at which sin(x)/x, which decreases from 1 to 0 there, takes the value c in (0, 1). */
function sincInverse(c) {
  let lo = 0;
  let hi = PI;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    counter.f += 1;
    if (sinc(mid) >= c) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The superlevel set {f ≥ c} of a function with a closed form, as a list of [x0, x1] intervals. */
const intervals = {
  sin: (c) => (c <= 0 ? [[0, PI]] : c > 1 ? [] : [[asin(c), PI - asin(c)]]),
  square: (c) => (c <= 0 ? [[0, 1]] : c > 1 ? [] : [[sqrt(c), 1]]),
  step: (c) => (c <= 1 ? [[0, 1]] : c <= 3 ? [[0.5, 1]] : []),
  abs: (c) => (c <= 0 ? [[0, 1]] : c > 0.5 ? [] : [[0, 0.5 - c], [0.5 + c, 1]]),
  inverseRoot: (c) => (c <= 1 ? [[0, 1]] : [[0, 1 / (c * c)]]),
  indicator: (c) => (c <= 0 ? [[0, 1]] : c <= 1 ? [[0, 0.5]] : []),
  sinc: (c) => (c <= 0 ? [[0, PI]] : c > 1 ? [] : [[0, sincInverse(c)]]),
};

/**
 * The functions of the study. `lo` and `hi` are the infimum and the supremum of f, `exact` the integral.
 * `unbounded` marks the one function with no supremum, which the Lebesgue sum truncates at a level.
 */
export const FUNCTIONS = Object.freeze([
  {
    key: 'sin',
    name: 'sin x',
    tex: String.raw`\sin x`,
    domain: String.raw`[0, \pi]`,
    a: 0,
    b: PI,
    f: (x) => sin(x),
    lo: 0,
    hi: 1,
    exact: 2,
    exactText: '2',
    kind: 'smooth',
    superlevel: intervals.sin,
  },
  {
    key: 'square',
    name: 'x²',
    tex: 'x^2',
    domain: '[0, 1]',
    a: 0,
    b: 1,
    f: (x) => x * x,
    lo: 0,
    hi: 1,
    exact: 1 / 3,
    exactText: '1/3',
    kind: 'smooth',
    superlevel: intervals.square,
  },
  {
    key: 'step',
    name: 'step 1 and 3',
    tex: String.raw`\begin{cases}1 & x < 1/2\\ 3 & x \ge 1/2\end{cases}`,
    domain: '[0, 1]',
    a: 0,
    b: 1,
    f: (x) => (x < 0.5 ? 1 : 3),
    lo: 1,
    hi: 3,
    exact: 2,
    exactText: '2',
    kind: 'jump',
    superlevel: intervals.step,
  },
  {
    key: 'abs',
    name: '|x − ½|',
    tex: String.raw`|x - 1/2|`,
    domain: '[0, 1]',
    a: 0,
    b: 1,
    f: (x) => Math.abs(x - 0.5),
    lo: 0,
    hi: 0.5,
    exact: 0.25,
    exactText: '1/4',
    kind: 'kink',
    superlevel: intervals.abs,
  },
  {
    key: 'inverseRoot',
    name: '1/√x',
    tex: String.raw`1/\sqrt{x}`,
    domain: '(0, 1]',
    a: 0,
    b: 1,
    f: (x) => 1 / sqrt(x),
    lo: 1,
    hi: Infinity,
    exact: 2,
    exactText: '2',
    kind: 'unbounded',
    unbounded: true,
    superlevel: intervals.inverseRoot,
  },
  {
    key: 'indicator',
    name: 'step 1 and 0',
    tex: String.raw`\begin{cases}1 & x < 1/2\\ 0 & x \ge 1/2\end{cases}`,
    domain: '[0, 1]',
    a: 0,
    b: 1,
    f: (x) => (x < 0.5 ? 1 : 0),
    lo: 0,
    hi: 1,
    exact: 0.5,
    exactText: '1/2',
    kind: 'jump',
    superlevel: intervals.indicator,
  },
  {
    key: 'sinc',
    name: 'sin x / x',
    tex: String.raw`\sin x / x`,
    domain: String.raw`[0, \pi]`,
    a: 0,
    b: PI,
    f: sinc,
    lo: 0,
    hi: 1,
    // The sine integral Si(π), a special function with no closed form in elementary terms.
    exact: 1.8519370519824662,
    exactText: 'Si(π)',
    kind: 'special',
    superlevel: intervals.sinc,
  },
]);

export const functionByKey = (key) => FUNCTIONS.find((fn) => fn.key === key);

/* --------------------------------------------------------------- Riemann sums */

export const RIEMANN_RULES = Object.freeze(['left', 'mid', 'right']);

/**
 * The Riemann sum of f on [a, b] over n equal subintervals, with the tag at the left end, the middle
 * or the right end. A function that is infinite at a tag gives an infinite sum.
 */
export function riemannSum(fn, n, rule = 'mid') {
  const { a, b, f } = fn;
  const h = (b - a) / n;
  const shift = rule === 'left' ? 0 : rule === 'mid' ? 0.5 : 1;
  let total = 0;
  for (let k = 0; k < n; k += 1) total += f(a + (k + shift) * h);
  return total * h;
}

/* ------------------------------------------------------------- Lebesgue sums */

/** The measure of the superlevel set {f ≥ c}. */
export function measureAtLeast(fn, c) {
  let total = 0;
  for (const [x0, x1] of fn.superlevel(c)) total += x1 - x0;
  return total;
}

/**
 * The levels of the Lebesgue sum: N of them, from the infimum of f in steps of h. For an unbounded
 * function the grid stops at `top`, and the sum carries the tail top · μ{f ≥ top}.
 * @returns {{ levels: number[], h: number, top: number }}
 */
export function levelsOf(fn, N, top = fn.hi) {
  const h = (top - fn.lo) / N;
  const levels = Array.from({ length: N + 1 }, (_, k) => fn.lo + k * h);
  return { levels, h, top };
}

/**
 * The Lebesgue sum of f over N levels: the integral of the simple function φ = y_k on {y_k ≤ f < y_{k+1}},
 * which is the largest function on the grid of levels below f. It is a lower sum, and its error is
 * at most h · (b − a) plus the tail, whatever the smoothness of f.
 * @param {{ top?: number }} [options] the truncation level of an unbounded function
 * @returns {{ value: number, bound: number, h: number }}
 */
export function lebesgueSum(fn, N, { top } = {}) {
  const { levels, h } = levelsOf(fn, N, top ?? fn.hi);
  const G = levels.map((y) => measureAtLeast(fn, y));
  let total = 0;
  for (let k = 0; k < N; k += 1) total += levels[k] * (G[k] - G[k + 1]);
  // The part of the domain on which f lies at or above the last level, counted at that level.
  total += levels[N] * G[N];
  return { value: total, bound: h * (fn.b - fn.a), h };
}

/**
 * The truncation level of the unbounded function for N levels: √N balances the step h = T/N,
 * which falls as the grid is refined, against the tail 1/T, which falls as the grid is extended.
 */
export const truncationLevel = (fn, N) => (fn.unbounded ? Math.sqrt(N) : fn.hi);

/** The Lebesgue sum with the truncation rule of the page. */
export const lebesgue = (fn, N) => lebesgueSum(fn, N, { top: truncationLevel(fn, N) });

/**
 * The Lebesgue sum when the measure of a preimage is not known and is estimated by sampling: M uniform
 * points of [a, b] are drawn, each is put in its level, and the integral is Σ y_k · (count_k / M) · (b − a).
 * Seeded, so reproducible. The error falls as 1/√M, whatever the number of levels.
 */
export function sampledLebesgueSum(fn, N, M, seed) {
  const { a, b, f } = fn;
  const top = truncationLevel(fn, N);
  const { h } = levelsOf(fn, N, top);
  const rng = createRandom(seed);
  let total = 0;
  for (let i = 0; i < M; i += 1) {
    const y = f(a + (b - a) * (1 - rng.uniform()));
    const k = Math.min(N, Math.floor((y - fn.lo) / h));
    total += fn.lo + k * h;
  }
  return (total / M) * (b - a);
}

/* ------------------------------------------------- the pictures of the sums */

/**
 * The rectangles of a Riemann sum: { x0, x1, y } with the height of the tag.
 */
export function riemannRectangles(fn, n, rule) {
  const { a, b, f } = fn;
  const h = (b - a) / n;
  const shift = rule === 'left' ? 0 : rule === 'mid' ? 0.5 : 1;
  return Array.from({ length: n }, (_, k) => ({ x0: a + k * h, x1: a + (k + 1) * h, y: f(a + (k + shift) * h) }));
}

/** The set {y_k ≤ f < y_{k+1}} as intervals: the superlevel set at y_k less the one at y_{k+1}. */
function subtract(from, take) {
  let out = from.map((p) => [...p]);
  for (const [t0, t1] of take) {
    out = out.flatMap(([x0, x1]) => {
      if (t1 <= x0 || t0 >= x1) return [[x0, x1]];
      const parts = [];
      if (t0 > x0) parts.push([x0, t0]);
      if (t1 < x1) parts.push([t1, x1]);
      return parts;
    });
  }
  return out;
}

/**
 * The pieces of a Lebesgue sum: for each level y_k the preimage { y_k ≤ f < y_{k+1} } as intervals,
 * with its measure and the area y_k · μ added by the level.
 * @returns {{ level: number, upper: number, intervals: number[][], measure: number, area: number }[]}
 */
export function lebesgueSlabs(fn, N, top) {
  const { levels } = levelsOf(fn, N, top ?? truncationLevel(fn, N));
  const sets = levels.map((y) => fn.superlevel(y));
  const slabs = [];
  for (let k = 0; k < N; k += 1) {
    const set = subtract(sets[k], sets[k + 1]);
    const measure = set.reduce((s, [x0, x1]) => s + (x1 - x0), 0);
    slabs.push({ level: levels[k], upper: levels[k + 1], intervals: set, measure, area: levels[k] * measure });
  }
  // The part of the domain on which f lies at or above the last level, counted at that level (the last term of (2)).
  const last = sets[N];
  const lastMeasure = last.reduce((s, [x0, x1]) => s + (x1 - x0), 0);
  slabs.push({ level: levels[N], upper: Infinity, intervals: last, measure: lastMeasure, area: levels[N] * lastMeasure });
  return slabs;
}

/* ------------------------------------------------------------ pathological functions */

const gcd = (p, q) => (q === 0 ? p : gcd(q, p % q));

/**
 * Euler's totient φ(q) for q = 1..m, by a sieve.
 * @returns {Int32Array} index q holds φ(q)
 */
export function totients(m) {
  const phi = new Int32Array(m + 1);
  for (let i = 0; i <= m; i += 1) phi[i] = i;
  for (let p = 2; p <= m; p += 1) {
    if (phi[p] !== p) continue;
    for (let k = p; k <= m; k += p) phi[k] -= phi[k] / p;
  }
  return phi;
}

/**
 * The Riemann sums of the Dirichlet function (1 on the rationals, 0 on the irrationals) over n equal
 * subintervals, for the three ways of choosing the tags. Every subinterval contains both kinds of
 * number, so a tag may be chosen rational or irrational at will: the upper Darboux sum is 1 and the
 * lower is 0 for every n, and the sum takes any value in between.
 * @returns {{ n: number, rational: number, irrational: number, alternating: number, upper: number, lower: number }}
 */
export function dirichletSums(n) {
  return { n, rational: 1, irrational: 0, alternating: Math.ceil(n / 2) / n, upper: 1, lower: 0 };
}

/**
 * The value of Thomae's function at p/q in lowest terms is 1/q; at 0 and 1 it is 1. The tag sums of
 * the equal partition and the Darboux sums, exactly, in integer arithmetic.
 *
 *   right-hand tags k/n   f = gcd(k, n)/n, so the sum is (1/n²) ∑ gcd(k, n)
 *   irrational tags       f = 0, so the sum is 0
 *   lower Darboux sum     0, because every subinterval contains an irrational number
 *   upper Darboux sum     (1/n) ∑ 1/q_k, q_k the smallest denominator of a fraction in the k-th subinterval
 * @returns {{ n: number, rational: number, irrational: number, upper: number, lower: number }}
 */
export function thomaeSums(n) {
  let rational = 0;
  let upper = 0;
  for (let k = 1; k <= n; k += 1) {
    rational += gcd(k, n);
    // The smallest q for which some p/q lies in [(k − 1)/n, k/n].
    let q = 1;
    while (Math.ceil(((k - 1) * q) / n) > Math.floor((k * q) / n)) q += 1;
    upper += 1 / q;
  }
  return { n, rational: rational / (n * n), irrational: 0, upper: upper / n, lower: 0 };
}

/**
 * How many points of [0, 1] have Thomae's function at least 1/m: the fractions in lowest terms with
 * denominator at most m, which is 1 + ∑ φ(q) for q ≤ m. A finite set, so of measure zero.
 * @returns {number[]} index m holds the count, for m = 1..M
 */
export function thomaeLevelCounts(M) {
  const phi = totients(M);
  const counts = [0];
  let running = 1;
  for (let m = 1; m <= M; m += 1) {
    running += phi[m];
    counts.push(running);
  }
  return counts;
}

/**
 * The Lebesgue sums of the two functions: the superlevel sets {f ≥ c} for c > 0 are the rationals in
 * [0, 1] (Dirichlet) and a finite set of fractions (Thomae), of measure zero, so every sum is 0
 * and so is the integral.
 */
export const PATHOLOGICAL_LEBESGUE = Object.freeze({ dirichlet: 0, thomae: 0 });

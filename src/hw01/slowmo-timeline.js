/**
 * The timeline of the slowed-down view of §4 (Figure 4): the group operations
 * of a scalar multiplication kG on the toy curve, in the order in which the
 * view draws them, with everything one operation shows. Pure functions, shared
 * by the page script and the tests.
 *
 * An operation is derived from the step records of src/lib/toy-curve.js:
 *   kind      'add' (P ≠ ±Q), 'double' (P = Q, tangent), 'inverse' (Q = −P,
 *             vertical line, result O), 'identity' (P or Q is O, nothing to
 *             draw) or 'load' (double-and-add: the leading bit loads G)
 *   P, Q      the operands (numbers { x, y }, or null for O); kP, kQ their
 *             multiples of G, iP, iQ the same modulo n, the order of G
 *   lambda,nu the line y = λx + ν (mod p); null when vertical or absent
 *   third     R′, the third intersection (null for a vertical line)
 *   result    R = P + Q = −R′; k its multiple of G and index = k mod n
 *   line      null, { vertical: true, x, … } or { vertical: false, lambda, nu,
 *             slope, … } with the parallel segments it forms on the sheet
 *             (lineSegments), its p lattice points and the fraction of the
 *             drawing at which the pen reaches each of them (ticks)
 *   bit       double-and-add only: the bit read and its position (0 = leading)
 *   formulas  the arithmetic with substituted numbers, as HTML strings (var,
 *             sub, sup), every reduction modulo p written with ≡
 *
 * Repeated addition yields the operations 2G, 3G, …, kG; double-and-add the
 * load of G, then a doubling per later bit and an addition per bit equal to 1.
 */

import { TOY_BASE, TOY_CURVE, isOnCurve, multiplyByDoubleAndAdd, multiplyByRepeatedAddition, orderOf } from '../lib/toy-curve.js';
import { lineSegments } from './lattice.js';

/** Largest k shown by each method: one operation per multiple, or per bit. */
export const LIMITS = Object.freeze({ repeated: 60, doubleAndAdd: 9999 });

/** Duration of each phase of one operation at normal speed, in ms. */
export const PHASE_MS = Object.freeze({ operands: 250, line: 900, third: 300, reflect: 500, land: 400, clear: 200 });

/** Duration factors of the three speeds: slow doubles every duration, fast halves it. */
export const SPEED = Object.freeze({ slow: 2, normal: 1, fast: 0.5 });

/** Rest between two operations while playing, at normal speed, in ms. */
export const REST_MS = 420;

export const METHODS = Object.freeze(['repeated', 'double-and-add']);

const KIND_LABEL = Object.freeze({
  add: 'Addition',
  double: 'Doubling',
  inverse: 'Inverse points',
  identity: 'Identity',
  load: 'Leading bit',
});

const mod = (v, p) => ((v % p) + p) % p;
const minus = (v) => (v < 0 ? `−${-v}` : String(v));
const name = (k) => (k === 1 ? 'G' : `${k}G`);
const coords = (P) => (P ? `(${P.x}, ${P.y})` : 'O');
const num = (P) => (P === null || P === undefined ? null : { x: Number(P.x), y: Number(P.y) });

/* HTML pieces: a variable with an optional subscript, a superscript. */
const v = (s, i) => `<var>${s}</var>${i ? `<sub>${i}</sub>` : ''}`;
const sup = (s) => `<sup>${s}</sup>`;
const LAMBDA = v('λ');
const NU = v('ν');

/* "= raw", followed by "≡ r (mod p)" when raw is not already reduced. */
function chain(raw, p) {
  const r = mod(raw, p);
  return r === raw ? `= ${minus(raw)}` : `= ${minus(raw)} ≡ ${r} (mod ${p})`;
}

/* The inverse of a non-zero residue by the extended Euclidean algorithm. */
function inverseOf(value, p) {
  let [r0, r1, s0, s1] = [value, p, 1, 0];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1, s0, s1] = [r1, r0 - q * r1, s1, s0 - q * s1];
  }
  if (r0 !== 1) throw new RangeError(`${value} is not invertible modulo ${p}`);
  return mod(s0, p);
}

/**
 * The inverse of v modulo p with the check that proves it, for example
 * "10⁻¹ ≡ 12 (mod 17) because 10·12 = 120 = 7·17 + 1".
 * @param {number} value any integer not divisible by p
 * @param {number} p a prime
 * @returns {{ value: number, inverse: number, product: number, quotient: number, text: string, html: string }}
 */
export function explainInverse(value, p) {
  const a = mod(value, p);
  if (a === 0) throw new RangeError('0 has no multiplicative inverse');
  const inv = inverseOf(a, p);
  const product = a * inv;
  const quotient = (product - 1) / p;
  const tail = `≡ ${inv} (mod ${p}) because ${a}·${inv} = ${product} = ${quotient}·${p} + 1`;
  return { value: a, inverse: inv, product, quotient, text: `${a}⁻¹ ${tail}`, html: `${a}${sup('−1')} ${tail}` };
}

/* The slope with every substitution: (numerator)·(denominator)⁻¹ ≡ a·b⁻¹ ≡ a·inv = prod ≡ λ. */
function slopeChain(numeratorText, denominatorText, numerator, denominator, p) {
  const a = mod(numerator, p);
  const { inverse: inv } = explainInverse(denominator, p);
  const product = a * inv;
  const lambda = mod(product, p);
  const reduced = `${a}·${mod(denominator, p)}${sup('−1')} ≡ ${a}·${inv} = ${product}`;
  return `${numeratorText}·${denominatorText}${sup('−1')} ≡ ${reduced}${product === lambda ? '' : ` ≡ ${lambda}`} (mod ${p})`;
}

/* The formulas of one chord-and-tangent operation, as HTML strings. */
function chordFormulas({ kind, P, Q, kP, kQ, k, lambda, nu, third, result, curve, p }) {
  const a = Number(curve.a);
  const f = {};
  if (kind === 'double') {
    f.operands = `${v('P')} = ${v('Q')} = ${name(kP)} = ${coords(P)}: the tangent at ${v('P')}`;
    const numerator = 3 * P.x * P.x + a;
    const symbolic = a === 0 ? `3${v('x', 1)}${sup(2)}·(2${v('y', 1)})${sup('−1')}` : `(3${v('x', 1)}${sup(2)} + ${v('a')})·(2${v('y', 1)})${sup('−1')}`;
    const numText = a === 0 ? `3·${P.x}${sup(2)}` : `(3·${P.x}${sup(2)} + ${a})`;
    f.lambda = `${LAMBDA} = ${symbolic} = ${slopeChain(numText, `(2·${P.y})`, numerator, 2 * P.y, p)}`;
    f.inverse = explainInverse(2 * P.y, p).html;
  } else {
    f.operands = `${v('P')} = ${name(kP)} = ${coords(P)}, ${v('Q')} = ${name(kQ)} = ${coords(Q)}: the chord through ${v('P')} and ${v('Q')}`;
    const symbolic = `(${v('y', 2)} − ${v('y', 1)})·(${v('x', 2)} − ${v('x', 1)})${sup('−1')}`;
    f.lambda = `${LAMBDA} = ${symbolic} = ${slopeChain(`(${Q.y} − ${P.y})`, `(${Q.x} − ${P.x})`, Q.y - P.y, Q.x - P.x, p)}`;
    f.inverse = explainInverse(Q.x - P.x, p).html;
  }
  f.nu = `${NU} = ${v('y', 1)} − ${LAMBDA}${v('x', 1)} = ${P.y} − ${lambda}·${P.x} ${chain(P.y - lambda * P.x, p)}`;
  f.x3 = `${v('x', 3)} = ${LAMBDA}${sup(2)} − ${v('x', 1)} − ${v('x', 2)} = ${lambda}${sup(2)} − ${P.x} − ${Q.x} ${chain(lambda * lambda - P.x - Q.x, p)}`;
  f.yPrime = `${v('y')}′ = ${LAMBDA}${v('x', 3)} + ${NU} = ${lambda}·${third.x} + ${nu} ${chain(lambda * third.x + nu, p)}, so ${v('R')}′ = ${coords(third)}`;
  const reflected = third.y === 0 ? '−0 = 0' : `−${third.y} ≡ ${mod(-third.y, p)} (mod ${p})`;
  f.y3 = `${v('y', 3)} = −${v('y')}′ = ${reflected}, so ${v('R')} = ${coords(result)}`;
  f.result = `${name(k)} = ${name(kP)} + ${name(kQ)} = ${coords(result)}`;
  return f;
}

/* The formulas when the line is vertical: Q = −P, or the tangent at a point with y = 0. */
function verticalFormulas({ kind, P, Q, kP, kQ, k, p }) {
  const f = { inverse: null, nu: null, yPrime: null };
  if (kind === 'double') {
    f.operands = `${v('P')} = ${v('Q')} = ${name(kP)} = ${coords(P)}: the tangent at ${v('P')}`;
    f.lambda = `${v('y', 1)} = 0, so 2${v('y', 1)} has no inverse: the tangent at ${coords(P)} is the vertical line ${v('x')} = ${P.x}`;
  } else {
    f.operands = `${v('P')} = ${name(kP)} = ${coords(P)}, ${v('Q')} = ${name(kQ)} = ${coords(Q)}: the chord through ${v('P')} and ${v('Q')}`;
    f.lambda = `${v('x', 1)} = ${v('x', 2)} = ${P.x} and ${v('y', 1)} + ${v('y', 2)} = ${P.y} + ${Q.y} = ${P.y + Q.y} ≡ 0 (mod ${p}): ${v('Q')} = −${v('P')} and the line is vertical, ${v('x')} = ${P.x}`;
  }
  f.x3 = 'A vertical line meets the curve in no third affine point: its third intersection is the point at infinity O';
  f.y3 = '−O = O';
  f.result = `${name(k)} = ${name(kP)} + ${name(kQ)} = O`;
  return f;
}

function identityFormulas({ P, Q, kP, kQ, k, result }) {
  const same = kP === kQ;
  const operands = same
    ? `${v('P')} = ${v('Q')} = ${name(kP)} = O: O is the identity of the group, so O + O = O`
    : `${v('P')} = ${name(kP)} = ${coords(P)}, ${v('Q')} = ${name(kQ)} = ${coords(Q)}: O is the identity of the group, so ${v('P')} + ${v('Q')} = ${P === null ? v('Q') : v('P')}, with no line to draw`;
  return { operands, lambda: null, inverse: null, nu: null, x3: null, yPrime: null, y3: null, result: `${name(k)} = ${name(kP)} + ${name(kQ)} = ${coords(result)}` };
}

/* The drawable line of a step record: its segments on the sheet, its lattice points and their ticks. */
function drawableLine(record, p) {
  if (!record.line) return null;
  if (record.line.vertical) {
    const x = Number(record.line.x);
    return {
      vertical: true,
      x,
      segments: lineSegments(p, null, x),
      points: Array.from({ length: p }, (_, y) => ({ x, y })),
      ticks: Array.from({ length: p }, (_, y) => (y + 0.5) / p),
    };
  }
  const lambda = Number(record.lambda);
  const nu = Number(record.nu);
  const slope = lambda > p / 2 ? lambda - p : lambda; // the representative with the fewest wraps
  return {
    vertical: false,
    lambda,
    nu,
    slope,
    segments: lineSegments(p, slope, nu),
    points: Array.from({ length: p }, (_, x) => ({ x, y: mod(lambda * x + nu, p) })),
    ticks: Array.from({ length: p }, (_, x) => (x + 0.5) / p),
  };
}

/* One operation of the timeline from a step record of toy-curve.js. */
function operation({ record, step, kP, kQ, k, n, p, curve, bit = null, bitIndex = null }) {
  const P = num(record.P);
  const Q = num(record.Q);
  const third = num(record.third);
  const result = num(record.result);
  const lambda = record.lambda === null ? null : Number(record.lambda);
  const nu = record.nu === null ? null : Number(record.nu);
  const line = drawableLine(record, p);
  const kind = record.kind;
  const ctx = { kind, P, Q, kP, kQ, k, lambda, nu, third, result, curve, p };
  let formulas;
  if (kind === 'identity') formulas = identityFormulas(ctx);
  else if (line?.vertical) formulas = verticalFormulas(ctx);
  else formulas = chordFormulas(ctx);
  return {
    step,
    kind,
    kindLabel: KIND_LABEL[kind],
    title: `${name(kP)} + ${name(kQ)}`,
    text: `${name(k)} = ${name(kP)} + ${name(kQ)} = ${coords(result)}`,
    P,
    Q,
    kP,
    kQ,
    iP: kP % n,
    iQ: kQ % n,
    lambda,
    nu,
    third,
    result,
    k,
    index: k % n,
    line,
    bit,
    bitIndex,
    formulas,
  };
}

/**
 * The operations that compute kG, in the order of the method.
 * @param {{ curve?: object, base?: { x: number|bigint, y: number|bigint }, k: number, method: 'repeated'|'double-and-add' }} options
 * @returns {{ curve: object, p: number, base: { x: number, y: number }, n: number, k: number, method: string,
 *   bits: string|null, ops: object[], states: { point: object|null|undefined, k: number, index: number|null }[],
 *   result: object|null, resultK: number }}
 * @throws {RangeError} for an unknown method, a k outside the method's range or a base point off the curve
 */
export function buildTimeline({ curve = TOY_CURVE, base = TOY_BASE, k = 6, method = 'repeated' } = {}) {
  if (!METHODS.includes(method)) throw new RangeError(`unknown method "${method}"`);
  const limit = method === 'repeated' ? LIMITS.repeated : LIMITS.doubleAndAdd;
  if (!Number.isInteger(k) || k < 1 || k > limit) {
    throw new RangeError(`k must be a whole number from 1 to ${limit} for ${method === 'repeated' ? 'repeated addition' : 'double-and-add'}`);
  }
  const G = { x: BigInt(base.x), y: BigInt(base.y) };
  if (!isOnCurve(curve, G)) throw new RangeError(`(${base.x}, ${base.y}) is not a point of the curve`);
  const p = Number(curve.p);
  const n = Number(orderOf(curve, G));
  const ops = [];
  let bits = null;
  if (method === 'repeated') {
    const { steps } = multiplyByRepeatedAddition(curve, G, BigInt(k));
    steps.forEach((record, i) => ops.push(operation({ record, step: i + 1, kP: i + 1, kQ: 1, k: i + 2, n, p, curve })));
  } else {
    const trace = multiplyByDoubleAndAdd(curve, G, BigInt(k));
    bits = trace.bits;
    const g = num(G);
    ops.push({
      step: 1,
      kind: 'load',
      kindLabel: KIND_LABEL.load,
      title: 'Load G',
      text: `G = ${coords(g)}`,
      P: null,
      Q: g,
      kP: 0,
      kQ: 1,
      iP: 0,
      iQ: 1 % n,
      lambda: null,
      nu: null,
      third: null,
      result: g,
      k: 1,
      index: 1 % n,
      line: null,
      bit: 1,
      bitIndex: 0,
      formulas: {
        operands: `The leading bit of ${v('k')} is 1: the accumulator is loaded with G = ${coords(g)}, without a group operation`,
        lambda: null,
        inverse: null,
        nu: null,
        x3: null,
        yPrime: null,
        y3: null,
        result: `G = ${coords(g)}`,
      },
    });
    let acc = 1;
    for (const s of trace.steps) {
      const kNext = Number(s.index);
      const [kP, kQ] = s.op === 'double' ? [acc, acc] : [acc, 1];
      ops.push(operation({ record: s.record, step: ops.length + 1, kP, kQ, k: kNext, n, p, curve, bit: s.bit, bitIndex: s.bitIndex }));
      acc = kNext;
    }
  }
  const first = method === 'repeated' ? { point: num(G), k: 1, index: 1 % n } : { point: undefined, k: 0, index: null };
  const states = [first, ...ops.map((op) => ({ point: op.result, k: op.k, index: op.index }))];
  const last = states.at(-1);
  return { curve, p, base: num(G), n, k, method, bits, ops, states, result: last.point ?? null, resultK: last.k };
}

/* ---------------------------------------------------------------- phases */

const PLAN = Object.freeze({
  load: ['operands', 'land'],
  identity: ['operands', 'land', 'clear'],
  vertical: ['operands', 'line', 'third', 'land', 'clear'],
  chord: ['operands', 'line', 'third', 'reflect', 'land', 'clear'],
});

/**
 * The phases of one operation at normal speed: operands (the rings pulse), line (drawn segment
 * by segment), third (R′ appears), reflect (the drop across the mirror line), land (the
 * accumulator travels to R) and clear (helpers fade to a trace). A vertical line has no
 * reflection, O + G no line, and loading G only lands.
 * @returns {{ name: string, start: number, duration: number }[]}
 */
export function phasePlan(op) {
  let names = PLAN.chord;
  if (op.kind === 'load') names = PLAN.load;
  else if (op.kind === 'identity') names = PLAN.identity;
  else if (op.line?.vertical) names = PLAN.vertical;
  let start = 0;
  return names.map((name) => {
    const phase = { name, start, duration: PHASE_MS[name] };
    start += phase.duration;
    return phase;
  });
}

/** Total duration of one operation at normal speed, in ms. */
export function operationMs(op) {
  const plan = phasePlan(op);
  return plan.at(-1).start + plan.at(-1).duration;
}

/**
 * The progress of every phase, from 0 to 1, after `elapsed` ms (normal speed) of an
 * operation; null for a phase the operation does not have. `active` names the phase
 * under way (null when done).
 */
export function phaseProgress(op, elapsed) {
  const out = { operands: null, line: null, third: null, reflect: null, land: null, clear: null, active: null, done: false };
  const plan = phasePlan(op);
  for (const ph of plan) {
    out[ph.name] = Math.min(1, Math.max(0, (elapsed - ph.start) / ph.duration));
    if (out.active === null && elapsed < ph.start + ph.duration) out.active = ph.name;
  }
  out.done = elapsed >= plan.at(-1).start + plan.at(-1).duration;
  return out;
}

/* ---------------------------------------------------------------- easing */

/**
 * The CSS timing function cubic-bezier(x1, y1, x2, y2) as a function of the
 * time fraction, solved by Newton steps with a bisection fallback.
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-9) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-9) break;
      t = Math.min(1, Math.max(0, t - error / d));
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 60; i += 1) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-9) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** The site's arrival curve, cubic-bezier(0.16, 1, 0.3, 1). */
export const easeOut = cubicBezier(0.16, 1, 0.3, 1);

/** A gentle start and finish, for the morph of the sheet into the torus. */
export const easeInOut = cubicBezier(0.45, 0, 0.2, 1);

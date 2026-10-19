/**
 * The cost of the attacks on the restricted key space of the toy
 * elliptic-curve scheme (src/lib/restricted-key-attack.js), measured on seeded
 * random keys of growing size and extrapolated to full-size keys.
 *
 *   measureAttackCost(options)   group operations and time of each solver per key size
 *   fitLog2(points)              least-squares line of log₂(mean operations) on the key size
 *   extrapolate(fit, bits)       log₂ of the operations the fitted line predicts
 *   keySpaces()                  the key spaces of the Caesar cipher, the toy scheme and secp256k1
 *   attackCostTable(cost, ...)   the extrapolated costs, with times at given operation rates
 *
 * The functions are pure apart from the clock (performance.now, which only
 * times the runs; the operation counts are deterministic for a seed), so the
 * module runs in the build and in a browser worker alike.
 *
 * Design. For each key size b the same `keysPerBits` key pairs, private key
 * uniform on [1, 2^b], are attacked by every solver that runs at that size,
 * so that the solvers are compared on identical targets. Every recovered key is
 * checked against the private key; a run that fails is recorded, never dropped.
 */

import { N } from './secp256k1.js';
import { createRandom } from './random.js';
import { deriveSeed } from './kg-study.js';
import { generateKeyPair } from './toy-ecc-encryption.js';
import { babyStepGiantStep, bruteForce, pollardKangaroo } from './restricted-key-attack.js';

/** The solvers, in display order, with their printed names and asymptotic cost. */
export const SOLVERS = Object.freeze({
  'brute-force': { label: 'Brute force', expected: 'n/2', exponent: 1 },
  bsgs: { label: 'Baby-step giant-step', expected: '≈ 1.5·√n', exponent: 0.5 },
  kangaroo: { label: "Pollard's kangaroo", expected: 'O(√n)', exponent: 0.5 },
});

/** Key sizes, in bits, attacked by each solver by default (the build-time budget sets the upper ends). */
export const DEFAULT_RANGES = Object.freeze({
  'brute-force': Object.freeze([8, 10, 12, 14, 16, 18, 20]),
  bsgs: Object.freeze([8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]),
  kangaroo: Object.freeze([8, 10, 12, 14, 16, 18, 20, 22, 24]),
});

const RUN = {
  'brute-force': (Q, bits) => bruteForce(Q, bits),
  bsgs: (Q, bits) => babyStepGiantStep(Q, bits),
  kangaroo: (Q, bits, seed) => pollardKangaroo(Q, bits, { random: createRandom(seed) }),
};

/**
 * Least-squares fit of y = intercept + slope · x with the correlation r.
 * @param {{ x: number, y: number }[]} points
 */
export function linearFit(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy), n };
}

/** The fit of log₂(mean operations) on the key size b. */
export function fitLog2(points) {
  return linearFit(points.map((p) => ({ x: p.bits, y: Math.log2(p.meanOperations) })));
}

/** log₂ of the operations the fitted line predicts for `bits`. */
export const extrapolate = (fit, bits) => fit.intercept + fit.slope * bits;

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Runs every solver on `keysPerBits` seeded keys of each size of its range.
 * @param {{ seed?: number, keysPerBits?: number, ranges?: Record<string, number[]>,
 *   onProgress?: (method: string, bits: number) => void }} [options]
 */
export function measureAttackCost({ seed = 20261019, keysPerBits = 8, ranges = DEFAULT_RANGES, onProgress } = {}) {
  const allBits = [...new Set(Object.values(ranges).flat())].sort((a, b) => a - b);
  const keys = new Map(
    allBits.map((bits) => {
      const random = createRandom(deriveSeed(seed, `attack-keys-b${bits}`));
      return [bits, Array.from({ length: keysPerBits }, () => generateKeyPair({ bits, random }))];
    }),
  );
  const methods = {};
  for (const method of Object.keys(SOLVERS)) {
    const points = [];
    let operations = 0;
    let ms = 0;
    for (const bits of ranges[method] ?? []) {
      onProgress?.(method, bits);
      const runs = keys.get(bits).map((pair, i) => {
        const t0 = performance.now();
        const r = RUN[method](pair.publicKey, bits, deriveSeed(seed, `kangaroo-b${bits}-${i}`));
        const elapsed = performance.now() - t0;
        return { operations: r.operations, ms: elapsed, found: r.found && r.k === pair.privateKey };
      });
      const ops = runs.map((r) => r.operations);
      const time = runs.reduce((s, r) => s + r.ms, 0);
      operations += ops.reduce((s, v) => s + v, 0);
      ms += time;
      points.push({
        bits,
        keys: runs.length,
        found: runs.filter((r) => r.found).length,
        operations: ops,
        meanOperations: ops.reduce((s, v) => s + v, 0) / ops.length,
        medianOperations: median(ops),
        meanMs: time / runs.length,
      });
    }
    methods[method] = {
      points,
      fit: points.length >= 2 ? fitLog2(points) : null,
      rate: ms > 0 ? operations / (ms / 1000) : null,
      totalOperations: operations,
      totalSeconds: ms / 1000,
    };
  }
  return {
    meta: {
      seed,
      keysPerBits,
      ranges: Object.fromEntries(Object.entries(ranges).map(([k, v]) => [k, [...v]])),
      privateKeys: Object.fromEntries([...keys].map(([bits, list]) => [bits, list.map((p) => p.privateKey.toString())])),
    },
    methods,
  };
}

/** log₂ of the order n of the secp256k1 group (just below 256). */
export const LOG2_N = Math.log2(Number(N));

/**
 * The key spaces compared on the page: the size of each and its base-2 logarithm.
 * @param {{ toyBits?: number }} [options]
 */
export function keySpaces({ toyBits = 20 } = {}) {
  return [
    { key: 'caesar', name: 'Caesar cipher', size: 26, log2: Math.log2(26), description: 'shifts 0 … 25 (shift 0 leaves the text unchanged)' },
    { key: 'toy', name: 'Toy EC scheme', size: 2 ** toyBits, log2: toyBits, description: `private keys 1 … 2^{${toyBits}}` },
    { key: 'secp256k1', name: 'secp256k1, full range', size: Number(N) - 1, log2: LOG2_N, description: 'private keys 1 … n − 1' },
  ];
}

/**
 * The cost of each attack extrapolated to key sizes beyond the measured range,
 * as log₂ of the operations and seconds at the measured rate and at a given
 * fast rate, together with the reference cost of Pollard's rho on the full
 * secp256k1 group, √(πn/4) group operations.
 * @param {ReturnType<typeof measureAttackCost>} cost
 * @param {{ targets?: number[], fastRate?: number }} [options]
 */
export function attackCostTable(cost, { targets = [128, 256], fastRate = 1e12 } = {}) {
  const rows = [];
  for (const [method, m] of Object.entries(cost.methods)) {
    if (!m.fit) continue;
    for (const bits of targets) {
      const log2Operations = extrapolate(m.fit, bits);
      rows.push({
        method,
        bits,
        log2Operations,
        log2SecondsMeasured: log2Operations - Math.log2(m.rate),
        log2SecondsFast: log2Operations - Math.log2(fastRate),
        rate: m.rate,
      });
    }
  }
  const rhoLog2 = 0.5 * Math.log2((Math.PI * Number(N)) / 4);
  return { rows, rho: { log2Operations: rhoLog2, log2SecondsFast: rhoLog2 - Math.log2(fastRate) }, fastRate, targets: [...targets] };
}

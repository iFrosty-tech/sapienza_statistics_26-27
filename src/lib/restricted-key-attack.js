/**
 * Attacks that exploit the restricted key space of the toy scheme
 * (src/lib/toy-ecc-encryption.js): the private key k, or a deliberately
 * restricted ephemeral r, is known to lie in [1, 2^bits], so the elliptic-curve
 * discrete logarithm — infeasible on the full secp256k1 group — becomes a small
 * search. Three solvers of the ECDLP restricted to that interval are provided:
 *
 *   - bruteForce: walk G, 2G, 3G, … and compare against Q. It finds k = j at
 *     step j, so the expected cost over a uniform key is about 2^(bits−1)
 *     additions. O(1) memory.
 *   - babyStepGiantStep: Shanks' method on the interval [1, 2^bits]: a table of
 *     m = ⌈√(2^bits)⌉ baby steps and at most m giant steps of stride mG. About
 *     2·2^(bits/2) operations and 2^(bits/2) memory.
 *   - pollardKangaroo: Pollard's lambda method for an interval, O(2^(bits/2))
 *     expected time and O(1) memory, seeded and restarted on failure.
 *
 * recoverEphemeral and decryptWithoutKey chain a solver with the toy scheme to
 * decrypt a ciphertext without the private key: decryptWithoutKey recovers k
 * from the public key Q, whereas recoverEphemeral recovers a restricted
 * ephemeral r from R = rG and uses S = rQ — a weakness of the scheme design
 * (a short ephemeral) that is independent of the size of k.
 *
 * Each solver returns { k, operations, found, method, … }; `operations` counts
 * elliptic-curve group operations (point additions/doublings). Apart from the
 * injected RNG the functions are pure, and nothing but constants is evaluated at
 * import time. The group operations reuse the Jacobian arithmetic and the
 * batched inversion of src/lib/secp256k1.js.
 *
 * Teaching code: readable over fast, and only for the toy restricted range.
 */
import {
  G,
  P,
  mod,
  mul,
  add,
  negate,
  equals,
  batchInverse,
  jacobianAddAffine,
  toJacobian,
} from './secp256k1.js';
import { createRandom } from './random.js';
import { parsePoint, decrypt, decryptWithSharedPoint } from './toy-ecc-encryption.js';

/** A stable string key for an affine point (infinity included), for hash lookups. */
const pointKey = (point) => (point === null ? 'O' : `${point.x},${point.y}`);

/**
 * Brute force: accumulate P = j·G by successive additions and stop when P = Q,
 * returning k = j. Costs j − 1 additions, about 2^(bits−1) on average. A
 * progress callback is invoked every `progressEvery` steps for a worker UI.
 * @param {object|string} publicKey Q, as a point, compressed hex or bytes
 * @param {number} bits the key is known to lie in [1, 2^bits]
 * @param {{ onProgress?: (done: number, total: number) => void, progressEvery?: number }} [options]
 * @returns {{ k: bigint|null, operations: number, found: boolean, method: string }}
 */
export function bruteForce(publicKey, bits, { onProgress, progressEvery = 4096 } = {}) {
  const Q = parsePoint(publicKey);
  const total = 2 ** bits;
  // Keep j·G in Jacobian and compare against Q projectively: a Jacobian point
  // (X, Y, Z) equals the affine (x, y) iff x·Z² ≡ X and y·Z³ ≡ Y (mod p). This
  // avoids a field inversion per step, the dominant cost of the walk.
  let acc = toJacobian(G);
  for (let j = 1; j <= total; j += 1) {
    if (acc.Z !== 0n) {
      const z2 = (acc.Z * acc.Z) % P;
      if ((Q.x * z2) % P === acc.X && (Q.y * z2 * acc.Z) % P === acc.Y) {
        return { k: BigInt(j), operations: j - 1, found: true, method: 'brute-force' };
      }
    }
    if (onProgress && j % progressEvery === 0) onProgress(j, total);
    acc = jacobianAddAffine(acc, G);
  }
  return { k: null, operations: total, found: false, method: 'brute-force' };
}

/**
 * Builds the affine table [1·G, 2·G, …, m·G] with one batched field inversion,
 * reusing the Montgomery trick of secp256k1.js. Returns the points and the
 * stride m·G.
 */
function babyStepTable(m) {
  const jacobians = new Array(m);
  let acc = toJacobian(G);
  jacobians[0] = acc;
  for (let i = 1; i < m; i += 1) {
    acc = jacobianAddAffine(acc, G);
    jacobians[i] = acc;
  }
  const zInverses = batchInverse(jacobians.map((j) => j.Z));
  const points = jacobians.map((j, i) => {
    const zInv = zInverses[i];
    const zInv2 = (zInv * zInv) % P;
    return { x: (j.X * zInv2) % P, y: (j.Y * zInv2 * zInv) % P };
  });
  return { points, stride: points[m - 1] };
}

/**
 * Baby-step giant-step on the interval [1, 2^bits]. With m = ⌈√(2^bits)⌉, write
 * k = i·m + (j + 1), 0 ≤ i < m, 0 ≤ j < m; then Q − (j+1)·G = i·(m·G). We store
 * the baby steps (j+1)·G and walk Q by −m·G until a stored point is hit.
 * @returns {{ k: bigint|null, operations: number, found: boolean, method: string, tableSize: number }}
 */
export function babyStepGiantStep(publicKey, bits, { onProgress, progressEvery = 4096 } = {}) {
  const Q = parsePoint(publicKey);
  const total = 2 ** bits;
  const m = Math.ceil(Math.sqrt(total));
  const { points, stride } = babyStepTable(m);
  // table: point (j+1)·G → residue (j+1)
  const table = new Map();
  for (let j = 0; j < m; j += 1) table.set(pointKey(points[j]), j + 1);
  let operations = m - 1; // additions spent building the table
  const minusStride = negate(stride);
  let gamma = Q;
  for (let i = 0; i < m; i += 1) {
    const hit = table.get(pointKey(gamma));
    if (hit !== undefined) {
      const k = BigInt(i) * BigInt(m) + BigInt(hit);
      if (k >= 1n && k <= BigInt(total)) return { k, operations, found: true, method: 'bsgs', tableSize: m };
    }
    if (onProgress && i % progressEvery === 0) onProgress(i, m);
    gamma = add(gamma, minusStride);
    operations += 1;
  }
  return { k: null, operations, found: false, method: 'bsgs', tableSize: m };
}

/**
 * The deterministic pseudo-random walk of Pollard's lambda method: a partition
 * of points into `k` classes by a hash of the x-coordinate, each class j taking
 * a jump of s_j·G. The mean jump is tuned to ≈ √(interval width)/2.
 */
function makeJumps(width, classes, random) {
  const meanJump = Math.max(1, Math.round(Math.sqrt(width) / 2));
  const sizes = [];
  let mean = 0;
  for (let j = 0; j < classes; j += 1) {
    // Powers-of-two-ish jumps with the right mean: s_j = 2^j, averaged to meanJump by scaling.
    sizes.push(2 ** j);
  }
  const rawMean = sizes.reduce((s, x) => s + x, 0) / classes;
  const scale = meanJump / rawMean;
  const scaled = sizes.map((s) => Math.max(1, Math.round(s * scale)));
  mean = scaled.reduce((s, x) => s + x, 0) / classes;
  // Precompute the jump points s_j·G.
  const points = scaled.map((s) => mul(G, BigInt(s)));
  // A seeded permutation of the classes keeps the walk reproducible yet seed-dependent.
  const perm = scaled.map((_, j) => j);
  for (let i = perm.length - 1; i > 0; i -= 1) {
    const r = random.int(i + 1);
    [perm[i], perm[r]] = [perm[r], perm[i]];
  }
  const classOf = (point) => perm[Number(mod(point.x, BigInt(classes)))];
  return { classOf, jumpScalar: scaled, jumpPoint: points, meanJump: mean };
}

/**
 * Pollard's kangaroo (lambda) method for the discrete logarithm of Q in the
 * interval [1, 2^bits]. A tame kangaroo starts at the top of the interval and
 * lays a trap; a wild kangaroo starts at Q and, if it lands on the trap,
 * reveals k. On failure (a missed trap, or a cycle) the walk is restarted with
 * a fresh offset, up to `maxRestarts` times. Seeded through the injected RNG.
 * @param {{ random?: object, maxRestarts?: number, onProgress?: Function, progressEvery?: number }} [options]
 * @returns {{ k: bigint|null, operations: number, found: boolean, method: string, restarts: number }}
 */
export function pollardKangaroo(publicKey, bits, options = {}) {
  const { random = createRandom(1), maxRestarts = 24, onProgress, progressEvery = 4096 } = options;
  const Q = parsePoint(publicKey);
  const lower = 1n;
  const upper = BigInt(2 ** bits);
  const width = 2 ** bits;
  const classes = Math.max(4, Math.min(32, bits));
  let operations = 0;

  for (let restart = 0; restart <= maxRestarts; restart += 1) {
    const { classOf, jumpScalar, jumpPoint } = makeJumps(width, classes, random);
    // Tame walk: start at upper·G, run a bounded number of steps, record the trap.
    const steps = Math.ceil(4 * Math.sqrt(width)) + restart * Math.ceil(Math.sqrt(width));
    let tameDist = 0n;
    let tame = mul(G, upper);
    operations += 1;
    for (let i = 0; i < steps; i += 1) {
      const c = classOf(tame);
      tameDist += BigInt(jumpScalar[c]);
      tame = add(tame, jumpPoint[c]);
      operations += 1;
    }
    const trapKey = pointKey(tame);
    const trapExponent = upper + tameDist; // discrete log of the trap point (base G)

    // Wild walk: start at Q, run until it hits the trap or exceeds the bound.
    let wildDist = 0n;
    let wild = Q;
    const wildMax = steps + width; // generous bound before giving up this restart
    for (let i = 0; i < wildMax; i += 1) {
      if (pointKey(wild) === trapKey) {
        const k = trapExponent - wildDist; // Q = k·G  ⇒  k = trapExponent − wildDist
        if (k >= lower && k <= upper && equals(mul(G, k), Q)) {
          return { k, operations, found: true, method: 'kangaroo', restarts: restart };
        }
        break; // false collision (modular wrap); restart
      }
      if (onProgress && operations % progressEvery === 0) onProgress(operations, width);
      const c = classOf(wild);
      wildDist += BigInt(jumpScalar[c]);
      wild = add(wild, jumpPoint[c]);
      operations += 1;
      if (wildDist > trapExponent) break; // walked past the trap; restart with new jumps
    }
  }
  return { k: null, operations, found: false, method: 'kangaroo', restarts: maxRestarts };
}

const SOLVERS = { 'brute-force': bruteForce, bsgs: babyStepGiantStep, kangaroo: pollardKangaroo };

/** Resolves a solver by name ('brute-force', 'bsgs', 'kangaroo'). */
function solverFor(method) {
  const solver = SOLVERS[method];
  if (!solver) throw new Error(`unknown method ${method}: use brute-force, bsgs or kangaroo`);
  return solver;
}

/**
 * Recovers the private key k from the public key Q (k known to lie in
 * [1, 2^bits]) with the chosen method, then decrypts the ciphertext.
 * @param {object} ciphertext a toy-ecc-encryption ciphertext object
 * @param {object|string} publicKey the matching public key Q
 * @param {number} bits the restricted key size
 * @param {'brute-force'|'bsgs'|'kangaroo'} [method='bsgs']
 * @returns {{ k: bigint|null, operations: number, found: boolean, message: any }}
 */
export function decryptWithoutKey(ciphertext, publicKey, bits, method = 'bsgs', options = {}) {
  const result = solverFor(method)(publicKey, bits, options);
  const message = result.found ? decrypt(ciphertext, result.k) : null;
  return { ...result, message };
}

/**
 * Recovers a deliberately restricted ephemeral r from R = rG (r in [1, 2^bits])
 * and decrypts without the receiver's private key, using S = rQ. This shows
 * that a short ephemeral breaks the scheme regardless of the size of k — a
 * weakness of the scheme design itself.
 * @param {object} ciphertext the toy-ecc ciphertext (its R is the ephemeral point)
 * @param {object|string} publicKey the receiver's public key Q
 * @param {number} ephemeralBits the restricted ephemeral size
 * @param {'brute-force'|'bsgs'|'kangaroo'} [method='bsgs']
 * @returns {{ ephemeral: bigint|null, operations: number, found: boolean, message: any }}
 */
export function recoverEphemeral(ciphertext, publicKey, ephemeralBits, method = 'bsgs', options = {}) {
  const Q = parsePoint(publicKey);
  const R = parsePoint(ciphertext.R);
  const result = solverFor(method)(R, ephemeralBits, options);
  let message = null;
  if (result.found) {
    const S = mul(Q, result.k); // S = rQ, the same shared secret the receiver holds
    message = decryptWithSharedPoint(ciphertext, S);
  }
  return { ephemeral: result.k, operations: result.operations, found: result.found, method: result.method, message };
}

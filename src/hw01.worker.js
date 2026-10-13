/**
 * Web Worker that draws a new sample of secp256k1 private keys off the main
 * thread, so that "Draw new sample" never freezes the page, and runs on it
 * the experiment of one figure, for scalar multiplication and for Keccak-256
 * of the same keys. The result has the shape of the matching part of
 * runStudy, so the page cuts it into series exactly as the build does.
 * Messages:
 *   in   { id, kind: 'coordHist' | 'bitFreq' | 'avalanche', seed, N }
 *   out  { id, result: { meta: { seed, sizes: { secpN }, origin: 'browser' }, E1 | E3 | E6 } } or { id, error }
 */

import { avalancheSecp, bitStudy, coordinateDistribution, secpSample } from './lib/kg-study.js';
import { P } from './lib/secp256k1.js';

const HASH_RANGE = 2n ** 256n;
const xs = (sample) => sample.points.map((Q) => Q.x);
const ys = (sample) => sample.points.map((Q) => Q.y);

const EXPERIMENTS = {
  // E1: 32 equal bins of x/p and y/p, and of H(k)/2^256 (as in runStudy).
  coordHist: (sample) => ({
    E1: {
      secp256k1: { x: coordinateDistribution(xs(sample), P, 32), y: coordinateDistribution(ys(sample), P, 32) },
      keccak: { digest: coordinateDistribution(sample.hashes, HASH_RANGE, 32) },
    },
  }),
  // E3: the 256 bit frequencies of x(Q) and of the digest.
  bitFreq: (sample) => ({
    E3: {
      secp256k1: { x: bitStudy(xs(sample), P, 256) },
      keccak: { digest: bitStudy(sample.hashes, HASH_RANGE, 256) },
    },
  }),
  // E6: one random bit of each key flipped, with the flip seed derived from the key seed.
  avalanche: (sample) => {
    const { ec, keccak, ...common } = avalancheSecp(sample);
    return { E6: { secp256k1: { avalanche: { ...common, ...ec } }, keccak: { avalanche: { ...common, ...keccak } } } };
  },
};

self.addEventListener('message', (event) => {
  const { id, kind, seed, N } = event.data;
  try {
    const run = EXPERIMENTS[kind];
    if (!run) throw new Error(`unknown experiment "${kind}"`);
    const sample = secpSample({ N, seed });
    self.postMessage({ id, result: { meta: { seed, sizes: { secpN: N }, origin: 'browser' }, ...run(sample) } });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
});

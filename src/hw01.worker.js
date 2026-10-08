/**
 * Web Worker that re-runs one experiment of the homework off the main thread
 * so that "Draw new sample" never freezes the page. Messages:
 *   in   { id, kind, variant, n, seed, trials }
 *   out  { id, result } or { id, error }
 */

import {
  avalanche,
  birthdayCollisions,
  bitFrequency,
  byteFrequency,
  hammingWeights,
  runsAndIndependence,
  sacMatrix,
} from './lib/ec-hash-study.js';

const EXPERIMENTS = {
  bitFrequency: ({ variant, n, seed }) => bitFrequency({ variant, n, seed }),
  byteFrequency: ({ variant, n, seed }) => byteFrequency({ variant, n, seed }),
  hammingWeight: ({ variant, n, seed }) => hammingWeights({ variant, n, seed }),
  avalanche: ({ variant, n, seed }) => avalanche({ variant, n, seed }),
  sac: ({ variant, trials, seed }) => sacMatrix({ variant, trials, seed }),
  runs: ({ variant, n, seed }) => runsAndIndependence({ variant, n, seed }),
  collisions: ({ variant, n, seed }) => birthdayCollisions({ variant, n, seed, subsets: 200 }),
};

self.addEventListener('message', (event) => {
  const { id, kind, ...options } = event.data;
  try {
    const run = EXPERIMENTS[kind];
    if (!run) throw new Error(`unknown experiment "${kind}"`);
    self.postMessage({ id, result: run(options) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
});

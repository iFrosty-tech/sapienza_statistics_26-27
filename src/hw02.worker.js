/**
 * Web Worker of homework 02: re-runs an experiment off the main thread so
 * that "Draw new sample" never freezes the page. Messages:
 *   in   { id, kind: 'stages', seed, n }
 *   out  { id, progress: [done, total] } (repeatedly), then { id, result } or { id, error }
 */

import { pipelineSample } from './lib/wallet-study.js';

const EXPERIMENTS = {
  stages: ({ seed, n }, report) => {
    const r = pipelineSample({ seed, n, onProgress: report });
    return { seed: r.seed, n: r.n, stages: r.stages, addressBits: r.addressBits };
  },
};

self.addEventListener('message', (event) => {
  const { id, kind, ...options } = event.data;
  try {
    const run = EXPERIMENTS[kind];
    if (!run) throw new Error(`unknown experiment "${kind}"`);
    let last = 0;
    const report = (done, total) => {
      if (done === total || done - last >= 10) {
        last = done;
        self.postMessage({ id, progress: [done, total] });
      }
    };
    self.postMessage({ id, result: run(options, report) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
});

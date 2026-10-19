/**
 * Web Worker of homework 03: runs one attack on the restricted key space off
 * the main thread, so that the page stays responsive during a long search and
 * the reader can cancel it (the page terminates the worker). Messages:
 *   in   { id, job: { kind: 'key' | 'ephemeral', method, bits, publicKey, ciphertext } }
 *   out  { id, progress: { operations, fraction, elapsedMs } } (at most every 80 ms),
 *        then { id, result } or { id, error }
 * The job is described in src/hw03/attack-job.js.
 */

import { runJob } from './hw03/attack-job.js';

self.addEventListener('message', (event) => {
  const { id, job } = event.data;
  try {
    const result = runJob(job, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
});

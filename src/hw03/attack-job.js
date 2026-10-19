/**
 * One job of the key-recovery panel of homework 03 (§6), run by the worker
 * src/hw03.worker.js and, unchanged, by the tests. A job names the target
 * ('key': the private key k from the public key Q; 'ephemeral': a restricted
 * ephemeral scalar r from the point R of the ciphertext), the solver and the
 * size of the restricted range, and carries the public key and the ciphertext
 * to decrypt once the scalar is found. Progress is reported at most every
 * `every` milliseconds, as operations, the share of the key space excluded and
 * the elapsed time.
 */

import { decryptWithoutKey, recoverEphemeral } from '../lib/restricted-key-attack.js';
import { KEY_RECOVERY_BITS, progressView } from './demo-model.js';

export const JOB_KINDS = Object.freeze(['key', 'ephemeral']);
export const JOB_METHODS = Object.freeze(['brute-force', 'bsgs', 'kangaroo']);

/** Checks a job before it is run; { ok: true } or { ok: false, message }. */
export function validateJob(job) {
  if (!job || !JOB_KINDS.includes(job.kind)) return { ok: false, message: 'unknown target: use "key" or "ephemeral"' };
  if (!JOB_METHODS.includes(job.method)) return { ok: false, message: `unknown method ${job.method}` };
  const { min, max } = KEY_RECOVERY_BITS;
  if (!Number.isInteger(job.bits) || job.bits < min || job.bits > max) {
    return { ok: false, message: `the key size must be a whole number of bits from ${min} to ${max}` };
  }
  if (typeof job.publicKey !== 'string' || !/^0[23][0-9a-f]{64}$/i.test(job.publicKey)) {
    return { ok: false, message: 'the public key must be a compressed secp256k1 point in hexadecimal' };
  }
  const c = job.ciphertext;
  if (!c || typeof c.R !== 'string' || typeof c.c !== 'string' || typeof c.tag !== 'string') {
    return { ok: false, message: 'the ciphertext must carry R, c and tag' };
  }
  return { ok: true };
}

/** How often each solver calls back, in its own steps. */
function progressEvery(method, bits) {
  if (method === 'bsgs') return Math.max(1, Math.floor(Math.ceil(Math.sqrt(2 ** bits)) / 64));
  return method === 'kangaroo' ? 1024 : 4096;
}

/**
 * Runs a job and returns { found, k, operations, message, elapsedMs, method,
 * kind, bits }, with k as a decimal string (null when not found).
 * @param {object} job see validateJob
 * @param {(p: { operations: number, fraction: number|null, elapsedMs: number }) => void} report
 * @param {{ now?: () => number, every?: number }} [options]
 */
export function runJob(job, report, { now = () => performance.now(), every = 80 } = {}) {
  const check = validateJob(job);
  if (!check.ok) throw new Error(check.message);
  const { kind, method, bits, publicKey, ciphertext } = job;
  const start = now();
  let last = -Infinity;
  const onProgress = (done, total) => {
    const t = now();
    if (t - last < every) return;
    last = t;
    report({ ...progressView(method, bits, done, total), elapsedMs: t - start });
  };
  const options = { onProgress, progressEvery: progressEvery(method, bits) };
  const r =
    kind === 'key'
      ? decryptWithoutKey(ciphertext, publicKey, bits, method, options)
      : recoverEphemeral(ciphertext, publicKey, bits, method, options);
  const scalar = kind === 'key' ? r.k : r.ephemeral;
  return {
    found: r.found,
    k: r.found ? scalar.toString() : null,
    operations: r.operations,
    message: r.found ? r.message : null,
    elapsedMs: now() - start,
    method,
    kind,
    bits,
  };
}

/**
 * Seeded pseudo-random source for the experiments. It wraps the Mulberry32
 * generator already used by the probability plots (src/lib/normal.js) so that
 * every figure on the site is reproducible from the seed it reports.
 *
 * This is a statistical generator, not a cryptographic one: it supplies the
 * random messages fed to the hash functions, never key material.
 */

import { createRng } from './normal.js';

/**
 * @param {number} seed unsigned 32-bit integer
 * @returns {{ seed: number, uniform: () => number, uint32: () => number, int: (maxExclusive: number) => number, bytes: (n: number) => Uint8Array }}
 */
export function createRandom(seed) {
  const next = createRng(seed);
  const uniform = () => next();
  // Mulberry32 divides an exact 32-bit integer by 2^32, so the integer is recovered exactly.
  const uint32 = () => Math.floor(next() * 4294967296);
  const int = (maxExclusive) => Math.floor(next() * maxExclusive);
  const bytes = (n) => {
    const out = new Uint8Array(n);
    let i = 0;
    while (i < n) {
      let word = uint32();
      for (let k = 0; k < 4 && i < n; k += 1) {
        out[i] = word & 0xff;
        word >>>= 8;
        i += 1;
      }
    }
    return out;
  };
  return { seed: seed >>> 0, uniform, uint32, int, bytes };
}

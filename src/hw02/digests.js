/**
 * Figure 15, the digest comparator. The digests of the typed text under
 * SHA-256, SHA-512, Keccak-256 and SHA3-256 are recomputed on every input;
 * the hex digits that changed since the previous input are underlined in
 * plot red (the underline fades over 600 ms) and each digest prints the
 * number of its bits that changed next to the half of its length expected of
 * a good hash function: a live reading of the avalanche effect. Keccak-256
 * and SHA3-256 of the same input are compared bit by bit.
 */

import { sha256Hex } from '../lib/sha256.js';
import { sha512Hex } from '../lib/sha512.js';
import { keccak256Hex, sha3_256Hex } from '../lib/keccak.js';
import { utf8Bytes } from '../lib/bytes.js';
import { bitDistance, digitDiff, hexToBitString } from './bits.js';
import { announce, deferMount } from './motion.js';

const FUNCTIONS = Object.freeze({ sha256: sha256Hex, sha512: sha512Hex, keccak256: keccak256Hex, sha3_256: sha3_256Hex });

function markDigits(hexValue, changed) {
  if (!changed.length) return hexValue;
  const set = new Set(changed);
  let html = '';
  for (let i = 0; i < hexValue.length; i += 1) html += set.has(i) ? `<span class="is-changed">${hexValue[i]}</span>` : hexValue[i];
  return html;
}

/** Mounted when the figure comes near the viewport (see deferMount). */
export const mountDigests = deferMount(mountDigestsNow);

function mountDigestsNow(figure) {
  const controls = figure.querySelector('[data-digests-controls]');
  const input = figure.querySelector('[data-digests-input]');
  if (!controls || !input) throw new Error('Digest comparator: missing its controls.');
  const status = figure.querySelector('[data-digests-status]');
  const twinsCount = figure.querySelector('[data-digests-twins-count]');
  const rows = Object.keys(FUNCTIONS)
    .map((key) => {
      const code = figure.querySelector(`[data-digest="${key}"]`);
      if (!code) return null;
      const dt = code.closest('.digests__row')?.querySelector('dt');
      const bits = code.textContent.trim().length * 4;
      const delta = document.createElement('span');
      delta.className = 'digests__delta';
      delta.innerHTML = `<span class="tabular" data-delta-count>—</span> of ${bits} bits changed (expected ${bits / 2})`;
      dt?.append(delta);
      const name = dt?.querySelector('.digests__name')?.textContent ?? key;
      return { key, name, code, bits, delta: delta.querySelector('[data-delta-count]'), previous: code.textContent.trim() };
    })
    .filter(Boolean);

  let frame = 0;
  let speakTimer = 0;
  function update() {
    frame = 0;
    const bytes = utf8Bytes(input.value);
    const values = {};
    const changes = [];
    for (const row of rows) {
      const next = FUNCTIONS[row.key](bytes);
      values[row.key] = next;
      const diff = digitDiff(row.previous, next);
      row.code.innerHTML = markDigits(next, diff.digits);
      row.delta.textContent = diff.bits === null ? '—' : String(diff.bits);
      changes.push(`${row.name} ${diff.bits} of ${row.bits}`);
      row.previous = next;
    }
    let twins = null;
    if (values.keccak256 && values.sha3_256) {
      twins = bitDistance(hexToBitString(values.keccak256), hexToBitString(values.sha3_256));
      if (twinsCount) twinsCount.textContent = String(twins);
    }
    clearTimeout(speakTimer);
    speakTimer = setTimeout(
      () => announce(status, `Bits changed by the last edit: ${changes.join('; ')}. Keccak-256 and SHA3-256 differ in ${twins} of 256 bits.`),
      800,
    );
  }

  input.addEventListener('input', () => {
    if (!frame) frame = requestAnimationFrame(update);
  });
  controls.hidden = false;
  figure.classList.add('is-live');
  return { update };
}

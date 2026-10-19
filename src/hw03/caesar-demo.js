/**
 * Panel 2 (§3): the Caesar cipher, live. The reader types a message and turns
 * the key; the panel prints the ciphertext and its decryption, and draws the
 * cipher as a slide rule: the cipher alphabet slides under the plain one, and
 * the letter counts of the ciphertext are the counts of the message carried
 * round the alphabet by the same shift, bar for bar. The index of coincidence
 * of both texts is printed beside them: it does not move.
 *
 * Under reduced motion the strips jump to their new position and the panel
 * acknowledges the change with a short opacity blink.
 */

import { ALPHABET, decrypt, encrypt } from '../lib/caesar.js';
import {
  alphabetStripOffset,
  cipherStripOffset,
  indexOfCoincidence,
  nearestCongruent,
  parseCaesarKey,
  shiftedCounts,
} from './demo-model.js';
import { DURATION, EASE_OUT, announce, attachPanel, blink, esc, panelFrame, reducedMotion } from './motion.js';

const COPIES = 4; // the sliding strips repeat the alphabet four times, so that every slide stays inside them
const CELLS = 26 * COPIES;
const fixed = (v) => (v === null ? '—' : v.toFixed(4));

/** A row of 26 cells, or of the 104 cells of a sliding strip. */
const letterCells = (count) =>
  Array.from({ length: count }, (_, i) => `<span class="caesar-cell" data-letter="${ALPHABET[i % 26]}">${ALPHABET[i % 26]}</span>`).join('');
const barCells = (count) =>
  Array.from({ length: count }, (_, i) => `<span class="caesar-bar" data-index="${i % 26}"><span class="caesar-bar__fill"></span></span>`).join('');

function body(message, key) {
  return (
    `<div class="demo-panel__controls">` +
    `<label class="text-field text-field--area">` +
    `<span class="caption">Message m</span>` +
    `<textarea data-caesar-message rows="2" maxlength="400" autocomplete="off" spellcheck="false">${esc(message)}</textarea>` +
    `</label>` +
    `<div class="caesar-key">` +
    `<label class="text-field caesar-key__number"><span class="caption">Key k, 0 to 25</span>` +
    `<input type="number" data-caesar-key min="0" max="25" step="1" value="${key}" inputmode="numeric" aria-describedby="caesar-key-note" /></label>` +
    `<label class="caesar-key__range"><span class="caption caption--math">Shift</span>` +
    `<input type="range" data-caesar-range min="0" max="25" step="1" value="${key}" aria-label="Key k, 0 to 25" /></label>` +
    `</div>` +
    `<p class="text-field__note" id="caesar-key-note" data-caesar-note></p>` +
    `</div>` +
    `<div class="caesar-rule" aria-hidden="true">` +
    `<p class="caption caesar-rule__label">Plain alphabet</p>` +
    `<div class="caesar-track caesar-track--letters">${letterCells(26)}</div>` +
    `<div class="caesar-track caesar-track--letters caesar-track--slide"><div class="caesar-strip" data-caesar-alpha>${letterCells(CELLS)}</div></div>` +
    `<p class="caption caesar-rule__label caesar-rule__label--below">Cipher alphabet, shifted by <span data-caesar-shift>${key}</span></p>` +
    `</div>` +
    `<div class="caesar-freq">` +
    `<p class="caption">Letter counts of the message</p>` +
    `<div class="caesar-track caesar-track--bars" data-caesar-plain-bars>${barCells(26)}</div>` +
    `<div class="caesar-track caesar-track--axis" aria-hidden="true">${letterCells(26)}</div>` +
    `<p class="caption">Letter counts of the ciphertext</p>` +
    `<div class="caesar-track caesar-track--bars caesar-track--slide"><div class="caesar-strip" data-caesar-cipher-bars>${barCells(CELLS)}</div></div>` +
    `<div class="caesar-track caesar-track--axis" aria-hidden="true">${letterCells(26)}</div>` +
    `<p class="visually-hidden" data-caesar-counts></p>` +
    `</div>` +
    `<div class="demo__grid">` +
    `<div class="demo__cell demo__cell--wide"><span class="caption">Ciphertext E<sub>k</sub>(m)</span><span class="demo__value demo__value--mono" data-caesar-out="cipher"></span></div>` +
    `<div class="demo__cell demo__cell--wide"><span class="caption">Decryption D<sub>k</sub>(E<sub>k</sub>(m))</span><span class="demo__value demo__value--mono" data-caesar-out="plain"></span><span class="demo__note" data-caesar-out="check"></span></div>` +
    `</div>` +
    `<dl class="pplot__stats pplot__stats--math">` +
    `<div><dt>Letters</dt><dd data-caesar-out="letters"></dd></div>` +
    `<div><dt>Key k</dt><dd data-caesar-out="key"></dd></div>` +
    `<div><dt>IC, message</dt><dd data-caesar-out="icPlain"></dd></div>` +
    `<div><dt>IC, ciphertext</dt><dd data-caesar-out="icCipher"></dd></div>` +
    `</dl>`
  );
}

/** Moves a sliding strip to the window that starts, modulo 26, at `target`. */
function slide(strip, state, target, animate) {
  const x = (v) => `translateX(${(-(v + 26) * 100) / CELLS}%)`;
  const from = state.pos;
  const to = nearestCongruent(from, target);
  state.animation?.cancel();
  state.pos = ((to % 26) + 26) % 26;
  strip.style.transform = x(state.pos);
  if (animate && from !== to) {
    state.animation = strip.animate([{ transform: x(from) }, { transform: x(to) }], {
      duration: DURATION.slide,
      easing: EASE_OUT,
    });
  }
}

export function mountCaesarDemo(mount) {
  const message = mount.dataset.message || 'MEET ME AT THE OLD BRIDGE AT TEN';
  const initialKey = parseCaesarKey(mount.dataset.key ?? '3').key ?? 3;
  const { panel, $ } = panelFrame({
    id: 'demo-caesar',
    number: 2,
    title: 'The Caesar cipher as a slide rule',
    lede:
      'Turn the key to slide the cipher alphabet under the plain one. The counts of the ciphertext letters are the counts of the message moved round the alphabet by the same shift, so the index of coincidence never changes.',
    body: body(message, initialKey),
    provenance: 'Computed in this page from the text above; nothing is sent or stored.',
  });

  const text = $('[data-caesar-message]');
  const keyInput = $('[data-caesar-key]');
  const range = $('[data-caesar-range]');
  const note = $('[data-caesar-note]');
  const alpha = $('[data-caesar-alpha]');
  const cipherBars = $('[data-caesar-cipher-bars]');
  const plainBars = $('[data-caesar-plain-bars]');
  const countsText = $('[data-caesar-counts]');
  const status = $('[data-status]');
  const out = (name) => $(`[data-caesar-out="${name}"]`);
  const alphaState = { pos: 0, animation: null };
  const barsState = { pos: 0, animation: null };
  let key = initialKey;
  let frame = 0;
  let announceTimer = 0;

  function drawBars(counts, max) {
    const scale = (c) => (max > 0 ? c / max : 0);
    plainBars.querySelectorAll('.caesar-bar').forEach((bar, i) => {
      bar.style.setProperty('--share', scale(counts[i]).toFixed(4));
      bar.classList.toggle('is-empty', counts[i] === 0);
    });
    cipherBars.querySelectorAll('.caesar-bar').forEach((bar, i) => {
      const c = counts[i % 26];
      bar.style.setProperty('--share', scale(c).toFixed(4));
      bar.classList.toggle('is-empty', c === 0);
    });
  }

  function markLetters(plain, cipher) {
    panel.querySelectorAll('.caesar-track--letters:not(.caesar-track--slide) .caesar-cell').forEach((cell, i) => {
      cell.classList.toggle('is-used', plain[i] > 0);
    });
    alpha.querySelectorAll('.caesar-cell').forEach((cell, i) => {
      cell.classList.toggle('is-used', cipher[i % 26] > 0);
    });
  }

  function render({ animate = false, acknowledge = false } = {}) {
    frame = 0;
    const m = text.value;
    const c = encrypt(m, key);
    const d = decrypt(c, key);
    const { plain, cipher, letters, max } = shiftedCounts(m, key);
    out('cipher').textContent = c || '—';
    out('plain').textContent = d || '—';
    out('check').textContent = m ? (d === m ? 'Identical to the message: decryption undoes the shift.' : 'Differs from the message.') : '';
    out('letters').textContent = String(letters);
    out('key').textContent = String(key);
    out('icPlain').textContent = fixed(indexOfCoincidence(plain));
    out('icCipher').textContent = fixed(indexOfCoincidence(cipher));
    $('[data-caesar-shift]').textContent = String(key);
    drawBars(plain, max);
    markLetters(plain, cipher);
    const moving = animate && !reducedMotion();
    slide(alpha, alphaState, alphabetStripOffset(key), moving);
    slide(cipherBars, barsState, cipherStripOffset(key), moving);
    if (acknowledge && reducedMotion()) blink(panel.querySelector('.caesar-freq'));
    const used = plain.map((n, i) => (n > 0 ? `${ALPHABET[i]} ${n} → ${ALPHABET[(i + key) % 26]}` : null)).filter(Boolean);
    countsText.textContent = used.length ? `Letter counts, plaintext to ciphertext: ${used.join(', ')}.` : 'The message has no letters.';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(status, `Key ${key}. Ciphertext: ${c.slice(0, 80) || 'empty'}.`), 600);
  }

  function setKey(raw, source) {
    const parsed = parseCaesarKey(raw);
    if (!parsed.ok) {
      keyInput.setAttribute('aria-invalid', 'true');
      note.textContent = parsed.message;
      note.dataset.kind = 'error';
      return;
    }
    keyInput.setAttribute('aria-invalid', 'false');
    note.textContent = '';
    note.dataset.kind = 'none';
    const changed = parsed.key !== key;
    key = parsed.key;
    if (source !== 'number') keyInput.value = String(key);
    if (source !== 'range') range.value = String(key);
    if (changed) render({ animate: true, acknowledge: true });
  }

  keyInput.addEventListener('input', () => setKey(keyInput.value, 'number'));
  range.addEventListener('input', () => setKey(range.value, 'range'));
  text.addEventListener('input', () => {
    if (!frame) frame = requestAnimationFrame(() => render());
  });

  render();
  attachPanel(mount, panel);
}

/**
 * Figure 6, EIP-55. "Apply the checksum" starts from the lower-case address
 * and, digit by digit, prints the nibble of Keccak-256(lower-case address)
 * beneath it; a letter whose nibble is 8 or more turns to upper case with a
 * short vertical flip. The whole sequence lasts under two seconds. A text
 * field checks any pasted address and marks the first character whose case
 * differs from EIP-55.
 */

import { checksumBreakdown } from '../lib/ethereum.js';
import { renderEip55Breakdown } from './render.js';
import { EASE_OUT, animationGroup, announce, blink, followAccount, inViewport, onFirstView, reducedMotion } from './motion.js';
import { checkChecksumAddress } from './wallet.js';

const PER_DIGIT_MS = 44;
const NIBBLE_MS = 120;
const FLIP_MS = 150;

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mountEip55(figure) {
  const canvas = figure.querySelector('[data-eip55-canvas]');
  if (!canvas?.querySelector('.eip55__chars')) throw new Error('EIP-55 figure: missing the characters.');
  const status = figure.querySelector('[data-eip55-status]');
  const group = animationGroup();
  let hasRun = false;

  const count = () => {
    const cells = [...canvas.querySelectorAll('[data-eip55-index]')];
    return { letters: cells.filter((c) => c.dataset.case !== 'digit').length, upper: cells.filter((c) => c.dataset.case === 'upper').length };
  };

  function settle() {
    for (const cell of canvas.querySelectorAll('[data-eip55-index]')) {
      const glyph = cell.querySelector('.eip55__glyph');
      if (glyph.dataset.final) glyph.textContent = glyph.dataset.final;
    }
  }

  function play() {
    group.reset();
    settle();
    hasRun = true;
    figure.classList.remove('is-primed');
    const { letters, upper } = count();
    const text = `${letters} of the 40 hex digits are letters; ${upper} of them have a hash nibble of 8 or more and are printed in upper case.`;
    if (reducedMotion()) {
      blink(canvas.querySelector('.eip55__chars'));
      announce(status, text);
      return;
    }
    const token = group.current();
    for (const cell of canvas.querySelectorAll('[data-eip55-index]')) {
      const k = Number(cell.dataset.eip55Index);
      const t = k * PER_DIGIT_MS;
      const glyph = cell.querySelector('.eip55__glyph');
      const nibble = cell.querySelector('.eip55__nibble');
      const mark = cell.querySelector('.eip55__mark');
      group.add(nibble?.animate([{ opacity: 0, transform: 'translateY(-0.25rem)' }, { opacity: 1, transform: 'none' }], { delay: t, duration: NIBBLE_MS, easing: EASE_OUT, fill: 'backwards' }));
      group.add(mark?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + NIBBLE_MS, duration: 120, fill: 'backwards' }));
      if (cell.dataset.case !== 'upper') continue;
      // The glyph waits in lower case, turns edge-on, changes case and turns back.
      glyph.dataset.final = glyph.textContent;
      glyph.textContent = glyph.textContent.toLowerCase();
      const half = FLIP_MS / 2;
      const out = group.add(glyph.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], { delay: t + NIBBLE_MS, duration: half, easing: 'ease-in' }));
      out.finished.then(
        () => {
          if (group.current() !== token) return;
          glyph.textContent = glyph.dataset.final;
          group.add(glyph.animate([{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0deg)' }], { duration: half, easing: EASE_OUT }));
        },
        () => {},
      );
    }
    announce(status, text);
  }

  figure.querySelector('[data-eip55-play]')?.addEventListener('click', play);

  followAccount(figure, (account) => {
    group.reset();
    settle();
    const old = canvas.querySelector('.eip55');
    const holder = document.createElement('div');
    holder.innerHTML = renderEip55Breakdown(checksumBreakdown(account.address));
    old.replaceWith(holder.firstElementChild);
    blink(canvas.querySelector('.eip55__chars'));
    const { letters, upper } = count();
    announce(status, `Showing the address of Figure 2: ${letters} letters, ${upper} in upper case.`);
  });

  /* ---------------------------------------------------------- checker */

  const input = figure.querySelector('[data-eip55-input]');
  const result = figure.querySelector('[data-eip55-result]');
  const echo = figure.querySelector('[data-eip55-echo]');
  let frame = 0;
  function check() {
    frame = 0;
    const r = checkChecksumAddress(input.value);
    result.dataset.status = r.status;
    input.setAttribute('aria-invalid', String(r.status === 'invalid' || r.status === 'malformed'));
    let message = '';
    let shown = '';
    switch (r.status) {
      case 'empty':
        message = 'Paste an address to check its letter case against EIP-55.';
        break;
      case 'malformed':
        message = `Error: ${r.message}`;
        break;
      case 'unchecked':
        message = 'Every letter is in the same case, so the address carries no EIP-55 checksum: a mistyped digit in it cannot be detected.';
        shown = escapeHtml(r.digits);
        break;
      case 'valid':
        message = 'Valid: every letter has the case that Keccak-256 of the lower-case address prescribes.';
        shown = escapeHtml(r.digits);
        break;
      case 'invalid': {
        const bad = r.digits[r.offending];
        const want = r.expected[2 + r.offending];
        message = `Error: invalid checksum. The first offending character is number ${r.offending + 1}, "${bad}", which EIP-55 writes as "${want}". The checksummed form is ${r.expected}.`;
        shown =
          escapeHtml(r.digits.slice(0, r.offending)) +
          `<mark class="eip55__offending">${escapeHtml(bad)}</mark>` +
          escapeHtml(r.digits.slice(r.offending + 1));
        break;
      }
      default:
        break;
    }
    result.textContent = message;
    echo.innerHTML = shown ? `0x${shown}` : '';
  }
  input?.addEventListener('input', () => {
    if (!frame) frame = requestAnimationFrame(check);
  });
  if (input && result && echo) check();

  for (const controls of figure.querySelectorAll('[data-eip55-controls]')) controls.hidden = false;
  figure.classList.add('is-live');
  if (!reducedMotion() && 'IntersectionObserver' in globalThis && !inViewport(canvas)) figure.classList.add('is-primed');
  onFirstView(canvas, () => {
    if (!hasRun) play();
  });
  return { play };
}

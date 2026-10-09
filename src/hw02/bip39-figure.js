/**
 * Figure 3, BIP-39 bit grouping. On first view and on "Replay": the entropy
 * bits print in reading order, the checksum bits (the first CS bits of
 * SHA-256 of the entropy) append in their outlined cells, then an 11-bit
 * bracket draws under each group and the word it indexes drops beneath it.
 * Pointing at or focusing a word highlights its 11 bits and its bracket.
 * The words are one tab stop (roving tabindex): the arrow keys, Home and End
 * move the focus, and the highlight, from word to word.
 */

import { renderBip39Grouping } from './render.js';
import { EASE_OUT, animationGroup, announce, blink, drawStroke, followAccount, inViewport, onFirstView, reducedMotion } from './motion.js';

export function mountBip39(figure) {
  const canvas = figure.querySelector('[data-bip39-canvas]');
  if (!canvas?.querySelector('.bip39__words')) throw new Error('BIP-39 figure: missing the word list.');
  const status = figure.querySelector('[data-bip39-status]');
  const replay = figure.querySelector('[data-bip39-replay]');
  const group = animationGroup();
  let hasRun = false;

  let current = 0;

  function bindWords() {
    const words = [...canvas.querySelectorAll('[data-bip39-word]')];
    current = Math.min(current, words.length - 1);
    words.forEach((word, i) => {
      word.tabIndex = i === current ? 0 : -1;
      word.addEventListener('keydown', (event) => {
        const last = words.length - 1;
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last }[event.key];
        if (to === undefined) return;
        event.preventDefault();
        const j = Math.max(0, Math.min(last, to));
        words[i].tabIndex = -1;
        words[j].tabIndex = 0;
        current = j;
        words[j].focus();
      });
      const on = () => word.classList.add('is-active');
      const off = () => word.classList.remove('is-active');
      word.addEventListener('pointerenter', on);
      word.addEventListener('pointerleave', off);
      word.addEventListener('focus', on);
      word.addEventListener('blur', off);
    });
  }

  const describe = () => {
    const words = canvas.querySelectorAll('[data-bip39-word]').length;
    const cs = canvas.querySelectorAll('.bip39__bit.is-cs').length;
    return `${words * 11 - cs} entropy bits and ${cs} checksum bits read as ${words} indices of 11 bits.`;
  };

  function play() {
    group.reset();
    hasRun = true;
    figure.classList.remove('is-primed');
    if (reducedMotion()) {
      blink(canvas.querySelector('.bip39__words'));
      announce(status, describe());
      return;
    }
    const entropy = [...canvas.querySelectorAll('.bip39__bit:not(.is-cs)')];
    const checksum = [...canvas.querySelectorAll('.bip39__bit.is-cs')];
    const words = [...canvas.querySelectorAll('[data-bip39-word]')];
    const perBit = Math.min(4, 520 / entropy.length);
    entropy.forEach((cell, i) => {
      group.add(cell.animate([{ opacity: 0, transform: 'translateY(-0.25rem)' }, { opacity: 1, transform: 'none' }], { delay: i * perBit, duration: 200, easing: EASE_OUT, fill: 'backwards' }));
    });
    const csStart = entropy.length * perBit + 160;
    checksum.forEach((cell, i) => {
      group.add(cell.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { delay: csStart + i * 70, duration: 220, easing: EASE_OUT, fill: 'backwards' }));
    });
    const bracketStart = csStart + checksum.length * 70 + 220;
    const perWord = Math.min(70, 840 / words.length);
    words.forEach((word, i) => {
      const t = bracketStart + i * perWord;
      group.add(drawStroke(word.querySelector('.bip39__bracket path'), { delay: t, duration: 220 }));
      group.add(
        word.querySelector('.bip39__label')?.animate([{ opacity: 0, transform: 'translateY(-0.375rem)' }, { opacity: 1, transform: 'none' }], {
          delay: t + 160,
          duration: 220,
          easing: EASE_OUT,
          fill: 'backwards',
        }),
      );
    });
    announce(status, describe());
  }

  replay?.addEventListener('click', play);

  followAccount(figure, (account) => {
    group.reset();
    canvas.innerHTML = renderBip39Grouping(account);
    bindWords();
    blink(canvas.querySelector('.bip39__words'));
    announce(status, `Showing the phrase of Figure 2: ${describe()}`);
  });

  bindWords();
  for (const controls of figure.querySelectorAll('[data-bip39-controls]')) controls.hidden = false;
  figure.classList.add('is-live');
  if (!reducedMotion() && 'IntersectionObserver' in globalThis && !inViewport(canvas)) figure.classList.add('is-primed');
  onFirstView(canvas, () => {
    if (!hasRun) play();
  });
  return { play };
}

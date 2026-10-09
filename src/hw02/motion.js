/**
 * Shared behaviour of the interactive figures of homework 02: the motion
 * vocabulary of the site (one easing, 120 ms feedback, 200 ms state, the
 * 160 ms acknowledgement blink under reduced motion), first-view triggers,
 * visibility tracking for loops, interruptible animation groups, and the
 * account shown by Figures 1, 3 and 6 (the worked example or the reader's
 * phrase from the explorer).
 */

import { deriveLenient } from './wallet.js';

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const DURATION = Object.freeze({ feedback: 120, state: 200, blink: 160 });

/** Dispatched on document by the explorer, and by the reset of a figure, with detail { account, source }. */
export const ACCOUNT_EVENT = 'hw02:account';

export function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** The acknowledgement of a change when travel is not wanted: a 160 ms opacity blink. */
export function blink(element) {
  element?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: DURATION.blink, easing: 'linear' });
}

/** Writes a polite announcement; the same text twice is re-announced. */
export function announce(status, text) {
  if (!status) return;
  status.textContent = '';
  requestAnimationFrame(() => {
    status.textContent = text;
  });
}

/**
 * Calls `callback` once, the first time `element` is at least `threshold`
 * visible, or (for an element taller than the screen) fills that share of
 * the viewport height.
 */
export function onFirstView(element, callback, threshold = 0.4) {
  if (!('IntersectionObserver' in globalThis)) {
    callback();
    return () => {};
  }
  const steps = Array.from({ length: 21 }, (_, i) => i / 20);
  const io = new IntersectionObserver(
    (entries) => {
      const seen = entries.some((e) => {
        if (!e.isIntersecting) return false;
        const viewport = e.rootBounds?.height || globalThis.innerHeight || 1;
        return e.intersectionRatio >= threshold - 0.001 || e.intersectionRect.height >= threshold * viewport;
      });
      if (seen) {
        io.disconnect();
        callback();
      }
    },
    { threshold: steps },
  );
  io.observe(element);
  return () => io.disconnect();
}

/**
 * Calls `callback` once, the first time `element` comes within `margin` of
 * the viewport (at once without IntersectionObserver). Defers the mounting of
 * figures far below the fold, early enough that they are live before they
 * are seen.
 */
export function whenNear(element, callback, margin = '100% 0px') {
  if (!('IntersectionObserver' in globalThis)) {
    callback();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        callback();
      }
    },
    { rootMargin: margin },
  );
  io.observe(element);
}

/**
 * Wraps a figure's mount function so that it runs when the figure comes near
 * the viewport; a failure is logged and leaves the printed figure in place,
 * as for the figures mounted at once. Figures that follow the explorer's
 * account (1, 3, 6) are not deferred, so that they never miss its event.
 */
export function deferMount(mount) {
  return (figure) => {
    whenNear(figure, () => {
      try {
        mount(figure);
      } catch (error) {
        console.error(error);
      }
    });
  };
}

/** Whether an element is at least partly inside the viewport now. */
export function inViewport(element) {
  const r = element.getBoundingClientRect();
  return r.bottom > 0 && r.top < (globalThis.innerHeight || document.documentElement.clientHeight);
}

/**
 * Tracks whether an element is on screen and the tab visible; calls
 * onChange(visible) on every change. Loops run only while visible.
 */
export function trackVisibility(element, onChange) {
  let onScreen = false;
  const update = () => onChange(onScreen && document.visibilityState === 'visible');
  if ('IntersectionObserver' in globalThis) {
    new IntersectionObserver((entries) => {
      onScreen = entries.at(-1).isIntersecting;
      update();
    }).observe(element);
  } else {
    onScreen = true;
  }
  document.addEventListener('visibilitychange', update);
  update();
  return () => onScreen && document.visibilityState === 'visible';
}

/** A group of Web Animations that can be cancelled together, so a replay restarts cleanly. */
export function animationGroup() {
  let animations = [];
  let token = 0;
  return {
    add(animation) {
      if (animation) animations.push(animation);
      return animation;
    },
    /** Cancels every running animation; returns a token that later callbacks compare with current(). */
    reset() {
      for (const a of animations) a.cancel();
      animations = [];
      token += 1;
      return token;
    },
    current: () => token,
    finished: () => Promise.allSettled(animations.map((a) => a.finished)),
  };
}

/** The stroke length of an SVG shape, for drawing it with stroke-dashoffset. */
export function strokeLength(shape) {
  try {
    return shape.getTotalLength();
  } catch {
    return 0;
  }
}

/**
 * Draws an SVG stroke from its start to its end.
 * @returns {Animation | null}
 */
export function drawStroke(shape, { delay = 0, duration = 240 } = {}) {
  const length = strokeLength(shape);
  if (!length) return null;
  shape.style.strokeDasharray = `${length} ${length}`;
  const animation = shape.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { delay, duration, easing: EASE_OUT, fill: 'backwards' });
  const clear = () => {
    shape.style.strokeDasharray = '';
  };
  animation.addEventListener('finish', clear);
  animation.addEventListener('cancel', clear);
  return animation;
}

/* ------------------------------------------------------------ account */

let example = null;

/** The worked example of the page (the published Hardhat mnemonic), derived once on demand. */
export function exampleAccount() {
  if (example) return example;
  const textarea = document.querySelector('[data-explorer-mnemonic]');
  const mnemonic = textarea?.defaultValue || document.querySelector('[data-pipeline-value="mnemonic"]')?.textContent || '';
  example = deriveLenient(mnemonic);
  return example;
}

/**
 * Binds the "Showing: …" label and the reset button of a figure
 * ([data-source-label], [data-source-reset]) and calls render(account, source)
 * whenever the explorer or a reset changes the account.
 */
export function followAccount(figure, render) {
  const label = figure.querySelector('[data-source-label]');
  const reset = figure.querySelector('[data-source-reset]');
  const show = (source) => {
    if (label) label.textContent = source === 'reader' ? 'Showing: your phrase' : 'Showing: worked example';
    if (reset) reset.hidden = source !== 'reader';
  };
  let source = 'example';
  document.addEventListener(ACCOUNT_EVENT, (event) => {
    const { account, source: next } = event.detail ?? {};
    if (!account) return;
    if (next === 'example' && source === 'example') return;
    source = next;
    try {
      render(account, next);
    } catch (error) {
      console.error(error);
    }
    show(next);
  });
  reset?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: { account: exampleAccount(), source: 'example' } }));
    figure.querySelector('[data-source-anchor]')?.focus();
  });
  show(source);
}

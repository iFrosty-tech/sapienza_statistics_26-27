/**
 * Shared behaviour of the interactive panels of homework 03: the motion
 * vocabulary of the site (one easing, 120 ms feedback, 200 ms state, the
 * 160 ms acknowledgement blink that replaces travel under reduced motion),
 * polite announcements, and the frame of a panel.
 */

export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const DURATION = Object.freeze({ feedback: 120, state: 200, blink: 160, slide: 320, settle: 420 });

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

/** Escapes text for insertion into HTML. */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The frame of a panel: a numbered title with its provenance tag, a serif
 * lede, the body, a printed provenance line and a polite live region. Returns
 * the panel element (not yet attached) and a query helper scoped to it.
 */
export function panelFrame({ id, number, title, lede, body, provenance }) {
  const panel = document.createElement('div');
  panel.className = 'demo-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-labelledby', `${id}-title`);
  panel.innerHTML =
    `<div class="demo-panel__head">` +
    `<p class="pplot__caption-title demo-panel__title" id="${id}-title"><span class="pplot__fig-no">Panel ${number}.</span>${title}` +
    `<span class="pplot__provenance">Live</span></p>` +
    `<p class="demo-panel__lede">${lede}</p>` +
    `</div>` +
    body +
    `<p class="pplot__seed demo-panel__provenance">${provenance}</p>` +
    `<p class="visually-hidden" data-status aria-live="polite"></p>`;
  const $ = (selector) => panel.querySelector(selector);
  return { panel, $ };
}

/** A radio set printed as adjoining form boxes (the choice group of form.css). */
export function choiceGroup({ name, legend, options, checked }) {
  const items = options
    .map(
      (o) =>
        `<div class="choice__option"><input type="radio" id="${name}-${o.value}" name="${name}" value="${o.value}"${o.value === checked ? ' checked' : ''} />` +
        `<label for="${name}-${o.value}">${o.label}</label></div>`,
    )
    .join('');
  return `<fieldset class="choice"><legend>${legend}</legend><div class="choice__options">${items}</div></fieldset>`;
}

/** Attaches a built panel to its mount point, which then hides its printed fallback. */
export function attachPanel(mount, panel) {
  mount.append(panel);
  mount.classList.add('is-live');
}

/**
 * Entry point of homework 07. The shared read-mode styles come from homework.js, the figure and table
 * vocabulary from hw01.css and the frame of the panels and the tied formulas from hw04.css; this adds the
 * homework's own styles and its two interactive panels. Every figure and table is complete static HTML,
 * computed at build time by homework/07/figures.js, before this runs.
 *
 * Mount points of the panels (a div.demo with a printed fallback paragraph, p.demo__fallback, which stays in
 * place if the panel cannot be mounted):
 *   [data-demo="sums"]   Panel 1, §4: a Riemann and a Lebesgue sum of the same function, side by side
 *   [data-demo="cdf"]    Panel 2, §10: the normal distribution function by every method, at any x
 *
 * A panel is loaded when it comes within a screen of the viewport, and a failure leaves its fallback text.
 */

import './homework.js';
import './styles/hw01.css';
import './styles/hw04-figures.css';
import './styles/hw04.css';
import './styles/hw07-figures.css';
import './styles/hw07.css';

/** Loaders of the panels, by the value of data-demo. */
const PANELS = {
  sums: () => import('./hw07/sums-demo.js').then((m) => m.mountSumsDemo),
  cdf: () => import('./hw07/cdf-demo.js').then((m) => m.mountCdfDemo),
};

function whenNear(element, callback) {
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
    { rootMargin: '100% 0px' },
  );
  io.observe(element);
}

/** Puts a mount point back to its printed fallback after a failure. */
function restoreFallback(element, error) {
  console.error(error);
  element.classList.remove('is-live');
  element.querySelector('.demo-panel')?.remove();
}

for (const element of document.querySelectorAll('.demo[data-demo]')) {
  const load = PANELS[element.dataset.demo];
  if (!load) continue;
  whenNear(element, () => {
    load()
      .then((mount) => mount(element))
      .catch((error) => restoreFallback(element, error));
  });
}

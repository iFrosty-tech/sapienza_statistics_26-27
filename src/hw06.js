/**
 * Entry point of homework 06. The shared read-mode styles come from homework.js,
 * the figure and table vocabulary from hw01.css and the frame of the panels and
 * the figures of random walks from the two sheets of homework 04; this adds the
 * homework's own styles and its interactive panel. Every figure and table is
 * complete static HTML, computed at build time by homework/06/figures.js,
 * before this runs.
 *
 * Mount point of the panel (a div.demo with a printed fallback paragraph,
 * p.demo__fallback, which stays in place if the panel cannot be mounted):
 *   [data-demo="sampling"][data-seed]   Panel 1, §3: m hackers over n systems;
 *                                       data-seed is a plain number, optional
 *
 * The panel is loaded when it comes within a screen of the viewport, and a
 * failure leaves its fallback text.
 */

import './homework.js';
import './styles/hw01.css';
import './styles/hw04-figures.css';
import './styles/hw04.css';
import './styles/hw06-figures.css';
import './styles/hw06.css';

/** Loaders of the panels, by the value of data-demo. */
const PANELS = {
  sampling: () => import('./hw06/sampling-demo.js').then((m) => m.mountSamplingDemo),
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

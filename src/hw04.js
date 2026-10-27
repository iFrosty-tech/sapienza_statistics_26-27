/**
 * Entry point of homework 04. The shared read-mode styles come from
 * homework.js and the figure and table vocabulary from hw01.css; this adds the
 * homework's own styles and its interactive panels. Every figure and table is
 * complete static HTML, computed at build time by homework/04/figures.js,
 * before this runs.
 *
 * Mount points of the panels (a div.demo with a printed fallback paragraph,
 * p.demo__fallback, which stays in place if the panel cannot be mounted):
 *   [data-demo="simulator"][data-seed][data-p]
 *                       Panel 1, §3: trajectories of m attackers over n systems;
 *                       data-seed and data-p are plain numbers, optional
 *   [data-demo="clt"]   Panel 2, §7: the exact law of Sₙ/√n against N(0, 1)
 *
 * Each panel is loaded when it comes within a screen of the viewport, and each
 * is isolated: a failure leaves its fallback text.
 */

import './homework.js';
import './styles/hw01.css';
import './styles/hw04-figures.css';
import './styles/hw04.css';

/** Loaders of the panels, by the value of data-demo. */
const PANELS = {
  simulator: () => import('./hw04/simulator-demo.js').then((m) => m.mountSimulatorDemo),
  clt: () => import('./hw04/clt-demo.js').then((m) => m.mountCltDemo),
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

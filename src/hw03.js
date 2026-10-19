/**
 * Entry point of homework 03. The shared read-mode styles come from
 * homework.js and the figure and table vocabulary from hw01.css; this adds the
 * homework's own styles and its four interactive panels. Every figure and
 * table is complete static HTML, computed at build time by
 * homework/03/figures.js, before this runs.
 *
 * Chart figures carry the markup contract of homework 01 ([data-fig],
 * [data-fig-kind], [data-fig-canvas] with a [data-fig-series] container and its
 * <script data-fig-data>), so that they can be redrawn at their true width
 * from src/hw03/render.js.
 *
 * Mount points of the panels (a div.demo with a printed fallback paragraph,
 * p.demo__fallback, which stays in place if the panel cannot be mounted):
 *   [data-demo="ecc"]           Panel 1, §2: toy EC-ElGamal encryption step by step
 *   [data-demo="caesar"]        Panel 2, §3: the Caesar cipher as a slide rule
 *   [data-demo="cryptanalysis"] Panel 3, §5: ranking the 26 keys under five criteria
 *   [data-demo="key-recovery"]  Panel 4, §6: the attacks on the restricted key space, in a worker
 *
 * Each panel is loaded when it comes within a screen of the viewport, so that
 * the elliptic-curve code and the model of English load only when needed, and
 * each is isolated: a failure leaves its fallback text.
 */

import './homework.js';
import './styles/hw01.css';
import './styles/hw03.css';

/** Loaders of the panels, by the value of data-demo. */
const PANELS = {
  ecc: () => import('./hw03/ecc-demo.js').then((m) => m.mountEccDemo),
  caesar: () => import('./hw03/caesar-demo.js').then((m) => m.mountCaesarDemo),
  cryptanalysis: () => import('./hw03/cryptanalysis-demo.js').then((m) => m.mountCryptanalysisDemo),
  'key-recovery': () => import('./hw03/key-recovery-demo.js').then((m) => m.mountKeyRecoveryDemo),
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

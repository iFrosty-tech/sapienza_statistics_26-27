/**
 * Entry point of homework 01. The shared read-mode styles come from
 * homework.js; this adds the homework's own figures. Every figure is complete
 * static HTML before this runs, and each mount is isolated, so a failure
 * leaves that figure as printed.
 *
 * Mount points (attribute on the element, content printed by the build):
 *   [data-group-law]  Fig. 1, the chord-and-tangent construction over the reals
 *   [data-program]    Listing 1, the toy program of §3: printed output in
 *                     [data-program-output], form in [data-program-controls]
 *                     (hidden until mounted), announcements in [data-program-status]
 *   [data-slowmo]     Fig. 4, the slowed-down view of §4: printed lattice in
 *                     [data-slowmo-stage]; dial, bits and arithmetic in
 *                     [data-slowmo-side], controls in [data-slowmo-controls],
 *                     transcript in [data-slowmo-console] (all hidden until mounted)
 *   [data-fig]        the chart figures of §3 and §5 (series choice, redraw, resample)
 *
 * The program and the slowed-down view are loaded when they come within a
 * screen of the viewport: the program brings the secp256k1 and Ethereum code
 * with it, which the rest of the page does not need.
 */

import './homework.js';
import './styles/hw01.css';

import { mountGroupLaw } from './hw01/group-law.js';
import { mountChartFigures } from './hw01/figures.js';

/** [selector, mount] pairs for the figures mounted at once. */
const MOUNTS = [['[data-group-law]', mountGroupLaw]];

/** [selector, loader] pairs for the figures mounted when they come near the viewport. */
const LAZY_MOUNTS = [
  ['[data-program]', () => import('./hw01/program.js').then((m) => m.mountProgram)],
  ['[data-slowmo]', () => import('./hw01/slowmo.js').then((m) => m.mountSlowMo)],
];

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

for (const [selector, mount] of MOUNTS) {
  for (const element of document.querySelectorAll(selector)) {
    try {
      mount(element);
    } catch (error) {
      console.error(error);
    }
  }
}

for (const [selector, load] of LAZY_MOUNTS) {
  for (const element of document.querySelectorAll(selector)) {
    whenNear(element, () => {
      load()
        .then((mount) => mount(element))
        .catch((error) => console.error(error));
    });
  }
}

mountChartFigures();

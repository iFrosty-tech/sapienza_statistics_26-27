/**
 * Entry point of homework 01. The shared read-mode styles come from
 * homework.js; this adds the homework's own figures. Every figure is complete
 * static HTML before this runs, and each mount is isolated, so a failure
 * leaves that figure as printed.
 *
 * Mount points (attribute on the element, content printed by the build):
 *   [data-group-law]  Fig. 1, the chord-and-tangent construction over the reals
 *   [data-program]    the toy program of §3: printed output in [data-program-output],
 *                     controls slot [data-program-controls] (hidden until mounted)
 *   [data-slowmo]     the slowed-down view of §4: static lattice in [data-slowmo-stage],
 *                     controls slot [data-slowmo-controls] (hidden until mounted)
 *   [data-fig]        the chart figures of §3 and §5 (series choice, redraw, resample)
 */

import './homework.js';
import './styles/hw01.css';

import { mountGroupLaw } from './hw01/group-law.js';
import { mountChartFigures } from './hw01/figures.js';

/*
 * The live program and the slowed-down view have no behaviour yet: their
 * mounts leave the printed output and the static lattice exactly as built.
 */
const keepPrinted = () => {};

/** [selector, mount] pairs for the interactive figures listed above. */
const MOUNTS = [
  ['[data-group-law]', mountGroupLaw],
  ['[data-program]', keepPrinted],
  ['[data-slowmo]', keepPrinted],
];

for (const [selector, mount] of MOUNTS) {
  for (const element of document.querySelectorAll(selector)) {
    try {
      mount(element);
    } catch (error) {
      console.error(error);
    }
  }
}

mountChartFigures();

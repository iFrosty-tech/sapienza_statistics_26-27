import { mountProbabilityPlot } from './probability-plot.js';

/**
 * Enhances every interactive figure under `root`. Figures are complete static
 * HTML before this runs; enhancement only reveals controls and adds behaviour.
 * @param {ParentNode} [root=document]
 * @returns {{ figure: HTMLElement, plot: ReturnType<typeof mountProbabilityPlot> }[]}
 */
export function enhanceFigures(root = document) {
  const mounted = [];
  for (const figure of root.querySelectorAll('[data-pplot]')) {
    try {
      const plot = mountProbabilityPlot(figure);
      for (const controls of figure.querySelectorAll('[data-pplot-controls]')) controls.hidden = false;
      mounted.push({ figure, plot });
    } catch (error) {
      // A failed enhancement leaves the static figure in place.
      console.error(error);
    }
  }
  return mounted;
}

export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

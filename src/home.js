import '@fontsource-variable/libre-franklin/wght.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import '@fontsource-variable/source-serif-4/opsz-italic.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/form.css';
import './styles/plot.css';
import './styles/home.css';
import './styles/print.css';

import { enhanceFigures, prefersReducedMotion } from './lib/figures.js';

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Register rows are entered once, as the last beat of the opening sequence:
 * rulings draw from the 50% line outward, the sample settles, the reference
 * line is drawn, then the register lines are filled in.
 * @param {number} notBefore timestamp (performance.now) before which rows wait
 */
function enterRegister(notBefore) {
  const table = document.querySelector('.register');
  if (!table || !('IntersectionObserver' in globalThis)) return;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    const wait = Math.max(0, notBefore - performance.now());
    [...table.querySelectorAll('tbody tr')].forEach((row, k) => {
      row.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 420, delay: wait + Math.min(k * 70, 320), easing: EASE_OUT, fill: 'backwards' },
      );
    });
  });
  observer.observe(table);
}

const figures = enhanceFigures();

if (!prefersReducedMotion()) {
  const hero = figures.find(({ figure }) => figure.hasAttribute('data-pplot-intro'));
  const introMs = hero ? hero.plot.intro() : 0;
  enterRegister(performance.now() + Math.max(0, introMs - 520));
}

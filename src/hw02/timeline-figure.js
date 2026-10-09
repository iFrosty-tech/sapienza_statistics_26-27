/**
 * Figure 14, the timeline. The first time the figure enters the viewport,
 * its entries print in chronological order: each row's rule draws from the
 * left, its date marks drop onto the row and its text fades in, with a total
 * stagger under 900 ms. Under reduced motion the printed list stays as is.
 */

import { EASE_OUT, animationGroup, inViewport, onFirstView, reducedMotion } from './motion.js';

const TOTAL_STAGGER_MS = 860;

export function mountTimeline(figure) {
  const events = [...figure.querySelectorAll('[data-timeline-event]')];
  if (!events.length) throw new Error('Timeline: no events.');
  if (reducedMotion() || !('IntersectionObserver' in globalThis)) return {};
  const group = animationGroup();
  if (!inViewport(figure)) figure.classList.add('is-primed');
  const step = Math.min(80, TOTAL_STAGGER_MS / Math.max(1, events.length - 1));

  onFirstView(
    figure.querySelector('[data-timeline-canvas]') ?? figure,
    () => {
      group.reset();
      events.forEach((event, i) => {
        const t = i * step;
        group.add(event.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { delay: t, duration: 420, easing: EASE_OUT, fill: 'backwards' }));
        event.querySelectorAll('.timeline__mark').forEach((mark, j) => {
          group.add(mark.animate([{ opacity: 0, transform: 'translateY(-0.5rem)' }, { opacity: 1, transform: 'translateY(0.05em)' }], { delay: t + 140 + j * 60, duration: 240, easing: EASE_OUT, fill: 'backwards' }));
        });
        group.add(event.querySelector('.timeline__text')?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + 160, duration: 260, easing: EASE_OUT, fill: 'backwards' }));
      });
      figure.classList.remove('is-primed');
    },
    0.25,
  );
  return {};
}

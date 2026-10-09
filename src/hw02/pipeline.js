/**
 * Figure 1, the pipeline ledger. The focal sequence of the page: stage by
 * stage, the 1-bits of the value settle into its bit strip from left to right
 * (the strips are as wide as the values, so the reader sees the sizes
 * change), the value prints, its operation class tag prints, and the rule to
 * the next stage draws under the name of the operation that produces it.
 * It runs once when the figure is first in view and on "Run the pipeline";
 * a replay cancels the running one. The printed ledger is complete without it.
 */

import { renderPipelineLedger } from './render.js';
import { EASE_OUT, animationGroup, announce, blink, drawStroke, followAccount, inViewport, onFirstView, reducedMotion } from './motion.js';

/** Start of each stage after the previous one, and the parts of a stage. */
const STAGE_MS = 520;
const MARKS_MS = 380;

export function mountPipeline(figure) {
  const canvas = figure.querySelector('[data-pipeline-canvas]');
  if (!canvas?.querySelector('[data-pipeline-stages]')) throw new Error('Pipeline ledger: missing [data-pipeline-stages].');
  const status = figure.querySelector('[data-pipeline-status]');
  const run = figure.querySelector('[data-pipeline-run]');
  const group = animationGroup();
  let hasRun = false;

  const summary = () => {
    const stages = [...canvas.querySelectorAll('[data-pipeline-stage]')];
    const bits = stages.map((s) => s.querySelector('.ledger__bits')?.textContent ?? '');
    return `The pipeline in ${stages.length} stages, from ${bits[0]} of entropy to the checksummed address of ${bits.at(-1)}.`;
  };

  function play() {
    group.reset();
    hasRun = true;
    figure.classList.remove('is-primed');
    if (reducedMotion()) {
      blink(canvas);
      announce(status, summary());
      return;
    }
    const stages = [...canvas.querySelectorAll('[data-pipeline-stage]')];
    stages.forEach((stage, i) => {
      const t = i * STAGE_MS;
      const strip = stage.querySelector('.strip');
      const bits = stage.querySelector('.strip__bits');
      const value = stage.querySelector('.ledger__value');
      const tag = stage.querySelector('.ledger__class');
      const line = stage.querySelector('.ledger__arrow-line');
      const head = stage.querySelector('.ledger__arrow-head');
      const label = stage.querySelector('.ledger__link-label');
      group.add(strip?.animate([{ borderColor: 'transparent' }, {}], { delay: t, duration: 160, fill: 'backwards' }));
      // The 1-bits settle into the strip from the left: a reveal that follows reading order.
      group.add(
        bits?.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
          delay: t + 40,
          duration: MARKS_MS - 40,
          easing: EASE_OUT,
          fill: 'backwards',
        }),
      );
      group.add(value?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + 220, duration: 200, easing: EASE_OUT, fill: 'backwards' }));
      group.add(
        tag?.animate([{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], {
          delay: t + 330,
          duration: 160,
          easing: EASE_OUT,
          fill: 'backwards',
        }),
      );
      if (line) {
        group.add(drawStroke(line, { delay: t + 400, duration: 180 }));
        group.add(head?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + 540, duration: 80, fill: 'backwards' }));
        group.add(label?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + 420, duration: 200, easing: EASE_OUT, fill: 'backwards' }));
      }
    });
    announce(status, summary());
  }

  run?.addEventListener('click', play);

  followAccount(figure, (account) => {
    canvas.innerHTML = renderPipelineLedger(account);
    group.reset();
    if (hasRun || reducedMotion()) blink(canvas);
    announce(status, `${summary()} The ledger now shows the values derived in Figure 2, address ${account.checksummed}.`);
  });

  for (const controls of figure.querySelectorAll('[data-pipeline-controls]')) controls.hidden = false;
  figure.classList.add('is-live');

  // One automatic run the first time the ledger is in view. Until then its
  // animated parts wait unprinted, so the run does not start from a flash of
  // the finished state; without scripting, or under reduced motion, the
  // ledger is printed in full.
  if (!reducedMotion() && 'IntersectionObserver' in globalThis && !inViewport(canvas)) figure.classList.add('is-primed');
  onFirstView(canvas, () => {
    if (!hasRun) play();
  });
  return { play };
}

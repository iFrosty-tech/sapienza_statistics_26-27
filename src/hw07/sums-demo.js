/**
 * Panel 1 (§4): a Riemann sum and a Lebesgue sum of the same function, side by side. The reader picks one of
 * the seven functions of Table 1, the number of subintervals and levels (the same for both, as in Figure 2)
 * and the tags of the Riemann sum, and sees the rectangles over the domain, the slabs over the preimages of
 * the levels, and what each sum gives against the exact integral.
 *
 * Motion thesis. There is no animation: the focal moment is the comparison, and a change of any control
 * redraws both drawings and the readout at once, acknowledged by a blink of the two drawings. The state is a
 * pure function of the controls, so nothing a redraw interrupts can leave a half-drawn state.
 */

import { announce, attachPanel, blink, choiceGroup, panelFrame } from '../hw03/motion.js';
import { FUNCTIONS, functionByKey, lebesgue, riemannSum } from '../lib/integration.js';
import { partitionSvg } from './scene.js';

const COUNTS = Object.freeze([2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 64, 80, 100]);
const DEFAULT_INDEX = 5;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** A signed error as text: plain in [10⁻³, 10⁶), otherwise "2.50 × 10⁻⁴". */
function errorText(v) {
  if (v === Infinity) return '∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e6) return String(+a.toPrecision(3));
  const e = Math.floor(Math.log10(a));
  const exponent = String(e).replace('-', '⁻').replace(/\d/g, (d) => SUPERSCRIPT[d]);
  return `${(a / 10 ** e).toFixed(2)} × 10${exponent}`;
}

const valueText = (v) => (v === Infinity ? '∞' : v.toFixed(6).replace('-', '−'));
const statistic = (key, caption) => `<div><dt>${caption}</dt><dd data-sums-out="${key}"></dd></div>`;

function body() {
  const options = FUNCTIONS.map((fn, i) => `<option value="${fn.key}"${i === 0 ? ' selected' : ''}>${fn.name}</option>`).join('');
  return (
    `<div class="sim-controls">` +
    `<label class="text-field text-field--select"><span class="caption">Function</span><select data-sums-function>${options}</select></label>` +
    choiceGroup({
      name: 'sums-rule',
      legend: 'Riemann tags',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'mid', label: 'Midpoint' },
        { value: 'right', label: 'Right' },
      ],
      checked: 'left',
    }) +
    `</div>` +
    `<label class="sim-range"><span class="sim-range__head"><span class="caption caption--math">Subintervals n and levels N</span>` +
    `<output class="sim-range__value" data-sums-count-out></output></span>` +
    `<input type="range" data-sums-count min="0" max="${COUNTS.length - 1}" step="1" value="${DEFAULT_INDEX}" /></label>` +
    `<div class="rl-figures">` +
    `<figure><figcaption data-sums-riemann-title>Riemann</figcaption><div data-sums-riemann></div></figure>` +
    `<figure><figcaption data-sums-lebesgue-title>Lebesgue</figcaption><div data-sums-lebesgue></div></figure>` +
    `</div>` +
    `<dl class="pplot__stats pplot__stats--math">` +
    statistic('exact', 'Exact integral') +
    statistic('riemann', 'Riemann sum') +
    statistic('riemannError', 'Riemann error') +
    statistic('lebesgue', 'Lebesgue sum') +
    statistic('lebesgueError', 'Lebesgue error') +
    statistic('cost', 'Evaluations') +
    `</dl>` +
    `<p class="demo-panel__lede" data-sums-note></p>`
  );
}

/** @param {HTMLElement} mount the div.demo of the page */
export function mountSumsDemo(mount) {
  const { panel, $ } = panelFrame({
    id: 'panel-sums',
    number: 1,
    title: 'The same area, cut by the domain and by the range',
    lede: 'Left: rectangles over n equal pieces of the domain, as high as f at a tag. Right: the largest simple function below f that takes N equally spaced values, over the preimage of each value.',
    body: body(),
    provenance: 'Computed in the browser by src/lib/integration.js, the code behind Table 2.',
  });
  const state = { key: 'sin', rule: 'left', index: DEFAULT_INDEX };

  function draw({ announceChange = false } = {}) {
    const fn = functionByKey(state.key);
    const n = COUNTS[state.index];
    const riemann = riemannSum(fn, n, state.rule);
    const leb = lebesgue(fn, n);
    const rule = { left: 'left ends', mid: 'midpoints', right: 'right ends' }[state.rule];
    $('[data-sums-riemann]').innerHTML = partitionSvg(fn, {
      kind: 'riemann',
      count: n,
      rule: state.rule,
      id: 'sums-riemann',
      title: `Riemann sum of ${fn.name}`,
      desc: `${n} rectangles over equal pieces of the domain, as high as the function at the ${rule}.`,
    });
    $('[data-sums-lebesgue]').innerHTML = partitionSvg(fn, {
      kind: 'lebesgue',
      count: n,
      id: 'sums-lebesgue',
      title: `Lebesgue sum of ${fn.name}`,
      desc: `The simple function with ${n} equally spaced levels of the range below ${fn.name}, over the preimage of each level.`,
    });
    $('[data-sums-riemann-title]').textContent = `Riemann: n = ${n}, tags at the ${rule}`;
    $('[data-sums-lebesgue-title]').textContent = `Lebesgue: N = ${n} levels`;
    $('[data-sums-count-out]').textContent = String(n);
    $('[data-sums-count]').setAttribute('aria-valuetext', `${n} subintervals and levels`);
    const set = (k, text) => {
      $(`[data-sums-out="${k}"]`).textContent = text;
    };
    set('exact', fn.exactText === 'Si(π)' ? `${valueText(fn.exact)} = Si(π)` : valueText(fn.exact));
    set('riemann', valueText(riemann));
    set('riemannError', errorText(riemann - fn.exact));
    set('lebesgue', valueText(leb.value));
    set('lebesgueError', errorText(leb.value - fn.exact));
    set('cost', `${n} of f, ${n + 1} measures`);
    $('[data-sums-note]').textContent = fn.unbounded
      ? 'The function is unbounded at 0: a left sum meets f(0) = ∞, and the Lebesgue sum stops at the level √N and carries the tail.'
      : fn.kind === 'jump'
        ? 'The Lebesgue sum of a step function is exact for every N: the function takes two values, and the measure of each preimage is known.'
        : 'The Lebesgue sum is a lower sum: its error is about half the spacing of the levels, times the length of the domain, whatever the smoothness of f.';
    blink($('.rl-figures'));
    if (announceChange) announce($('[data-status]'), `${fn.name}, ${n} pieces: Riemann sum ${valueText(riemann)}, Lebesgue sum ${valueText(leb.value)}, exact ${valueText(fn.exact)}.`);
  }

  $('[data-sums-function]').addEventListener('change', (event) => {
    state.key = event.target.value;
    draw({ announceChange: true });
  });
  for (const input of panel.querySelectorAll('input[name="sums-rule"]')) {
    input.addEventListener('change', () => {
      state.rule = input.value;
      draw({ announceChange: true });
    });
  }
  $('[data-sums-count]').addEventListener('input', (event) => {
    state.index = Number(event.target.value);
    draw();
  });

  attachPanel(mount, panel);
  draw();
}

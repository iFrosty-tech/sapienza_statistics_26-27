/**
 * Panel 2 (§10): the standard normal distribution function by every method of src/lib/normal-cdf.js, at any x.
 * The reader sets x and the number of panels of the two quadrature rules, sees the trapezoids under the
 * density, and reads each method's value with its error against the reference of 80 digits.
 *
 * Motion thesis. There is no animation: a change of x or of the panels redraws the density and the readout
 * together, acknowledged by a blink of the drawing. The state is a pure function of the two controls.
 */

import { announce, attachPanel, blink, panelFrame } from '../hw03/motion.js';
import {
  HYBRID_CUTOFF,
  approximation26217,
  continuedFractionPhi,
  erfTaylor,
  hybrid,
  maclaurin,
  numericalRecipesPhi,
  referencePhi,
  simpson,
  trapezoid,
} from '../lib/normal-cdf.js';
import { densitySvg } from './scene.js';

const PANELS = Object.freeze([2, 4, 8, 16, 32, 64, 128, 256]);
const DEFAULT = { x: 1.5, panelIndex: 2 };
const RANGE = { min: -8, max: 8 };
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const typographic = (s) => s.replace('-', '−');
const digits = (v, d = 12) => typographic(v.toFixed(d));
function relativeText(v) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(v));
  const exponent = String(e).replace('-', '⁻').replace(/\d/g, (c) => SUPERSCRIPT[c]);
  return `${(v / 10 ** e).toFixed(1)} × 10${exponent}`;
}

function body() {
  return (
    `<div class="sim-controls">` +
    `<label class="sim-range"><span class="sim-range__head"><span class="caption caption--math">Point x</span>` +
    `<output class="sim-range__value" data-cdf-x-out></output></span>` +
    `<input type="range" data-cdf-x min="${RANGE.min}" max="${RANGE.max}" step="0.05" value="${DEFAULT.x}" /></label>` +
    `<label class="sim-range"><span class="sim-range__head"><span class="caption caption--math">Panels of the two rules</span>` +
    `<output class="sim-range__value" data-cdf-n-out></output></span>` +
    `<input type="range" data-cdf-n min="0" max="${PANELS.length - 1}" step="1" value="${DEFAULT.panelIndex}" /></label>` +
    `</div>` +
    `<div class="cdf-figure" data-cdf-figure></div>` +
    `<div class="data-table--scroll" tabindex="0" role="region" aria-label="The distribution function at x by each method">` +
    `<table class="data-table data-table--compact data-table--math sim-readout rl-readout" data-cdf-table></table></div>` +
    `<p class="demo-panel__lede" data-cdf-note></p>`
  );
}

/** @param {HTMLElement} mount the div.demo of the page */
export function mountCdfDemo(mount) {
  const { panel, $ } = panelFrame({
    id: 'panel-cdf',
    number: 2,
    title: 'The normal distribution function by every method',
    lede: 'The shaded area is Φ(x). The trapezoids are the numerical integral of the density from 0 to x. The table gives the value of each method and its relative error in the lower tail Φ(−|x|), against the reference of 80 digits.',
    body: body(),
    provenance: 'Computed in the browser by src/lib/normal-cdf.js; the reference is the Maclaurin series in BigInt arithmetic.',
  });
  const state = { x: DEFAULT.x, panelIndex: DEFAULT.panelIndex };

  function draw() {
    const x = state.x;
    const n = PANELS[state.panelIndex];
    const ref = referencePhi(x);
    $('[data-cdf-x-out]').textContent = typographic(x.toFixed(2));
    $('[data-cdf-n-out]').textContent = String(n);
    $('[data-cdf-figure]').innerHTML = densitySvg({
      x,
      n,
      id: 'cdf-density',
      title: `Standard normal density and Φ(${x.toFixed(2)})`,
      desc: `The standard normal density with the area to the left of x = ${x.toFixed(2)} shaded, which is ${digits(ref.value, 6)}, and ${n} trapezoids between 0 and x.`,
    });
    const rows = [
      ['Trapezoid', trapezoid(x, n), `${n + 1} evaluations`],
      ['Simpson', simpson(x, n), `${n + 1} evaluations`],
      ['Maclaurin series', maclaurin(x), 'terms'],
      ['erf series', erfTaylor(x), 'terms'],
      ['Continued fraction', continuedFractionPhi(x), 'terms'],
      ['A&S 26.2.17', approximation26217(x), 'terms'],
      ['Numerical Recipes', numericalRecipesPhi(x), 'terms'],
      ['Hybrid', hybrid(x), 'terms'],
    ];
    const lowerTail = (value) => (x >= 0 ? 1 - value : value);
    const head =
      `<thead><tr><th scope="col">Method</th><th scope="col" class="is-number">Φ(x)</th>` +
      `<th scope="col" class="is-number">Relative error of Φ(−|x|)</th><th scope="col" class="is-number">Cost</th></tr></thead>`;
    const lines = rows.map(([name, r, unit]) => {
      const error = ref.tail > 0 ? Math.abs(lowerTail(r.value) - ref.tail) / ref.tail : 0;
      const cost = unit === 'terms' ? `${r.cost} terms` : unit;
      return `<tr><th scope="row">${name}</th><td class="is-number">${digits(r.value)}</td><td class="is-number">${relativeText(error)}</td><td class="is-number">${cost}</td></tr>`;
    });
    lines.push(`<tr><th scope="row">Reference</th><td class="is-number">${typographic(ref.text.slice(0, 20))}…</td><td class="is-number">—</td><td class="is-number">80 digits</td></tr>`);
    $('[data-cdf-table]').innerHTML = `${head}<tbody>${lines.join('')}</tbody>`;
    $('[data-cdf-note]').textContent =
      Math.abs(x) >= HYBRID_CUTOFF
        ? `|x| ≥ ${HYBRID_CUTOFF}: the hybrid method uses the continued fraction. In the tail, the Maclaurin and erf series lose digits to cancellation.`
        : `|x| < ${HYBRID_CUTOFF}: the hybrid method uses the Maclaurin series, whose terms are all positive.`;
    blink($('[data-cdf-figure]'));
  }

  $('[data-cdf-x]').addEventListener('input', (event) => {
    state.x = Number(event.target.value);
    draw();
    announce($('[data-status]'), `Φ(${state.x.toFixed(2)}) = ${digits(referencePhi(state.x).value, 10)}.`);
  });
  $('[data-cdf-n]').addEventListener('input', (event) => {
    state.panelIndex = Number(event.target.value);
    draw();
  });

  attachPanel(mount, panel);
  draw();
}

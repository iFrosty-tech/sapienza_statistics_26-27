/**
 * The drawing of one step of the recurrences as SVG markup, shared by the
 * build-time figure and by the live panel, so that both show the same geometry.
 *
 * The plane has the data on both axes at one scale, with the diagonal y = x. The
 * previous mean stands on the horizontal axis and the new mean on the vertical
 * one; the rectangle runs from (x̄ₖ₋₁, x̄ₖ) to (xₖ, xₖ), and its area is what the step
 * adds to SS. The ledger lays those areas end to end in a strip of constant height.
 *
 * Inks: the observation is a value, so it is plot red; the means are ink; the
 * rectangle takes the minor ruling, because red never fills a surface.
 */

import { escapeXml } from '../lib/charts.js';
import { formatValue, ledgerSegments, planeScale, rectangleOf } from './model.js';

const round = (v) => Math.round(v * 100) / 100;
const MARGIN = 34;
const TICK = 4;

function open({ id, width, height, title, desc, className }) {
  return (
    `<svg class="stepper-svg ${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" preserveAspectRatio="xMidYMid meet">` +
    `<title id="${id}-title">${escapeXml(title)}</title><desc id="${id}-desc">${escapeXml(desc)}</desc>`
  );
}

/** Whole-number ticks of the plane: about five, at 1, 2 or 5 times a power of ten. */
function ticksOf(low, high) {
  const raw = (high - low) / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
  const out = [];
  for (let v = Math.ceil(low / step) * step; v <= high + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * The plane of one step.
 * @param {ReturnType<typeof import('./model.js').stepsOf>[number]} step
 * @param {{ id: string, domain: [number, number], size: number, title: string, desc: string, compact?: boolean }} options
 */
export function planeSvg(step, { id, domain, size, title, desc, compact = false }) {
  const scale = planeScale(domain, { size, margin: MARGIN });
  const { near, far } = scale;
  const out = [open({ id, width: size, height: size, title, desc, className: 'stepper-plane' })];
  const ticks = ticksOf(scale.low, scale.high);

  out.push('<g class="chart__rulings" aria-hidden="true">');
  for (const t of ticks) {
    out.push(`<line class="chart__ruling" x1="${near}" x2="${far}" y1="${round(scale.y(t))}" y2="${round(scale.y(t))}"/>`);
    out.push(`<line class="chart__ruling chart__ruling--v" x1="${round(scale.x(t))}" x2="${round(scale.x(t))}" y1="${near}" y2="${far}"/>`);
  }
  out.push(`<rect class="chart__frame" x="${near}" y="${near}" width="${far - near}" height="${far - near}"/></g>`);
  out.push(`<line class="stepper-diagonal" x1="${near}" y1="${far}" x2="${far}" y2="${near}" aria-hidden="true"/>`);

  const rect = rectangleOf(step, scale);
  if (rect) {
    const [cx, cy] = rect.corner;
    out.push(
      `<rect class="stepper-rect" data-el="rectangle" data-cx="${round(cx)}" data-cy="${round(cy)}" x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}"/>`,
    );
  }

  // The guides carry each mean from its axis to the rectangle.
  const my = scale.y(step.mean);
  const axisX = far + 0.5;
  out.push('<g class="stepper-marks" aria-hidden="true">');
  if (step.oldMean !== null) {
    const ox = scale.x(step.oldMean);
    out.push(`<line class="stepper-guide" data-el="old-guide" x1="${round(ox)}" x2="${round(ox)}" y1="${axisX}" y2="${round(my)}"/>`);
    out.push(`<circle class="stepper-old-mean" data-el="old-mean" cx="${round(ox)}" cy="${axisX}" r="4"/>`);
  }
  const px = scale.x(step.x);
  const py = scale.y(step.x);
  out.push(`<line class="stepper-guide" data-el="new-guide" x1="${near - 0.5}" x2="${round(step.oldMean === null ? px : scale.x(step.oldMean))}" y1="${round(my)}" y2="${round(my)}"/>`);
  out.push(`<circle class="stepper-new-mean" data-el="new-mean" data-from-y="${round(step.oldMean === null ? my : scale.y(step.oldMean))}" cx="${near - 0.5}" cy="${round(my)}" r="4"/>`);
  out.push(`<circle class="stepper-observation" data-el="observation" cx="${round(px)}" cy="${round(py)}" r="5.5"/>`);
  out.push('</g>');

  out.push('<g class="chart__labels" aria-hidden="true">');
  for (const t of ticks) {
    out.push(`<text class="chart__xlabel" x="${round(scale.x(t))}" y="${far + 16}" text-anchor="middle">${formatValue(t)}</text>`);
    out.push(`<text class="chart__ylabel" x="${near - 7}" y="${round(scale.y(t))}" text-anchor="end" dominant-baseline="middle">${formatValue(t)}</text>`);
  }
  if (!compact) {
    // The sides of the rectangle, each beside its own edge, on whichever side of it has room.
    if (rect && rect.width > 24 && rect.height > 16) {
      const inside = (rect.y + rect.height / 2);
      out.push(`<text class="stepper-area" x="${round(rect.x + rect.width / 2)}" y="${round(inside)}" text-anchor="middle" dominant-baseline="middle">${formatValue(step.area)}</text>`);
    }
    out.push(`<text class="stepper-axis-title" x="${round((near + far) / 2)}" y="${size - 3}" text-anchor="middle">previous mean</text>`);
    out.push(`<text class="stepper-axis-title" transform="translate(9 ${round((near + far) / 2)}) rotate(-90)" text-anchor="middle">new mean</text>`);
  }
  out.push('</g></svg>');
  return out.join('');
}

const STRIP_TOP = 8;
const STRIP_HEIGHT = 26;

/**
 * The ledger: the areas up to step `upTo`, laid end to end in a strip of one height.
 * @param {ReturnType<typeof import('./model.js').stepsOf>} steps
 * @param {number} upTo
 * @param {{ id: string, width: number, title: string, desc: string }} options
 */
export function ledgerSvg(steps, upTo, { id, width, title, desc }) {
  const height = STRIP_TOP + STRIP_HEIGHT + 22;
  const inner = width - 2;
  const segments = ledgerSegments(steps, upTo, inner);
  const out = [open({ id, width, height, title, desc, className: 'stepper-ledger' })];
  out.push(`<rect class="stepper-ledger__track" x="1" y="${STRIP_TOP}" width="${inner}" height="${STRIP_HEIGHT}" aria-hidden="true"/>`);
  segments.forEach((s, i) => {
    const x = round(1 + s.start);
    const w = round(s.length);
    out.push(
      `<rect class="stepper-ledger__segment${i % 2 ? ' stepper-ledger__segment--alt' : ''}" data-el="segment"${s.current ? ' data-current="true"' : ''} x="${x}" y="${STRIP_TOP}" width="${w}" height="${STRIP_HEIGHT}" aria-hidden="true"/>`,
    );
    if (s.labelled) {
      out.push(`<text class="stepper-ledger__label" x="${round(1 + s.start + s.length / 2)}" y="${STRIP_TOP + STRIP_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle" aria-hidden="true">${formatValue(s.area)}</text>`);
    }
  });
  const step = steps[Math.min(upTo, steps.length) - 1];
  const reached = segments.length ? segments.at(-1).start + segments.at(-1).length : 0;
  const label = `SS = ${formatValue(step.ss)}`;
  const flip = reached > inner * 0.8;
  out.push(
    `<text class="stepper-ledger__total" x="${round(flip ? 1 + reached : 1 + reached + 2)}" y="${STRIP_TOP + STRIP_HEIGHT + 15}" text-anchor="${flip ? 'end' : 'start'}" aria-hidden="true">${label}</text>`,
  );
  out.push('</svg>');
  return out.join('');
}

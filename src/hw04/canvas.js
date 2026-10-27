/**
 * Canvas plumbing shared by the two panels of homework 04: a layer sized to
 * its CSS box at the device pixel ratio, the palette read from the design
 * tokens (so that a canvas prints the same inks as the SVG figures), the
 * printed-caption font, and a watch on whether a panel is on screen, so that
 * no animation runs while it cannot be seen.
 */

/** Sizes a canvas to width × height CSS pixels at the device pixel ratio and returns its context in CSS pixels. */
export function sizeLayer(canvas, width, height) {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Clears a layer whose context is in CSS pixels. */
export function clearLayer(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** The inks of the sheet, read from the custom properties of tokens.css. */
export function readPalette(element) {
  const cs = getComputedStyle(element);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    paper: v('--paper', '#f7faf8'),
    paperDeep: v('--paper-deep', '#edf3ef'),
    ink: v('--ink', '#1b2420'),
    inkSoft: v('--ink-soft', '#46524c'),
    inkFaint: v('--ink-faint', '#5d6a63'),
    ruling: v('--ruling', '#9cc3ae'),
    rulingMinor: v('--ruling-minor', '#d3e6da'),
    rulingInk: v('--ruling-ink', '#3a6b54'),
    plot: v('--plot', '#d0462f'),
    font: v('--font-form', 'sans-serif'),
  };
}

/** The font of printed captions and tick labels, at `size` CSS pixels. */
export const formFont = (palette, size = 10.5, weight = 500) => `${weight} ${size}px ${palette.font}`;

/**
 * Calls onChange(visible) whenever the element enters or leaves the screen or
 * the tab is hidden, and returns a function that stops watching.
 */
export function watchVisibility(element, onChange) {
  let onScreen = !('IntersectionObserver' in globalThis);
  const update = () => onChange(onScreen && document.visibilityState === 'visible');
  let io = null;
  if (!onScreen) {
    io = new IntersectionObserver((entries) => {
      onScreen = entries.at(-1).isIntersecting;
      update();
    });
    io.observe(element);
  }
  document.addEventListener('visibilitychange', update);
  update();
  return () => {
    io?.disconnect();
    document.removeEventListener('visibilitychange', update);
  };
}

/**
 * Calls back with the content-box size of an element now and whenever it
 * changes by more than a pixel; returns a function that stops observing.
 */
export function watchSize(element, callback) {
  let last = { width: 0, height: 0 };
  const measure = () => {
    const width = Math.round(element.clientWidth);
    const height = Math.round(element.clientHeight);
    if (!width || !height) return;
    if (Math.abs(width - last.width) <= 1 && Math.abs(height - last.height) <= 1) return;
    last = { width, height };
    callback(last);
  };
  const ro = new ResizeObserver(measure);
  ro.observe(element);
  return () => ro.disconnect();
}

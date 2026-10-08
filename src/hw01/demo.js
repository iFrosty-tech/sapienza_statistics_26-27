/**
 * The live demonstration of the toy hash: a message is encoded, mapped to a
 * curve point and reduced to its digest; one input bit is flipped to show the
 * avalanche; for the scalar variant the structural collisions are produced.
 *
 * `computeDemo` and `renderDemoOutput` are pure (the static worked example is
 * rendered at build time); `mountDemo` wires the controls in the browser.
 */

import { ecHash, scalarCollisionMessages, scalarOf } from '../lib/ec-hash.js';
import { sha256 } from '../lib/sha256.js';
import { compress } from '../lib/secp256k1.js';
import { bytesEqual, bytesToHex, flipBit, hammingDistance, utf8Bytes } from '../lib/bytes.js';

export const MAX_BYTES = 64;
export const DEMO_VARIANTS = ['scalar', 'pedersen', 'sha256'];
export const VARIANT_LABEL = { scalar: 'toy hash, scalar variant', pedersen: 'toy hash, Pedersen variant', sha256: 'SHA-256' };

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const hex256 = (x) => x.toString(16).padStart(64, '0');

function digestOf(bytes, variant) {
  if (variant === 'sha256') return { digest: sha256(bytes), point: null };
  const { point, digest } = ecHash(bytes, { variant });
  return { digest, point };
}

/**
 * @param {{ text: string, variant: 'scalar'|'pedersen'|'sha256', flipIndex?: number }} input
 */
export function computeDemo({ text, variant = 'scalar', flipIndex = 0 }) {
  if (!DEMO_VARIANTS.includes(variant)) throw new Error(`unknown variant ${variant}`);
  const encoded = utf8Bytes(text);
  const truncated = encoded.length > MAX_BYTES;
  const bytes = truncated ? encoded.slice(0, MAX_BYTES) : encoded;
  const result = { text, variant, variantLabel: VARIANT_LABEL[variant], bytes, hex: bytesToHex(bytes), byteCount: bytes.length, truncated, empty: bytes.length === 0 };
  if (result.empty) return result;

  const { digest, point } = digestOf(bytes, variant);
  result.digest = digest;
  result.digestHex = bytesToHex(digest);
  if (variant === 'scalar') result.scalarHex = hex256(scalarOf(bytes));
  if (point) {
    result.point = { xHex: hex256(point.x), yHex: hex256(point.y), compressedHex: bytesToHex(compress(point)) };
  } else if (variant !== 'sha256') {
    result.point = null; // the all-zero message maps to the point at infinity
  }

  const maxBit = 8 * bytes.length - 1;
  const i = Math.min(maxBit, Math.max(0, Math.floor(Number(flipIndex) || 0)));
  const flippedBytes = flipBit(bytes, i);
  const flipped = digestOf(flippedBytes, variant);
  const xor = digest.map((b, k) => b ^ flipped.digest[k]);
  result.flipped = {
    index: i,
    byte: i >> 3,
    bit: i & 7,
    mask: `0x${(1 << (i & 7)).toString(16).padStart(2, '0')}`,
    hex: bytesToHex(flippedBytes),
    digestHex: bytesToHex(flipped.digest),
    xor,
    distance: hammingDistance(digest, flipped.digest),
  };

  if (variant === 'scalar') {
    const c = scalarCollisionMessages(bytes);
    const describeCollision = (m) => {
      if (!m) return null;
      const d = digestOf(m, 'scalar').digest;
      return { hex: bytesToHex(m), length: m.length, digestHex: bytesToHex(d), equal: bytesEqual(d, digest) };
    };
    result.collisions = { negation: describeCollision(c.negation), wrap: describeCollision(c.wrap) };
  }
  return result;
}

/**
 * A 16 × 16 grid of the 256 digest bits, read byte by byte from the most
 * significant bit. With `xor`, cells mark the positions that differ.
 */
export function renderBitGrid(bytes, { xor = false, label } = {}) {
  const cells = [];
  for (const b of bytes) {
    for (let k = 7; k >= 0; k -= 1) cells.push(`<span class="bitgrid__cell" data-bit="${(b >> k) & 1}"></span>`);
  }
  const ones = cells.filter((c) => c.includes('data-bit="1"')).length;
  const alt = label ?? (xor ? `${ones} of 256 output bits changed` : `digest bits, ${ones} ones of 256`);
  return `<span class="bitgrid${xor ? ' bitgrid--xor' : ''}" role="img" aria-label="${escape(alt)}">${cells.join('')}</span>`;
}

const cell = (caption, value, { mono = true, wide = false } = {}) =>
  `<div class="demo__cell${wide ? ' demo__cell--wide' : ''}"><span class="caption">${escape(caption)}</span><span class="demo__value${mono ? ' demo__value--mono' : ''}">${value}</span></div>`;

/** The output panel of the demonstration as HTML (values already escaped). */
export function renderDemoOutput(r) {
  if (r.empty) {
    return `<div class="demo__grid">${cell('Message', '<span class="demo__note">Type at least one character: the toy hash is defined for non-empty messages.</span>', { mono: false, wide: true })}</div>`;
  }
  const parts = [];
  parts.push(cell('Message bytes (UTF-8, hex)', `${escape(r.hex)}${r.truncated ? ' <span class="demo__note">truncated to 64 bytes</span>' : ''}`, { wide: true }));
  parts.push(cell('Length', `<span class="tabular">${r.byteCount}</span> bytes, <span class="tabular">${8 * r.byteCount}</span> bits`, { mono: false }));
  parts.push(cell('Hash function', escape(r.variantLabel), { mono: false }));
  if (r.variant === 'scalar') parts.push(cell('Scalar k = int_LE(m) mod n', escape(r.scalarHex), { wide: true }));
  if (r.variant !== 'sha256') {
    if (r.point) {
      parts.push(cell('Point x', escape(r.point.xHex), { wide: true }));
      parts.push(cell('Point y', escape(r.point.yHex), { wide: true }));
      parts.push(cell('Compressed point (SEC 1)', escape(r.point.compressedHex), { wide: true }));
    } else {
      parts.push(cell('Point', 'O, the point at infinity (all bytes are zero); the digest is defined as 0²⁵⁶', { mono: false, wide: true }));
    }
  }
  parts.push(cell('Digest (256 bits)', `${escape(r.digestHex)}${renderBitGrid(r.digest)}`, { wide: true }));
  const f = r.flipped;
  parts.push(
    cell(
      `Flipped input bit ${f.index} (byte ${f.byte}, mask ${f.mask})`,
      `${escape(f.hex)}`,
      { wide: true },
    ),
  );
  parts.push(cell('Digest of the flipped message', `${escape(f.digestHex)}${renderBitGrid(Uint8Array.from(f.xor), { xor: true })}`, { wide: true }));
  parts.push(
    cell(
      'Hamming distance',
      `<span class="tabular">${f.distance}</span> of 256 bits changed (<span class="tabular">${((100 * f.distance) / 256).toFixed(1)}</span>%); an ideal hash changes 128 ± 8 on average`,
      { mono: false, wide: true },
    ),
  );
  if (r.collisions) {
    const line = (name, c, what) =>
      c
        ? cell(
            `${name} (${c.length} bytes)`,
            `${escape(c.hex)}<span class="demo__verdict" data-equal="${c.equal}">${c.equal ? 'same digest' : 'different digest'}</span> <span class="demo__note">${what}</span>`,
            { wide: true },
          )
        : cell(name, '<span class="demo__note">does not fit the message length</span>', { mono: false, wide: true });
    parts.push(line('Negation message, encodes n − k', r.collisions.negation, '(n − k)·G = −k·G shares the x-coordinate of k·G'));
    parts.push(line('Wrap message, encodes k + n', r.collisions.wrap, 'n·G = O, so (k + n)·G = k·G'));
  }
  return `<div class="demo__grid">${parts.join('')}</div>`;
}

/* ------------------------------------------------------------------ DOM ---- */

/**
 * Wires the demonstration figure: `[data-demo-text]`, `[data-demo-variant]`
 * radios, `[data-demo-flip]` number input, `[data-demo-output]` panel.
 * @param {HTMLElement} figure
 */
export function mountDemo(figure) {
  const text = figure.querySelector('[data-demo-text]');
  const flip = figure.querySelector('[data-demo-flip]');
  const output = figure.querySelector('[data-demo-output]');
  const status = figure.querySelector('[data-demo-status]');
  const count = figure.querySelector('[data-demo-count]');
  if (!text || !output) throw new Error('Demo figure: missing [data-demo-text] or [data-demo-output].');

  function variant() {
    return figure.querySelector('[data-demo-variant]:checked')?.value ?? 'scalar';
  }

  let frame = 0;
  function recompute(announce = false) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const r = computeDemo({ text: text.value, variant: variant(), flipIndex: flip?.value ?? 0 });
      output.innerHTML = renderDemoOutput(r);
      if (count) count.textContent = `${r.byteCount} of ${MAX_BYTES} bytes${r.truncated ? ' (truncated)' : ''}`;
      if (flip && !r.empty) {
        flip.max = String(8 * r.byteCount - 1);
        if (Number(flip.value) > 8 * r.byteCount - 1) flip.value = String(8 * r.byteCount - 1);
      }
      if (announce && status) {
        status.textContent = r.empty
          ? 'Empty message.'
          : `${r.variantLabel}: digest ${r.digestHex.slice(0, 16)}…, flipping input bit ${r.flipped.index} changed ${r.flipped.distance} of 256 output bits.`;
      }
    });
  }

  text.addEventListener('input', () => recompute(true));
  flip?.addEventListener('input', () => recompute(true));
  for (const radio of figure.querySelectorAll('[data-demo-variant]')) radio.addEventListener('change', () => recompute(true));
  figure.querySelector('[data-demo-random-bit]')?.addEventListener('click', () => {
    if (!flip) return;
    const max = Number(flip.max) || 0;
    flip.value = String(Math.floor(Math.random() * (max + 1)));
    recompute(true);
  });

  for (const controls of figure.querySelectorAll('[data-demo-controls]')) controls.hidden = false;
  recompute(false);
  figure.classList.add('is-live');
}

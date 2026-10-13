/**
 * The toy program of §3 (Listing 1), live on the page: from a private key k
 * to the public key Q = kG, on the toy curve y² = x³ + 7 over F₁₇ or on
 * secp256k1, by repeated addition or by double-and-add. On secp256k1 the
 * program also derives the Ethereum address of Q.
 *
 * The parsing and the printed report are pure functions, tested in Node; the
 * report for the assignment (G = (1, 5), k = 6, repeated addition) is the
 * listing printed when the page is built, which stays in place until the
 * reader computes something else. mountProgram adds the form under
 * [data-program-controls] and prints into [data-program-output].
 *
 * Teaching code: it must not handle real keys.
 */

import {
  SECP256K1,
  SECP256K1_G,
  SECP256K1_N,
  TOY_BASE,
  TOY_CURVE,
  bitLength,
  formatPoint,
  isOnCurve,
  multiply,
  multiplyByDoubleAndAdd,
  multiplyByRepeatedAddition,
  orderOf,
  points,
} from '../lib/toy-curve.js';
import { publicKeyToAddress, toChecksumAddress } from '../lib/ethereum.js';
import { bigIntToBytes, concatBytes } from '../lib/bytes.js';

/**
 * toyRepeated, secpRepeated: largest k for repeated addition (one printed line, or
 * block, per multiple); maxBits: largest private key; secpTraceBits: on secp256k1,
 * double-and-add prints every operation for keys of at most this many bits.
 */
export const PROGRAM_LIMITS = Object.freeze({ toyRepeated: 10000n, secpRepeated: 64n, maxBits: 256, secpTraceBits: 8 });

/** An input the program cannot use; the message names the problem and the fix. */
export class ProgramInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProgramInputError';
  }
}

const CURVE_NAME = Object.freeze({ toy: 'the toy curve', secp256k1: 'secp256k1' });
const thousands = (v) => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * The private key typed by the reader, in decimal or as 0x and hexadecimal digits.
 * @param {string} text
 * @param {{ curve: 'toy'|'secp256k1', method: 'repeated'|'double-and-add' }} options
 * @returns {bigint}
 * @throws {ProgramInputError}
 */
export function parsePrivateKey(text, { curve, method }) {
  const raw = String(text ?? '').trim();
  if (raw === '') throw new ProgramInputError('Enter a private key k, a whole number such as 6.');
  let k;
  if (/^0x[0-9a-f]+$/i.test(raw)) k = BigInt(`0x${raw.slice(2)}`);
  else if (/^\d+$/.test(raw)) k = BigInt(raw);
  else if (/^[-−]\s*\d+$/.test(raw)) {
    throw new ProgramInputError(`k must be at least 1, and ${raw} is negative. Enter a positive whole number.`);
  } else {
    throw new ProgramInputError(`“${raw}” is not a whole number. Enter k in decimal digits (for example 6) or in hexadecimal after 0x (for example 0x1f).`);
  }
  if (k < 1n) throw new ProgramInputError('k must be at least 1: 0G is the point at infinity O, which is not a public key. Enter a positive whole number.');
  const bits = bitLength(k);
  if (bits > PROGRAM_LIMITS.maxBits) {
    throw new ProgramInputError(`k has ${bits} bits, and the program accepts private keys of at most ${PROGRAM_LIMITS.maxBits} bits. Enter a smaller number.`);
  }
  if (curve === 'secp256k1' && k >= SECP256K1_N) {
    throw new ProgramInputError('k must be smaller than n, the order of G on secp256k1, a 78-digit number beginning 11579208923731619542. Reduce k modulo n or enter a smaller key.');
  }
  if (method === 'repeated') {
    const limit = curve === 'secp256k1' ? PROGRAM_LIMITS.secpRepeated : PROGRAM_LIMITS.toyRepeated;
    if (k > limit) {
      throw new ProgramInputError(`Repeated addition prints every multiple and is limited here to k ≤ ${thousands(limit)} on ${CURVE_NAME[curve]}. Choose double-and-add, which needs one doubling per bit of k and one addition per bit equal to 1.`);
    }
  }
  return k;
}

/**
 * A base point of the toy curve from the value "x,y" of the form's select.
 * @throws {ProgramInputError} when it is not a point of y² = x³ + 7 over F₁₇
 */
export function parseBasePoint(value) {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(String(value));
  const P = match ? { x: BigInt(match[1]), y: BigInt(match[2]) } : null;
  if (!P || !isOnCurve(TOY_CURVE, P)) throw new ProgramInputError('Choose a base point of the toy curve from the list.');
  return P;
}

const name = (k) => (k === 1n ? 'G' : `${k}G`);
const show = (P) => (P === null ? 'O (point at infinity)' : formatPoint(P));
const hex = (v) => `0x${v.toString(16).padStart(64, '0')}`;
const plain = (text) => ({ text });
const strong = (text) => ({ text, strong: true });
const popcount = (k) => [...k.toString(2)].filter((c) => c === '1').length;

/* One printed line of double-and-add: the bit read, the operation, the accumulator. */
const traceLine = (bitIndex, bit, op, rest) => `bit ${bitIndex + 1} = ${bit}  ${op.padEnd(8)} ${rest}`;

/* A large count, written as the leading digits and a power of ten. */
function approximately(v) {
  const digits = v.toString();
  if (digits.length <= 15) return thousands(v);
  return `about ${digits[0]}.${digits.slice(1, 4)} × 10^${digits.length - 1}`;
}

function toyReport(k, base, method) {
  const lines = [];
  let Q;
  let operations;
  if (method === 'double-and-add') {
    const { result, bits, steps } = multiplyByDoubleAndAdd(TOY_CURVE, base, k);
    lines.push(plain(`k = ${k} = ${bits} in binary (${bits.length} bit${bits.length === 1 ? '' : 's'})`));
    lines.push(plain(traceLine(0, 1, 'load G', `R = G = ${show(base)}`)));
    for (const s of steps) {
      lines.push(plain(traceLine(s.bitIndex, s.bit, s.op === 'add' ? 'add G' : 'double', `R = ${name(s.index)} = ${show(s.record.result)}`)));
    }
    operations = steps.length;
    lines.push(plain(`Group operations: ${operations} (repeated addition: ${k - 1n})`));
    Q = result;
  } else {
    const { result, steps } = multiplyByRepeatedAddition(TOY_CURVE, base, k);
    [base, ...steps.map((s) => s.result)].forEach((P, i) => lines.push(plain(`${name(BigInt(i + 1))} = ${show(P)}`)));
    operations = steps.length;
    Q = result;
  }
  lines.push(plain(''));
  if (Q === null) {
    lines.push(strong(`${name(k)} = O (point at infinity)`));
    lines.push(plain(`O is not a valid public key: k = ${k} is a multiple of the order of G, n = ${orderOf(TOY_CURVE, base)}.`));
  } else {
    lines.push(strong(`TOY PUBLIC KEY: Q = ${name(k)} = ${formatPoint(Q)}`));
  }
  return { lines, result: Q, operations };
}

function secpReport(k, method) {
  const G = SECP256K1_G;
  const lines = [];
  const block = (P) => [plain(`  x = ${hex(P.x)}`), plain(`  y = ${hex(P.y)}`)];
  const bits = k.toString(2);
  let Q;
  let operations;
  if (method === 'repeated') {
    const { result, steps } = multiplyByRepeatedAddition(SECP256K1, G, k);
    [G, ...steps.map((s) => s.result)].forEach((P, i) => lines.push(plain(`${name(BigInt(i + 1))}:`), ...block(P)));
    operations = steps.length;
    Q = result;
  } else if (bits.length <= PROGRAM_LIMITS.secpTraceBits) {
    const { result, steps } = multiplyByDoubleAndAdd(SECP256K1, G, k);
    lines.push(plain(`k = ${k} = ${bits} in binary (${bits.length} bit${bits.length === 1 ? '' : 's'})`));
    lines.push(plain(traceLine(0, 1, 'load G', 'R = G')), ...block(G));
    for (const s of steps) {
      lines.push(plain(traceLine(s.bitIndex, s.bit, s.op === 'add' ? 'add G' : 'double', `R = ${name(s.index)}`)), ...block(s.record.result));
    }
    operations = steps.length;
    lines.push(plain(`Group operations: ${operations} (repeated addition: ${k - 1n})`));
    Q = result;
  } else {
    // A full-size key: a summary instead of one block per operation.
    const ones = popcount(k);
    operations = bits.length - 1 + ones - 1;
    lines.push(
      plain(`k = ${hex(k)}`),
      plain(`  = ${k}`),
      plain(`k has ${bits.length} bits, ${ones} of them equal to 1.`),
      plain(`Double-and-add: ${bits.length - 1} doublings and ${ones - 1} additions, ${operations} group operations;`),
      plain(`repeated addition would need k − 1 additions, ${approximately(k - 1n)}.`),
    );
    Q = multiply(SECP256K1, G, k);
  }
  const xy = concatBytes(bigIntToBytes(Q.x, 32), bigIntToBytes(Q.y, 32));
  const address = toChecksumAddress(publicKeyToAddress(xy));
  lines.push(
    plain(''),
    strong(`PUBLIC KEY: Q = ${bits.length <= PROGRAM_LIMITS.secpTraceBits || method === 'repeated' ? name(k) : 'kG'}`),
    strong(`  x = ${hex(Q.x)}`),
    strong(`  y = ${hex(Q.y)}`),
    strong(`Ethereum address: ${address}`),
    plain('The address is the last 20 bytes of Keccak-256(x ‖ y), the hash of the 64-byte'),
    plain('public key without its 0x04 prefix, written with the EIP-55 mixed-case checksum.'),
  );
  return { lines, result: Q, operations, address };
}

/**
 * The text printed by the program, line by line; `strong` marks the result.
 * @param {{ curve?: 'toy'|'secp256k1', k: bigint, base?: { x: bigint, y: bigint }, method?: 'repeated'|'double-and-add' }} options
 *   k must already be valid for the curve and method (parsePrivateKey); base is ignored on secp256k1
 * @returns {{ lines: { text: string, strong?: boolean }[], result: object|null, operations: number, address?: string }}
 */
export function programReport({ curve = 'toy', k, base = TOY_BASE, method = 'repeated' }) {
  return curve === 'secp256k1' ? secpReport(k, method) : toyReport(k, base, method);
}

/** The report as plain text, as the console shows it. */
export function reportText(report) {
  return report.lines.map((line) => line.text).join('\n');
}

/* ===================================================================== DOM */

const PRINT_STEP_MS = 30;
const PRINT_TOTAL_MS = 600;

function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function choice(name, legend, options) {
  const items = options
    .map(
      ([value, label, checked]) =>
        `<div class="choice__option"><input type="radio" id="${name}-${value}" name="${name}" value="${value}"${checked ? ' checked' : ''} />` +
        `<label for="${name}-${value}">${label}</label></div>`,
    )
    .join('');
  return `<fieldset class="choice"><legend>${legend}</legend><div class="choice__options">${items}</div></fieldset>`;
}

const COMPUTE_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
  '<path d="M2 13 14 3" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
  '<circle cx="4.5" cy="10.9" r="1.6" fill="currentColor"/><circle cx="11.5" cy="5.1" r="1.6" fill="currentColor"/></svg>';

const K_NOTE = Object.freeze({
  toy: 'A whole number of at least 1; repeated addition prints up to k = 10,000.',
  secp256k1: 'From 1 to n − 1, in decimal or as 0x and hexadecimal digits; repeated addition up to k = 64.',
});

/**
 * Mounts the live program: the form in [data-program-controls], the output in
 * [data-program-output], announcements in [data-program-status].
 * @param {HTMLElement} root the [data-program] element
 */
export function mountProgram(root) {
  const output = root.querySelector('[data-program-output]');
  const slot = root.querySelector('[data-program-controls]');
  const status = root.querySelector('[data-program-status]');
  if (!output || !slot) throw new Error('Program: missing [data-program-output] or [data-program-controls].');

  const toyPoints = points(TOY_CURVE).map((P) => ({ P, order: orderOf(TOY_CURVE, P) }));
  const toyOptions = toyPoints
    .map(({ P, order }) => `<option value="${P.x},${P.y}"${P.x === TOY_BASE.x && P.y === TOY_BASE.y ? ' selected' : ''}>(${P.x}, ${P.y}) — order ${order}</option>`)
    .join('');

  slot.innerHTML =
    '<form class="program__form" novalidate aria-label="Inputs of the toy program">' +
    choice('program-curve', 'Curve', [
      // "(mod 17)" rather than a subscripted F: the form typeface has no subscript digits.
      ['toy', 'Toy curve y² = x³ + 7 (mod 17)', true],
      ['secp256k1', 'secp256k1 (Ethereum)', false],
    ]) +
    '<div class="program__fields">' +
    '<div class="text-field program__key"><label class="caption" for="program-k">Private key</label>' +
    '<input id="program-k" name="k" type="text" inputmode="numeric" value="6" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="program-k-note program-error" />' +
    `<p class="text-field__note" id="program-k-note" data-program-note>${K_NOTE.toy}</p></div>` +
    '<div class="text-field text-field--select"><label class="caption" for="program-base">Base point</label>' +
    `<select id="program-base" name="base" data-program-base>${toyOptions}</select></div>` +
    '</div>' +
    choice('program-method', 'Method', [
      ['repeated', 'Repeated addition', true],
      ['double-and-add', 'Double-and-add', false],
    ]) +
    `<div class="program__actions"><button type="submit" class="form-button">${COMPUTE_ICON}Compute</button>` +
    '<p class="program__error" id="program-error" role="alert" data-program-error></p></div>' +
    '</form>';

  const form = slot.querySelector('form');
  const keyInput = form.querySelector('#program-k');
  const note = form.querySelector('[data-program-note]');
  const select = form.querySelector('[data-program-base]');
  const error = form.querySelector('[data-program-error]');
  const value = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  let toySelection = select.value;
  let printing = 0;

  function syncCurve() {
    const curve = value('program-curve');
    note.textContent = K_NOTE[curve];
    keyInput.inputMode = curve === 'secp256k1' ? 'text' : 'numeric';
    if (curve === 'secp256k1') {
      if (!select.disabled) toySelection = select.value;
      select.innerHTML = '<option value="G">G (SEC 2)</option>';
      select.disabled = true;
    } else if (select.disabled) {
      select.innerHTML = toyOptions;
      select.value = toySelection;
      select.disabled = false;
    }
  }

  function lineNode(line, first) {
    const lead = first ? '' : '\n';
    if (!line.strong && !line.error) return [document.createTextNode(lead + line.text)];
    const el = document.createElement(line.strong ? 'strong' : 'span');
    if (line.error) el.className = 'program__line--error';
    el.textContent = line.text;
    return first ? [el] : [document.createTextNode(lead), el];
  }

  /* Prints the lines with a short stagger (at most 30 ms per line and 600 ms in all), at once under reduced motion. */
  function print(lines, { wide = false } = {}) {
    printing += 1;
    const token = printing;
    output.classList.toggle('program__output--wide', wide);
    output.classList.toggle('is-error', lines.some((l) => l.error));
    output.textContent = '';
    output.scrollTop = 0;
    const nodes = lines.map((line, i) => lineNode(line, i === 0));
    if (reducedMotion() || nodes.length < 2) {
      output.append(...nodes.flat());
      output.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      return;
    }
    const per = Math.min(PRINT_STEP_MS, PRINT_TOTAL_MS / nodes.length);
    const start = performance.now();
    let shown = 0;
    const frame = (now) => {
      if (token !== printing) return;
      const due = Math.min(nodes.length, Math.floor((now - start) / per) + 1);
      if (due > shown) {
        output.append(...nodes.slice(shown, due).flat());
        shown = due;
      }
      if (shown < nodes.length) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function announce(text) {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => {
      status.textContent = text;
    });
  }

  function fail(message) {
    keyInput.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    print([{ text: `Error: ${message}`, error: true }]);
  }

  form.addEventListener('change', (event) => {
    if (event.target.name === 'program-curve') syncCurve();
  });
  keyInput.addEventListener('input', () => keyInput.removeAttribute('aria-invalid'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const curve = value('program-curve');
    const method = value('program-method');
    try {
      const k = parsePrivateKey(keyInput.value, { curve, method });
      const base = curve === 'toy' ? parseBasePoint(select.value) : undefined;
      const report = programReport({ curve, k, base, method });
      keyInput.removeAttribute('aria-invalid');
      error.textContent = '';
      print(report.lines, { wide: curve === 'secp256k1' });
      const how = method === 'repeated' ? 'repeated addition' : 'double-and-add';
      if (curve === 'secp256k1') announce(`Computed the public key Q = kG on secp256k1 by ${how}: the Ethereum address is ${report.address}.`);
      else if (report.result === null) announce(`Computed ${name(k)} by ${how}: the point at infinity O, which is not a valid public key.`);
      else announce(`Computed ${name(k)} on the toy curve by ${how}: Q = ${formatPoint(report.result)}, in ${report.operations} group operations.`);
    } catch (e) {
      if (e instanceof ProgramInputError) fail(e.message);
      else {
        console.error(e);
        fail('The computation failed unexpectedly. Reload the page and try again.');
      }
    }
  });

  syncCurve();
  slot.hidden = false;
  root.classList.add('is-live');
}

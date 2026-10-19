/**
 * Panel 1 (§2): the toy hashed EC-ElGamal scheme, live. The reader draws a key
 * pair with the private key restricted to [1, 2^20], encrypts a message of
 * their own and follows each step of §2.2 with its intermediate values: the
 * ephemeral scalar r, the points R = rG and S = rQ, the keystream blocks, the
 * byte-wise exclusive or and the tag. Encrypting again shows the
 * randomisation; decrypting with k returns the message, and decrypting with a
 * wrong key or a tampered ciphertext is rejected by the tag (§2.3).
 *
 * Keys and ephemeral scalars come from the browser's cryptographic generator.
 * The steps of an encryption print in sequence; under reduced motion they
 * appear at once and the panel blinks instead.
 */

import { bytesToHex, utf8Bytes } from '../lib/bytes.js';
import { compress } from '../lib/secp256k1.js';
import { DecryptionError, TOY_KEY_BITS, decryptTrace, encryptTrace, generateKeyPair } from '../lib/toy-ecc-encryption.js';
import { bitDifference, eccEncryptionSteps, tamperCiphertext, wrongKey, xorRows } from './demo-model.js';
import { DURATION, EASE_OUT, announce, attachPanel, blink, esc, panelFrame, reducedMotion } from './motion.js';

const XOR_COLUMNS = 12;
const int = (v) => Number(v).toLocaleString('en-GB');

function body(message) {
  return (
    `<div class="demo-panel__controls">` +
    `<div class="demo__grid ecc-keys">` +
    `<div class="demo__cell"><span class="caption">Private key k, restricted to 1 … 2<sup>${TOY_KEY_BITS}</sup></span><span class="demo__value demo__value--num" data-ecc-out="k"></span></div>` +
    `<div class="demo__cell"><span class="caption">The same key, hexadecimal</span><span class="demo__value demo__value--mono" data-ecc-out="kHex"></span></div>` +
    `<div class="demo__cell demo__cell--wide"><span class="caption">Public key Q = kG, compressed</span><span class="demo__value demo__value--mono" data-ecc-out="Q"></span></div>` +
    `</div>` +
    `<div class="demo-panel__buttons"><button type="button" class="form-button" data-ecc-generate>Generate a new key pair</button></div>` +
    `<label class="text-field text-field--area">` +
    `<span class="caption">Message m, encoded in UTF-8</span>` +
    `<textarea data-ecc-message rows="2" maxlength="280" autocomplete="off" spellcheck="false" aria-describedby="ecc-message-note">${esc(message)}</textarea>` +
    `<span class="text-field__note" id="ecc-message-note" data-ecc-message-note></span>` +
    `</label>` +
    `<div class="demo-panel__buttons">` +
    `<button type="button" class="form-button" data-ecc-encrypt>Encrypt to Q</button>` +
    `<button type="button" class="form-button" data-ecc-decrypt disabled>Decrypt with k</button>` +
    `<button type="button" class="form-button" data-ecc-wrong disabled>Decrypt with a wrong key</button>` +
    `<button type="button" class="form-button" data-ecc-tamper disabled>Decrypt a tampered ciphertext</button>` +
    `</div>` +
    `</div>` +
    `<div class="ecc-output" data-ecc-output>` +
    `<p class="demo-panel__empty" data-ecc-empty>No message encrypted yet. Encrypt to see the steps of §2.2 with their values.</p>` +
    `<div data-ecc-encryption hidden>` +
    `<p class="caption ecc-output__title">Encryption, step by step</p>` +
    `<ol class="ecc-trace" data-ecc-trace></ol>` +
    `<p class="caption caption--math ecc-output__title">The exclusive or c = m ⊕ K, first bytes</p>` +
    `<div class="data-table--scroll ecc-xor" tabindex="0" role="region" aria-label="Exclusive or of the first message bytes with the keystream"><table class="data-table ecc-xor__table" data-ecc-xor></table></div>` +
    `<p class="demo__note ecc-compare" data-ecc-compare></p>` +
    `</div>` +
    `<div class="ecc-decryption" data-ecc-decryption hidden></div>` +
    `</div>`
  );
}

/** One step of the trace as a list item. */
function stepItem(step, index) {
  const value =
    step.id === 'keystream'
      ? step.blocks
          .map(
            (b) =>
              `<span class="ecc-trace__block"><span class="ecc-trace__counter">H(⟨${b.counter}⟩<sub>4</sub> ‖ KS ‖ comp(S))</span><span class="demo__value demo__value--mono">${b.hex}</span></span>`,
          )
          .join('')
      : `<span class="demo__value demo__value--mono">${step.value || '—'}</span>`;
  return (
    `<li class="ecc-trace__step" data-step="${step.id}">` +
    `<span class="ecc-trace__no">${index + 1}</span>` +
    `<span class="ecc-trace__body"><span class="caption ecc-trace__label">${step.label}</span>${value}</span>` +
    `</li>`
  );
}

function xorTable(rows, total) {
  const head = rows.map((r) => `<th scope="col" class="is-number">${r.index + 1}</th>`).join('');
  const line = (label, key, cls = '') =>
    `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th>${rows.map((r) => `<td class="is-number" data-col="${r.index}">${esc(r[key])}</td>`).join('')}</tr>`;
  const more = total > rows.length ? `<caption class="ecc-xor__caption">The first ${rows.length} of ${total} bytes.</caption>` : '';
  return (
    more +
    `<thead><tr><th scope="col">Byte</th>${head}</tr></thead>` +
    `<tbody>${line('Character', 'char')}${line('m', 'm')}${line('K', 'k')}${line('c = m ⊕ K', 'c', 'is-result')}</tbody>`
  );
}

/** Prints the steps one after the other, as a printer would; at once under reduced motion. */
function printInSequence(elements) {
  if (reducedMotion()) return;
  elements.forEach((el, i) => {
    el.animate(
      [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: DURATION.settle, delay: Math.min(i * 70, 560), easing: EASE_OUT, fill: 'backwards' },
    );
  });
}

/**
 * The exclusive or, byte by byte: each column of m and K prints from left to
 * right, and the ciphertext byte below appears a beat later, as their result.
 */
function revealColumns(table) {
  if (reducedMotion()) return;
  for (const cell of table.querySelectorAll('td[data-col]')) {
    const col = Number(cell.dataset.col);
    const isResult = cell.parentElement.classList.contains('is-result');
    cell.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION.state,
      delay: 260 + col * 36 + (isResult ? 110 : 0),
      easing: EASE_OUT,
      fill: 'backwards',
    });
  }
}

export function mountEccDemo(mount) {
  const message = mount.dataset.message || 'MEET ME AT THE OLD BRIDGE AT TEN';
  const { panel, $ } = panelFrame({
    id: 'demo-ecc',
    number: 1,
    title: 'Toy EC-ElGamal encryption on secp256k1, step by step',
    lede:
      'Generate a key pair, encrypt a message to its public key and follow each step of §2.2. Encrypt the same message twice to see the randomisation, then decrypt with the private key, with a wrong key, or after one bit of the ciphertext has been flipped.',
    body: body(message),
    provenance: `Private keys uniform on 1 … 2<sup>${TOY_KEY_BITS}</sup> and ephemeral scalars uniform on [1, n − 1], both from the browser’s cryptographic generator (crypto.getRandomValues): not seeded, so every run differs. Everything is computed in this page.`,
  });

  const text = $('[data-ecc-message]');
  const messageNote = $('[data-ecc-message-note]');
  const status = $('[data-status]');
  const out = (name) => $(`[data-ecc-out="${name}"]`);
  const buttons = {
    generate: $('[data-ecc-generate]'),
    encrypt: $('[data-ecc-encrypt]'),
    decrypt: $('[data-ecc-decrypt]'),
    wrong: $('[data-ecc-wrong]'),
    tamper: $('[data-ecc-tamper]'),
  };
  const encryptionBox = $('[data-ecc-encryption]');
  const decryptionBox = $('[data-ecc-decryption]');
  const empty = $('[data-ecc-empty]');

  let pair = null;
  let current = null; // { message, trace }
  let previous = null; // the previous encryption of the same message under the same key

  function setCiphertextButtons(enabled) {
    for (const b of [buttons.decrypt, buttons.wrong, buttons.tamper]) b.disabled = !enabled;
  }

  function newPair() {
    pair = generateKeyPair({ bits: TOY_KEY_BITS });
    out('k').textContent = int(pair.privateKey);
    out('kHex').textContent = pair.privateKey.toString(16);
    out('Q').textContent = pair.publicKeyHex;
    current = null;
    previous = null;
    encryptionBox.hidden = true;
    decryptionBox.hidden = true;
    empty.hidden = false;
    setCiphertextButtons(false);
  }

  function updateMessageNote() {
    const bytes = utf8Bytes(text.value).length;
    const blocks = Math.ceil(bytes / 32);
    messageNote.textContent = `${bytes} bytes; ${blocks} keystream block${blocks === 1 ? '' : 's'}; the ciphertext adds 65 bytes (33 of R, 32 of t).`;
  }

  function showEncryption() {
    const { trace, message: m } = current;
    const steps = eccEncryptionSteps(trace);
    const list = $('[data-ecc-trace]');
    list.innerHTML = steps.map(stepItem).join('');
    const bytes = utf8Bytes(m);
    const xor = $('[data-ecc-xor]');
    xor.innerHTML = xorTable(xorRows(bytes, trace.keystream, trace.cipherBytes, XOR_COLUMNS), bytes.length);
    const compare = $('[data-ecc-compare]');
    if (previous) {
      const a = previous.trace.ciphertext;
      const b = trace.ciphertext;
      const bits = 8 * trace.cipherBytes.length;
      compare.textContent =
        `Compared with the previous encryption of the same message to the same key: R ${a.R === b.R ? 'is the same' : 'differs'}, ` +
        `the tag ${a.tag === b.tag ? 'is the same' : 'differs'}, and c differs in ${int(bitDifference(a.c, b.c))} of its ${int(bits)} bits, ` +
        `against ${int(bits / 2)} expected of two independent keystreams.`;
    } else {
      compare.textContent = 'Encrypt the same message again: a fresh r gives a different R, an unrelated keystream and a different ciphertext.';
    }
    empty.hidden = true;
    encryptionBox.hidden = false;
    decryptionBox.hidden = true;
    printInSequence([...list.children]);
    revealColumns(xor);
    if (reducedMotion()) blink(encryptionBox);
  }

  function encryptNow() {
    const m = text.value;
    if (!current || current.message !== m) previous = null;
    else previous = current;
    current = { message: m, trace: encryptTrace(m, pair.publicKey) };
    setCiphertextButtons(true);
    showEncryption();
    announce(status, `Encrypted ${utf8Bytes(m).length} bytes. R = ${current.trace.ciphertext.R.slice(0, 16)}…; tag ${current.trace.ciphertext.tag.slice(0, 16)}….`);
  }

  function showDecryption({ title, key, ciphertext, explain }) {
    let html = `<p class="caption caption--math ecc-output__title">${title}</p>`;
    try {
      const d = decryptTrace(ciphertext, key);
      html +=
        `<div class="demo__grid">` +
        `<div class="demo__cell demo__cell--wide"><span class="caption">Shared point S′ = kR, compressed</span><span class="demo__value demo__value--mono">${bytesToHex(compress(d.S))}</span></div>` +
        `<div class="demo__cell"><span class="caption">Tag check</span><span class="demo__value">The recomputed tag matches t</span></div>` +
        `<div class="demo__cell"><span class="caption">Recovered message m = c ⊕ K′</span><span class="demo__value" data-ecc-recovered>${esc(d.message) || '—'}</span></div>` +
        `</div>`;
      announce(status, `Decrypted: ${d.message}`);
    } catch (error) {
      if (!(error instanceof DecryptionError)) throw error;
      html +=
        `<p class="demo-panel__error" role="alert">Rejected: the key-confirmation tag does not match. ${explain} ` +
        `The receiver learns only that the ciphertext is not valid for this key; no garbled message is released.</p>`;
      announce(status, 'Rejected: the key-confirmation tag does not match.');
    }
    decryptionBox.innerHTML = html;
    decryptionBox.hidden = false;
    if (reducedMotion()) blink(decryptionBox);
    else printInSequence([...decryptionBox.children]);
  }

  buttons.generate.addEventListener('click', () => {
    newPair();
    blink(panel.querySelector('.ecc-keys'));
    announce(status, `New key pair. Private key ${int(pair.privateKey)}; public key ${pair.publicKeyHex}.`);
  });
  buttons.encrypt.addEventListener('click', encryptNow);
  buttons.decrypt.addEventListener('click', () =>
    showDecryption({ title: 'Decryption with the private key k', key: pair.privateKey, ciphertext: current.trace.ciphertext, explain: '' }),
  );
  buttons.wrong.addEventListener('click', () => {
    const k = wrongKey(pair.privateKey, TOY_KEY_BITS);
    showDecryption({
      title: `Decryption with the wrong key k′ = ${int(k)}`,
      key: k,
      ciphertext: current.trace.ciphertext,
      explain: `With k′ = ${int(k)} instead of k = ${int(pair.privateKey)} the receiver computes S′ = k′R, a different point from S, and therefore a different tag.`,
    });
  });
  buttons.tamper.addEventListener('click', () => {
    const tampered = tamperCiphertext(current.trace.ciphertext);
    showDecryption({
      title: 'Decryption with k of the ciphertext with its first bit of c flipped',
      key: pair.privateKey,
      ciphertext: tampered,
      explain: 'The shared point is right, but the tag covers c, and c has changed in one bit.',
    });
  });
  text.addEventListener('input', updateMessageNote);

  newPair();
  updateMessageNote();
  attachPanel(mount, panel);
}

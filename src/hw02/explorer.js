/**
 * Figure 2, the live explorer. Reads a mnemonic, a passphrase, an account
 * and an address index, and recomputes every intermediate value of the
 * pipeline on the next animation frame (PBKDF2 takes a few milliseconds).
 * Everything runs in this page: nothing is sent over the network and nothing
 * is stored. The derived account is broadcast so that Figures 1, 3 and 6
 * redraw for the reader's phrase.
 *
 * "Flip one entropy bit" replaces the phrase by the one whose entropy differs
 * in a single bit and prints, for every stage, the number of bits that
 * changed next to the number expected of an independent uniform value: a
 * live reading of the avalanche effect.
 */

import { entropyToMnemonic } from '../lib/bip39.js';
import { bytesToHex } from '../lib/bytes.js';
import { ACCOUNT_EVENT, announce, blink } from './motion.js';
import { deriveLenient, flipEntropyBit, parseExplorerInput, pathOf, stageDistances } from './wallet.js';

const hex = (bytes) => bytesToHex(bytes);

function randomInt(n) {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** The avalanche table: one row per stage, the changed bits drawn against the expected half. */
function renderAvalanche(rows, bit) {
  const head = bit === null ? 'No bit flipped yet.' : `Entropy bit ${bit + 1} (counting from the most significant) flipped; the checksum was recomputed.`;
  const body = rows
    .map((r) => {
      const known = r.distance !== null && r.distance !== undefined;
      const share = known ? (100 * r.distance) / r.bits : 0;
      const tick = (100 * r.expected) / r.bits;
      return (
        `<tr data-avalanche-row="${r.key}">` +
        `<th scope="row">${r.label}</th>` +
        `<td class="is-number">${r.bits}</td>` +
        `<td class="is-number">${known ? r.distance : '—'}</td>` +
        `<td class="is-number">${Number.isInteger(r.expected) ? r.expected : r.expected.toFixed(1)}</td>` +
        `<td class="avalanche__cell" aria-hidden="true"><span class="avalanche__bar"><span class="avalanche__fill" style="width:${share.toFixed(2)}%"></span><span class="avalanche__tick" style="left:${tick.toFixed(2)}%"></span></span></td>` +
        `</tr>`
      );
    })
    .join('');
  return (
    `<p class="avalanche__head" data-avalanche-head>${head}</p>` +
    `<div class="data-table--scroll avalanche__frame"><table class="data-table avalanche">` +
    `<thead><tr><th scope="col">Stage</th><th scope="col" class="is-number">Bits</th><th scope="col" class="is-number">Changed</th><th scope="col" class="is-number">Expected</th><th scope="col"><span class="visually-hidden">Changed bits against the expected number</span></th></tr></thead>` +
    `<tbody>${body}</tbody></table></div>`
  );
}

const EMPTY_ROWS = [
  { key: 'entropy', label: 'Entropy', bits: 128, expected: 1 },
  { key: 'mnemonic', label: 'Word indices', bits: 132, expected: 3 },
  { key: 'seed', label: 'Seed', bits: 512, expected: 256 },
  { key: 'privateKey', label: 'Private key', bits: 256, expected: 128 },
  { key: 'publicKey', label: 'Public key x ‖ y', bits: 512, expected: 256 },
  { key: 'digest', label: 'Keccak-256 digest', bits: 256, expected: 128 },
  { key: 'address', label: 'Address', bits: 160, expected: 80 },
].map((r) => ({ ...r, distance: null }));

export function mountExplorer(figure) {
  const form = figure.querySelector('[data-explorer-form]');
  const output = figure.querySelector('[data-explorer-output]');
  if (!form || !output) throw new Error('Explorer: missing [data-explorer-form] or [data-explorer-output].');
  const $ = (selector) => figure.querySelector(selector);
  const fields = {
    mnemonic: $('[data-explorer-mnemonic]'),
    passphrase: $('[data-explorer-passphrase]'),
    account: $('[data-explorer-account]'),
    index: $('[data-explorer-index]'),
  };
  const note = $('[data-explorer-mnemonic-note]');
  const pathLine = $('[data-explorer-path]');
  const status = $('[data-explorer-status]');
  const avalanche = $('[data-explorer-avalanche]');
  const out = (key) => output.querySelector(`[data-explorer-out="${key}"]`);
  const caption = (key) => output.querySelector(`[data-explorer-caption="${key}"]`);

  let current = null; // the account on display (null until the first recomputation)
  let frame = 0;
  let announceTimer = 0;

  const example = () => ({ mnemonic: fields.mnemonic.defaultValue, passphrase: '', account: '0', index: '0' });
  const isExample = (p) => {
    const e = example();
    return p.mnemonic === e.mnemonic.trim() && p.passphrase === '' && p.account === 0 && p.index === 0;
  };

  function setInvalid(field) {
    for (const [name, el] of Object.entries(fields)) {
      if (el) el.setAttribute('aria-invalid', String(name === field));
    }
  }

  function showValues(a) {
    out('entropy').textContent = hex(a.entropy);
    caption('entropy').textContent = `Entropy (${a.entropyBits.length} bits)`;
    out('indices').textContent = a.wordIndices.join(' ');
    out('checksum').textContent = a.checksumValid ? a.checksumBits : `${a.checksumBits} (SHA-256 gives ${a.expectedChecksumBits})`;
    out('checksum').classList.toggle('is-warning', !a.checksumValid);
    out('seed').textContent = hex(a.seed);
    out('master').textContent = hex(a.master.privateKey);
    out('path').textContent = a.path;
    out('privateKey').textContent = hex(a.privateKey);
    out('publicKey').textContent = hex(a.publicKey);
    out('digest').textContent = hex(a.keccakDigest);
    out('address').textContent = a.address;
    out('checksummed').textContent = a.checksummed;
  }

  function showNote(text, kind) {
    note.textContent = text;
    note.dataset.kind = kind;
  }

  /** Recomputes from the form; returns the account, or null when the input is invalid. */
  function compute({ acknowledge = false } = {}) {
    frame = 0;
    const parsed = parseExplorerInput({
      mnemonic: fields.mnemonic.value,
      passphrase: fields.passphrase.value,
      account: fields.account.value,
      index: fields.index.value,
    });
    if (!parsed.ok) {
      setInvalid(parsed.field);
      output.classList.add('is-stale');
      if (parsed.field === 'mnemonic') {
        showNote(parsed.message, 'error');
        pathLine.textContent = 'The values below belong to the last valid input.';
      } else {
        showNote('', 'none');
        pathLine.textContent = parsed.message;
        pathLine.dataset.kind = 'error';
      }
      flip.disabled = parsed.field === 'mnemonic';
      return null;
    }
    setInvalid(null);
    output.classList.remove('is-stale');
    pathLine.dataset.kind = 'path';
    pathLine.textContent = `Path ${pathOf(parsed.account, parsed.index)}`;
    const a = deriveLenient(parsed.mnemonic, { passphrase: parsed.passphrase, account: parsed.account, index: parsed.index });
    if (a.checksumValid) {
      showNote(`${a.words.length} words; the ${a.checksumBits.length} checksum bits match SHA-256 of the entropy.`, 'ok');
    } else {
      showNote(
        `Checksum mismatch: the phrase carries the bits ${a.checksumBits}, but SHA-256 of its entropy begins ${a.expectedChecksumBits}. ` +
          'BIP-39 asks wallet software to warn about such a phrase; the seed can still be derived from it, and the values below are derived that way.',
        'warning',
      );
    }
    flip.disabled = false;
    showValues(a);
    current = a;
    if (acknowledge) blink(output);
    const source = isExample(parsed) ? 'example' : 'reader';
    document.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: { account: a, source } }));
    clearTimeout(announceTimer);
    announceTimer = setTimeout(
      () => announce(status, `${a.checksumValid ? '' : 'Checksum mismatch. '}Address ${a.checksummed} at ${a.path}.`),
      acknowledge ? 0 : 700,
    );
    return a;
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => compute());
  };
  for (const el of Object.values(fields)) el?.addEventListener('input', schedule);

  const generate = $('[data-explorer-generate]');
  const useExample = $('[data-explorer-example]');
  const flip = $('[data-explorer-flip]');

  generate?.addEventListener('click', () => {
    const entropy = new Uint8Array(16);
    globalThis.crypto.getRandomValues(entropy);
    fields.mnemonic.value = entropyToMnemonic(entropy);
    avalanche.innerHTML = renderAvalanche(EMPTY_ROWS, null);
    compute({ acknowledge: true });
  });

  useExample?.addEventListener('click', () => {
    const e = example();
    fields.mnemonic.value = e.mnemonic;
    fields.passphrase.value = e.passphrase;
    fields.account.value = e.account;
    fields.index.value = e.index;
    avalanche.innerHTML = renderAvalanche(EMPTY_ROWS, null);
    compute({ acknowledge: true });
  });

  flip?.addEventListener('click', () => {
    const before = current ?? compute();
    if (!before) return;
    const bit = randomInt(before.entropyBits.length);
    fields.mnemonic.value = flipEntropyBit(before.mnemonic, bit).mnemonic;
    const after = compute({ acknowledge: true });
    if (!after) return;
    const rows = stageDistances(before, after);
    avalanche.innerHTML = renderAvalanche(rows, bit);
    blink(avalanche);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    announce(
      status,
      `Entropy bit ${bit + 1} flipped. Changed bits: seed ${by.seed.distance} of 512, private key ${by.privateKey.distance} of 256, ` +
        `public key ${by.publicKey.distance} of 512, digest ${by.digest.distance} of 256, address ${by.address.distance} of 160; about half is expected.`,
    );
  });

  // The explorer starts on the worked example, already printed by the build.
  current = null;
  avalanche.innerHTML = renderAvalanche(EMPTY_ROWS, null);
  avalanche.hidden = false;
  pathLine.dataset.kind = 'path';
  pathLine.textContent = `Path ${pathOf(0, 0)}`;
  showNote('12 words; the 4 checksum bits match SHA-256 of the entropy.', 'ok');
  form.hidden = false;
  figure.classList.add('is-live');
  return { compute };
}

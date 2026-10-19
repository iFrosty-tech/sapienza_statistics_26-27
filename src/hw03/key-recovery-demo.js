/**
 * Panel 4 (§6): the attack on the restricted key space, live. The panel draws
 * a fresh key pair with the private key restricted to [1, 2^b], encrypts the
 * message of §2 to it, and runs brute force, baby-step giant-step or Pollard's
 * kangaroo in a Web Worker (src/hw03.worker.js), with live operations, elapsed
 * time and rate beside the expected number of operations. When the scalar is
 * found it decrypts the message without the private key. The second target,
 * a restricted ephemeral scalar, shows the design weakness of §6.3: the
 * private key has 254 bits, and the search recovers r from R instead.
 *
 * A search can be cancelled at any time: the worker is terminated. Every
 * finished run is entered in a log, so that the three methods can be compared
 * on the same key. Under reduced motion the progress rule fills without easing
 * and the found key is marked at once.
 */

import { encrypt, encryptTrace, generateKeyPair } from '../lib/toy-ecc-encryption.js';
import { KEY_RECOVERY_BITS, expectedOperations, formatDuration, formatRate, formulaHtml, parseRate } from './demo-model.js';
import { DURATION, EASE_OUT, announce, attachPanel, blink, choiceGroup, esc, panelFrame, reducedMotion } from './motion.js';

const METHOD_NAMES = { 'brute-force': 'Brute force', bsgs: 'Baby-step giant-step', kangaroo: "Pollard's kangaroo" };
const TARGET_NAMES = { key: 'Private key k', ephemeral: 'Ephemeral r' };
const int = (v) => (typeof v === 'bigint' ? v : Math.round(v)).toLocaleString('en-GB');
const LOG_ROWS = 8;

function bitsOptions(selected) {
  const out = [];
  for (let b = KEY_RECOVERY_BITS.min; b <= KEY_RECOVERY_BITS.max; b += 1) {
    out.push(`<option value="${b}"${b === selected ? ' selected' : ''}>${b} bits, ${int(2 ** b)} keys</option>`);
  }
  return out.join('');
}

function body() {
  return (
    `<div class="demo-panel__controls">` +
    choiceGroup({
      name: 'kr-target',
      legend: 'Target',
      options: [
        { value: 'key', label: 'Private key k, from Q' },
        { value: 'ephemeral', label: 'Restricted ephemeral r, from R' },
      ],
      checked: 'key',
    }) +
    choiceGroup({
      name: 'kr-method',
      legend: 'Attack',
      options: Object.entries(METHOD_NAMES).map(([value, label]) => ({ value, label })),
      checked: 'bsgs',
    }) +
    `<label class="text-field text-field--select kr-bits"><span class="caption">Size b of the restricted range [1, 2<sup>b</sup>]</span>` +
    `<select data-kr-bits aria-describedby="kr-forecast">${bitsOptions(KEY_RECOVERY_BITS.default)}</select></label>` +
    `<p class="text-field__note kr-forecast" id="kr-forecast" data-kr-forecast></p>` +
    `<div class="demo-panel__buttons">` +
    `<button type="button" class="form-button" data-kr-run>Run the attack</button>` +
    `<button type="button" class="form-button" data-kr-cancel disabled>Cancel</button>` +
    `<button type="button" class="form-button" data-kr-new>New key</button>` +
    `</div>` +
    `</div>` +
    `<div class="demo__grid">` +
    `<div class="demo__cell"><span class="caption" data-kr-secret-caption></span><span class="demo__value demo__value--num" data-kr-out="secret"></span></div>` +
    `<div class="demo__cell"><span class="caption">Known interval</span><span class="demo__value demo__value--num" data-kr-out="interval"></span></div>` +
    `<div class="demo__cell demo__cell--wide"><span class="caption" data-kr-point-caption></span><span class="demo__value demo__value--mono" data-kr-out="point"></span></div>` +
    `<div class="demo__cell demo__cell--wide"><span class="caption">Ciphertext of the message of §2, (R, c, t)</span><span class="demo__value demo__value--mono" data-kr-out="cipher"></span></div>` +
    `</div>` +
    `<div class="kr-track" data-kr-track>` +
    `<p class="caption kr-track__caption" data-kr-track-caption>Share of the interval searched</p>` +
    `<div class="kr-track__rule" aria-hidden="true">` +
    `<span class="kr-track__tick" style="left:0%"></span><span class="kr-track__tick" style="left:25%"></span><span class="kr-track__tick is-median" style="left:50%"></span><span class="kr-track__tick" style="left:75%"></span><span class="kr-track__tick" style="left:100%"></span>` +
    `<span class="kr-track__fill" data-kr-fill></span>` +
    `<span class="kr-track__mark" data-kr-mark hidden></span>` +
    `</div>` +
    `<div class="kr-track__labels" aria-hidden="true"><span>1</span><span data-kr-upper></span></div>` +
    `</div>` +
    `<dl class="pplot__stats pplot__stats--math kr-stats">` +
    `<div><dt>Operations</dt><dd data-kr-out="ops">0</dd></div>` +
    `<div><dt>Expected</dt><dd data-kr-out="expected"></dd></div>` +
    `<div><dt>Elapsed</dt><dd data-kr-out="elapsed">—</dd></div>` +
    `<div><dt>Rate</dt><dd data-kr-out="rate">—</dd></div>` +
    `</dl>` +
    `<div class="kr-result" data-kr-result hidden></div>` +
    `<div class="kr-log" data-kr-log hidden>` +
    `<p class="caption">Runs in this page</p>` +
    `<div class="data-table--scroll" tabindex="0" role="region" aria-label="Runs of the attacks in this page"><table class="data-table kr-log__table">` +
    `<thead><tr><th scope="col">Attack</th><th scope="col">Target</th><th scope="col" class="is-number">Bits</th><th scope="col" class="is-number">Operations</th><th scope="col" class="is-number">Expected</th><th scope="col" class="is-number">Time</th></tr></thead>` +
    `<tbody data-kr-log-body></tbody></table></div>` +
    `</div>`
  );
}

export function mountKeyRecoveryDemo(mount) {
  const message = mount.dataset.message || 'MEET ME AT THE OLD BRIDGE AT TEN';
  const buildRates = {
    'brute-force': parseRate(mount.dataset.rateBrute),
    bsgs: parseRate(mount.dataset.rateBsgs),
    kangaroo: parseRate(mount.dataset.rateKangaroo),
  };
  const { panel, $ } = panelFrame({
    id: 'demo-kr',
    number: 4,
    title: 'Recovering a restricted key in a background thread',
    lede:
      'Choose a target, an attack and the size of the restricted range, then run the attack on a freshly generated key. The search sees only public values; once the scalar is found, it decrypts the message of §2 without the private key. Run the three attacks on the same key to compare their costs.',
    body: body(),
    provenance:
      'Keys and the message’s ephemeral scalar from the browser’s cryptographic generator, fresh for every key; the kangaroo’s jump table is seeded with 1, as in the study. Rates depend on this device.',
  });

  const status = $('[data-status]');
  const out = (name) => $(`[data-kr-out="${name}"]`);
  const bitsSelect = $('[data-kr-bits]');
  const runButton = $('[data-kr-run]');
  const cancelButton = $('[data-kr-cancel]');
  const newButton = $('[data-kr-new]');
  const forecast = $('[data-kr-forecast]');
  const fill = $('[data-kr-fill]');
  const mark = $('[data-kr-mark]');
  const trackCaption = $('[data-kr-track-caption]');
  const result = $('[data-kr-result]');
  const log = $('[data-kr-log]');
  const logBody = $('[data-kr-log-body]');

  let worker = null;
  let running = null; // { id, job, startedAt }
  let nextId = 1;
  let target = null; // { kind, bits, pair, ciphertext, secret }
  const choice = (name) => panel.querySelector(`input[name="${name}"]:checked`).value;

  function setFill(fraction) {
    fill.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction ?? 0)).toFixed(4)})`;
  }

  function forecastText() {
    const method = choice('kr-method');
    const bits = Number(bitsSelect.value);
    const e = expectedOperations(method, bits);
    const rate = buildRates[method];
    const time = rate ? ` about ${formatDuration((1000 * e.value) / rate)} at the build machine’s ${int(rate)} operations per second` : '';
    let text = `${METHOD_NAMES[method]} on ${bits} bits: expected ${int(e.value)} operations, ${formulaHtml(e.formula)},${time}.`;
    if (method === 'brute-force' && bits > KEY_RECOVERY_BITS.bruteWarn) {
      text += ` Above ${KEY_RECOVERY_BITS.bruteWarn} bits brute force takes long; it can be cancelled at any time.`;
      forecast.dataset.kind = 'warning';
    } else {
      forecast.dataset.kind = 'none';
    }
    if (method === 'kangaroo') text += ' Its constant is larger than that of baby-step giant-step: the tame walk alone takes 4 · 2<sup>b/2</sup> jumps (§6.1).';
    forecast.innerHTML = text;
    out('expected').textContent = int(e.value);
  }

  function newTarget() {
    const kind = choice('kr-target');
    const bits = Number(bitsSelect.value);
    if (kind === 'key') {
      const pair = generateKeyPair({ bits });
      target = { kind, bits, pair, ciphertext: encrypt(message, pair.publicKey), secret: pair.privateKey };
    } else {
      const pair = generateKeyPair({ bits: 254 });
      const trace = encryptTrace(message, pair.publicKey, { ephemeralBits: bits });
      target = { kind, bits, pair, ciphertext: trace.ciphertext, secret: trace.ephemeral };
    }
    const c = target.ciphertext;
    $('[data-kr-secret-caption]').textContent = kind === 'key' ? 'Private key k, hidden from the attack' : 'Private key k';
    out('secret').textContent = kind === 'key' ? `${bits} bits, not shown until found` : '254 bits, beyond any search';
    out('interval').innerHTML = kind === 'key' ? `k ∈ [1, 2<sup>${bits}</sup>]` : `r ∈ [1, 2<sup>${bits}</sup>]`;
    $('[data-kr-point-caption]').textContent =
      kind === 'key' ? 'Public key Q = kG, the input of the attack' : 'Ephemeral point R = rG, the input of the attack';
    out('point').textContent = kind === 'key' ? target.pair.publicKeyHex : c.R;
    out('cipher').textContent = `R = ${c.R.slice(0, 18)}…, c = ${c.c.slice(0, 18)}…, t = ${c.tag.slice(0, 18)}…`;
    $('[data-kr-upper]').innerHTML = `2<sup>${bits}</sup>`;
    resetReadout();
  }

  function resetReadout() {
    setFill(0);
    mark.hidden = true;
    result.hidden = true;
    out('ops').textContent = '0';
    out('elapsed').textContent = '—';
    out('rate').textContent = '—';
    const method = choice('kr-method');
    trackCaption.textContent =
      method === 'kangaroo' ? 'The kangaroo walks; it does not scan the interval' : 'Share of the interval searched';
    forecastText();
  }

  function setRunning(on) {
    runButton.disabled = on;
    cancelButton.disabled = !on;
    newButton.disabled = on;
    bitsSelect.disabled = on;
    for (const input of panel.querySelectorAll('input[name="kr-target"], input[name="kr-method"]')) input.disabled = on;
    panel.classList.toggle('is-running', on);
  }

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('../hw03.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const { id, progress, result: r, error } = event.data;
      if (!running || id !== running.id) return;
      if (progress) onProgress(progress);
      else if (error) onError(error);
      else onResult(r);
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault?.();
      if (running) onError(event.message || 'the worker failed to start');
    });
    return worker;
  }

  function onProgress(p) {
    out('ops').textContent = int(p.operations);
    out('elapsed').textContent = formatDuration(p.elapsedMs);
    out('rate').textContent = formatRate(p.operations, p.elapsedMs);
    if (p.fraction !== null) setFill(p.fraction);
  }

  function onResult(r) {
    const job = running.job;
    running = null;
    setRunning(false);
    out('ops').textContent = int(r.operations);
    out('elapsed').textContent = formatDuration(r.elapsedMs);
    out('rate').textContent = formatRate(r.operations, r.elapsedMs);
    const expected = expectedOperations(job.method, job.bits).value;
    if (!r.found) {
      result.innerHTML = `<p class="demo-panel__error" role="alert">${METHOD_NAMES[job.method]} stopped after ${int(r.operations)} operations without finding the scalar. Run it again or choose another attack.</p>`;
      result.hidden = false;
      announce(status, 'The attack stopped without finding the scalar.');
      return;
    }
    const scalar = BigInt(r.k);
    const correct = scalar === target.secret;
    const position = Number(scalar) / 2 ** job.bits;
    if (job.method !== 'kangaroo') setFill(position);
    mark.style.left = `${(100 * position).toFixed(3)}%`;
    mark.hidden = false;
    if (reducedMotion()) blink(mark);
    else mark.animate([{ transform: 'translate(-50%, -14px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: DURATION.settle, easing: EASE_OUT });
    const name = job.kind === 'key' ? 'k' : 'r';
    const check = job.kind === 'key' ? 'kG = Q' : 'rG = R';
    const secretOut = out('secret');
    secretOut.textContent = job.kind === 'key' ? `${int(scalar)}, found` : '254 bits, still unknown';
    result.innerHTML =
      `<div class="demo__grid">` +
      `<div class="demo__cell"><span class="caption">Recovered ${name}</span><span class="demo__value demo__value--num">${int(scalar)}</span></div>` +
      `<div class="demo__cell"><span class="caption">Check</span><span class="demo__value">${check} holds${correct ? '' : ' (but differs from the generated value)'}</span></div>` +
      `<div class="demo__cell demo__cell--wide"><span class="caption">Message decrypted without the private key${job.kind === 'ephemeral' ? ', by S = rQ' : ', by S = kR'}</span><span class="demo__value">${esc(r.message ?? '—')}</span></div>` +
      `<div class="demo__cell demo__cell--wide"><span class="caption">Measured against expected</span><span class="demo__value">${int(r.operations)} operations against ${int(expected)} expected, ${formulaHtml(expectedOperations(job.method, job.bits).formula)}, in ${formatDuration(r.elapsedMs)}.</span></div>` +
      `</div>`;
    result.hidden = false;
    logRun(job, r, expected);
    announce(status, `${METHOD_NAMES[job.method]} found ${name} = ${scalar} after ${int(r.operations)} operations in ${formatDuration(r.elapsedMs)}. Decrypted message: ${r.message}.`);
  }

  function onError(message) {
    running = null;
    setRunning(false);
    stopWorker();
    result.innerHTML = `<p class="demo-panel__error" role="alert">The attack could not run: ${esc(message)}.</p>`;
    result.hidden = false;
    announce(status, `The attack could not run: ${message}.`);
  }

  function logRun(job, r, expected) {
    const row = document.createElement('tr');
    row.innerHTML =
      `<th scope="row">${METHOD_NAMES[job.method]}</th><td>${TARGET_NAMES[job.kind]}</td><td class="is-number">${job.bits}</td>` +
      `<td class="is-number">${int(r.operations)}</td><td class="is-number">${int(expected)}</td><td class="is-number">${formatDuration(r.elapsedMs)}</td>`;
    logBody.prepend(row);
    while (logBody.children.length > LOG_ROWS) logBody.lastElementChild.remove();
    log.hidden = false;
  }

  function run() {
    if (running) return;
    if (!target || target.kind !== choice('kr-target') || target.bits !== Number(bitsSelect.value)) newTarget();
    resetReadout();
    out('secret').textContent = target.kind === 'key' ? `${target.bits} bits, not shown until found` : '254 bits, beyond any search';
    const job = {
      kind: target.kind,
      method: choice('kr-method'),
      bits: target.bits,
      publicKey: target.pair.publicKeyHex,
      ciphertext: { ...target.ciphertext },
    };
    running = { id: nextId++, job, startedAt: performance.now() };
    setRunning(true);
    announce(status, `${METHOD_NAMES[job.method]} started on a ${job.bits}-bit range.`);
    try {
      getWorker().postMessage({ id: running.id, job });
    } catch (error) {
      onError(String(error?.message ?? error));
    }
  }

  function cancel() {
    if (!running) return;
    const ops = out('ops').textContent;
    running = null;
    stopWorker();
    setRunning(false);
    result.innerHTML = `<p class="demo__note">Cancelled after ${esc(ops)} operations. The key has not changed; run the attack again or choose another one.</p>`;
    result.hidden = false;
    announce(status, `Cancelled after ${ops} operations.`);
  }

  runButton.addEventListener('click', run);
  cancelButton.addEventListener('click', cancel);
  newButton.addEventListener('click', () => {
    newTarget();
    blink(panel.querySelector('.demo__grid'));
    announce(status, 'A new key was generated.');
  });
  bitsSelect.addEventListener('change', newTarget);
  for (const input of panel.querySelectorAll('input[name="kr-target"]')) input.addEventListener('change', newTarget);
  for (const input of panel.querySelectorAll('input[name="kr-method"]')) input.addEventListener('change', resetReadout);
  newTarget();
  attachPanel(mount, panel);
}

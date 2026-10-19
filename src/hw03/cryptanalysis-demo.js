/**
 * Panel 3 (§5): statistical cryptanalysis of the Caesar cipher, live. The
 * reader pastes a ciphertext, or encrypts one of a few public-domain sentences
 * under a random key, and chooses one of the five criteria of §5.2. The panel
 * ranks the 26 keys under that criterion, draws their rescaled scores, marks
 * the best key and, when the panel made the ciphertext, the true key, prints
 * the best decryption and warns when the text is too short to decide. The
 * best key under every criterion is printed beside the chart.
 *
 * The model of English is the training corpus of §5.1 (src/data/hw03/
 * browser-model.js), loaded with this panel only. On a change the points drop
 * onto their new scores; under reduced motion they move at once and blink.
 */

import { encrypt as caesarEncrypt } from '../lib/caesar.js';
import { METHOD_LABELS, METHODS, SCORE_LABELS, models, recoverWith } from '../data/hw03/browser-model.js';
import { SAMPLE_SENTENCES, evidenceNote, rankingView } from './demo-model.js';
import { DURATION, EASE_OUT, announce, attachPanel, blink, choiceGroup, esc, panelFrame, reducedMotion } from './motion.js';

const NS = 'http://www.w3.org/2000/svg';
const TOP_ROWS = 5;

function randomInt(n) {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

function formatScore(method, score) {
  if (method === 'exhaustive') return `${(100 * score).toFixed(0)}%`;
  if (method === 'chi-square') return score.toFixed(1);
  return score.toFixed(1).replace('-', '−');
}

const rankText = (r) => (Number.isInteger(r) ? String(r) : r.toFixed(1));

function body() {
  return (
    `<div class="demo-panel__controls">` +
    `<label class="text-field text-field--area">` +
    `<span class="caption">Ciphertext</span>` +
    `<textarea data-crypt-text rows="3" maxlength="2000" autocomplete="off" spellcheck="false" aria-describedby="crypt-source"></textarea>` +
    `<span class="text-field__note" id="crypt-source" data-crypt-source></span>` +
    `</label>` +
    `<div class="demo-panel__buttons"><button type="button" class="form-button" data-crypt-sample>Encrypt a random sample</button></div>` +
    choiceGroup({
      name: 'crypt-method',
      legend: 'Criterion',
      options: METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] })),
      checked: 'bigram',
    }) +
    `</div>` +
    `<div class="crypt-chart" data-crypt-chart></div>` +
    `<p class="demo-panel__warning" data-crypt-warning hidden></p>` +
    `<div class="demo__grid">` +
    `<div class="demo__cell demo__cell--wide"><span class="caption" data-crypt-best-caption>Best decryption</span><span class="demo__value" data-crypt-best></span></div>` +
    `</div>` +
    `<dl class="crypt-methods" data-crypt-methods></dl>` +
    `<div class="data-table--scroll" tabindex="0" role="region" aria-label="The five best keys under the chosen criterion"><table class="data-table crypt-table" data-crypt-table></table></div>`
  );
}

/** The ranking chart: one stem and point per key, at its rescaled score; the best key larger, the true key ringed. */
function drawChart(container, view, method, previous) {
  const width = Math.max(280, Math.round(container.clientWidth || 640));
  const height = width < 480 ? 210 : 240;
  const m = { top: 46, right: 10, bottom: 38, left: 34 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const band = plotW / 26;
  const x = (key) => m.left + band * (key + 0.5);
  const y = (share) => m.top + plotH * (1 - share);
  const every = band < 17 ? 2 : 1;
  // The best and the true key are always labelled; on a narrow chart their neighbours give way.
  const forced = new Set(view.byKey.filter((r) => r.isBest || r.isTrue).map((r) => r.key));
  const labelled = (key) =>
    forced.has(key) || (key % every === 0 && !(every > 1 && (forced.has(key - 1) || forced.has(key + 1))));
  const parts = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    parts.push(`<line class="chart__ruling${t === 0 || t === 1 ? ' is-major' : ''}" x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}" />`);
    parts.push(`<text class="chart__ylabel" x="${m.left - 6}" y="${y(t) + 4}" text-anchor="end">${t === 0 ? '0' : t === 1 ? '1' : t.toFixed(2).replace(/^0/, '')}</text>`);
  }
  parts.push(`<text class="chart__axis-title" x="0" y="12">${esc(SCORE_LABELS[method])}; rescaled, best = 1</text>`);
  for (const r of view.byKey) {
    const cx = x(r.key);
    const cy = y(r.share);
    const h = Math.max(0, y(0) - cy);
    const label = labelled(r.key);
    parts.push(
      `<g class="rank-key${r.isBest ? ' is-best' : ''}${r.isTrue ? ' is-true' : ''}" data-key="${r.key}" data-y="${cy}">` +
        `<rect class="rank-key__stem" x="${cx - 0.5}" y="${cy}" width="1" height="${h}" />` +
        (r.isTrue ? `<circle class="rank-key__true" cx="${cx}" cy="${cy}" r="${r.isBest ? 9 : 7}" />` : '') +
        `<circle class="chart__point rank-key__point" cx="${cx}" cy="${cy}" r="${r.isBest ? 5 : 3.25}" />` +
        (label ? `<text class="chart__xlabel${r.isBest ? ' is-best' : ''}" x="${cx}" y="${y(0) + 16}" text-anchor="middle">${r.key}</text>` : '') +
        `</g>`,
    );
  }
  const best = view.byKey.find((r) => r.key === view.bestKey);
  if (best) {
    const bx = Math.min(Math.max(x(best.key), m.left + 30), width - m.right - 30);
    parts.push(`<text class="rank-chart__label" x="${bx}" y="${y(1) - 14}" text-anchor="middle">best ${best.key}</text>`);
  }
  const truth = view.byKey.find((r) => r.isTrue);
  if (truth && !truth.isBest) {
    const tx = Math.min(Math.max(x(truth.key), m.left + 30), width - m.right - 30);
    parts.push(`<text class="rank-chart__label rank-chart__label--true" x="${tx}" y="${Math.max(m.top + 2, y(truth.share) - 13)}" text-anchor="middle">true ${truth.key}</text>`);
  }
  parts.push(`<text class="chart__axis-title" x="${m.left + plotW / 2}" y="${height - 4}" text-anchor="middle">Candidate key κ</text>`);
  const title = view.informative
    ? `Rescaled ${METHOD_LABELS[method]} of the 26 keys; best key ${view.bestKey}${view.trueRank !== null ? `, true key ranked ${rankText(view.trueRank)}` : ''}.`
    : `${METHOD_LABELS[method]}: every key ties.`;
  container.innerHTML = `<svg class="pplot__svg rank-chart" xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">${parts.join('')}</svg>`;

  // The points drop from their previous scores onto the new ones.
  if (!previous || reducedMotion()) return;
  for (const g of container.querySelectorAll('.rank-key')) {
    const before = previous.get(Number(g.dataset.key));
    const now = Number(g.dataset.y);
    if (before === undefined || Math.abs(before - now) < 0.5) continue;
    const options = { duration: DURATION.settle, easing: EASE_OUT };
    g.querySelector('.rank-key__point').animate([{ transform: `translateY(${before - now}px)` }, { transform: 'none' }], options);
    g.querySelector('.rank-key__true')?.animate([{ transform: `translateY(${before - now}px)` }, { transform: 'none' }], options);
    const h = y(0) - now;
    if (h > 0.5) {
      g.querySelector('.rank-key__stem').animate([{ transform: `scaleY(${Math.max(0, (y(0) - before) / h)})` }, { transform: 'none' }], options);
    }
  }
}

export function mountCryptanalysisDemo(mount) {
  const { panel, $ } = panelFrame({
    id: 'demo-crypt',
    number: 3,
    title: 'Ranking the 26 Caesar keys',
    lede:
      'Paste any Caesar ciphertext, or encrypt a sample sentence under a random key, and choose a criterion. Every key is tried; the chart shows how far each candidate decryption looks like English, rescaled so that the best key scores 1 and the worst 0.',
    body: body(),
    provenance: `English model: letter, bigram and trigram counts and the ${models.words.toLocaleString('en-GB')} commonest words of the six training novels of §5.1 (${models.trainingLetters.toLocaleString('en-GB')} letters); random keys from the browser’s cryptographic generator.`,
  });

  const text = $('[data-crypt-text]');
  const source = $('[data-crypt-source]');
  const chart = $('[data-crypt-chart]');
  const warning = $('[data-crypt-warning]');
  const best = $('[data-crypt-best]');
  const bestCaption = $('[data-crypt-best-caption]');
  const methodsList = $('[data-crypt-methods]');
  const table = $('[data-crypt-table]');
  const status = $('[data-status]');

  let sample = null; // { ciphertext, key, index }
  let method = 'bigram';
  let previousY = null;
  let frame = 0;
  let announceTimer = 0;

  const trueKey = () => (sample && text.value === sample.ciphertext ? sample.key : null);

  function newSample() {
    let index = randomInt(SAMPLE_SENTENCES.length);
    if (sample && SAMPLE_SENTENCES.length > 1 && index === sample.index) index = (index + 1) % SAMPLE_SENTENCES.length;
    const key = 1 + randomInt(25);
    const s = SAMPLE_SENTENCES[index];
    sample = { index, key, ciphertext: caesarEncrypt(s.text, key), source: s.source };
    text.value = sample.ciphertext;
  }

  function render({ acknowledge = false } = {}) {
    frame = 0;
    const ciphertext = text.value;
    const truth = trueKey();
    source.textContent =
      truth !== null
        ? `Sample: ${sample.source}, encrypted under the key ${truth}, ringed in the chart.`
        : 'Your own ciphertext: the true key is unknown to the panel.';
    const all = Object.fromEntries(METHODS.map((m) => [m, rankingView(recoverWith(m, ciphertext), { trueKey: truth })]));
    const view = all[method];

    drawChart(chart, view, method, previousY);
    previousY = new Map([...chart.querySelectorAll('.rank-key')].map((g) => [Number(g.dataset.key), Number(g.dataset.y)]));
    if (acknowledge && reducedMotion()) blink(chart);

    const note = evidenceNote({ letters: view.letters, informative: view.informative, method });
    warning.hidden = !note;
    warning.textContent = note ?? '';

    bestCaption.textContent = view.informative
      ? `Best decryption, key ${view.bestKey}${view.topTies > 1 ? ` (tied with ${view.topTies - 1} other key${view.topTies > 2 ? 's' : ''})` : ''}`
      : 'Best decryption: none, every key ties';
    best.textContent = view.informative ? caesarEncrypt(ciphertext, 26 - view.bestKey) || '—' : '—';

    methodsList.innerHTML = METHODS.map((m) => {
      const v = all[m];
      const value = v.informative ? `Key ${v.bestKey}` : 'Tie';
      const rank = v.trueRank !== null ? `<span class="crypt-methods__rank">true key ranked ${rankText(v.trueRank)}</span>` : '';
      return `<div class="${m === method ? 'is-selected' : ''}"><dt>${METHOD_LABELS[m]}</dt><dd>${value}${rank}</dd></div>`;
    }).join('');

    const rows = view.rows.slice(0, TOP_ROWS);
    table.innerHTML =
      `<thead><tr><th scope="col" class="is-number">Rank</th><th scope="col" class="is-number">Key</th><th scope="col" class="is-number">Score</th><th scope="col">Candidate decryption</th></tr></thead>` +
      `<tbody>${rows
        .map((r) => {
          const plain = caesarEncrypt(ciphertext, (26 - r.key) % 26);
          const preview = plain.length > 48 ? `${plain.slice(0, 48)}…` : plain;
          return (
            `<tr class="${r.isTrue ? 'is-true' : ''}"><td class="is-number">${rankText(r.rank)}</td><td class="is-number">${r.isTrue ? '<span class="crypt-table__tag">True</span>' : ''}${r.key}</td>` +
            `<td class="is-number">${formatScore(method, r.score)}</td><td class="crypt-table__plain">${esc(preview)}</td></tr>`
          );
        })
        .join('')}</tbody>`;

    clearTimeout(announceTimer);
    announceTimer = setTimeout(
      () =>
        announce(
          status,
          view.informative
            ? `${METHOD_LABELS[method]}: best key ${view.bestKey}${truth !== null ? `; the true key ${truth} ranks ${rankText(view.trueRank)}` : ''}.${note ? ` ${note}` : ''}`
            : `${METHOD_LABELS[method]}: ${note}`,
        ),
      acknowledge ? 0 : 700,
    );
  }

  text.addEventListener('input', () => {
    if (!frame) frame = requestAnimationFrame(() => render());
  });
  $('[data-crypt-sample]').addEventListener('click', () => {
    newSample();
    render({ acknowledge: true });
  });
  for (const input of panel.querySelectorAll('input[name="crypt-method"]')) {
    input.addEventListener('change', () => {
      method = input.value;
      render({ acknowledge: true });
    });
  }
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = Math.round(chart.clientWidth);
    if (w && Math.abs(w - lastWidth) > 8) {
      lastWidth = w;
      previousY = null;
      render();
    }
  }).observe(chart);

  newSample();
  attachPanel(mount, panel);
  render();
}

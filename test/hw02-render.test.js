/**
 * Homework 02 figures: structure of the static renderers (element counts,
 * accessible names, the worked example) and the token names the page uses.
 * The visual judgement belongs to the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveEthereumAccount, checksumBreakdown } from '../src/lib/ethereum.js';
import {
  addressCase,
  checksumAcceptance,
  checksumErrorDetection,
  entropyLedger,
  pipelineSample,
  substitutionDetection,
  vanitySearch,
} from '../src/lib/wallet-study.js';
import { keccakDiffusion, keccakDiffusionTrace } from '../src/lib/keccak-diffusion.js';
import {
  SERIES_KINDS,
  compactData,
  formatP,
  formatSci,
  hdTreeModel,
  renderBip39Grouping,
  renderChart,
  renderDigestTable,
  renderEip55Breakdown,
  renderHdTree,
  renderKeccakLattice,
  renderPipelineLedger,
  renderSeries,
  renderTimeline,
  seriesOf,
  statsOf,
} from '../src/hw02/render.js';
import { TIMELINE } from '../src/hw02/timeline.js';
import { EXAMPLE, computeExample, exampleTokens } from '../homework/02/figures.js';

const count = (html, needle) => html.split(needle).length - 1;
const example = computeExample();

test('the worked example reproduces the published Hardhat account #0', () => {
  assert.equal(example.account.checksummed, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(EXAMPLE.mnemonic, 'test test test test test test test test test test test junk');
  assert.equal(example.siblings.length, 3);
});

test('every {{fig.example.*}} and {{fig.digests.*}} token of the page is provided', () => {
  const tokens = exampleTokens(example);
  for (const value of Object.values(tokens)) assert.equal(typeof value, 'string');
  const page = readFileSync(new URL('../homework/02/index.html', import.meta.url), 'utf8');
  const used = [...page.matchAll(/\{\{\s*fig\.((?:example|digests)\.[\w.]+)\s*\}\}/g)].map((m) => m[1]);
  assert.ok(used.length > 10, 'the page quotes the worked example');
  for (const key of used) assert.ok(key in tokens, `missing token fig.${key}`);
  assert.equal(tokens['example.address'], '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  assert.equal(tokens['example.privateKey'], 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  assert.equal(tokens['digests.keccak256'], 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(tokens['digests.sha3_256'], 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
});

test('the pipeline ledger prints eight stages, each with its operation class and value', () => {
  const html = renderPipelineLedger(example.account);
  assert.equal(count(html, 'class="ledger__stage"'), 8);
  assert.equal(count(html, 'class="ledger__class"'), 8);
  assert.ok(html.includes('data-pipeline-stage="checksummed"'));
  assert.ok(html.includes('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'));
  assert.ok(html.includes('key stretching'));
});

test('the BIP-39 grouping shows 12 words of 11 bits and the 4 checksum bits', () => {
  const html = renderBip39Grouping(example.account);
  assert.equal(count(html, 'class="bip39__word"'), 12);
  assert.equal(count(html, 'class="bip39__cs"'), 1, 'the checksum bits sit in the last word');
  assert.ok(html.includes('>1010<'), 'checksum bits of the example');
  assert.ok(html.includes('>junk<') && html.includes('>1788<'));
});

test('the HD tree draws hardened edges as double rules and normal edges as single rules', () => {
  const model = hdTreeModel(example);
  const svg = renderHdTree(model, { id: 'hd' });
  assert.ok(svg.startsWith('<svg'));
  assert.equal(count(svg, 'data-edge="hardened"'), 3);
  assert.equal(count(svg, 'data-edge="normal"'), 4);
  assert.equal(count(svg, 'class="hdtree__rule"'), 3 * 2 + 4);
  assert.equal(count(svg, 'class="hdtree__node'), 8);
  assert.ok(svg.includes("m/44'/60'/0'/0/2"));
});

test('the Keccak lattice draws all 1600 bits and marks the differing ones', () => {
  const trace = keccakDiffusionTrace(1601);
  const step = trace.steps.find((s) => s.label === 'R2 θ');
  const svg = renderKeccakLattice({ mask: step.mask, label: step.label, count: step.count }, { id: 'k' });
  const dots = (cls) => {
    const d = svg.match(new RegExp(`class="${cls}" d="([^"]*)"`))?.[1] ?? '';
    return count(d, 'h0');
  };
  assert.equal(dots('lattice__bit'), 1600 - step.count);
  assert.equal(dots('lattice__bit is-different'), step.count);
});

test('the EIP-55 breakdown has 40 characters and marks the upper-case letters', () => {
  const b = checksumBreakdown(example.account.address);
  const html = renderEip55Breakdown(b);
  assert.equal(count(html, 'class="eip55__char"'), 40);
  assert.equal(count(html, 'data-case="upper"'), b.characters.filter((c) => c.upper).length);
  assert.equal(count(html, 'data-case="lower"'), b.characters.filter((c) => c.isLetter && !c.upper).length);
});

test('the timeline prints every event in chronological order with draft and final dates', () => {
  const svg = renderTimeline(TIMELINE, { id: 't' });
  assert.equal(count(svg, 'class="timeline__event"'), TIMELINE.length);
  const paired = TIMELINE.filter((e) => e.first).length;
  assert.ok(paired >= 3, 'RSA, SHA-2 and SHA-3 carry two dates');
  assert.equal(count(svg, 'class="timeline__mark is-first"'), paired);
  const keys = TIMELINE.map((e) => e.first?.date ?? e.date);
  assert.deepEqual([...keys].sort(), keys, 'events are sorted by their first date');
});

test('the digest table prints four digests of the same input', () => {
  const html = renderDigestTable({ input: '', rows: [
    { name: 'SHA-256', bits: 256, hex: 'e3b0' },
    { name: 'SHA-512', bits: 512, hex: 'cf83' },
    { name: 'Keccak-256', bits: 256, hex: 'c5d2' },
    { name: 'SHA3-256', bits: 256, hex: 'a7ff' },
  ] });
  assert.equal(count(html, 'class="digests__row"'), 4);
  assert.ok(html.includes('Keccak-256') && html.includes('a7ff'));
});

test('chart kinds render valid SVG for real experiment results', () => {
  const pipeline = pipelineSample({ seed: 1, n: 3 });
  const vanity = vanitySearch({ seed: 1, prefixNibbles: 1, searches: 10 });
  const cases = addressCase({ seed: 1, n: 200, realAddresses: pipeline.addresses });
  const diffusion = keccakDiffusion({ seed: 1, n: 30 });
  const errors = checksumErrorDetection({ seed: 1, n: 500, caseFlipAddresses: 2 });
  const results = {
    ledger: entropyLedger(),
    acceptance: { w12: checksumAcceptance({ seed: 1, n: 2000, words: 12 }), w24: checksumAcceptance({ seed: 1, n: 2000, words: 24 }) },
    substitution: { w12: substitutionDetection({ seed: 1, n: 2000, words: 12 }), w24: substitutionDetection({ seed: 1, n: 2000, words: 24 }) },
    pipeline,
    vanity: { k1: vanity, k2: vanity },
    addressCase: cases,
    diffusion,
    errors,
  };
  for (const kind of SERIES_KINDS) {
    const series = seriesOf(kind, results);
    assert.ok(Object.keys(series).length >= 1, kind);
    for (const [key, data] of Object.entries(series)) {
      const html = renderChart(kind, data, { id: `${kind}-${key}`, width: 640 });
      assert.ok(html.includes('<svg'), `${kind}/${key} renders SVG`);
      assert.equal(count(html, '<svg'), count(html, '</svg>'));
      assert.ok(!html.includes('NaN'), `${kind}/${key} has no NaN coordinates`);
      const stats = statsOf(kind, data);
      for (const v of Object.values(stats)) assert.equal(typeof v, 'string', `${kind}/${key} stats are strings`);
      const compact = compactData(kind, data);
      if (compact) assert.ok(renderChart(kind, compact, { id: 'c', width: 400 }).includes('<svg'), `${kind}/${key} redraws from compact data`);
    }
  }
  const stages = seriesOf('stages', results);
  assert.deepEqual(Object.keys(stages).sort(), [
    'address.avalanche', 'address.sibling', 'address.weight',
    'privateKey.avalanche', 'privateKey.sibling', 'privateKey.weight',
    'publicKeyX.avalanche', 'publicKeyX.weight',
    'seed.avalanche', 'seed.weight',
  ]);
  const hidden = renderSeries('stages', stages['seed.weight'], { id: 's', series: 'seed.weight', hidden: true });
  assert.ok(hidden.includes('hidden') && hidden.includes('data-fig-data') && !hidden.includes('<svg'), 'hidden series ship data only');
});

test('number formats', () => {
  assert.equal(formatP(0.0004), '< 0.001');
  assert.equal(formatP(0.4321), '0.432');
  assert.equal(formatSci(8.4e28, 2), '8.4 × 10²⁸');
  assert.equal(formatSci(3.42e-25, 3), '3.42 × 10⁻²⁵');
  assert.equal(formatSci(64.2, 3), '64.2');
});

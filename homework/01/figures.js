/**
 * Build-time figure provider of homework 01 (called by src/build/site-plugin.js).
 *
 * Runs every experiment of the homework with fixed seeds and page-scale
 * sample sizes, renders the figures and returns their HTML together with the
 * statistics quoted in the text as {{fig.…}} tokens. The experiment results
 * are cached under node_modules/.cache/hw01/, keyed by the parameters and by
 * the source of the libraries they depend on, so a dev reload is instant and
 * a change to the code recomputes everything.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePng, pngDataUrl } from '../../src/lib/png.js';
import { sha256Hex } from '../../src/lib/sha256.js';
import { utf8Bytes } from '../../src/lib/bytes.js';
import { formatNumber } from '../../src/lib/probability-plot.js';
import { attackerSuccessProbability } from '../../src/lib/stats.js';
import * as study from '../../src/lib/ec-hash-study.js';
import { SERIES, SERIES_KINDS, renderChart, renderSeries, renderStatsScript, statsOf } from '../../src/hw01/render.js';
import { PRESET, construct, describe, renderGroupLawSVG } from '../../src/hw01/group-law.js';
import { computeDemo, renderDemoOutput } from '../../src/hw01/demo.js';

/** Every number the page quotes follows from these parameters. */
export const PARAMS = Object.freeze({
  version: 1,
  seeds: { pool: 20261008, avalanche: 20261009, sac: 20261010, ecdlp: 7 },
  n: 4000, // digests in the shared pool (E1, E2, E3, E7 and the collision pool E6)
  avalanchePairs: 4000, // message pairs in E4
  sacTrials: 48, // messages per input bit in E5 (48 × 257 hashes per hash function)
  collisionBits: [12, 16, 20, 24],
  curveBits: 16,
  subsets: 400, // random subsets per sample size on the collision curve
  smallCurvePrime: 199,
  ecdlpExponents: [7, 8, 9, 10, 11, 12, 13, 14],
  challenges: 5,
  nakamoto: { qs: [0.1, 0.2, 0.3, 0.45], zMax: 50, markZ: 6 },
  demoMessage: 'statistics',
  demoFlipIndex: 0,
});

const DEPENDENCIES = [
  'src/lib/ec-hash-study.js',
  'src/lib/stats.js',
  'src/lib/ec-hash.js',
  'src/lib/secp256k1.js',
  'src/lib/sha256.js',
  'src/lib/bytes.js',
  'src/lib/random.js',
  'src/lib/normal.js',
];

const EXPERIMENTS = {
  bitFrequency: (variant) => study.bitFrequency({ variant, n: PARAMS.n, seed: PARAMS.seeds.pool }),
  byteFrequency: (variant) => study.byteFrequency({ variant, n: PARAMS.n, seed: PARAMS.seeds.pool }),
  hammingWeight: (variant) => study.hammingWeights({ variant, n: PARAMS.n, seed: PARAMS.seeds.pool }),
  avalanche: (variant) => study.avalanche({ variant, n: PARAMS.avalanchePairs, seed: PARAMS.seeds.avalanche }),
  sac: (variant) => study.sacMatrix({ variant, trials: PARAMS.sacTrials, seed: PARAMS.seeds.sac }),
  runs: (variant) => study.runsAndIndependence({ variant, n: PARAMS.n, seed: PARAMS.seeds.pool }),
  collisions: (variant) =>
    study.birthdayCollisions({
      variant,
      n: PARAMS.n,
      seed: PARAMS.seeds.pool,
      bits: PARAMS.collisionBits,
      curveBits: PARAMS.curveBits,
      subsets: PARAMS.subsets,
    }),
};

function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
  return true;
}

function nextPrime(n) {
  let p = n;
  while (!isPrime(p)) p += 1;
  return p;
}

/** Hashes per second of each function on 32-byte messages (one short timed run). */
function measureSpeed() {
  const speed = {};
  for (const name of SERIES) {
    const h = study.hashFunction(name);
    const messages = study.randomMessages({ n: 1000, seed: 1 });
    h(messages[0]); // warm up: builds the generator tables
    const t0 = performance.now();
    for (const m of messages) h(m);
    speed[name] = Math.round(1000 / ((performance.now() - t0) / 1000));
  }
  return speed;
}

function computeAll() {
  const series = {};
  for (const variant of SERIES) {
    series[variant] = {};
    for (const [kind, run] of Object.entries(EXPERIMENTS)) series[variant][kind] = run(variant);
  }
  const primes = PARAMS.ecdlpExponents.map((k) => BigInt(nextPrime(2 ** k)));
  const ecdlp = study.ecdlpCostGrowth({ primes, challenges: PARAMS.challenges, seed: PARAMS.seeds.ecdlp });
  return { series, ecdlp, speed: measureSpeed() };
}

let memo = null;

function loadOrCompute(root) {
  const source = DEPENDENCIES.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');
  const key = sha256Hex(utf8Bytes(JSON.stringify(PARAMS) + source)).slice(0, 16);
  if (memo?.key === key) return memo.value;
  const dir = resolve(root, 'node_modules/.cache/hw01');
  const file = resolve(dir, `${key}.json`);
  let value;
  if (existsSync(file)) {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    const t0 = performance.now();
    const results = computeAll();
    const ms = performance.now() - t0;
    value = { computedAt: new Date().toISOString(), ms, results };
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    console.log(`[hw01] experiments computed in ${(ms / 1000).toFixed(1)} s, cached in node_modules/.cache/hw01/${key}.json`);
  }
  memo = { key, value };
  return value;
}

const rasterize = ({ width, height, rgba }) => pngDataUrl(encodePng({ width, height, rgba }));

const percent = (p) => (p >= 0.1 ? `${(100 * p).toFixed(1)}%` : p >= 1e-9 ? `${(100 * p).toPrecision(2)}%` : '< 1e-7%');

/**
 * @param {{ base: string, site: object, entry: object, isBuild: boolean, root: string }} context
 * @returns {Promise<{ html: Record<string, string>, tokens: Record<string, string> }>}
 */
export default async function provide({ root }) {
  const { results, ms, computedAt } = loadOrCompute(root);
  const html = {};
  const tokens = {};
  const token = (key, value) => {
    tokens[key] = String(value);
  };

  // Experiment figures: one series per hash function, the scalar variant visible.
  for (const kind of SERIES_KINDS) {
    const statsBySeries = {};
    const parts = SERIES.map((variant) => {
      const data = results.series[variant][kind];
      statsBySeries[variant] = statsOf(kind, data);
      for (const [k, v] of Object.entries(statsBySeries[variant])) token(`${kind}.${variant}.${k}`, v);
      return renderSeries(kind, data, { id: `${kind}-${variant}`, series: variant, hidden: variant !== 'scalar', rasterize });
    });
    html[kind] = parts.join('') + renderStatsScript(statsBySeries);
  }

  // Parameters and provenance.
  token('params.n', PARAMS.n);
  token('params.avalanchePairs', PARAMS.avalanchePairs);
  token('params.sacTrials', PARAMS.sacTrials);
  token('params.sacHashes', PARAMS.sacTrials * 257);
  token('params.subsets', PARAMS.subsets);
  token('params.seedPool', PARAMS.seeds.pool);
  token('params.seedAvalanche', PARAMS.seeds.avalanche);
  token('params.seedSac', PARAMS.seeds.sac);
  token('params.seedEcdlp', PARAMS.seeds.ecdlp);
  token('params.computeSeconds', (ms / 1000).toFixed(1));
  token('params.computedAt', computedAt.slice(0, 10));
  for (const name of SERIES) token(`speed.${name}`, results.speed[name].toLocaleString('en-GB'));
  token('speed.ratio', Math.round(results.speed.sha256 / results.speed.scalar));

  // E8: the cost of the discrete logarithm.
  const rows = results.ecdlp;
  const marks = [
    { x: 2 ** 112, y: 2 ** 56, label: '112-bit record (2009)' },
    { x: 2 ** 256, y: 2 ** 128, label: 'secp256k1: √n ≈ 2^128' },
  ];
  html.ecdlp = renderChart('ecdlp', { rows, marks }, { id: 'ecdlp' });
  token('ecdlp.curves', rows.length);
  token('ecdlp.smallestPrime', rows[0].p);
  token('ecdlp.largestPrime', rows.at(-1).p);
  token('ecdlp.largestOrder', rows.at(-1).baseOrder.toLocaleString('en-GB'));
  token('ecdlp.largestBsgs', Math.round(rows.at(-1).meanBsgsSteps).toLocaleString('en-GB'));
  token('ecdlp.largestBrute', Math.round(rows.at(-1).meanBruteForceSteps).toLocaleString('en-GB'));
  token('ecdlp.largestSqrt', Math.round(rows.at(-1).sqrtOrder).toLocaleString('en-GB'));
  const bsgsRatio = rows.reduce((s, r) => s + r.meanBsgsSteps / r.sqrtOrder, 0) / rows.length;
  const bruteRatio = rows.reduce((s, r) => s + r.meanBruteForceSteps / r.baseOrder, 0) / rows.length;
  token('ecdlp.bsgsRatio', formatNumber(bsgsRatio, 2));
  token('ecdlp.bruteRatio', formatNumber(bruteRatio, 2));
  token('ecdlp.challenges', PARAMS.challenges);

  // Fig. 2: a small curve with all its points.
  const small = study.smallCurvePoints(BigInt(PARAMS.smallCurvePrime));
  const smallPoints = small.points.map(({ x, y }) => ({ x: Number(x), y: Number(y) }));
  html.smallCurve = renderChart('smallCurve', { p: PARAMS.smallCurvePrime, points: smallPoints, order: small.order }, { id: 'small-curve' });
  token('smallCurve.p', PARAMS.smallCurvePrime);
  token('smallCurve.points', small.points.length);
  token('smallCurve.order', small.order);
  token('smallCurve.hasseLow', formatNumber(PARAMS.smallCurvePrime + 1 - 2 * Math.sqrt(PARAMS.smallCurvePrime), 1));
  token('smallCurve.hasseHigh', formatNumber(PARAMS.smallCurvePrime + 1 + 2 * Math.sqrt(PARAMS.smallCurvePrime), 1));

  // Fig. 12: Nakamoto's catch-up probability.
  html.nakamoto = renderChart('nakamoto', PARAMS.nakamoto, { id: 'nakamoto' });
  for (const q of PARAMS.nakamoto.qs) {
    for (const z of [1, 2, 6, 10, 20, 50]) token(`nakamoto.q${Math.round(100 * q)}z${z}`, percent(attackerSuccessProbability(q, z)));
  }
  token('nakamoto.markZ', PARAMS.nakamoto.markZ);

  // Fig. 1: the group law, static construction for the preset points.
  html.groupLaw = renderGroupLawSVG({ ...PRESET, mode: 'add', id: 'gl' });
  token('groupLaw.result', describe(construct({ ...PRESET, mode: 'add' })));
  token('groupLaw.double', describe(construct({ P: PRESET.P, Q: PRESET.Q, mode: 'double' })));

  // Fig. 3: the worked example of the live demonstration.
  const demos = Object.fromEntries(SERIES.map((v) => [v, computeDemo({ text: PARAMS.demoMessage, variant: v, flipIndex: PARAMS.demoFlipIndex })]));
  html.demo = renderDemoOutput(demos.scalar);
  const d = demos.scalar;
  token('demo.message', PARAMS.demoMessage);
  token('demo.hex', d.hex);
  token('demo.bytes', d.byteCount);
  token('demo.scalar', d.scalarHex);
  token('demo.x', d.point.xHex);
  token('demo.y', d.point.yHex);
  token('demo.compressed', d.point.compressedHex);
  token('demo.digestScalar', d.digestHex);
  token('demo.digestPedersen', demos.pedersen.digestHex);
  token('demo.digestSha256', demos.sha256.digestHex);
  token('demo.flipIndex', d.flipped.index);
  token('demo.distanceScalar', d.flipped.distance);
  token('demo.distancePedersen', demos.pedersen.flipped.distance);
  token('demo.distanceSha256', demos.sha256.flipped.distance);
  token('demo.negationHex', d.collisions.negation?.hex ?? 'n/a');
  token('demo.negationEqual', d.collisions.negation?.equal ? 'identical' : 'different');
  token('demo.wrapHex', d.collisions.wrap?.hex ?? 'n/a');
  token('demo.wrapEqual', d.collisions.wrap?.equal ? 'identical' : 'different');

  return { html, tokens };
}

/**
 * The build-time study of homework 04 (src/lib/penetration-study.js), run on
 * small parameters: deterministic, JSON-safe, consistent with the exact laws
 * of src/lib/penetration.js within Monte Carlo error, and showing the scaling
 * laws the page reports (variance slopes, LLN bounds, CLT rate, role of m).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  berryEsseenBound,
  chebyshevBound,
  dkwRadius,
  exactExceedance,
  exactKolmogorovDistance,
  hoeffdingBound,
  incrementLaw,
  probabilityAnyAttackerReaches,
  scoreMoments,
  simulateTrajectories,
} from '../src/lib/penetration.js';
import { deriveSeed } from '../src/lib/kg-study.js';
import { denseGrid, runPenetrationStudy, studyCheckpoints } from '../src/lib/penetration-study.js';

const SMALL = Object.freeze({
  seed: 7,
  p: 0.3,
  pSmall: 0.05,
  m: 400,
  distributionN: [10, 100],
  curveN: [1, 2, 5, 10, 20, 50, 100, 200],
  densePerDecade: 5,
  eps: [0.1, 0.05],
  llnLevel: 0.05,
  trajectories: { n: 60, m: 4, points: 12 },
  binsTarget: 20,
  cltPlotN: [10, 100],
  quantiles: 40,
  ksFitMinN: 10,
  ksFitMaxN: 100,
  dkwAlpha: 0.05,
  precision: { n: 50, groupSizes: [10, 20, 40] },
  aggregate: { budget: 200, n: [10, 100] },
  best: { excess: 0.1, n: [10, 20, 50, 100], chartN: [10, 100], groupSizes: [1, 10], mPerDecade: 2 },
});

const study = runPenetrationStudy(SMALL);
const MODELS = ['bernoulli', 'rademacher'];
const QUANTITIES = ['total', 'average', 'normalized'];

const close = (actual, expected, tol, msg = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected} ± ${tol}, got ${actual}`);

test('the study is deterministic and survives a JSON round trip unchanged', () => {
  const again = runPenetrationStudy(SMALL);
  assert.equal(JSON.stringify(again), JSON.stringify(study));
  assert.deepEqual(JSON.parse(JSON.stringify(study)), study);
});

test('the checkpoints are the sorted union of every n the experiments use', () => {
  assert.deepEqual(studyCheckpoints(SMALL), [1, 2, 5, 10, 20, 50, 100, 200]);
  assert.deepEqual(studyCheckpoints({ ...SMALL, precision: { n: 40, groupSizes: [10] } }), [1, 2, 5, 10, 20, 40, 50, 100, 200]);
  assert.deepEqual(study.meta.checkpoints, studyCheckpoints(SMALL));
  const grid = denseGrid(200, 5);
  assert.equal(grid[0], 1);
  assert.equal(grid.at(-1), 200);
  assert.ok(grid.every((n, i) => i === 0 || n > grid[i - 1]), 'strictly increasing');
});

test('each model has its own stream derived from the master seed', () => {
  assert.equal(study.meta.seeds.bernoulli, deriveSeed(SMALL.seed, 'scores:bernoulli'));
  assert.equal(study.meta.seeds.rademacher, deriveSeed(SMALL.seed, 'scores:rademacher'));
  assert.equal(study.meta.seeds.trajectoriesBernoulli, deriveSeed(SMALL.seed, 'trajectories:bernoulli'));
  assert.notEqual(study.meta.seeds.bernoulli, study.meta.seeds.rademacher);
});

test('E1: the sample trajectories are those of simulateTrajectories, with the theoretical envelope', () => {
  const { n, m } = SMALL.trajectories;
  const tr = study.trajectories;
  assert.equal(tr.t.at(-1), n);
  assert.equal(tr.t[0], 1);
  for (const model of MODELS) {
    const law = incrementLaw(model, { p: SMALL.p });
    const seed = study.meta.seeds[model === 'bernoulli' ? 'trajectoriesBernoulli' : 'trajectoriesRademacher'];
    const paths = simulateTrajectories({ law, n, m, seed });
    const data = tr.models[model];
    assert.equal(data.paths.length, m);
    data.paths.forEach((path, j) => assert.deepEqual(path, tr.t.map((t) => paths[j][t])));
    tr.t.forEach((t, i) => {
      const th = scoreMoments(law, t);
      for (const q of QUANTITIES) {
        close(data.envelope[q].mean[i], th[q].mean, 1e-12);
        close(data.envelope[q].sd[i], th[q].sd, 1e-12);
      }
    });
  }
});

test('E2: the binned distributions hold every attacker and almost all the exact probability', () => {
  for (const model of MODELS) {
    const rows = study.distributions[model];
    assert.deepEqual(rows.map((r) => r.n), SMALL.distributionN);
    for (const row of rows) {
      assert.equal(row.empirical.reduce((s, c) => s + c, 0), SMALL.m, `${model} n=${row.n}`);
      const mass = row.exact.reduce((s, p) => s + p, 0);
      close(mass, 1, 1e-4, `${model} n=${row.n} exact mass`);
      assert.ok(row.width >= 1 && Number.isInteger(row.width));
      assert.ok(row.k0 <= row.observedMin && row.k0 + row.width * row.empirical.length - 1 >= row.observedMax);
    }
  }
});

test('E3: the empirical moments agree with the theory within Monte Carlo error, under exact rescaling', () => {
  for (const model of MODELS) {
    const law = incrementLaw(model, { p: SMALL.p });
    for (const row of study.moments[model]) {
      const th = scoreMoments(law, row.n);
      for (const q of QUANTITIES) {
        close(row[q].theoryMean, th[q].mean, 1e-12);
        close(row[q].theoryVariance, th[q].variance, 1e-12);
        assert.ok(Math.abs(row[q].mean - th[q].mean) <= 4.5 * row[q].seMean, `${model} ${q} n=${row.n} mean`);
        assert.ok(Math.abs(row[q].variance - th[q].variance) <= 4.5 * row[q].seVariance, `${model} ${q} n=${row.n} variance`);
      }
      close(row.average.variance, row.total.variance / row.n ** 2, 1e-9 * row.total.variance);
      close(row.normalized.variance, row.total.variance / row.n, 1e-9 * row.total.variance);
    }
  }
});

test('E4: the variance grows as n, decays as 1/n and stays at σ² under the three normalisations', () => {
  const expected = { total: 1, average: -1, normalized: 0 };
  for (const model of MODELS) {
    const v = study.variance[model];
    assert.deepEqual(v.points.map((p) => p.n), SMALL.curveN);
    for (const q of QUANTITIES) close(v.fits[q].slope, expected[q], 0.06, `${model} ${q}`);
  }
});

test('E5: Chebyshev and Hoeffding bound the exact deviation probability, which the simulation matches', () => {
  for (const model of MODELS) {
    const law = incrementLaw(model, { p: SMALL.p });
    const blocks = study.lln[model];
    assert.deepEqual(blocks.map((b) => b.eps), SMALL.eps);
    for (const block of blocks) {
      for (const pt of [...block.points, ...block.dense]) {
        close(pt.exact, exactExceedance(law, pt.n, block.eps), 1e-15);
        assert.ok(pt.chebyshev >= pt.exact - 1e-12, `${model} ε=${block.eps} n=${pt.n} Chebyshev`);
        assert.ok(pt.hoeffding >= pt.exact - 1e-12, `${model} ε=${block.eps} n=${pt.n} Hoeffding`);
        close(pt.chebyshev, chebyshevBound(law, pt.n, block.eps), 1e-15);
        close(pt.hoeffding, hoeffdingBound(law, pt.n, block.eps), 1e-15);
      }
      for (const pt of block.points) {
        assert.ok(pt.low <= pt.empirical && pt.empirical <= pt.high);
        const sd = Math.sqrt((pt.exact * (1 - pt.exact)) / SMALL.m);
        assert.ok(Math.abs(pt.empirical - pt.exact) <= 4.5 * sd + 1 / SMALL.m, `${model} ε=${block.eps} n=${pt.n}`);
      }
      // The n from which each probability stays below the level: exact first, then Hoeffding or Chebyshev.
      assert.ok(block.nExact <= block.nHoeffding && block.nExact <= block.nChebyshev);
      assert.equal(block.nChebyshev, Math.ceil(law.variance / (SMALL.llnLevel * block.eps ** 2) - 1e-9));
    }
  }
});

test('E6: the Rademacher distance to N(0, 1) sits under Berry–Esseen and falls as n^(−1/2)', () => {
  const law = incrementLaw('rademacher');
  const c = study.clt.rademacher;
  const loose = dkwRadius(SMALL.m, 1e-4);
  for (const pt of c.points) {
    close(pt.exact, exactKolmogorovDistance(law, pt.n), 1e-15);
    close(pt.berryEsseen, berryEsseenBound(law, pt.n), 1e-15);
    assert.ok(pt.exact <= pt.berryEsseen);
    assert.ok(Math.abs(pt.empirical - pt.exact) <= loose, `n=${pt.n}`);
  }
  close(c.fitExact.slope, -0.5, 0.05);
  close(study.clt.dkw, dkwRadius(SMALL.m, SMALL.dkwAlpha), 1e-15);
  assert.deepEqual(c.plots.map((p) => p.n), SMALL.cltPlotN);
  for (const plot of c.plots) {
    assert.equal(plot.quantiles.length, SMALL.quantiles);
    assert.ok(plot.quantiles.every((q, i) => i === 0 || q >= plot.quantiles[i - 1]));
  }
});

test('E7: the Bernoulli Sₙ/√n drifts away from N(0, 1) while its standardised form converges', () => {
  const law = incrementLaw('bernoulli', { p: SMALL.p });
  const b = study.clt.bernoulli;
  for (const pt of b.points) close(pt.exact, exactKolmogorovDistance(law, pt.n), 1e-15);
  const raw = b.points.map((pt) => pt.raw);
  for (let i = 4; i < raw.length; i += 1) assert.ok(raw[i] >= raw[i - 1], 'raw distance increases from n = 10');
  assert.ok(raw.at(-1) > 0.9);
  assert.ok(b.points.at(-1).exact < b.points[3].exact);
  const small = study.clt.bernoulliSmall.dense;
  const at = (rows, n) => rows.find((r) => r.n === n);
  assert.ok(at(small, 100).exact > at(b.dense, 100).exact, 'a skewed increment converges more slowly');
  close(b.fitExact.slope, -0.5, 0.12);
});

test('E8: the precision of the moments and of the distribution function improves as 1/√m', () => {
  const pr = study.precision;
  assert.equal(pr.n, SMALL.precision.n);
  for (const model of MODELS) {
    const law = incrementLaw(model, { p: SMALL.p });
    const rows = pr.models[model];
    assert.deepEqual(rows.map((r) => r.size), SMALL.precision.groupSizes);
    for (const r of rows) {
      assert.equal(r.groups, Math.floor(SMALL.m / r.size));
      close(r.se, Math.sqrt(law.variance / (SMALL.precision.n * r.size)), 1e-15);
      close(r.dkw, dkwRadius(r.size, SMALL.dkwAlpha), 1e-15);
      assert.ok(r.medianD > 0 && r.medianD < r.dkw);
      assert.ok(r.shareAbove <= 0.2);
    }
    const first = rows.find((r) => r.groups >= 20);
    assert.ok(first.rms / first.se > 0.6 && first.rms / first.se < 1.5, `${model} RMS / SE = ${first.rms / first.se}`);
    for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].se < rows[i - 1].se && rows[i].dkw < rows[i - 1].dkw);
  }
});

test('E9: the aggregate of a group depends on m·n, and the best attacker improves with m and fades with n', () => {
  for (const model of MODELS) {
    const law = incrementLaw(model, { p: SMALL.p });
    for (const r of study.aggregate.models[model]) {
      assert.equal(r.size * r.n, SMALL.aggregate.budget);
      close(r.theoryMean, r.size * r.n * law.mean, 1e-9);
      close(r.theoryVariance, r.size * r.n * law.variance, 1e-9);
      assert.ok(Math.abs(r.mean - r.theoryMean) <= 4.5 * Math.sqrt(r.theoryVariance / r.groups) + 1e-9);
    }
    const total = study.aggregate.total[model];
    close(total.mean, SMALL.m * total.n * law.mean, 1e-9);
    assert.ok(Math.abs(total.z) < 4.5);
  }
  const law = incrementLaw('bernoulli', { p: SMALL.p });
  const best = study.best;
  for (const row of best.rows) {
    assert.equal(row.threshold, Math.ceil(row.n * (SMALL.p + SMALL.best.excess) - 1e-9));
    close(row.p1, probabilityAnyAttackerReaches(law, row.n, 1, row.threshold), 1e-15);
    close(row.pAtM, probabilityAnyAttackerReaches(law, row.n, SMALL.m, row.threshold), 1e-15);
  }
  for (let i = 1; i < best.rows.length; i += 1) assert.ok(best.rows[i].m50 > best.rows[i - 1].m50, 'm₅₀ grows with n');
  for (const curve of best.curves) {
    for (let i = 1; i < curve.points.length; i += 1) assert.ok(curve.points[i].p >= curve.points[i - 1].p, 'P(any) grows with m');
  }
  for (const e of best.empirical) {
    assert.ok(e.low <= e.rate && e.rate <= e.high);
    assert.ok(Math.abs(e.rate - e.exact) <= 4.5 * Math.sqrt((e.exact * (1 - e.exact)) / e.groups) + 1 / e.groups);
  }
});

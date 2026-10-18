import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('every route leg must meet p95 and maximum path tolerances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-leg-compare-'));
  try {
    const report = {
      target: { version: 'test', revision: 'abc123' },
      route: { status: 'available', legs: Array.from({ length: 5 }, () => ({
        lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]),
      })) },
    };
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(report));
    const compare = (candidate: typeof report) => {
      writeFileSync(after, JSON.stringify(candidate));
      return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url)), before, after, '--require-route'], { encoding: 'utf8' });
    };

    const p95Failure = structuredClone(report);
    for (let i = 0; i < 3; i++) p95Failure.route.legs[2].points[i][1] = 30;
    const p95Result = compare(p95Failure);
    assert.equal(p95Result.status, 1);
    assert.match(p95Result.stdout, /leg 3 path divergence exceeds tolerance; path difference p95 0 m, max 30 m/);
    assert.match(p95Result.stdout, /3: 30 \/ 30/);

    const maxFailure = structuredClone(report);
    maxFailure.route.legs[4].points[0][1] = 51;
    const maxResult = compare(maxFailure);
    assert.equal(maxResult.status, 1);
    assert.match(maxResult.stdout, /leg 5 path divergence exceeds tolerance/);

    const boundary = structuredClone(report);
    for (let i = 0; i < 3; i++) boundary.route.legs[2].points[i][1] = 25;
    boundary.route.legs[2].points[3][1] = 50;
    const boundaryResult = compare(boundary);
    assert.equal(boundaryResult.status, 0);
    assert.match(boundaryResult.stdout, /3: 25 \/ 50/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('required comparisons fail when either report lacks any available observation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-metric-compare-'));
  try {
    const motion = { status: 'available', speedRatio: { p05: .9, p95: 1.1 }, steeringResponseMs: { left: 8, right: 16 } };
    const report = {
      target: { version: 'test', revision: 'abc123' },
      environment: { runner: { webgl: { renderer: 'test renderer' } } },
      fixture: { scenarioSha256: 'scenario', recorderSha256: 'recorder', reporterSha256: 'reporter', stageSha256: 'stage', motionBenchmarkSha256: 'benchmark', motionAdapterSha256: 'adapter', captureVideo: false },
      metrics: { browserFrameIntervalP95: { status: 'available', p95Ms: 16 }, roomProgress: { status: 'available', ratio: 1 }, modeledMotion: { steady150: structuredClone(motion), bunched150: structuredClone(motion) } },
      route: { status: 'available', legs: Array.from({ length: 5 }, () => ({ lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]) })) },
    };
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    const script = fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url));
    const compare = (base: typeof report, candidate: typeof report, flag: string) => {
      writeFileSync(before, JSON.stringify(base));
      writeFileSync(after, JSON.stringify(candidate));
      return spawnSync(process.execPath, [script, before, after, flag], { encoding: 'utf8' });
    };
    assert.equal(compare(report, report, '--require-comparable').status, 0);
    for (const side of ['base', 'candidate'] as const) {
      for (const metric of ['frame', 'room', 'steady', 'bunched'] as const) {
        const changed = structuredClone(report);
        const observation = metric === 'frame' ? changed.metrics.browserFrameIntervalP95 : metric === 'room' ? changed.metrics.roomProgress : changed.metrics.modeledMotion[metric === 'steady' ? 'steady150' : 'bunched150'];
        observation.status = 'unavailable';
        const base = side === 'base' ? changed : report;
        const candidate = side === 'candidate' ? changed : report;
        const required = compare(base, candidate, '--require-comparable');
        assert.equal(required.status, 1, `${side} ${metric}`);
        assert.match(required.stdout, /Required observations: HOLD/);
        assert.equal(compare(base, candidate, '--require-route').status, 0, `${side} ${metric} route only`);
      }
    }
    const malformed = structuredClone(report);
    delete (malformed.metrics.modeledMotion.bunched150.steeringResponseMs as Partial<typeof motion.steeringResponseMs>).right;
    assert.equal(compare(report, malformed, '--require-comparable').status, 1);
    const slower = structuredClone(report);
    slower.metrics.browserFrameIntervalP95.p95Ms = 300;
    slower.metrics.roomProgress.ratio = .1;
    assert.equal(compare(report, slower, '--require-comparable').status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

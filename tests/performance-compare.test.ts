import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const initialOrder = { restaurant: { id: 'tartine', x: -180, z: 120, index: 1 }, customer: { id: 'cable', x: 0, y: 0, z: -180, rooftop: false, index: 2 } };
const secondOrder = { restaurant: { id: 'second', x: -160, z: 120, index: 3 }, customer: { id: 'another', x: 15, y: 0, z: -180, rooftop: false, index: 4 } };
const routeEvidence = {
  initialOrder, secondOrder,
  firstCompletion: { tick: 15, x: 0, z: -180 }, staging: { stagedTick: 16, confirmedTick: 17, durationMs: null as number | null },
  milestones: [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup'], [1, 'dropoff'], [2, 'pickup']].map(([completed, stage], i) => ({ completed, stage, tick: i * 10, x: i, z: 0 })),
  jumpCount: 2, jumps: [{ tick: 42, liftTick: 43, landingTick: 44 }, { tick: 46, liftTick: 47, landingTick: 60 }],
  flightSnapshots: 5, flight: { startTick: 46, endTick: 54, durationMs: 500, snapshots: 5, forwardThrustTick: 50 }, horizontalTravelM: 6, peakY: 5,
};

test('every route leg must meet p95 and maximum path tolerances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-leg-compare-'));
  try {
    const report = {
      target: { version: 'test', revision: 'abc123', dirty: false, protocol: 46 },
      route: { status: 'available', ...structuredClone(routeEvidence), legs: Array.from({ length: 5 }, () => ({
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
    maxFailure.route.legs[1].points[0][1] = 51;
    const maxResult = compare(maxFailure);
    assert.equal(maxResult.status, 1);
    assert.match(maxResult.stdout, /leg 2 path divergence exceeds tolerance/);

    for (const i of [3, 4]) {
      const laterLegFailure = structuredClone(report);
      laterLegFailure.route.legs[i].points[0][1] = 51;
      const laterResult = compare(laterLegFailure);
      assert.equal(laterResult.status, 1);
      assert.match(laterResult.stdout, new RegExp(`leg ${i + 1} path divergence exceeds tolerance`));
    }

    const boundary = structuredClone(report);
    for (let i = 0; i < 3; i++) boundary.route.legs[2].points[i][1] = 25;
    boundary.route.legs[2].points[3][1] = 50;
    const boundaryResult = compare(boundary);
    assert.equal(boundaryResult.status, 0);
    assert.match(boundaryResult.stdout, /3: 25 \/ 50/);

    const differentOrder = structuredClone(report);
    differentOrder.route.initialOrder.customer.id = 'another-customer';
    const orderResult = compare(differentOrder);
    assert.equal(orderResult.status, 1);
    assert.match(orderResult.stdout, /initial delivery identity or coordinates differ/);

    const differentSecond = structuredClone(report);
    differentSecond.route.secondOrder.customer.z += 1;
    const secondResult = compare(differentSecond);
    assert.equal(secondResult.status, 1);
    assert.match(secondResult.stdout, /second delivery identity or coordinates differ/);

    const reorderedCatalog = structuredClone(report);
    reorderedCatalog.route.initialOrder.restaurant.index = 99;
    reorderedCatalog.route.secondOrder.customer.index = 98;
    assert.equal(compare(reorderedCatalog).status, 0);

    const missingSecond = structuredClone(report);
    delete (missingSecond.route as Partial<typeof report.route>).secondOrder;
    assert.equal(compare(missingSecond as typeof report).status, 1);

    const missingMilestone = structuredClone(report);
    missingMilestone.route.milestones.pop();
    assert.equal(compare(missingMilestone).status, 1);
    assert.match(compare(missingMilestone).stdout, /milestones or second-order staging evidence unavailable/);

    const unconfirmed = structuredClone(report);
    unconfirmed.route.staging.confirmedTick = 21;
    assert.equal(compare(unconfirmed).status, 1);
    unconfirmed.route.staging.confirmedTick = unconfirmed.route.staging.stagedTick;
    assert.equal(compare(unconfirmed).status, 1);

    const oldRoute = structuredClone(report);
    oldRoute.route.legs.splice(3);
    const oldResult = compare(oldRoute);
    assert.equal(oldResult.status, 1);
    assert.match(oldResult.stdout, /three-leg reports are incompatible with this scenario/);

    const invalidEvidence: [string, (route: any) => void][] = [
      ['missing jumps', r => { delete r.jumps; }],
      ['missing landing', r => { delete r.jumps[0].landingTick; }],
      ['same lift', r => { r.jumps[0].liftTick = r.jumps[1].liftTick; }],
      ['landing before lift', r => { r.jumps[0].landingTick = r.jumps[0].liftTick; }],
      ['landing after next trigger', r => { r.jumps[0].landingTick = r.jumps[1].tick; }],
      ['missing final landing', r => { delete r.jumps[1].landingTick; }],
      ['wrong jump count', r => { r.jumpCount = 1; }],
      ['missing flight', r => { delete r.flight; }],
      ['missing forward thrust', r => { delete r.flight.forwardThrustTick; }],
      ['forward thrust outside flight', r => { r.flight.forwardThrustTick = 55; }],
      ['too few flight snapshots', r => { r.flight.snapshots = r.flightSnapshots = 4; }],
      ['short flight', r => { r.flight.durationMs = 399; }],
      ['inconsistent flight ticks', r => { r.flight.endTick = 80; }],
      ['missing travel', r => { delete r.horizontalTravelM; }],
    ];
    for (const [label, invalidate] of invalidEvidence) {
      const candidate = structuredClone(report);
      invalidate(candidate.route);
      const result = compare(candidate);
      assert.equal(result.status, 1, label);
      assert.match(result.stdout, /jump, landing or sustained forward-flight evidence unavailable or invalid/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('required comparisons fail when either report lacks any available observation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-metric-compare-'));
  try {
    const motion = { status: 'available', speedRatio: { p05: .9, p95: 1.1 }, steeringResponseMs: { left: 8, right: 16 } };
    const report = {
      target: { version: 'test', revision: 'abc123', dirty: false, protocol: 46 },
      environment: { platform: 'darwin', release: '24', arch: 'arm64', cpu: 'test cpu', logicalCpus: 3, ci: true, loadAverageBefore: [3, 2, 1], loadAverageAfter: [2, 2, 1], runner: { platform: 'darwin', release: '24', architecture: 'arm64', cpu: 'test cpu', nodeVersion: '22', playwrightVersion: '1', browserVersion: '1', browserChannel: 'chromium', gpuMode: 'metal', headed: false, webgl: { renderer: 'test renderer', vendor: 'test vendor' } }, viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
      fixture: { scenarioSha256: 'a'.repeat(64), recorderSha256: 'b'.repeat(64), reporterSha256: 'c'.repeat(64), stageSha256: 'd'.repeat(64), motionBenchmarkSha256: 'e'.repeat(64), motionAdapterSha256: 'f'.repeat(64), seed: 0, start: { x: -190, z: 120, yaw: -Math.PI / 2 }, captureVideo: false },
      metrics: { browserFrameIntervalP95: { status: 'available', p95Ms: 16 }, roomProgress: { status: 'available', ratio: 1 }, modeledMotion: { steady150: structuredClone(motion), bunched150: structuredClone(motion) } },
      route: { status: 'available', ...structuredClone(routeEvidence), legs: Array.from({ length: 5 }, () => ({ lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]) })) },
    };
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    const script = fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url));
    const compare = (base: typeof report, candidate: typeof report, flag: string) => {
      writeFileSync(before, JSON.stringify(base));
      writeFileSync(after, JSON.stringify(candidate));
      return spawnSync(process.execPath, [script, before, after, flag], { encoding: 'utf8' });
    };
    assert.equal(compare(report, report, '--require-comparable').status, 0);
    const missingIdentity: [string, (report: any) => void][] = [
      ...['platform', 'release', 'arch', 'cpu', 'logicalCpus', 'ci', 'loadAverageBefore', 'loadAverageAfter'].map(key => [key, (r: any) => { delete r.environment[key]; }] as [string, (report: any) => void]),
      ...['platform', 'release', 'architecture', 'cpu', 'nodeVersion', 'playwrightVersion', 'browserVersion', 'browserChannel', 'gpuMode', 'headed', 'webgl'].map(key => [`runner.${key}`, (r: any) => { delete r.environment.runner[key]; }] as [string, (report: any) => void]),
      ...['width', 'height', 'deviceScaleFactor', 'isMobile', 'hasTouch'].map(key => [`viewport.${key}`, (r: any) => { delete r.environment.viewport[key]; }] as [string, (report: any) => void]),
      ...['scenarioSha256', 'recorderSha256', 'reporterSha256', 'stageSha256', 'seed', 'start'].map(key => [`fixture.${key}`, (r: any) => { delete r.fixture[key]; }] as [string, (report: any) => void]),
      ['start yaw', r => { delete r.fixture.start.yaw; }],
      ['renderer', r => { delete r.environment.runner.webgl.renderer; }],
      ['vendor', r => { delete r.environment.runner.webgl.vendor; }],
    ];
    for (const [label, invalidate] of missingIdentity) {
      const changed = structuredClone(report);
      invalidate(changed);
      const result = compare(changed, changed, '--require-comparable');
      assert.equal(result.status, 1, `both lack ${label}`);
      assert.equal(compare(report, changed, '--require-comparable').status, 1, `candidate lacks ${label}`);
      assert.match(result.stdout, /Complete matching host, runner, viewport and fixture identity: HOLD/);
      assert.match(result.stdout.split('\n').find(line => line.startsWith('| Browser animation')) ?? '', /\| HOLD \|$/);
    }
    for (const key of ['version', 'revision', 'dirty', 'protocol'] as const) {
      const changed = structuredClone(report);
      delete (changed.target as Partial<typeof changed.target>)[key];
      assert.equal(compare(changed, changed, '--require-comparable').status, 1, `target missing ${key}`);
    }
    const missingLanding = structuredClone(report);
    delete (missingLanding.route.jumps[1] as Partial<typeof missingLanding.route.jumps[number]>).landingTick;
    const heldRoute = compare(report, missingLanding, '--require-comparable');
    assert.equal(heldRoute.status, 1);
    for (const name of ['| Browser animation', '| Room simulated']) {
      assert.match(heldRoute.stdout.split('\n').find(line => line.startsWith(name)) ?? '', /\| HOLD \|$/);
    }
    for (const mutate of [(r: typeof report) => { r.fixture.seed = 1; }, (r: typeof report) => { r.environment.viewport.width = 390; }, (r: typeof report) => { r.environment.runner.browserVersion = '2'; }, (r: typeof report) => { r.fixture.start.x = 0; }]) {
      const changed = structuredClone(report);
      mutate(changed);
      assert.equal(compare(report, changed, '--require-comparable').status, 1);
    }
    const loaded = structuredClone(report);
    loaded.environment.loadAverageBefore = [30, 20, 10];
    const loadedResult = compare(report, loaded, '--require-comparable');
    assert.equal(loadedResult.status, 0, 'load is disclosed without an invented cutoff');
    assert.match(loadedResult.stdout, /One-minute host load before → after: base 3 → 2, candidate 30 → 2/);
    assert.match(loadedResult.stdout, /Performance verdict: HOLD.*differing host load/);
    const staged = structuredClone(report);
    report.route.staging.durationMs = 1200;
    staged.route.staging.durationMs = 9000;
    const durationResult = compare(report, staged, '--require-comparable');
    assert.equal(durationResult.status, 0, 'different durations do not introduce a timing threshold');
    assert.match(durationResult.stdout, /Second-delivery staging duration: base 1200 ms, candidate 9000 ms/);
    assert.match(durationResult.stdout, /p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time/);
    report.route.staging.durationMs = null;
    staged.route.staging.durationMs = -1;
    const missingDuration = compare(report, staged, '--require-comparable');
    assert.equal(missingDuration.status, 0, 'missing duration does not affect route comparability');
    assert.match(missingDuration.stdout, /Second-delivery staging duration: base unavailable, candidate unavailable/);
    const absent = structuredClone(report), zero = structuredClone(staged);
    delete (absent.route.staging as Partial<typeof absent.route.staging>).durationMs;
    zero.route.staging.durationMs = 0;
    assert.match(compare(absent, zero, '--require-comparable').stdout, /Second-delivery staging duration: base unavailable, candidate 0 ms/);
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

test('older archived reports are held rather than assigned new landing evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-old-report-'));
  try {
    const archived = fileURLToPath(new URL('../docs/performance-baselines/2026-10-18-two-delivery-cross-version/base-report.json.gz', import.meta.url));
    const report = join(dir, 'report.json');
    writeFileSync(report, gunzipSync(readFileSync(archived)));
    const script = fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, report, report, '--require-route'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /jump, landing or sustained forward-flight evidence unavailable or invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

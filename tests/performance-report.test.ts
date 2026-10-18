import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { browserFrameMetrics, deliveryRoute, frameMetrics, motionMetrics, performanceRoomName, roomProgress, withStagingDuration } from '../scripts/performance-report.mjs';
import { selectPerformance } from '../scripts/performance-select.mjs';

test('performance CI ignores documentation and small runtime edits unless explicitly selected', () => {
  const docs = [{ path: 'content/posts/article.md', added: 900, deleted: 0 }];
  const small = [{ path: 'src/scene.ts', added: 4, deleted: 2 }];
  const large = [{ path: 'src/scene.ts', added: 75, deleted: 25 }];
  assert.equal(selectPerformance(docs).run, false);
  assert.equal(selectPerformance(small).run, false);
  assert.equal(selectPerformance(small, ['performance-required']).run, true);
  assert.equal(selectPerformance(large).run, true);
  assert.equal(selectPerformance([{ path: 'public/assets/car.glb', binary: true, added: 0, deleted: 0 }]).run, true);
  for (const path of ['.nvmrc', 'vite.config.ts', 'wrangler.jsonc', 'index.html']) {
    assert.equal(selectPerformance([{ path, added: 1, deleted: 1 }], ['performance-required']).run, true);
  }
  assert.equal(selectPerformance([], [], true).run, true);
});

test('selector reads a real pull-request diff and writes separate GitHub outputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-perf-select-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Performance test');
    git('config', 'user.email', 'performance-test@example.invalid');
    writeFileSync(join(dir, 'README.md'), 'base\n');
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'render.ts'), Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n') + '\n');
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'candidate');
    const head = git('rev-parse', 'HEAD');
    const event = join(dir, 'event.json'), output = join(dir, 'output.txt');
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head }, labels: [] } }));
    const script = fileURLToPath(new URL('../scripts/performance-select.mjs', import.meta.url));
    const json = execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output } });
    assert.deepEqual(JSON.parse(json), { run: true, reason: 'at least 100 changed relevant lines', changedLines: 100 });
    assert.equal(readFileSync(output, 'utf8'), 'run=true\nreason=at least 100 changed relevant lines\n');
    mkdirSync(join(dir, 'shared'));
    git('mv', 'src/render.ts', 'shared/render.ts');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'move runtime code');
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: head }, head: { sha: git('rev-parse', 'HEAD') }, labels: ['performance-required'].map(name => ({ name })) } }));
    const moved = execFileSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output } });
    assert.deepEqual(JSON.parse(moved), { run: true, reason: 'performance-required label', changedLines: 200 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated performance room names are accepted by the game', () => {
  for (let i = 0; i < 20; i++) assert.match(performanceRoomName(), /^[a-z0-9][a-z0-9-]{0,31}$/);
});

test('comparison holds modeled changes if the measurement adapter changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-perf-compare-'));
  try {
    const baseline = JSON.parse(readFileSync(fileURLToPath(new URL('../docs/performance-baselines/2026-10-18-v0.0.24-aeb5704/report.json', import.meta.url)), 'utf8'));
    baseline.fixture.reporterSha256 = 'same-reporter';
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(baseline));
    baseline.fixture.motionAdapterSha256 = 'different-adapter';
    writeFileSync(after, JSON.stringify(baseline));
    const script = fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url));
    const result = execFileSync(process.execPath, [script, before, after], { encoding: 'utf8' });
    assert.match(result.split('\n').find(line => line.startsWith('| Modeled display')) ?? '', /\| HOLD \|$/);
    assert.match(result.split('\n').find(line => line.startsWith('| Modeled steering')) ?? '', /\| HOLD \|$/);
    baseline.fixture.motionAdapterSha256 = JSON.parse(readFileSync(before, 'utf8')).fixture.motionAdapterSha256;
    baseline.route.last.x += 20;
    writeFileSync(after, JSON.stringify(baseline));
    const divergent = execFileSync(process.execPath, [script, before, after], { encoding: 'utf8' });
    assert.match(divergent.split('\n').find(line => line.startsWith('| Room simulated')) ?? '', /\| HOLD \|$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('frame intervals report a real percentile and reject missing or truncated data', () => {
  const intervals = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(frameMetrics({ intervalsMs: intervals }).p95Ms, 95);
  assert.equal(frameMetrics({ intervalsMs: [16] }).status, 'unavailable');
  assert.equal(frameMetrics({ intervalsMs: intervals, truncated: true }).status, 'unavailable');
  const manifest = { events: [{ type: 'sample', status: 'ok', sample: { connection: '● LIVE / 1 DRIVER', perf: { drawCalls: 10 } } }], browserErrors: { pageErrors: 0, consoleErrors: 0 } };
  assert.equal(browserFrameMetrics(manifest, { sample: { intervalsMs: intervals } }, 5).status, 'available');
  assert.equal(browserFrameMetrics(manifest, { sample: { intervalsMs: intervals } }, 0).status, 'unavailable');
  manifest.events[0].sample.perf.drawCalls = 0;
  assert.equal(browserFrameMetrics(manifest, { sample: { intervalsMs: intervals } }, 5).status, 'unavailable');
});

const initialOrder = { restaurant: { id: 'tartine', x: -180, z: 120, index: 1 }, customer: { id: 'cable', x: 0, y: 0, z: -180, rooftop: false, index: 2 } };
const secondOrder = { restaurant: { id: 'second', x: -160, z: 120, index: 3 }, customer: { id: 'another', x: 15, y: 0, z: -180, rooftop: false, index: 4 } };
const routeEvidence = {
  initialOrder, secondOrder,
  firstCompletion: { tick: 15, x: 0, z: -180 }, staging: { stagedTick: 16, confirmedTick: 17 },
  milestones: [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup'], [1, 'dropoff'], [2, 'pickup']].map(([completed, stage], i) => ({ completed, stage, tick: i * 10, x: i, z: 0 })),
  jumpCount: 2, jumps: [{ tick: 42, liftTick: 43, landingTick: 44 }, { tick: 46, liftTick: 47, landingTick: 60 }],
  flightSnapshots: 5, flight: { startTick: 46, endTick: 54, durationMs: 500, snapshots: 5, forwardThrustTick: 50, airborneStartTick: 46, airborneEndTick: 58, airborneDisplacementTick: 58, airborneDisplacementM: 6 }, peakY: 5,
};

test('performance scenario drives two deliveries before flight', () => {
  const scenario = JSON.parse(readFileSync(fileURLToPath(new URL('../scripts/playtests/performance-drive.json', import.meta.url)), 'utf8'));
  const milestones = scenario.steps.filter((step: { type: string }) => step.type === 'waitForDelivery');
  const route = milestones.map(({ completed, stage }: { completed: number; stage: string }) => [completed, stage]);
  assert.deepEqual(route.filter((item: (string | number)[], i: number) => !i || item[0] !== route[i - 1][0] || item[1] !== route[i - 1][1]), [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup'], [1, 'dropoff'], [2, 'pickup']]);
  const stageIndex = scenario.steps.findIndex((step: { type: string }) => step.type === 'stageRepeatDelivery');
  assert.ok(stageIndex > scenario.steps.indexOf(milestones.find((m: { completed: number; stage: string }) => m.completed === 1 && m.stage === 'pickup')));
  assert.ok(stageIndex < scenario.steps.indexOf(milestones.find((m: { completed: number; stage: string }) => m.completed === 1 && m.stage === 'dropoff')));
  const completedIndex = scenario.steps.indexOf(milestones.at(-1));
  assert.ok(!scenario.steps.slice(completedIndex + 1).some((step: { type: string; key?: string }) => step.type === 'keyPress' && step.key === 'Shift'));
  assert.equal(scenario.steps.filter((step: { type: string }) => step.type === 'jumpUntilAirborne').length, 2);
});

test('delivery route requires both real deliveries, stable orders, jumps and powered flight', () => {
  const stages = [
    [0, 'pickup', -188, 120, 1, 2, false], [0, 'dropoff', -180, 120, 1, 2, false],
    [1, 'pickup', 0, -180, 1, 2, true], [1, 'pickup', 0, -180, 3, 4, false],
    [1, 'dropoff', -160, 120, 3, 4, false], [2, 'pickup', 15, -180, 3, 4, true],
  ] as const;
  const poses = stages.flatMap(([deliveryCompleted, deliveryStage, x, z, deliveryRestaurant, deliveryCustomer, deliverySearching], i) => Array.from({ length: 4 }, (_, j) => ({
    atMs: (i * 4 + j) * 100, tick: (i * 4 + j) * 2, poseRevision: 1, x, z, y: 0,
    deliveryCompleted, deliveryStage, deliveryRestaurant, deliveryCustomer, deliverySearching, lastJump: 0, jumpBurstUntil: 0, supported: true, thrusters: 0, vy: 0,
  })));
  poses.push(...Array.from({ length: 9 }, (_, i) => ({ atMs: 2400 + i * 100, tick: 48 + i * 2, poseRevision: 1, x: 16 + 2 * i, z: -180, y: i === 2 || i === 8 ? 0 : i, deliveryCompleted: 2, deliveryStage: 'pickup' as const, deliveryRestaurant: 3, deliveryCustomer: 4, deliverySearching: true, lastJump: i < 3 ? 1 : 2, jumpBurstUntil: i < 3 ? 2 : 3, supported: i === 2 || i === 8, thrusters: i === 2 || i === 8 ? 0 : i < 3 ? 6 : 7, vy: i === 2 || i === 8 ? 0 : 5 })));
  const stageRepeat = { order: secondOrder, stagedTick: 22, confirmedTick: 24 };
  const route = deliveryRoute(poses, initialOrder, stageRepeat);
  assert.equal(route.status, 'available');
  assert.deepEqual(route.initialOrder, initialOrder);
  assert.deepEqual(route.secondOrder, secondOrder);
  assert.deepEqual(route.staging, { stagedTick: 22, confirmedTick: 24 });
  const event = { type: 'stageRepeatDelivery', status: 'ok', commandDurationMs: 1200 };
  assert.deepEqual(withStagingDuration(route, event).staging, { stagedTick: 22, confirmedTick: 24, durationMs: 1200 });
  assert.equal(withStagingDuration(route, { ...event, commandDurationMs: 0 }).staging.durationMs, 0);
  for (const missing of [undefined, { ...event, commandDurationMs: -1 }, { ...event, commandDurationMs: NaN }, { ...event, status: 'failed' }]) {
    assert.equal(withStagingDuration(route, missing).staging.durationMs, null);
  }
  assert.deepEqual(withStagingDuration({ status: 'unavailable' }, event).staging, { durationMs: 1200 });
  assert.equal(route.jumpCount, 2);
  assert.deepEqual(route.jumps, [{ tick: 48, liftTick: 48, landingTick: 52 }, { tick: 54, liftTick: 54, landingTick: 64 }]);
  assert.equal(route.flight.forwardThrustTick >= route.flight.startTick, true);
  assert.equal(route.flight.airborneDisplacementM, 8);
  assert.equal(route.legs.length, 5);
  const check = (samples: typeof poses, first = initialOrder, stage = stageRepeat) => deliveryRoute(samples, first, stage).status;
  assert.equal(deliveryRoute(poses, undefined, stageRepeat).status, 'unavailable');
  assert.equal(deliveryRoute(poses, initialOrder, undefined).status, 'unavailable');
  assert.equal(check(poses.filter(p => p.deliveryCompleted < 2)), 'unavailable');
  assert.equal(check(poses, initialOrder, { ...stageRepeat, confirmedTick: 1000 }), 'unavailable');
  assert.equal(check(poses, initialOrder, { ...stageRepeat, confirmedTick: stageRepeat.stagedTick }), 'unavailable');
  assert.equal(check(poses.map(p => p.deliveryCompleted === 0 && p.deliveryStage === 'dropoff' ? { ...p, x: p.x + 40 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.deliveryCompleted === 1 && p.deliverySearching ? { ...p, x: p.x + 40 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.deliveryCompleted === 1 && p.deliveryStage === 'dropoff' ? { ...p, deliveryCustomer: 99 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.deliveryCompleted === 2 && p.tick < 48 ? { ...p, x: p.x + 40 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.deliveryCompleted === 1 && p.deliverySearching ? { ...p, deliveryRestaurant: 99, deliveryCustomer: 99, deliverySearching: false } : p)), 'available');
  assert.equal(check(poses.map(p => ({ ...p, thrusters: 0 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, lastJump: 0 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, poseRevision: p.tick >= 52 ? 2 : 1 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, vy: 0 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, jumpBurstUntil: 0 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, thrusters: p.thrusters ? 2 : 0 }))), 'unavailable');
  assert.equal(check(poses.map(p => ({ ...p, thrusters: p.thrusters & 6 }))), 'unavailable');
  assert.equal(check(poses.map(p => p.tick === 52 ? { ...p, supported: false } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.tick === 64 ? { ...p, supported: false } : p)), 'unavailable');
  // The second jump's lift must not be reused for the preceding trigger, even
  // when a ground sample between them and sustained flight follow it.
  assert.equal(check(poses.map(p => p.tick === 48 || p.tick === 50 ? { ...p, supported: true, thrusters: 0, vy: 0 } : p)), 'unavailable');
  // A later trigger bounds the first jump even when that later burst is invalid.
  assert.equal(check(poses.map(p => p.tick === 48 || p.tick === 50 ? { ...p, supported: true, thrusters: 0, vy: 0 } : p.tick === 54 ? { ...p, jumpBurstUntil: 2 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.tick === 64 ? { ...p, lastJump: 3, jumpBurstUntil: 4 } : p)), 'unavailable');
  // A completed pair must not hide a later unfinished jump, or a route cut
  // short in the air when no additional trigger was observable.
  const thirdJump = { ...poses.at(-1)!, atMs: 3300, tick: 66, lastJump: 3, jumpBurstUntil: 4, supported: false, thrusters: 6, vy: 5 };
  assert.equal(check([...poses, thirdJump]), 'unavailable');
  assert.equal(check([...poses, { ...thirdJump, lastJump: 2, jumpBurstUntil: 3 }]), 'unavailable');
  assert.equal(check([...poses, thirdJump, { ...thirdJump, atMs: 3400, tick: 68, supported: true, thrusters: 0, vy: 0 }]), 'available');
  // Driving before or after a stationary airborne phase cannot count as flight.
  assert.equal(check(poses.map(p => p.tick >= 48 && p.tick <= 62 ? { ...p, x: 20 } : p.tick === 64 ? { ...p, x: 80 } : p)), 'unavailable');
  assert.equal(check(poses.map(p => p.tick >= 48 && p.tick <= 62 ? { ...p, x: p.tick === 52 ? 80 : 20 } : p)), 'unavailable');
  const shortForwardPulse = poses.map(p => p.tick >= 54 && p.tick <= 62 ? { ...p, thrusters: p.tick === 58 ? 7 : 6 } : p);
  assert.equal(check(shortForwardPulse), 'available', 'forward power need not last for the 400 ms sustained flight');
  const airborneDistance = (distance: number) => shortForwardPulse.map(p => p.tick >= 54 && p.tick <= 62 ? { ...p, x: 22 + (p.tick - 54) * distance / 8 } : p);
  assert.equal(check(airborneDistance(5)), 'unavailable', 'exactly five airborne meters is insufficient');
  assert.equal(check(airborneDistance(5.001)), 'available', 'more than five airborne meters is sufficient');
});

test('current reporter accepts the four archived cross-version trajectories with distinct lift and landing evidence', () => {
  const root = new URL('../docs/performance-baselines/2026-10-18-two-delivery-cross-version/', import.meta.url);
  const read = (name: string) => JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL(name, root)))).toString('utf8'));
  for (const prefix of ['base', 'candidate', 'base-video', 'candidate-video']) {
    const manifest = read(`${prefix}-manifest.json.gz`), poses = read(`${prefix}-trajectory.json.gz`);
    const event = (type: string) => manifest.events.find((e: any) => e.type === type && e.status === 'ok');
    const from = event('frameStart').commandStartedAtMs, to = event('frameStop').commandStartedAtMs;
    const samples = poses.filter((p: any) => p.atMs >= from && p.atMs <= to);
    const route = deliveryRoute(samples, event('waitForRoomReady').sample.initialOrder, event('stageRepeatDelivery').sample);
    assert.equal(route.status, 'available', `${prefix}: ${route.reason}`);
    assert.ok(route.jumps.length >= 2, prefix);
    for (let i = 0; i < route.jumps.length; i++) {
      const jump = route.jumps[i];
      assert.ok(jump.liftTick >= jump.tick && jump.landingTick > jump.liftTick, prefix);
      if (i) assert.ok(jump.tick > route.jumps[i - 1].landingTick, prefix);
      assert.ok(samples.some((p: any) => p.tick === jump.liftTick && p.supported === false && p.vy > .1 && (p.thrusters & 6) === 6), prefix);
      assert.ok(samples.some((p: any) => p.tick === jump.landingTick && p.supported === true), prefix);
    }
    assert.notEqual(route.jumps[0].liftTick, route.jumps[1].liftTick, prefix);
    assert.ok(route.flight.snapshots >= 5 && route.flight.durationMs >= 400, prefix);
    assert.ok(samples.some((p: any) => p.tick === route.flight.forwardThrustTick && p.supported === false && (p.thrusters & 7) === 7), prefix);
    const start = samples.find((p: any) => p.tick === route.flight.airborneStartTick && p.supported === false);
    const farthest = samples.find((p: any) => p.tick === route.flight.airborneDisplacementTick && p.supported === false);
    assert.ok(start && farthest && route.flight.airborneDisplacementM > 5, prefix);
    assert.ok(Math.abs(Math.hypot(farthest.x - start.x, farthest.z - start.z) - route.flight.airborneDisplacementM) < 1e-9, prefix);
    const hoverThenDrive = samples.map((p: any) => p.tick >= route.flight.airborneStartTick && p.tick <= route.flight.airborneEndTick
      ? { ...p, x: start.x, z: start.z } : p.tick > route.flight.airborneEndTick && p.supported === true ? { ...p, x: start.x + 50, z: start.z } : p);
    assert.equal(deliveryRoute(hoverThenDrive, event('waitForRoomReady').sample.initialOrder, event('stageRepeatDelivery').sample).status, 'unavailable', `${prefix}: ground travel cannot establish flight`);
  }
});

test('comparison holds when intermediate route legs diverge despite matching endpoints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-perf-path-'));
  try {
    const report = JSON.parse(readFileSync(fileURLToPath(new URL('../docs/performance-baselines/2026-10-18-v0.0.24-aeb5704/report.json', import.meta.url)), 'utf8'));
    report.fixture.reporterSha256 = 'same-reporter';
    report.fixture.stageSha256 = 'same-stage';
    report.fixture.seed = 0;
    report.fixture.captureVideo = false;
    report.route = { status: 'available', ...routeEvidence, legs: Array.from({ length: 5 }, () => ({ lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]) })) };
    const before = join(dir, 'before.json'), after = join(dir, 'after.json');
    writeFileSync(before, JSON.stringify(report));
    for (let i = 5; i < 35; i++) report.route.legs[1].points[i][1] = 80;
    writeFileSync(after, JSON.stringify(report));
    const script = fileURLToPath(new URL('../scripts/performance-compare.mjs', import.meta.url));
    const result = execFileSync(process.execPath, [script, before, after], { encoding: 'utf8' });
    assert.match(result.split('\n').find(line => line.startsWith('| Room simulated')) ?? '', /\| HOLD \|$/);
    assert.match(result, /path divergence exceeds tolerance/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('room progress requires a long continuous monotonic tick stream', () => {
  const pose = (atMs: number, tick: number, poseRevision = 1) => ({ atMs, tick, worldTime: tick * .05, poseRevision });
  const ticks = Array.from({ length: 601 }, (_, i) => pose(100 + i * 100, 100 + i * 2));
  assert.deepEqual(roomProgress(ticks, 0, 61000), { status: 'available', wallSeconds: 60, simulationSeconds: 60, ratio: 1, snapshots: 601, maxGapMs: 100 });
  assert.equal(roomProgress(ticks.slice(0, 100), 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([ticks[0], ticks.at(-1)!], 0, 61000).status, 'unavailable');
  assert.equal(roomProgress(ticks.filter(p => p.atMs < 20000 || p.atMs > 23000), 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([pose(100, 100), pose(60100, 90)], 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([pose(100, 100), pose(60100, 1300, 2)], 0, 61000).status, 'unavailable');
  assert.equal(roomProgress(ticks.map(p => ({ ...p, worldTime: null })), 0, 61000).status, 'unavailable');
  assert.equal(roomProgress(ticks.map(p => ({ ...p, worldTime: p.worldTime * .5 })), 0, 61000).ratio, .5);
});

test('motion summaries do not substitute zeros for missing responses', () => {
  assert.equal(motionMetrics({ results: [{ motion: {} }] }).status, 'unavailable');
  const report = { results: [{ motion: { travelToBodySpeedRatio: { p05: .98, p95: 1.05, samples: 42 }, frameMoveMaxM: .48 }, responses: [{ event: 'left', firstVisualMs: 8.333 }, { event: 'right', firstVisualMs: 16.667 }], adapter: { rejected: 2 } }] };
  assert.equal(motionMetrics(report).steeringResponseMs.left, 8.333);
  assert.equal(motionMetrics(report).rejectedInputs, 2);
});

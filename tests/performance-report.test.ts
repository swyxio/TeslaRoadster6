import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { browserFrameMetrics, deliveryRoute, frameMetrics, motionMetrics, performanceRoomName, roomProgress } from '../scripts/performance-report.mjs';
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

const initialOrder = { restaurant: { id: 'tartine', x: -180, z: 120 }, customer: { id: 'cable', x: 0, y: 0, z: -180, rooftop: false } };

test('performance scenario completes only the initial delivery before flight', () => {
  const scenario = JSON.parse(readFileSync(fileURLToPath(new URL('../scripts/playtests/performance-drive.json', import.meta.url)), 'utf8'));
  const milestones = scenario.steps.filter((step: { type: string }) => step.type === 'waitForDelivery');
  assert.deepEqual(milestones.map(({ completed, stage }: { completed: number; stage: string }) => [completed, stage]), [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup']]);
  const completedIndex = scenario.steps.indexOf(milestones.at(-1));
  assert.ok(!scenario.steps.slice(completedIndex + 1).some((step: { type: string; key?: string }) => step.type === 'keyPress' && step.key === 'Shift'));
  assert.equal(scenario.steps.filter((step: { type: string }) => step.type === 'jumpUntilAirborne').length, 2);
});

test('delivery route requires one completed delivery and observed jumps and powered flight', () => {
  const stages = [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup']] as const;
  const poses = stages.flatMap(([deliveryCompleted, deliveryStage], i) => Array.from({ length: 4 }, (_, j) => ({
    atMs: (i * 4 + j) * 100, tick: (i * 4 + j) * 2, poseRevision: 1, x: i * 20 + j, z: 0, y: 0,
    deliveryCompleted, deliveryStage, lastJump: 0, jumpBurstUntil: 0, supported: true, thrusters: 0, vy: 0,
  })));
  poses.push(...Array.from({ length: 9 }, (_, i) => ({ atMs: 1200 + i * 100, tick: 24 + i * 2, poseRevision: 1, x: 44 + i, z: 0, y: i === 2 || i === 8 ? 0 : i, deliveryCompleted: 1, deliveryStage: 'pickup' as const, lastJump: i < 3 ? 1 : 2, jumpBurstUntil: i < 3 ? 2 : 3, supported: i === 2 || i === 8, thrusters: i === 2 || i === 8 ? 0 : i < 3 ? 6 : 7, vy: i === 2 || i === 8 ? 0 : 5 })));
  const route = deliveryRoute(poses, initialOrder);
  assert.equal(route.status, 'available');
  assert.deepEqual(route.initialOrder, initialOrder);
  assert.equal(route.jumpCount, 2);
  assert.equal(route.legs.length, 3);
  assert.equal(deliveryRoute(poses, undefined).status, 'unavailable');
  assert.equal(deliveryRoute(poses.filter(p => p.deliveryCompleted < 1), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, thrusters: 0 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, lastJump: 0 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, poseRevision: p.tick >= 28 ? 2 : 1 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, vy: 0 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, jumpBurstUntil: 0 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, thrusters: p.thrusters ? 2 : 0 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => ({ ...p, thrusters: p.thrusters & 6 })), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => p.tick === 28 ? { ...p, supported: false } : p), initialOrder).status, 'unavailable');
  assert.equal(deliveryRoute(poses.map(p => p.tick === 40 ? { ...p, supported: false } : p), initialOrder).status, 'unavailable');
});

test('comparison holds when intermediate route legs diverge despite matching endpoints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-perf-path-'));
  try {
    const report = JSON.parse(readFileSync(fileURLToPath(new URL('../docs/performance-baselines/2026-10-18-v0.0.24-aeb5704/report.json', import.meta.url)), 'utf8'));
    report.fixture.reporterSha256 = 'same-reporter';
    report.fixture.stageSha256 = 'same-stage';
    report.fixture.seed = 0;
    report.fixture.captureVideo = false;
    report.route = { status: 'available', initialOrder, legs: Array.from({ length: 3 }, () => ({ lengthM: 100, points: Array.from({ length: 41 }, (_, i) => [i, 0, 0]) })) };
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

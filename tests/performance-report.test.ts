import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { browserFrameMetrics, frameMetrics, motionMetrics, performanceRoomName, roomProgress } from '../scripts/performance-report.mjs';
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

test('room progress requires a long continuous monotonic tick stream', () => {
  const pose = (atMs: number, tick: number, poseRevision = 1) => ({ atMs, tick, poseRevision });
  const ticks = Array.from({ length: 601 }, (_, i) => pose(100 + i * 100, 100 + i * 2));
  assert.deepEqual(roomProgress(ticks, 0, 61000), { status: 'available', wallSeconds: 60, simulationSeconds: 60, ratio: 1, snapshots: 601, maxGapMs: 100 });
  assert.equal(roomProgress(ticks.slice(0, 100), 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([ticks[0], ticks.at(-1)!], 0, 61000).status, 'unavailable');
  assert.equal(roomProgress(ticks.filter(p => p.atMs < 20000 || p.atMs > 23000), 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([pose(100, 100), pose(60100, 90)], 0, 61000).status, 'unavailable');
  assert.equal(roomProgress([pose(100, 100), pose(60100, 1300, 2)], 0, 61000).status, 'unavailable');
});

test('motion summaries do not substitute zeros for missing responses', () => {
  assert.equal(motionMetrics({ results: [{ motion: {} }] }).status, 'unavailable');
  const report = { results: [{ motion: { travelToBodySpeedRatio: { p05: .98, p95: 1.05, samples: 42 }, frameMoveMaxM: .48 }, responses: [{ event: 'left', firstVisualMs: 8.333 }, { event: 'right', firstVisualMs: 16.667 }], adapter: { rejected: 2 } }] };
  assert.equal(motionMetrics(report).steeringResponseMs.left, 8.333);
  assert.equal(motionMetrics(report).rejectedInputs, 2);
});

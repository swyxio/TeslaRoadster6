#!/usr/bin/env node
// Run one isolated local game and the deterministic motion fixture. This is a
// lab report, not a claim about a player's device or production throughput.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = data => createHash('sha256').update(data).digest('hex');
const round = n => Math.round(n * 1000) / 1000;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
const number = n => typeof n === 'number' && Number.isFinite(n);
export const performanceRoomName = () => `perf-${randomBytes(8).toString('hex')}`;

// Evaluate only snapshot intervals inside the requested measurement window.
// Missing, reset or too-short streams are unavailable, never zero.
export function roomProgress(poses, from, to) {
  const selected = poses.filter(p => number(p.atMs) && p.atMs >= from && p.atMs <= to && Number.isSafeInteger(p.tick));
  if (selected.length < 2) return { status: 'unavailable', reason: 'not enough tick snapshots' };
  if (selected.some((p, i) => i && (p.atMs < selected[i - 1].atMs || p.tick < selected[i - 1].tick || p.poseRevision !== selected[0].poseRevision)))
    return { status: 'unavailable', reason: 'non-monotonic samples or pose revision changed' };
  const first = selected[0], last = selected.at(-1), wallSeconds = (last.atMs - first.atMs) / 1000;
  if (wallSeconds < 58) return { status: 'unavailable', reason: 'less than 58 seconds of observed snapshots', wallSeconds: round(wallSeconds) };
  const simulationSeconds = (last.tick - first.tick) * .05;
  return { status: 'available', wallSeconds: round(wallSeconds), simulationSeconds: round(simulationSeconds), ratio: round(simulationSeconds / wallSeconds), snapshots: selected.length };
}

export function frameMetrics(sample) {
  const values = sample?.intervalsMs;
  if (!Array.isArray(values) || sample.truncated || values.length < 30 || values.some(n => !number(n) || n <= 0))
    return { status: 'unavailable', reason: 'too few, invalid or truncated animation intervals', samples: Array.isArray(values) ? values.length : 0 };
  return { status: 'available', p95Ms: round(percentile(values, .95)), samples: values.length, observedSeconds: round(values.reduce((a, b) => a + b, 0) / 1000) };
}

export function motionMetrics(report) {
  const result = report?.results?.[0];
  const ratio = result?.motion?.travelToBodySpeedRatio;
  const left = result?.responses?.find(r => r.event === 'left');
  const right = result?.responses?.find(r => r.event === 'right');
  if (!ratio || !number(ratio.p05) || !number(ratio.p95) || !number(left?.firstVisualMs) || !number(right?.firstVisualMs))
    return { status: 'unavailable', reason: 'missing motion samples or steering response' };
  return { status: 'available', speedRatio: ratio, maxStepM: result.motion.frameMoveMaxM, steeringResponseMs: { left: left.firstVisualMs, right: right.firstVisualMs }, rejectedInputs: result.adapter?.rejected ?? null };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error ?? result.stderr.slice(-5000)}`);
  return result.stdout;
}
async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a local port');
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}
async function command(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
  if (code !== 0) throw new Error(`Command failed (${code}): ${stderr.slice(-5000)}\n${stdout.slice(-2000)}`);
  return stdout;
}

async function main() {
  const { values } = parseArgs({ options: { 'target-root': { type: 'string', default: harness }, out: { type: 'string' }, gpu: { type: 'string', default: 'default' } } });
  if (!values.out) throw new Error('Specify a new --out directory');
  if (!['default', 'metal', 'vulkan', 'swiftshader'].includes(values.gpu)) throw new Error('Unknown GPU mode');
  const root = resolve(values['target-root']), out = resolve(values.out);
  await mkdir(out, { mode: 0o700 });
  const scenario = join(harness, 'scripts/playtests/performance-drive.json');
  const startedAt = new Date().toISOString(), loadBefore = os.loadavg();
  const revision = run('git', ['rev-parse', 'HEAD'], root).trim();
  const dirty = !!run('git', ['status', '--porcelain'], root).trim();
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const fixtureSha256 = sha(await readFile(join(root, 'scripts/motion-benchmark.ts')));
  const scenarioSha256 = sha(await readFile(scenario));
  const recorderSha256 = sha(await readFile(join(harness, 'scripts/playtest-record.ts')));
  const motion = {};
  for (const profile of ['steady150', 'bunched150']) {
    const trace = join(out, `motion-${profile}-trace.json`);
    const output = await command(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/motion-benchmark.ts'), '--scenario', 'fast-slalom', '--profile', profile, '--trace', trace], root);
    await writeFile(join(out, `motion-${profile}.json`), output);
    motion[profile] = motionMetrics(JSON.parse(output));
  }
  const port = await freePort(), roomName = performanceRoomName();
  const localState = await mkdtemp(join(os.tmpdir(), 'tesland-perf-state-'));
  const serverLog = [];
  const worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', 'tests/fixtures/wrangler.playtest-stage.jsonc', '--local', '--ip', '127.0.0.1', '--port', String(port), '--var', 'PLAYTEST_X:-300', '--var', 'PLAYTEST_Z:-2050', '--var', 'PLAYTEST_YAW:3.141592653589793', '--persist-to', localState], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let exited = false, workerError;
  worker.on('error', error => { workerError = error; });
  worker.on('exit', () => { exited = true; });
  worker.stdout.on('data', chunk => serverLog.push(String(chunk)));
  worker.stderr.on('data', chunk => serverLog.push(String(chunk)));
  let health;
  try {
    const deadline = Date.now() + 90000;
    while (!health && Date.now() < deadline) {
      if (workerError) throw workerError;
      if (exited) throw new Error(`Local Worker exited before readiness: ${serverLog.join('').slice(-4000)}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.status >= 500) throw new Error(`Local staging fixture failed: ${await response.text()}`);
        if (response.ok) health = await response.json();
      } catch (error) { if (error instanceof Error && error.message.startsWith('Local staging')) throw error; }
      if (!health) await delay(500);
    }
    if (!health) throw new Error('Local Worker did not become ready');
    const recorderOutput = await command(process.execPath, [join(harness, 'node_modules/tsx/dist/cli.mjs'), join(harness, 'scripts/playtest-record.ts'), '--url', `http://127.0.0.1:${port}/?room=${roomName}&perf`, '--target-ref', revision, '--scenario', scenario, '--out', join(out, 'browser'), '--gpu', values.gpu, '--no-video', '--trajectory'], harness);
    await writeFile(join(out, 'recorder.log'), recorderOutput);
  } finally {
    if (!exited && worker.pid) {
      try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGTERM'); } catch { /* already stopped */ }
      await Promise.race([new Promise(resolveExit => worker.once('exit', resolveExit)), delay(5000)]);
      if (!exited) {
        try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGKILL'); } catch { /* already stopped */ }
      }
    }
    await writeFile(join(out, 'worker.log'), serverLog.join(''));
    await rm(localState, { recursive: true, force: true });
  }
  const manifest = JSON.parse(await readFile(join(out, 'browser/manifest.json'), 'utf8'));
  const trajectory = JSON.parse(await readFile(join(out, 'browser/trajectory.json'), 'utf8'));
  const event = type => manifest.events.find(e => e.type === type && e.status === 'ok');
  const begin = event('recordStart'), end = event('recordStop'), frameStart = event('frameStart'), frameStop = event('frameStop');
  if (!begin || !end || !frameStart || !frameStop || manifest.status !== 'complete') throw new Error('Incomplete browser measurement');
  const inDrive = trajectory.filter(p => p.atMs >= frameStart.commandStartedAtMs && p.atMs <= frameStop.commandStartedAtMs);
  const first = inDrive[0], last = inDrive.at(-1);
  const displacement = first && last ? Math.hypot(last.x - first.x, last.z - first.z) : NaN;
  const driveLive = event('sample')?.sample?.connection?.startsWith('● LIVE');
  const frame = driveLive && number(displacement) && displacement > 1
    ? frameMetrics(frameStop.sample)
    : { status: 'unavailable', reason: 'game was not live or the observed driving path did not move' };
  const room = roomProgress(trajectory, begin.commandStartedAtMs, end.commandStartedAtMs);
  const report = {
    format: 1, startedAt, finishedAt: new Date().toISOString(), target: { revision, dirty, version, protocol: health.version },
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, loadAverageBefore: loadBefore, loadAverageAfter: os.loadavg(), ci: !!process.env.CI, runner: manifest.runner, viewport: manifest.viewport },
    fixture: { scenarioSha256, recorderSha256, motionBenchmarkSha256: fixtureSha256, start: { x: -300, z: -2050, yaw: Math.PI }, captureVideo: false },
    metrics: { browserFrameIntervalP95: frame, modeledMotion: motion, roomProgress: room },
    route: { first: first ?? null, last: last ?? null, samples: inDrive.length, displacementM: number(displacement) ? round(displacement) : null },
    notes: ['Browser p95 uses requestAnimationFrame callback timestamps, not GPU completion or display presentation.', 'Motion is a 120 Hz synthetic model with simulated latency; room progress uses received ticks over Node arrival time.', 'One local client and live background traffic; the server and browser share this host. Paths and contacts can diverge.', 'Single runs are descriptive, not a statistical regression verdict.'],
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });

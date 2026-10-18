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
  if (selected.some((p, i) => !number(p.worldTime) || (i && (p.atMs < selected[i - 1].atMs || p.tick < selected[i - 1].tick || p.worldTime < selected[i - 1].worldTime || p.poseRevision !== selected[0].poseRevision))))
    return { status: 'unavailable', reason: 'non-monotonic samples or pose revision changed' };
  const first = selected[0], last = selected.at(-1), wallSeconds = (last.atMs - first.atMs) / 1000;
  if (wallSeconds < 58) return { status: 'unavailable', reason: 'less than 58 seconds of observed snapshots', wallSeconds: round(wallSeconds) };
  const maxGapMs = Math.max(...selected.slice(1).map((p, i) => p.atMs - selected[i].atMs));
  if (selected.length < 200 || maxGapMs > 2000)
    return { status: 'unavailable', reason: 'insufficient continuous snapshot coverage', snapshots: selected.length, maxGapMs: round(maxGapMs) };
  const simulationSeconds = last.worldTime - first.worldTime;
  if (simulationSeconds <= 0) return { status: 'unavailable', reason: 'world time did not advance' };
  return { status: 'available', wallSeconds: round(wallSeconds), simulationSeconds: round(simulationSeconds), ratio: round(simulationSeconds / wallSeconds), snapshots: selected.length, maxGapMs: round(maxGapMs) };
}

export function frameMetrics(sample) {
  const values = sample?.intervalsMs;
  if (!Array.isArray(values) || sample.truncated || values.length < 30 || values.some(n => !number(n) || n <= 0))
    return { status: 'unavailable', reason: 'too few, invalid or truncated animation intervals', samples: Array.isArray(values) ? values.length : 0 };
  return { status: 'available', p95Ms: round(percentile(values, .95)), samples: values.length, observedSeconds: round(values.reduce((a, b) => a + b, 0) / 1000) };
}

export function browserFrameMetrics(manifest, frameStop, displacement) {
  const sample = manifest.events.find(e => e.type === 'sample' && e.status === 'ok')?.sample;
  const errors = manifest.browserErrors;
  if (!sample?.connection?.startsWith('● LIVE') || !number(displacement) || displacement <= 1 ||
      !number(sample.perf?.drawCalls) || sample.perf.drawCalls <= 0 || errors?.pageErrors !== 0 || errors?.consoleErrors !== 0)
    return { status: 'unavailable', reason: 'missing live movement, render activity or error-free browser evidence' };
  return frameMetrics(frameStop.sample);
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

// Compare the shape of each mission leg by distance traveled, not wall time:
// a slower room must not appear to take a different road solely due to timing.
function pathSummary(poses) {
  if (poses.length < 2) return null;
  const lengths = [0];
  for (let i = 1; i < poses.length; i++) lengths.push(lengths[i - 1] + Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y, poses[i].z - poses[i - 1].z));
  const length = lengths.at(-1);
  let index = 1;
  const points = Array.from({ length: 41 }, (_, i) => {
    const distance = length * i / 40;
    while (index < lengths.length - 1 && lengths[index] < distance) index++;
    const a = poses[index - 1], b = poses[index], span = lengths[index] - lengths[index - 1];
    const t = span ? (distance - lengths[index - 1]) / span : 0;
    return [round(a.x + (b.x - a.x) * t), round(a.y + (b.y - a.y) * t), round(a.z + (b.z - a.z) * t)];
  });
  return { lengthM: round(length), points };
}

export function deliveryRoute(poses) {
  const milestones = [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup'], [1, 'dropoff'], [2, 'pickup']];
  const indices = [];
  let searchFrom = 0;
  for (const [completed, stage] of milestones) {
    const offset = poses.slice(searchFrom).findIndex(p => p.deliveryCompleted === completed && p.deliveryStage === stage);
    if (offset < 0) return { status: 'unavailable', reason: `missing delivery ${completed} ${stage}` };
    const index = searchFrom + offset;
    indices.push(index); searchFrom = index + 1;
  }
  const flight = poses.slice(indices.at(-1));
  const routePoses = poses.slice(indices[0]);
  if (!Number.isSafeInteger(routePoses[0]?.poseRevision) || routePoses.some((p, i) => p.poseRevision !== routePoses[0].poseRevision || (i && (p.tick < routePoses[i - 1].tick || p.atMs < routePoses[i - 1].atMs))))
    return { status: 'unavailable', reason: 'route respawned or snapshots moved backwards' };
  const jumpChanges = [];
  for (let i = 1; i < flight.length; i++) {
    const before = flight[i - 1], after = flight[i];
    if (Number.isSafeInteger(before.lastJump) && after.lastJump > before.lastJump && after.tick > before.tick && number(before.jumpBurstUntil) && number(after.jumpBurstUntil) && after.jumpBurstUntil > before.jumpBurstUntil) {
      const lift = flight.slice(i, i + 8).find(p => p.atMs - after.atMs <= 700 && p.supported === false && number(p.vy) && p.vy > .1 && number(p.thrusters) && (p.thrusters & 6) === 6);
      if (lift) jumpChanges.push({ index: i, tick: after.tick, liftTick: lift.tick });
    }
  }
  // Require a continuous stream, not two isolated powered snapshots separated
  // by a long gap. Bits 2 and 4 are the game's downward rocket thrusters.
  let run = [], longest = [];
  for (const p of flight) {
    const powered = p.supported === false && Number.isSafeInteger(p.thrusters) && (p.thrusters & 6) === 6;
    const previous = run.at(-1);
    if (!powered || (previous && (p.tick <= previous.tick || p.tick - previous.tick > 4 || p.atMs - previous.atMs > 500))) run = [];
    if (powered) run.push(p);
    if (run.length > longest.length) longest = run.slice();
  }
  const sustainedFlight = longest.length >= 5 && longest.at(-1).atMs - longest[0].atMs >= 400;
  const landedBetween = jumpChanges.some((jump, i) => jumpChanges.slice(i + 1).some(next => flight.slice(jump.index + 1, next.index).some(p => p.supported === true)));
  const forwardThrust = flight.some(p => p.supported === false && Number.isSafeInteger(p.thrusters) && (p.thrusters & 7) === 7);
  const horizontalTravel = Math.max(...flight.map(p => Math.hypot(p.x - flight[0].x, p.z - flight[0].z)));
  if (!landedBetween || !sustainedFlight || !forwardThrust || horizontalTravel < 5) return { status: 'unavailable', reason: 'two jumps with an intervening landing and sustained forward-powered flight were not observed', jumpCount: jumpChanges.length, flightSnapshots: longest.length };
  const legs = indices.slice(0, -1).map((index, i) => pathSummary(poses.slice(index, indices[i + 1] + 1)));
  legs.push(pathSummary(flight));
  if (legs.some(leg => !leg)) return { status: 'unavailable', reason: 'not enough samples for all route legs' };
  return { status: 'available', milestones: indices.map((index, i) => ({ completed: milestones[i][0], stage: milestones[i][1], tick: poses[index].tick, x: round(poses[index].x), z: round(poses[index].z) })), jumpCount: jumpChanges.length, jumps: jumpChanges, flightSnapshots: longest.length, horizontalTravelM: round(horizontalTravel), peakY: round(Math.max(...flight.map(p => p.y))), legs };
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
async function command(command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('exit', resolveExit); });
  if (code !== 0) throw new Error(`Command failed (${code}): ${stderr.slice(-5000)}\n${stdout.slice(-2000)}`);
  return stdout;
}

async function main() {
  const { values } = parseArgs({ options: { 'target-root': { type: 'string', default: harness }, out: { type: 'string' }, gpu: { type: 'string', default: 'default' }, video: { type: 'boolean', default: false } } });
  if (!values.out) throw new Error('Specify a new --out directory');
  if (!['default', 'metal', 'vulkan', 'swiftshader'].includes(values.gpu)) throw new Error('Unknown GPU mode');
  const root = resolve(values['target-root']), out = resolve(values.out);
  await mkdir(out, { mode: 0o700 });
  const scenario = join(harness, 'scripts/playtests/performance-drive.json');
  const startedAt = new Date().toISOString();
  const revision = run('git', ['rev-parse', 'HEAD'], root).trim();
  const dirty = !!run('git', ['status', '--porcelain'], root).trim();
  // dist is ignored and can be left behind by another checkout. Build the
  // selected source here instead of trusting existing assets for attribution.
  await writeFile(join(out, 'build.log'), await command('pnpm', ['build'], root));
  if (run('git', ['rev-parse', 'HEAD'], root).trim() !== revision || !!run('git', ['status', '--porcelain'], root).trim() !== dirty)
    throw new Error('Target checkout changed during its build');
  const loadBefore = os.loadavg();
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const fixtureSha256 = sha(await readFile(join(root, 'scripts/motion-benchmark.ts')));
  const adapterSha256 = sha(await readFile(join(root, 'scripts/motion-adapter-ticks.ts')));
  const scenarioSha256 = sha(await readFile(scenario));
  const recorderSha256 = sha(await readFile(join(harness, 'scripts/playtest-record.ts')));
  const reporterSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  const stageSource = await readFile(join(harness, 'tests/fixtures/playtest-stage-worker.ts'), 'utf8');
  const stageConfig = await readFile(join(harness, 'tests/fixtures/wrangler.playtest-stage.jsonc'), 'utf8');
  const stageSha256 = sha(stageSource + stageConfig);
  const motion = {};
  for (const profile of ['steady150', 'bunched150']) {
    const trace = join(out, `motion-${profile}-trace.json`);
    const output = await command(process.execPath, [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/motion-benchmark.ts'), '--scenario', 'fast-slalom', '--profile', profile, '--trace', trace], root);
    await writeFile(join(out, `motion-${profile}.json`), output);
    motion[profile] = motionMetrics(JSON.parse(output));
  }
  const port = await freePort();
  let inspectorPort = await freePort();
  while (inspectorPort === port) inspectorPort = await freePort();
  const roomName = performanceRoomName();
  const localState = await mkdtemp(join(os.tmpdir(), 'tesland-perf-state-'));
  // Mount one harness against each checkout's own server and simulation. The
  // historical checkout's older fixture must never silently become the test.
  const mountedStage = stageSource.replace(/(['"])\.\.\/\.\.\/(worker|shared)\/([^'"]+)\1/g,
    (_match, _quote, directory, module) => JSON.stringify(join(root, directory, `${module}.ts`)));
  const stageFile = join(localState, 'playtest-stage-worker.ts');
  const stageConfigFile = join(localState, 'wrangler.json');
  const config = JSON.parse(stageConfig.replace(/^\s*\/\/.*$/gm, ''));
  config.main = stageFile;
  config.assets.directory = join(root, 'dist');
  await writeFile(stageFile, mountedStage);
  await writeFile(stageConfigFile, JSON.stringify(config));
  const stageSecret = randomBytes(32).toString('hex');
  const secretFile = join(localState, 'stage.env');
  const serverLog = [];
  const safeServerLog = () => serverLog.join('').replaceAll(stageSecret, '[redacted]');
  let worker;
  let exited = false, workerError;
  let health;
  try {
    // Wrangler loads only this 0600 per-run secret as a secret_text binding;
    // the recorder receives it via its environment, never command arguments.
    await writeFile(secretFile, `PLAYTEST_STAGE_SECRET=${stageSecret}\n`, { mode: 0o600, flag: 'wx' });
    worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', stageConfigFile, '--env-file', secretFile, '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspectorPort), '--var', 'PLAYTEST_X:-190', '--var', 'PLAYTEST_Z:120', '--var', 'PLAYTEST_YAW:-1.5707963267948966', '--var', 'PLAYTEST_SEED:0', '--var', 'PLAYTEST_PAUSE:1', '--persist-to', join(localState, 'storage')], { cwd: root, env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    worker.on('error', error => { workerError = error; });
    worker.on('exit', () => { exited = true; });
    worker.stdout.on('data', chunk => serverLog.push(String(chunk)));
    worker.stderr.on('data', chunk => serverLog.push(String(chunk)));
    const deadline = Date.now() + 90000;
    while (!health && Date.now() < deadline) {
      if (workerError) throw workerError;
      if (exited) throw new Error(`Local Worker exited before readiness: ${safeServerLog().slice(-4000)}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.status >= 500) throw new Error(`Local staging fixture failed: ${await response.text()}`);
        if (response.ok) health = await response.json();
      } catch (error) { if (error instanceof Error && error.message.startsWith('Local staging')) throw error; }
      if (!health) await delay(500);
    }
    if (!health) throw new Error('Local Worker did not become ready');
    const recorderOutput = await command(process.execPath, [join(harness, 'node_modules/tsx/dist/cli.mjs'), join(harness, 'scripts/playtest-record.ts'), '--url', `http://127.0.0.1:${port}/?room=${roomName}&perf`, '--target-ref', revision, '--scenario', scenario, '--out', join(out, 'browser'), '--gpu', values.gpu, ...(values.video ? [] : ['--no-video']), '--trajectory'], harness, { ...process.env, PLAYTEST_STAGE_SECRET: stageSecret });
    await writeFile(join(out, 'recorder.log'), recorderOutput);
  } finally {
    if (worker && !exited && worker.pid) {
      try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGTERM'); } catch { /* already stopped */ }
      await Promise.race([new Promise(resolveExit => worker.once('exit', resolveExit)), delay(5000)]);
      if (!exited) {
        try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGKILL'); } catch { /* already stopped */ }
      }
    }
    try { await writeFile(join(out, 'worker.log'), safeServerLog()); }
    finally { await rm(localState, { recursive: true, force: true }); }
  }
  const manifest = JSON.parse(await readFile(join(out, 'browser/manifest.json'), 'utf8'));
  const trajectory = JSON.parse(await readFile(join(out, 'browser/trajectory.json'), 'utf8'));
  const event = type => manifest.events.find(e => e.type === type && e.status === 'ok');
  const begin = event('recordStart'), end = event('recordStop'), frameStart = event('frameStart'), frameStop = event('frameStop');
  if (!begin || !end || !frameStart || !frameStop || manifest.status !== 'complete') throw new Error('Incomplete browser measurement');
  const inDrive = trajectory.filter(p => p.atMs >= frameStart.commandStartedAtMs && p.atMs <= frameStop.commandStartedAtMs);
  const first = inDrive[0], last = inDrive.at(-1);
  const displacement = first && last ? Math.hypot(last.x - first.x, last.z - first.z) : NaN;
  const frame = browserFrameMetrics(manifest, frameStop, displacement);
  const room = [begin, end].every(e => e.sample?.connection?.startsWith('● LIVE'))
    ? roomProgress(trajectory, begin.commandStartedAtMs, end.commandStartedAtMs)
    : { status: 'unavailable', reason: 'room was not live for the measurement window' };
  const route = deliveryRoute(inDrive);
  const report = {
    format: 1, startedAt, finishedAt: new Date().toISOString(), target: { revision, dirty, version, protocol: health.version },
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, loadAverageBefore: loadBefore, loadAverageAfter: os.loadavg(), ci: !!process.env.CI, runner: manifest.runner, viewport: manifest.viewport },
    fixture: { scenarioSha256, recorderSha256, reporterSha256, stageSha256, motionBenchmarkSha256: fixtureSha256, motionAdapterSha256: adapterSha256, seed: 0, start: { x: -190, z: 120, yaw: -Math.PI / 2 }, captureVideo: !!values.video },
    metrics: { browserFrameIntervalP95: frame, modeledMotion: motion, roomProgress: room },
    route: { ...route, first: first ?? null, last: last ?? null, samples: inDrive.length, displacementM: number(displacement) ? round(displacement) : null },
    notes: ['Browser p95 uses requestAnimationFrame callback timestamps, not GPU completion or display presentation.', 'Motion is a 120 Hz synthetic model with simulated latency; room progress uses received ticks over Node arrival time.', 'The local-only fixture seeds traffic and pauses at readiness, then runs the ordinary room tick. Street Pilot follows two deliveries, then keyboard jump and flight.', 'One local client and live background traffic; server and browser share this host. Video changes workload and is reported separately.', 'Single runs are descriptive, not a statistical regression verdict.'],
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });

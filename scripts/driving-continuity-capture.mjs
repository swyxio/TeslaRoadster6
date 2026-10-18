#!/usr/bin/env node
// Disposable local-only motion collection, using the target revision's own
// StageRoom and game runtime. Usage:
// node scripts/driving-continuity-capture.mjs --root /PATH/TO/CLEAN/REVISION \
//   --out /private/tmp/NEW-DIRECTORY --profile zero|steady150|bunched150|gap250
// This collects diagnostics, not a release-gate pass. In particular, Worker
// tick completion times remain unproven and contact coverage is ground-only.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import os from 'node:os';
import { continuityWorkerSource } from './continuity-worker-template.mjs';
import { instrumentGroundGame } from './continuity-ground-instrument.mjs';
import { checkSources, instrument, plugin } from '../docs/performance-baselines/2026-10-18-sandbox-collections/motion-harness/instrument.mjs';
import { createNetworkProfile, profiles } from '../docs/performance-baselines/2026-10-18-sandbox-collections/motion-harness/network-profile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const harness = resolve(here, '../docs/performance-baselines/2026-10-18-sandbox-collections/motion-harness');
export function clockBounds(before, after) {
  if (![before, after].every(b => Number.isFinite(b?.beforeBrowserMs) && Number.isFinite(b?.afterBrowserMs) &&
      b.afterBrowserMs >= b.beforeBrowserMs && Number.isFinite(b?.authorityEpochMs))) return null;
  return { browserMinusAuthorityMinMs: Math.min(before.beforeBrowserMs - before.authorityEpochMs, after.beforeBrowserMs - after.authorityEpochMs),
    browserMinusAuthorityMaxMs: Math.max(before.afterBrowserMs - before.authorityEpochMs, after.afterBrowserMs - after.authorityEpochMs) };
}

// Completion describes the retained diagnostic scenario, not a release pass.
// Validate only samples in its marked browser window, not warm-up activity.
export function assessCapture({ trace, authority, profile, routed, connections, pageErrors, consoleErrors, networkErrors, pending, connectionAtEnd, cleanAfter }) {
  const invalid = [], fail = (reason, ok) => { if (!ok) invalid.push(reason); };
  const list = value => Array.isArray(value) ? value : [];
  const marks = list(trace?.marks), starts = marks.filter(x => x?.label === 'drive-start'), ends = marks.filter(x => x?.label === 'drive-end');
  const startMs = starts[0]?.atMs, endMs = ends[0]?.atMs;
  const windowOK = starts.length === 1 && ends.length === 1 && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const inside = x => windowOK && Number.isFinite(x?.atMs) && x.atMs >= startMs && x.atMs <= endMs;
  const frames = list(trace?.frames).filter(inside), states = list(trace?.states).filter(inside);
  const controls = list(trace?.controls).filter(inside), sentEntries = list(trace?.sent).filter(inside), sent = sentEntries.map(x => x.input);
  const events = list(trace?.events).filter(inside);
  const ordered = values => values.every((value, i) => i === 0 || value.atMs >= values[i - 1].atMs);
  const distance = (a, b) => ['x', 'y', 'z'].every(k => Number.isFinite(a?.[k]) && Number.isFinite(b?.[k]))
    ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : null;
  const displacementM = distance(frames[0]?.visual, frames.at(-1)?.visual);
  const stateDisplacementM = distance(states[0]?.car, states.at(-1)?.car);
  const lastSnapshotAgeMs = states.length ? endMs - states.at(-1).atMs : null;
  const requiredEvents = [['keydown','KeyW'], ['keydown','KeyD'], ['keyup','KeyD'], ['keydown','KeyA'],
    ['keyup','KeyA'], ['keyup','KeyW'], ['keydown','Space'], ['keyup','Space']];
  let eventIndex = 0;
  for (const e of events) if (e.trusted && e.type === requiredEvents[eventIndex]?.[0] && e.code === requiredEvents[eventIndex]?.[1]) eventIndex++;
  const missingEvents = requiredEvents.slice(eventIndex);
  const predicates = [
    c => c?.throttle > 0 && c.steer === 0 && c.brake === false,
    c => c?.throttle > 0 && c.steer < 0 && c.brake === false,
    c => c?.throttle > 0 && c.steer > 0 && c.brake === false,
    c => c?.throttle > 0 && c.steer === 0 && c.brake === false,
    c => c?.throttle === 0 && c.brake === true,
    c => c?.throttle === 0 && c.brake === false,
  ];
  const controlStages = values => {
    let index = 0;
    for (const value of values) if (predicates[index]?.(value)) index++;
    return index;
  };
  const observedControlStages = controlStages(controls), sentControlStages = controlStages(sent);
  const turnaroundCount = list(trace?.turnarounds).filter(t => Number.isFinite(t?.receivedAtMs) &&
    t.receivedAtMs >= startMs && t.receivedAtMs <= endMs && Number.isFinite(t.elapsedMs) && t.elapsedMs > 0).length;
  const gap = routed?.gap, networkEvents = list(routed?.events);
  let gapOK = profiles.includes(profile) && profile !== 'gap250';
  if (profile === 'gap250' && gap && [gap.armedAtNodeMs, gap.startAtNodeMs, gap.endTargetAtNodeMs, gap.firstAfterNodeMs].every(Number.isFinite)) {
    const forwarded = networkEvents.filter(e => e.event === 'forwarded' && e.direction === 'down');
    const held = networkEvents.filter(e => e.event === 'enqueued' && e.direction === 'down' && e.gapDelayMs > 0 &&
      e.seenAtNodeMs < gap.endTargetAtNodeMs && e.releaseTargetNodeMs >= gap.endTargetAtNodeMs);
    gapOK = gap.armedAtNodeMs <= gap.startAtNodeMs && gap.endTargetAtNodeMs - gap.startAtNodeMs >= 250 &&
      gap.firstAfterNodeMs >= gap.endTargetAtNodeMs && Number.isSafeInteger(gap.held) && gap.held > 0 &&
      forwarded.every(e => Number.isFinite(e.forwardInvokedNodeMs) && !(e.forwardInvokedNodeMs > gap.startAtNodeMs && e.forwardInvokedNodeMs < gap.endTargetAtNodeMs)) &&
      held.some(e => forwarded.some(f => f.id === e.id && f.forwardInvokedNodeMs >= gap.endTargetAtNodeMs)) &&
      networkEvents.some(e => e.event === 'gap-start' && e.forwardInvokedNodeMs === gap.startAtNodeMs) &&
      networkEvents.some(e => e.event === 'gap-end' && e.forwardInvokedNodeMs === gap.firstAfterNodeMs);
  }
  const ticks = list(authority?.ticks), revision = ticks.at(-1)?.poseRevision;
  const finalPoseTicks = ticks.filter(t => t.poseRevision === revision);
  const authorityDisplacementM = distance(finalPoseTicks[0], finalPoseTicks.at(-1));
  fail('invalid-window', windowOK);
  fail('incomplete-window-frames', frames.length >= 30 && ordered(frames) && frames[0]?.atMs - startMs <= 1000 && endMs - frames.at(-1)?.atMs <= 1000);
  fail('incomplete-window-snapshots', states.length >= 5 && ordered(states) && states[0]?.atMs - startMs <= 1000 && lastSnapshotAgeMs >= 0 && lastSnapshotAgeMs <= 1000);
  fail('insufficient-motion', displacementM > 10 && stateDisplacementM > 10 && authorityDisplacementM > 10);
  fail('incomplete-controls', ordered(controls) && ordered(sentEntries) && observedControlStages === predicates.length && sentControlStages === predicates.length);
  fail('missing-or-unordered-events', ordered(events) && missingEvents.length === 0);
  fail('missing-turnaround', turnaroundCount > 0);
  fail('incomplete-authority', authority?.complete === true && authority?.dropped === 0 && authority?.failed === 0 &&
    finalPoseTicks.length > 20 && Number.isSafeInteger(revision) && ticks.every((t, i) => Number.isSafeInteger(t.tick) &&
      (i === 0 || t.tick === ticks[i - 1].tick + 1) && Array.isArray(t.contactReasons)));
  fail('incomplete-browser-trace', trace?.errors === 0 && ['frames', 'states', 'sent', 'controls', 'events', 'marks', 'turnarounds'].every(k => trace?.dropped?.[k] === 0) &&
    Object.values(trace?.dropped ?? {}).every(n => n === 0));
  fail('relay-or-page-error', connections === 1 && pageErrors === 0 && consoleErrors === 0 && networkErrors === 0 && pending === 0 &&
    routed?.overflow === false && routed?.sendsFailed === 0 && routed?.droppedEvents === 0);
  fail('unsuccessful-gap', gapOK);
  fail('connection-or-target-changed', connectionAtEnd?.includes('LIVE') === true && cleanAfter === true);
  return { complete: invalid.length === 0, invalid, startMs, endMs, frames: frames.length, states: states.length,
    displacementM, stateDisplacementM, authorityDisplacementM, lastSnapshotAgeMs, missingEvents,
    observedControlStages, sentControlStages, turnaroundCount, gapOK };
}
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function main() {
  const { values } = parseArgs({ options: { root: { type: 'string' }, out: { type: 'string' }, profile: { type: 'string', default: 'zero' }, gpu: { type: 'string', default: 'metal' } } });
  if (!values.root || !values.out || !profiles.includes(values.profile) || !['metal', 'default', 'vulkan', 'swiftshader'].includes(values.gpu))
    throw new Error('Specify --root CLEAN_CHECKOUT --out /private/tmp/NEW_DIRECTORY --profile zero|steady150|bunched150|gap250 [--gpu metal|default|vulkan|swiftshader]');
  const root = await realpath(resolve(values.root)), out = resolve(values.out);
  if (!out.startsWith('/private/tmp/')) throw new Error('Output must be a new directory under /private/tmp');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const revision = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain')) throw new Error('Target checkout must be clean before collection');
  const require = createRequire(join(root, 'package.json')), stage = join(root, 'tests/fixtures/playtest-stage-worker.ts');
  const checked = await checkSources(root), typescript = require('typescript');
  for (const item of checked) {
    const source = instrument(item.path, await readFile(join(root, item.path), 'utf8'));
    const result = typescript.transpileModule(source, { fileName: item.path, reportDiagnostics: true, compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext } });
    if ((result.diagnostics || []).some(d => d.category === typescript.DiagnosticCategory.Error)) throw new Error(`Instrumentation failed to compile: ${item.path}`);
  }
  await mkdir(out, { mode: 0o700 });
  const startedAt = new Date().toISOString(), loadBefore = os.loadavg(), secret = randomBytes(32).toString('hex');
  const room = `motion-${randomBytes(5).toString('hex')}`, worker = join(out, 'stage-worker.ts'), config = join(out, 'wrangler.json');
  const dist = join(out, 'dist'), viteCache = join(out, 'vite-cache');
  const stageSource = await readFile(stage, 'utf8');
  const sourceHashes = Object.fromEntries(await Promise.all([
    ['targetStage', stage], ['targetWorker', join(root, 'worker/index.ts')], ['targetGame', join(root, 'shared/game.ts')], ['runner', fileURLToPath(import.meta.url)],
    ['workerTemplate', join(here, 'continuity-worker-template.mjs')], ['groundInstrumentation', join(here, 'continuity-ground-instrument.mjs')], ['instrumentation', join(harness, 'instrument.mjs')],
    ['browserInit', join(harness, 'browser-init.js')], ['relay', join(harness, 'network-profile.mjs')],
  ].map(async ([name, path]) => [name, sha256(await readFile(path))])));
  let child, browser, context, exited = false, childError, logs = '', network, storage, archiveDir, resultWritten = false;
  try {
    // Wrangler watches the worker entry point's directory. Persisted SQLite
    // must be a sibling temp directory, otherwise each write can reload it.
    storage = await mkdtemp('/private/tmp/tesland-continuity-storage-');
    // Only the disposable exact-commit archive receives gameplay trace hooks.
    // Files are rechecked against the clean checkout before instrumentation.
    archiveDir = await mkdtemp('/private/tmp/tesland-continuity-source-');
    const tar = join(archiveDir, 'target.tar');
    execFileSync('git', ['archive', '--format=tar', `--output=${tar}`, revision], { cwd: root, stdio: 'pipe' });
    execFileSync('tar', ['-xf', tar, '-C', archiveDir], { stdio: 'pipe' });
    await rm(tar);
    await symlink(join(root, 'node_modules'), join(archiveDir, 'node_modules'), 'dir');
    const archivedStage = join(archiveDir, 'tests/fixtures/playtest-stage-worker.ts');
    const archivedGame = join(archiveDir, 'shared/game.ts');
    if (sha256(await readFile(archivedStage)) !== sourceHashes.targetStage || sha256(await readFile(archivedGame)) !== sourceHashes.targetGame)
      throw new Error('Archived gameplay or stage differs from the clean target checkout');
    const instrumentedGame = instrumentGroundGame(await readFile(archivedGame, 'utf8'));
    const transpiledGame = typescript.transpileModule(instrumentedGame, { fileName: archivedGame, reportDiagnostics: true,
      compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext } });
    if ((transpiledGame.diagnostics || []).some(d => d.category === typescript.DiagnosticCategory.Error)) throw new Error('Ground instrumentation failed to compile');
    sourceHashes.instrumentedGame = sha256(instrumentedGame);
    await writeFile(archivedGame, instrumentedGame);
    await writeFile(join(out, 'ground-instrumented-game.ts'), instrumentedGame, { mode: 0o600 });
    const vite = await import(pathToFileURL(require.resolve('vite')).href);
    await vite.build({ root, configFile: join(root, 'vite.config.ts'), configLoader: 'runner', cacheDir: viteCache,
      build: { outDir: dist, emptyOutDir: true, manifest: true }, plugins: [plugin(root)] });
    await writeFile(worker, continuityWorkerSource(archivedStage, { grounded: true }), { mode: 0o600 });
    await writeFile(config, JSON.stringify({ name: 'tesland-local-continuity', main: worker, compatibility_date: '2026-10-17',
      assets: { directory: dist, binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] },
      vars: { MAX_PLAYERS: '8', PLAYTEST_X: '-300', PLAYTEST_Z: '-2050', PLAYTEST_YAW: String(Math.PI), PLAYTEST_TRACE_SECRET: secret },
      durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'GameRoom' }, { name: 'CHAT', class_name: 'GlobalChat' },
        { name: 'DRIVERS', class_name: 'DriverProfile' }, { name: 'ECONOMIES', class_name: 'RoomEconomy' },
        { name: 'INCOME', class_name: 'GlobalIncome' }, { name: 'GLOBAL_EVENTS', class_name: 'GlobalEarningsEvent' }, { name: 'MARKET', class_name: 'MarketService' }] },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['GameRoom'] }, { tag: 'v2', new_sqlite_classes: ['GlobalChat'] },
        { tag: 'v3', new_sqlite_classes: ['DriverProfile', 'RoomEconomy', 'GlobalIncome'] },
        { tag: 'v4', new_sqlite_classes: ['GlobalEarningsEvent'] }, { tag: 'v5', new_sqlite_classes: ['MarketService'] }] }, null, 2), { mode: 0o600 });
    const port = await freePort(), origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', config, '--local',
      '--ip', '127.0.0.1', '--port', String(port), '--persist-to', storage, '--show-interactive-dev-session', 'false'],
    { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true', BROWSER: 'none' } });
    child.on('exit', () => { exited = true; }); child.on('error', error => { childError = error; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + String(chunk)).slice(-200000); });
    let health;
    for (const deadline = Date.now() + 90000; !health && Date.now() < deadline;) {
      if (childError || exited) throw childError || new Error('Wrangler exited before readiness');
      try { const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) }); if (response.ok) health = await response.json(); } catch {}
      if (!health) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!health) throw new Error('Wrangler readiness timed out');
    const { chromium } = require('playwright');
    const gpuArgs = values.gpu === 'metal' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] :
      values.gpu === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu'] :
      values.gpu === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
    browser = await chromium.launch({ headless: true, args: gpuArgs });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript({ path: join(harness, 'browser-init.js') });
    await context.addInitScript(() => {
      const record = { supported: false, entries: [], dropped: 0 };
      window.__continuityLongTasks = record;
      try {
        if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
        new PerformanceObserver(list => { for (const e of list.getEntries()) {
          if (record.entries.length < 4000) record.entries.push({ atMs: e.startTime, durationMs: e.duration }); else record.dropped++;
        } }).observe({ type: 'longtask', buffered: true });
        record.supported = true;
      } catch { record.supported = false; }
    });
    const page = await context.newPage(); let pageErrors = 0, consoleErrors = 0, connections = 0, networkErrors = 0;
    page.on('pageerror', () => pageErrors++); page.on('console', m => { if (m.type() === 'error') consoleErrors++; });
    network = createNetworkProfile(values.profile);
    await page.routeWebSocket(url => url.host === `127.0.0.1:${port}` && url.pathname === `/api/room/${room}`, socket => {
      connections++; const server = socket.connectToServer();
      const forward = (direction, target) => message => {
        try { network.enqueue(direction, message, payload => target.send(payload)); }
        catch { networkErrors++; void socket.close({ code: 1011, reason: 'Local trace relay error' }).catch(() => {}); }
      };
      socket.onMessage(forward('up', server)); server.onMessage(forward('down', socket));
    });
    const response = await page.goto(`${origin}/?room=${room}&perf`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!response?.ok()) throw new Error(`Game page HTTP ${response?.status()}`);
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (!gl) return null; const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const data = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
      gl.getExtension('WEBGL_lose_context')?.loseContext(); return data;
    });
    await page.waitForFunction(() => document.querySelector('#connection')?.textContent?.includes('LIVE') && window.__teslandTrace?.states?.some(s => s.poseRevision >= 1), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const initial = await page.evaluate(() => window.__teslandTrace.states.at(-1));
    if (!initial || Math.hypot(initial.car.x + 300, initial.car.z + 2050) > 1 || Math.abs(Math.atan2(Math.sin(initial.car.yaw - Math.PI), Math.cos(initial.car.yaw - Math.PI))) > .01 ||
        Math.hypot(initial.car.vx, initial.car.vy, initial.car.vz) > .5 || initial.car.supportId !== 'ground' || initial.car.kind !== 'roadster' || initial.otherEntities !== 0)
      throw new Error('Initial local staged pose is not the requested stationary Roadster');
    async function calibrate() {
      return page.evaluate(async ({ path, token }) => {
        const beforeBrowserMs = performance.now();
        const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) throw new Error(`Clock HTTP ${response.status}`);
        const data = await response.json(), afterBrowserMs = performance.now();
        return { beforeBrowserMs, afterBrowserMs, authorityEpochMs: data.authorityEpochMs, workerPerformanceNowMs: data.workerPerformanceNowMs };
      }, { path: `/api/continuity/clock/${room}`, token: secret });
    }
    const clockBefore = await calibrate(); network.startScenario();
    await page.evaluate(() => window.__teslandTraceMark('drive-start'));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(3000);
    if (values.profile === 'gap250') { await page.evaluate(() => window.__teslandTraceMark('gap-armed-request')); network.armGap(); }
    await page.waitForTimeout(1000); await page.keyboard.down('KeyD'); await page.waitForTimeout(1000);
    await page.keyboard.up('KeyD'); await page.keyboard.down('KeyA'); await page.waitForTimeout(1000);
    await page.keyboard.up('KeyA'); await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW'); await page.keyboard.down('Space'); await page.waitForTimeout(1000);
    await page.keyboard.up('Space'); await page.waitForTimeout(1000);
    await page.evaluate(() => window.__teslandTraceMark('drive-end'));
    const clockAfter = await calibrate();
    const trace = await page.evaluate(() => window.__teslandTrace), longTasks = await page.evaluate(() => window.__continuityLongTasks);
    const connectionAtEnd = await page.evaluate(() => document.querySelector('#connection')?.textContent?.trim() ?? null);
    const authResponse = await fetch(`${origin}/api/continuity/read/${room}`, { headers: { Authorization: `Bearer ${secret}` } });
    if (!authResponse.ok) throw new Error(`Authority trace HTTP ${authResponse.status}`);
    const authority = await authResponse.json();
    const cutoff = performance.now(), drainDeadline = cutoff + 3000;
    while (network.pendingBefore(cutoff) > 0 && performance.now() < drainDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    const pending = network.pendingBefore(cutoff), routed = network.snapshot(), bounds = clockBounds(clockBefore, clockAfter);
    const cleanAfter = !git('status', '--porcelain') && git('rev-parse', 'HEAD') === revision;
    const assessment = assessCapture({ trace, authority, profile: values.profile, routed, connections, pageErrors, consoleErrors, networkErrors, pending, connectionAtEnd, cleanAfter });
    const { complete, startMs, endMs } = assessment;
    Object.assign(authority.clock, bounds ?? {}, { bracketedBefore: !!bounds, bracketedAfter: !!bounds, offsetModel: 'bounded' });
    const metadata = { format: 1, revision, startedAt, finishedAt: new Date().toISOString(), health, sourceHashes,
      stage: { targetFixture: stage, targetStageSha256: sourceHashes.targetStage, targetWorkerSha256: sourceHashes.targetWorker,
        schedulerObservation: stageSource.includes("Reflect.get(this, 'startTicks')") ? 'target-stage-startTicks' : 'target-stage-original-timer',
        room: 'fresh loopback room, initial ambient vehicles removed; exact target stage and runtime in a disposable archive with ground-only trace hooks',
        collisionCoverage: 'grounded-path-v1', instrumentedGameSha256: sourceHashes.instrumentedGame },
      environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
        loadBefore, loadAfter: os.loadavg(), node: process.version, browser: browser.version(), renderer, gpu: values.gpu, viewport: { width: 1280, height: 720, dpr: 1 } },
      setup: { initial, profile: values.profile, clockBefore, clockAfter, bounds,
        clockNote: 'Brackets are observations only: Worker clocks may freeze within CPU work; no tick-completion error or clock continuity is proven.',
        scenario: 'W 4s, W+D 1s, W+A 1s, W 2s, W release + brake 1s, brake release 1s' },
      observation: { ...assessment, pageErrors, consoleErrors, networkErrors, connections, pending, connectionAtEnd, cleanAfter,
        authorityTicks: authority.ticks.length, dropped: trace.dropped,
        longTasksSupported: longTasks?.supported === true, longTasksDropped: longTasks?.dropped ?? null },
      limitations: ['Diagnostic only. Collision coverage is confined to instrumented ground paths; tick-completion clocks remain unproven, so this cannot establish the speed gate.',
        'Ground trace hooks can perturb runtime timing; this capture is not a room throughput measurement.',
        'Submitted scene callbacks are not GPU completion or display photons. This is neither touch nor a physical device.',
        'Application-message delay is injected by a FIFO relay; it is not physical network RTT.',
        'One ambient-reduced local room is not a representative room throughput or rendering test.'] };
    await Promise.all([
      writeFile(join(out, 'capture.json'), JSON.stringify({ trace, authority, window: { startMs, endMs } }, null, 2) + '\n', { mode: 0o600 }),
      writeFile(join(out, 'network-trace.json'), JSON.stringify(routed, null, 2) + '\n', { mode: 0o600 }),
      writeFile(join(out, 'longtasks.json'), JSON.stringify(longTasks, null, 2) + '\n', { mode: 0o600 }),
      writeFile(join(out, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 }),
    ]);
    resultWritten = true; console.log(JSON.stringify(metadata, null, 2)); if (!complete) process.exitCode = 1;
  } finally {
    network?.stop();
    if (context) await context.close().catch(() => {}); if (browser) await browser.close().catch(() => {});
    if (child && !exited && child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]); }
    if (child && !exited && child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await writeFile(join(out, 'worker.log'), logs.replaceAll(secret, '[redacted]'), { mode: 0o600 });
    await Promise.all([config, storage, archiveDir, dist, viteCache].filter(Boolean).map(path => rm(path, { recursive: true, force: true })));
    if (!resultWritten) console.error('Capture incomplete; worker log retained with temporary secret redacted.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });

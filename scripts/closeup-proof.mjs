#!/usr/bin/env node
// Seeded still-image and control smoke checks, not a performance benchmark.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  'base-root': { type: 'string' }, 'candidate-root': { type: 'string' },
  out: { type: 'string' }, gpu: { type: 'string', default: 'default' },
} });
if (!values['base-root'] || !values['candidate-root'] || !values.out || !['default', 'metal', 'vulkan', 'swiftshader'].includes(values.gpu)) {
  throw new Error('Usage: node scripts/visual-proof.mjs --base-root DIR --candidate-root DIR --out NEW_DIR [--gpu default|metal|vulkan|swiftshader]');
}
const roots = { base: resolve(values['base-root']), candidate: resolve(values['candidate-root']) };
const out = resolve(values.out);
await mkdir(out, { mode: 0o700 });

const viewports = Object.fromEntries(['character', 'showroom', 'npc'].map(name => [name, { width: 1920, height: 1080, deviceScaleFactor: 1 }]));
const stages = [
  { name: 'city', x: -190, z: 120, yaw: -Math.PI / 2, views: ['character', 'showroom'] },
  // traffic-4 is seeded at (567,117); clearance is checked by the fixture.
  { name: 'npc', x: 562, z: 120, yaw: Math.PI / 2, views: ['npc'] },
];
const imagesFor = name => [name];
function scenario(viewport, name) {
  const steps = [
    { type: 'waitFor', selector: '#connection:has-text("LIVE")', timeoutMs: 60000 },
    { type: 'waitFor', selector: '#hud:not(.hidden)', state: 'attached', timeoutMs: 60000 },
    { type: 'waitForPoseRevision', value: 1, timeoutMs: 30000 },
    { type: 'waitForRoomReady', timeoutMs: 30000 },
    { type: 'wait', ms: 1500 },
  ];
  if (name === 'npc') return { freshGuest: true, viewport, steps: [...steps, { type: 'screenshot', name }] };
  if (name === 'showroom') return { freshGuest: true, viewport, steps: [...steps,
    { type: 'keyPress', key: 'KeyG' },
    { type: 'waitFor', selector: '#fleet-dialog[open]', timeoutMs: 30000 },
    { type: 'wait', ms: 500 },
    { type: 'screenshot', name, selector: '#fleet-preview' },
  ] };
  return { freshGuest: true, viewport, steps: [...steps,
    { type: 'beginRoom' },
    { type: 'waitForTicks', count: 4 },
    { type: 'keyPress', key: 'KeyF' },
    { type: 'waitFor', selector: '#vehicle:has-text("ON FOOT")', timeoutMs: 30000 },
    { type: 'keyDown', key: 'KeyW' },
    { type: 'waitForTicks', count: 70 },
    { type: 'keyUp', key: 'KeyW' },
    { type: 'keyDown', key: 'Space' },
    { type: 'waitForTicks', count: 12 },
    { type: 'keyUp', key: 'Space' },
    { type: 'wait', ms: 1200 },
    { type: 'screenshot', name },
    { type: 'sample' },
  ] };
}

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.error || result.stderr}`);
  return result.stdout.trim();
}
async function command(executable, args, cwd, env = process.env) {
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done); });
  return { code, output };
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port');
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return address.port;
}

const scenarioFiles = {};
for (const [name, viewport] of Object.entries(viewports)) {
  scenarioFiles[name] = join(out, `${name}-scenario.json`);
  await writeFile(scenarioFiles[name], JSON.stringify(scenario(viewport, name), null, 2) + '\n');
}
const stageSource = await readFile(join(harness, 'tests/fixtures/playtest-stage-worker.ts'), 'utf8');
const stageConfig = await readFile(join(harness, 'tests/fixtures/wrangler.playtest-stage.jsonc'), 'utf8');
const results = {};
for (const [label, root] of Object.entries(roots)) {
  const targetDir = join(out, label);
  await mkdir(targetDir);
  const revision = git(root, 'rev-parse', 'HEAD');
  if (git(root, 'status', '--porcelain')) throw new Error(`${label} checkout must be clean`);
  const build = await command('pnpm', ['build'], root);
  await writeFile(join(targetDir, 'build.log'), build.output);
  if (build.code !== 0 || git(root, 'rev-parse', 'HEAD') !== revision || git(root, 'status', '--porcelain')) throw new Error(`${label} build failed or checkout changed`);
  results[label] = { revision, viewports: {} };
  for (const stage of stages) {
    const localState = await mkdtemp(join(os.tmpdir(), 'tesland-visual-'));
    const stageFile = join(localState, 'stage.ts');
    const stageConfigFile = join(localState, 'wrangler.json');
    const stageSecret = randomBytes(32).toString('hex');
    const secretFile = join(localState, 'stage.env');
    const config = JSON.parse(stageConfig.replace(/^\s*\/\/.*$/gm, ''));
    config.main = stageFile;
    config.assets.directory = join(root, 'dist');
    await writeFile(stageFile, stageSource.replace(/(['"])\.\.\/\.\.\/(worker|shared)\/([^'"]+)\1/g,
      (_match, _quote, directory, module) => JSON.stringify(join(root, directory, `${module}.ts`))));
    await writeFile(stageConfigFile, JSON.stringify(config));
    await writeFile(secretFile, `PLAYTEST_STAGE_SECRET=${stageSecret}\n`, { mode: 0o600, flag: 'wx' });
    const port = await freePort();
    let inspectorPort = await freePort();
    while (inspectorPort === port) inspectorPort = await freePort();
    let workerLog = '', exited = false, workerError;
    const worker = spawn(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', stageConfigFile,
      '--env-file', secretFile, '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspectorPort),
      '--var', `PLAYTEST_X:${stage.x}`, '--var', `PLAYTEST_Z:${stage.z}`, '--var', `PLAYTEST_YAW:${stage.yaw}`,
      '--var', 'PLAYTEST_SEED:0', '--var', 'PLAYTEST_PAUSE:1', '--persist-to', join(localState, 'storage')],
      { cwd: root, env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    worker.on('error', error => { workerError = error; });
    worker.on('exit', () => { exited = true; });
    worker.stdout.on('data', data => { workerLog += data; });
    worker.stderr.on('data', data => { workerLog += data; });
    try {
      let ready = false;
      const deadline = Date.now() + 90000;
      while (!ready && Date.now() < deadline) {
        if (workerError || exited) throw workerError || new Error('Staged worker exited before readiness');
        try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { /* waiting for local worker */ }
        if (!ready) await delay(500);
      }
      if (!ready) throw new Error('Staged worker did not become ready');
      for (const name of stage.views) {
        const dir = join(targetDir, name);
        const run = await command(process.execPath, [join(harness, 'node_modules/tsx/dist/cli.mjs'), join(harness, 'scripts/playtest-record.ts'),
          '--url', `http://127.0.0.1:${port}/?room=visual-${name}&perf&visual-actors`, '--target-ref', revision,
          '--scenario', scenarioFiles[name], '--out', dir, '--gpu', values.gpu, '--no-video', '--trajectory'],
          harness, { ...process.env, PLAYTEST_STAGE_SECRET: stageSecret });
        await writeFile(join(targetDir, `${name}.log`), run.output.replaceAll(stageSecret, '[redacted]'));
        try {
          const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
          const trajectory = JSON.parse(await readFile(join(dir, 'trajectory.json'), 'utf8'));
          const screenshots = {};
          for (const image of imagesFor(name)) {
            const event = manifest.events.find(e => e.type === 'screenshot' && e.sample?.file === `${image}.png` && e.status === 'ok');
            const pose = event && trajectory.filter(p => p.atMs <= event.commandStartedAtMs).at(-1);
            screenshots[image] = pose ? { tick: pose.tick, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, speed: pose.speed, visual: pose.visual } : null;
          }
          const pose = screenshots[name], car = pose?.visual?.car, traffic = pose?.visual?.traffic;
          const clearanceM = car && pose ? Math.hypot(pose.x - car.x, pose.z - car.z) : null;
          const trafficClearanceM = traffic && pose ? Math.hypot(pose.x - traffic.x, pose.z - traffic.z) : null;
          const sceneObserved = name === 'character' ? pose?.visual?.kind === 'person' && clearanceM >= 15 && Math.abs(pose.speed) < .5
            : name === 'showroom' ? pose?.visual?.kind === 'roadster' && manifest.events.some(e => e.type === 'waitFor' && e.status === 'ok' && e.commandStartedAtMs > manifest.events.find(f => f.type === 'keyPress' && f.key === 'KeyG')?.commandStartedAtMs)
            : traffic?.kind === 'waymo-firefly' && traffic?.npc === true && trafficClearanceM > 4;
          const ok = run.code === 0 && manifest.status === 'complete' && manifest.browserErrors?.pageErrors === 0 &&
            manifest.browserErrors?.consoleErrors === 0 && manifest.trajectory?.status === 'available' &&
            !!sceneObserved &&
            !!manifest.runner?.webgl?.renderer && Object.values(screenshots).every(Boolean);
          results[label].viewports[name] = { ok, viewport: manifest.viewport, renderer: manifest.runner?.webgl?.renderer ?? null,
            browserErrors: manifest.browserErrors, sceneObserved, clearanceM, trafficClearanceM, screenshots };
        } catch (error) { results[label].viewports[name] = { ok: false, error: String(error) }; }
      }
    } catch (error) {
      for (const name of stage.views) results[label].viewports[name] ??= { ok: false, error: String(error) };
    } finally {
      if (!exited && worker.pid) {
        try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGTERM'); } catch { /* already stopped */ }
        await Promise.race([new Promise(done => worker.once('exit', done)), delay(5000)]);
        if (!exited) try { process.kill(process.platform === 'win32' ? worker.pid : -worker.pid, 'SIGKILL'); } catch { /* already stopped */ }
      }
      await writeFile(join(targetDir, `${stage.name}-worker.log`), workerLog.replaceAll(stageSecret, '[redacted]'));
      await rm(localState, { recursive: true, force: true });
    }
  }
}

// Nearest received authoritative poses describe the approximate scene, not
// the exact displayed camera at screenshot time; inspect the images too.
const comparison = {};
for (const name of Object.keys(viewports)) {
  comparison[name] = {};
  for (const image of imagesFor(name)) {
    const a = results.base.viewports[name]?.screenshots?.[image];
    const b = results.candidate.viewports[name]?.screenshots?.[image];
    const distanceM = a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : null;
    const ta = a?.visual?.traffic, tb = b?.visual?.traffic;
    const npcDifferenceM = ta && tb ? Math.hypot(ta.x - tb.x, ta.y - tb.y, ta.z - tb.z) : null;
    comparison[name][image] = a && b ? { distanceM, tickDifference: b.tick - a.tick, npcDifferenceM,
      matched: distanceM <= 2 && (name !== 'npc' || (npcDifferenceM !== null && npcDifferenceM <= .05)) } : null;
  }
}
await writeFile(join(out, 'summary.json'), JSON.stringify({ results, comparison,
  note: 'Hosted Chromium stills; showroom uses separate preview lighting. Pose samples are approximate. This is not video, a physical-device check, or a frame-time measurement.' }, null, 2) + '\n');
console.log(JSON.stringify({ results, comparison }, null, 2));
if (Object.values(results).some(result => Object.values(result.viewports).some(viewport => !viewport.ok)) ||
    Object.values(comparison).some(views => Object.values(views).some(view => !view?.matched))) process.exitCode = 1;

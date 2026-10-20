// Local, paired Embarcadero benchmark. Run only in a reserved quiet window:
// node scripts/embarcadero-perf.mjs <baseline-vite-url> <candidate-vite-url> <output-directory>
// Both URLs must serve the Vite source module, not a bundled production build.
// The script records one cold startup and one instrumented driving/static pass
// for each leg, in baseline/candidate/candidate/baseline (ABBA) order.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [baselineUrl, candidateUrl, outputDirectory] = process.argv.slice(2);
if (!baselineUrl || !candidateUrl || !outputDirectory || process.argv.length !== 5) {
  throw new Error('Expected: baseline Vite URL, candidate Vite URL, output directory');
}
for (const value of [baselineUrl, candidateUrl]) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('This recorder only runs against local, disposable servers');
  }
  if (!url.pathname.startsWith('/experiments/embarcadero/')) {
    throw new Error(`Not an Embarcadero demo URL: ${value}`);
  }
}
await mkdir(outputDirectory, { recursive: true });
if ((await readdir(outputDirectory)).length) throw new Error('Output directory must be empty; use a fresh path for each run');

const viewport = { width: 1440, height: 900 };
const dpr = 1;
const poses = {
  start: { car: { x: 2.15, y: 0, z: 20, yaw: 0 }, camera: [-1.2, 1.9, 25.3], look: [6.95, 1, 12] },
  ferry: { car: { x: 2.15, y: 0, z: -155, yaw: 0 }, camera: [-1.2, 1.9, -149.7], look: [6.95, 1, -163] },
  aerial: { car: { x: 20, y: 45, z: -220, yaw: 0 }, camera: [16.65, 46.9, -214.7], look: [24.8, 46, -228] },
};
const plan = [
  { name: 'acceleration', ms: 2200, keys: ['w'] },
  { name: 'turn-right', ms: 450, keys: ['w', 'd'] },
  { name: 'straight', ms: 300, keys: ['w'] },
  { name: 'turn-left', ms: 450, keys: ['w', 'a'] },
  { name: 'straight', ms: 1200, keys: ['w'] },
  { name: 'flight', ms: 1800, keys: [' '] },
  { name: 'brake-and-land', ms: 2400, keys: ['b'] },
];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
};
const describe = values => ({ p50: quantile(values, .5), p95: quantile(values, .95), p99: quantile(values, .99) });

// This is diagnostic code injected equally into the two unmodified Vite
// responses. Explicitly fail on changed anchors rather than benchmarking the
// wrong code. It holds poses only for static views. Moving measurements use
// the normal simulation. The GPU timer is polled asynchronously, sampled once
// per eight frames and discarded when disjoint; it never blocks for a result.
function instrument(source) {
  const replacements = [
    [
      'Object.assign(window, { __embarcaderoSample: () => ({',
      `const __embHarness = { frozen: false, camera: null, submitMs: null, gpuMs: null, gpuSequence: 0, frame: 0, queries: [] };
const __embGl = renderer.getContext();
const __embGpuExt = __embGl.getExtension('EXT_disjoint_timer_query_webgl2');
Object.assign(window, {
  __embarcaderoStage: (pose) => {
    clearInputs(); setSelfDriving(false);
    Object.assign(state, initialCar(), pose.car);
    previous = { ...state }; accumulator = 0; cameraReady = false;
    __embHarness.camera = pose; __embHarness.frozen = true;
  },
  __embarcaderoUnstage: () => { __embHarness.frozen = false; __embHarness.camera = null; accumulator = 0; cameraReady = false; },
  __embarcaderoGpuAvailable: Boolean(__embGpuExt),
});
Object.assign(window, { __embarcaderoSample: () => ({`,
    ],
    [
      'triangles: renderer.info.render.triangles',
      `triangles: renderer.info.render.triangles,
  cameraQx: camera.quaternion.x, cameraQy: camera.quaternion.y, cameraQz: camera.quaternion.z, cameraQw: camera.quaternion.w,
  cameraFov: camera.fov, cpuSubmitMs: __embHarness.submitMs, gpuMs: __embHarness.gpuMs, gpuSequence: __embHarness.gpuSequence,`,
    ],
    [
      'while (accumulator >= fixedStep) {',
      'if (__embHarness.frozen) accumulator = 0;\n  while (!__embHarness.frozen && accumulator >= fixedStep) {',
    ],
    [
      'camera.lookAt(cameraLook);',
      `camera.lookAt(cameraLook);
  if (__embHarness.camera) {
    const p = __embHarness.camera;
    camera.position.set(...p.camera); camera.lookAt(...p.look);
    if (camera.fov !== 52) { camera.fov = 52; camera.updateProjectionMatrix(); }
  }`,
    ],
    [
      'renderer.render(scene, camera);',
      `let __embQuery = null;
  if (__embGpuExt && __embHarness.queries.length < 8 && __embHarness.frame++ % 8 === 0) {
    __embQuery = __embGl.createQuery();
    if (__embQuery) __embGl.beginQuery(__embGpuExt.TIME_ELAPSED_EXT, __embQuery);
  }
  const __embStarted = performance.now();
  renderer.render(scene, camera);
  __embHarness.submitMs = performance.now() - __embStarted;
  if (__embQuery) { __embGl.endQuery(__embGpuExt.TIME_ELAPSED_EXT); __embHarness.queries.push(__embQuery); }
  if (__embHarness.queries.length && __embGl.getQueryParameter(__embHarness.queries[0], __embGl.QUERY_RESULT_AVAILABLE)) {
    const q = __embHarness.queries.shift();
    const disjoint = __embGl.getParameter(__embGpuExt.GPU_DISJOINT_EXT);
    const ns = __embGl.getQueryParameter(q, __embGl.QUERY_RESULT);
    __embGl.deleteQuery(q);
    if (!disjoint) { __embHarness.gpuMs = ns / 1e6; __embHarness.gpuSequence++; }
  }`,
    ],
  ];
  for (const [needle, replacement] of replacements) {
    if (source.split(needle).length !== 2) throw new Error(`Diagnostic source anchor missing or ambiguous: ${needle}`);
    source = source.replace(needle, replacement);
  }
  return source;
}

async function coldStartup(browser, url) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const requests = new Map();
  await session.send('Network.enable');
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  session.on('Network.responseReceived', ({ requestId, response, type }) => {
    requests.set(requestId, { url: response.url, mime: response.mimeType, type, status: response.status, bytes: null });
  });
  session.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    const request = requests.get(requestId);
    if (request) request.bytes = encodedDataLength;
  });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const start = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#scene canvas') && !document.querySelector('#loading'), null, { timeout: 30000 });
  const readyMs = performance.now() - start;
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  const settledMs = performance.now() - start;
  const navigation = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? { domContentLoadedEventEnd: n.domContentLoadedEventEnd, loadEventEnd: n.loadEventEnd } : null;
  });
  const entries = [...requests.values()];
  const totals = { all: 0, js: 0, css: 0, images: 0, other: 0, missingSizes: 0 };
  for (const entry of entries) {
    if (entry.bytes == null) { totals.missingSizes++; continue; }
    totals.all += entry.bytes;
    const category = entry.type === 'Script' || /javascript/.test(entry.mime) ? 'js'
      : entry.type === 'Stylesheet' || /text\/css/.test(entry.mime) ? 'css'
        : entry.type === 'Image' || entry.mime.startsWith('image/') ? 'images' : 'other';
    totals[category] += entry.bytes;
  }
  await context.close();
  return { readyMs, settledMs, navigation, transfer: { ...totals, requests: entries }, errors };
}

async function collect(page, durationMs, phases = []) {
  return page.evaluate(({ durationMs, phases }) => new Promise(resolve => {
    const frames = [];
    const start = performance.now();
    let active = new Set();
    let phase = '';
    const step = now => {
      const elapsed = now - start;
      let phaseStart = 0;
      const current = phases.find(item => {
        const found = elapsed >= phaseStart && elapsed < phaseStart + item.ms;
        phaseStart += item.ms;
        return found;
      });
      if (current) {
        phase = current.name;
        const next = new Set(current.keys);
        for (const key of active) if (!next.has(key)) window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        for (const key of next) if (!active.has(key)) window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        active = next;
      }
      frames.push({ elapsed, phase, visibility: document.visibilityState, focused: document.hasFocus(), ...window.__embarcaderoSample() });
      if (elapsed < durationMs) requestAnimationFrame(step);
      else {
        for (const key of active) window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        resolve(frames);
      }
    };
    requestAnimationFrame(step);
  }), { durationMs, phases });
}

function summarise(frames) {
  const intervals = [];
  const ratios = [];
  const gpu = [];
  let gpuSequence = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.gpuSequence && f.gpuSequence !== gpuSequence && Number.isFinite(f.gpuMs)) {
      gpu.push(f.gpuMs); gpuSequence = f.gpuSequence;
    }
    if (i === 0) continue;
    const a = frames[i - 1], dt = f.elapsed - a.elapsed;
    if (!(dt > 0)) continue;
    intervals.push(dt);
    if ((f.phase === 'straight' || f.phase.startsWith('turn')) && f.phase === a.phase && Math.abs(f.simulationSpeed) > 10) {
      ratios.push(Math.hypot(f.x - a.x, f.z - a.z) / (dt / 1000) / Math.abs(f.simulationSpeed));
    }
  }
  return {
    frames: frames.length, hiddenFrames: frames.filter(f => f.visibility !== 'visible').length,
    unfocusedFrames: frames.filter(f => !f.focused).length,
    frameIntervalMs: describe(intervals), framesOver20ms: intervals.filter(v => v > 20).length,
    framesOver50ms: intervals.filter(v => v > 50).length,
    drawCalls: describe(frames.map(f => f.drawCalls)), triangles: describe(frames.map(f => f.triangles)),
    cpuSubmitMs: describe(frames.map(f => f.cpuSubmitMs)),
    gpuRenderMs: { ...describe(gpu), samples: gpu.length },
    visualToSimulatedSpeed: { p05: quantile(ratios, .05), p95: quantile(ratios, .95), samples: ratios.length },
    first: frames[0] || null, last: frames.at(-1) || null,
  };
}

function comparePoses(base, candidate, requirePhase) {
  const distance = [], cameraDistance = [], angle = [], cameraAngle = [];
  let j = 0;
  for (const a of base) {
    while (j + 1 < candidate.length && Math.abs(candidate[j + 1].elapsed - a.elapsed) <= Math.abs(candidate[j].elapsed - a.elapsed)) j++;
    const b = candidate[j];
    if (!b || Math.abs(b.elapsed - a.elapsed) > 50 || (requirePhase && b.phase !== a.phase)) continue;
    distance.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    cameraDistance.push(Math.hypot(a.cameraX - b.cameraX, a.cameraY - b.cameraY, a.cameraZ - b.cameraZ));
    angle.push(Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw))) * 180 / Math.PI);
    const dot = Math.min(1, Math.abs(a.cameraQx * b.cameraQx + a.cameraQy * b.cameraQy + a.cameraQz * b.cameraQz + a.cameraQw * b.cameraQw));
    cameraAngle.push(2 * Math.acos(dot) * 180 / Math.PI);
  }
  return { samples: distance.length, carDistanceM: describe(distance), cameraDistanceM: describe(cameraDistance),
    carYawDegrees: describe(angle), cameraAngleDegrees: describe(cameraAngle) };
}

async function measuredPass(browser, url, name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  const assetHashes = [];
  const assetReads = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.startsWith('/src/embarcadero/') && !pathname.startsWith('/embarcadero/')) return;
    assetReads.push(response.body().then(body => {
      assetHashes.push({ pathname, status: response.status(), bytes: body.length, sha256: sha256(body) });
    }).catch(error => errors.push(`Could not hash ${pathname}: ${String(error)}`)));
  });
  let moduleSeen = false;
  let injection;
  await page.route(/\/src\/embarcadero\/main\.ts(?:\?|$)/, async route => {
    if (moduleSeen) throw new Error('Multiple main modules were intercepted');
    moduleSeen = true;
    const response = await route.fetch();
    const original = await response.text();
    const modified = instrument(original);
    injection = { originalSha256: sha256(original), instrumentedSha256: sha256(modified) };
    await writeFile(path.join(outputDirectory, `${name}-main-original.js`), original);
    await writeFile(path.join(outputDirectory, `${name}-main-instrumented.js`), modified);
    await route.fulfill({ response, body: modified });
  });
  const measuredUrl = new URL(url);
  measuredUrl.searchParams.delete('autodrive');
  await page.goto(measuredUrl.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#scene canvas') && !document.querySelector('#loading'), null, { timeout: 30000 });
  if (!moduleSeen) throw new Error('No Vite main module intercepted; bundled builds cannot be compared by this recorder');
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await Promise.all(assetReads);
  await page.waitForTimeout(2500);
  await page.keyboard.press('h');
  const hardware = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      renderer: gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
      vendor: gl && info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
      devicePixelRatio, visibility: document.visibilityState, focused: document.hasFocus(),
      gpuTimerSupported: window.__embarcaderoGpuAvailable,
    };
  });
  const duration = plan.reduce((sum, p) => sum + p.ms, 0);
  const moving = await collect(page, duration, plan);
  const views = {};
  for (const [label, pose] of Object.entries(poses)) {
    await page.evaluate(p => window.__embarcaderoStage(p), pose);
    await page.waitForTimeout(1500);
    const frames = await collect(page, 3000);
    await page.screenshot({ path: path.join(outputDirectory, `${name}-${label}.png`) });
    views[label] = { pose, summary: summarise(frames), frames };
  }
  await Promise.all(assetReads);
  assetHashes.sort((a, b) => a.pathname.localeCompare(b.pathname));
  await context.close();
  return { injection, assetHashes, hardware, errors, moving: { plan, summary: summarise(moving), frames: moving }, views };
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--enable-webgl'] });
const legs = [];
try {
  for (const [index, [label, url]] of [['A', baselineUrl], ['B', candidateUrl], ['B', candidateUrl], ['A', baselineUrl]].entries()) {
    const name = `${index + 1}-${label}`;
    const loadBefore = os.loadavg();
    const cold = await coldStartup(browser, url);
    const pass = await measuredPass(browser, url, name);
    const leg = { name, url, date: new Date().toISOString(), loadBefore, loadAfter: os.loadavg(), cold, ...pass };
    await writeFile(path.join(outputDirectory, `${name}.json`), JSON.stringify(leg, null, 2));
    legs.push(leg);
    console.log(JSON.stringify({ name, loadBefore, loadAfter: leg.loadAfter, startupMs: cold.readyMs,
      transferBytes: cold.transfer.all, errors: [...cold.errors, ...pass.errors], moving: pass.moving.summary,
      views: Object.fromEntries(Object.entries(pass.views).map(([key, view]) => [key, view.summary])) }));
  }
} finally {
  await browser.close();
}
const result = {
  date: new Date().toISOString(), browser: browser.version(), viewport: { ...viewport, dpr }, poses, plan,
  host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
  method: 'Cold startup is unmodified with browser cache disabled. Measured pass has the same saved in-memory Vite instrumentation in both variants. Static views freeze the simulated car and lock the world camera; moving trace uses normal physics and scripted synthetic key events. RAF intervals are browser callback timing, not physical display timing. CPU submit is CPU wall time for renderer.render, not GPU completion. EXT GPU samples cover queried render commands only and do not measure presentation. Compare moving positions and orientations before attributing timing differences; a mismatch, contention, or a 30 Hz cap is inconclusive.',
  legs,
};
result.comparisons = [[0, 1], [3, 2]].map(([a, b]) => {
  const moving = comparePoses(legs[a].moving.frames, legs[b].moving.frames, true);
  const views = Object.fromEntries(Object.keys(poses).map(label => [label, comparePoses(legs[a].views[label].frames, legs[b].views[label].frames, false)]));
  return { baseline: legs[a].name, candidate: legs[b].name, moving, views,
    review: 'Inspect pose differences and host load before attributing timing differences; no statistical acceptance is implied.' };
});
result.withinVariantStability = {
  baseline: JSON.stringify(legs[0].assetHashes) === JSON.stringify(legs[3].assetHashes),
  candidate: JSON.stringify(legs[1].assetHashes) === JSON.stringify(legs[2].assetHashes),
};
await writeFile(path.join(outputDirectory, 'abba.json'), JSON.stringify(result, null, 2));
if (legs.some(leg => leg.cold.errors.length || leg.errors.length)) process.exitCode = 1;

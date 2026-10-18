/** Local browser playtests. The control server is deliberately loopback-only. */
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page, type WebSocket as PlaywrightWebSocket } from 'playwright';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import os from 'node:os';

// Recordings may contain chat and other private on-screen data.
process.umask(0o077);

type Action = Record<string, unknown> & { type: string };
type Scenario = { viewport?: { width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean; hasTouch?: boolean }; steps: Action[] };
type ManifestEvent = { type: string; commandStartedAtMs: number; commandDurationMs: number; status: 'ok' | 'failed'; key?: string; sample?: unknown };

const { values } = parseArgs({ options: {
  url: { type: 'string' }, scenario: { type: 'string' }, out: { type: 'string' },
  'target-ref': { type: 'string' }, browser: { type: 'string', default: 'chromium' },
  gpu: { type: 'string', default: 'default' }, headed: { type: 'boolean', default: false },
  serve: { type: 'boolean', default: false }, port: { type: 'string', default: '0' },
  width: { type: 'string', default: '1280' }, height: { type: 'string', default: '720' },
  fps: { type: 'string', default: '30' }, 'no-video': { type: 'boolean', default: false },
  trajectory: { type: 'boolean', default: false },
  mobile: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('pnpm playtest:record --url URL --target-ref REF [--scenario FILE | --serve] [--out NEW_DIRECTORY] [--headed] [--gpu default|metal|vulkan]');
  process.exit(0);
}
if (!values.url || !values['target-ref'] || (!!values.scenario === !!values.serve)) throw new Error('Specify --url, --target-ref, and exactly one of --scenario or --serve.');
const target = new URL(values.url);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('URL must be HTTP(S) without embedded credentials.');
if (!['chromium', 'chrome'].includes(values.browser!)) throw new Error('Browser must be chromium or chrome.');
if (!['default', 'metal', 'vulkan'].includes(values.gpu!)) throw new Error('GPU must be default, metal, or vulkan.');
const secret = process.env.TESLAND_PLAYTEST_SECRET;
if (values.serve && (!secret || Buffer.byteLength(secret) < 32)) throw new Error('Set TESLAND_PLAYTEST_SECRET to at least 32 bytes for the local control server.');
const fps = Number(values.fps);
if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('FPS must be an integer from 1 to 60.');
const scenarioBytes = values.scenario ? await readFile(resolve(values.scenario)) : null;
const scenario = scenarioBytes ? JSON.parse(scenarioBytes.toString()) as Scenario : { steps: [] };
if (!Array.isArray(scenario.steps)) throw new Error('Scenario steps must be an array.');
const view = scenario.viewport ?? { width: Number(values.width), height: Number(values.height), isMobile: values.mobile, hasTouch: values.mobile };
if (!Number.isInteger(view.width) || !Number.isInteger(view.height) || view.width < 200 || view.width > 3840 || view.height < 200 || view.height > 2160 || (view.deviceScaleFactor !== undefined && (!(view.deviceScaleFactor > 0) || view.deviceScaleFactor > 4))) throw new Error('Invalid viewport.');
const out = resolve(values.out ?? join('playtest-runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`));
await mkdir(dirname(out), { recursive: true });
// The run directory must be new; never overwrite unrelated artifacts.
await mkdir(out, { mode: 0o700 });
await writeFile(join(out, '.playtest-run'), '', { flag: 'wx' });
const id = randomUUID();
const started = performance.now();
const manifest: Record<string, unknown> = {
  format: 1, id, startedAt: new Date().toISOString(), status: 'running',
  target: { origin: target.origin, pathname: target.pathname, refProvidedByOperator: values['target-ref'] },
  scenarioSha256: scenarioBytes ? createHash('sha256').update(scenarioBytes).digest('hex') : null,
  runner: { platform: os.platform(), architecture: os.arch(), release: os.release(), cpu: os.cpus()[0]?.model, nodeVersion: process.version, playwrightVersion: createRequire(import.meta.url)('playwright/package.json').version, browserChannel: values.browser, gpuMode: values.gpu, headed: values.headed },
  viewport: view, capture: { enabled: !values['no-video'], requestedFps: fps }, events: [] as ManifestEvent[], recordings: [] as string[], screenshots: [] as string[],
};
const events = manifest.events as ManifestEvent[];
const recordings = manifest.recordings as string[];
const screenshots = manifest.screenshots as string[];
const held = new Set<string>();
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
let touchSession: CDPSession | undefined;
const touches = new Map<number, { x: number; y: number; id: number }>();
let pointerHeld = false;
let recording = false;
let segment = 0;
let pendingVideo = '';
let failure: unknown;
let actionErrors = 0;
let pageErrors = 0;
let consoleErrors = 0;
let replayable = true;
const replaySteps: Record<string, unknown>[] = [];
type Pose = { atMs: number; tick: number | null; poseRevision: number | null; x: number; y: number; z: number; yaw: number; speed: number };
const poses: Pose[] = [];
let posesTruncated = false;
let latestPose: Pose | undefined;
let activeRoom: PlaywrightWebSocket | undefined;
let playerId: string | undefined;

function observeRoom(socket: PlaywrightWebSocket) {
  let path: string;
  try { path = new URL(socket.url()).pathname; } catch { return; }
  if (!path.startsWith('/api/room/')) return;
  activeRoom = socket; playerId = undefined; latestPose = undefined;
  socket.on('framereceived', ({ payload }) => {
    if (socket !== activeRoom || typeof payload !== 'string') return;
    try {
      const message = JSON.parse(payload);
      if (message.type === 'welcome' && typeof message.id === 'string') { playerId = message.id; return; }
      if (message.type !== 'state' || !playerId || !Array.isArray(message.world?.players) || !Array.isArray(message.world?.entities)) return;
      const player = message.world.players.find((candidate: { id?: unknown }) => candidate.id === playerId);
      const car = message.world.entities.find((candidate: { id?: unknown }) => candidate.id === player?.entityId);
      if (!car || !['x', 'y', 'z', 'yaw', 'speed'].every(key => typeof car[key] === 'number' && Number.isFinite(car[key]))) return;
      latestPose = { atMs: Math.round(performance.now() - started), tick: Number.isSafeInteger(message.tick) ? message.tick : null, poseRevision: Number.isSafeInteger(message.poseRevision) ? message.poseRevision : null, x: car.x, y: car.y, z: car.z, yaw: car.yaw, speed: car.speed };
      if (poses.length < 100000) poses.push(latestPose); else posesTruncated = true;
    } catch { /* Other protocol versions may not have this snapshot shape. */ }
  });
}

function textField(action: Action, field: string, max = 500): string {
  const value = action[field];
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Error(`Invalid ${field}.`);
  return value;
}
function duration(action: Action, field: string, fallback: number, max: number): number {
  const value = action[field] ?? fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${field}.`);
  return value;
}
function nameField(action: Action): string {
  const name = textField(action, 'name', 40);
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Names may contain only letters, digits, hyphens, and underscores.');
  return name;
}
async function sample() {
  return await page!.evaluate(() => {
    let perf: unknown = null;
    try { perf = JSON.parse(document.body.dataset.teslandPerf || 'null'); } catch { /* diagnostics are optional */ }
    return { connection: document.querySelector('#connection')?.textContent?.trim() ?? null, speed: document.querySelector('#speed')?.textContent?.trim() ?? null, perf };
  });
}
async function stopRecording() {
  if (!recording) throw new Error('No recording is active.');
  if (!values['no-video']) await page!.screencast.stop();
  recording = false;
  if (!values['no-video']) recordings.push(pendingVideo);
  pendingVideo = '';
}
async function releaseInputs() {
  for (const key of held) { try { await page!.keyboard.up(key); } catch { /* browser already closed */ } }
  held.clear();
  if (touches.size) { try { await touchSession?.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); } catch { /* browser already closed */ } touches.clear(); }
  if (pointerHeld) { try { await page!.mouse.up(); } catch { /* browser already closed */ } pointerHeld = false; }
}
function touchId(action: Action): number {
  const id = action.id ?? 0;
  if (!Number.isSafeInteger(id) || (id as number) < 0 || (id as number) > 9) throw new Error('Touch id must be an integer from 0 to 9.');
  return id as number;
}
async function act(action: Action): Promise<unknown> {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Action must have a type.');
  const begin = performance.now();
  let result: unknown;
  let key: string | undefined;
  let ok = false;
  try {
    switch (action.type) {
      case 'wait': await page!.waitForTimeout(duration(action, 'ms', 0, 60000)); break;
      case 'waitFor': {
        const state = action.state ?? 'visible';
        if (!['attached', 'detached', 'visible', 'hidden'].includes(String(state))) throw new Error('Invalid locator state.');
        await page!.locator(textField(action, 'selector')).first().waitFor({ state: state as 'attached' | 'detached' | 'visible' | 'hidden', timeout: duration(action, 'timeoutMs', 30000, 120000) });
        break;
      }
      case 'waitForPoseRevision': {
        if (!values.trajectory) throw new Error('waitForPoseRevision requires --trajectory.');
        const revision = action.value;
        if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Invalid pose revision.');
        const deadline = performance.now() + duration(action, 'timeoutMs', 30000, 120000);
        while (!latestPose || latestPose.poseRevision === null || latestPose.poseRevision < (revision as number)) {
          if (performance.now() >= deadline) throw new Error('Timed out waiting for the authoritative pose revision.');
          await page!.waitForTimeout(50);
        }
        result = latestPose; break;
      }
      case 'keyDown': case 'keyUp': case 'keyPress': {
        key = textField(action, 'key', 80);
        // Key names are logged for replay; do not type credentials through this API.
        if (/[\x00-\x1f\x7f]/.test(key)) throw new Error('Invalid key.');
        if (action.type === 'keyDown') { await page!.keyboard.down(key); held.add(key); }
        else if (action.type === 'keyUp') { await page!.keyboard.up(key); held.delete(key); }
        else await page!.keyboard.press(key);
        break;
      }
      case 'click': await page!.locator(textField(action, 'selector')).first().click(); break;
      case 'tap': await page!.locator(textField(action, 'selector')).first().tap(); break;
      case 'fill': await page!.locator(textField(action, 'selector')).first().fill(textField(action, 'value', 2000)); break;
      case 'pointerDown': {
        const box = await page!.locator(textField(action, 'selector')).first().boundingBox();
        if (!box) throw new Error('Pointer target is not visible.');
        await page!.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page!.mouse.down();
        pointerHeld = true;
        break;
      }
      case 'pointerUp': await page!.mouse.up(); pointerHeld = false; break;
      case 'releaseAll': await releaseInputs(); break;
      case 'touchDown': {
        if (!view.hasTouch) throw new Error('Touch input requires a touch-enabled viewport.');
        const id = touchId(action);
        if (touches.has(id)) throw new Error('That touch is already held.');
        const box = await page!.locator(textField(action, 'selector')).first().boundingBox();
        if (!box) throw new Error('Touch target is not visible.');
        touchSession ??= await context!.newCDPSession(page!);
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...touches.values(), point] });
        touches.set(id, point); break;
      }
      case 'touchUp': {
        const id = touchId(action);
        if (!touchSession || !touches.has(id)) throw new Error('That touch is not held.');
        const remaining = [...touches.values()].filter(point => point.id !== id);
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: remaining });
        touches.delete(id); break;
      }
      case 'sample': result = await sample(); break;
      case 'assertNumberAbove': {
        const text = await page!.locator(textField(action, 'selector')).first().textContent();
        const threshold = action.value;
        if (typeof threshold !== 'number' || !Number.isFinite(threshold) || !Number.isFinite(Number(text?.trim())) || Number(text?.trim()) <= threshold) throw new Error('Numeric assertion failed.');
        result = { value: Number(text?.trim()), greaterThan: threshold };
        break;
      }
      case 'screenshot': {
        const file = `${nameField(action)}.png`;
        if (screenshots.includes(file)) throw new Error('Screenshot name already used.');
        await page!.screenshot({ path: join(out, file) }); screenshots.push(file); result = { file }; break;
      }
      case 'recordStart': {
        if (recording) throw new Error('Recording is already active.');
        pendingVideo = `segment-${String(++segment).padStart(3, '0')}.webm`;
        if (!values['no-video']) await page!.screencast.start({ path: join(out, pendingVideo), size: { width: view.width, height: view.height }, fps });
        recording = true; result = await sample(); break;
      }
      case 'recordStop':
        result = await sample();
        if (values.serve) { await releaseInputs(); replaySteps.push({ type: 'releaseAll' }); }
        await stopRecording(); break;
      default: throw new Error('Unknown action type.');
    }
    ok = true;
    return result;
  } catch (error) {
    actionErrors++;
    throw error;
  } finally {
    events.push({ type: action.type, commandStartedAtMs: Math.round(begin - started), commandDurationMs: Math.round(performance.now() - begin), status: ok ? 'ok' : 'failed', ...(key ? { key } : {}), ...(result === undefined ? {} : { sample: result }) });
    if (values.serve && ok) {
      const saved: Record<string, unknown> = { type: action.type };
      for (const field of ['key', 'selector', 'ms', 'timeoutMs', 'state', 'name', 'id']) if (action[field] !== undefined) saved[field] = action[field];
      // Interactive wait-for calls are short so release cannot be blocked;
      // a fresh replay needs time for its own independent startup.
      if (action.type === 'waitFor' || action.type === 'waitForPoseRevision') saved.timeoutMs = Math.max(Number(saved.timeoutMs ?? 0), 30000);
      if (action.type === 'fill') { replayable = false; saved.value = null; }
      else if (action.value !== undefined) saved.value = action.value;
      replaySteps.push(saved);
    }
  }
}
function authorized(req: IncomingMessage): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || !secret) return false;
  const supplied = Buffer.from(auth.slice(7)); const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function body(req: IncomingMessage): Promise<Action> {
  req.setTimeout(2000, () => req.destroy());
  try {
    const parts: Buffer[] = []; let size = 0;
    for await (const chunk of req) { const part = Buffer.from(chunk); size += part.length; if (size > 8192) throw new Error('Request too large.'); parts.push(part); }
    return JSON.parse(Buffer.concat(parts).toString()) as Action;
  } finally { req.setTimeout(0); }
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }

try {
  const args = values.gpu === 'metal' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] : values.gpu === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu'] : [];
  browser = await chromium.launch({ channel: values.browser === 'chrome' ? 'chrome' : undefined, headless: !values.headed, args });
  (manifest.runner as Record<string, unknown>).browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.deviceScaleFactor ?? 1, isMobile: view.isMobile ?? false, hasTouch: view.hasTouch ?? false });
  page = await context.newPage();
  page.on('pageerror', () => { pageErrors++; });
  page.on('console', message => { if (message.type() === 'error') consoleErrors++; });
  if (values.serve) page.setDefaultTimeout(2000);
  if (values.trajectory) page.on('websocket', observeRoom);
  const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  (manifest.target as Record<string, unknown>).httpStatus = response?.status() ?? null;
  if (!response || !response.ok()) throw new Error('Target navigation did not return a successful HTTP response.');
  (manifest.runner as Record<string, unknown>).webgl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
    gl.getExtension('WEBGL_lose_context')?.loseContext(); return info;
  });
  if (values.scenario) {
    for (const step of scenario.steps) await act(step);
  } else {
    let close!: () => void;
    const done = new Promise<void>(resolveDone => { close = resolveDone; });
    let queue = Promise.resolve();
    let queued = 0;
    let accepting = true;
    const server = createServer(async (req, res) => {
      if (!authorized(req)) { json(res, 401, { error: 'Unauthorized' }); return; }
      if (!accepting) { json(res, 409, { error: 'Run is finishing' }); return; }
      const path = (req.url ?? '').split('?')[0]; const base = `/v1/runs/${id}`;
      let incoming: Action | undefined;
      if (req.method === 'POST' && path === `${base}/actions`) {
        try {
          incoming = await body(req);
          if (!incoming || typeof incoming !== 'object' || typeof incoming.type !== 'string') throw new Error('Invalid action');
          if (incoming.type === 'wait' && duration(incoming, 'ms', 0, 60000) > 1000) throw new Error('Interactive wait too long');
          if ((incoming.type === 'waitFor' || incoming.type === 'waitForPoseRevision') && duration(incoming, 'timeoutMs', 30000, 120000) > 1000) throw new Error('Interactive wait too long');
        } catch { if (!res.destroyed) json(res, 400, { error: 'Invalid request or interactive wait over 1000 ms' }); return; }
      }
      if (!accepting) { json(res, 409, { error: 'Run is finishing' }); return; }
      if (queued >= 16) { json(res, 429, { error: 'Too many pending requests' }); return; }
      if (incoming?.type === 'finish') accepting = false;
      queued++;
      queue = queue.then(async () => {
        if (req.method === 'GET' && path === base) { json(res, 200, { id, recording, held: [...held], state: await sample() }); return; }
        if (req.method === 'GET' && path === `${base}/frame.png`) { const image = await page!.screenshot(); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(image); return; }
        if (req.method === 'POST' && path === `${base}/actions`) {
          const action = incoming!;
          if (action.type === 'finish') { json(res, 202, { accepted: true }); server.close(); close(); return; }
          const result = await act(action); json(res, 200, { ok: true, result: result ?? null }); return;
        }
        json(res, 404, { error: 'Not found' });
      }).catch(() => { if (!res.headersSent) json(res, 400, { error: 'Action failed' }); else res.end(); }).finally(() => { queued--; });
    });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
    await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolveListen()); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server did not bind.');
    console.log(JSON.stringify({ id, endpoint: `http://127.0.0.1:${address.port}/v1/runs/${id}`, output: out }));
    const stop = () => { server.close(); close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    await done;
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
} catch (error) { failure = error; }
finally {
  if (page) {
    await releaseInputs();
    if (recording) { try { await stopRecording(); } catch { failure ??= new Error('Could not finalize recording.'); } }
  }
  try { await context?.close(); await browser?.close(); } catch { failure ??= new Error('Could not close browser.'); }
  if (values.trajectory) {
    await writeFile(join(out, 'trajectory.json'), JSON.stringify(poses, null, 2) + '\n');
    manifest.trajectory = { file: 'trajectory.json', status: poses.length ? (posesTruncated ? 'truncated' : 'available') : 'unavailable', samples: poses.length, source: 'received authoritative room snapshots; not displayed-frame positions' };
    if (!poses.length) failure ??= new Error('No compatible authoritative trajectory was received.');
  }
  if (values.serve) {
    await writeFile(join(out, 'replay.json'), JSON.stringify({ viewport: view, steps: replaySteps }, null, 2) + '\n');
    manifest.replay = { file: 'replay.json', replayable, note: 'Successful commands only; fill values are redacted.' };
  }
  manifest.browserErrors = { pageErrors, consoleErrors };
  manifest.finishedAt = new Date().toISOString(); manifest.durationMs = Math.round(performance.now() - started);
  manifest.status = failure ? 'failed' : actionErrors || pageErrors ? 'completed_with_errors' : 'complete';
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, status: manifest.status, recordings }));
}
if (failure) { console.error(failure instanceof Error ? failure.message : 'Playtest failed'); process.exitCode = 1; }
else if (actionErrors || pageErrors) process.exitCode = 1;

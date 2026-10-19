/** Local browser playtests. The control server is deliberately loopback-only. */
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page, type WebSocket as PlaywrightWebSocket } from 'playwright';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import os from 'node:os';
import { captureError as asError, finalizeTabCapture, ScreencastCapture, TabChunkSink, withDeadline } from './playtest-capture';

// Recordings may contain chat and other private on-screen data.
process.umask(0o077);

type Action = Record<string, unknown> & { type: string };
type Scenario = { freshGuest?: boolean; viewport?: { width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean; hasTouch?: boolean }; steps: Action[] };
type ManifestEvent = { type: string; commandStartedAtMs: number; commandDurationMs: number; status: 'ok' | 'failed'; key?: string; sample?: unknown };
class PublicActionError extends Error {}

const { values } = parseArgs({ options: {
  url: { type: 'string' }, scenario: { type: 'string' }, out: { type: 'string' },
  'target-ref': { type: 'string' }, browser: { type: 'string', default: 'chromium' },
  gpu: { type: 'string', default: 'default' }, headed: { type: 'boolean', default: false },
  serve: { type: 'boolean', default: false }, port: { type: 'string', default: '0' },
  width: { type: 'string', default: '1280' }, height: { type: 'string', default: '720' },
  fps: { type: 'string', default: '30' }, 'no-video': { type: 'boolean', default: false },
  'video-source': { type: 'string', default: 'screencast' },
  trajectory: { type: 'boolean', default: false }, audio: { type: 'boolean', default: false },
  mobile: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
} });
if (values.help) {
  console.log('pnpm playtest:record --url URL --target-ref REF [--scenario FILE | --serve] [--out NEW_DIRECTORY] [--headed] [--audio] [--video-source screencast|tab] [--gpu default|metal|vulkan|swiftshader]');
  process.exit(0);
}
if (values.audio && values['no-video']) throw new Error('--audio requires video capture.');
if (!values.url || !values['target-ref'] || (!!values.scenario === !!values.serve)) throw new Error('Specify --url, --target-ref, and exactly one of --scenario or --serve.');
const target = new URL(values.url);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('URL must be HTTP(S) without embedded credentials.');
if (!['chromium', 'chrome'].includes(values.browser!)) throw new Error('Browser must be chromium or chrome.');
if (!['screencast', 'tab'].includes(values['video-source']!)) throw new Error('Video source must be screencast or tab.');
if (!['default', 'metal', 'vulkan', 'swiftshader'].includes(values.gpu!)) throw new Error('GPU must be default, metal, vulkan, or swiftshader.');
const secret = process.env.TESLAND_PLAYTEST_SECRET;
if (values.serve && (!secret || Buffer.byteLength(secret) < 32)) throw new Error('Set TESLAND_PLAYTEST_SECRET to at least 32 bytes for the local control server.');
const fps = Number(values.fps);
if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new Error('FPS must be an integer from 1 to 60.');
const scenarioBytes = values.scenario ? await readFile(resolve(values.scenario)) : null;
const scenario = scenarioBytes ? JSON.parse(scenarioBytes.toString()) as Scenario : { steps: [] };
if (!Array.isArray(scenario.steps)) throw new Error('Scenario steps must be an array.');
const sourceHash = async (file: string) => createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex');
const [recorderSourceSha256, captureSourceSha256, audioSourceSha256, tabCaptureSourceSha256] = await Promise.all([sourceHash('./playtest-record.ts'), sourceHash('./playtest-capture.ts'), sourceHash('./playtest-audio-capture.js'), sourceHash('./playtest-tab-capture.js')]);
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
  target: { origin: target.origin, pathname: target.pathname, perf: target.searchParams.has('perf'), refProvidedByOperator: values['target-ref'] },
  scenarioSha256: scenarioBytes ? createHash('sha256').update(scenarioBytes).digest('hex') : null,
  runner: { platform: os.platform(), architecture: os.arch(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpuCount: os.cpus().length, hostLoadAverageAtStart: os.platform() === 'win32' ? null : os.loadavg(), hostLoadAverageAtFinish: null, recorderSourceSha256, captureSourceSha256, audioSourceSha256, tabCaptureSourceSha256, nodeVersion: process.version, playwrightVersion: createRequire(import.meta.url)('playwright/package.json').version, browserChannel: values.browser === 'chrome' ? 'chrome' : values['video-source'] === 'tab' ? 'chromium' : values.headed ? 'chromium-headed' : 'chromium-headless-shell', gpuMode: values.gpu, headed: values.headed },
  viewport: { ...view, deviceScaleFactor: view.deviceScaleFactor ?? 1 }, capture: { enabled: !values['no-video'], source: values['video-source'], requestedFps: fps, audio: values.audio, segments: [] as Record<string, unknown>[], note: values['video-source'] === 'tab' ? 'Tab media start/stop timestamps are not captured-frame, animation-frame, GPU-completion or physical-display timing.' : 'Callback timestamps are instrumented screencast evidence, not encoded-frame, animation-frame, GPU-completion or physical-display timing. JPEG callback delivery adds overhead.' }, events: [] as ManifestEvent[], recordings: [] as string[], screenshots: [] as string[],
};
const events = manifest.events as ManifestEvent[];
const recordings = manifest.recordings as string[];
const screenshots = manifest.screenshots as string[];
const captureSegments = (manifest.capture as { segments: Record<string, unknown>[] }).segments;
const CAPTURE_DEADLINE_MS = 15_000;
const partialVideo = (video: string) => `${video}.partial`;
const held = new Set<string>();
let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
let browserUnusable = false;
let touchSession: CDPSession | undefined;
const touches = new Map<number, { x: number; y: number; id: number }>();
let pointerHeld = false;
let recording = false;
let segment = 0;
let pendingVideo = '';
let pendingCapture: ScreencastCapture | undefined;
let pendingTab: TabChunkSink | undefined;
let pendingAudio: { file: string; offsetMs: number; startCommandWindowMs: number } | undefined;
const audioRecordings: { file: string; offsetMs: number; startCommandWindowMs: number }[] = [];
if (values.audio) manifest.audioRecordings = audioRecordings;
let failure: unknown;
let actionErrors = 0;
let pageErrors = 0;
let consoleErrors = 0;
let replayable = true;
const replaySteps: Record<string, unknown>[] = [];
let replayLastActionEnd: number | undefined;
let replayFinishedAt: number | undefined;
type Pose = { atMs: number; tick: number | null; worldTime: number | null; poseRevision: number | null; x: number; y: number; z: number; yaw: number; speed: number; vy: number | null; supported: boolean | null; thrusters: number | null; jumpBurstUntil: number | null; lastJump: number | null; deliveryCompleted: number | null; deliveryStage: 'pickup' | 'dropoff' | null; deliveryRestaurant: number | null; deliveryCustomer: number | null; deliverySearching: boolean | null };
const poses: Pose[] = [];
const inputEvents: Record<string, unknown>[] = [];
let posesTruncated = false;
let latestPose: Pose | undefined;
let activeRoom: PlaywrightWebSocket | undefined;
let playerId: string | undefined;

function observeRoom(socket: PlaywrightWebSocket) {
  let path: string;
  try { path = new URL(socket.url()).pathname; } catch { return; }
  if (!path.startsWith('/api/room/')) return;
  activeRoom = socket; playerId = undefined; latestPose = undefined;
  socket.on('close', () => {
    if (socket === activeRoom) { activeRoom = undefined; playerId = undefined; latestPose = undefined; }
  });
  socket.on('framesent', ({ payload }) => {
    if (socket !== activeRoom || typeof payload !== 'string' || inputEvents.length >= 5000) return;
    try {
      const message = JSON.parse(payload);
      if (message.type === 'input' && (message.input?.jump > 0 || message.input?.hover === true))
        inputEvents.push({ atMs: Math.round(performance.now() - started), type: 'sent', seq: message.seq, targetTick: message.targetTick, jump: message.input.jump, hover: message.input.hover });
    } catch { /* Only the nonsecret control fields above are retained. */ }
  });
  socket.on('framereceived', ({ payload }) => {
    if (socket !== activeRoom || typeof payload !== 'string') return;
    try {
      const message = JSON.parse(payload);
      if (message.type === 'inputEdge' && message.kind === 'jump' && inputEvents.length < 5000)
        inputEvents.push({ atMs: Math.round(performance.now() - started), type: 'edge', id: message.id, status: message.status, targetTick: message.targetTick });
      if (message.type === 'welcome' && typeof message.id === 'string') { playerId = message.id; return; }
      if (message.type !== 'state' || !playerId || !Array.isArray(message.world?.players) || !Array.isArray(message.world?.entities)) return;
      const player = message.world.players.find((candidate: { id?: unknown }) => candidate.id === playerId);
      const car = message.world.entities.find((candidate: { id?: unknown }) => candidate.id === player?.entityId);
      if (!car || !['x', 'y', 'z', 'yaw', 'speed'].every(key => typeof car[key] === 'number' && Number.isFinite(car[key]))) return;
      const order = player?.delivery?.order;
      latestPose = { atMs: Math.round(performance.now() - started), tick: Number.isSafeInteger(message.tick) ? message.tick : null, worldTime: typeof message.world.time === 'number' && Number.isFinite(message.world.time) ? message.world.time : null, poseRevision: Number.isSafeInteger(message.poseRevision) ? message.poseRevision : null, x: car.x, y: car.y, z: car.z, yaw: car.yaw, speed: car.speed,
        vy: typeof car.vy === 'number' && Number.isFinite(car.vy) ? car.vy : null,
        supported: car.supportId === null ? false : typeof car.supportId === 'string' ? true : null,
        thrusters: Number.isSafeInteger(car.thrusters) ? car.thrusters : null,
        jumpBurstUntil: typeof car.jumpBurstUntil === 'number' && Number.isFinite(car.jumpBurstUntil) ? car.jumpBurstUntil : null,
        lastJump: Number.isSafeInteger(car.lastJump) ? car.lastJump : null,
        deliveryCompleted: Number.isSafeInteger(player?.delivery?.completed) ? player.delivery.completed : null,
        deliveryStage: order?.stage === 'pickup' || order?.stage === 'dropoff' ? order.stage : null,
        deliveryRestaurant: Number.isSafeInteger(order?.restaurant) ? order.restaurant : null,
        deliveryCustomer: Number.isSafeInteger(order?.customer) ? order.customer : null,
        deliverySearching: order && typeof order === 'object' ? !!order.search : null };
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
function timeout(action: Action, fallback: number, max: number): number {
  const value = duration(action, 'timeoutMs', fallback, max);
  if (value === 0) throw new Error('Timeout must be greater than zero.');
  return value;
}
function appendReplayIdle(until: number) {
  // Scenario waits have a 60-second per-step limit.
  let idleMs = replayLastActionEnd === undefined ? 0 : Math.round(until - replayLastActionEnd);
  while (idleMs > 0) { const ms = Math.min(idleMs, 60000); replaySteps.push({ type: 'wait', ms }); idleMs -= ms; }
}
function nameField(action: Action): string {
  const name = textField(action, 'name', 40);
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Names may contain only letters, digits, hyphens, and underscores.');
  return name;
}
async function sample() {
  return await withDeadline(page!.evaluate(() => {
    let perf: unknown = null;
    try { perf = JSON.parse(document.body.dataset.teslandPerf || 'null'); } catch { /* diagnostics are optional */ }
    return { connection: document.querySelector('#connection')?.textContent?.trim() ?? null, speed: document.querySelector('#speed')?.textContent?.trim() ?? null, perf };
  }), CAPTURE_DEADLINE_MS, 'Timed out sampling the page.');
}
// A timed-out page operation may resume later. Never reuse that context for
// another recording, even if closing the context itself times out.
async function abandonBrowser() {
  browserUnusable = true;
  try { await withDeadline(context!.close(), CAPTURE_DEADLINE_MS, 'Tab recording browser close timed out.'); }
  catch (error) { (manifest.capture as Record<string, unknown>).browserCleanupFailed = true; throw asError(error, 'Could not close the recording browser.'); }
}
async function stopRecording() {
  if (!recording) throw new Error('No recording is active.');
  let audioFailure: unknown;
  if (pendingAudio) {
    try {
      const encoded = await withDeadline(page!.evaluate('window.__teslandAudioCapture.stop()'), CAPTURE_DEADLINE_MS, 'Audio recording stop timed out.') as string;
      await writeFile(join(out, pendingAudio.file), Buffer.from(encoded, 'base64'), { flag: 'wx' });
      audioRecordings.push(pendingAudio);
    } catch (error) {
      audioFailure = asError(error, 'Could not finalize audio recording.');
      failure ??= audioFailure;
      (manifest.capture as Record<string, unknown>).audioFinalizationFailed = true;
      browserUnusable = true;
    } finally { pendingAudio = undefined; }
  }
  if (values['no-video']) { recording = false; pendingVideo = ''; if (audioFailure) throw audioFailure; return; }
  try {
    const video = pendingVideo;
    const stopRequestedAtRunMs = performance.now() - started;
    let stopError: unknown;
    const traceFile = video.replace(/\.webm$/, '.capture.json');
    let partialRemovalFailed = false;
    if (values['video-source'] === 'tab') {
      const sink = pendingTab!;
      const result = await finalizeTabCapture({
        stop: async () => {
          try {
            const trace = await withDeadline(page!.evaluate('window.__teslandTabCapture.stop()'), CAPTURE_DEADLINE_MS, 'Tab recording stop timed out.') as { format: number; mode: string; chunks: number; bytes: number; startedAtBrowserMs: number; stoppedAtBrowserMs: number } | undefined;
            if (!trace || trace.chunks !== sink.chunks || trace.bytes !== sink.bytes) throw new Error('Tab recording chunks are incomplete.');
            return trace;
          } catch (error) {
            try { await abandonBrowser(); }
            catch (cleanupError) {
              (manifest.capture as Record<string, unknown>).browserCleanupFailed = true;
              throw new AggregateError([error, cleanupError], 'Tab recording failed and its browser could not be closed.');
            }
            throw asError(error, 'Could not finalize tab recording.');
          }
        },
        close: async () => { pendingTab = undefined; await sink.close(); },
        writeTrace: async trace => { await writeFile(join(out, traceFile), JSON.stringify(trace) + '\n'); },
        publish: async () => { await rename(join(out, partialVideo(video)), join(out, video)); },
        remove: async () => { await unlink(join(out, partialVideo(video))); },
      });
      stopError = result.error;
      partialRemovalFailed = result.partialRemovalFailed;
    } else {
      try { await withDeadline(page!.screencast.stop(), CAPTURE_DEADLINE_MS, 'Screencast stop timed out.'); } catch (error) { stopError = asError(error, 'Could not finalize screencast.'); }
    }
    recording = false; pendingVideo = '';
    if (values['video-source'] === 'tab') {
      captureSegments.push({ video, traceFile, mode: 'tab', finalized: !stopError, status: stopError ? 'incomplete' : 'available', ...(partialRemovalFailed ? { partialRemovalFailed } : {}) });
    } else {
      const capture = pendingCapture!.finish(stopRequestedAtRunMs);
      pendingCapture = undefined;
      await writeFile(join(out, traceFile), JSON.stringify(capture.trace) + '\n');
      captureSegments.push({ video, traceFile, finalized: !stopError, ...capture.summary });
    }
    if (stopError) throw stopError;
    recordings.push(video);
    if (audioFailure) throw audioFailure;
  } finally {
    if (audioFailure) {
      try { await abandonBrowser(); } catch (cleanupError) { failure ??= asError(cleanupError, 'Could not close the recording browser.'); }
    }
  }
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
    if (browserUnusable) throw new Error('The recording browser is unavailable after a capture failure.');
    switch (action.type) {
      case 'wait': await page!.waitForTimeout(duration(action, 'ms', 0, 60000)); break;
      case 'waitFor': {
        const state = action.state ?? 'visible';
        if (!['attached', 'detached', 'visible', 'hidden'].includes(String(state))) throw new Error('Invalid locator state.');
        await page!.locator(textField(action, 'selector')).first().waitFor({ state: state as 'attached' | 'detached' | 'visible' | 'hidden', timeout: timeout(action, 30000, 120000) });
        break;
      }
      case 'waitForPoseRevision': {
        if (!values.trajectory) throw new Error('waitForPoseRevision requires --trajectory.');
        const revision = action.value;
        if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Invalid pose revision.');
        const deadline = performance.now() + timeout(action, 30000, 120000);
        while (!activeRoom || !latestPose || latestPose.poseRevision === null || latestPose.poseRevision < (revision as number)) {
          if (performance.now() >= deadline) throw new Error('Timed out waiting for the authoritative pose revision.');
          await page!.waitForTimeout(50);
        }
        result = latestPose; break;
      }
      case 'waitForDelivery': {
        if (!values.trajectory) throw new Error('waitForDelivery requires --trajectory.');
        const completed = action.completed, stage = action.stage;
        if (!Number.isSafeInteger(completed) || (completed as number) < 0 || !['pickup', 'dropoff'].includes(String(stage))) throw new Error('Invalid delivery milestone.');
        const deadline = performance.now() + timeout(action, 120000, 240000);
        while (!activeRoom || !latestPose || latestPose.deliveryCompleted !== completed || latestPose.deliveryStage !== stage) {
          if (performance.now() >= deadline) throw new Error(`Timed out waiting for delivery ${completed} ${stage}.`);
          await page!.waitForTimeout(50);
        }
        result = latestPose; break;
      }
      case 'waitForTicks': {
        if (!values.trajectory || !latestPose || !Number.isSafeInteger(latestPose.tick)) throw new Error('waitForTicks requires an authoritative tick.');
        const count = action.count;
        if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 1200) throw new Error('Invalid tick count.');
        const targetTick = latestPose.tick! + (count as number), deadline = performance.now() + timeout(action, 30000, 120000);
        while (!activeRoom || !latestPose || latestPose.tick === null || latestPose.tick < targetTick) {
          if (performance.now() >= deadline) throw new Error('Timed out waiting for room ticks.');
          await page!.waitForTimeout(50);
        }
        result = latestPose; break;
      }
      case 'waitForGround': {
        if (!values.trajectory) throw new Error('waitForGround requires --trajectory.');
        const deadline = performance.now() + timeout(action, 30000, 120000);
        while (!activeRoom || !latestPose || latestPose.supported !== true) {
          if (performance.now() >= deadline) throw new Error('Timed out waiting for the car to land.');
          await page!.waitForTimeout(50);
        }
        result = latestPose; break;
      }
      case 'jumpUntilAirborne': {
        if (!values.trajectory || !latestPose || latestPose.supported !== true || latestPose.jumpBurstUntil === null) throw new Error('Jump requires a grounded authoritative car.');
        if (action.hold !== undefined && typeof action.hold !== 'boolean') throw new Error('Invalid jump hold.');
        const initialBurst = latestPose.jumpBurstUntil, startIndex = poses.length;
        for (let attempt = 0; attempt < 5 && !result; attempt++) {
          await page!.keyboard.down('KeyE'); held.add('KeyE');
          if (!action.hold) { await page!.keyboard.up('KeyE'); held.delete('KeyE'); }
          const deadline = performance.now() + 1500;
          while (performance.now() < deadline && !result) {
            result = poses.slice(startIndex).find(p => p.jumpBurstUntil !== null && p.jumpBurstUntil > initialBurst && p.supported === false && p.vy !== null && p.vy > .1 && p.thrusters !== null && (p.thrusters & 6) === 6);
            if (!result) await page!.waitForTimeout(50);
          }
          if (!result && action.hold) { await page!.keyboard.up('KeyE'); held.delete('KeyE'); }
          if (!result) await page!.waitForTimeout(300);
        }
        if (!result) throw new Error('Jump was not observed after five keyboard attempts.');
        break;
      }
      case 'waitForRoomReady': case 'beginRoom': case 'stageRepeatDelivery': {
        const room = target.searchParams.get('room');
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !room || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(room)) throw new Error('Room control requires a local fixture and a valid room.');
        const stageSecret = process.env.PLAYTEST_STAGE_SECRET;
        if (!stageSecret || !/^[0-9a-f]{64}$/i.test(stageSecret)) throw new Error('Set PLAYTEST_STAGE_SECRET to the fixture\'s 32-byte random secret in hexadecimal.');
        const headers = { Authorization: `Bearer ${stageSecret}` };
        if (action.type === 'waitForRoomReady') {
          const deadline = performance.now() + timeout(action, 30000, 120000);
          do {
            const response = await fetch(new URL(`/api/playtest/status/${room}`, target), { headers });
            if (!response.ok) throw new Error(`Could not inspect the local playtest room (${response.status}).`);
            const status = await response.json() as { ready?: boolean; paused?: boolean; started?: boolean };
            if (status.ready && status.paused && !status.started) { result = status; break; }
            await page!.waitForTimeout(100);
          } while (performance.now() < deadline);
          if (!result) throw new Error('Timed out waiting for a ready local playtest room.');
          break;
        }
        if (action.type === 'stageRepeatDelivery') {
          if (!values.trajectory) throw new Error('stageRepeatDelivery requires --trajectory.');
          const deadline = performance.now() + timeout(action, 120000, 240000);
          let staged: { order: { restaurant: { index: number }; customer: { index: number } }; stagedTick: number; poseRevision: number } | undefined;
          while (performance.now() < deadline) {
            const response = await fetch(new URL(`/api/playtest/repeat/${room}`, target), { method: 'POST', headers, signal: AbortSignal.timeout(Math.max(1, Math.min(30000, Math.ceil(deadline - performance.now())))) });
            const body = await response.json() as { ok?: boolean; retry?: boolean; order?: { restaurant?: { index?: number }; customer?: { index?: number } }; stagedTick?: number; poseRevision?: number };
            if (response.ok && body.ok === true && Number.isSafeInteger(body.order?.restaurant?.index) && Number.isSafeInteger(body.order?.customer?.index) && Number.isSafeInteger(body.stagedTick) && Number.isSafeInteger(body.poseRevision)) {
              staged = body as typeof staged; break;
            }
            if (response.status !== 409 || body.ok !== false || body.retry !== true) throw new Error('Local second-delivery staging was rejected.');
            await page!.waitForTimeout(100);
          }
          if (!staged) throw new Error('Timed out waiting to stage the second delivery.');
          while (performance.now() < deadline) {
            if (!activeRoom) throw new Error('Room disconnected after second-delivery staging.');
            if (latestPose?.tick !== null && latestPose?.tick !== undefined && latestPose.tick > staged.stagedTick) {
              if (latestPose.poseRevision !== staged.poseRevision || latestPose.deliveryCompleted !== 1 || latestPose.deliveryStage !== 'pickup' ||
                  latestPose.deliverySearching !== false || latestPose.deliveryRestaurant !== staged.order.restaurant.index ||
                  latestPose.deliveryCustomer !== staged.order.customer.index) throw new Error('The staged second delivery was not confirmed by the room.');
              result = { order: staged.order, stagedTick: staged.stagedTick, confirmedTick: latestPose.tick }; break;
            }
            await page!.waitForTimeout(50);
          }
          if (!result) throw new Error('Timed out waiting for the staged order snapshot.');
          break;
        }
        const response = await fetch(new URL(`/api/playtest/begin/${room}`, target), { method: 'POST', headers });
        if (!response.ok) throw new Error(`Could not start the local playtest room (${response.status}).`);
        result = await response.json(); break;
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
      case 'releaseAll': await withDeadline(releaseInputs(), CAPTURE_DEADLINE_MS, 'Timed out releasing inputs.'); break;
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
        await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touches.get(id)!] });
        touches.delete(id); break;
      }
      case 'sample': result = await sample(); break;
      case 'frameStart': {
        // Keep this browser callback as plain source: tsx's function-name
        // helpers do not exist inside Playwright's isolated page evaluation.
        await page!.evaluate(`(() => {
          if (window.__teslandFrames?.active) throw new Error('Frame capture already active.');
          const capture = { active: true, intervals: [], truncated: false };
          window.__teslandFrames = capture;
          let last;
          const frame = (now) => {
            if (!capture.active) return;
            if (last !== undefined) {
              if (capture.intervals.length < 60000) capture.intervals.push(now - last);
              else capture.truncated = true;
            }
            last = now;
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        })()`);
        break;
      }
      case 'frameStop': {
        result = await page!.evaluate(() => {
          const w = window as typeof window & { __teslandFrames?: { active: boolean; intervals: number[]; truncated: boolean } };
          const capture = w.__teslandFrames;
          if (!capture?.active) throw new Error('Frame capture is not active.');
          capture.active = false;
          return { intervalsMs: capture.intervals, truncated: capture.truncated };
        });
        break;
      }
      case 'assertNumberAbove': {
        const text = await page!.locator(textField(action, 'selector')).first().textContent();
        const threshold = action.value;
        if (typeof threshold !== 'number' || !Number.isFinite(threshold) || !text?.trim() || !Number.isFinite(Number(text.trim())) || Number(text.trim()) <= threshold) throw new Error('Numeric assertion failed.');
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
        if (values.audio && !await withDeadline(page!.evaluate('window.__teslandAudioCapture.ready()'), CAPTURE_DEADLINE_MS, 'Audio readiness check timed out.'))
          throw new PublicActionError('Trigger a game input to start audio before recording.');
        pendingVideo = `segment-${String(++segment).padStart(3, '0')}.webm`;
        if (!values['no-video']) {
          const videoBefore = performance.now();
          if (values['video-source'] === 'tab') {
            const oldTitle = await withDeadline(page!.title(), CAPTURE_DEADLINE_MS, 'Timed out reading tab title.');
            pendingTab = new TabChunkSink(await open(join(out, partialVideo(pendingVideo)), 'wx'));
            try {
              await withDeadline(page!.evaluate(title => { document.title = title; }, `tesland-tab-${id}`), CAPTURE_DEADLINE_MS, 'Timed out preparing the capture tab.');
              await withDeadline(page!.evaluate(({ fpsValue, origin }) => (window as any).__teslandTabCapture.start(fpsValue, origin), { fpsValue: fps, origin: target.origin }), CAPTURE_DEADLINE_MS, 'Tab recording start timed out.');
            } catch (error) {
              const partial = pendingTab; pendingTab = undefined;
              let cleanupError: Error | undefined;
              try { await abandonBrowser(); }
              catch (failure) { cleanupError = asError(failure, 'Could not close the tab recording browser.'); (manifest.capture as Record<string, unknown>).browserCleanupFailed = true; }
              let closeFailed = false;
              try { await partial!.close(); }
              catch (failure) { closeFailed = true; cleanupError ??= asError(failure, 'Could not close partial tab recording.'); (manifest.capture as Record<string, unknown>).partialRemovalFailed = true; }
              if (!closeFailed) {
                try { await unlink(join(out, partialVideo(pendingVideo))); }
                catch (failure) { cleanupError ??= asError(failure, 'Could not remove partial tab recording.'); (manifest.capture as Record<string, unknown>).partialRemovalFailed = true; }
              }
              if (cleanupError) throw new AggregateError([error, cleanupError], 'Tab recording failed and its partial file could not be cleaned up.');
              throw error;
            } finally { try { await withDeadline(page!.evaluate(title => { document.title = title; }, oldTitle), CAPTURE_DEADLINE_MS, 'Timed out restoring tab title.'); } catch { /* a closed page is reported by the next action */ } }
          } else {
            const capture = new ScreencastCapture(performance.now() - started);
            await page!.screencast.start({ path: join(out, pendingVideo), size: { width: view.width, height: view.height }, fps,
              onFrame: ({ timestamp, viewportWidth, viewportHeight }) => capture.observe({ timestamp, viewportWidth, viewportHeight }, performance.now() - started) });
            pendingCapture = capture;
          }
          const videoAfter = performance.now();
          recording = true;
          if (values.audio) {
            try {
              const audioBefore = performance.now();
              await withDeadline(page!.evaluate('window.__teslandAudioCapture.start()'), CAPTURE_DEADLINE_MS, 'Audio recording start timed out.');
              const audioAfter = performance.now();
              pendingAudio = { file: `segment-${String(segment).padStart(3, '0')}-audio.webm`, offsetMs: ((audioBefore + audioAfter) - (videoBefore + videoAfter)) / 2, startCommandWindowMs: ((videoAfter - videoBefore) + (audioAfter - audioBefore)) / 2 };
            } catch (error) {
              // Starting audio and video is one action. A rejected audio start
              // must not leave a video running or list a partial as usable.
              const video = pendingVideo;
              failure ??= asError(error, 'Could not start audio recording.');
              browserUnusable = true;
              try { await stopRecording(); } catch (cleanupError) { failure ??= asError(cleanupError, 'Could not stop recording.'); }
              try { await abandonBrowser(); } catch (cleanupError) { failure ??= asError(cleanupError, 'Could not close the recording browser.'); }
              if (recordings.at(-1) === video) recordings.pop();
              const discarded = captureSegments.at(-1);
              if (discarded?.video === video) discarded.discarded = true;
              throw error;
            }
          }
        }
        recording = true;
        try { result = await sample(); }
        catch (error) {
          try { await stopRecording(); } catch (cleanupError) { failure ??= asError(cleanupError, 'Could not stop recording.'); }
          throw error;
        }
        break;
      }
      case 'recordStop': {
        let actionFailure: Error | undefined;
        try { result = await sample(); } catch (error) { actionFailure = asError(error, 'Could not sample the page.'); }
        if (values.serve) {
          try { await withDeadline(releaseInputs(), CAPTURE_DEADLINE_MS, 'Timed out releasing inputs.'); }
          catch (error) { actionFailure ??= asError(error, 'Could not release inputs.'); }
        }
        await stopRecording();
        if (actionFailure) throw actionFailure;
        break;
      }
      default: throw new Error('Unknown action type.');
    }
    ok = true;
    return result;
  } catch (error) {
    actionErrors++;
    throw error;
  } finally {
    const end = performance.now();
    events.push({ type: action.type, commandStartedAtMs: Math.round(begin - started), commandDurationMs: Math.round(end - begin), status: ok ? 'ok' : 'failed', ...(key ? { key } : {}), ...(result === undefined ? {} : { sample: result }) });
    if (values.serve && ok) {
      // Preserve time spent between requests, including frame inspections while controls are held.
      appendReplayIdle(begin);
      if (action.type === 'recordStop') replaySteps.push({ type: 'releaseAll' });
      const saved: Record<string, unknown> = { type: action.type };
      for (const field of ['key', 'selector', 'ms', 'timeoutMs', 'state', 'name', 'id', 'completed', 'stage']) if (action[field] !== undefined) saved[field] = action[field];
      // Interactive wait-for calls are short so release cannot be blocked;
      // a fresh replay needs time for its own independent startup.
      if (action.type === 'waitFor' || action.type === 'waitForPoseRevision' || action.type === 'waitForRoomReady') saved.timeoutMs = Math.max(Number(saved.timeoutMs ?? 0), 30000);
      if (action.type === 'waitForDelivery') saved.timeoutMs = Math.max(Number(saved.timeoutMs ?? 0), 180000);
      if (action.type === 'fill') { replayable = false; saved.value = null; }
      else if (action.value !== undefined) saved.value = action.value;
      replaySteps.push(saved);
      replayLastActionEnd = end;
    } else if (values.serve) {
      replayable = false;
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
  const args = values.gpu === 'metal' ? ['--use-gl=angle', '--use-angle=metal', '--enable-gpu'] : values.gpu === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu'] : values.gpu === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  if (values['video-source'] === 'tab') args.push(`--auto-select-tab-capture-source-by-title=tesland-tab-${id}`);
  browser = await chromium.launch({ channel: values.browser === 'chrome' ? 'chrome' : values['video-source'] === 'tab' ? 'chromium' : undefined, headless: !values.headed, args });
  (manifest.runner as Record<string, unknown>).browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.deviceScaleFactor ?? 1, isMobile: view.isMobile ?? false, hasTouch: view.hasTouch ?? false });
  if (values['video-source'] === 'tab') {
    await context.addInitScript({ content: await readFile(new URL('./playtest-tab-capture.js', import.meta.url), 'utf8') });
    await context.exposeBinding('__teslandTabChunk', async (source, chunk: number, encoded: string) => {
      const sink = pendingTab;
      if (source.page !== page || source.frame !== page.mainFrame() || !sink) throw new Error('Invalid tab recording chunk.');
      await sink.append(chunk, encoded);
    });
  }
  if (values.audio) await context.addInitScript({ content: await readFile(new URL('./playtest-audio-capture.js', import.meta.url), 'utf8') });
  if (scenario.freshGuest) {
    // The normal default auto-saves a driver in chat. The repeatable scenario
    // explicitly chooses a fresh guest in this disposable browser context.
    await context.addInitScript({ content: `if (location.origin === ${JSON.stringify(target.origin)}) localStorage.setItem('poly-av-driver-remember', 'off');` });
  }
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
          // These fixture-specific actions can block longer than the control
          // server's interactive limit; use them in scripted scenarios only.
          if (['waitForTicks', 'waitForGround', 'jumpUntilAirborne', 'stageRepeatDelivery'].includes(incoming.type)) throw new Error('Scripted action only');
          if (incoming.type === 'wait' && duration(incoming, 'ms', 0, 60000) > 1000) throw new Error('Interactive wait too long');
          if ((incoming.type === 'waitFor' || incoming.type === 'waitForPoseRevision' || incoming.type === 'waitForDelivery' || incoming.type === 'waitForRoomReady') && timeout(incoming, 30000, 240000) > 1000) throw new Error('Interactive wait too long');
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
          if (action.type === 'finish') { replayFinishedAt = performance.now(); json(res, 202, { accepted: true }); server.close(); close(); return; }
          const result = await act(action); json(res, 200, { ok: true, result: result ?? null }); return;
        }
        json(res, 404, { error: 'Not found' });
      }).catch(error => { if (!res.headersSent) json(res, 400, { error: error instanceof PublicActionError ? error.message : 'Action failed' }); else res.end(); }).finally(() => { queued--; });
    });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
    await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolveListen()); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server did not bind.');
    console.log(JSON.stringify({ id, endpoint: `http://127.0.0.1:${address.port}/v1/runs/${id}`, output: out }));
    const stop = () => { replayFinishedAt = performance.now(); server.close(); close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    await done;
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
} catch (error) { failure = asError(error, 'Playtest failed.'); }
finally {
  (manifest.runner as Record<string, unknown>).hostLoadAverageAtFinish = os.platform() === 'win32' ? null : os.loadavg();
  const endedAt = replayFinishedAt ?? performance.now();
  if (page) {
    try { await withDeadline(releaseInputs(), CAPTURE_DEADLINE_MS, 'Timed out releasing inputs.'); } catch (error) { failure ??= asError(error, 'Could not release inputs.'); }
    if (recording) { try { await stopRecording(); } catch { failure ??= new Error('Could not finalize recording.'); } }
  }
  try { if (context) await withDeadline(context.close(), CAPTURE_DEADLINE_MS, 'Browser context close timed out.'); } catch { failure ??= new Error('Could not close browser context.'); (manifest.capture as Record<string, unknown>).browserCleanupFailed = true; }
  try { if (browser) await withDeadline(browser.close(), CAPTURE_DEADLINE_MS, 'Browser close timed out.'); } catch { failure ??= new Error('Could not close browser.'); (manifest.capture as Record<string, unknown>).browserCleanupFailed = true; }
  if (values.trajectory) {
    await writeFile(join(out, 'trajectory.json'), JSON.stringify(poses, null, 2) + '\n');
    await writeFile(join(out, 'input-events.json'), JSON.stringify(inputEvents, null, 2) + '\n');
    manifest.trajectory = { file: 'trajectory.json', status: poses.length ? (posesTruncated ? 'truncated' : 'available') : 'unavailable', samples: poses.length, source: 'received authoritative room snapshots; not displayed-frame positions' };
    if (!poses.length) failure ??= new Error('No compatible authoritative trajectory was received.');
  }
  if (values.serve) {
    appendReplayIdle(endedAt);
    replaySteps.push({ type: 'releaseAll' });
    if (failure) replayable = false;
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

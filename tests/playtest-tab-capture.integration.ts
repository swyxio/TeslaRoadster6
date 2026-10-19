// Functional tab capture against a disposable local game; not a smoothness test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type ClientRequest, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
// @ts-expect-error Standalone JavaScript diagnostic has no TypeScript declarations.
import { inspectRecordingArtifact } from '../scripts/recording-quality.mjs';

const target = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) throw new Error('Use a local disposable game only.');
target.searchParams.set('room', `tab-recorder-${randomBytes(6).toString('hex')}`);
target.searchParams.set('perf', '');
const dir = await mkdtemp(join(tmpdir(), 'tesland-recorder-test-tab-'));
const scenario = join(dir, 'scenario.json'), out = join(dir, 'run');
await writeFile(scenario, JSON.stringify({ freshGuest: true, steps: [
  { type: 'waitFor', selector: '#connection:has-text("LIVE")', timeoutMs: 60000 },
  { type: 'wait', ms: 500 },
  { type: 'recordStart' }, { type: 'keyDown', key: 'KeyW' }, { type: 'wait', ms: 2000 },
  { type: 'assertNumberAbove', selector: '#speed', value: 0 }, { type: 'keyUp', key: 'KeyW' }, { type: 'recordStop' },
  { type: 'recordStart' }, { type: 'wait', ms: 1000 }, { type: 'recordStop' },
] }));
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', target.href, '--target-ref', 'tab-integration',
  '--scenario', scenario, '--trajectory', '--gpu', process.env.TESLAND_PLAYTEST_GPU ?? 'default', '--video-source', 'tab', '--fps', '60', '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
const code = await new Promise<number | null>(resolve => child.once('exit', resolve));
assert.equal(code, 0, stderr);
const manifestPath = join(out, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.status, 'complete');
assert.equal(manifest.capture.source, 'tab');
assert.equal(manifest.viewport.deviceScaleFactor, 1);
assert.deepEqual(manifest.recordings, ['segment-001.webm', 'segment-002.webm']);
assert.ok(manifest.events.some((event: { type: string; status: string }) => event.type === 'assertNumberAbove' && event.status === 'ok'));
const inspection = await inspectRecordingArtifact(manifest, manifestPath);
assert.ok(inspection.encodedVideos.every((video: { status: string }) => video.status === 'available'), JSON.stringify(inspection));
assert.ok(inspection.captureTraces.every((trace: { status: string }) => trace.status === 'available'), JSON.stringify(inspection));
// Under contention even a functional recorder can miss the beginning or end;
// retain that HOLD as evidence instead of making this a timing budget.
assert.ok(inspection.reasons.every((reason: string) => reason === 'A video packet duration is materially shorter than its capture trace.'), JSON.stringify(inspection));
assert.equal(inspection.playerFidelity, 'UNVERIFIED');
await writeFile(join(dir, 'inspection.json'), JSON.stringify(inspection, null, 2) + '\n');
console.log(`Tab capture completed two segments in ${dir}; artifact ${inspection.artifact}, player fidelity ${inspection.playerFidelity}.`);

// Hold a real tab stop in the page while signaling the control process. This
// checks ordering, not video quality or player-visible smoothness.
async function checkSignal(signal: 'SIGTERM' | 'SIGINT') {
  let notifySlow!: () => void;
  const slowStarted = new Promise<void>(resolve => { notifySlow = resolve; });
  const slowResponses: ServerResponse[] = [];
  let tabStopError = '';
  const fixture = createServer((request, response) => {
    if (request.url === '/slow') { slowResponses.push(response); notifySlow(); return; }
    if (request.url === '/stop-error') {
      request.setEncoding('utf8');
      request.on('data', chunk => { tabStopError += chunk; });
      request.on('end', () => { response.writeHead(204); response.end(); });
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><title>Recorder signal test</title><body>Signal test
      <script>
        const stopCapture = window.__teslandTabCapture.stop;
        window.__teslandTabCapture.stop = async () => {
          try { await fetch('/slow'); return await stopCapture(); }
          catch (error) { await fetch('/stop-error', { method: 'POST', body: String(error && error.stack || error) }); throw error; }
        };
      </script></body>`);
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const fixtureAddress = fixture.address();
  assert.ok(fixtureAddress && typeof fixtureAddress !== 'string');
  const signalOutput = join(dir, `signal-${signal.toLowerCase()}`);
  const secret = randomBytes(32).toString('hex');
  const signalChild = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', `http://127.0.0.1:${fixtureAddress.port}/`, '--target-ref', 'signal-test', '--serve', '--video-source', 'tab', '--gpu', process.env.TESLAND_PLAYTEST_GPU ?? 'default', '--out', signalOutput], {
    env: { ...process.env, TESLAND_PLAYTEST_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let signalError = ''; signalChild.stderr.on('data', chunk => { signalError += chunk; });
  const signalExited = new Promise<number | null>(resolve => signalChild.once('exit', resolve));
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
  let incomplete: ClientRequest | undefined;
  let trickle: ReturnType<typeof setInterval> | undefined;
  try {
    const line = await Promise.race([
      new Promise<string>(resolve => createInterface({ input: signalChild.stdout }).once('line', resolve)),
      signalExited.then(code => { throw new Error(`Signal recorder exited before listening: ${code} ${signalError}`); }),
      delay(60000, undefined, { ref: false }).then(() => { throw new Error('Signal recorder did not start.'); }),
    ]);
    const endpoint = JSON.parse(line).endpoint as string;
    const action = (type: string) => fetch(`${endpoint}/actions`, { method: 'POST', headers, body: JSON.stringify({ type }), signal: AbortSignal.timeout(30000) });
    assert.equal((await action('recordStart')).status, 200);
    await delay(1200);
    const stopping = action('recordStop');
    void stopping.catch(() => {});
    await Promise.race([slowStarted, delay(5000, undefined, { ref: false }).then(() => { throw new Error('Tab stop did not start.'); })]);
    // Keep an authenticated request body incomplete while shutdown drains the
    // accepted tab stop. A trickle keeps its inactivity timeout from firing.
    incomplete = httpRequest(`${endpoint}/actions`, { method: 'POST', headers: { ...headers, Expect: '100-continue' } });
    incomplete.on('error', () => {});
    const continued = new Promise<void>(resolve => incomplete!.once('continue', resolve));
    incomplete.flushHeaders();
    await Promise.race([continued, delay(5000, undefined, { ref: false }).then(() => { throw new Error('Incomplete request did not start.'); })]);
    incomplete.write('{"type":');
    trickle = setInterval(() => { if (!incomplete!.destroyed) incomplete!.write(' '); }, 400);
    signalChild.kill(signal);
    const port = Number(new URL(endpoint).port);
    let closed = false;
    for (let attempt = 0; attempt < 50 && !closed; attempt++) {
      closed = await new Promise<boolean>((resolve, reject) => {
        const socket = connect(port, '127.0.0.1');
        socket.once('connect', () => { socket.destroy(); resolve(false); });
        socket.once('error', (error: NodeJS.ErrnoException) => error.code === 'ECONNREFUSED' ? resolve(true) : reject(error));
      });
      if (!closed) await delay(20);
    }
    assert.ok(closed, 'The signal handler must close the control listener before the stop is released.');
    await delay(150);
    assert.equal(slowResponses.length, 1, 'Shutdown must not start a second overlapping tab stop.');
    slowResponses[0].writeHead(200); slowResponses[0].end('done');
    const stopResponse = await stopping;
    assert.equal(stopResponse.status, 200, `Tab stop failed: ${tabStopError || await stopResponse.text()}; recorder: ${signalError}`);
    assert.equal(await Promise.race([signalExited, delay(30000, undefined, { ref: false }).then(() => { throw new Error('Signal recorder did not exit.'); })]), 0, signalError);
    const signalManifest = JSON.parse(await readFile(join(signalOutput, 'manifest.json'), 'utf8'));
    assert.equal(signalManifest.status, 'complete');
    assert.deepEqual(signalManifest.recordings, ['segment-001.webm']);
    assert.equal(signalManifest.capture.segments[0].finalized, true);
  } finally {
    if (trickle) clearInterval(trickle);
    incomplete?.destroy();
    for (const response of slowResponses) if (!response.writableEnded) { response.writeHead(200); response.end('done'); }
    signalChild.kill('SIGTERM');
    fixture.close();
  }
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) await checkSignal(signal);

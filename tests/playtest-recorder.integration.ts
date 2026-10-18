// Run against a disposable local Wrangler instance; see HEADLESS_PLAYTESTING.md.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Use a local disposable game only.');
origin.searchParams.set('room', `recorder-${randomBytes(6).toString('hex')}`);
origin.searchParams.set('perf', '');
const secret = randomBytes(32).toString('hex');
const output = join(await mkdtemp(join(tmpdir(), 'tesland-recorder-test-')), 'run');
const gpu = process.env.TESLAND_PLAYTEST_GPU ?? 'default';
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', origin.href, '--target-ref', 'integration-test', '--serve', '--gpu', gpu, '--out', output], {
  env: { ...process.env, TESLAND_PLAYTEST_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });
const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
try {
  const lines = createInterface({ input: child.stdout });
  const line = await Promise.race([
    new Promise<string>(resolve => lines.once('line', resolve)),
    exited.then(code => { throw new Error(`Recorder exited before listening: ${code}`); }),
    delay(60000, undefined, { ref: false }).then(() => { throw new Error('Recorder did not start.'); }),
  ]);
  const endpoint = JSON.parse(line).endpoint as string | undefined;
  if (!endpoint) throw new Error(`Recorder did not start the control server. ${stderr}`);
  const unauthorized = await fetch(endpoint, { headers: { Authorization: 'Bearer incorrect' } });
  assert.equal(unauthorized.status, 401);
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
  const action = async (step: object) => {
    const response = await fetch(`${endpoint}/actions`, { method: 'POST', headers, body: JSON.stringify(step) });
    assert.equal(response.status, 200);
    return response.json() as Promise<{ result: any }>;
  };
  const tooLong = await fetch(`${endpoint}/actions`, { method: 'POST', headers, body: JSON.stringify({ type: 'wait', ms: 1001 }) });
  assert.equal(tooLong.status, 400);
  const zeroTimeout = await fetch(`${endpoint}/actions`, { method: 'POST', headers, body: JSON.stringify({ type: 'waitFor', selector: '#never-exists', timeoutMs: 0 }) });
  assert.equal(zeroTimeout.status, 400, 'A zero timeout must not block the control queue.');
  let live = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const status = await fetch(endpoint, { headers }).then(result => result.json()) as { state: { connection: string | null } };
    if (status.state.connection?.startsWith('● LIVE')) { live = true; break; }
    await delay(500);
  }
  assert.ok(live, 'Game must be live before sending driving input.');
  await action({ type: 'waitFor', selector: '#connection:has-text("LIVE")', timeoutMs: 1000 });
  await action({ type: 'waitFor', selector: '#hud:not(.hidden)', state: 'attached', timeoutMs: 1000 });
  await action({ type: 'recordStart' });
  await action({ type: 'keyDown', key: 'KeyW' });
  // A human or agent may wait between requests without sending a wait action.
  await delay(1400);
  const sample = await action({ type: 'sample' });
  assert.ok(Number(sample.result.speed) > 0, 'Driving input must move the car.');
  await action({ type: 'keyUp', key: 'KeyW' });
  const frame = await fetch(`${endpoint}/frame.png`, { headers });
  assert.equal(frame.headers.get('content-type'), 'image/png');
  assert.ok((await frame.arrayBuffer()).byteLength > 1000);
  await action({ type: 'recordStop' });
  const finish = await fetch(`${endpoint}/actions`, { method: 'POST', headers, body: JSON.stringify({ type: 'finish' }) });
  assert.equal(finish.status, 202);
  assert.equal(await exited, 0, stderr);
  const manifestText = await readFile(join(output, 'manifest.json'), 'utf8');
  const replayText = await readFile(join(output, 'replay.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const replay = JSON.parse(replayText);
  assert.equal(manifest.status, 'complete');
  assert.equal(manifest.replay.replayable, true);
  assert.ok(replay.steps.some((step: { type: string; key?: string }) => step.type === 'keyDown' && step.key === 'KeyW'));
  const downIndex = replay.steps.findIndex((step: { type: string }) => step.type === 'keyDown');
  const sampleIndex = replay.steps.findIndex((step: { type: string }) => step.type === 'sample');
  assert.ok(replay.steps.slice(downIndex + 1, sampleIndex).some((step: { type: string; ms?: number }) => step.type === 'wait' && (step.ms ?? 0) >= 1000), 'Replay must preserve the hold between requests.');
  assert.ok(!manifestText.includes(secret) && !replayText.includes(secret));
  assert.ok((await stat(join(output, 'segment-001.webm'))).size > 1000);
  if (process.platform !== 'win32') assert.equal((await stat(output)).mode & 0o077, 0);
  const replayTarget = new URL(origin);
  replayTarget.searchParams.set('room', `replay-${randomBytes(6).toString('hex')}`);
  const replayOutput = join(dirname(output), 'replay');
  const replayChild = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', replayTarget.href, '--target-ref', 'integration-test', '--scenario', join(output, 'replay.json'), '--gpu', gpu, '--out', replayOutput], { stdio: ['ignore', 'ignore', 'pipe'] });
  let replayError = '';
  replayChild.stderr.on('data', chunk => { replayError += chunk; });
  assert.equal(await new Promise<number | null>(resolve => replayChild.once('exit', resolve)), 0, replayError);
  const replayManifest = JSON.parse(await readFile(join(replayOutput, 'manifest.json'), 'utf8'));
  assert.equal(replayManifest.status, 'complete');
  assert.ok(replayManifest.events.some((event: { type: string; sample?: { speed?: string } }) => event.type === 'sample' && Number(event.sample?.speed) > 0), 'Replayed controls must move the car.');

  // Observe real DOM touch events so releasing either finger is checked
  // independently of the runner's own bookkeeping.
  const fixture = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
      <button id="a" style="width:140px;height:140px">A</button><button id="b" style="width:140px;height:140px">B</button><div id="empty"></div>
      <script>for (const type of ['touchstart','touchend','touchcancel']) document.body.addEventListener(type, event => {
        event.preventDefault(); document.body.dataset.teslandPerf = JSON.stringify({touches: [...event.touches].map(t => t.identifier).sort(), changed: [...event.changedTouches].map(t => t.identifier).sort()});
      }, {passive:false});</script>`);
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const fixtureAddress = fixture.address();
  assert.ok(fixtureAddress && typeof fixtureAddress !== 'string');
  const touchChild = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', `http://127.0.0.1:${fixtureAddress.port}/`, '--target-ref', 'touch-test', '--serve', '--mobile', '--no-video', '--gpu', gpu, '--out', join(dirname(output), 'touch')], {
    env: { ...process.env, TESLAND_PLAYTEST_SECRET: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const touchExited = new Promise<number | null>(resolve => touchChild.once('exit', resolve));
  let touchError = '';
  touchChild.stderr.on('data', chunk => { touchError += chunk; });
  try {
    const touchLine = await Promise.race([
      new Promise<string>(resolve => createInterface({ input: touchChild.stdout }).once('line', resolve)),
      touchExited.then(code => { throw new Error(`Touch recorder exited before listening: ${code} ${touchError}`); }),
    ]);
    const touchEndpoint = JSON.parse(touchLine).endpoint as string;
    const touchAction = async (step: object) => {
      const response = await fetch(`${touchEndpoint}/actions`, { method: 'POST', headers, body: JSON.stringify(step) });
      assert.equal(response.status, 200);
    };
    const touchState = async () => (await fetch(touchEndpoint, { headers }).then(response => response.json()) as { state: { perf: { touches: number[]; changed: number[] } } }).state.perf;
    for (const first of [1, 2]) {
      await touchAction({ type: 'touchDown', id: 1, selector: '#a' });
      await touchAction({ type: 'touchDown', id: 2, selector: '#b' });
      assert.deepEqual((await touchState()).touches, [1, 2]);
      await touchAction({ type: 'touchUp', id: first });
      assert.deepEqual(await touchState(), { touches: [first === 1 ? 2 : 1], changed: [first] });
      await touchAction({ type: 'touchUp', id: first === 1 ? 2 : 1 });
      assert.deepEqual((await touchState()).touches, []);
    }
    await touchAction({ type: 'touchDown', id: 1, selector: '#a' });
    await delay(1200);
    const touchFinish = await fetch(`${touchEndpoint}/actions`, { method: 'POST', headers, body: JSON.stringify({ type: 'finish' }) });
    assert.equal(touchFinish.status, 202);
    assert.equal(await touchExited, 0, touchError);
    const touchReplay = JSON.parse(await readFile(join(dirname(output), 'touch', 'replay.json'), 'utf8'));
    const lastDown = touchReplay.steps.findLastIndex((step: { type: string }) => step.type === 'touchDown');
    assert.ok(touchReplay.steps.slice(lastDown + 1).some((step: { type: string; ms?: number }) => step.type === 'wait' && (step.ms ?? 0) >= 1000), 'Replay must preserve a hold through finish.');
    assert.equal(touchReplay.steps.at(-1).type, 'releaseAll');

    const invalidScenario = join(dirname(output), 'empty-number.json');
    await writeFile(invalidScenario, JSON.stringify({ steps: [{ type: 'assertNumberAbove', selector: '#empty', value: -1 }] }));
    const invalidChild = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playtest-record.ts', '--url', `http://127.0.0.1:${fixtureAddress.port}/`, '--target-ref', 'numeric-test', '--scenario', invalidScenario, '--no-video', '--gpu', gpu, '--out', join(dirname(output), 'invalid-number')], { stdio: 'ignore' });
    assert.equal(await new Promise<number | null>(resolve => invalidChild.once('exit', resolve)), 1, 'An empty numeric checkpoint must fail.');
    const invalidManifest = JSON.parse(await readFile(join(dirname(output), 'invalid-number', 'manifest.json'), 'utf8'));
    assert.equal(invalidManifest.target.httpStatus, 200);
    assert.ok(invalidManifest.events.some((event: { type: string; status: string }) => event.type === 'assertNumberAbove' && event.status === 'failed'));
  } finally {
    touchChild.kill('SIGTERM');
    fixture.close();
  }
  console.log(`Local recorder integration passed; artifacts: ${output}`);
} catch (error) {
  child.kill('SIGTERM');
  throw error;
}

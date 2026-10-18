// Run against a disposable local Wrangler instance; see HEADLESS_PLAYTESTING.md.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
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
  await action({ type: 'wait', ms: 1000 });
  await action({ type: 'wait', ms: 1000 });
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
  console.log(`Local recorder integration passed; artifacts: ${output}`);
} catch (error) {
  child.kill('SIGTERM');
  throw error;
}

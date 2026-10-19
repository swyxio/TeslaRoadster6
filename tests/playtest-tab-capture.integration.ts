// Functional tab capture against a disposable local game; not a smoothness test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

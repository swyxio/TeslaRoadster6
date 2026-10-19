import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('a valid physics trace with empty media does not verify visual evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-boost-trace-'));
  try {
    const manifest = {
      status: 'complete', browserErrors: { pageErrors: 0, consoleErrors: 0 },
      capture: { enabled: true }, recordings: ['segment-001.webm'],
      trajectory: { status: 'available' }, viewport: { width: 1280, height: 720 },
      events: [
        { type: 'keyDown', key: 'Shift', commandStartedAtMs: 100, status: 'ok' },
        { type: 'keyUp', key: 'Shift', commandStartedAtMs: 500, status: 'ok' },
        { type: 'jumpUntilAirborne', commandStartedAtMs: 600, status: 'ok' },
        { type: 'recordStop', commandStartedAtMs: 1500, status: 'ok' }
      ]
    };
    const grounded = (atMs: number) => ({ atMs, supported: true, thrusters: 1, speed: 2, poseRevision: 1 });
    const poses = [
      grounded(100), grounded(250), grounded(400),
      { atMs: 700, supported: false, vy: 2, jumpBurstUntil: 3, worldTime: 2, thrusters: 6, poseRevision: 1 },
      { atMs: 1200, supported: true, tick: 42, poseRevision: 1 }
    ];
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses));
    for (const file of ['segment-001.webm', 'boost.png', 'jump.png', 'landing.png']) writeFileSync(join(dir, file), '');
    const run = () => spawnSync(process.execPath, ['scripts/verify-boost-landing.mjs', dir], { encoding: 'utf8' });
    const checked = run();
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(
      (({ status, recordingQuality, visualEvidence }) => ({ status, recordingQuality, visualEvidence }))(JSON.parse(checked.stdout)),
      { status: 'trace-verified', recordingQuality: 'UNVERIFIED', visualEvidence: 'UNVERIFIED' }
    );
    writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses.filter(pose => pose.supported)));
    assert.notEqual(run().status, 0, 'a trace without the jump must fail');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

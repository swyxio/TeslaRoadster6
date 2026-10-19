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
      trajectory: { status: 'available', samples: 5 }, viewport: { width: 1280, height: 720 },
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
    for (const browserErrors of [undefined, {}, { pageErrors: 0 }, { consoleErrors: 0 }, { pageErrors: 1, consoleErrors: 0 }]) {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, browserErrors }));
      assert.notEqual(run().status, 0, `invalid browser errors must fail: ${JSON.stringify(browserErrors)}`);
    }
    for (const samples of [undefined, 4, 6]) {
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, trajectory: { status: 'available', samples } }));
      assert.notEqual(run().status, 0, `incorrect trajectory sample count must fail: ${samples}`);
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    for (const atMs of [undefined, null, '250', -1, 50]) {
      writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses.map((pose, index) => index === 1 ? { ...pose, atMs, poseRevision: 2 } : pose)));
      const malformed = run();
      assert.notEqual(malformed.status, 0, `invalid pose timestamp must fail: ${atMs}`);
      assert.match(malformed.stderr, /ordered timestamps/);
    }
    writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses.map((pose, index) => index === 1 ? { ...pose, atMs: 100 } : pose)));
    assert.equal(run().status, 0, 'equal rounded timestamps are valid');
    for (const revision of [undefined, null, -1, 1.5]) {
      writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses.map(pose => ({ ...pose, poseRevision: revision }))));
      assert.notEqual(run().status, 0, `invalid pose revision must fail: ${revision}`);
    }
    writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(poses.map((pose, index) => ({ ...pose, poseRevision: index === 0 ? 2 : 1 }))));
    assert.notEqual(run().status, 0, 'a changed pose revision must fail');
    const groundedOnly = poses.filter(pose => pose.supported);
    writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(groundedOnly));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, trajectory: { ...manifest.trajectory, samples: groundedOnly.length } }));
    const withoutJump = run();
    assert.notEqual(withoutJump.status, 0, 'a trace without the jump must fail');
    assert.match(withoutJump.stderr, /jump burst was not observed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

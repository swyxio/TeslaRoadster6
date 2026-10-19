import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeContinuity, distanceRangeForCommonOffset } from '../scripts/driving-continuity-gate.mjs';

function capture() {
  const offset = 10, speed = 12, fps = 60;
  const identity = { captureId: 'capture-1', roomGeneration: 'room-generation-1', connectionGeneration: 'connection-1', vehicleId: 'car-1', entityIncarnation: 'incarnation-1' };
  const ticks = Array.from({ length: 101 }, (_, i) => ({ tick: i, atMs: i * 50, x: i * 50 * speed / 1000,
    y: 0, z: 0, yaw: 0, vx: speed, vy: 0, vz: 0, supportId: 'ground', poseRevision: 0, contactReasons: [] as string[], identity: { ...identity } }));
  const frames = Array.from({ length: 121 }, (_, i) => {
    const atMs = offset + 600 + i * 1000 / fps;
    return { atMs, visual: { x: (atMs - offset) * speed / 1000, y: 0, z: 0, q: [0, 0, 0, 1] },
      localPredicted: true, snapLocal: false, menu: false, identity: { ...identity } };
  });
  const trace = { binding: { ...identity, verified: true }, frames, controls: [{ atMs: 0, throttle: 1, steer: 0, brake: false, boost: false, hover: false, identity: { ...identity } }],
    errors: 0, dropped: { frames: 0, controls: 0, states: 0, events: 0, sent: 0, marks: 0, turnarounds: 0 } };
  const authority = { binding: { ...identity, verified: true }, format: 1, complete: true, dropped: 0, failed: 0, collisionCoverage: 'all-solid-and-entity-paths', ticks,
    interpolation: { verified: true, maxPositionErrorM: 0 },
    clock: { browserMinusAuthorityMinMs: offset, browserMinusAuthorityMaxMs: offset, bracketedBefore: true,
      bracketedAfter: true, continuityVerified: true, maxTickTimingErrorMs: 0, offsetModel: 'bounded', constantOffsetVerified: false } };
  return { trace, authority, window: { startMs: frames[0].atMs, endMs: frames.at(-1)!.atMs } };
}

test('same-time authoritative interpolation measures steady motion at matched speed', () => {
  const report = analyzeContinuity(capture());
  assert.equal(report.status, 'measured');
  assert.equal(report.analysis, 'steady-speed-only');
  assert.equal(report.continuityGate, 'HOLD');
  assert.equal(report.yawAndPacketAlignment, 'not-assessed');
  assert.equal(report.speedWithinTarget, true);
  assert.equal(report.samples.length, 120);
  assert.ok(Math.abs(report.central.p05 - 1) < 1e-10);
  assert.ok(Math.abs(report.central.p95 - 1) < 1e-10);
  assert.equal(report.incompleteIntervals, 0);
});

test('missing, mismatched or changing capture identities cannot produce a speed pass', () => {
  for (const mutate of [
    (c: ReturnType<typeof capture>) => { c.authority.binding.vehicleId = 'another-car'; },
    (c: ReturnType<typeof capture>) => { c.authority.binding.captureId = 'another-session'; },
    (c: ReturnType<typeof capture>) => { c.trace.binding.roomGeneration = 'another-room-generation'; },
    (c: ReturnType<typeof capture>) => { c.trace.binding.verified = false; },
    (c: ReturnType<typeof capture>) => { c.trace.frames[40].identity.vehicleId = 'another-car'; },
    (c: ReturnType<typeof capture>) => { c.authority.ticks[40].identity.roomGeneration = 'another-room-generation'; },
    (c: ReturnType<typeof capture>) => { c.trace.frames[40].identity.connectionGeneration = 'reconnected'; },
    (c: ReturnType<typeof capture>) => { c.authority.ticks[40].identity.entityIncarnation = 'reused-id'; },
    (c: ReturnType<typeof capture>) => { c.authority.binding.entityIncarnation = ''; },
    (c: ReturnType<typeof capture>) => { c.trace.controls[0].identity.captureId = ''; },
    (c: ReturnType<typeof capture>) => { delete (c.trace.frames[40] as Partial<typeof c.trace.frames[number]>).identity; },
  ]) {
    const input = capture(); mutate(input);
    const report = analyzeContinuity(input);
    assert.equal(report.speedWithinTarget, null);
    assert.equal(report.status, 'unavailable');
    assert.ok(report.invalid.includes('unproven-capture-identity'));
    assert.equal(report.continuityGate, 'HOLD');
  }
});

test('missing contact, clocks, or dropped browser data cannot produce a speed pass', () => {
  for (const makeIncomplete of [
    (c: ReturnType<typeof capture>) => { c.authority.collisionCoverage = 'partial'; },
    (c: ReturnType<typeof capture>) => { c.authority.interpolation.verified = false; },
    (c: ReturnType<typeof capture>) => { c.authority.clock.bracketedAfter = false; },
    (c: ReturnType<typeof capture>) => { c.trace.dropped.frames = 1; },
    (c: ReturnType<typeof capture>) => { delete (c.trace.dropped as Partial<typeof c.trace.dropped>).controls; },
  ]) {
    const input = capture(); makeIncomplete(input);
    const report = analyzeContinuity(input);
    assert.equal(report.status, 'unavailable'); assert.equal(report.speedWithinTarget, null);
  }
});

test('uncertain position between tick poses widens the speed bound', () => {
  const input = capture();
  input.authority.interpolation.maxPositionErrorM = .01;
  const report = analyzeContinuity(input);
  assert.equal(report.status, 'measured');
  assert.equal(report.speedWithinTarget, null);
  assert.ok(report.conservativeP05 < .92);
  assert.ok(report.conservativeP95 > 1.1);
});

test('uncertain clock is reported as indeterminate instead of rounding to a pass', () => {
  const input = capture();
  input.authority.clock.browserMinusAuthorityMinMs = 9;
  input.authority.clock.browserMinusAuthorityMaxMs = 11;
  const report = analyzeContinuity(input);
  assert.equal(report.status, 'measured'); assert.equal(report.speedWithinTarget, null);
  assert.ok(report.conservativeP05 < .9); assert.ok(report.conservativeP95 > 1.1);
});

test('a proven common offset cancels for constant velocity, but an unproven one cannot', () => {
  const input = capture();
  input.authority.clock.browserMinusAuthorityMinMs = 9;
  input.authority.clock.browserMinusAuthorityMaxMs = 11;
  input.authority.clock.offsetModel = 'constant';
  assert.equal(analyzeContinuity(input).status, 'unavailable');
  input.authority.clock.constantOffsetVerified = true;
  const report = analyzeContinuity(input);
  assert.equal(report.speedWithinTarget, true);
  assert.ok(Math.abs(report.conservativeP05 - 1) < 1e-10);
  assert.ok(Math.abs(report.conservativeP95 - 1) < 1e-10);
});

test('common-offset bounds include a minimum between tick breakpoints', () => {
  const ticks = [{ atMs: 0, x: 0, y: 0, z: 0 }, { atMs: 1, x: 1, y: 0, z: 0 },
    { atMs: 2, x: 1, y: 0, z: 1 }, { atMs: 3, x: 0, y: 0, z: 1 }, { atMs: 4, x: -1, y: 0, z: 1 }];
  const range = distanceRangeForCommonOffset(ticks, 2, 3, 0, 1);
  assert.ok(Math.abs(range!.min - Math.SQRT1_2) < 1e-10);
  assert.equal(range!.max, 1);
});

test('common-offset range encloses sampled displacement on irregular tick paths', () => {
  let seed = 0x12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const point = (ticks: { atMs: number; x: number; y: number; z: number }[], time: number) => {
    const i = ticks.findIndex((tick, j) => j < ticks.length - 1 && tick.atMs <= time && ticks[j + 1].atMs >= time);
    assert.ok(i >= 0);
    const a = ticks[i], b = ticks[i + 1], t = (time - a.atMs) / (b.atMs - a.atMs);
    return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
  };
  for (let trial = 0; trial < 50; trial++) {
    const ticks = Array.from({ length: 8 }, (_, i) => ({ atMs: i * 50, x: random() * 20, y: random(), z: random() * 20 }));
    const range = distanceRangeForCommonOffset(ticks, 175, 220, 0, 75)!;
    for (let i = 0; i <= 150; i++) {
      const offset = i / 2, a = point(ticks, 175 - offset), b = point(ticks, 220 - offset);
      const distance = Math.hypot(...a.map((value, k) => b[k] - value));
      assert.ok(distance >= range.min - 1e-10 && distance <= range.max + 1e-10);
    }
  }
});

test('per-tick timing uncertainty stays in the bound even with a common offset', () => {
  const input = capture();
  input.authority.clock.offsetModel = 'constant';
  input.authority.clock.constantOffsetVerified = true;
  input.authority.clock.maxTickTimingErrorMs = 1;
  const report = analyzeContinuity(input);
  assert.equal(report.speedWithinTarget, null);
  assert.ok(report.conservativeP05 < .9); assert.ok(report.conservativeP95 > 1.1);
});

test('contact and actual relocation exclude the affected steady interval', () => {
  const input = capture();
  input.authority.ticks[30].contactReasons.push('wall');
  for (const tick of input.authority.ticks.slice(42)) tick.poseRevision = 1;
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.contact > 0);
  assert.ok(report.excluded.relocation > 0);
  assert.ok(report.samples.length < 120);
});

test('ground-scoped coverage accepts ground samples and excludes out-of-scope paths', () => {
  const input = capture();
  input.authority.collisionCoverage = 'grounded-path-v1';
  input.authority.ticks[30].contactReasons.push('out-of-ground-scope');
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.contact > 0);
  assert.equal(report.status, 'measured');
});

test('missing or late ticks inside the selected interval hold the result', () => {
  const input = capture(); input.authority.ticks.splice(30, 1);
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.tickGap > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('recurring visual pauses count even when prediction falls back or snaps', () => {
  const input = capture();
  for (let i = 1; i < input.trace.frames.length; i += 2) {
    input.trace.frames[i].visual.x = input.trace.frames[i - 1].visual.x;
    input.trace.frames[i].localPredicted = false;
    input.trace.frames[i].snapLocal = true;
  }
  const report = analyzeContinuity(input);
  assert.equal(report.speedWithinTarget, false);
  assert.equal(report.samples.length, 120);
  assert.equal(report.central.p05, 0);
  assert.ok(report.samples.some((sample: { snapLocal: boolean }) => sample.snapLocal));
});

test('a changing or unavailable speed reference never gets treated as steady', () => {
  const input = capture();
  for (const tick of input.authority.ticks) tick.vx = tick.tick < 25 ? 11 : 20;
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.unstableSpeed > 0);
});

test('missing selected-window boundaries and in-window gaps hold the speed result', () => {
  const short = capture(); short.window.endMs = 60_000;
  const shortReport = analyzeContinuity(short);
  assert.equal(shortReport.windowCovered, false);
  assert.equal(shortReport.speedWithinTarget, null);
  const gap = capture();
  for (const frame of gap.trace.frames.slice(60)) {
    frame.atMs += 2000;
    frame.visual.x = (frame.atMs - 10) * 12 / 1000;
  }
  gap.window.endMs = gap.trace.frames.at(-1)!.atMs;
  const gapReport = analyzeContinuity(gap);
  assert.equal(gapReport.windowCovered, true);
  assert.ok(gapReport.excluded.frameGap > 0);
  assert.equal(gapReport.speedWithinTarget, null);
});

test('an older coarse tick interval cannot hide a later frame gap', () => {
  const input = capture();
  input.authority.ticks[25].atMs = 1299;
  input.authority.ticks[25].x = 1299 * 12 / 1000;
  input.trace.frames[61].atMs = input.trace.frames[60].atMs + 95;
  input.trace.frames[61].visual.x = (input.trace.frames[61].atMs - 10) * 12 / 1000;
  input.trace.frames.splice(62, 4);
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.frameGap > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('frame resolution rejects a reference tick hidden at the exact frame boundaries', () => {
  const input = capture();
  const first = input.trace.frames[60];
  input.trace.frames[61].atMs = first.atMs + 50;
  input.trace.frames[61].visual.x = (input.trace.frames[61].atMs - 10) * 12 / 1000;
  input.trace.frames.splice(62, 2);
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.frameGap > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('frame resolution accounts for tick timestamp uncertainty', () => {
  const input = capture();
  input.authority.clock.maxTickTimingErrorMs = .125;
  input.trace.frames[60].atMs = 1610.125;
  input.trace.frames[61].atMs = 1659.875;
  for (const frame of input.trace.frames.slice(60, 62)) frame.visual.x = (frame.atMs - 10) * 12 / 1000;
  input.trace.frames.splice(62, 1);
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.frameGap > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('frame resolution considers the whole proven common-offset bracket', () => {
  const input = capture();
  Object.assign(input.authority.clock, { browserMinusAuthorityMinMs: 9, browserMinusAuthorityMaxMs: 11,
    offsetModel: 'constant', constantOffsetVerified: true });
  input.trace.frames[60].atMs = 1611;
  input.trace.frames[61].atMs = 1661;
  input.trace.frames.splice(62, 2);
  for (const frame of input.trace.frames) frame.visual.x = (frame.atMs - 11) * 12 / 1000;
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.frameGap > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('excluded contact, control, relocation or speed intervals cannot silently disappear', () => {
  const input = capture(); input.authority.ticks[30].contactReasons.push('wall');
  const report = analyzeContinuity(input);
  assert.ok(report.excluded.contact > 0);
  assert.ok(report.incompleteIntervals > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('nearest-rank p95 rejects two high ratios in thirty intervals', () => {
  const input = capture(); input.trace.frames = input.trace.frames.slice(0, 31);
  for (let i = 1; i < input.trace.frames.length; i++) input.trace.frames[i].visual.x += .1 + (i >= 2 ? .1 : 0);
  input.window.endMs = input.trace.frames.at(-1)!.atMs;
  const report = analyzeContinuity(input);
  assert.equal(report.samples.filter((sample: { ratio: number }) => sample.ratio > 1.1).length, 2);
  assert.equal(report.samples.length, 30);
  assert.ok(report.conservativeP95 > 1.1);
  assert.equal(report.speedWithinTarget, false);
});

test('missing yaw holds the sample, while yaw surges remain an unassessed continuity check', () => {
  const missing = capture(); for (const frame of missing.trace.frames) frame.visual.q = [];
  const noYaw = analyzeContinuity(missing);
  assert.ok(noYaw.excluded.invalidYaw > 0);
  assert.equal(noYaw.speedWithinTarget, null);
  assert.equal(noYaw.continuityGate, 'HOLD');
  const surge = capture();
  for (let i = 0; i < surge.trace.frames.length; i++) surge.trace.frames[i].visual.q = i % 2 ? [0, Math.SQRT1_2, 0, Math.SQRT1_2] : [0, 0, 0, 1];
  const unassessed = analyzeContinuity(surge);
  assert.ok(unassessed.samples.some((sample: { yawRateDegPerSecond: number }) => Math.abs(sample.yawRateDegPerSecond) > 1000));
  assert.equal(unassessed.speedWithinTarget, true);
  assert.equal(unassessed.yawAndPacketAlignment, 'not-assessed');
  assert.equal(unassessed.continuityGate, 'HOLD');
});

test('inconsistent authority failure counters and slow position traces cannot pass', () => {
  const failed = capture(); failed.authority.failed = 1;
  assert.equal(analyzeContinuity(failed).speedWithinTarget, null);
  delete (failed.authority as Partial<typeof failed.authority>).failed;
  assert.equal(analyzeContinuity(failed).speedWithinTarget, null);
  const slow = capture();
  for (const tick of slow.authority.ticks) tick.x = tick.atMs * 2 / 1000;
  for (const frame of slow.trace.frames) frame.visual.x = (frame.atMs - 10) * 2 / 1000;
  const report = analyzeContinuity(slow);
  assert.ok(report.excluded.referenceSpeed > 0);
  assert.equal(report.speedWithinTarget, null);
});

test('CLI reports speed-only evidence and never exits with full-gate success', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tesland-speed-analysis-'));
  const file = join(directory, 'capture.json');
  const script = fileURLToPath(new URL('../scripts/driving-continuity-gate.mjs', import.meta.url));
  try {
    writeFileSync(file, JSON.stringify(capture()));
    let result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    let output = JSON.parse(result.stdout);
    assert.equal(output.analysis, 'steady-speed-only'); assert.equal(output.speedWithinTarget, true); assert.equal(output.continuityGate, 'HOLD');
    writeFileSync(file, '{}'); result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    assert.equal(result.status, 2); output = JSON.parse(result.stdout); assert.equal(output.speedWithinTarget, null);
    const failed = capture();
    for (let i = 1; i < failed.trace.frames.length; i += 2) failed.trace.frames[i].visual.x = failed.trace.frames[i - 1].visual.x;
    writeFileSync(file, JSON.stringify(failed)); result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    assert.equal(result.status, 1); output = JSON.parse(result.stdout); assert.equal(output.speedWithinTarget, false);
    assert.equal(output.continuityGate, 'HOLD');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('position-derived speed must remain above 10 m/s under timing and pose uncertainty', () => {
  const position = capture(); position.authority.interpolation.maxPositionErrorM = .06;
  const positionReport = analyzeContinuity(position);
  assert.ok(positionReport.excluded.referenceSpeed > 0);
  assert.equal(positionReport.speedWithinTarget, null);
  const timing = capture(); timing.authority.clock.maxTickTimingErrorMs = 10;
  const timingReport = analyzeContinuity(timing);
  assert.ok(timingReport.excluded.referenceSpeed > 0);
  assert.equal(timingReport.speedWithinTarget, null);
});

test('a small eligible cluster cannot represent a larger mixed-control window', () => {
  const input = capture();
  input.trace.controls.push({ ...input.trace.controls[0], atMs: input.trace.frames[40].atMs, throttle: 0 });
  const report = analyzeContinuity(input);
  assert.ok(report.samples.length >= 30);
  assert.ok(report.excluded.control > 0);
  assert.equal(report.windowCovered, true);
  assert.equal(report.speedWithinTarget, null);
});

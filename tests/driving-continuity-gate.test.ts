import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeContinuity, distanceRangeForCommonOffset } from '../scripts/driving-continuity-gate.mjs';

function capture() {
  const offset = 10, speed = 12, fps = 60;
  const ticks = Array.from({ length: 101 }, (_, i) => ({ tick: i, atMs: i * 50, x: i * 50 * speed / 1000,
    y: 0, z: 0, yaw: 0, vx: speed, vy: 0, vz: 0, supportId: 'ground', poseRevision: 0, contactReasons: [] as string[] }));
  const frames = Array.from({ length: 121 }, (_, i) => {
    const atMs = offset + 600 + i * 1000 / fps;
    return { atMs, visual: { x: (atMs - offset) * speed / 1000, y: 0, z: 0, q: [0, 0, 0, 1] },
      localPredicted: true, snapLocal: false, menu: false };
  });
  const trace = { frames, controls: [{ atMs: 0, throttle: 1, steer: 0, brake: false, boost: false, hover: false }],
    errors: 0, dropped: { frames: 0, controls: 0, states: 0, events: 0, sent: 0, marks: 0, turnarounds: 0 } };
  const authority = { format: 1, complete: true, dropped: 0, collisionCoverage: 'all-solid-and-entity-paths', ticks,
    interpolation: { verified: true, maxPositionErrorM: 0 },
    clock: { browserMinusAuthorityMinMs: offset, browserMinusAuthorityMaxMs: offset, bracketedBefore: true,
      bracketedAfter: true, continuityVerified: true, maxTickTimingErrorMs: 0, offsetModel: 'bounded', constantOffsetVerified: false } };
  return { trace, authority, window: { startMs: frames[0].atMs, endMs: frames.at(-1)!.atMs } };
}

test('same-time authoritative interpolation measures steady motion at matched speed', () => {
  const report = analyzeContinuity(capture());
  assert.equal(report.status, 'measured');
  assert.equal(report.withinTarget, true);
  assert.equal(report.samples.length, 120);
  assert.ok(Math.abs(report.central.p05 - 1) < 1e-10);
  assert.ok(Math.abs(report.central.p95 - 1) < 1e-10);
  assert.equal(report.incompleteIntervals, 0);
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
    assert.equal(report.status, 'unavailable'); assert.equal(report.withinTarget, null);
  }
});

test('uncertain position between tick poses widens the speed bound', () => {
  const input = capture();
  input.authority.interpolation.maxPositionErrorM = .01;
  const report = analyzeContinuity(input);
  assert.equal(report.status, 'measured');
  assert.equal(report.withinTarget, null);
  assert.ok(report.conservativeP05 < .92);
  assert.ok(report.conservativeP95 > 1.1);
});

test('uncertain clock is reported as indeterminate instead of rounding to a pass', () => {
  const input = capture();
  input.authority.clock.browserMinusAuthorityMinMs = 9;
  input.authority.clock.browserMinusAuthorityMaxMs = 11;
  const report = analyzeContinuity(input);
  assert.equal(report.status, 'measured'); assert.equal(report.withinTarget, null);
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
  assert.equal(report.withinTarget, true);
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
  assert.equal(report.withinTarget, null);
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
  assert.equal(report.withinTarget, null);
});

test('recurring visual pauses count even when prediction falls back or snaps', () => {
  const input = capture();
  for (let i = 1; i < input.trace.frames.length; i += 2) {
    input.trace.frames[i].visual.x = input.trace.frames[i - 1].visual.x;
    input.trace.frames[i].localPredicted = false;
    input.trace.frames[i].snapLocal = true;
  }
  const report = analyzeContinuity(input);
  assert.equal(report.withinTarget, false);
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

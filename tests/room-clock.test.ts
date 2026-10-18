import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { RoomClock } from '../worker/room-clock';

test('room deadline absorbs recurring callback delay instead of accumulating it', () => {
  const clock = new RoomClock(0);
  for (let step = 1; step <= 1200; step++) {
    assert.equal(clock.afterStep(step * 50 + 3), 47);
  }
});

test('room deadline permits at most one immediate step after a long stall', () => {
  const clock = new RoomClock(0);
  assert.equal(clock.afterStep(500), 0);
  assert.equal(clock.afterStep(500), 50);
  assert.equal(clock.afterStep(553), 47);
});

test('room deadline recovers from a backward wall-clock correction', () => {
  const clock = new RoomClock(1_000);
  assert.equal(clock.afterStep(900), 50);
  assert.equal(clock.afterStep(952), 48);
});

test('catch-up after a stall does not revive a stale throttle or jump', () => {
  const clock = new RoomClock(0);
  const control = new ScheduledInput({ ...NEUTRAL });
  control.receive({ seq: 1, targetTick: 1, controlRevision: 0, actionSeq: 0,
    input: { ...NEUTRAL, throttle: 1, jump: 1 } }, 0, 0);

  const first = control.advance(1, 500);
  assert.equal(first.input.throttle, 0);
  assert.equal(first.input.jump, 0);
  assert.deepEqual(first.outcomes.map(outcome => outcome.status), ['expired']);
  assert.equal(clock.afterStep(500), 0);
  const second = control.advance(2, 500);
  assert.equal(second.input.throttle, 0);
  assert.equal(second.input.jump, 0);
  assert.deepEqual(second.outcomes, []);
  assert.equal(clock.afterStep(500), 50);
});

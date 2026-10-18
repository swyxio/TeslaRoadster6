import assert from 'node:assert/strict';
import test from 'node:test';
import { fundingTimeline, scenarios } from '../scripts/economy-starship.ts';

test('global earnings aggregate across rooms without multiplying the target', () => {
  const s = scenarios[1];
  const t = fundingTimeline(s);
  assert.equal(t.activeHoursPerDay, 50);
  assert.equal(t.activeHoursToGoal, 8000);
  assert.equal(t.earnedPerDay, 6_250_000);
  assert.equal(t.globalEarnedDays, 160);
  assert.equal(t.oneRoomEarnedDays, 800);
  assert.equal(t.globalEarnedDays! * t.earnedPerDay, 1_000_000_000);
  assert.equal(t.oneRoomEarnedDays! * t.earnedPerDay / 5, 1_000_000_000);
});

test('zero activity makes the target unreachable', () => {
  const nobody = fundingTimeline({ ...scenarios[1], peoplePerDay: 0 });
  assert.equal(nobody.globalEarnedDays, null);
  assert.equal(nobody.oneRoomEarnedDays, null);
});

test('funding estimates reject physically or mathematically invalid inputs', () => {
  assert.throws(() => fundingTimeline({ ...scenarios[0], activeHoursPerPersonPerDay: 25 }));
  assert.throws(() => fundingTimeline({ ...scenarios[0], equallyPopulatedRooms: 0 }));
  assert.throws(() => fundingTimeline(scenarios[0], 0));
});

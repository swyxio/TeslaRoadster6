import assert from 'node:assert/strict';
import test from 'node:test';
import { communityTimeline } from '../scripts/economy-community.ts';
import { paths } from '../scripts/economy-five-minute.ts';
import { simulate } from '../scripts/economy-progression.ts';

test('community counter includes the initial grant once and the first-day earned events', () => {
  const scenario = { name: 'one', counts: [1, 0, 0, 0] as const, activeMinutesPerDay: 60 as const };
  const player = simulate(paths[0].profile, 'candidate', 1729, 40,
    { global: false, room: false, branchBalance: true, coreMilestones: true, cityVisitAwards: true, cadenceRedesign: true, trackWindows: true });
  const expected = 2500 + player.windows.slice(0, 12).reduce((sum, w) => sum + w.gross, 0);
  const timeline = communityTimeline(scenario, expected - 1);
  assert.equal(timeline.firstIncome, 2500);
  assert.equal(timeline.finishDay, 1);
  assert.equal(timeline.finalTotal, Math.round(expected));
});

test('milestones are ordered, a small population reaches its goal, and invalid populations fail', () => {
  const scenario = { name: 'two', counts: [1, 1, 0, 0] as const, activeMinutesPerDay: 30 as const };
  const t = communityTimeline(scenario, 1_000_000);
  const dates = Object.values(t.milestoneDays);
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  assert.ok(t.finishDay > 1);
  assert.ok(t.finalTotal >= t.target);
  assert.throws(() => communityTimeline({ ...scenario, counts: [0, 0, 0, 0] }));
  assert.throws(() => communityTimeline(scenario, 0));
});

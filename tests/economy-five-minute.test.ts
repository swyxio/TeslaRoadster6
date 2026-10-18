import assert from 'node:assert/strict';
import test from 'node:test';
import { branchPayout, profiles, simulate } from '../scripts/economy-progression.ts';
import { paths, phaseSummary, summarizePath } from '../scripts/economy-five-minute.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test('five-minute windows reconcile cash and keep distinct achievement categories', () => {
  const run = simulate(profiles[1], 'candidate', 1729, 8, { trackWindows: true, global: false, room: false });
  assert.equal(run.windows.length, 96);
  const sum = (select: (w: typeof run.windows[number]) => number) => run.windows.reduce((n, w) => n + select(w), 0);
  for (const w of run.windows) {
    close(w.gross, w.recurring + w.achievementCash + w.checkinCash + w.unlockCash);
    close(w.cashChange, w.gross - w.spending - w.fines);
  }
  close(sum(w => w.gross), run.totalEarned - 2500); // initial SF award precedes the first window
  close(sum(w => w.cashChange), run.cash - 2500);
  close(sum(w => w.achievementCash + w.checkinCash), run.ledger.achievements);
  assert.ok(sum(w => w.achievements) > 0);
  assert.equal(sum(w => w.cityAchievements), 7); // named city badges pay once, even after a level drop
  assert.ok(sum(w => w.checkins) > 0);
  assert.ok(sum(w => w.repeatableGoals) > 0);
  const firstHour = phaseSummary([run], 0, 60);
  assert.equal(firstHour.windows, 12);
  assert.equal(firstHour.meanAchievements5m, +(sum(w => w.endMinute <= 60 ? w.achievements : 0) / 12).toFixed(2));
  const blocks = summarizePath('test', [run]).earlyAchievementBlocks30m;
  assert.equal(blocks.blocks, 4);
  assert.equal(blocks.mean, +(sum(w => w.endMinute <= 120 ? w.achievements : 0) / 4).toFixed(2));
  close(blocks.below2Pct! + blocks.between2And4Pct! + blocks.above4Pct!, 100);
});

test('branch payouts are fixed at acceptance and pay for activity with or without wins', () => {
  assert.equal(branchPayout(0, 'dome'), 5530);
  assert.ok(branchPayout(3, 'dome') > branchPayout(0, 'dome'));
  const path = paths.find(p => p.name === 'Dome player, no wins')!;
  const run = simulate(path.profile, 'candidate', 1729, 8,
    { trackWindows: true, branchBalance: true, winChance: 0, global: false, room: false });
  assert.equal(run.deliveries, 0);
  assert.equal(run.wins, 0);
  assert.ok(run.ledger.matchPay > 0);
  assert.ok(run.windows.some(w => w.achievements > 0));
  assert.ok(run.windows.some(w => w.repeatableGoals > 0));
  assert.ok(run.level >= 3);
  assert.equal(run.homeMinute, null);
});

test('the alternative branch rules do not change a delivery-only seeded run', () => {
  const courier = paths.find(p => p.name === 'Courier')!.profile;
  const options = { trackWindows: true, global: false, room: false };
  const baseline = simulate(courier, 'candidate', 1729, 8, options);
  const balanced = simulate(courier, 'candidate', 1729, 8, { ...options, branchBalance: true });
  assert.deepEqual(balanced, baseline);
});

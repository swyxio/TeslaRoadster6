import assert from 'node:assert/strict';
import test from 'node:test';
import { branchPayout, cityUnlocks, profiles, simulate } from '../scripts/economy-progression.ts';
import { paths, phaseSummary, summarizePath } from '../scripts/economy-five-minute.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
const core = { trackWindows: true, global: false, room: false, branchBalance: true, coreMilestones: true, cityVisitAwards: true };

test('five-minute windows reconcile gross, spending, wallet and distinct categories', () => {
  const run = simulate(paths[3].profile, 'candidate', 1729, 8, core);
  assert.equal(run.windows.length, 96);
  const sum = (select: (w: typeof run.windows[number]) => number) => run.windows.reduce((n, w) => n + select(w), 0);
  for (const w of run.windows) {
    close(w.gross, w.recurring + w.achievementCash + w.checkinCash + w.unlockCash);
    close(w.cashChange, w.gross - w.spending - w.fines);
  }
  close(sum(w => w.gross), run.totalEarned - 2500);
  close(sum(w => w.cashChange), run.cash - 2500);
  close(sum(w => w.achievementCash + w.checkinCash), run.ledger.achievements);
  assert.equal(sum(w => w.cityAchievements), 7);
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

test('optional side-game payouts are deliberately lower than delivery rates', () => {
  assert.equal(branchPayout(0, 'dome'), 1950);
  assert.equal(branchPayout(0, 'race'), 1930);
  assert.equal(branchPayout(0, 'park'), 1650);
  assert.ok(branchPayout(0, 'tour') > branchPayout(0, 'dome'));
  assert.ok(branchPayout(3, 'dome') > branchPayout(0, 'dome'));
  const profile = { ...profiles[0], domeChance: 1 };
  const run = simulate(profile, 'candidate', 1729, 8, { ...core, winChance: 0 });
  assert.equal(run.deliveries, 0);
  assert.equal(run.wins, 0);
  assert.ok(run.ledger.matchPay > 0);
  assert.ok(run.windows.some(w => w.achievements > 0));
});

test('activity multipliers do not retroactively boost the triggering win', () => {
  const profile = { ...profiles[0], domeChance: 1 };
  const options = { trackWindows: true, branchBalance: true, global: false, room: true, winChance: 1 };
  const ordinary = simulate(profile, 'candidate', 1729, 1, options);
  const boosted = simulate(profile, 'candidate', 1729, 1, { ...options, allActivityMultiplier: true });
  const firstMatch = ordinary.windows.findIndex(w => w.tasks > 0);
  assert.ok(firstMatch >= 0);
  close(boosted.windows[firstMatch].gross, ordinary.windows[firstMatch].gross);
  assert.ok(boosted.ledger.matchPay > ordinary.ledger.matchPay);
});

test('exploration sensitivity does not repeat discovered landmarks', () => {
  const explorer = { ...profiles[0], exploreChance: 1, travelAfterTasks: 6 };
  const options = { ...core, cityVisitAwards: false, coreMilestones: false };
  const few = simulate({ ...explorer, landmarksPerCity: 3 }, 'candidate', 1729, 8, options);
  const many = simulate({ ...explorer, landmarksPerCity: 20 }, 'candidate', 1729, 8, options);
  const lateAchievements = (run: typeof few) => run.windows.filter(w => w.endMinute > 240).reduce((n, w) => n + w.achievements, 0);
  assert.ok(lateAchievements(many) > lateAchievements(few));
  assert.throws(() => simulate({ ...explorer, landmarksPerCity: 0 }, 'candidate', 1729, 1), /positive integer/);
});

test('new action-based achievements pay at most once per threshold', () => {
  const saver = paths.find(p => p.name === 'Delivery saver')!.profile;
  const run = simulate(saver, 'candidate', 1729, 8, core);
  assert.equal(run.cityVisitsAwarded, 4);
  assert.ok(run.cleanStreakAwards > 0 && run.cleanStreakAwards <= 5);
  assert.ok(run.destinationAwards > 0 && run.destinationAwards <= 5);
  assert.ok(run.onTimeAwards > 0 && run.onTimeAwards <= 5);
  const cabRun = simulate(paths[1].profile, 'candidate', 1729, 8, core);
  assert.equal(cabRun.cabRevenueAwards, 1);
  assert.ok(run.distinctDestinations <= 30);
  assert.equal(simulate(saver, 'candidate', 1729, 8, { ...core, coreMilestones: false, cityVisitAwards: false }).destinationAwards, 0);
});

test('30-minute sessions report active play without inventing idle income', () => {
  const casual = paths.find(p => p.name === '30-minute casual')!.profile;
  const run = simulate(casual, 'candidate', 1729, 2, core);
  assert.equal(run.sessions, 4);
  assert.equal(run.activeMinutes, 120);
  assert.equal(run.windows.length, 24);
});

test('each named city is awarded once at its stated access balance', () => {
  const saver = paths[0].profile;
  const run = simulate(saver, 'candidate', 1729, 8, core);
  assert.equal(Object.keys(run.cityUnlockBalances).length, cityUnlocks.length);
  for (const city of cityUnlocks) assert.ok(run.cityUnlockBalances[city.name] >= city.threshold);
  assert.deepEqual(cityUnlocks.map(city => city.name),
    ['Oakland', 'Berkeley', 'Fremont', 'San Mateo', 'Palo Alto', 'Mountain View', 'San Jose']);
});

test('rotating contracts replace delivery checkpoints and show progress separately', () => {
  const saver = paths[0].profile;
  const run = simulate(saver, 'candidate', 1729, 8, { ...core, contracts: true });
  const baseline = simulate(saver, 'candidate', 1729, 8, core);
  assert.ok(run.windows.some(w => w.contractProgress > 0));
  assert.ok(run.windows.some(w => w.repeatableGoals > 0));
  assert.ok(run.ledger.deliveryRepeatable / 650 <= Math.floor(run.deliveries / 2));
  assert.equal(run.ledger.deliveryRepeatable % 650, 0);
  assert.equal(baseline.ledger.deliveryRepeatable % 750, 0);
  assert.equal(baseline.windows.reduce((n, w) => n + w.contractProgress, 0), 0);
});

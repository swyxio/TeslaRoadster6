import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryTier, levelFor, profiles, simulate } from '../scripts/economy-progression.ts';

test('candidate levels use the current wallet and keep property late', () => {
  assert.equal(levelFor(-100), 0);
  assert.equal(levelFor(9999), 0);
  assert.equal(levelFor(10000), 1);
  assert.equal(levelFor(249999), 2);
  assert.equal(levelFor(250000), 3);
  assert.equal(levelFor(1999999), 5);
  assert.equal(levelFor(2000000), 6);
  assert.equal(levelFor(2000000 - 400000), 5);
  assert.equal(levelFor(1250000, 'original'), 4);
});

test('a lower wallet relocks premium work but preserves jobs at the current city difficulty', () => {
  assert.equal(deliveryTier(10000, 4), 3);
  assert.equal(deliveryTier(10000, 0), 1);
  assert.equal(deliveryTier(500000, 4), 4);
  assert.equal(deliveryTier(10000, 4, false), 1);
});

test('seeded player simulations balance their ledger and cannot buy early property', () => {
  const early = simulate(profiles[0], 'candidate', 1729, 8);
  assert.equal(early.plotMinute, null);
  assert.equal(early.homeMinute, null);
  const run = simulate(profiles[1], 'candidate', 1729, 40);
  assert.deepEqual(run, simulate(profiles[1], 'candidate', 1729, 40));
  assert.notEqual(run.marketUnlockMinute, null);
  assert.notEqual(run.plotMinute, null);
  assert.notEqual(run.homeMinute, null);
  assert.ok(run.plotMinute! >= run.marketUnlockMinute!);
  assert.ok(run.homeMinute! >= run.plotMinute!);
  const ledger = run.ledger;
  assert.ok(Math.abs(run.cash - (ledger.fares + ledger.cabs + ledger.matchPay + ledger.activityPay + ledger.checkpoints
    + ledger.achievements + ledger.unlocks - ledger.spending - ledger.fines)) < 0.00001);
  // Every balance-threshold unlock is paid at most once, despite spending and relocking.
  assert.ok(ledger.unlocks <= 62500);
});

test('a single active cab earns only during simulated active time at the assumed utilization', () => {
  const profile = { ...profiles[0], cabsBeforeHome: 1, cabsAfterHome: 1, utilization: 0.65 };
  const run = simulate(profile, 'candidate', 2000, 40, { global: false, room: false });
  assert.notEqual(run.firstCabMinute, null);
  const expected = (run.activeMinutes - run.firstCabMinute!) * 15000 / 60 * 0.65;
  assert.ok(Math.abs(run.ledger.cabs - expected) < 0.00001);
});

test('staged construction spends the same total and cannot mint extra completion rewards', () => {
  const base = { ...profiles[3], name: 'construction comparison' };
  const onePayment = simulate({ ...base, stagedBuild: false }, 'candidate', 1729, 40);
  const stages = simulate({ ...base, stagedBuild: true }, 'candidate', 1729, 40);
  assert.notEqual(onePayment.homeMinute, null);
  assert.equal(stages.homeMinute, onePayment.homeMinute);
  assert.equal(stages.ledger.spending, onePayment.ledger.spending);
  assert.equal(stages.ledger.achievements, onePayment.ledger.achievements);
  assert.equal(stages.cash, onePayment.cash);
});

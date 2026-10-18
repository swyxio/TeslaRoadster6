import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homePlan } from '../public/blog/economy/home-planner.js';

test('starter property includes awards after buying the plot and building the house', () => {
  assert.deepEqual(homePlan(false), { cash: 2000000, level: 6, upgradeCost: 0 });
  assert.deepEqual(homePlan(true), { cash: 1020000, level: 5, upgradeCost: 0 });
});

test('every improvement can be selected independently and lowers the current wallet', () => {
  assert.deepEqual(homePlan(true, ['charger']), { cash: 995000, level: 4, upgradeCost: 25000 });
  assert.deepEqual(homePlan(true, ['furnishing', 'charger', 'garage', 'launch']), { cash: 875000, level: 4, upgradeCost: 145000 });
  assert.deepEqual(homePlan(true, ['garage']), { cash: 970000, level: 4, upgradeCost: 50000 });
});

test('invalid plans cannot bypass the home purchase or count an upgrade twice', () => {
  assert.throws(() => homePlan(false, ['charger']), RangeError);
  assert.throws(() => homePlan(true, ['charger', 'charger']), RangeError);
  assert.throws(() => homePlan(true, ['pool']), RangeError);
});

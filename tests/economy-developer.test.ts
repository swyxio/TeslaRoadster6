import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTower, developerPlot, floorCosts, floorAchievementAwards } from '../scripts/economy-developer.ts';

const base = { homeMinute: 0, homeBalance: 2_000_000, cashPerHourAt100Percent: 100_000,
  cabPerHour: 0, efficiency: 1, horizonMinutes: 2000 };

test('tower floor prices independently round the proposed geometric curve', () => {
  const costs = floorCosts();
  assert.equal(costs.length, 20);
  assert.equal(costs[0], 1_200_000);
  for (let floor = 2; floor <= 20; floor++) {
    assert.equal(costs[floor - 1], Math.round(200_000 * 1.1 ** (floor - 2) / 1000) * 1000);
  }
  const total = (floors: number) => developerPlot + costs.slice(0, floors).reduce((n, cost) => n + cost, 0);
  assert.equal(total(5), 2_928_000);
  assert.equal(total(10), 4_716_000);
  assert.equal(total(20), 12_232_000);
});

test('the market gate applies to the plot, not later floors, and the ledger conserves cash', () => {
  const locked = buildTower({ ...base, homeBalance: 1_999_999, efficiency: 0, horizonMinutes: 10 });
  assert.equal(locked.plotMinute, null);
  assert.equal(locked.floors, 0);
  const first = buildTower({ ...base, efficiency: 0, horizonMinutes: 5 });
  assert.equal(first.floors, 1);
  assert.equal(first.spending, 2_000_000);
  assert.equal(first.cash, 5_000);
  const progression = buildTower(base);
  assert.ok(progression.floors >= 5);
  assert.ok(progression.cash < 2_000_000);
  assert.ok(Math.abs(progression.cash - (base.homeBalance + progression.income + progression.achievementCash - progression.spending)) < .0001);
  assert.equal(progression.achievementCash, [...floorAchievementAwards].filter(([floor]) => floor <= progression.floors).reduce((n, [, amount]) => n + amount, 0));
});

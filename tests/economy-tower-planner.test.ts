import { test } from 'node:test';
import assert from 'node:assert/strict';
import { towerPlan } from '../public/blog/economy/tower-planner.js';
import { developerPlot, floorCosts, floorAchievementAwards } from '../scripts/economy-developer.ts';

test('tower planner agrees with the developer simulation at every story', () => {
  const costs = floorCosts();
  for (let floors = 1; floors <= 20; floors++) {
    const plan = towerPlan(floors);
    const cost = developerPlot + costs.slice(0, floors).reduce((sum, price) => sum + price, 0);
    const awards = [...floorAchievementAwards].filter(([floor]) => floor <= floors).reduce((sum, [, value]) => sum + value, 0);
    assert.deepEqual(plan, { cost, earned: awards, net: cost - awards, next: costs[floors] ?? null });
  }
  assert.throws(() => towerPlan(0), RangeError);
  assert.throws(() => towerPlan(21), RangeError);
});

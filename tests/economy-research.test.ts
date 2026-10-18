import assert from 'node:assert/strict';
import test from 'node:test';
import { airportThresholds, firstHomePackage, questEconomics, researchThresholds } from '../scripts/economy-research.ts';
import { levelFor } from '../scripts/economy-progression.ts';

test('research milestones pay once on cumulative eligible deliveries', () => {
  const line = questEconomics(researchThresholds, 11_000, 6);
  assert.equal(line.jobs, 30);
  assert.equal(line.elapsedMinutes, 180);
  assert.deepEqual(line.awardMinutes, [12, 36, 72, 120, 180]);
  assert.equal(line.awards, 15_500);
  assert.equal(line.gross, 345_500);
  assert.equal(line.grossPerHour, 345_500 / 3);
});

test('airport supplement accounts for the extra minute and is separate from awards', () => {
  const line = questEconomics(airportThresholds, 11_000, 7, 2000);
  assert.equal(line.jobs, 20);
  assert.equal(line.elapsedMinutes, 140);
  assert.equal(line.supplementIncome, 40_000);
  assert.equal(line.gross, 275_500);
  assert.equal(line.grossPerHour, 275_500 * 60 / 140);
  assert.ok(line.recurringPerHour > 110_000);
});

test('property choices spend cash, preserve assets, and can lower the current level', () => {
  const result = firstHomePackage();
  assert.deepEqual(result, { afterHome: 1_020_000, upgradeSpend: 145_000, afterUpgrades: 875_000 });
  assert.equal(levelFor(result.afterHome), 5);
  assert.equal(levelFor(result.afterUpgrades), 4);
});

test('invalid quest schedules are rejected', () => {
  assert.throws(() => questEconomics([1, 2, 2, 4, 5], 1, 1));
  assert.throws(() => questEconomics(researchThresholds, 1, 0));
});

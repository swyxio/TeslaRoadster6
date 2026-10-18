import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDeliveryAward, nextReachableTier, tierGoalLabel } from '../src/next-goal';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { applyAchievementTierEvent, normalizeAchievementTiers, selectAchievementTiers } from '../shared/achievement-tiers';
import { awardDeliveryTarget } from '../src/progress-model';

test('the next delivery award follows earned milestones in numeric order',()=>{
  assert.equal(nextDeliveryAward([]),'deliveries-1');
  assert.equal(nextDeliveryAward(['deliveries-1']),'regular');
  assert.equal(nextDeliveryAward(['regular','deliveries-1']),'deliveries-5');
  const earned=(Object.keys(ACHIEVEMENTS) as AchievementId[]).filter(id=>awardDeliveryTarget(id)!==null);
  assert.equal(nextDeliveryAward(earned),null);
});

test('a reachable saved goal stays stable until its current tier is complete',()=>{
  let progress=normalizeAchievementTiers(undefined,0,[]);
  const first=nextReachableTier(selectAchievementTiers(progress),null)!;
  assert.equal(first.id,'deliveries');
  assert.match(tierGoalLabel(first),/Complete deliveries: 0 \/ 1/);
  progress=applyAchievementTierEvent(progress,['pickups']).progress;
  assert.equal(nextReachableTier(selectAchievementTiers(progress),first)?.id,'deliveries','other progress does not switch the goal');
  progress=applyAchievementTierEvent(progress,['deliveries']).progress;
  const next=nextReachableTier(selectAchievementTiers(progress),first)!;
  assert.equal(next.id,'early-pickups','a completed goal is replaced with a reachable next tier');
});

test('recommendations do not assume rockets, another driver, or a mini-game',()=>{
  const progress=normalizeAchievementTiers(undefined,0,[]);
  for(const id of ['deliveries','pickups','early-pickups','early-deliveries'] as const)progress[id]={count:10_000,claimed:5};
  assert.equal(nextReachableTier(selectAchievementTiers(progress),null),null);
});

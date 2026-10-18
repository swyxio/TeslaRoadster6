import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedGoalOwner, nextDeliveryAward, nextReachableTier, tierGoalLabel } from '../src/next-goal';
import { ACHIEVEMENTS, type AchievementId } from '../shared/achievements';
import { applyAchievementTierEvent, normalizeAchievementTiers, selectAchievementTiers } from '../shared/achievement-tiers';
import { awardDeliveryTarget } from '../src/progress-model';

test('saved goals use the confirmed room identity through chat outages but never across a driver switch',()=>{
  const saved={currentCode:'a',boundCode:'a',chatCode:'a',chatPlayerId:'driver-a',pendingRecovery:false,roomOnline:true,walletReady:true};
  assert.equal(confirmedGoalOwner(saved),'driver-a');
  assert.equal(confirmedGoalOwner({...saved,pendingRecovery:true}),null);
  assert.equal(confirmedGoalOwner({...saved,currentCode:'b'}),null);
  assert.equal(confirmedGoalOwner({...saved,boundCode:'b'}),null);
  assert.equal(confirmedGoalOwner({...saved,chatCode:'b'}),null);
  assert.equal(confirmedGoalOwner({...saved,chatPlayerId:''}),null);
  assert.equal(confirmedGoalOwner({...saved,roomOnline:false}),null);
  assert.equal(confirmedGoalOwner({...saved,walletReady:false}),null);
  assert.equal(confirmedGoalOwner({...saved,currentCode:undefined,boundCode:undefined,chatCode:undefined}),null);
  assert.equal(confirmedGoalOwner({...saved,currentCode:'b',boundCode:'b',chatCode:'b',chatPlayerId:'driver-b'}),'driver-b');
});

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

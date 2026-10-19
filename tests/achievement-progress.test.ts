import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialDelivery, pickupBonusFor, type Order } from '../shared/delivery';
import { applyAchievementAwards, initialAchievements } from '../shared/achievements';
import { normalizeAchievementTiers } from '../shared/achievement-tiers';
import { achievementTierFamilies, applyAcceptedDelivery, applyObservedAchievement, applyTierProgress, coalesceEventRewards, deliveryTierFamilies } from '../worker/achievement-progress';

test('only qualifying observed results advance the corresponding repeatable families',()=>{
  assert.deepEqual(achievementTierFamilies({kind:'crossing',origin:'sf',destination:'sf',crossedWater:true}),[]);
  assert.deepEqual(achievementTierFamilies({kind:'crossing',origin:'sf',destination:'oakland',crossedWater:true}),['bay-crossings']);
  assert.deepEqual(achievementTierFamilies({kind:'parking',mode:'park',finished:false}),[]);
  assert.deepEqual(achievementTierFamilies({kind:'parking',mode:'queue',finished:true}),['queue-successes']);
  assert.deepEqual(achievementTierFamilies({kind:'race',status:'finished',phase:'active',rank:1,starterCount:1}),['races-finished']);
  assert.deepEqual(achievementTierFamilies({kind:'race',status:'finished',phase:'active',rank:1,starterCount:2}),['races-finished','races-won']);
  const touches={roadster:true,retrofit:false,stock:false},goals={roadster:0,retrofit:0,stock:0};
  assert.deepEqual(achievementTierFamilies({kind:'dome',touches,goals,won:true}),['dome-matches']);
  assert.deepEqual(achievementTierFamilies({kind:'dome',touches,goals:{...goals,roadster:1},won:true}),['dome-matches','dome-wins']);
  assert.deepEqual(achievementTierFamilies({kind:'site',site:'stanford'}),[]);
});

test('early delivery rewards are paid once per tier across repeated accepted stops',()=>{
  const delivery=initialDelivery({x:0,z:0});
  let progress=normalizeAchievementTiers(undefined,0,[]);
  const pickup:Order={restaurant:0,customer:0,stage:'pickup',elapsed:1,pickupEstimate:20,estimate:30,base:100};
  const dropoff:Order={...pickup,stage:'dropoff'};
  const before={cash:delivery.cash,income:delivery.lifetimeIncome,earned:delivery.earned};
  for(let i=0;i<4;i++){
    progress=applyTierProgress(delivery,progress,deliveryTierFamilies(pickup,false));
    progress=applyTierProgress(delivery,progress,deliveryTierFamilies(dropoff,false));
  }
  assert.equal(delivery.cash-before.cash,300);
  assert.equal(delivery.lifetimeIncome-before.income,300);
  assert.equal(delivery.earned,before.earned);
  assert.equal(progress.pickups.count,4);
  assert.equal(progress['early-pickups'].count,4);
  assert.equal(progress.deliveries.count,4);
  assert.equal(progress['early-deliveries'].count,4);
  assert.deepEqual(deliveryTierFamilies({...pickup,elapsed:20},false),['pickups']);
  assert.deepEqual(deliveryTierFamilies({...dropoff,elapsed:30},true),['deliveries','rooftop-deliveries']);
});

test('the parking allowance does not extend early-pickup achievement timing',()=>{
  const order:Order={restaurant:0,customer:0,stage:'pickup',elapsed:19.95,pickupEstimate:20,estimate:30,base:600};
  assert.deepEqual(deliveryTierFamilies(order,false),['pickups','early-pickups']);
  order.elapsed=20;
  assert.ok(pickupBonusFor(order)>0,'the stopping bonus is still available at the estimate');
  assert.deepEqual(deliveryTierFamilies(order,false),['pickups']);
  order.elapsed=25;
  assert.ok(pickupBonusFor(order)>0);
  assert.deepEqual(deliveryTierFamilies(order,false),['pickups']);
});

test('one Dome result celebrates both its legacy award and repeatable tier bonus',()=>{
  const delivery=initialDelivery({x:0,z:0}),state=initialAchievements();
  delivery.lastReward={id:3,kind:'delivery',amount:333};
  const progress=normalizeAchievementTiers(undefined,0,[]);
  const result=applyObservedAchievement(delivery,state,progress,{kind:'dome',touches:{roadster:true,retrofit:false,stock:false},goals:{roadster:0,retrofit:0,stock:0},won:false});
  assert.equal(delivery.cash,3_100);
  assert.equal(delivery.lifetimeIncome,600);
  assert.deepEqual(delivery.lastReward,{id:4,kind:'research',amount:600});
  assert.equal(result.progress['dome-matches'].count,1);
  assert.ok(result.awards.includes('rocket-rookie'));
});

test('delivery and supply celebrations include a region award unlocked by the tier bonus',()=>{
  const pickup:Order={restaurant:0,customer:0,stage:'pickup',elapsed:1,pickupEstimate:20,estimate:30,base:100};
  const delivery=initialDelivery({x:0,z:0}),state=initialAchievements();
  delivery.cash=9_800;delivery.lastReward={id:7,kind:'pickup',amount:100};
  applyAcceptedDelivery(delivery,state,normalizeAchievementTiers(undefined,0,[]),pickup,false,undefined,true);
  assert.equal(delivery.cash,10_500);
  assert.ok(state.unlocked.includes('region-oakland'));
  assert.deepEqual(delivery.lastReward,{id:7,kind:'pickup-research',amount:800});

  const supply=initialDelivery({x:0,z:0}),supplyState=initialAchievements();
  supply.cash=9_900;supply.lastReward={id:2,kind:'supply-repair',amount:5};
  const rewardBefore=supply.lastReward,cashBefore=supply.cash;
  applyTierProgress(supply,normalizeAchievementTiers(undefined,0,[]),['supply-pickups'],true);
  applyAchievementAwards(supply,supplyState,[]);
  coalesceEventRewards(supply,rewardBefore,cashBefore,true);
  assert.equal(supply.cash,10_500);
  assert.ok(supplyState.unlocked.includes('region-oakland'));
  assert.deepEqual(supply.lastReward,{id:2,kind:'supply-repair',amount:605});
});

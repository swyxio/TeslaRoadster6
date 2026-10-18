import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialDelivery, type Order } from '../shared/delivery';
import { normalizeAchievementTiers } from '../shared/achievement-tiers';
import { achievementTierFamilies, applyTierProgress, deliveryTierFamilies } from '../worker/achievement-progress';

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

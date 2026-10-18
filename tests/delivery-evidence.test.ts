import assert from 'node:assert/strict';
import test from 'node:test';
import { CUSTOMERS, applyDeliveryStop, captureDeliveryStop, deliveryStopSignature, initialDelivery, payoutFor } from '../shared/delivery';
import { makeEntity } from '../shared/game';
import { terrainHeight } from '../shared/map';
import { applyAchievementAwards, applyDeliveryAwards, initialAchievements, updateAchievements } from '../shared/achievements';
import { evaluateAchievementEvidence } from '../shared/achievement-evidence';
import type { Player } from '../shared/game';

test('a captured stop is evaluated against the current order and keeps event-time fare inputs',()=>{
  const delivery=initialDelivery({x:0,z:0});
  delivery.order={...delivery.order,stage:'dropoff',customer:4,base:3_000,elapsed:45.05};
  const target=CUSTOMERS[4],car=makeEntity('car','model-3',target.x,target.z);
  Object.assign(car,{y:terrainHeight(target.x,target.z),speed:0,vy:0,supportId:'ground'});
  const stop=captureDeliveryStop(car),fare=2*payoutFor(delivery.order);
  // The stop is independent of subsequent movement and must not consume an
  // unrelated order even if that order was the speculative target at the time.
  const other=structuredClone(delivery);other.order.customer=0;
  const before=structuredClone(other);
  Object.assign(car,{x:0,z:0,speed:10,supportId:null});
  assert.equal(applyDeliveryStop(other,stop,part=>2*part.amount),undefined);
  assert.deepEqual(other,before);
  const parts=applyDeliveryStop(delivery,stop,part=>2*part.amount);
  assert.equal(parts?.[0].amount,fare);
  assert.equal(parts?.[0].component.sourceId,'delivery:1:dropoff');
  assert.equal(delivery.completed,1);
  assert.equal(delivery.earned,fare);
});

test('an unavailable payout leaves the order and wallet untouched',()=>{
  const delivery=initialDelivery({x:0,z:0});
  delivery.order={...delivery.order,stage:'dropoff',customer:4,base:3_000,elapsed:45};
  const target=CUSTOMERS[4],car=makeEntity('car','model-3',target.x,target.z);
  Object.assign(car,{y:terrainHeight(target.x,target.z),speed:0,vy:0,supportId:'ground'});
  const before=structuredClone(delivery);
  assert.equal(applyDeliveryStop(delivery,captureDeliveryStop(car),()=>null),null);
  assert.deepEqual(delivery,before);
});

test('a generated rooftop stop remains visible when the speculative target differs',()=>{
  const customer=CUSTOMERS.findIndex(place=>place.rooftop&&place.id.startsWith('roof-oakland'));
  assert.ok(customer>=0);
  const target=CUSTOMERS[customer],car=makeEntity('car','roadster',target.x,target.z);
  Object.assign(car,{y:target.y,speed:0,vy:0,supportId:'roof:0'});
  const stop=captureDeliveryStop(car);
  assert.ok(deliveryStopSignature(stop).split(',').includes(`c${customer}`));
  const restored=initialDelivery(stop);restored.order={...restored.order,stage:'dropoff',customer};
  const speculative=structuredClone(restored);speculative.order.customer=0;
  assert.equal(applyDeliveryStop(speculative,stop,part=>part.amount),undefined);
  assert.ok(applyDeliveryStop(restored,stop,part=>part.amount));
  assert.equal(restored.completed,1);
});

test('committed delivery awards preserve milestone cascades and reward grouping',()=>{
  for(const completed of [1,3,5,10]){
    const delivery=initialDelivery({x:0,z:0});
    Object.assign(delivery,{cash:9_000,completed,lastReward:{id:1,kind:'delivery',amount:500}});
    const state=initialAchievements(),physical=structuredClone(delivery),physicalState=structuredClone(state);
    const car=makeEntity('car','model-3',0,0);
    const player={delivery:physical,achievements:physicalState} as Player;
    updateAchievements(player,car,true,'landmark-sfo',true);
    const awards=applyDeliveryAwards(delivery,state,true,'landmark-sfo',true);
    assert.deepEqual(state.unlocked,physicalState.unlocked);
    assert.deepEqual(awards,state.unlocked);
    assert.equal(delivery.cash,physical.cash);
    assert.equal(delivery.lifetimeIncome,physical.lifetimeIncome);
    assert.deepEqual(delivery.lastReward,physical.lastReward);
    assert.deepEqual(applyDeliveryAwards(delivery,state,true,'landmark-sfo',true),[],'replay never credits an unlocked award twice');
  }
});

test('physical awards evaluate region milestones against the resulting committed balance',()=>{
  const delivery=initialDelivery({x:0,z:0}),state=initialAchievements();delivery.cash=9_500;
  const awards=evaluateAchievementEvidence(state.unlocked,{kind:'roof',roof:'ordinary'});
  assert.deepEqual(applyAchievementAwards(delivery,state,awards),['roof-rider','region-oakland']);
  assert.equal(delivery.cash,11_500);
  assert.equal(delivery.lifetimeIncome,2_000);
  assert.deepEqual(applyAchievementAwards(delivery,state,awards),[]);
  assert.equal(delivery.cash,11_500);
});

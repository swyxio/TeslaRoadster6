import assert from 'node:assert/strict';
import test from 'node:test';
import { CUSTOMERS, applyDeliveryStop, captureDeliveryStop, initialDelivery, payoutFor } from '../shared/delivery';
import { makeEntity } from '../shared/game';
import { terrainHeight } from '../shared/map';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMERS, RESTAURANTS, requiredLevelAt } from '../shared/delivery';
import { createDeliveryScheduler } from '../shared/delivery-scheduler';

test('the existing SFO delivery achievement remains available to road drivers',()=>{
  const sfo=CUSTOMERS.find(customer=>customer.id==='landmark-sfo');
  assert.ok(sfo);
  const choose=createDeliveryScheduler(RESTAURANTS,[sfo],requiredLevelAt);
  // Origin and pickup are in the current city; the old SFO marker keeps its
  // persisted coordinates and must remain a supported ground assignment.
  assert.ok(choose(2,{x:-180,z:120},2,false));
});

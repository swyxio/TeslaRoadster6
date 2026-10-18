// Load the scheduler before delivery to exercise the navigation import cycle.
import { createDeliveryScheduler } from '../shared/delivery-scheduler';
import { CUSTOMERS, RESTAURANTS, requiredLevelAt } from '../shared/delivery';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('scheduler can be imported before delivery',()=>{
  const choose=createDeliveryScheduler(RESTAURANTS,CUSTOMERS,requiredLevelAt);
  assert.ok(choose(1,{x:0,z:-180},1,false));
});

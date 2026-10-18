import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveriesUntilCheckpoint, deliveryCheckpointReward } from '../shared/delivery-checkpoint';

test('delivery checkpoints pay every third completion, with visible progress to the next',()=>{
  assert.deepEqual([0,1,2,3,4,5,6].map(deliveryCheckpointReward),[0,0,0,350,0,0,350]);
  assert.deepEqual([0,1,2,3,4,5,6].map(deliveriesUntilCheckpoint),[3,2,1,3,2,1,3]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropoffPayouts, pickupPayout, resolveDeliveryPayout } from '../shared/delivery-payout';

test('delivery components have stable, distinct driver-scoped source IDs',()=>{
  assert.deepEqual(pickupPayout(3,200),{sourceId:'delivery:3:pickup',kind:'pickup',amount:200});
  assert.deepEqual(dropoffPayouts(3,1_000),[
    {sourceId:'delivery:3:dropoff',kind:'delivery',amount:1_000},
    {sourceId:'delivery:3:checkpoint',kind:'checkpoint',amount:350},
  ]);
  assert.deepEqual(dropoffPayouts(3,1_000),dropoffPayouts(3,1_000),'the same completion regenerates the same sources');
  assert.deepEqual(dropoffPayouts(4,0),[{sourceId:'delivery:4:dropoff',kind:'delivery',amount:0}]);
  assert.throws(()=>pickupPayout(0,10),RangeError);
  assert.throws(()=>dropoffPayouts(3,NaN),RangeError);
});

test('a server resolver changes eligible pay before settlement but never multiplies a checkpoint',()=>{
  const seen:string[]=[];
  const resolve=(part:ReturnType<typeof pickupPayout>)=>{seen.push(part.sourceId);return part.amount*2;};
  assert.equal(resolveDeliveryPayout(pickupPayout(3,200),resolve),400);
  assert.deepEqual(dropoffPayouts(3,1_000).map(part=>resolveDeliveryPayout(part,resolve)),[2_000,350]);
  assert.deepEqual(seen,['delivery:3:pickup','delivery:3:dropoff']);
  assert.throws(()=>resolveDeliveryPayout(pickupPayout(1,10),()=>Infinity),RangeError);
  assert.throws(()=>resolveDeliveryPayout(pickupPayout(1,10),()=>-1),RangeError);
});

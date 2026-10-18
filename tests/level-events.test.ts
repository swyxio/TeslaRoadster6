import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDelivery } from '../shared/delivery';
import { LevelEventTracker } from '../src/level-events';

test('a saved cash level restores quietly and later changes still notify',()=>{
  const delivery=initialDelivery({x:0,z:0}),tracker=new LevelEventTracker();
  assert.equal(tracker.update(delivery,1),null);
  tracker.restore({level:2,eligibleIncome:60_000,afterSnapshot:1});
  assert.equal(tracker.update(delivery,1),null);
  delivery.level=2;delivery.lifetimeIncome=60_000;
  assert.equal(tracker.update(delivery,2),null);
  delivery.level=3;delivery.lifetimeIncome=260_000;delivery.lastReward={id:1,kind:'delivery',amount:200_000};
  assert.equal(tracker.update(delivery,3),'up');
  assert.equal(tracker.update(delivery,3),null);
  delivery.level=2;assert.equal(tracker.update(delivery,4),'down');
  delivery.level=3;delivery.lifetimeIncome=270_000;delivery.lastReward={id:2,kind:'delivery',amount:10_000};
  assert.equal(tracker.update(delivery,5),'up');
});

test('a level earned between hydration and the first snapshot is announced',()=>{
  const delivery=initialDelivery({x:0,z:0}),tracker=new LevelEventTracker();
  tracker.update(delivery,1);
  tracker.restore({level:2,eligibleIncome:200_000,afterSnapshot:1});
  delivery.level=3;delivery.lifetimeIncome=260_000;delivery.lastReward={id:1,kind:'delivery',amount:60_000};
  assert.equal(tracker.update(delivery,2),'up');
});

test('earning within the restored level does not announce its earlier unlock',()=>{
  const delivery=initialDelivery({x:0,z:0}),tracker=new LevelEventTracker();
  tracker.update(delivery,1);
  tracker.restore({level:2,eligibleIncome:60_000,afterSnapshot:1});
  delivery.level=2;delivery.lifetimeIncome=70_000;delivery.lastReward={id:1,kind:'delivery',amount:10_000};
  assert.equal(tracker.update(delivery,2),null);
});

test('saving a guest preserves a level earned before the identity response',()=>{
  const delivery=initialDelivery({x:0,z:0}),tracker=new LevelEventTracker();
  tracker.update(delivery,1);
  tracker.restore({level:1,eligibleIncome:10_000,afterSnapshot:1});
  delivery.level=1;delivery.lifetimeIncome=10_000;delivery.lastReward={id:1,kind:'delivery',amount:10_000};
  assert.equal(tracker.update(delivery,2),'up');
});

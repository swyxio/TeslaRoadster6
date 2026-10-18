import {test} from 'node:test';
import assert from 'node:assert/strict';
import {airCost,tankCapacity,tankUpgradePrice,type TankLevel} from '../shared/air-tank';

test('the starter tank doubles the old capacity and each upgrade doubles again',()=>{
  const levels:TankLevel[]=[1,2,3,4,5];
  assert.deepEqual(levels.map(tankCapacity),[200,400,800,1600,3200]);
  assert.deepEqual(levels.map(level=>airCost(12,level)),[6,3,1.5,.75,.375]);
  assert.deepEqual(levels.slice(0,4).map(tankUpgradePrice),[30,60,120,240]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {airCost,flightLoad,tankCapacity,tankUpgradePrice,type TankLevel} from '../shared/air-tank';

test('the starter tank is shorter and each upgrade doubles usable air',()=>{
  const levels:TankLevel[]=[1,2,3,4,5];
  assert.deepEqual(levels.map(tankCapacity),[50,100,200,400,800]);
  assert.deepEqual(levels.map(level=>airCost(12,level)),[24,12,6,3,1.5]);
  assert.deepEqual(levels.slice(0,4).map(tankUpgradePrice),[1_500,3_000,6_000,12_000]);
});

test('fictional flight load uses the in-game mass and stays bounded',()=>{
  assert.equal(flightLoad(2_000),1);
  assert.equal(flightLoad(10_500),1.2);
  assert.equal(flightLoad(215),1);
});

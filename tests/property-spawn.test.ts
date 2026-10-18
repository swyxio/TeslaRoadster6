import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, makeEntity } from '../shared/game';
import { PROPERTY_HOME_SPAWNS } from '../shared/property';

test('property spawn skips occupied preferred poses and falls back safely',()=>{
  const world=createEmptyWorld();
  const [first,second]=PROPERTY_HOME_SPAWNS;
  const blocker=makeEntity('blocker','roadster',first.x,first.z);blocker.yaw=first.yaw;world.entities.push(blocker);
  const player=addPlayer(world,'driver','Driver',PROPERTY_HOME_SPAWNS);
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  assert.deepEqual({x:car.x,z:car.z,yaw:car.yaw},second);
  const fallbackWorld=createEmptyWorld();
  for(const [i,pose] of PROPERTY_HOME_SPAWNS.entries())fallbackWorld.entities.push(makeEntity(`blocker-${i}`,'roadster',pose.x,pose.z));
  const fallback=addPlayer(fallbackWorld,'other','Other',PROPERTY_HOME_SPAWNS);
  const fallbackCar=fallbackWorld.entities.find(entity=>entity.id===fallback.entityId)!;
  assert.ok(!PROPERTY_HOME_SPAWNS.some(pose=>pose.x===fallbackCar.x&&pose.z===fallbackCar.z));
});

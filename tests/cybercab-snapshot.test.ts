import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, dispatchCybercab, NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { AMBIENT_INTEREST_METERS, prepareSnapshots } from '../worker/snapshot';

test('serialized snapshots retain a distant owned cab only for its owner', () => {
  const world=createEmptyWorld();
  const owner=addPlayer(world,'owner','Owner'),other=addPlayer(world,'other','Other');
  const cab=dispatchCybercab(world,owner.id,'asset-1');assert.ok(cab);
  const ownerCar=world.entities.find(entity=>entity.id===owner.entityId)!;
  const otherCar=world.entities.find(entity=>entity.id===other.entityId)!;
  ownerCar.x=cab.x+AMBIENT_INTEREST_METERS*2;ownerCar.z=cab.z;
  otherCar.x=cab.x-AMBIENT_INTEREST_METERS*2;otherCar.z=cab.z;

  const control=new ScheduledInput(NEUTRAL).snapshot();
  const prepare=prepareSnapshots(world,12,'00000000-0000-0000-0000-000000000000',3);
  const ownerState=JSON.parse(prepare(owner.id,control,1,4));
  const otherState=JSON.parse(prepare(other.id,control,0));
  assert.deepEqual([ownerState.tick,ownerState.substeps,ownerState.poseRevision,ownerState.sync],[12,3,1,4]);
  assert.deepEqual(ownerState.world.entities.find((entity:{id:string})=>entity.id===cab.id),cab);
  assert.ok(!otherState.world.entities.some((entity:{id:string})=>entity.id===cab.id));
});

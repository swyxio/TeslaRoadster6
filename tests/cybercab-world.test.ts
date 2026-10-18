import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, dispatchCybercab, interact, MAX_DISPATCHED_CABS_PER_ROOM, removePlayer, step } from '../shared/game';
import { snapshotFor } from '../worker/snapshot';

test('owned cabs dispatch once, move autonomously and survive fleet selection', () => {
  const world=createWorld(),player=addPlayer(world,'owner','Owner');
  const cab=dispatchCybercab(world,player.id,'asset-1');
  assert.ok(cab);assert.equal(dispatchCybercab(world,player.id,'asset-1'),cab);
  assert.equal(cab.kind,'cybercab');assert.equal(cab.owner,player.id);
  assert.equal(cab.driver,null);assert.ok(cab.npc&&cab.autopilot);
  const initial={x:cab.x,z:cab.z};
  for(let i=0;i<400;i++)step(world,new Map(),.05);
  assert.ok(Math.hypot(cab.x-initial.x,cab.z-initial.z)>1);
  assert.ok(chooseVehicle(world,player.id,'model-3'));
  assert.ok(world.entities.includes(cab));
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  car.x=cab.x+3000;car.z=cab.z;
  assert.ok(snapshotFor(world,player.id).entities.includes(cab),'owner can locate it across the map');
});

test('another driver can take and release a cab without changing its owner', () => {
  const world=createWorld(),owner=addPlayer(world,'owner','Owner'),borrower=addPlayer(world,'borrower','Borrower');
  const cab=dispatchCybercab(world,owner.id,'asset-2')!;
  interact(world,borrower.id);
  const person=world.entities.find(entity=>entity.id===borrower.entityId)!;
  Object.assign(person,{x:cab.x+2,z:cab.z,y:cab.y,supportId:cab.supportId,speed:0});
  interact(world,borrower.id);
  assert.equal(cab.driver,borrower.id);assert.equal(cab.owner,owner.id);assert.equal(cab.autopilot,false);
  interact(world,borrower.id);
  assert.equal(cab.driver,null);assert.equal(cab.owner,owner.id);assert.ok(cab.autopilot);
});

test('disconnect removes unattended owned cabs; a borrowed cab remains until released', () => {
  const world=createWorld(),owner=addPlayer(world,'owner','Owner'),borrower=addPlayer(world,'borrower','Borrower');
  const unattended=dispatchCybercab(world,owner.id,'asset-3')!,borrowed=dispatchCybercab(world,owner.id,'asset-4')!;
  const old=world.entities.find(entity=>entity.id===borrower.entityId)!;
  world.entities=world.entities.filter(entity=>entity!==old);
  borrowed.driver=borrower.id;borrowed.autopilot=false;borrower.entityId=borrowed.id;
  removePlayer(world,owner.id);
  assert.ok(!world.entities.includes(unattended));assert.ok(world.entities.includes(borrowed));
  removePlayer(world,borrower.id);assert.ok(!world.entities.includes(borrowed));
});

test('a borrowed cab is removed when its owner has left and the borrower changes cars', () => {
  const world=createWorld(),owner=addPlayer(world,'owner','Owner'),borrower=addPlayer(world,'borrower','Borrower');
  const cab=dispatchCybercab(world,owner.id,'asset-6')!;
  world.entities=world.entities.filter(entity=>entity.id!==borrower.entityId);
  cab.driver=borrower.id;cab.autopilot=false;borrower.entityId=cab.id;
  removePlayer(world,owner.id);
  assert.ok(chooseVehicle(world,borrower.id,'model-3'));
  assert.ok(!world.entities.includes(cab));
});

test('reconnect rebinds a borrowed cab in the same room without duplicating it', () => {
  const world=createWorld(),owner=addPlayer(world,'old','Owner'),borrower=addPlayer(world,'borrower','Borrower');
  const cab=dispatchCybercab(world,owner.id,'asset-5')!;
  const old=world.entities.find(entity=>entity.id===borrower.entityId)!;
  world.entities=world.entities.filter(entity=>entity!==old);cab.driver=borrower.id;cab.autopilot=false;borrower.entityId=cab.id;
  assert.equal(dispatchCybercab(world,borrower.id,'asset-5'),null,'a connected owner cannot be replaced');
  removePlayer(world,owner.id);addPlayer(world,'new','Owner');
  assert.equal(dispatchCybercab(world,'new','asset-5'),cab);assert.equal(cab.owner,'new');
  assert.equal(world.entities.filter(entity=>entity.cab?.assetId==='asset-5').length,1);
});

test('the room bounds dispatch and rejects missing owners or invalid IDs', () => {
  const world=createWorld();addPlayer(world,'owner','Owner');
  assert.equal(dispatchCybercab(world,'missing','asset'),null);
  assert.equal(dispatchCybercab(world,'owner','bad/id'),null);
  for(let i=0;i<MAX_DISPATCHED_CABS_PER_ROOM;i++)assert.ok(dispatchCybercab(world,'owner',`asset-${i}`),`cab ${i}`);
  assert.equal(dispatchCybercab(world,'owner','one-too-many'),null);
  assert.equal(world.entities.filter(entity=>entity.cab).length,MAX_DISPATCHED_CABS_PER_ROOM);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, setDestination } from '../shared/game';
import { parseMessage } from '../worker/protocol';

test('the room validates the requested self-drive mode',()=>{
  const fence={actionSeq:1,edgeBaseline:{jump:0,flip:0}};
  for(const mode of ['road','jump','sky']){
    const message={type:'destination',x:-180,z:60,mode,requestId:1,...fence};
    assert.deepEqual(parseMessage(JSON.stringify(message)),message);
  }
  for(const mode of ['fly',null,42])assert.equal(parseMessage(JSON.stringify({type:'deliveryDestination',mode,requestId:1,...fence})),null);
});

test('flight modes require purchased upgrades and rockets; failed requests leave the current route intact',()=>{
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];car.kind='model-3';
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'road'),true);
  const previous=car.navigation;
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'sky'),false);
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'jump'),false);
  assert.equal(car.navigation,previous);
  car.upgrades.rocket=true;
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'jump'),false,'rockets alone do not unlock Ludicrous Leap');
  car.upgrades.autonomyJump=true;
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'jump'),true);
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'sky'),false,'Maximum Plaid is a separate upgrade');
  car.upgrades.autonomySky=true;
  assert.equal(setDestination(world,'driver',{x:-180,z:60},'sky'),true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, interact, makeEntity } from '../shared/game';
import { captureAmbientNpcCars } from '../worker/vehicle-takeover';

test('only an actually entered ambient NPC is a theft, using its pre-entry state',()=>{
  const world=createWorld(),player=addPlayer(world,'p','P');
  interact(world,player.id);
  const person=world.entities.find(e=>e.id===player.entityId)!;
  const npc={...makeEntity('ambient','waymo-ipace',person.x+3,person.z),npc:true,autopilot:true};
  world.entities=[person,npc];
  const candidates=captureAmbientNpcCars(world.entities);
  interact(world,player.id);
  assert.equal(player.entityId,npc.id);
  assert.equal(npc.driver,player.id);
  assert.equal(npc.autopilot,false);
  assert.equal(candidates.get(player.entityId),'waymo-ipace');
});

test('entering a seeded parked fleet car records its model',()=>{
  const world=createWorld(),player=addPlayer(world,'p','P');
  const parked=world.entities.find(e=>e.id==='parked-0')!;
  interact(world,player.id);
  const person=world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(parked,{x:person.x+3,z:person.z,y:person.y,supportId:person.supportId,inDome:person.inDome});
  world.entities=[person,parked];
  const candidates=captureAmbientNpcCars(world.entities);
  interact(world,player.id);
  assert.equal(player.entityId,parked.id);
  assert.equal(candidates.get(player.entityId),parked.kind);
});

test('stationary NPCs count, while personal, occupied, police, luxury and cab cars do not',()=>{
  const npc={...makeEntity('ambient','model-3',0,0),npc:true,autopilot:true};
  const parked=createWorld().entities.find(entity=>entity.id==='parked-0')!;
  const entities=[npc,
    parked, {...npc,id:'idle',autopilot:false},
    {...npc,id:'car-other',npc:false,autopilot:false},
    {...npc,id:'occupied',driver:'someone'}, {...npc,id:'owned',owner:'someone'},
    {...npc,id:'cab',cab:{assetId:'cab'}}, {...npc,id:'retired',retiredCab:true as const},
    {...npc,id:'vault',kind:'bugatti-chiron' as const},
    {...makeEntity('person','person',0,0),npc:true,autopilot:true}];
  assert.deepEqual([...captureAmbientNpcCars(entities)], [['ambient','model-3'],['parked-0',parked.kind],['idle','model-3']]);
  const police=createWorld().entities.find(entity=>entity.police)!;
  assert.ok(police);
  assert.equal(captureAmbientNpcCars([{...npc,police:police.police}]).size,0);
});

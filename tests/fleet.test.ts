import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_BOUNDS } from '../shared/map';
import { VEHICLES,VEHICLE_IDS } from '../shared/vehicles';
import { addPlayer,chooseVehicle,createWorld,interact,makeEntity,NEUTRAL,step,toggleAutopilot } from '../shared/game';
import { body,contact } from '../shared/physics';
import { parseMessage } from '../worker/protocol';

test('every sourced family has parked, autonomous and selectable playable instances',()=>{
  const world=createWorld();addPlayer(world,'p','P');
  for(const id of VEHICLE_IDS){
    assert.ok(world.entities.some(e=>e.kind===id&&e.npc&&e.autopilot));
    assert.ok(world.entities.some(e=>e.kind===id&&!e.npc&&!e.driver));
    assert.ok(chooseVehicle(world,'p',id));
    assert.equal(world.entities.find(e=>e.driver==='p')!.kind,id);
    assert.ok(VEHICLES[id].sourceUrls.length&&VEHICLES[id].estimates.length);
  }
  assert.equal(world.entities.filter(e=>e.owner==='p').length,1,'swapping never leaks personal cars');
});
test('traffic advances, player can take an NPC, and manual input overrides AV',()=>{
  const world=createWorld();addPlayer(world,'p','P');
  const positions=new Map(world.entities.filter(e=>e.npc).map(e=>[e.id,{x:e.x,z:e.z}]));
  for(let i=0;i<100;i++)step(world,new Map(),.05);
  const moving=world.entities.filter(e=>e.npc&&Math.hypot(e.x-positions.get(e.id)!.x,e.z-positions.get(e.id)!.z)>2);
  assert.ok(moving.length>=VEHICLE_IDS.length*.8,`${moving.length} of ${VEHICLE_IDS.length} NPCs moved`);
  interact(world,'p');const player=world.players[0],person=world.entities.find(e=>e.id===player.entityId)!;
  const npc=world.entities.find(e=>e.npc)!;person.x=npc.x+3;person.z=npc.z;person.speed=0;
  interact(world,'p');assert.equal(player.entityId,npc.id);assert.equal(npc.driver,'p');assert.equal(npc.autopilot,false);
  assert.ok(toggleAutopilot(world,'p'));step(world,new Map([['p',{...NEUTRAL,steer:.5}]]),.05);assert.equal(npc.autopilot,false);
});
test('long bodies collide at their nose and heavier bodies gain less collision speed',()=>{
  const truck=makeEntity('truck','tesla-semi',0,0),tiny=makeEntity('tiny','waymo-firefly',0,-4);
  assert.ok(contact(body(truck),body(tiny)),'long nose collision cannot use tiny center radius');
  function impact(target:'tesla-semi'|'waymo-firefly'){
    const world=createWorld();world.entities=[];world.pickups=[];
    const a=makeEntity('a','roadster',0,5),b=makeEntity('b',target,0,0);a.speed=12;
    a.z=(VEHICLES.roadster.length+VEHICLES[target].length)/2+.1;world.entities=[a,b];step(world,new Map(),.05);return Math.abs(b.speed);
  }
  assert.ok(impact('waymo-firefly')>impact('tesla-semi')*3);
});
test('fleet commands reject forged kinds, airborne swaps and occupied player cars',()=>{
  assert.equal(parseMessage('{"type":"selectVehicle","kind":"__proto__"}'),null);
  assert.equal(parseMessage('{"type":"selectVehicle","kind":"spaceship"}'),null);
  assert.ok(parseMessage('{"type":"autopilot"}'));
  const world=createWorld();addPlayer(world,'a','A');addPlayer(world,'b','B');
  const car=world.entities.find(e=>e.driver==='a')!;car.y=10;car.supportId=null;assert.equal(chooseVehicle(world,'a','zoox'),false);car.y=0;car.supportId='ground';
  interact(world,'a');const person=world.entities.find(e=>e.driver==='a')!,other=world.entities.find(e=>e.driver==='b')!;
  person.x=other.x;person.z=other.z;interact(world,'a');assert.equal(other.driver,'b');
});
test('two minutes of traffic remain finite and ambient population stays bounded',()=>{
  const world=createWorld(),count=world.entities.length;
  for(let i=0;i<2400;i++)step(world,new Map(),.05);
  assert.ok(world.entities.length<=count+38);
  assert.ok(world.entities.every(e=>[e.x,e.z,e.yaw,e.speed,e.health].every(Number.isFinite)));
  assert.ok(world.entities.every(e=>e.x>MAP_BOUNDS.minX&&e.x<MAP_BOUNDS.maxX&&e.z>MAP_BOUNDS.minZ&&e.z<MAP_BOUNDS.maxZ));
});

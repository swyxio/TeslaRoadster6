import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_BOUNDS } from '../shared/map';
import { VEHICLES,VEHICLE_IDS } from '../shared/vehicles';
import { addPlayer,chooseVehicle,createWorld,interact,makeEntity,NEUTRAL,step,toggleAutopilot } from '../shared/game';
import { body,contact } from '../shared/physics';
import { parseMessage } from '../worker/protocol';

test('small seeded cohorts cover the whole catalog; only Teslas are selectable',()=>{
  const parked=new Set(),moving=new Set();
  for(let seed=0;seed<VEHICLE_IDS.length;seed++){
    const world=createWorld(seed);
    assert.equal(world.entities.filter(e=>e.id.startsWith('parked-')).length,8);
    assert.equal(world.entities.filter(e=>e.id.startsWith('traffic-')).length,8);
    for(const e of world.entities){if(e.id.startsWith('parked-'))parked.add(e.kind);if(e.id.startsWith('traffic-'))moving.add(e.kind);}
  }
  assert.deepEqual([...parked].sort(),[...VEHICLE_IDS].sort());
  assert.deepEqual([...moving].sort(),[...VEHICLE_IDS].sort());
  const world=createWorld();addPlayer(world,'p','P');
  for(const id of VEHICLE_IDS){
    assert.equal(chooseVehicle(world,'p',id),VEHICLES[id].brand==='Tesla');
    if(VEHICLES[id].brand==='Tesla')assert.equal(world.entities.find(e=>e.driver==='p')!.kind,id);
    assert.ok(VEHICLES[id].sourceUrls.length&&VEHICLES[id].estimates.length);
  }
  assert.equal(world.entities.filter(e=>e.owner==='p').length,1,'swapping never leaks personal cars');
});
test('every parked family can be taken from the street',()=>{
  for(const id of VEHICLE_IDS){
    const seed=(VEHICLE_IDS.indexOf(id)+VEHICLE_IDS.length-13)%VEHICLE_IDS.length;
    const world=createWorld(seed),player=addPlayer(world,'p','P');player.delivery.level=3;interact(world,'p');
    const person=world.entities.find(e=>e.id===player.entityId)!,car=world.entities.find(e=>e.kind===id&&!e.npc&&!e.driver)!;
    world.entities=[person,car];Object.assign(person,{x:car.x+2,z:car.z,y:car.y,supportId:car.supportId});
    interact(world,'p');assert.equal(player.entityId,car.id,id);assert.equal(car.driver,'p');
  }
});
test('traffic advances, player can take an NPC, and manual input overrides AV',()=>{
  const world=createWorld();addPlayer(world,'p','P');
  const positions=new Map(world.entities.filter(e=>e.npc).map(e=>[e.id,{x:e.x,z:e.z}]));
  for(let i=0;i<100;i++)step(world,new Map(),.05);
  const moving=world.entities.filter(e=>e.npc&&Math.hypot(e.x-positions.get(e.id)!.x,e.z-positions.get(e.id)!.z)>2);
  assert.ok(moving.length>=positions.size*.8,`${moving.length} of ${positions.size} NPCs moved`);
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
  const fence={actionSeq:1,edgeBaseline:{jump:0,flip:0}};
  assert.equal(parseMessage(JSON.stringify({type:'selectVehicle',kind:'__proto__',...fence})),null);
  assert.equal(parseMessage(JSON.stringify({type:'selectVehicle',kind:'spaceship',...fence})),null);
  assert.ok(parseMessage(JSON.stringify({type:'autopilot',...fence})));
  const world=createWorld();addPlayer(world,'a','A');addPlayer(world,'b','B');
  assert.equal(chooseVehicle(world,'a','zoox'),false,'non-Tesla vehicles must be taken from the street');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, chooseVehicle, createWorld, makeEntity, resetPlayer, step, travelDome, type World } from '../shared/game';
import { DOME } from '../shared/dome';
import { isSurface } from '../shared/map';

function setup(){
  const world=createWorld();world.entities=[];world.players=[];world.pickups=[];
  const player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  return {world,player,car};
}
function blockSpawns(world:World){
  let id=0;
  const block=(x:number,z:number)=>{
    const e=makeEntity(`blocker-${id++}`,'roadster',x,z);
    e.supportId='ground';world.entities.push(e);
  };
  block(40,60);
  for(let i=0;i<192;i++)block([60,0,-60,-120,-180,-240][Math.floor(i/32)]+(i%2?3.5:-3.5),120-Math.floor(i/2)%16*14);
  for(let x=-220;x<=220;x+=20)for(const z of [210,-210])block(x,z);
}

test('blocked selection, reset and Dome return keep the current car until space opens',()=>{
  const {world,player,car}=setup();Object.assign(car,{x:-340,z:60,y:0,supportId:'ground',speed:0});
  blockSpawns(world);const before=structuredClone(car);
  assert.equal(chooseVehicle(world,'p','model-3'),false);
  assert.equal(player.entityId,car.id);assert.deepEqual(car,before);
  resetPlayer(world,'p');assert.deepEqual(car,before);
  Object.assign(car,{x:DOME.x-30,z:DOME.z,y:0,inDome:true,domeReturn:'sf',supportId:'dome'});
  const inDome=structuredClone(car);
  assert.equal(travelDome(world,'p'),false);assert.deepEqual(car,inDome);
  Object.assign(car,{x:-340,z:60,inDome:false,supportId:'ground'});
  world.entities=world.entities.filter(e=>!e.id.startsWith('blocker-'));
  assert.equal(chooseVehicle(world,'p','model-3'),true);
  const replacement=world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(replacement,{x:-340,z:60});resetPlayer(world,'p');
  assert.notEqual(replacement.x,-340);
});

test('blocked water recovery holds the prior position and retries after space opens',()=>{
  const {world,car}=setup();
  Object.assign(car,{x:130,z:-20,y:.01,vy:-2,vx:0,vz:0,supportId:null});
  assert.equal(isSurface(car.x,car.z),false);blockSpawns(world);
  const before={x:car.x,y:car.y,z:car.z};
  step(world,new Map(),.05);
  assert.deepEqual({x:car.x,y:car.y,z:car.z},before);
  assert.equal(car.vy,0);assert.ok(world.time>0,'room continues advancing');
  world.entities=world.entities.filter(e=>!e.id.startsWith('blocker-'));
  for(let i=0;i<5&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,'ground');assert.equal(isSurface(car.x,car.z),true);
});

test('unexpected spawn-check errors still propagate',()=>{
  const {world,car}=setup(),bad=makeEntity('bad','roadster',40,60);
  Object.defineProperty(bad,'kind',{get(){throw new Error('unexpected spawn error');}});
  world.entities.push(bad);
  assert.throws(()=>chooseVehicle(world,'p','model-3'),/unexpected spawn error/);
  assert.throws(()=>resetPlayer(world,'p'),/unexpected spawn error/);
  Object.assign(car,{inDome:true,domeReturn:'sf',supportId:'dome'});
  assert.throws(()=>travelDome(world,'p'),/unexpected spawn error/);
});

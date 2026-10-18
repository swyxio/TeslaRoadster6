import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity, NEUTRAL, step, type Entity, type World } from '../shared/game';
import { initialSoccer } from '../shared/soccer';
import { currentAt, JET_STREAMS, THERMALS } from '../shared/sky-currents';
import { BUILDINGS, terrainHeight } from '../shared/map';

const worldFor=(car:Entity):World=>({entities:[car],players:[],pickups:[],time:0,soccer:initialSoccer()});
const tick=(world:World,n=1,input=NEUTRAL)=>{for(let i=0;i<n;i++)step(world,new Map([['p',input]]),.05);};

test('jet lanes push in their marked direction and refill an empty tank, including a non-rocket car',()=>{
 const lane=JET_STREAMS[0],car=makeEntity('car','zoox',lane.start.x+80,lane.start.z,'p');
 Object.assign(car,{y:lane.height,supportId:null,air:0});const world=worldFor(car);
 tick(world,20);
 assert.ok(car.vx>10);assert.ok(car.air>13);assert.ok(car.y>=lane.height-lane.halfHeight);
 assert.equal(car.upgrades.rocket,false);
 car.air=99.9;tick(world);assert.equal(car.air,100);
});

test('thermals start above the road, lift a jumping car and replenish air to the skyline',()=>{
 for(const thermal of THERMALS){
  const landmark=BUILDINGS.find(b=>b.style===(thermal.id==='pyramid'?'pyramid':thermal.id==='coit'?'coit':'salesforce'))!;
  assert.ok(Math.hypot(thermal.x-landmark.x,thermal.z-landmark.z)<45);
  assert.notEqual(terrainHeight(thermal.x,thermal.z),null);
  const car=makeEntity('car','roadster',thermal.x,thermal.z,'p'),world=worldFor(car);
  assert.equal(currentAt(car),undefined,'grounded vehicles cannot refill');
  tick(world,1,{...NEUTRAL,jump:1});
  const afterJump=car.air;tick(world,160,{...NEUTRAL,jump:1});
  assert.ok(car.y>70,`${thermal.name} lifts a regular jump`);
  assert.ok(car.air>afterJump,`${thermal.name} refills the tank`);
 }
});

test('membership respects height, width, support, dome, and people',()=>{
 const lane=JET_STREAMS[0],car=makeEntity('car','roadster',0,lane.start.z,'p');
 Object.assign(car,{y:lane.height,supportId:null});assert.equal(currentAt(car)?.id,lane.id);
 car.y=lane.height+lane.halfHeight+.01;assert.equal(currentAt(car),undefined);
 car.y=lane.height;car.z+=lane.halfWidth+.01;assert.equal(currentAt(car),undefined);
 car.z=lane.start.z;car.supportId='ground';assert.equal(currentAt(car),undefined);
 car.supportId=null;car.inDome=true;assert.equal(currentAt(car),undefined);
 car.inDome=false;car.kind='person';assert.equal(currentAt(car),undefined);
});

test('current physics is deterministic and never slows an already faster car',()=>{
 const lane=JET_STREAMS[0],a=makeEntity('a','roadster',-200,lane.start.z,'p'),b=makeEntity('a','roadster',-200,lane.start.z,'p');
 for(const car of [a,b])Object.assign(car,{y:lane.height,supportId:null,vx:75,air:20});
 const first=worldFor(a),second=worldFor(b);tick(first,10);tick(second,10);
 assert.equal(a.vx,75);assert.deepEqual(a,b);
});

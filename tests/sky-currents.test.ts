import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type Entity, type World } from '../shared/game';
import { initialSoccer } from '../shared/soccer';
import { createFerry } from '../shared/ferry';
import { createParking } from '../shared/parking';
import { createRace } from '../shared/race';
import { CALTRAIN_CURRENTS, currentAt, currentBlockedByProgression, FLIGHT_CEILING, JET_STREAMS, THERMALS } from '../shared/sky-currents';
import { CALTRAIN_STOPS } from '../shared/caltrain';
import { ACCESS_BOUNDARIES, requiredLevelAt } from '../shared/delivery';
import { BUILDINGS, terrainHeight } from '../shared/map';

const worldFor=(car:Entity):World=>({entities:[car],players:[],pickups:[],time:0,soccer:initialSoccer(),ferry:createFerry(),parking:createParking(),races:createRace()});
const tick=(world:World,n=1,input=NEUTRAL)=>{for(let i=0;i<n;i++)step(world,new Map([['p',input]]),.05);};

test('jet lanes push in their marked direction and refill an empty tank, including a non-rocket car',()=>{
 const lane=JET_STREAMS[0],car=makeEntity('car','zoox',lane.start.x+80,lane.start.z,'p');
 Object.assign(car,{y:lane.height,supportId:null,air:0});const world=worldFor(car);
 tick(world,20);
 assert.ok(car.vx>7);assert.ok(car.air>6.5);assert.ok(car.y>=lane.height-lane.halfHeight);
 assert.equal(car.upgrades.rocket,false);
 car.air=99.9;tick(world);assert.equal(car.air,100);
});

test('wind refills the same air units across tank upgrades without overflowing',()=>{
 const lane=JET_STREAMS[0];
 for(const [level,expected] of [[1,7],[5,.4375]] as const){
  const car=makeEntity('car','roadster',-200,lane.start.z,'p');
  Object.assign(car,{y:lane.height,supportId:null,air:20,tankLevel:level});
  tick(worldFor(car),20);
  assert.ok(Math.abs(car.air-20-expected)<1e-6,`level ${level} refill is scaled to tank capacity`);
 }
});

test('the remaining thermal starts above the road, lifts a jumping car and replenishes air',()=>{
 assert.equal(THERMALS.length,1);
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

function controlledCar(){
 const world=createWorld(),player=addPlayer(world,'p','Pilot'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];return {world,player,car};
}

test('the raised Skyline is harder to enter accidentally but reachable from the thermal',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!,thermal=THERMALS[0];
 assert.ok(skyline.height-skyline.halfHeight>=140);assert.ok(skyline.height+skyline.halfHeight<FLIGHT_CEILING);
 const {world,car}=controlledCar();
 Object.assign(car,{x:-100,z:skyline.start.z,y:88,supportId:null});
 assert.notEqual(currentAt(car)?.id,'skyline','the former height no longer enters the lane');
 Object.assign(car,{x:thermal.x,z:thermal.z,y:0,yaw:0,air:100,supportId:'ground'});
 tick(world,220,{...NEUTRAL,jump:1});
 let jump=1;
 for(let i=0;i<220&&car.y<145;i++){
  if(i%20===0)jump++;
  tick(world,1,{...NEUTRAL,jump});
 }
 assert.ok(car.y>=145,`the Roadster climbed to ${car.y} m`);
 for(let i=0;i<100&&currentAt(car)?.id!=='skyline';i++){
  if(i%20===0)jump++;
  tick(world,1,{...NEUTRAL,jump,throttle:1});
 }
 assert.equal(currentAt(car)?.id,'skyline');assert.ok(car.air>0);
});

test('ordinary forward and reverse flight can overcome a sky lane without boost',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!;
 for(const [yaw,throttle] of [[Math.PI/2,1],[-Math.PI/2,-1]] as const){
  const {world,car}=controlledCar();
  Object.assign(car,{x:-100,z:skyline.start.z,y:skyline.height,yaw,supportId:null,air:100});
  tick(world,40,{...NEUTRAL,throttle});
  assert.ok(car.x< -110,`${throttle>0?'forward':'reverse'} leaves the wind behind`);
  assert.ok(car.vx<0,'thrust overcomes the current');
 }
});

test('the Skyline progression gate preserves vertical and sideways escape, even with an empty tank',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!;
 for(const kind of ['roadster','model-3'] as const){
  const {world,player,car}=controlledCar();
  Object.assign(car,{kind,x:ACCESS_BOUNDARIES.oaklandX-.2,z:skyline.start.z,y:skyline.height,
   yaw:-Math.PI/2,vx:30,vy:0,vz:-6,air:0,supportId:null});
  tick(world);
  assert.ok(car.x<=ACCESS_BOUNDARIES.oaklandX);assert.equal(player.delivery.lastBlocked?.level,1);
  assert.ok(car.z<skyline.start.z,'checkpoint preserves lateral movement');
  assert.ok(car.y<skyline.height,'checkpoint preserves gravity');
  tick(world,20);
  assert.ok(car.y<skyline.height-4,'wind no longer holds a car against the gate');
  assert.ok(requiredLevelAt(car.x,car.z)<=player.delivery.level);
 }
});

test('a Rocket with an initially empty tank can turn and fly away from the Skyline gate',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!;
 for(const [yaw,throttle] of [[Math.PI/2,1],[-Math.PI/2,-1]] as const){
  const {world,car}=controlledCar();
  Object.assign(car,{x:ACCESS_BOUNDARIES.oaklandX-.2,z:skyline.start.z,y:skyline.height,
   yaw,vx:30,vy:0,vz:0,air:0,supportId:null});
  tick(world,60,{...NEUTRAL,throttle});
  assert.ok(car.x<ACCESS_BOUNDARIES.oaklandX-20,`${throttle>0?'forward':'reverse'} escapes the gate`);
 }
 const {world,car}=controlledCar();
 Object.assign(car,{x:ACCESS_BOUNDARIES.oaklandX-.2,z:skyline.start.z,y:skyline.height,
  yaw:-Math.PI/2,vx:30,vy:0,vz:0,air:0,supportId:null});
 tick(world,35,{...NEUTRAL,steer:1});
 assert.ok(car.yaw>0,'steering turns the car even while blocked');
 tick(world,60,{...NEUTRAL,throttle:1});
 assert.ok(car.x<ACCESS_BOUNDARIES.oaklandX-20,'the new heading can fly away');
});

test('a player already displaced into a locked region can return against the lane',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!,{world,player,car}=controlledCar();
 Object.assign(car,{x:ACCESS_BOUNDARIES.oaklandX+10,z:skyline.start.z,y:skyline.height,
  yaw:Math.PI/2,vx:0,vy:0,vz:0,air:0,supportId:null});
 assert.equal(requiredLevelAt(car.x,car.z),1);
 tick(world,40,{...NEUTRAL,throttle:1});
 assert.ok(car.x<ACCESS_BOUNDARIES.oaklandX,'the player can return to the unlocked side');
 assert.ok(requiredLevelAt(car.x,car.z)<=player.delivery.level);
});

test('an unlocked player can still ride the Skyline across the bridge gate',()=>{
 const skyline=JET_STREAMS.find(lane=>lane.id==='skyline')!,{world,player,car}=controlledCar();
 player.delivery.level=1;
 Object.assign(car,{x:ACCESS_BOUNDARIES.oaklandX-1,z:skyline.start.z,y:skyline.height,
  vx:0,vy:0,vz:0,air:100,supportId:null});
 tick(world,20);
 assert.ok(car.x>ACCESS_BOUNDARIES.oaklandX);assert.ok(car.vx>0);
 assert.ok(Math.abs(car.y-skyline.height)<.01,'the lane keeps holding altitude');
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

test('each Caltrain stop has two distinct, narrow, elevated and clearly named local currents',()=>{
 assert.equal(CALTRAIN_CURRENTS.length,CALTRAIN_STOPS.length*2);
 for(const stop of CALTRAIN_STOPS){
  const south=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-${stop.id}-south`)!;
  const north=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-${stop.id}-north`)!;
  for(const lane of [south,north]){
   const x=(lane.start.x+lane.end.x)/2,z=(lane.start.z+lane.end.z)/2;
   assert.ok(Math.abs(Math.hypot(x-stop.x,z-stop.z)-18)<1e-6,'the current stays beside its stop');
   assert.ok(lane.name.includes(stop.name));assert.ok(lane.height-lane.halfHeight>=40);
   assert.ok(lane.height+lane.halfHeight<FLIGHT_CEILING);assert.equal(lane.halfWidth,7);
   // The short lanes are above supported ground, not a shortcut across open
   // water, and their volume clears collision buildings taller than the lane.
   for(let i=0;i<=18;i++){
    const t=i/18,px=lane.start.x+(lane.end.x-lane.start.x)*t,pz=lane.start.z+(lane.end.z-lane.start.z)*t;
    assert.notEqual(terrainHeight(px,pz),null,`${lane.id} stays over ground`);
    assert.ok(BUILDINGS.every(b=>b.h<lane.height-lane.halfHeight-2||
     Math.abs(px-b.x)>b.w/2+lane.halfWidth+3||Math.abs(pz-b.z)>b.d/2+lane.halfWidth+3),`${lane.id} clears tall buildings`);
   }
   const car=makeEntity('car','roadster',x,z,'p');Object.assign(car,{y:lane.height,supportId:null});
   assert.equal(currentAt(car)?.id,lane.id,'a flying car enters the marked volume');
   car.y=lane.height-lane.halfHeight-.1;assert.notEqual(currentAt(car)?.id,lane.id);
   car.y=lane.height;car.supportId='ground';assert.equal(currentAt(car),undefined,'driving through a stop does not trigger wind');
  }
  const sx=south.end.x-south.start.x,sz=south.end.z-south.start.z;
  const nx=north.end.x-north.start.x,nz=north.end.z-north.start.z;
  assert.ok(sx*nx+sz*nz<0,'the two directions oppose each other');
 }
});

test('a Caltrain current gives directional speed and refills a flying car',()=>{
 const stop=CALTRAIN_STOPS.find(s=>s.name==='Redwood City')!;
 const lane=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-${stop.id}-south`)!;
 const {world,player,car}=controlledCar();player.delivery.level=2;
 Object.assign(car,{x:(lane.start.x+lane.end.x)/2,z:(lane.start.z+lane.end.z)/2,y:lane.height,air:0,supportId:null});
 tick(world,20);
 const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z;
 assert.ok((car.vx*dx+car.vz*dz)/Math.hypot(dx,dz)>7,'wind adds speed in its marked direction');
 assert.ok(car.air>6.5,'wind refills the empty tank');
});

test('a Rocket can reach a Caltrain lane from the station without another current',()=>{
 const lane=CALTRAIN_CURRENTS.find(l=>l.id==='caltrain-redwood-city-south')!;
 const {world,player,car}=controlledCar();player.delivery.level=2;
 Object.assign(car,{x:(lane.start.x+lane.end.x)/2,z:(lane.start.z+lane.end.z)/2,y:0,
  vx:0,vy:0,vz:0,air:100,supportId:'ground'});
 for(let i=0;i<220&&currentAt(car)?.id!==lane.id;i++)tick(world,1,{...NEUTRAL,jump:1+Math.floor(i/20)});
 assert.equal(currentAt(car)?.id,lane.id);assert.ok(car.air>0);
});

test('unboosted flight can leave a Caltrain current against its flow',()=>{
 const stop=CALTRAIN_STOPS.find(s=>s.name==='Redwood City')!;
 const lane=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-${stop.id}-south`)!;
 const dx=(lane.end.x-lane.start.x)/180,dz=(lane.end.z-lane.start.z)/180;
 for(const [yaw,throttle] of [[Math.atan2(dx,dz),1],[Math.atan2(dx,dz)+Math.PI,-1]] as const){
  const {world,player,car}=controlledCar();player.delivery.level=2;
  Object.assign(car,{x:lane.start.x+dx*12,z:lane.start.z+dz*12,y:lane.height,yaw,air:0,supportId:null});
  tick(world,60,{...NEUTRAL,throttle});
  assert.ok((car.x-lane.start.x)*dx+(car.z-lane.start.z)*dz<0,'the car exits upstream without a boost');
 }
});

test('a locked Caltrain stop refills but cannot hold or push a player in the locked region',()=>{
 const stop=CALTRAIN_STOPS.find(s=>s.level===3)!;
 const lane=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-${stop.id}-south`)!;
 const {world,player,car}=controlledCar();player.delivery.level=2;
 Object.assign(car,{x:(lane.start.x+lane.end.x)/2,z:(lane.start.z+lane.end.z)/2,y:lane.height,
  vx:0,vy:0,vz:0,air:0,supportId:null});
 assert.ok(currentBlockedByProgression(lane,car,player.delivery.level));
 tick(world,15);
 assert.ok(car.air>0,'an empty tank still refills');
 assert.ok(car.y<lane.height-1,'gravity lets the player drop out');
 assert.equal(car.vx,0);assert.equal(car.vz,0);
});

test('both 4th & King currents let an empty-tank player escape the locked Peninsula boundary',()=>{
 for(const direction of ['south','north'] as const){
  const lane=CALTRAIN_CURRENTS.find(l=>l.id===`caltrain-san-francisco-${direction}`)!;
  const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,length=Math.hypot(dx,dz);
  const z=ACCESS_BOUNDARIES.bayMaxZ+(direction==='south'?-.2:.2);
  const x=lane.start.x+dx*(z-lane.start.z)/dz;
  const {world,player,car}=controlledCar();
  const northX=(direction==='south'?-1:1)*dx/length,northZ=(direction==='south'?-1:1)*dz/length;
  Object.assign(car,{x,z,y:lane.height,yaw:Math.atan2(-northX,-northZ),
   vx:0,vy:0,vz:0,air:0,supportId:null});
  assert.equal(currentAt(car)?.id,lane.id);assert.ok(currentBlockedByProgression(lane,car,player.delivery.level));
  tick(world);
  assert.equal(car.vz,0,'the gate stops wind pressure');assert.ok(car.y<lane.height,'gravity permits descent');
  assert.ok(car.air>0,'the empty tank refills at the gate');
  tick(world,40,{...NEUTRAL,throttle:1});
  assert.ok(car.z<ACCESS_BOUNDARIES.bayMaxZ-10,`${direction} lane permits flight back to San Francisco`);
 }
});

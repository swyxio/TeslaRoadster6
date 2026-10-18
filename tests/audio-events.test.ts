import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity } from '../shared/game';
import { BUILDINGS } from '../shared/map';
import { SoundEventTracker } from '../src/audio-events';

function setup(){
  const world=createWorld(),player=addPlayer(world,'listener','Listener'),car=world.entities.find(e=>e.id===player.entityId)!;
  const tracker=new SoundEventTracker();
  const observe=(dt=.05,refilling=false)=>{world.time+=dt;return tracker.update(world,player.id,refilling);};
  tracker.update(world,player.id,false);
  return {world,player,car,tracker,observe};
}
const names=(events:ReturnType<SoundEventTracker['update']>)=>events.map(event=>event.cue);

test('audio cues follow authoritative pickup, delivery, ticket and achievement changes once',()=>{
  const {player,observe}=setup();
  player.delivery.order.stage='dropoff';assert.deepEqual(names(observe()),['pickup']);
  assert.deepEqual(names(observe()),[]);
  player.delivery.completed++;player.delivery.order.stage='pickup';assert.deepEqual(names(observe()),['delivery']);
  player.delivery.tickets++;player.achievements.unlocked.push('roof-rider');assert.deepEqual(names(observe()),['ticket','achievement']);
  assert.deepEqual(names(observe()),[]);
});

test('jump, supported landing and damage trigger distinct cues; ordinary movement is quiet',()=>{
  const {car,observe}=setup();
  car.jumpBurstUntil=1;car.y=2;car.vy=8;car.supportId=null;assert.deepEqual(names(observe()),['jump']);
  car.y=5;car.vy=-8;assert.deepEqual(names(observe()),[]);
  car.y=0;car.vy=0;car.supportId='ground';assert.deepEqual(names(observe()),['land']);
  car.health=98;assert.deepEqual(names(observe(.4)),['crash']);
  car.speed=8;assert.deepEqual(names(observe()),[]);
});

test('nearby impacts still sound at the health floor without treating normal braking as a crash',()=>{
  const {world,car,observe}=setup();
  const building=BUILDINGS[0];car.x=building.x+building.w/2+2;car.z=building.z;car.health=5;car.speed=25;
  observe(.4);car.speed=4;assert.deepEqual(names(observe()),['crash']);
  observe(.4);car.speed=20;observe();car.speed=18;assert.deepEqual(names(observe()),[]);
  world.entities=world.entities.filter(e=>e.id===car.id);
});

test('nearby collected items, refills and police pursuit have cues without repeating',()=>{
  const {world,player,car,observe}=setup();
  const pickup=world.pickups[0];pickup.x=car.x;pickup.z=car.z;observe();pickup.active=false;
  assert.deepEqual(names(observe()),['repair']);
  car.air=95;assert.deepEqual(names(observe(.05,true)),['refill']);assert.deepEqual(names(observe(.05,true)),[]);
  const cop=world.entities.find(e=>e.police)!;cop.police!.targetId=player.id;
  assert.deepEqual(names(observe()),['pursuit']);assert.deepEqual(names(observe()),[]);
});

test('reset, teleport, vehicle changes, and initial snapshots do not replay old cues',()=>{
  const {world,player,car,tracker,observe}=setup();
  car.x+=300;car.health=20;assert.deepEqual(names(observe()),[]);
  const other=makeEntity('another','roadster',car.x,car.z,player.id);world.entities.push(other);player.entityId=other.id;
  assert.deepEqual(names(observe()),[]);
  tracker.reset();player.delivery.tickets=4;assert.deepEqual(names(observe()),[]);
  world.time=0;player.delivery.completed=8;assert.deepEqual(names(tracker.update(world,player.id,false)),[]);
});


test('a nearly full tank that reaches full between observations confirms refill once',()=>{
  const {car,observe}=setup();
  car.air=99;observe();
  car.air=100;assert.deepEqual(names(observe(.05,true)),['refill']);
  assert.deepEqual(names(observe(.05,true)),[]);
});


test('elevated roads and rooftops use authoritative support for landing sounds',()=>{
  const {car,observe}=setup();
  car.y=15;car.vy=-6;car.supportId=null;observe();
  car.y=8;car.vy=0;car.supportId='overpass';assert.deepEqual(names(observe()),['land']);
  car.y=9;car.supportId='ground';assert.deepEqual(names(observe()),[]);
  car.y=25;car.vy=-4;car.supportId=null;observe();
  car.y=20;car.vy=0;car.supportId='roof:0';assert.deepEqual(names(observe()),['land']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { TickPrediction } from '../src/tick-prediction';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','P');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,car,control:new ScheduledInput(NEUTRAL).snapshot()};
}

test('tick prediction is presentation only and rebases a new input without a position kick',()=>{
  const {world,control}=setup(),original=structuredClone(world),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  const before=prediction.renderWorld(0,3,0)!.entities[0];
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}});
  const onset=prediction.renderWorld(1000/120,3,1/6)!.entities[0];
  assert.ok(Math.hypot(onset.x-before.x,onset.y-before.y,onset.z-before.z)<.05,'new controls cannot advance several simulation frames at once');
  const later=prediction.renderWorld(50,3,1)!.entities[0];
  assert.ok(later.y>before.y||later.speed>before.speed,'input becomes visible as the correction decays');
  assert.deepEqual(world,original,'prediction does not mutate the authoritative world');
});

test('confirmed relocations or entity changes cut the camera',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);prediction.renderWorld(0,3,0);
  const airborne=structuredClone(world);airborne.entities[0].supportId=null;airborne.entities[0].y=3;
  prediction.snapshot(airborne,'p',2,{...control,revision:1},0,1,100);
  assert.equal(prediction.takeCameraSnap(),false,'support and control revisions are not teleports');
  const moved=structuredClone(airborne);moved.entities[0].x+=3;
  prediction.snapshot(moved,'p',4,{...control,revision:2},1,1,200);
  assert.equal(prediction.takeCameraSnap(),true,'even a short confirmed relocation cuts the camera');
  assert.equal(prediction.takeSnap(),true);
  assert.equal(prediction.takeCameraSnap(),false,'the cut is consumed once');
  const replacement=structuredClone(moved);replacement.entities[0].id='replacement';replacement.players[0].entityId='replacement';
  prediction.snapshot(replacement,'p',6,{...control,revision:3},1,1,300);
  assert.equal(prediction.takeCameraSnap(),true,'a changed controlled body cuts the camera');
});

test('a stale connection freezes the displayed car until a fresh snapshot',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1}});
  const shown=prediction.renderWorld(50,3,.5)!.entities[0];
  const frozen=prediction.renderWorld(600,null,2)!.entities[0];
  assert.deepEqual(frozen,shown);
  const fresh=structuredClone(world);fresh.entities[0].x+=1;
  prediction.snapshot(fresh,'p',10,control,0,1,650);
  assert.ok(prediction.renderWorld(650,13,10));
});

for(const renderDuringStall of [true,false])test(`recovery rebases from a held pose ${renderDuringStall?'with':'without'} a frame during the outage`,()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-130,z:60,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,1,0);
  const before=prediction.renderWorld(0,101,100,0)!.entities[0];
  if(renderDuringStall)prediction.renderWorld(600,null,null);
  const fresh=structuredClone(world);Object.assign(fresh.entities[0],{x:-120,speed:10,vx:10});
  prediction.snapshot(fresh,'p',112,control,0,1,650);
  const resumed=prediction.renderWorld(650,113,112,0)!.entities[0];
  assert.ok(Math.abs(resumed.x-before.x)<.001,'the frozen car does not jump forward on recovery');
  assert.equal(prediction.takeSnap(),false);
});

test('an unavoidable large recovery cut also recenters the chase camera',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:-130,z:60,y:0,yaw:-Math.PI/2,speed:50,vx:50,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',100,control,0,1,0);prediction.renderWorld(0,101,100,0);
  prediction.renderWorld(600,null,null);
  const fresh=structuredClone(world);fresh.entities[0].x=-90;
  prediction.snapshot(fresh,'p',112,control,0,1,650);prediction.renderWorld(650,113,112,0);
  assert.equal(prediction.takeSnap(),true);
  assert.equal(prediction.takeCameraSnap(),true);
});

test('a predicted water recovery does not interpolate across the map',()=>{
  const {world,car,control}=setup(),prediction=new TickPrediction();
  Object.assign(car,{x:600,y:.01,z:-2250,vy:-5,supportId:null});
  prediction.snapshot(world,'p',100,control,0,1,0);
  const preview=prediction.renderWorld(25,101,100.5);
  assert.equal(preview,null,'the relocation is withheld until the server confirms it');
  assert.equal(prediction.takeCameraSnap(),false);
  const recovered=structuredClone(world);Object.assign(recovered.entities[0],{x:-36,y:0,z:-1120,vy:0,supportId:'ground'});
  prediction.snapshot(recovered,'p',102,{...control,revision:1},1,1,100);
  assert.equal(prediction.takeCameraSnap(),true);
});

test('rejects a forecast tick outside JavaScript safe integers',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',Number.MAX_SAFE_INTEGER-1,control,0,1,0);
  assert.equal(prediction.renderWorld(0,Number.MAX_SAFE_INTEGER+1,Number.MAX_SAFE_INTEGER),null);
});

test('a rejected late level can retain an explicitly rescheduled jump',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:1,controlRevision:0,actionSeq:0,input:{...NEUTRAL,throttle:1,jump:1}});
  prediction.edgeOutcome('jump',1,'rescheduled',2);
  prediction.reject(1);
  const car=prediction.renderWorld(25,3,.5)!.entities[0];
  assert.ok(car.y>world.entities[0].y,'the accepted one-shot is still replayed');
  assert.ok(Math.abs(car.speed)<.001,'the rejected throttle is not replayed');
  prediction.edgeOutcome('jump',1,'expired',2);
  const stopped=prediction.renderWorld(30,3,.6)!.entities[0];
  assert.ok(stopped.y<=car.y+.1,'an expired edge is not newly replayed');
});


test('an accepted edge survives a stale-revision rejection across an action snapshot',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:1,input:{...NEUTRAL,throttle:1,jump:1}});
  prediction.edgeOutcome('jump',1,'accepted',3);
  prediction.reject(1);
  prediction.snapshot(world,'p',0,{...control,revision:1,actionSeq:1,edgeFloorRevision:0},0,1,10);
  const preview=prediction.renderWorld(20,4,0,1)!.entities[0];
  assert.ok(preview.y>world.entities[0].y,'accepted jump is replayed');
  assert.ok(Math.abs(preview.speed)<.001,'rejected throttle remains rejected');
});

test('a relocation floor discards a previously accepted stale edge',()=>{
  const {world,control}=setup(),prediction=new TickPrediction();
  prediction.snapshot(world,'p',0,control,0,1,0);
  prediction.input({seq:1,targetTick:3,controlRevision:0,actionSeq:0,input:{...NEUTRAL,jump:1}});
  prediction.edgeOutcome('jump',1,'accepted',3);prediction.reject(1);
  prediction.snapshot(world,'p',0,{...control,revision:1,edgeFloorRevision:1},1,1,10);
  const preview=prediction.renderWorld(20,4,0,1)!.entities[0];
  assert.equal(preview.y,world.entities[0].y);
});

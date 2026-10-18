import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { BUILDINGS, isSurface } from '../shared/map';
import { ISLAND_JUMPS, sweepIslandJumpWall } from '../shared/island-jumps';
import { dimensions } from '../shared/physics';
import { LocalPrediction } from '../src/local-prediction';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,player,car};
}
const drive={...NEUTRAL,throttle:1,steer:.4};

test('prediction is visual only and rebases repeated and skipped server inputs',()=>{
  const {world,car}=setup(),prediction=new LocalPrediction(),before=structuredClone(world);
  prediction.snapshot(world,'p',0,1000);prediction.input(1,drive,1001);
  const preview=prediction.renderWorld(1001)!;
  assert.ok(preview.entities[0].speed>0);assert.deepEqual(world,before,'authoritative state must not change');
  // The server may hold one input over more than one tick.
  const repeated=structuredClone(world);
  step(repeated,new Map([['p',drive]]),.05);step(repeated,new Map([['p',drive]]),.05);
  prediction.snapshot(repeated,'p',1,1100);
  assert.deepEqual(prediction.renderWorld(1100)?.entities[0],repeated.entities[0],'an acknowledged input is not replayed, but its safe correction can blend');
  prediction.input(2,drive,1101);prediction.input(3,{...drive,steer:-1},1102);
  assert.ok(prediction.renderWorld(1102));
  // Both messages may arrive between ticks: only the latest is used.
  const skipped=structuredClone(repeated);step(skipped,new Map([['p',{...drive,steer:-1}]]),.05);
  prediction.snapshot(skipped,'p',3,1200);
  assert.deepEqual(prediction.renderWorld(1200)?.entities[0],skipped.entities[0],'ACK of latest discards skipped earlier intents');
  assert.equal(car.speed,0);
});

test('action barriers and vehicle changes discard pending visual movement',()=>{
  const {world,player,car}=setup(),prediction=new LocalPrediction();
  prediction.snapshot(world,'p',0,0);prediction.input(1,drive,1);assert.ok(prediction.renderWorld(1));
  prediction.suspend();prediction.input(2,drive,2);
  prediction.snapshot(world,'p',0,3);assert.equal(prediction.renderWorld(3),null);
  assert.equal(prediction.takeSnap(),true,'a blocked preview returns to authority');
  prediction.snapshot(world,'p',0,4,true);assert.ok(prediction.renderWorld(4));
  assert.equal(prediction.takeSnap(),true,'the post-action pose snaps even if prediction resumes before a frame');
  assert.equal(prediction.takeSnap(),false,'the snap is consumed after the barrier');
  const next=structuredClone(world),replacement={...structuredClone(car),id:'replacement'};
  next.entities=[replacement];next.players[0].entityId=replacement.id;
  prediction.snapshot(next,'p',0,5);assert.equal(prediction.renderWorld(5),null);
  prediction.input(3,drive,6);assert.equal(prediction.renderWorld(6)?.entities[0].id,'replacement');
  assert.equal(player.entityId,car.id);
});

test('prediction stops for stale snapshots, input backlog, nearby traffic and unsupported movement',()=>{
  const {world,car}=setup(),prediction=new LocalPrediction();
  prediction.snapshot(world,'p',0,0);prediction.input(1,drive,1);assert.ok(prediction.renderWorld(1));
  assert.equal(prediction.renderWorld(251),null);
  prediction.snapshot(world,'p',1,1000);
  assert.equal(prediction.renderWorld(1000),null,'a late ACK cannot revive an expired preview');
  prediction.input(2,drive,1001);assert.ok(prediction.renderWorld(1001));
  for(let seq=3;seq<=5;seq++)prediction.input(seq,drive,1000+seq);
  assert.equal(prediction.renderWorld(1005),null,'unacknowledged work is bounded');
  const blocked=structuredClone(world),other=makeEntity('other','model-3',car.x+5,car.z);blocked.entities.push(other);
  prediction.snapshot(blocked,'p',5,1006);prediction.input(6,drive,1007);assert.equal(prediction.renderWorld(1007),null);
  prediction.snapshot(world,'p',6,1008);prediction.input(7,{...drive,jump:1},1009);assert.equal(prediction.renderWorld(1009),null);
  const ferry=structuredClone(world);ferry.entities[0].supportId='ferry';
  prediction.snapshot(ferry,'p',7,1010);prediction.input(8,drive,1011);assert.equal(prediction.renderWorld(1011),null);
});

test('acknowledgements still snap when a new obstacle or discontinuity makes blending unsafe',()=>{
  const {world,car}=setup(),prediction=new LocalPrediction();
  prediction.snapshot(world,'p',0,0);prediction.input(1,drive,1);
  const blocked=structuredClone(world);
  blocked.entities.push(makeEntity('nearby','model-3',car.x+5,car.z));
  prediction.snapshot(blocked,'p',1,2);
  assert.equal(prediction.renderWorld(2),null,'new nearby traffic cancels the visual preview');
  prediction.snapshot(world,'p',1,3);prediction.input(2,drive,4);
  const moved=structuredClone(world);moved.entities[0].x+=20;
  prediction.snapshot(moved,'p',2,5);
  assert.equal(prediction.renderWorld(5),null,'discontinuities do not blend through geometry');
  prediction.reset();const near=structuredClone(world),building=BUILDINGS[0];
  const radius=Math.hypot(2.2,4.5)/2;
  Object.assign(near.entities[0],{x:building.x+building.w/2+radius,z:building.z});
  prediction.snapshot(near,'p',0,6);prediction.input(1,drive,7);
  assert.ok(prediction.renderWorld(7),'the approach begins with an active preview');
  const afterWall=structuredClone(near);afterWall.entities[0].x-=.1;
  prediction.snapshot(afterWall,'p',1,8);
  assert.equal(prediction.renderWorld(8),null,'a low-speed wall correction is never blended through the building');
});

test('acknowledgement corrections snap at an island ramp wall',()=>{
  const {world,car}=setup(),prediction=new LocalPrediction(),ramp=ISLAND_JUMPS[1];
  const near=ramp.z-ramp.width/2;
  Object.assign(car,{x:ramp.end+4,z:near+1,y:0,yaw:0,speed:0,vx:0,vz:0,supportId:'ground'});
  prediction.snapshot(world,'p',0,0);prediction.input(1,NEUTRAL,1);
  const preview=prediction.renderWorld(1)?.entities[0];
  assert.ok(preview,'the approach begins with an active preview');
  const after=structuredClone(world);
  Object.assign(after.entities[0],{x:ramp.end-1,z:near-3.5});
  const size=dimensions(car.kind);
  assert.ok(sweepIslandJumpWall(preview,after.entities[0],{
    halfWidth:size.width/2,halfLength:size.length/2,yaw:preview.yaw,minY:0,maxY:size.height,
  }),'the correction crosses a shared ramp wall');
  prediction.snapshot(after,'p',1,40);
  assert.equal(prediction.renderWorld(40),null,'the wall correction returns directly to authority');
  prediction.input(2,NEUTRAL,41);
  assert.ok(prediction.renderWorld(41),'a new input can resume prediction before the next frame');
  assert.equal(prediction.takeSnap(),true,'the resumed preview still snaps across the wall');
  const pending=new LocalPrediction();
  pending.snapshot(world,'p',0,0);pending.input(1,NEUTRAL,1);
  assert.ok(pending.renderWorld(1),'the unacknowledged approach also has an active preview');
  pending.snapshot(after,'p',0,40);
  assert.equal(pending.takeSnap(),true,'a replayed pending input cannot hide the wall correction');
});

test('short prediction uses shared shore support and never modifies server state',()=>{
  const {world,car}=setup(),prediction=new LocalPrediction();
  Object.assign(car,{x:80,z:0,yaw:-Math.PI/2,speed:55,vx:55,vz:0});
  const before=structuredClone(world);prediction.snapshot(world,'p',0,0);
  for(let seq=1;seq<=3;seq++)prediction.input(seq,{...NEUTRAL,throttle:1},seq);
  const preview=prediction.renderWorld(3);
  if(preview){const e=preview.entities[0];assert.ok(isSurface(e.x,e.z),'preview must not cross unsupported shore');}
  assert.deepEqual(world,before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { isSurface } from '../shared/map';
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
  assert.equal(prediction.renderWorld(1100),null,'an already applied input is not replayed');
  prediction.input(2,drive,1101);prediction.input(3,{...drive,steer:-1},1102);
  assert.ok(prediction.renderWorld(1102));
  // Both messages may arrive between ticks: only the latest is used.
  const skipped=structuredClone(repeated);step(skipped,new Map([['p',{...drive,steer:-1}]]),.05);
  prediction.snapshot(skipped,'p',3,1200);
  assert.equal(prediction.renderWorld(1200),null,'ACK of latest discards skipped earlier intents');
  assert.equal(car.speed,0);
});

test('action barriers and vehicle changes discard pending visual movement',()=>{
  const {world,player,car}=setup(),prediction=new LocalPrediction();
  prediction.snapshot(world,'p',0,0);prediction.input(1,drive,1);assert.ok(prediction.renderWorld(1));
  prediction.suspend();prediction.input(2,drive,2);
  prediction.snapshot(world,'p',0,3);assert.equal(prediction.renderWorld(3),null);
  prediction.snapshot(world,'p',0,4,true);assert.ok(prediction.renderWorld(4));
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
  for(let seq=2;seq<=4;seq++)prediction.input(seq,drive,seq);
  assert.equal(prediction.renderWorld(4),null,'unacknowledged work is bounded');
  const blocked=structuredClone(world),other=makeEntity('other','model-3',car.x+5,car.z);blocked.entities.push(other);
  prediction.snapshot(blocked,'p',4,5);prediction.input(5,drive,6);assert.equal(prediction.renderWorld(6),null);
  prediction.snapshot(world,'p',5,7);prediction.input(6,{...drive,jump:1},8);assert.equal(prediction.renderWorld(8),null);
  const ferry=structuredClone(world);ferry.entities[0].supportId='ferry';
  prediction.snapshot(ferry,'p',6,9);prediction.input(7,drive,10);assert.equal(prediction.renderWorld(10),null);
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

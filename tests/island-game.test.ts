import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,chooseVehicle,createWorld,makeEntity,NEUTRAL,raceAction,step} from '../shared/game';
import {hasRocket} from '../shared/rocket';
import {newPolice} from '../shared/police';
import {snapshotFor} from '../worker/snapshot';
import { ISLAND_BANK, ISLAND_CLIFF, bankSurface, cliffPose } from '../shared/island-stunts';

function setup(){
  const world=createWorld();world.entities=[];world.players=[];
  const player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
  return {world,player,car};
}
test('two passengers retain their distinct physical positions and replicate in transit',()=>{
  const {world,car}=setup(),second=addPlayer(world,'two','Two'),other=world.entities.find(e=>e.id===second.entityId)!;
  Object.assign(car,{x:-3.5,z:world.ferry.z,y:0,supportId:'ferry'});
  Object.assign(other,{x:3.5,z:world.ferry.z,y:0,supportId:'ferry'});
  world.ferry.remaining=0;
  for(let i=0;i<100;i++)step(world,new Map(),.05);
  assert.equal(world.ferry.phase,'to-island');assert.equal(world.ferry.passengers.length,2);
  assert.ok(Math.abs(car.x-other.x-(-7))<1e-6);assert.equal(car.z,other.z);
  assert.ok(snapshotFor(world,'p').entities.includes(other));assert.ok(snapshotFor(world,'two').entities.includes(car));
});

test('a driven non-Rocket car collects a pad and can jump until the upgrade expires',()=>{
  const {world,car}=setup();car.kind='model-3';Object.assign(car,{x:0,z:-1160,y:0,supportId:'ground',air:3});
  step(world,new Map(),.05);assert.ok(hasRocket(car,world.time));assert.equal(car.air,100);
  step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);assert.equal(car.supportId,null);assert.ok(car.y>0);assert.ok(car.air<100);
  world.time=car.rocketUntil;step(world,new Map([['p',{...NEUTRAL,jump:2}]]),.05);
  assert.equal(hasRocket(car,world.time),false);
});

test('island boundary clears pursuit and prevents detection at any height',()=>{
  const {world,player,car}=setup();Object.assign(car,{x:0,z:-1140,y:35,vy:0,supportId:null});
  const cop=makeEntity('cop','model-3',0,-1145);cop.police={...newPolice(),targetId:player.id};world.entities.push(cop);
  step(world,new Map(),.05);assert.equal(cop.police.targetId,null);assert.equal(player.delivery.tickets,0);
  for(let i=0;i<5;i++)step(world,new Map(),.05);
  assert.equal(cop.police.targetId,null);assert.equal(player.delivery.tickets,0);
});

test('water recovery makes a racer DNF before relocation can award a checkpoint',()=>{
  const {world,car}=setup();Object.assign(car,{x:0,z:-1330,y:0,supportId:'ground'});
  assert.equal(raceAction(world,'p','join','short'),true);assert.equal(raceAction(world,'p','start','short'),true);
  for(let i=0;i<61;i++)step(world,new Map(),.05);
  const entrant=world.races.rounds[0].entrants[0];assert.equal(world.races.rounds[0].phase,'active');
  entrant.nextGate=2;Object.assign(car,{x:600,z:-2250,y:.01,vy:-5,supportId:null});
  entrant.previous={x:car.x,y:car.y,z:car.z,time:world.time};step(world,new Map(),.05);
  assert.equal(entrant.status,'dnf');assert.equal(entrant.nextGate,2);
});

test('world physics follows the bank, launches along its normal, and lands on its surface',()=>{
  const {world,car}=setup();
  Object.assign(car,{x:ISLAND_BANK.startX-1,z:ISLAND_BANK.z+10,y:0,yaw:-Math.PI/2,speed:18,supportId:'ground'});
  for(let i=0;i<40;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
  assert.equal(car.supportId,'island-bank');assert.ok(car.y>.1);
  assert.ok(Math.abs(car.y-bankSurface(car.x,car.z)!.height)<1e-6);
  const oldVz=car.vz;step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
  assert.equal(car.supportId,null);assert.ok(car.vy>5);assert.ok(car.vz<oldVz);
  Object.assign(car,{x:80,z:ISLAND_BANK.z+10,y:8,vy:-10,vx:0,vz:0,speed:0,supportId:null,loopAngle:null});
  for(let i=0;i<40&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,'island-bank');assert.ok(Math.abs(car.y-bankSurface(car.x,car.z)!.height)<1e-6);
});

test('world physics drives the cliff and detaches ordinary and expired Rocket cars',()=>{
  for(const kind of ['model-3','roadster'] as const){
    const {world,car}=setup();Object.assign(car,{kind,x:ISLAND_CLIFF.x-1,z:ISLAND_CLIFF.z,y:0,yaw:-Math.PI/2,speed:40,supportId:'ground'});
    let highest=0,attached=false,detached=false;
    for(let i=0;i<150;i++){
      step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
      if(car.supportId==='island-cliff'){attached=true;highest=Math.max(highest,car.loopAngle??0);}
      else if(attached){detached=true;break;}
    }
    assert.ok(attached&&detached,kind);
    assert.ok(kind==='roadster'?highest>Math.PI:highest<Math.PI/2,`${kind}: ${highest}`);
    assert.ok(Math.hypot(car.vx,car.vy)>1);
  }
  const {world,car}=setup(),pose=cliffPose(Math.PI);
  Object.assign(car,{kind:'model-3',x:pose.point.x,y:pose.point.y,z:ISLAND_CLIFF.z,supportId:'island-cliff',loopAngle:Math.PI,
    vx:-15,vy:0,vz:0,speed:15,rocketUntil:world.time});
  step(world,new Map(),.01);assert.equal(car.supportId,null);assert.ok(car.vx< -14);assert.ok(car.y>35);
});

test('vehicle selection cannot bypass the stopped-on-ground requirement on the cliff',()=>{
  const {world,car}=setup(),pose=cliffPose(Math.PI);
  Object.assign(car,{x:pose.point.x,y:pose.point.y,z:ISLAND_CLIFF.z,speed:0,supportId:'island-cliff',loopAngle:Math.PI});
  assert.equal(chooseVehicle(world,'p','model-3'),false);
  assert.equal(world.players[0].entityId,car.id);
});

test('collision on the overhang uses tangent velocity and releases cars from the ribbon',()=>{
  const {world,car}=setup(),pose=cliffPose(Math.PI);
  Object.assign(car,{x:pose.point.x,y:pose.point.y,z:ISLAND_CLIFF.z,speed:20,vx:-20,vy:0,vz:0,
    yaw:-Math.PI/2,supportId:'island-cliff',loopAngle:Math.PI});
  const other=makeEntity('other','roadster',pose.point.x-4,ISLAND_CLIFF.z);
  Object.assign(other,{y:pose.point.y,supportId:null,vx:0,vy:0,vz:0,yaw:-Math.PI/2});world.entities.push(other);
  step(world,new Map(),.01);
  assert.equal(car.supportId,null);assert.equal(car.loopAngle,null);
  assert.ok(other.vx< -1);assert.ok(car.health<100&&other.health<100);
});

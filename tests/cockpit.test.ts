import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { addPlayer, createWorld, NEUTRAL, step } from '../shared/game';
import { orderTarget } from '../shared/delivery';
import { terrainHeight } from '../shared/map';
import { chaseLens, cockpitPose } from '../src/camera';
import { parseMessage } from '../worker/protocol';

test('chase lens eases toward thrust and recovers independently of frame rate',()=>{
  const run=(hz:number,thrusting:boolean,from:number)=>{
    let fov=from;for(let i=0;i<hz;i++)fov=chaseLens(fov,thrusting,1/hz);return fov;
  };
  const fast=run(120,true,55),slow=run(30,true,55);
  assert.ok(fast>55&&fast<60);assert.ok(Math.abs(fast-slow)<1e-9);
  assert.ok(run(60,false,fast)<fast,'release returns toward the standard lens');
  assert.equal(chaseLens(55,true,0),55);
  assert.ok(chaseLens(55,true,10)<57,'a long stall cannot cause a sudden full lens kick');
});

test('cockpit follows car position, pitch and roll instead of keeping the horizon upright',()=>{
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(Math.PI/4,.7,Math.PI));
  const origin=new T.Vector3(40,12,-30),size={width:2,height:1.5,length:4,shape:'sedan' as const};
  const pose=cockpitPose(origin,rotation,size);
  assert.ok(pose.position.distanceTo(new T.Vector3(-.38,1.17,-.28).applyQuaternion(rotation).add(origin))<1e-9);
  assert.ok(new T.Vector3(0,1,0).applyQuaternion(pose.quaternion).y<0,'the cockpit rolls upside down');
  assert.ok(new T.Vector3(0,0,-1).applyQuaternion(pose.quaternion).y>0,'the camera pitches with the car');
});

test('motorcycle cockpit is centered at the rider helmet',()=>{
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(.1,.5,.2));
  const origin=new T.Vector3(3,4,5),size={width:.75,height:1.12,length:2.085,shape:'motorcycle' as const};
  const pose=cockpitPose(origin,rotation,size);
  assert.ok(pose.position.distanceTo(new T.Vector3(0,1.30,-.26).applyQuaternion(rotation).add(origin))<1e-9);
});

test('full active pickup and delivery must be in cockpit for a first-person run',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];
  const tick=(cockpit:boolean)=>step(world,new Map([['p',{...NEUTRAL,steer:1,cockpit}]]),.05);
  const arrive=()=>{const t=orderTarget(player.delivery.order);Object.assign(car,{x:t.x,z:t.z,y:terrainHeight(t.x,t.z)??0,speed:0,vy:0,supportId:'ground'});};
  tick(true);arrive();tick(true);assert.equal(player.delivery.order.stage,'dropoff');
  arrive();tick(true);assert.equal(player.cockpit.deliveries,1);assert.equal(player.delivery.completed,1);
  tick(true);arrive();tick(false);player.delivery.order.customer=0;arrive();tick(true);
  assert.equal(player.delivery.completed,2);assert.equal(player.cockpit.deliveries,1,'mixed camera run is not credited');
  assert.ok(player.cockpit.activeSeconds>0);assert.equal(player.cockpit.active,true);
});

test('idle and on-foot time cannot be credited as cockpit driving',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];
  step(world,new Map([['p',{...NEUTRAL,cockpit:true,steer:1}]]),.05);
  for(let i=0;i<80;i++)step(world,new Map([['p',{...NEUTRAL,cockpit:true}]]),.05);
  const before=player.cockpit.activeSeconds;
  for(let i=0;i<20;i++)step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(player.cockpit.activeSeconds,before);assert.equal(player.cockpit.orderEligible,true,'paused camera change does not disqualify a run');
  car.kind='person';step(world,new Map([['p',{...NEUTRAL,steer:1,cockpit:true}]]),.05);
  assert.equal(player.cockpit.active,false);assert.equal(player.cockpit.activeSeconds,before);assert.equal(player.cockpit.orderEligible,false);
});

test('wire frames require a boolean camera flag',()=>{
  const frame={type:'input',seq:1,targetTick:2,controlRevision:0,actionSeq:0,roomEpoch:'00000000-0000-0000-0000-000000000000'};
  assert.ok(parseMessage(JSON.stringify({...frame,input:{...NEUTRAL,cockpit:true}})));
  assert.equal(parseMessage(JSON.stringify({...frame,input:{...NEUTRAL,cockpit:'yes'}})),null);
  const {cockpit,...oldInput}=NEUTRAL;assert.equal(parseMessage(JSON.stringify({...frame,input:oldInput})),null);
});

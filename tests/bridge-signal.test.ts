import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAY_BRIDGE_SIGNAL, bayBridgeSignal } from '../shared/bridge-signal';
import { createWorld, makeEntity, step } from '../shared/game';
import { ROUTES, trafficInput } from '../shared/traffic';
import { VEHICLES } from '../shared/vehicles';

const bridgeRoute=ROUTES.findIndex(route=>route.length===10&&route[0].x===0&&route[0].z===63);

test('bridge signal follows a 48-real-second cycle',()=>{
  assert.equal(bayBridgeSignal(0).state,'green');
  assert.equal(bayBridgeSignal(29.999).state,'green');
  assert.equal(bayBridgeSignal(30).state,'red');
  assert.equal(bayBridgeSignal(47.999).state,'red');
  assert.deepEqual(bayBridgeSignal(48),{state:'green',secondsRemaining:30});
});

test('eastbound cars queue at red and both cross after green',()=>{
  assert.ok(bridgeRoute>=0);
  const world=createWorld(),leader=makeEntity('meter-leader','model-3',15,63),follower=makeEntity('meter-follower','model-3',-15,63);
  for(const car of [leader,follower])Object.assign(car,{npc:true,autopilot:true,routeId:bridgeRoute,waypoint:1,yaw:-Math.PI/2,speed:8});
  world.entities=[leader,follower];world.players=[];world.pickups=[];world.time=30;
  for(let i=0;i<280;i++)step(world,new Map(),.05);
  assert.equal(bayBridgeSignal(world.time).state,'red');
  assert.ok(leader.x+VEHICLES['model-3'].length/2<BAY_BRIDGE_SIGNAL.stopX,'leader stops before the line');
  assert.ok(leader.speed<1&&follower.speed<1,'both cars stop');
  assert.ok(leader.x-follower.x>VEHICLES['model-3'].length,'queue keeps a gap');
  const followerX=follower.x;
  for(let i=0;i<360;i++)step(world,new Map(),.05);
  assert.ok(leader.x>BAY_BRIDGE_SIGNAL.stopX&&follower.x>BAY_BRIDGE_SIGNAL.stopX,'queue crosses after green');
  assert.ok(follower.x>followerX+10);
});

test('red does not stop westbound cars or eastbound cars past the line',()=>{
  const world=createWorld();world.entities=[];world.players=[];world.time=35;
  const west=makeEntity('west','model-3',80,57),past=makeEntity('past','model-3',80,63);
  Object.assign(west,{autopilot:true,routeId:bridgeRoute,waypoint:6,yaw:Math.PI/2});
  Object.assign(past,{autopilot:true,routeId:bridgeRoute,waypoint:1,yaw:-Math.PI/2});
  assert.ok(trafficInput(west,world).throttle>0);
  assert.ok(trafficInput(past,world).throttle>0);
});

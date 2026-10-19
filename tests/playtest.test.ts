import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playtestMode, SANDBOX_CASH, prepareSandboxDriver, sandboxWallet } from '../shared/playtest';
import { createEmptyWorld, addPlayer, teleportPlayer, chooseVehicle, buyVehicleStyle, step, NEUTRAL } from '../shared/game';
import { parseMessage } from '../worker/protocol';

test('only reserved room codes enable nonpersistent playtesting',()=>{
  for(const code of ['sandbox','sandbox-friends'])assert.equal(playtestMode(code),'sandbox');
  for(const code of ['practice','practice-fresh'])assert.equal(playtestMode(code),'practice');
  for(const code of ['bay','bay2','sandboxx','my-sandbox','Sandbox','sandbox/../bay','sandbox-'+'a'.repeat(32)] )assert.equal(playtestMode(code),null);
});
test('sandbox grants max upgrades without infinite air or malformed wire values',()=>{
  const world=createEmptyWorld(),p=addPlayer(world,'p','Driver');
  prepareSandboxDriver(world,'p');const e=world.entities.find(e=>e.id===p.entityId)!;
  assert.equal(e.tankLevel,5);assert.ok(Object.values(e.upgrades).every(Boolean));
  assert.equal(e.upgrades.autonomyIntercity,true,'sandbox includes Hyperloop Pilot');
  assert.equal(p.delivery.cash,SANDBOX_CASH);assert.ok(p.delivery.level>=6);
  assert.equal(buyVehicleStyle(world,p.id,{category:'paint',choice:'mint'}),true);
  sandboxWallet(p,world.time);assert.equal(p.delivery.cash,SANDBOX_CASH);
  assert.equal(e.style.paint,'mint');
  e.y=20;e.supportId=null;
  step(world,new Map([['p',{...NEUTRAL,hover:true}]]),.05);
  assert.ok(e.air<100);sandboxWallet(p,world.time);assert.ok(e.air<100,'wallet refill must not replenish flight air');
  assert.ok(!JSON.stringify(world).includes('"cash":null'));
});
test('ordinary fleet excludes Vault and NPC models; sandbox authority explicitly permits them',()=>{
  const world=createEmptyWorld();addPlayer(world,'p','Driver');
  assert.equal(chooseVehicle(world,'p','bugatti-chiron'),false);
  assert.equal(chooseVehicle(world,'p','waymo-prius'),false);
  assert.equal(chooseVehicle(world,'p','bugatti-chiron',true),true);
  prepareSandboxDriver(world,'p');
  assert.equal(world.entities.find(e=>e.driver==='p')?.tankLevel,5);
});
test('teleport rejects water and invalid positions, clears velocity and navigation on safe ground',()=>{
  const world=createEmptyWorld(),p=addPlayer(world,'p','Driver'),e=world.entities.find(e=>e.id===p.entityId)!;
  const before={x:e.x,z:e.z};
  assert.equal(teleportPlayer(world,p.id,{x:NaN,z:0}),false);
  assert.equal(teleportPlayer(world,p.id,{x:10000,z:10000}),false);
  assert.equal(teleportPlayer(world,p.id,{x:3000,z:1000}),false);
  assert.deepEqual({x:e.x,z:e.z},before);
  e.speed=70;e.vx=40;e.vy=20;e.roll=1;e.autopilot=true;
  assert.equal(teleportPlayer(world,p.id,{x:-165,z:180}),true);
  assert.ok(Math.hypot(e.x+165,e.z-180)<=20.001);
  assert.equal(e.speed,0);assert.equal(e.vy,0);assert.equal(e.roll,0);assert.equal(e.autopilot,false);
  assert.equal(e.navigation,null);assert.equal(e.supportId,'ground');
});
test('teleport commands require the ordinary action fence and finite bounded coordinates',()=>{
  const command={type:'teleport',requestId:1,x:-165,z:180,actionSeq:1,edgeBaseline:{jump:0,flip:0}};
  assert.deepEqual(parseMessage(JSON.stringify(command)),command);
  for(const invalid of [{...command,edgeBaseline:null},{...command,actionSeq:0},{...command,x:10001},{...command,z:null}])assert.equal(parseMessage(JSON.stringify(invalid)),null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, buyUpgrade, createWorld, NEUTRAL, step, subscribeOta } from '../shared/game';
import { OTA_FEE, OTA_INTERVAL, updateOta } from '../shared/ota';
import { parseMessage } from '../worker/protocol';
import { Session } from '../src/session';

test('OTA charges once per game hour, pauses without debt, resumes on income, and can be cancelled',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');p.delivery.cash=10;
  assert.equal(OTA_INTERVAL,120);
  assert.equal(subscribeOta(world,'p',true),true);
  assert.deepEqual(p.delivery.ota,{enabled:true,active:true,renewAt:120});assert.equal(p.delivery.cash,5);
  subscribeOta(world,'p',true);updateOta(p,119.99);assert.equal(p.delivery.cash,5);
  updateOta(p,120);assert.equal(p.delivery.cash,0);assert.equal(p.delivery.ota.renewAt,240);
  updateOta(p,240);assert.deepEqual(p.delivery.ota,{enabled:true,active:false,renewAt:null});assert.equal(p.delivery.cash,0);
  updateOta(p,999);assert.equal(p.delivery.cash,0);
  p.delivery.cash=OTA_FEE-1;updateOta(p,1000);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=8;world.time=1000;step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(p.delivery.cash,3);assert.equal(p.delivery.ota.active,true);assert.ok(p.delivery.ota.renewAt!>1120);
  subscribeOta(world,'p',false);p.delivery.cash=100;updateOta(p,2000);
  assert.deepEqual(p.delivery.ota,{enabled:false,active:false,renewAt:null});assert.equal(p.delivery.cash,100);
});

test('enrollment with no cash waits; paid remote shopping is authoritative and independent',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player'),other=addPlayer(world,'q','Other');
  const car=world.entities.find(e=>e.id===p.entityId)!;
  assert.equal(subscribeOta(world,'p',true),true);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=100;updateOta(p,world.time);assert.equal(p.delivery.cash,95);
  Object.assign(car,{x:1000,z:1000,supportId:null,vy:3});
  assert.equal(buyUpgrade(world,'p','tank'),true,'active subscription permits airborne remote purchases');
  assert.equal(other.delivery.ota.enabled,false);
  world.time=OTA_INTERVAL;p.delivery.cash=0;
  assert.equal(buyUpgrade(world,'p','motor'),false);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=100;assert.equal(buyUpgrade(world,'p','motor'),true,'renewal resumes on available funds');
  subscribeOta(world,'p',false);assert.equal(buyUpgrade(world,'p','armor'),false,'cancelled subscription cannot shop remotely');
});

test('subscription protocol validates messages and solo requests report results',()=>{
  assert.equal(parseMessage('{"type":"ota","enabled":"yes","requestId":1}'),null);
  assert.equal(parseMessage('{"type":"ota","enabled":true,"requestId":0}'),null);
  assert.deepEqual(parseMessage('{"type":"ota","enabled":true,"requestId":1}'),{type:'ota',enabled:true,requestId:1});
  const session=new Session(),id=session.setOta(true);
  assert.deepEqual(session.otaResult,{requestId:id,enabled:true,ok:true});
  assert.equal(session.world.players[0].delivery.ota.active,false);
});

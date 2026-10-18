import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, buyUpgrade, createWorld, NEUTRAL, step, subscribeOta } from '../shared/game';
import { OTA_FEE, OTA_INTERVAL, restoreOta, updateOta } from '../shared/ota';
import { parseMessage } from '../worker/protocol';

test('OTA charges once per game hour, pauses without debt, resumes on income, and can be cancelled',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');p.delivery.cash=200;
  assert.equal(OTA_INTERVAL,120);
  assert.equal(subscribeOta(world,'p',true),true);
  assert.deepEqual(p.delivery.ota,{enabled:true,active:true,renewAt:120,needsRenewalConsent:false});assert.equal(p.delivery.cash,100);
  subscribeOta(world,'p',true);updateOta(p,119.99);assert.equal(p.delivery.cash,100);
  updateOta(p,120);assert.equal(p.delivery.cash,0);assert.equal(p.delivery.ota.renewAt,240);
  updateOta(p,240);assert.deepEqual(p.delivery.ota,{enabled:true,active:false,renewAt:null,needsRenewalConsent:false});assert.equal(p.delivery.cash,0);
  updateOta(p,999);assert.equal(p.delivery.cash,0);
  p.delivery.cash=OTA_FEE-1;updateOta(p,1000);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=108;world.time=1000;step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(p.delivery.cash,8);assert.equal(p.delivery.ota.active,true);assert.ok(p.delivery.ota.renewAt!>1120);
  subscribeOta(world,'p',false);p.delivery.cash=100;updateOta(p,2000);
  assert.deepEqual(p.delivery.ota,{enabled:false,active:false,renewAt:null,needsRenewalConsent:false});assert.equal(p.delivery.cash,100);
});

test('existing subscribers keep paid time but opt in before the higher renewal',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');
  p.delivery.cash=500;
  p.delivery.ota=restoreOta({enabled:true,active:true,remaining:30},100);
  assert.deepEqual(p.delivery.ota,{enabled:false,active:true,renewAt:130,needsRenewalConsent:true});
  updateOta(p,129);assert.equal(p.delivery.cash,500);assert.equal(p.delivery.ota.active,true);
  updateOta(p,130);assert.equal(p.delivery.cash,500);assert.equal(p.delivery.ota.active,false);
  assert.equal(p.delivery.ota.needsRenewalConsent,true);
  world.time=130;subscribeOta(world,'p',true);
  assert.equal(p.delivery.cash,400);assert.equal(p.delivery.ota.renewAt,250);
  assert.equal(p.delivery.ota.needsRenewalConsent,false);
  // A reconnect preserves the accepted price and continues normal renewal.
  p.delivery.ota=restoreOta({enabled:true,active:true,remaining:10,needsRenewalConsent:false},200);
  updateOta(p,210);assert.equal(p.delivery.cash,300);assert.equal(p.delivery.ota.renewAt,330);
});

test('re-enrollment during an old paid period does not charge twice',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');p.delivery.cash=500;
  p.delivery.ota=restoreOta({enabled:true,active:true,remaining:30},100);
  world.time=110;subscribeOta(world,'p',true);
  assert.equal(p.delivery.cash,500);assert.equal(p.delivery.ota.renewAt,130);
  updateOta(p,130);assert.equal(p.delivery.cash,400);assert.equal(p.delivery.ota.renewAt,250);
  world.time=250;subscribeOta(world,'p',false);
  assert.equal(p.delivery.cash,400,'cancelling at renewal cannot charge another period');
  assert.equal(p.delivery.ota.active,false);
});

test('legacy live and unfunded states also require opt-in without changing cash',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');p.delivery.cash=500;
  p.delivery.ota={enabled:true,active:true,renewAt:30} as typeof p.delivery.ota;
  updateOta(p,10);
  assert.deepEqual(p.delivery.ota,{enabled:false,active:true,renewAt:30,needsRenewalConsent:true});
  p.delivery.ota=restoreOta({enabled:true,active:false,remaining:0},40);
  updateOta(p,40);assert.equal(p.delivery.cash,500);assert.equal(p.delivery.ota.needsRenewalConsent,true);
  assert.equal(p.delivery.ota.active,false);
});

test('enrollment with no cash waits; paid remote shopping is authoritative and independent',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player'),other=addPlayer(world,'q','Other');
  const car=world.entities.find(e=>e.id===p.entityId)!;
  p.delivery.cash=0;
  assert.equal(subscribeOta(world,'p',true),true);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=1_600;updateOta(p,world.time);assert.equal(p.delivery.cash,1_500);
  Object.assign(car,{x:1000,z:1000,supportId:null,vy:3});
  assert.equal(buyUpgrade(world,'p','tank'),true,'active subscription permits airborne remote purchases');
  assert.equal(other.delivery.ota.enabled,false);
  world.time=OTA_INTERVAL;p.delivery.cash=0;
  assert.equal(buyUpgrade(world,'p','motor'),false);assert.equal(p.delivery.ota.active,false);
  p.delivery.cash=2_100;assert.equal(buyUpgrade(world,'p','motor'),true,'renewal resumes on available funds');
  subscribeOta(world,'p',false);assert.equal(buyUpgrade(world,'p','armor'),false,'cancelled subscription cannot shop remotely');
});

test('subscription protocol validates messages',()=>{
  assert.equal(parseMessage('{"type":"ota","enabled":"yes","requestId":1}'),null);
  assert.equal(parseMessage('{"type":"ota","enabled":true,"requestId":0}'),null);
  assert.deepEqual(parseMessage('{"type":"ota","enabled":true,"requestId":1}'),{type:'ota',enabled:true,requestId:1});
});

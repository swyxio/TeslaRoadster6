import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAwardSync } from '../src/award-sync';
import type { AwardProgress, AwardTicket } from '../src/chat';

function setup(){
  let time=1000;
  const sent:{kind:string;value?:unknown}[]=[];
  const chat={status:'online' as 'online'|'offline'|'connecting',playerId:'driver-a',code:'private-code-a' as string|undefined,identityTransition:false,readyGeneration:1,
    awards:[] as AwardProgress|null,awardsRevision:1,awardTicket:null as AwardTicket|null,
    awardFailure:null as {revision:number;message:string;requestId?:number}|null,
    requestAwardTicket:(value:number)=>{sent.push({kind:'ticket',value});return true;},
    getAwards:()=>{sent.push({kind:'get'});return true;}};
  const session={status:'online' as 'online'|'disconnected'|'connecting',id:'drive',room:'bay',
    awardsBound:null as {requestId:number;ok:boolean}|null,awardsUnbound:null as {requestId:number;ok:boolean}|null,awardsSync:null as boolean|null,
    bindAwards:(ticket:string,requestId:number)=>{sent.push({kind:'bind',value:{ticket,requestId}});return true;},
    unbindAwards:(requestId:number)=>{sent.push({kind:'unbind',value:requestId});return true;}};
  const sync=createAwardSync(chat,session,()=>time);
  return {chat,session,sync,sent,advance:(ms:number)=>{time+=ms;}};
}

function reply(chat:ReturnType<typeof setup>['chat'],awards:AwardProgress){chat.awards=awards;chat.awardsRevision++;}

test('a room binding consumes a fresh unexpired ticket for each connection and identity',()=>{
  const {chat,session,sync,sent}=setup();sync.update();
  const first=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:first,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.deepEqual(sent.find(packet=>packet.kind==='bind')?.value,{ticket:'a'.repeat(64),requestId:first});
  assert.equal(chat.awardTicket,null,'the bearer ticket is discarded after sending');
  session.awardsBound={requestId:first,ok:true};sync.update();
  assert.match(sync.snapshot().status,/saved awards stay/i);
  chat.readyGeneration++;reply(chat,[]);sync.update();
  const second=sent.filter(packet=>packet.kind==='ticket').at(-1)!.value as number;
  assert.notEqual(second,first);
  chat.awardTicket={requestId:second,ticket:'b'.repeat(64),expiresAt:1};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,1,'expired ticket is not forwarded');
  assert.match(sync.snapshot().status,/could not save|retry/i);
});

test('a switch freezes a binding even with an old ticket and does not bind the next driver before unbind acknowledgement',()=>{
  const {chat,session,sync,sent}=setup();sync.update();
  const oldTicket=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:oldTicket,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,1);
  chat.identityTransition=true;chat.status='connecting';sync.update();
  const unbindId=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsBound={requestId:oldTicket,ok:true};
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,[]);sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1,'old bind reply cannot start a new binding');
  assert.match(sync.snapshot().status,/switching drivers/i);
  session.awardsUnbound={requestId:unbindId,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2,'new driver gets a ticket only after unbind succeeds');
});

test('a switch ignores a delayed old ticket, including when the change finishes between frames',()=>{
  const {chat,session,sync,sent}=setup();sync.update();
  const oldTicket=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.playerId='driver-b';chat.code='private-code-b';chat.readyGeneration++;reply(chat,[]);
  chat.awardTicket={requestId:oldTicket,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='unbind').length,1);
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,0,'old ticket is never sent to the room');
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1);
  const id=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsUnbound={requestId:id,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

test('failed unbind is retried and keeps the new driver detached until success',()=>{
  const {chat,session,sync,sent,advance}=setup();sync.update();
  chat.identityTransition=true;chat.status='connecting';sync.update();
  const first=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsUnbound={requestId:first,ok:false};sync.update();
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,[]);sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1);
  assert.match(sync.snapshot().status,/could not finish switching/i);
  advance(5_000);sync.update();
  const second=sent.filter(packet=>packet.kind==='unbind').at(-1)!.value as number;assert.notEqual(second,first);
  session.awardsUnbound={requestId:second,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

test('ordinary chat reconnect keeps the same room owner without unbinding',()=>{
  const {chat,session,sync,sent}=setup();sync.update();
  const first=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:first,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  session.awardsBound={requestId:first,ok:true};sync.update();
  chat.status='offline';sync.update();
  chat.status='online';chat.readyGeneration++;reply(chat,[]);sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='unbind').length,0);
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

test('only confirmed room awards appear and identity switches clear the previous driver profile',()=>{
  const {chat,sync,sent}=setup();sync.update();
  reply(chat,['regular']);sync.update();
  assert.deepEqual(sync.snapshot().unlocked,['regular']);
  chat.identityTransition=true;chat.status='connecting';sync.update();
  assert.deepEqual(sync.snapshot().unlocked,[]);
  const unbindId=sent.find(packet=>packet.kind==='unbind')!.value as number;
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,[]);sync.update();
  assert.deepEqual(sync.snapshot().unlocked,[]);
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1);
  assert.ok(unbindId>0);
});

test('unavailable saved awards are reported and retried without presenting a false empty profile',()=>{
  const {chat,sync,sent,advance}=setup();chat.awards=null;sync.update();
  assert.match(sync.snapshot().status,/could not save|load/i);
  assert.equal(sent.filter(packet=>packet.kind==='get').length,1);
  advance(5_000);sync.update();assert.equal(sent.filter(packet=>packet.kind==='get').length,2);
  reply(chat,['roof-rider']);sync.update();
  assert.deepEqual(sync.snapshot().unlocked,['roof-rider']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld } from '../shared/game';
import { createAwardSync } from '../src/award-sync';
import type { AchievementId } from '../shared/achievements';
import type { AwardProgress, AwardTicket } from '../src/chat';

function setup(mode:'solo'|'online'='solo'){
  let time=1000;
  const data=new Map<string,string>(),sent:{kind:string;value?:unknown}[]=[];
  const store={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  const world=createWorld(),player=addPlayer(world,'drive','Player');
  const chat={status:'online' as 'online'|'offline'|'connecting',playerId:'driver-a',code:'private-code-a' as string|undefined,identityTransition:false,readyGeneration:1,
    awards:{room:[],solo:[]} as AwardProgress|null,awardsRevision:1,awardTicket:null as AwardTicket|null,
    awardFailure:null as {revision:number;message:string;requestId?:number}|null,
    requestAwardTicket:(value:number)=>{sent.push({kind:'ticket',value});return true;},
    saveSoloAwards:(value:AchievementId[])=>{sent.push({kind:'solo',value:[...value]});return true;},
    getAwards:()=>{sent.push({kind:'get'});return true;}};
  const session={status:mode as 'solo'|'online'|'disconnected'|'connecting',id:'drive',room:'bay',world,
    awardsBound:null as {requestId:number;ok:boolean}|null,awardsUnbound:null as {requestId:number;ok:boolean}|null,awardsSync:null as boolean|null,
    bindAwards:(ticket:string,requestId:number)=>{sent.push({kind:'bind',value:{ticket,requestId}});return true;},
    unbindAwards:(requestId:number)=>{sent.push({kind:'unbind',value:requestId});return true;}};
  const sync=createAwardSync(chat,session,store,()=>time);
  return {chat,session,world,player,sync,data,sent,advance:(ms:number)=>{time+=ms;}};
}

function reply(chat:ReturnType<typeof setup>['chat'],awards:AwardProgress){chat.awards=awards;chat.awardsRevision++;}

test('offline solo awards wait under the same driver ID and clear only on an acknowledged union',()=>{
  const {chat,player,sync,data,sent}=setup();sync.update();
  chat.status='offline';player.achievements.unlocked.push('regular');sync.update();
  assert.match(sync.snapshot().status,/offline.*waiting/i);assert.deepEqual(sync.snapshot().unlocked,[]);
  assert.deepEqual(JSON.parse(data.get('tesland:pending-solo-awards:driver-a')!),['regular']);
  assert.doesNotMatch(JSON.stringify([...data]),/private-code/);
  chat.status='online';chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.deepEqual(sent.filter(packet=>packet.kind==='solo').map(packet=>packet.value),[['regular']]);
  sync.update();assert.equal(sent.filter(packet=>packet.kind==='solo').length,1,'no repeated sends while awaiting confirmation');
  reply(chat,{room:[],solo:['regular']});sync.update();
  assert.deepEqual(sync.snapshot().unlocked,['regular']);assert.deepEqual(sync.snapshot().solo,['regular']);
  assert.deepEqual(JSON.parse(data.get('tesland:pending-solo-awards:driver-a')!),[]);
});

test('identity switches baseline the current drive and do not transfer queued awards',()=>{
  const {chat,player,sync,sent,data}=setup();sync.update();
  chat.status='offline';player.achievements.unlocked.push('regular');sync.update();
  chat.identityTransition=true;chat.status='connecting';sync.update();
  player.achievements.unlocked.push('roof-rider');sync.update();
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.deepEqual(sent.filter(packet=>packet.kind==='solo'),[],'awards before B connected are not sent to B');
  player.achievements.unlocked.push('bay-hopper');sync.update();
  assert.deepEqual(sent.filter(packet=>packet.kind==='solo').at(-1)?.value,['bay-hopper']);
  assert.deepEqual(JSON.parse(data.get('tesland:pending-solo-awards:driver-a')!),['regular']);
  chat.identityTransition=true;sync.update();
  chat.playerId='driver-a';chat.code='private-code-a';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.deepEqual(sent.filter(packet=>packet.kind==='solo').at(-1)?.value,['regular'],'returning to A restores only A’s queue');
});

test('a room binding consumes a fresh unexpired ticket for each connection and identity',()=>{
  const {chat,session,sync,sent}=setup('online');sync.update();
  const first=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:first,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.deepEqual(sent.find(packet=>packet.kind==='bind')?.value,{ticket:'a'.repeat(64),requestId:first});
  assert.equal(chat.awardTicket,null,'the bearer ticket is discarded after sending');
  session.awardsBound={requestId:first,ok:true};sync.update();
  assert.match(sync.snapshot().status,/saved awards stay/i);
  chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  const second=sent.filter(packet=>packet.kind==='ticket').at(-1)!.value as number;
  assert.notEqual(second,first);
  chat.awardTicket={requestId:second,ticket:'b'.repeat(64),expiresAt:1};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,1,'expired ticket is not forwarded');
  assert.match(sync.snapshot().status,/could not save|retry/i);
});

test('late acknowledgement removes only IDs the server actually saved and newer awards are retried',()=>{
  const {chat,player,sync,sent,data}=setup();sync.update();
  player.achievements.unlocked.push('regular');sync.update();
  player.achievements.unlocked.push('roof-rider');sync.update();
  reply(chat,{room:[],solo:['regular']});sync.update();
  assert.deepEqual(JSON.parse(data.get('tesland:pending-solo-awards:driver-a')!),['roof-rider']);
  assert.deepEqual(sent.filter(packet=>packet.kind==='solo').map(packet=>packet.value),[['regular'],['roof-rider']]);
  reply(chat,{room:[],solo:['regular','roof-rider']});sync.update();
  assert.deepEqual(JSON.parse(data.get('tesland:pending-solo-awards:driver-a')!),[]);
});

test('failed local storage is reported and pending awards remain in memory across identity switches',()=>{
  const {chat,session,player}=setup();
  const throwing={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  const sync=createAwardSync(chat,session,throwing,()=>1000);sync.update();
  chat.status='offline';player.achievements.unlocked.push('regular');sync.update();
  assert.match(sync.snapshot().status,/storage is unavailable/i);
  chat.identityTransition=true;sync.update();chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  chat.identityTransition=true;sync.update();chat.playerId='driver-a';chat.code='private-code-a';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.match(sync.snapshot().status,/could not access pending/i);
});

test('a switch freezes a binding even with an old ticket and does not bind the next driver before unbind acknowledgement',()=>{
  const {chat,session,sync,sent}=setup('online');sync.update();
  const oldTicket=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:oldTicket,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,1);
  chat.identityTransition=true;chat.status='connecting';sync.update();
  const unbindId=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsBound={requestId:oldTicket,ok:true};
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1,'old bind reply cannot start a new binding');
  assert.match(sync.snapshot().status,/switching drivers/i);
  session.awardsUnbound={requestId:unbindId,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2,'new driver gets a ticket only after unbind succeeds');
});

test('a switch ignores a delayed old ticket, including when the change finishes between frames',()=>{
  const {chat,session,sync,sent}=setup('online');sync.update();
  const oldTicket=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.playerId='driver-b';chat.code='private-code-b';chat.readyGeneration++;reply(chat,{room:[],solo:[]});
  chat.awardTicket={requestId:oldTicket,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='unbind').length,1);
  assert.equal(sent.filter(packet=>packet.kind==='bind').length,0,'old ticket is never sent to the room');
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1);
  const id=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsUnbound={requestId:id,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

test('failed unbind is retried and keeps the new driver detached until success',()=>{
  const {chat,session,sync,sent,advance}=setup('online');sync.update();
  chat.identityTransition=true;chat.status='connecting';sync.update();
  const first=sent.find(packet=>packet.kind==='unbind')!.value as number;
  session.awardsUnbound={requestId:first,ok:false};sync.update();
  chat.playerId='driver-b';chat.code='private-code-b';chat.status='online';chat.identityTransition=false;chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,1);
  assert.match(sync.snapshot().status,/could not finish switching/i);
  advance(5_000);sync.update();
  const second=sent.filter(packet=>packet.kind==='unbind').at(-1)!.value as number;assert.notEqual(second,first);
  session.awardsUnbound={requestId:second,ok:true};sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

test('ordinary chat reconnect keeps the same room owner without unbinding',()=>{
  const {chat,session,sync,sent}=setup('online');sync.update();
  const first=sent.find(packet=>packet.kind==='ticket')!.value as number;
  chat.awardTicket={requestId:first,ticket:'a'.repeat(64),expiresAt:3000};sync.update();
  session.awardsBound={requestId:first,ok:true};sync.update();
  chat.status='offline';sync.update();
  chat.status='online';chat.readyGeneration++;reply(chat,{room:[],solo:[]});sync.update();
  assert.equal(sent.filter(packet=>packet.kind==='unbind').length,0);
  assert.equal(sent.filter(packet=>packet.kind==='ticket').length,2);
});

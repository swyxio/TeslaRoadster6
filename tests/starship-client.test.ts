import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StarshipClient } from '../src/starship-client';
import { Session } from '../src/session';
import { PROTOCOL_VERSION, createEmptyWorld, NEUTRAL } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import type { StarshipViewStatus } from '../src/starship-model';

const status=(overrides:Partial<StarshipViewStatus>={}):StarshipViewStatus=>({
  total:100,personal:null,crossing:'pending',launchTotal:null,completedAt:null,launchAt:null,launchId:null,cutoverTotal:null,cutoverAt:null,...overrides,
});
const response=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
function fakeSession(){
  return {status:'disconnected',walletBlocked:false,wallet:null,starshipStatus:null,starshipNameResult:null,starshipContextVersion:0,
    requestStarshipStatus:()=>true,setStarshipName:()=>1} as unknown as Session;
}

test('public progress stays visible without identity; private pending is derived only from committed values',async()=>{
  let now=1000;const session=fakeSession();
  const client=new StarshipClient(session,()=>now,async()=>response({status:status(),serverTime:200_000}));
  await client.refresh();
  assert.equal(client.state().confirmed?.total,100);
  assert.equal(client.state().confirmed?.personal,null);
  assert.equal(client.state().pendingContribution,null);
  assert.equal(client.state().privacy.status,'unavailable');
  session.status='online';session.wallet={cash:0,earned:0,eligibleIncome:40,level:0,unlocked:[],ownedLuxury:[]};
  session.starshipStatus={status:status({personal:25}),serverTime:201_000,receivedAt:now,publicName:null,privacyPending:false};
  client.tick();
  assert.equal(client.state().confirmed?.personal,25);
  assert.equal(client.state().pendingContribution,15);
  session.wallet.eligibleIncome=20;
  assert.equal(client.state().pendingContribution,null,'an older wallet cannot imply a negative pending amount');
  session.status='disconnected';
  assert.equal(client.state().confirmed?.personal,null,'room identity is not exposed after disconnect');
  assert.equal(client.state().pendingContribution,null);
  now+=26_000;
  assert.equal(client.state().freshness,'stale');
});

test('a recovered driver is polled as soon as the new wallet is ready',()=>{
  let now=1000,requests=0;const session=fakeSession();
  session.status='online';session.requestStarshipStatus=()=>{requests++;return true;};
  const client=new StarshipClient(session,()=>now,async()=>response({status:status(),serverTime:200_000}));
  client.tick(true);assert.equal(requests,1);
  session.starshipStatus={status:status({personal:5}),serverTime:200_000,receivedAt:now,publicName:'Old',privacyPending:false};
  client.tick(true);assert.equal(client.state().privacy.publicName,'Old');
  now+=1000;session.starshipStatus=null;session.starshipContextVersion++;session.walletStatus='connecting';
  Object.defineProperty(session,'walletBlocked',{value:true,writable:true,configurable:true});
  client.tick(true);assert.equal(requests,1);assert.equal(client.state().privacy.status,'unavailable');
  Object.defineProperty(session,'walletBlocked',{value:false,writable:true,configurable:true});
  client.tick(true);assert.equal(requests,2,'the old driver polling deadline does not delay recovery');
});

test('server time drives the global launch and outranks local replay',async()=>{
  let now=1000;const session=fakeSession();
  const completed=status({total:1_000_000_000,crossing:'recorded',launchTotal:1_000_000_000,completedAt:1,launchAt:10_000,launchId:'launch'});
  const client=new StarshipClient(session,()=>now,async()=>response({status:completed,serverTime:9_000}));
  await client.refresh();client.replay();
  assert.equal(client.animation()?.source,'replay');
  now=2200;
  assert.deepEqual(client.animation(),{source:'global',elapsed:.2});
  assert.equal(client.stage(),5);
  assert.equal(client.animation(now,false)?.source,'global');
});

test('a queued privacy choice stays unconfirmed until the profile outbox clears',()=>{
  let now=1000,requests=0;const session=fakeSession();session.status='online';
  session.requestStarshipStatus=()=>{requests++;return true;};
  session.starshipStatus={status:status({personal:5}),serverTime:200_000,receivedAt:now,publicName:null,privacyPending:false};
  const client=new StarshipClient(session,()=>now,async()=>response({status:status(),serverTime:200_000}));
  client.tick(true);client.setName('New name');
  session.starshipNameResult={requestId:1,ok:false,publicName:null};client.tick(true);
  assert.equal(client.state().privacy.status,'error');assert.equal(requests,2,'an unconfirmed result prompts a fresh status');
  session.starshipStatus={status:status({personal:5}),serverTime:200_001,receivedAt:now,publicName:null,privacyPending:true};
  client.tick(true);assert.equal(client.state().privacy.status,'pending');
  now+=10_000;
  session.starshipStatus={status:status({personal:5}),serverTime:200_002,receivedAt:now,publicName:'New name',privacyPending:false};
  client.tick(true);assert.equal(client.state().privacy.status,'ready');assert.equal(client.state().privacy.publicName,'New name');
});

test('failed public reads and out-of-order contributor pages are handled explicitly',async()=>{
  let resolveFirst:(response:Response)=>void=()=>{};
  const fetcher:typeof fetch=async input=>{
    if(String(input).includes('at-goal'))return new Promise<Response>(resolve=>{resolveFirst=resolve;});
    if(String(input).includes('later'))return response({group:'later',state:'ready',contributors:[{name:'Driver',amount:null}],next:null});
    throw new Error('offline');
  };
  const client=new StarshipClient(fakeSession(),()=>100,fetcher);
  await client.refresh();assert.equal(client.state().freshness,'unavailable');
  const first=client.loadContributors('at-goal',null);
  await client.loadContributors('later',null);
  resolveFirst(response({group:'at-goal',state:'ready',contributors:[{name:'Old',amount:1}],next:null}));
  await first;
  assert.equal(client.state().contributors.group,'later');
  assert.equal(client.state().contributors.entries[0].name,'Driver');
});

test('public status and contributor requests preserve the browser fetch receiver',async()=>{
  const fetcher:typeof fetch=async function(this:unknown,input){
    assert.equal(this,globalThis);
    return String(input).includes('contributors')
      ?response({group:'at-goal',state:'ready',contributors:[{name:'Anonymous',amount:null}],next:null})
      :response({status:status(),serverTime:200_000});
  };
  const client=new StarshipClient(fakeSession(),()=>100,fetcher);
  await client.refresh();await client.loadContributors('at-goal',null);
  assert.equal(client.state().confirmed?.total,100);
  assert.deepEqual(client.state().contributors.entries,[{name:'Anonymous',amount:null}]);
});

class Socket {
  static OPEN=1;static last:Socket;readyState=1;sent:string[]=[];
  onmessage?: (event:{data:string})=>void;onclose?: (event:{code:number})=>void;
  constructor(_url:string){Socket.last=this;}
  send(value:string){this.sent.push(value);} close(){this.readyState=3;}
  message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
test('room status replies are correlated and invalidated when identity changes',()=>{
  Object.assign(globalThis,{WebSocket:Socket,window:globalThis,location:{protocol:'https:',host:'example.test'}});
  const session=new Session(()=>123);session.join('bay','Driver');const socket=Socket.last;
  socket.message({type:'welcome',id:'p',version:PROTOCOL_VERSION,capacity:8,roomEpoch:'r',tick:0,poseRevision:0});
  socket.message({type:'state',world:createEmptyWorld(),roomEpoch:'r',tick:0,poseRevision:0,substeps:1,control:new ScheduledInput(NEUTRAL).snapshot()});
  assert.equal(session.requestStarshipStatus(),true);
  const request=JSON.parse(socket.sent.at(-1)!);
  socket.message({type:'starshipStatus',requestId:request.requestId,status:status({personal:0}),publicName:null,privacyPending:false,serverTime:10});
  assert.equal(session.starshipStatus?.status.personal,0);
  assert.equal(session.requestStarshipStatus(),true);const oldRequest=JSON.parse(socket.sent.at(-1)!);
  session.setStarshipName('New');
  socket.message({type:'starshipStatus',requestId:oldRequest.requestId,status:status({personal:0}),publicName:'stale',privacyPending:false,serverTime:10});
  assert.equal(session.starshipStatus?.publicName,null,'an older poll cannot confirm a newer privacy choice');
  session.setIdentity('new-code');
  socket.message({type:'starshipStatus',requestId:request.requestId,status:status({personal:7}),publicName:'Old',privacyPending:false,serverTime:11});
  assert.equal(session.starshipStatus,null);
  session.disconnect();
});

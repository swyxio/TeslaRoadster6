import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarketClient } from '../src/market-client';
import type { MarketState } from '../shared/market-protocol';

function store(){const entries=new Map<string,string>();return {getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};}
const empty=(id:number):MarketState=>({type:'marketState',requestId:id,listings:[],owned:[],shop:[]});
test('an open market refreshes after reconnect without losing a pending operation',()=>{
  const sent:any[]=[];let next=0;
  const client=new MarketClient(store(),message=>{sent.push(message);return ++next;},()=> 'op');
  const context=(owner:string|null,ready:boolean,generation:number)=>({owner,ready,generation,cash:ready?100:null});
  assert.equal(client.setContext(context('a',true,1)),true);
  client.refresh();client.receiveState(empty(1));
  assert.equal(client.start({action:'acquire',catalogId:'paint'}),true);
  assert.equal(client.setContext(context('a',false,1)),false);
  assert.equal(client.setContext(context(null,false,2)),false);
  const refreshOnReady=client.setContext(context('a',true,2));
  client.tick();
  if(refreshOnReady)client.refresh();
  assert.deepEqual(sent.slice(-2),[{action:'status',operationId:'op'},{action:'browse'}]);
  client.receiveState(empty(1));
  assert.equal(client.view().state,'loading','an old-generation response cannot fill the new page');
  client.receiveState(empty(4));
  assert.equal(client.view().state,'ready');assert.equal(client.view().pending,true);
  assert.equal(client.setContext(context('a',true,2)),false,'steady state does not refresh every frame');
  client.receiveResult({type:'marketResult',requestId:3,operationId:'op',status:'not-found',action:null});
  assert.deepEqual(sent.at(-1),{action:'acquire',catalogId:'paint',operationId:'op'});
});
test('restoring readiness replaces an in-flight browse in the same connection',()=>{
  const sent:any[]=[];let next=0;
  const client=new MarketClient(store(),message=>{sent.push(message);return ++next;});
  const context=(ready:boolean)=>({owner:'a',ready,generation:1,cash:100});
  client.setContext(context(true));client.refresh();
  client.setContext(context(false));
  if(client.setContext(context(true)))client.refresh();
  assert.deepEqual(sent,[{action:'browse'},{action:'browse'}]);
  client.receiveState(empty(1));assert.equal(client.view().state,'loading');
  client.receiveState(empty(2));assert.equal(client.view().state,'ready');
});
test('a lost purchase is queried and, if never accepted, resent with the identical ID only for the same driver',()=>{
  const storage=store(),sent:unknown[]=[];let next=0,now=100;
  const send=(message:unknown)=>{sent.push(message);return ++next;};
  const client=new MarketClient(storage,send,()=> 'op-1',()=>now);
  client.setContext({owner:'a',ready:true,generation:1,cash:100});client.refresh();client.receiveState(empty(1));
  assert.equal(client.start({action:'buy',assetId:'asset',listingId:'listing',expectedRevision:1}),true);
  const command=sent.at(-1);assert.deepEqual(command,{action:'buy',assetId:'asset',listingId:'listing',expectedRevision:1,operationId:'op-1'});
  client.setContext({owner:'b',ready:true,generation:2,cash:100});client.tick();assert.equal(sent.length,2);
  client.setContext({owner:'a',ready:true,generation:3,cash:100});client.tick();assert.deepEqual(sent.at(-1),{action:'status',operationId:'op-1'});
  client.receiveResult({type:'marketResult',requestId:3,operationId:'op-1',status:'not-found',action:null});assert.deepEqual(sent.at(-1),command);
  client.receiveResult({type:'marketResult',requestId:4,operationId:'op-1',action:'buy',status:'completed'});
  assert.equal(client.view().pending,false);assert.deepEqual(sent.at(-1),{action:'browse'});
  now+=6000;client.tick();assert.equal(sent.filter((entry:any)=>entry.action==='buy').length,2);
});
test('storage failure prevents the action from being sent and displays the blocker',()=>{
  const storage=store(),sent:unknown[]=[];let next=0;
  const client=new MarketClient({...storage,setItem(){throw new Error('denied');}},message=>{sent.push(message);return ++next;},()=> 'op');
  client.setContext({owner:'a',ready:true,generation:1,cash:100});client.refresh();client.receiveState(empty(1));
  assert.equal(client.start({action:'acquire',catalogId:'paint'}),false);
  assert.equal(sent.length,1);assert.match(client.view().message,/storage/i);
});
test('refresh recovers an operation whose browser write succeeded but readback failed',()=>{
  const base=store(),sent:unknown[]=[];let next=0,failReadback=false;
  const storage={...base,getItem(key:string){if(failReadback)throw new Error('denied');return base.getItem(key);},
    setItem(key:string,value:string){base.setItem(key,value);failReadback=true;}};
  const client=new MarketClient(storage,message=>{sent.push(message);return ++next;},()=> 'op-1');
  client.setContext({owner:'a',ready:true,generation:1,cash:100});client.refresh();client.receiveState(empty(1));
  assert.equal(client.start({action:'acquire',catalogId:'paint'}),false);assert.equal(sent.length,1);
  failReadback=false;client.refresh();client.tick();
  assert.deepEqual(sent.at(-1),{action:'status',operationId:'op-1'});assert.equal(client.view().pending,true);
  client.receiveResult({type:'marketResult',requestId:3,operationId:'op-1',status:'not-found',action:null});
  assert.deepEqual(sent.at(-1),{action:'acquire',catalogId:'paint',operationId:'op-1'});
});
test('a pending operation survives a lost cleanup and is retried without creating a new ID',()=>{
  const base=store(),sent:unknown[]=[];let next=0,now=0,blocked=true;
  const storage={...base,removeItem(key:string){if(blocked)throw new Error('denied');base.removeItem(key);}};
  const client=new MarketClient(storage,message=>{sent.push(message);return ++next;},()=> 'op',()=>now);
  client.setContext({owner:'a',ready:true,generation:1,cash:100});client.refresh();client.receiveState(empty(1));client.start({action:'acquire',catalogId:'paint'});
  client.receiveResult({type:'marketResult',requestId:2,operationId:'op',action:'acquire',status:'completed'});assert.equal(client.view().pending,true);
  blocked=false;now=6000;client.tick();assert.deepEqual(sent.at(-1),{action:'status',operationId:'op'});
  client.receiveResult({type:'marketResult',requestId:3,operationId:'op',action:'acquire',status:'completed'});assert.equal(client.view().pending,false);
});
test('listing and owned pagination preserve the other collection',()=>{
  const sent:unknown[]=[];let next=0;
  const client=new MarketClient(store(),message=>{sent.push(message);return ++next;});
  client.setContext({owner:'a',ready:true,generation:1,cash:100});client.refresh();
  const asset=(assetId:string)=>({assetId,kind:'collectible' as const,name:assetId,description:'',listingId:null});
  const listing=(listingId:string)=>({listingId,assetId:listingId,kind:'collectible' as const,name:listingId,description:'',sellerName:'Seller',price:1,revision:1,mine:false});
  client.receiveState({...empty(1),listings:[listing('l1')],owned:[asset('a1')],nextCursor:'l1',nextOwnedCursor:'a1'});
  client.moreOwned();assert.deepEqual(sent.at(-1),{action:'browse',ownedCursor:'a1'});
  client.receiveState({...empty(2),listings:[listing('l1')],owned:[asset('a2')],nextCursor:'l1'});
  assert.deepEqual(client.view().owned.map(item=>item.assetId),['a1','a2']);
  client.more();assert.deepEqual(sent.at(-1),{action:'browse',cursor:'l1'});
  client.receiveState({...empty(3),listings:[listing('l2')],owned:[asset('a1')],nextOwnedCursor:'a1'});
  assert.deepEqual(client.view().owned.map(item=>item.assetId),['a1','a2']);
  assert.deepEqual(client.view().listings.map(item=>item.listingId),['l1','l2']);
  assert.equal(client.view().nextOwnedCursor,undefined);
});

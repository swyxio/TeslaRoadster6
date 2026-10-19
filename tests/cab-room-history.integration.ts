// Local Wrangler coverage for the room-owned Cybercab event-history barrier.
// pnpm exec tsx tests/cab-room-history.integration.ts
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { EarningsWindow } from '../shared/earnings-events';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await sleep(50);}throw new Error(`Timed out: ${label}`);
}
async function port(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGKILL');}catch{}
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler shutdown');
}
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-history-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-cab-history-test',main:resolve('tests/fixtures/cab-room-history-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'ECONOMIES',class_name:'RoomEconomy'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','RoomEconomy']}]}));
let child:ChildProcess|undefined,logs='';
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
async function call(op:string,room:string,fields:Record<string,unknown>={},timeout=5000){
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,room,...fields}),signal:AbortSignal.timeout(timeout)});
  const body=await response.text();return {status:response.status,body};
}
async function ok<T>(op:string,room:string,fields:Record<string,unknown>={},timeout=5000):Promise<T>{
  const response=await call(op,room,fields,timeout);assert.equal(response.status,200,`${op}: ${response.body}\n${logs}`);return JSON.parse(response.body) as T;
}
type State={heldWin:boolean;heldHistory:boolean;historyCalls:number;fence:number;wins:{event_id:string;won_at:number;ends_at:number}[]};
const state=(room:string)=>ok<State>('state',room);
const pending=(room:string)=>ok<{event_id:string;requested_at:number}[]>('pending',room);

try{
  child=start();await ready();
  const cold='cold-history',at=Date.now()-5000,to=at+1000;
  await ok('mode',cold,{mode:'hold-before'});
  await ok('journal',cold,{id:'cold-win',at});
  await stop(child);child=undefined;child=start();await ready();
  assert.equal((await call('history',cold,{from:at-1,to})).status,409,'cold room refuses to observe past its durable unpublished win');
  await until(async()=>(await state(cold)).heldWin,'cold win publish held');
  assert.equal((await state(cold)).historyCalls,0,'the room history fence is not advanced while publication is pending');
  assert.equal((await state(cold)).fence,0);
  assert.equal((await pending(cold)).length,1);
  await ok('mode',cold,{mode:'none'});await ok('release-win',cold);
  await until(async()=>(await pending(cold)).length===0,'cold win drained');
  assert.deepEqual(await ok<EarningsWindow[]>('history',cold,{from:at-1,to}),[{startsAtMs:at,endsAtMs:at+600_000}]);

  const failed='failed-history',failedAt=Date.now()-5000,failedTo=failedAt+1000;
  await ok('mode',failed,{mode:'fail-before'});await ok('journal',failed,{id:'failed-win',at:failedAt});
  assert.equal((await call('history',failed,{from:failedAt-1,to:failedTo})).status,409);
  await sleep(200);
  assert.equal((await pending(failed)).length,1,'a rejected publish leaves the win in the room journal');
  assert.equal((await state(failed)).historyCalls,0,'a rejected publish cannot advance the observation fence');
  await ok('mode',failed,{mode:'none'});
  await until(async()=>{const response=await call('history',failed,{from:failedAt-1,to:failedTo});return response.status===200;},'failed publish retried');
  assert.deepEqual(await ok<EarningsWindow[]>('history',failed,{from:failedAt-1,to:failedTo}),[{startsAtMs:failedAt,endsAtMs:failedAt+600_000}]);

  const lost='lost-history',lostAt=Date.now()-5000,lostTo=lostAt+1000;
  await ok('mode',lost,{mode:'fail-after'});await ok('journal',lost,{id:'lost-win',at:lostAt});
  assert.equal((await call('history',lost,{from:lostAt-1,to:lostTo})).status,409);
  await until(async()=>(await state(lost)).wins.length===1,'win committed despite lost reply');
  assert.equal((await pending(lost)).length,1,'a failed reply retains the room win journal');
  assert.equal((await call('history',lost,{from:lostAt-1,to:lostTo})).status,409);
  assert.equal((await state(lost)).historyCalls,0,'a failed publication reply cannot expose an incomplete history');
  await ok('mode',lost,{mode:'none'});
  await until(async()=>{const response=await call('history',lost,{from:lostAt-1,to:lostTo});return response.status===200;},'lost reply retried');
  assert.deepEqual(await ok<EarningsWindow[]>('history',lost,{from:lostAt-1,to:lostTo}),[{startsAtMs:lostAt,endsAtMs:lostAt+600_000}]);
  assert.equal((await state(lost)).wins.length,1,'retry does not publish the same win twice');

  const pages='paged-history',pageAt=Date.now()-10_000;
  await ok('seed',pages,{at:pageAt,count:101});
  const all=await ok<EarningsWindow[]>('history',pages,{from:pageAt,to:pageAt+1});
  assert.equal(all.length,101,'the room-owned RPC consumes every page');
  assert.equal((await state(pages)).historyCalls,2);
  await ok('fail-second-page',pages,{fail:true});
  assert.equal((await call('history',pages,{from:pageAt,to:pageAt+1})).status,409,'a failed later page cannot return partial history');
  await ok('fail-second-page',pages,{fail:false});
  assert.equal((await ok<EarningsWindow[]>('history',pages,{from:pageAt,to:pageAt+1})).length,101,'history remains retryable after a failed page');

  const concurrent='concurrent-history',before=Date.now()-100;
  await ok('hold-history',concurrent);
  const reading=call('history',concurrent,{from:before-100,to:before},15_000);
  await until(async()=>(await state(concurrent)).heldHistory,'history response held');
  await ok('record',concurrent,{at:before-50});
  await until(async()=>(await state(concurrent)).wins.length===1,'concurrent relevant win published');
  await ok('release-history',concurrent);
  assert.equal((await reading).status,409,'a relevant win journaled during an observation invalidates the result');
  await until(async()=>{const response=await call('history',concurrent,{from:before-100,to:before});return response.status===200;},'concurrent observation retries');
  assert.deepEqual(await ok<EarningsWindow[]>('history',concurrent,{from:before-100,to:before}),[{startsAtMs:before-50,endsAtMs:before-50+600_000}]);
  assert.equal((await call('history',concurrent,{other:'wrong-room',from:before-100,to:before})).status,409,'history cannot be requested under another room identity');
  assert.equal((await call('history',concurrent,{from:before,to:Date.now()+60_000})).status,409,'future intervals cannot advance the fence');
  const publicAt=Date.now()-10_000;
  await ok('seed','public:1',{at:publicAt,count:1});
  assert.equal((await ok<EarningsWindow[]>('history','public:1',{from:publicAt,to:publicAt+1})).length,1,'overflow room resolves its own economy history');
  assert.deepEqual(await ok<EarningsWindow[]>('history','public-1',{from:publicAt,to:publicAt+1}),[],'named and overflow rooms have separate economy histories');
  for(const room of ['public:0','public:01','public:17'])
    assert.equal((await call('history',room,{from:publicAt,to:publicAt+1})).status,409,'noncanonical public room identity is rejected');
  assert.equal((await call('history','public:1',{other:'public:2',from:publicAt,to:publicAt+1})).status,409,'overflow room cannot read another room history');
  console.log('PASS: cold pending wins, publication failure, lost replies, complete pages and concurrent win barrier.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

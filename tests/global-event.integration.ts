// Isolated local Wrangler fixture; no production binding or endpoint is used.
// Run: pnpm exec tsx tests/global-event.integration.ts
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GLOBAL_EVENT_DURATION_MS, globalWindowsForInstant } from '../shared/earnings-events.ts';
import type { EarningsWindow } from '../shared/earnings-events.ts';

const GLOBAL_EVENT_LEAD_MS=60_000,GLOBAL_EVENT_LEASE_MS=15_000;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const server=createServer();await new Promise<void>((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen);});const address=server.address();assert.ok(address&&typeof address!=='string');await new Promise<void>(resolveClose=>server.close(()=>resolveClose()));return address.port;}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  for(const [signal,timeout] of [['SIGINT',4000],['SIGTERM',2000],['SIGKILL',2000]] as const){
    try{process.kill(-child.pid!,signal);}catch{}
    const end=Date.now()+timeout;
    while(child.exitCode===null&&child.signalCode===null&&Date.now()<end)await delay(40);
    if(child.exitCode!==null||child.signalCode!==null)return;
  }
  throw new Error('Could not stop isolated Wrangler');
}
const dir=await mkdtemp(join(tmpdir(),'tesland-global-event-'));
const listenPort=await port(),base=`http://127.0.0.1:${listenPort}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-global-event-test',main:resolve('tests/fixtures/global-event-worker.ts'),compatibility_date:'2026-10-17',durable_objects:{bindings:[{name:'EVENTS',class_name:'TestGlobalEarningsEvent'}]},migrations:[{tag:'v1',new_sqlite_classes:['TestGlobalEarningsEvent']}]}));
let child:ChildProcess|undefined,ready=false;
function start(){
  ready=false;
  const processChild=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(listenPort),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  let startup='';
  processChild.stdout?.on('data',chunk=>{if(!ready){startup=(startup+String(chunk)).slice(-4096);if(startup.includes(`Ready on http://127.0.0.1:${listenPort}`)){ready=true;startup='';}}});
  processChild.stderr?.resume();
  return processChild;
}
async function waitReady(){
  const deadline=Date.now()+45_000;
  while(Date.now()<deadline){
    if(child?.exitCode!==null||child?.signalCode!==null)throw new Error('Wrangler exited before startup');
    if(ready){try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}}
    await delay(50);
  }
  throw new Error('Timed out starting isolated Wrangler');
}
async function call(op:string,data:Record<string,unknown>={},object='test'){
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,object,...data}),signal:AbortSignal.timeout(15_000)});
  return {status:response.status,body:await response.json() as any};
}
async function ok<T>(op:string,data:Record<string,unknown>={},object='test'):Promise<T>{
  const result=await call(op,data,object);assert.equal(result.status,200,JSON.stringify(result.body));return result.body as T;
}
const setTime=(now:number,object='test')=>ok('setTime',{now},object);
const t=Date.UTC(2026,9,18,12),startAt=t+GLOBAL_EVENT_LEAD_MS;
try{
  child=start();await waitReady();
  await setTime(t);
  const initial=await ok<{issuedAtMs:number;validUntilMs:number;windows:EarningsWindow[]}>('lease');
  assert.deepEqual(initial,{issuedAtMs:t,validUntilMs:t+GLOBAL_EVENT_LEASE_MS,windows:[]});
  assert.equal((await call('schedule',{id:'early',start:startAt-1})).status,400);
  const first=await ok<EarningsWindow>('schedule',{id:'launch-1',start:startAt});
  assert.deepEqual(first,{startsAtMs:startAt,endsAtMs:startAt+GLOBAL_EVENT_DURATION_MS});
  assert.ok(first.startsAtMs>=initial.validUntilMs,'a new event cannot start during an issued lease');
  assert.deepEqual(await ok('schedule',{id:'launch-1',start:startAt}),first,'lost schedule responses are retryable');
  assert.equal((await call('schedule',{id:'launch-1',start:startAt+1})).status,400,'request IDs are immutable');
  assert.equal((await call('schedule',{id:'overlap',start:startAt+1})).status,400);
  const adjacent=await ok<EarningsWindow>('schedule',{id:'adjacent',start:first.endsAtMs});
  assert.equal(adjacent.startsAtMs,first.endsAtMs,'adjacent half-open events do not overlap');
  await setTime(startAt-GLOBAL_EVENT_LEASE_MS);
  const boundary=await ok<{validUntilMs:number;windows:EarningsWindow[]}>('lease');
  assert.equal(boundary.validUntilMs,startAt);
  assert.deepEqual(boundary.windows,[],'a start at lease expiry is not in that lease');
  await setTime(startAt-GLOBAL_EVENT_LEASE_MS+1);
  const beforeStart=await ok<{windows:EarningsWindow[]}>('lease');
  assert.deepEqual(beforeStart.windows,[first],'a future start inside the lease is returned');

  await setTime(t,'concurrent');
  const race=await Promise.all(Array.from({length:16},(_,i)=>call('schedule',{id:`race-${i}`,start:startAt},'concurrent')));
  assert.equal(race.filter(result=>result.status===200).length,1,'only one simultaneous overlapping schedule commits');
  await setTime(t,'lease-race');
  const [leaseRace,scheduledRace]=await Promise.all([call('lease',{},'lease-race'),call('schedule',{id:'after-lease',start:startAt},'lease-race')]);
  assert.equal(leaseRace.status,200);assert.equal(scheduledRace.status,200);
  assert.ok(scheduledRace.body.startsAtMs>=leaseRace.body.validUntilMs||leaseRace.body.windows.some((window:EarningsWindow)=>window.startsAtMs===startAt));
  await setTime(t,'bench');
  const benchStart=performance.now();
  const leases=await Promise.all(Array.from({length:100},()=>call('lease',{},'bench')));
  const benchMs=performance.now()-benchStart;
  assert.ok(leases.every(result=>result.status===200));
  console.log(`LOCAL ONLY: 100 concurrent lease RPCs through one Wrangler object completed in ${benchMs.toFixed(0)} ms (includes HTTP and SQLite).`);

  const afterBoth=adjacent.endsAtMs+1;
  await setTime(afterBoth);
  const lateLease=await ok<{issuedAtMs:number;validUntilMs:number;windows:EarningsWindow[]}>('lease');
  assert.deepEqual(lateLease.windows,[]);
  assert.throws(()=>globalWindowsForInstant(lateLease,first.endsAtMs-1),/does not cover/,'a late reply cannot replace history for an earlier payout');
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:first.endsAtMs-1,to:first.endsAtMs})).windows,[first]);
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:startAt-1,to:startAt})).windows,[]);
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:startAt,to:startAt+1})).windows,[first]);
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:first.endsAtMs,to:first.endsAtMs+1})).windows,[adjacent]);
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:startAt,to:startAt})).windows,[]);
  assert.equal((await call('history',{from:startAt,to:afterBoth+1})).status,400,'future history cannot be treated as immutable');
  assert.equal((await call('schedule',{id:'retroactive',start:startAt})).status,400);
  assert.deepEqual(await ok('schedule',{id:'launch-1',start:startAt}),first,'idempotent retry remains valid after start');
  await setTime(t);
  assert.equal((await call('lease')).status,400,'a backwards clock fails closed');
  await setTime(afterBoth);

  await setTime(t,'paged');
  const batch=await ok<{status:string}[]>('batch',{start:startAt,count:101},'paged');
  assert.equal(batch.filter(item=>item.status==='fulfilled').length,101);
  const historyEnd=startAt+101*GLOBAL_EVENT_DURATION_MS;
  await setTime(historyEnd,'paged');
  const page1=await ok<{windows:EarningsWindow[];next:number|null}>('history',{from:t,to:historyEnd},'paged');
  assert.equal(page1.windows.length,100);assert.equal(page1.next,page1.windows[99].startsAtMs);
  const page2=await ok<{windows:EarningsWindow[];next:number|null}>('history',{from:t,to:historyEnd,cursor:page1.next},'paged');
  assert.equal(page2.windows.length,1);assert.equal(page2.next,null);

  await stop(child);child=undefined;
  child=start();await waitReady();
  await setTime(afterBoth);
  assert.deepEqual((await ok<{windows:EarningsWindow[]}>('history',{from:startAt,to:afterBoth})).windows,[first,adjacent],'schedule survives Wrangler restart');
  await setTime(t);
  assert.equal((await call('lease')).status,400,'the observed clock watermark survives restart');
  await setTime(historyEnd,'paged');
  const persisted=await ok<{windows:EarningsWindow[];next:number|null}>('history',{from:t,to:historyEnd,cursor:page1.next},'paged');
  assert.deepEqual(persisted,page2,'later pages survive restart');
  console.log('PASS: internal event scheduling, leases, concurrent overlap fencing, boundaries, paginated history and Wrangler restart.');
}finally{
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

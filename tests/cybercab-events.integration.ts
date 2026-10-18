// Local Wrangler integration of durable cab intervals with complete event history.
// pnpm exec tsx tests/cybercab-events.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { CabIncomeStage } from '../worker/room-economy';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(50);}throw new Error(`Timed out: ${label}`);
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
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-events-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-cab-events-test',main:resolve('tests/fixtures/cybercab-events-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','RoomEconomy','DriverProfile','GlobalIncome','GlobalEarningsEvent']}]}));
let child:ChildProcess|undefined,logs='';
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',60_000);}
async function rpc<T>(op:string,fields:Record<string,unknown>={},timeout=5000):Promise<T>{
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,...fields}),signal:AbortSignal.timeout(timeout)});
  const body=await response.text();if(!response.ok)throw new Error(`${op}: ${response.status} ${body}\n${logs}`);return JSON.parse(body) as T;
}
type RecordState={revision:number;sequence:number;progress:DriverProgress};
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}

try{
  child=start();await ready();
  const room=`cab-events-${randomUUID().slice(0,8)}`,driverId=randomUUID(),fence=randomUUID();
  const common={room,driverId};
  // 101 contiguous 30-minute events force two global history pages. The room
  // win straddles the first global start: room-only, combined, global-only,
  // and unboosted portions all occur within this staged batch.
  const duration=1_800_000,first=Date.now()-103*duration-1_000_000,last=first+101*duration;
  const startMs=first-600_001,endMs=last+241;
  await rpc('seed-global',{at:first,count:101});
  await rpc('room-win',{room,at:first-300_000});
  await rpc('producer',{room,active:true});
  await rpc('acquire',{...common,fence});
  const buy:EconomyIntent={eventId:randomUUID(),driverId,fence,roomId:room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
  const bought=await rpc<DriverOutcome>('buy',{...common,intent:buy});success(bought);
  assert.equal(bought.progress.eligibleIncome,5_000);
  await until(async()=>await rpc<number>('total')===5_000,'initial income outbox');

  const stage:CabIncomeStage={eventId:randomUUID(),driverId,fence,roomId:room,sequence:2,intervals:[
    {assetId:'cab-a',startMs,endMs:last},{assetId:'cab-a',startMs:last,endMs},
  ]};
  const intent:EconomyIntent={eventId:stage.eventId,driverId,fence,roomId:room,revision:1,sequence:2,action:{kind:'cab-income',intervals:stage.intervals}};
  assert.equal(await rpc('stage',{...common,stage}),'accepted');
  await rpc('global-fault',{enabled:true});
  assert.equal(await rpc('submit',{...common,intent}),null,'failed later history page does not pay');
  assert.ok((await rpc<{calls:number;failures:number}>('global-stats')).failures>=1,'the second page was reached');
  const failed=await rpc<RecordState>('profile',common),pending=await rpc<{cabEvents?:unknown;outcome:unknown}>('record',{...common,eventId:stage.eventId});
  assert.equal(failed.progress.cash,bought.progress.cash);assert.equal(failed.progress.eligibleIncome,5_000);
  assert.equal(failed.progress.cybercabs!.assets[0].gross,0);assert.equal(failed.sequence,1);
  assert.equal(pending.outcome,null);assert.equal(pending.cabEvents,undefined,'partial history is not persisted as complete');
  await pause(600);assert.equal(await rpc<number>('total'),5_000,'no partial payout reaches the global outbox');

  // After all pages succeed, crash after the profile transaction but before
  // its room receives the reply. The durable receipt and resolved windows
  // must reconcile on restart without paying the interval or milestone twice.
  await rpc('arm',common);await rpc('income-block',{blocked:true});await rpc('global-fault',{enabled:false});
  const submitting=rpc('submit',{...common,intent},30_000);void submitting.catch(()=>{});
  await until(()=>rpc<boolean>('held',common),'committed profile reply held');
  const afterCommit=await rpc<RecordState>('profile',common);
  const journal=await rpc<{outcome:unknown;cabEvents:{room:unknown[];global:unknown[]}}>('record',{...common,eventId:stage.eventId});
  assert.equal(journal.outcome,null);assert.equal(journal.cabEvents.room.length,1);assert.equal(journal.cabEvents.global.length,101);
  assert.ok((await rpc<string[]>('keys',common)).includes(`pending:${driverId}:${stage.eventId}`));
  const weighted=2n*300_001n+3n*300_000n+6n*300_000n+4n*BigInt(101*duration-300_000)+2n*241n;
  const numerator=15_000n*weighted,gross=Number(numerator/7_200_000n),remainder=Number(numerator%7_200_000n);
  assert.deepEqual([afterCommit.progress.cybercabs!.assets[0].gross,afterCommit.progress.cybercabs!.assets[0].remainder,
    afterCommit.progress.cybercabs!.assets[0].lastEndMs,afterCommit.progress.cybercabs!.assets[0].revenueAwarded],
    [gross,remainder,endMs,true]);
  assert.equal(afterCommit.progress.cash,bought.progress.cash+gross+2_000);
  assert.equal(afterCommit.progress.eligibleIncome,5_000+gross+2_000);
  await until(async()=>await rpc<number>('income-failures')>0,'income outbox failure');
  assert.equal(await rpc<number>('total'),5_000,'failed outbox remains pending');
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>!(await rpc<string[]>('keys',common)).includes(`pending:${driverId}:${stage.eventId}`),'lost reply recovery');
  await until(async()=>!(await rpc<string[]>('keys',common)).some(key=>
    key===`intent:${stage.eventId}`||['pending:','unacked:','cleanup:','cab-stage:'].some(prefix=>key.startsWith(`${prefix}${driverId}:`))),
  'recovered journal cleanup');
  await until(async()=>await rpc<number>('total')===5_000+gross+2_000,'recovered global outbox');
  const recovered=await rpc<RecordState>('profile',common);
  assert.equal(recovered.progress.cash,afterCommit.progress.cash);
  assert.equal(recovered.progress.eligibleIncome,afterCommit.progress.eligibleIncome);
  assert.deepEqual(recovered.progress.cybercabs,afterCommit.progress.cybercabs);
  await pause(1_200);
  assert.equal((await rpc<RecordState>('profile',common)).progress.cash,afterCommit.progress.cash);
  assert.equal(await rpc<number>('total'),5_000+gross+2_000,'retry does not double-credit global income');
  console.log('PASS: complete global history, room/global bonuses, exact remainder, milestone, lost reply and income outbox recovery.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

// Isolated local Wrangler fixture; no deployed state is accessed.
// pnpm exec tsx tests/cybercab-wallet.integration.ts
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-wallet-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-cab-wallet-test',main:resolve('tests/fixtures/cybercab-wallet-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let child:ChildProcess|undefined,logs='';
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-20_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
async function get<T>(path:string):Promise<T>{const response=await fetch(base+path,{signal:AbortSignal.timeout(2000)});assert.ok(response.ok,`${path}: ${response.status}`);return response.json() as Promise<T>;}
async function post<T>(path:string,body:object):Promise<T>{const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}\n${logs}`);return response.json() as Promise<T>;}
type Read={record:{revision:number;sequence:number;progress:DriverProgress};pending:number|null};
const session={driverId:'cab-profile',fence:'cab-fence',roomId:'cab-room'};
const legacy={driverId:'other-legacy',fence:'other-fence',roomId:'cab-room'};
function intent(eventId:string,revision:number,sequence:number,action:EconomyIntent['action']):EconomyIntent{return {...session,eventId,revision,sequence,action};}
const commit=(item:EconomyIntent)=>post<DriverOutcome>('/commit',{...session,intent:item});
function success(outcome:DriverOutcome):asserts outcome is Extract<DriverOutcome,{ok:true}>{assert.ok(outcome.ok,JSON.stringify(outcome));}

try{
  child=start();await ready();await post('/seed',session);
  const seeded=await post<Read>('/read',session);assert.equal(seeded.record.progress.cybercabs,undefined);
  const acquired=await post<{progress:DriverProgress;resumed:boolean}>('/acquire',session);
  assert.equal(acquired.resumed,true);assert.deepEqual(acquired.progress.cybercabs,{assets:[],claimedOwnershipAwards:[]});
  assert.deepEqual((await post<Read>('/read',session)).record.progress.cybercabs,acquired.progress.cybercabs);

  const buy=intent('buy-1',0,1,{kind:'cab-buy',assetId:'cab-1'}),bought=await commit(buy);success(bought);
  assert.equal(bought.progress.cash,5_000);assert.equal(bought.progress.eligibleIncome,5_000);
  assert.equal(bought.progress.cybercabs!.assets.length,1);
  assert.deepEqual(await commit(buy),bought,'a lost purchase response replays its original receipt');
  assert.deepEqual(await commit({...buy,action:{kind:'cab-buy',assetId:'different'}}),{ok:false,reason:'conflict'});

  const stale=structuredClone(bought.progress);stale.cybercabs={assets:[],claimedOwnershipAwards:[]};
  const checkpoint=await commit(intent('checkpoint',1,2,{kind:'progress',progress:stale}));success(checkpoint);
  assert.deepEqual(checkpoint.progress.cybercabs,bought.progress.cybercabs,'a stale room checkpoint cannot erase the fleet');

  const earning=intent('income-1',2,3,{kind:'cab-income',intervals:[{assetId:'cab-1',startMs:0,endMs:4_800_000}]});
  const paid=await commit(earning);success(paid);
  assert.equal(paid.progress.cash,28_000);assert.equal(paid.progress.eligibleIncome,28_000);
  assert.deepEqual(paid.awards,['region-oakland']);
  assert.deepEqual(paid.progress.cybercabs!.assets.map(a=>[a.gross,a.remainder,a.lastEndMs,a.revenueAwarded]),[[20_000,0,4_800_000,true]]);
  assert.deepEqual(await commit(earning),paid);
  assert.deepEqual(await commit(intent('overlap',3,4,{kind:'cab-income',intervals:[{assetId:'cab-1',startMs:0,endMs:4_800_000}]})),{ok:false,reason:'invalid'});
  const next=intent('income-2',3,5,{kind:'cab-income',intervals:[{assetId:'cab-1',startMs:4_800_000,endMs:4_800_240}]});
  const paidAgain=await commit(next);success(paidAgain);assert.equal(paidAgain.progress.cash,28_001);assert.equal(paidAgain.progress.eligibleIncome,28_001);
  const paint=intent('paint-1',4,6,{kind:'cab-paint',assetId:'cab-1',paint:'ember'});
  const painted=await commit(paint);success(painted);
  assert.equal(painted.progress.cash,27_983);assert.equal(painted.progress.eligibleIncome,28_001);
  assert.deepEqual(painted.progress.cybercabs!.assets[0],{...paidAgain.progress.cybercabs!.assets[0],style:{paint:'ember',decal:'none'}});
  assert.deepEqual(await commit(paint),painted,'replaying a paint receipt does not charge again');
  assert.deepEqual(await commit({...paint,action:{kind:'cab-paint',assetId:'cab-1',paint:'mint'}}),{ok:false,reason:'conflict'});
  assert.deepEqual(await commit(intent('bad-paint',5,7,{kind:'cab-paint',assetId:'cab-1',paint:'unknown' as 'ember'})),{ok:false,reason:'invalid'});
  await until(async()=>(await get<{total:number}>('/income')).total===28_001,'cab income delivered to global outbox');

  await stop(child);child=undefined;child=start();await ready();
  assert.deepEqual(await commit(earning),paid,'the receipt survives worker restart');
  assert.deepEqual(await commit(next),paidAgain,'the latest income receipt survives worker restart');
  assert.deepEqual(await commit(paint),painted,'the paint receipt survives worker restart');
  const restored=await post<Read>('/read',session);
  assert.equal(restored.record.progress.cash,27_983);assert.equal(restored.record.progress.eligibleIncome,28_001);
  assert.equal(restored.record.progress.cybercabs!.assets[0].lastEndMs,4_800_240);
  assert.equal(restored.record.progress.cybercabs!.assets[0].style.paint,'ember');
  assert.equal((await get<{total:number}>('/income')).total,28_001,'replay does not duplicate global income');

  await post('/seed',legacy);
  const old=(await post<Read>('/read',legacy)).record.progress;
  const foreignPaint=await post<DriverOutcome>('/commit',{...legacy,intent:{...legacy,eventId:'foreign-paint',revision:0,sequence:1,action:{kind:'cab-paint',assetId:'cab-1',paint:'mint'}}});
  assert.deepEqual(foreignPaint,{ok:false,reason:'invalid'},'another wallet cannot paint this owner’s cab');
  assert.deepEqual((await post<Read>('/read',session)).record.progress.cybercabs,restored.record.progress.cybercabs);
  const legacyCommit=await post<DriverOutcome>('/commit',{...legacy,intent:{...legacy,eventId:'legacy-commit',revision:0,sequence:2,action:{kind:'progress',progress:old}}});
  success(legacyCommit);assert.deepEqual(legacyCommit.progress.cybercabs,{assets:[],claimedOwnershipAwards:[]},'commit normalizes an old profile without reacquisition');
  console.log('PASS: cab profile normalization, atomic settlement and paint, ownership, durable receipts, and global income.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

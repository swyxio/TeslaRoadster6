// Isolated Wrangler using a test-only Worker and persisted local SQLite storage.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IncomeCredit, IncomeKind, IncomeState } from '../worker/income-journal';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=25_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await delay(25);}
  throw new Error(`Timed out: ${label}`);
}
async function port(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid!,'SIGKILL');}catch{}}
}
type Wallet = {balance:number;updates:number;driver:{cash:number;revision:number}|null;journal:IncomeState|null;alarm:number|null};
type Global = {total:number;personal:number};
type Relay = {before:number;after:number;hold:boolean;calls:number;held:boolean};
type CreditResult = {applied:boolean;sourceSequence:number;state:IncomeState};
const dir=await mkdtemp(join(tmpdir(),'tesland-income-journal-'));
const p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-income-journal-test',
  main:resolve('tests/fixtures/income-wallet-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'WALLETS',class_name:'IncomeWallet'},{name:'RELAY',class_name:'FaultRelay'},{name:'STARSHIP',class_name:'Starship'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['IncomeWallet','FaultRelay','Starship']}]}));
let child:ChildProcess|undefined;
function start(){
  const processChild=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  processChild.stdout?.resume();processChild.stderr?.resume();return processChild;
}
async function ready(){await until(async()=>{
  if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');
  try{return (await fetch(`${base}/health`,{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
},'Wrangler startup');}
async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(base+path,body===undefined?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return await response.json() as T;
}
const url=(path:string,driver:string)=>`${path}?driver=${encodeURIComponent(driver)}`;
const wallet=(driver:string)=>request<Wallet>(url('/wallet',driver));
const global=(driver:string)=>request<Global>(url('/global',driver));
const relay=()=>request<Relay>('/relay/status');
const configure=(change:Partial<Relay>)=>request('/relay/config',change);
const drain=(driver:string)=>request<{attempted:boolean;ok:boolean}>(url('/drain',driver),{});
function input(driverId:string,sourceId:string,amount:number,kind:IncomeKind='delivery'):IncomeCredit {
  return {driverId,sourceId,amount,kind,name:driverId.startsWith('guest')?'Guest Driver':'Saved Driver'};
}
const credit=(value:IncomeCredit)=>request<CreditResult>(url('/credit',value.driverId),value);
async function settled(driver:string){await until(async()=>{
  const state=(await wallet(driver)).journal;
  return !!state&&state.acknowledgedSequence===state.sequence;
},`reconciliation of ${driver}`);}

const rolledBack=`saved-${randomUUID()}`,saved=`saved-${randomUUID()}`,guest=`guest-${randomUUID()}`;
const concurrent=`saved-${randomUUID()}`,many=`saved-${randomUUID()}`,lost=`saved-${randomUUID()}`;
const beforeSend=`saved-${randomUUID()}`,outage=`guest-${randomUUID()}`;
const earlierAlarm=`saved-${randomUUID()}`,laterAlarm=`saved-${randomUUID()}`;
try{
  child=start();await ready();
  const bad=input(rolledBack,'award:rollback',40,'achievement');
  const failed=await fetch(`${base}${url('/credit',rolledBack)}&fail=1`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(bad)});
  assert.equal(failed.status,400);
  assert.match(await failed.text(),/Injected failure/);
  assert.deepEqual(await wallet(rolledBack),{balance:0,updates:0,driver:null,journal:null,alarm:null},'receipt, alarm, SQL and KV wallet all roll back');
  await stop(child);child=start();await ready();
  assert.deepEqual(await wallet(rolledBack),{balance:0,updates:0,driver:null,journal:null,alarm:null},'rollback survives restart');

  const first=input(saved,'order:0:delivery',120);
  const attempts=await Promise.all(Array.from({length:20},()=>credit(first)));
  assert.equal(attempts.filter(result=>result.applied).length,1,'concurrent source retry mutates the wallet once');
  assert.equal((await wallet(saved)).balance,120);
  assert.equal((await wallet(saved)).updates,1);
  assert.deepEqual((await wallet(saved)).driver,{cash:120,revision:1},'saved-driver KV and SQL wallet advance together');
  const conflicting=await fetch(`${base}${url('/credit',saved)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...first,amount:121})});
  assert.equal(conflicting.status,400);assert.match(await conflicting.text(),/Conflicting income source/);
  const excluded=await fetch(`${base}${url('/credit',saved)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...first,sourceId:'gift:1',kind:'gift'})});
  assert.equal(excluded.status,400,'transfers and gifts cannot be recorded as income kinds');
  await credit(input(guest,'order:0:delivery',70));
  await credit(input(saved,'achievement:research',30,'achievement'));
  await drain(saved);await drain(guest);await settled(saved);await settled(guest);
  assert.equal((await global(saved)).personal,150);
  assert.equal((await global(guest)).personal,70,'guest source IDs are scoped to their opaque identity');

  await configure({hold:true});
  await credit(input(concurrent,'order:1:pickup',5,'pickup'));
  const pending=drain(concurrent);
  await until(async()=>(await relay()).held,'in-flight reconciliation');
  await credit(input(concurrent,'achievement:first',7,'achievement'));
  await request('/relay/release',{});
  assert.deepEqual(await pending,{attempted:true,ok:true});
  const during=await wallet(concurrent);
  assert.equal(during.journal!.sequence,2);
  assert.equal(during.journal!.acknowledgedSequence,1,'in-flight acknowledgement cannot clear a newer credit');
  assert.equal(during.journal!.acknowledgedTotal,5);
  assert.ok(during.alarm!==null,'newer credit still has durable retry work');
  await drain(concurrent);await settled(concurrent);
  assert.equal((await global(concurrent)).personal,12);

  const distinct=await Promise.all(Array.from({length:24},(_,index)=>credit(input(many,`order:${index}:delivery`,index+1))));
  assert.equal(distinct.filter(result=>result.applied).length,24);
  assert.deepEqual(distinct.map(result=>result.sourceSequence).sort((a,b)=>a-b),Array.from({length:24},(_,index)=>index+1));
  assert.equal((await wallet(many)).balance,300,'concurrent distinct credits are never lost');
  await drain(many);await settled(many);
  assert.equal((await global(many)).personal,300);

  await request(url('/external',earlierAlarm),{delay:600});
  const early=await request<{due:number;alarm:number}>(url('/external',earlierAlarm));
  await credit(input(earlierAlarm,'order:early',3));
  const stillEarly=await request<{due:number;alarm:number}>(url('/external',earlierAlarm));
  assert.equal(stillEarly.alarm,early.alarm,'journal never postpones an earlier unrelated alarm');
  await until(async()=>(await request<{fired:number}>(url('/external',earlierAlarm))).fired===1,'earlier unrelated job');
  await settled(earlierAlarm);

  await request(url('/external',laterAlarm),{delay:1_700});
  await credit(input(laterAlarm,'order:later',4));
  const later=await request<{due:number;alarm:number}>(url('/external',laterAlarm));
  assert.ok(later.alarm<later.due,'journal brings the shared alarm forward');
  await until(async()=>(await request<{fired:number}>(url('/external',laterAlarm))).fired===1,'later unrelated job is rearmed');
  await settled(laterAlarm);

  await configure({before:99});
  await credit(input(beforeSend,'checkpoint:1',55,'checkpoint'));
  assert.equal((await wallet(beforeSend)).journal!.acknowledgedSequence,0);
  assert.ok((await wallet(beforeSend)).alarm!==null,'pending credit has a durable alarm before sending');
  await stop(child);child=start();await ready();
  await configure({before:0});
  await settled(beforeSend);
  assert.equal((await global(beforeSend)).personal,55,'pending wallet credit is delivered after restart');

  await configure({after:1});
  await credit(input(lost,'cab:1:interval:0',100,'cab'));
  assert.deepEqual(await drain(lost),{attempted:true,ok:false},'lost global response leaves the outbox pending');
  assert.equal((await global(lost)).personal,100,'global commit happened before the response was lost');
  assert.equal((await wallet(lost)).journal!.acknowledgedSequence,0);
  await stop(child);child=start();await ready();
  await settled(lost);
  assert.equal((await global(lost)).personal,100,'replay after restart does not double count');
  assert.equal((await wallet(lost)).balance,100);

  const callsBefore=(await relay()).calls;
  await configure({before:9});
  await credit(input(outage,'activity:race-1',25,'activity'));
  await until(async()=>(await relay()).calls>=callsBefore+10,'more than six automatic alarm failures and recovery',30_000);
  await settled(outage);
  assert.equal((await global(outage)).personal,25,'watchdog continues beyond the platform retry limit');
  assert.equal((await wallet(outage)).updates,1);

  const expected=(await Promise.all([saved,guest,concurrent,many,earlierAlarm,laterAlarm,beforeSend,lost,outage].map(wallet))).reduce((sum,item)=>sum+item.journal!.total,0);
  assert.equal((await global(saved)).total,expected,'global total equals committed eligible wallet receipts');
  console.log('PASS: atomic rollback, saved/guest IDs, concurrent credits, in-flight newer credits, shared alarm dispatch, pending and lost replies across restart, and nine failed alarm attempts.');
}finally{
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

// Verify the durable outbox watchdog across a Worker termination while its
// GlobalIncome RPC is held. The fault hooks exist only in this local fixture.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome } from '../worker/driver-profile';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw new Error(`Timed out: ${label}`);}
async function port(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;try{process.kill(-child.pid!,'SIGKILL');}catch{}await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler shutdown');}
const dir=await mkdtemp(join(tmpdir(),'tesland-income-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-income-watchdog-test',main:resolve('tests/fixtures/income-watchdog-worker.ts'),compatibility_date:'2026-10-17',durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},{name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'}]},migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome']}]}));
let child:ChildProcess|undefined;
function start(){const process=spawn(globalThis.process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:globalThis.process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...globalThis.process.env,CI:'true',BROWSER:'none'}});process.stdout?.resume();process.stderr?.resume();return process;}
async function get<T>(path:string):Promise<T>{const response=await fetch(base+path,{signal:AbortSignal.timeout(1000)});assert.ok(response.ok,`${path}: ${response.status}`);return response.json() as Promise<T>;}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');try{await get('/income');return true;}catch{return false;}},'Wrangler startup');}
try{
  child=start();await ready();await get('/hold');await get('/start');
  await until(async()=>(await get<{held:boolean}>('/income')).held,'income RPC held');
  const before=await get<{pending:number|null;alarm:number|null}>('/profile');
  assert.equal(before.pending,12345,'undelivered income remains in the outbox');
  assert.ok(before.alarm!==null&&before.alarm>Date.now(),'a durable alarm is armed before the awaited income RPC');
  assert.equal((await get<{total:number}>('/income')).total,0);
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>(await get<{total:number}>('/income')).total===12345,'watchdog retries after restart');
  await until(async()=>(await get<{pending:number|null}>('/profile')).pending===null,'delivered outbox is cleared');
  await delay(1200);
  assert.equal((await get<{total:number}>('/income')).total,12345,'extra wakeup does not duplicate income');
  const purchase=await get<DriverOutcome>('/purchase');
  assert.ok(purchase.ok);
  assert.equal(purchase.progress.eligibleIncome,45_000,'first-purchase and Ducati awards are eligible income');
  assert.equal(purchase.progress.cash,545_000,'awards and purchase debit are committed together');
  assert.deepEqual(purchase.awards,['luxury-first','luxury-panigale']);
  assert.deepEqual(await get('/purchase'),purchase,'the same purchase returns its durable receipt on replay');
  await until(async()=>(await get<{total:number}>('/income')).total===57_345,'purchase awards reach the global income ledger');
  assert.deepEqual(await get('/purchase'),purchase,'later retries retain the original result');
  await delay(1200);
  assert.equal((await get<{total:number}>('/income')).total,57_345,'purchase replay does not duplicate global earnings');
  console.log('PASS: income watchdog survives termination; luxury awards and replay credit eligible and global income exactly once.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

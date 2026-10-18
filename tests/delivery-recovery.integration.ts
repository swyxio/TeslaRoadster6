// Expected to fail until qualifying physical stops are durably replayed.
// pnpm exec tsx tests/delivery-recovery.integration.ts
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { Order } from '../shared/delivery';

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await wait(50);}throw new Error(`Timed out: ${label}`);
}
async function port(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
type Result={initial:DriverProgress;speculative:Order;draft:{delivery:{completed:number}};saved:DriverProgress;writes:EconomyIntent[];expectedFare:number};
const dir=await mkdtemp(join(tmpdir(),'tesland-delivery-recovery-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-delivery-recovery-test',main:resolve('tests/fixtures/delivery-recovery-worker.ts'),compatibility_date:'2026-10-17'}));
let child:ChildProcess|undefined,logs='';
try{
  child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
  let committed:Result|undefined;
  await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);let response:Response;
    try{response=await fetch(base,{signal:AbortSignal.timeout(2_000)});}catch{return false;}
    if(!response.ok)throw new Error(`${await response.text()}\n${logs}`);committed=await response.json() as Result;return true;},'fixture startup',60_000);
  assert.ok(committed);assert.notEqual(committed.speculative.customer,committed.initial.order.customer);
  assert.equal(committed.draft.delivery.completed,0,'the speculative target is different when the original target is visited');
  const response=await fetch(base+'/speculative',{signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error(`${await response.text()}\n${logs}`);
  const speculative=await response.json() as Result;
  assert.equal(speculative.draft.delivery.completed,1,'the speculative target was actually visited');
  assert.equal(speculative.saved.completed,0,'a visit that does not match the restored order is a no-op');
  assert.equal(speculative.saved.cash,speculative.initial.cash);
  assert.equal(committed.saved.completed,1,'a physical visit to the restored target must survive the rejected predecessor');
  assert.equal(committed.saved.earned,committed.expectedFare,'fare uses 40 + 5.05 active seconds and the rate at the visit');
  assert.equal(committed.saved.cash,committed.initial.cash+committed.expectedFare+2_500,'the rejected contribution is not resurrected');
  console.log('PASS: rejected predecessor preserves only matching physical arrivals and their event-time fare.');
}finally{
  if(child&&child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid!,'SIGKILL');}catch{}await until(()=>child!.exitCode!==null||child!.signalCode!==null,'Wrangler shutdown');}
  await rm(dir,{recursive:true,force:true});
}

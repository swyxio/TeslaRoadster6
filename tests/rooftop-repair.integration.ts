// Local regression: recovered and switched vehicles persist a safe rooftop reroute.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CUSTOMERS, type Order } from '../shared/delivery';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-roof-repair-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-roof-repair-test',main:resolve('tests/fixtures/cybercab-reroute-worker.ts'),compatibility_date:'2026-10-17'}));
let child:ChildProcess|undefined,logs='';
try{
  child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
  for(const mode of ['restore','switch']){
    let result:{initial:DriverProgress;saved:DriverProgress;writes:EconomyIntent[];visible:Order}|undefined;
    await until(async()=>{
      if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
      let response:Response;try{response=await fetch(`${base}/roof-${mode}`,{signal:AbortSignal.timeout(2000)});}catch{return false;}
      if(!response.ok)throw new Error(`roof ${mode} fixture failed: ${await response.text()}\n${logs}`);
      result=await response.json() as typeof result;return true;
    },`roof ${mode} fixture`,60_000);
    assert.ok(result);assert.deepEqual(result.writes.map(write=>write.action.kind),['progress']);
    assert.equal(CUSTOMERS[result.saved.order.customer].rooftop,false);
    assert.equal(result.saved.order.stage,'dropoff');assert.equal(result.saved.order.elapsed,37);
    assert.ok(result.saved.order.base<=result.initial.order.base);
    assert.equal(result.saved.completed,result.initial.completed);assert.equal(result.saved.cash,result.initial.cash);
    assert.deepEqual(result.visible,result.saved.order);
  }
  for(const mode of ['ticket','replay','locked']){
    const response=await fetch(`${base}/roof-foot-${mode}`,{signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw new Error(`on-foot ${mode} fixture failed: ${await response.text()}\n${logs}`);
    const result=await response.json() as {initial:DriverProgress;saved:DriverProgress;writes:EconomyIntent[];visible:Order};
    const ticket=result.writes.find(write=>write.action.kind==='ticket');
    assert.ok(ticket&&ticket.action.kind==='ticket');assert.equal(ticket.action.evidence.onFoot,true);
    assert.equal(result.saved.tickets,1);assert.equal(result.saved.cash,result.initial.cash-60);
    assert.equal(result.saved.order.stage,'dropoff');assert.equal(result.saved.order.elapsed,37);
    if(mode==='locked')assert.equal(CUSTOMERS[result.saved.order.customer].rooftop,false);
    else assert.equal(result.saved.order.customer,result.initial.order.customer);
    assert.deepEqual(result.visible,result.saved.order);
  }
  console.log('PASS: rooftop repairs persist after restore and vehicle switch; on-foot tickets preserve accessible roofs, including replay, and reroute locked regions.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

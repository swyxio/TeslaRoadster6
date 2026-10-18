// Local regression: delayed cab income must not cause an incorrect reroute.
// pnpm exec tsx tests/cybercab-reroute.integration.ts
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { Order } from '../shared/delivery';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-reroute-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-cab-reroute-test',main:resolve('tests/fixtures/cybercab-reroute-worker.ts'),compatibility_date:'2026-10-17'}));
let child:ChildProcess|undefined,logs='';
try{
  child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
  let result:{original:Order;persisted:DriverProgress;writes:EconomyIntent[];messages:{type:string;requestId:number;ok:boolean}[]}|undefined;
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
    let response:Response;
    try{response=await fetch(base,{signal:AbortSignal.timeout(2000)});}catch{return false;}
    if(!response.ok)throw new Error(`Fixture failed: ${await response.text()}\n${logs}`);
    result=await response.json() as typeof result;return true;
  },'fixture response',60_000);
  assert.ok(result);assert.equal(result.writes[0].action.kind,'cab-income');
  const reply=result.messages.find(message=>message.type==='marsResult'&&message.requestId===1);
  assert.ok(reply,'spend receives a response');
  assert.equal(result.persisted.cash,reply.ok?28_000:48_000,'the cab income and optional spend settle exactly once');
  assert.equal(result.persisted.level,1,'the final balance still permits Oakland');
  assert.deepEqual(result.persisted.order,result.original,'a delayed cab credit must not reroute an Oakland delivery when the resulting balance still permits it');
  const historyResponse=await fetch(`${base}/spend-history`,{signal:AbortSignal.timeout(5000)});
  if(!historyResponse.ok)throw new Error(`history spend fixture failed: ${await historyResponse.text()}\n${logs}`);
  const beforeCredit=await historyResponse.json() as typeof result;
  assert.deepEqual(beforeCredit.writes.map(write=>write.action.kind),['contribute','cab-income']);
  assert.equal(beforeCredit.persisted.cash,28_000);
  assert.notEqual(beforeCredit.persisted.order.customer,beforeCredit.original.customer,'spend at the available pre-credit balance reroutes the inaccessible order');
  for(const mode of ['history','profile']){
    const response=await fetch(`${base}/${mode}`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`${mode} fixture failed: ${await response.text()}\n${logs}`);
    const {saved,stages}=await response.json() as {saved:DriverProgress;stages:number[]};
    assert.deepEqual(stages,[1,2],`${mode}: later observed work is staged while the earlier operation is held`);
    assert.equal(saved.tickets,1,`${mode}: physical police stop retains its fine`);
    assert.equal(saved.completed,1,`${mode}: transient delivery arrival settles`);
    assert.ok(saved.unlocked.includes('deliveries-1'),`${mode}: delivery achievement settles`);
    assert.ok(saved.unlocked.includes('roof-rider'),`${mode}: transient roof landing settles`);
    assert.equal(saved.cybercabs!.assets[0].gross,2,`${mode}: both cab credits settle once`);
  }
  const rejectedResponse=await fetch(`${base}/rejected`,{signal:AbortSignal.timeout(5000)});
  if(!rejectedResponse.ok)throw new Error(`rejected fixture failed: ${await rejectedResponse.text()}\n${logs}`);
  const rejected=await rejectedResponse.json() as {saved:DriverProgress;writes:EconomyIntent[];barrier:number};
  assert.deepEqual(rejected.writes.map(write=>write.action.kind),['progress','cab-income','progress','cab-income']);
  assert.ok(rejected.writes.every((write,i)=>i===0||write.sequence>rejected.writes[i-1].sequence));
  assert.equal(rejected.saved.cash,26_102,'rejected spending is removed while both staged credits and the award survive');
  assert.equal(rejected.saved.cybercabs!.assets[0].gross,2);
  assert.ok(rejected.saved.unlocked.includes('park-it'));
  assert.equal(rejected.barrier,77);
  const pressureResponse=await fetch(`${base}/backpressure`,{signal:AbortSignal.timeout(5000)});
  if(!pressureResponse.ok)throw new Error(`backpressure fixture failed: ${await pressureResponse.text()}\n${logs}`);
  const pressure=await pressureResponse.json() as {closes:number;failed:boolean;open:number;stages:{sequence:number;intervals:{startMs:number;endMs:number}[]}[]};
  assert.equal(pressure.closes,1);assert.equal(pressure.failed,true);assert.equal(pressure.open,0);
  assert.equal(pressure.stages.length,33,'accrual stops at the bounded backlog, even if close throws');
  assert.deepEqual(pressure.stages.at(-1)!.intervals,[{assetId:'cab-a',startMs:1_000,endMs:1_100}],
    'the final already-observed tail is staged before accrual stops');
  console.log('PASS: delayed cab settlement preserves an eligible delivery and transient game evidence.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

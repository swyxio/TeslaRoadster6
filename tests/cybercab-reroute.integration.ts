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
  assert.equal(result.persisted.cash,reply.ok?29_000:49_000,'the cab income, region award, and optional spend settle exactly once');
  assert.ok(result.persisted.unlocked.includes('region-oakland'));
  assert.equal(result.persisted.level,1,'the final balance still permits Oakland');
  assert.deepEqual(result.persisted.order,result.original,'a delayed cab credit must not reroute an Oakland delivery when the resulting balance still permits it');
  const historyResponse=await fetch(`${base}/spend-history`,{signal:AbortSignal.timeout(5000)});
  if(!historyResponse.ok)throw new Error(`history spend fixture failed: ${await historyResponse.text()}\n${logs}`);
  const beforeCredit=await historyResponse.json() as typeof result;
  assert.deepEqual(beforeCredit.writes.map(write=>write.action.kind),['contribute','cab-income']);
  assert.equal(beforeCredit.persisted.cash,29_000);
  assert.ok(beforeCredit.persisted.unlocked.includes('region-oakland'));
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
  assert.equal(rejected.saved.cash,27_102,'rejected spending is removed while both staged credits and the awards survive');
  assert.ok(rejected.saved.unlocked.includes('region-oakland'));
  assert.equal(rejected.saved.cybercabs!.assets[0].gross,2);
  assert.ok(rejected.saved.unlocked.includes('park-it'));
  assert.equal(rejected.barrier,77);
  const transientResponse=await fetch(`${base}/rejected-transient`,{signal:AbortSignal.timeout(5000)});
  if(!transientResponse.ok)throw new Error(`rejected transient fixture failed: ${await transientResponse.text()}\n${logs}`);
  const transient=await transientResponse.json() as {patrolReset:boolean;saved:DriverProgress;draft:{delivery:{tickets:number;completed:number};achievements:{unlocked:string[]}}};
  assert.equal(transient.patrolReset,true);assert.equal(transient.draft.delivery.tickets,1);
  assert.equal(transient.draft.delivery.completed,1);assert.ok(transient.draft.achievements.unlocked.includes('roof-rider'));
  assert.equal(transient.saved.tickets,1,'the immutable stop is replayed after the rejected debit');
  assert.equal(transient.saved.cash,34_602,'the ticket and delivery settle from the restored wallet without resurrecting spending');
  assert.equal(transient.saved.completed,1,'the observed delivery survives the rejected predecessor');
  // This fixture manually injects the roof award through the legacy snapshot path.
  assert.ok(!transient.saved.unlocked.includes('roof-rider'));
  const cadenceResponse=await fetch(`${base}/cadence`,{signal:AbortSignal.timeout(5000)});
  if(!cadenceResponse.ok)throw new Error(`cadence fixture failed: ${await cadenceResponse.text()}\n${logs}`);
  const cadence=await cadenceResponse.json() as {before:{open:number;stages:number};stages:{intervals:{assetId:string;startMs:number;endMs:number}[]}[]};
  assert.deepEqual(cadence.before,{open:1,stages:0},'work below the checkpoint is still volatile');
  assert.deepEqual(cadence.stages.map(stage=>stage.intervals),[
    [{assetId:'cab-a',startMs:1_000,endMs:2_000}],
    [{assetId:'cab-a',startMs:2_000,endMs:2_100}],
    [{assetId:'cab-a',startMs:2_401,endMs:2_501}],
  ],'one-second batches close on a missed tick and on pause without inferring the gap');
  for(const mode of ['backpressure','backpressure-fence']){
    const pressureResponse=await fetch(`${base}/${mode}`,{signal:AbortSignal.timeout(5000)});
    if(!pressureResponse.ok)throw new Error(`${mode} fixture failed: ${await pressureResponse.text()}\n${logs}`);
    const pressure=await pressureResponse.json() as {closes:number;failed:boolean;open:number;beforeRelease:{attempted:number[];accepted:number};stages:{sequence:number;intervals:{startMs:number;endMs:number}[]}[]};
    assert.equal(pressure.closes,1);assert.equal(pressure.failed,true);assert.equal(pressure.open,0);
    assert.equal(pressure.stages.length,8,'accrual stops at the bounded backlog, even if close throws');
    assert.deepEqual(pressure.stages.at(-1)!.intervals,[{assetId:'cab-a',startMs:140,endMs:160},{assetId:'cab-a',startMs:1_000,endMs:1_100}],
      'the final already-observed tail is staged before accrual stops');
    if(mode==='backpressure-fence')assert.deepEqual(pressure.beforeRelease,{attempted:[1],accepted:0},'a stalled fence leaves all queued stages volatile until acceptance');
  }
  const handoffResponse=await fetch(`${base}/market-handoff`,{signal:AbortSignal.timeout(5000)});
  if(!handoffResponse.ok)throw new Error(`market handoff fixture failed: ${await handoffResponse.text()}\n${logs}`);
  const handoff=await handoffResponse.json() as {initialPaint:string;unpaintedCab:boolean;waitedForHead:boolean;actionApplied:boolean;buyAccepted:boolean;
    installSilent:boolean;installedPaint:string;rerouted:boolean;rerouteCash:number;switched:boolean;switchedPaint:string;cleared:boolean;
    stages:{fence:string;sequence:number;intervals:{startMs:number;endMs:number}[]}[]};
  assert.equal(handoff.initialPaint,'pacific-blue-paint');assert.equal(handoff.unpaintedCab,true);
  assert.equal(handoff.waitedForHead,true);assert.equal(handoff.actionApplied,false);assert.equal(handoff.buyAccepted,false);
  assert.equal(handoff.installSilent,true);assert.equal(handoff.installedPaint,'sunrise-gold-paint');
  assert.equal(handoff.rerouted,true);assert.equal(handoff.rerouteCash,9_000);
  assert.equal(handoff.switched,true);assert.equal(handoff.switchedPaint,'sunrise-gold-paint');assert.equal(handoff.cleared,true);
  assert.deepEqual(handoff.stages.map(({fence,sequence,intervals})=>({fence,sequence,intervals})),[
    {fence:'old',sequence:1,intervals:[{assetId:'cab-a',startMs:1_000,endMs:1_100}]},
    {fence:'new',sequence:1,intervals:[{assetId:'cab-a',startMs:2_000,endMs:3_000}]},
  ],'pause drains the observed tail and resumes cab staging under the new fence');
  console.log('PASS: delayed cab settlement preserves an eligible delivery and transient game evidence.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

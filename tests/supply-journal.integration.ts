// Physical supply contacts and reservations against real local Durable Objects.
// pnpm exec tsx tests/supply-journal.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { PickupStage } from '../worker/room-economy';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-supply-journal-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-supply-journal-test',main:resolve('tests/fixtures/supply-journal-worker.ts'),compatibility_date:'2026-10-17',
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
type Profile={revision:number;sequence:number;progress:DriverProgress};
type Reservation={eventId:string|null;generation:number;readyAt:number};
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}
function entry(room=`supply-${randomUUID().slice(0,8)}`){return {room,driverId:randomUUID(),fence:randomUUID()};}
function stage(e:ReturnType<typeof entry>,walletOrder:number,clock:number,id='pickup-0',type:'repair'|'air'='repair'):PickupStage {
  return {eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,walletOrder,clock,action:{kind:'supply',type},pickup:{id,generation:0}};
}
function intent(stage:PickupStage,revision:number,sequence:number):EconomyIntent {
  return {eventId:stage.eventId,driverId:stage.driverId,fence:stage.fence,roomId:stage.roomId,revision,sequence,clock:stage.clock,action:stage.action,pickup:stage.pickup};
}
async function acquire(e:ReturnType<typeof entry>){
  await rpc('producer',{...e,active:true});
  return rpc<{revision:number;sequence:number;progress:DriverProgress}>('acquire',{...e,progress:{cash:10_120,level:1,deliveryClock:0,unlocked:['region-oakland']}});
}
async function pickup(e:ReturnType<typeof entry>,id='pickup-0'){
  return (await rpc<Record<string,Reservation>>('pickup-states',{...e,ids:[id]}))[id];
}
try{
  child=start();await ready();
  // Two drivers contact the same generation: exactly one stage can own it.
  const a=entry(),b=entry(a.room),initial=await acquire(a);await acquire(b);
  const claim=stage(a,1,5),competitor=stage(b,1,5),claimIntent=intent(claim,0,1);
  assert.equal(await rpc('stage-supply',{...a,stage:claim}),'accepted');
  assert.equal(await rpc('stage-supply',{...a,stage:claim}),'accepted','lost stage replies are idempotent');
  assert.equal(await rpc('stage-supply',{...b,stage:competitor}),'reserved');

  // The pickup and the region threshold it crosses commit together, so a
  // crash before another world tick cannot lose or duplicate the milestone.
  const threshold=entry();await rpc('producer',{...threshold,active:true});
  await rpc('acquire',{...threshold,progress:{cash:9_995,level:0,deliveryClock:0,unlocked:[]}});
  const thresholdStage=stage(threshold,1,0),thresholdIntent=intent(thresholdStage,0,1);
  assert.equal(await rpc('stage-supply',{...threshold,stage:thresholdStage}),'accepted');
  const thresholdResult=await rpc<DriverOutcome>('submit',{...threshold,intent:thresholdIntent});success(thresholdResult);
  assert.equal(thresholdResult.progress.cash,11_000);
  assert.equal(thresholdResult.progress.eligibleIncome,1_005);
  assert.deepEqual(thresholdResult.awards,['region-oakland']);
  assert.deepEqual(await rpc('submit',{...threshold,intent:thresholdIntent}),thresholdResult);
  assert.deepEqual(await pickup(a),{eventId:claim.eventId,generation:0,readyAt:0});
  const after:EconomyIntent={eventId:randomUUID(),driverId:a.driverId,fence:a.fence,roomId:a.room,revision:1,sequence:2,clock:6,action:{kind:'progress',progress:initial.progress}};
  assert.equal(await rpc('submit',{...a,intent:after}),null,'ordinary work cannot overtake an accepted contact');
  const credited=await rpc<DriverOutcome>('submit',{...a,intent:claimIntent});success(credited);
  assert.equal(credited.progress.cash,10_125);assert.equal(credited.progress.eligibleIncome,5);assert.equal(credited.progress.earned,initial.progress.earned);
  assert.deepEqual(await rpc('submit',{...a,intent:claimIntent}),credited);
  const consumed=await pickup(a);assert.equal(consumed.eventId,null);assert.equal(consumed.generation,1);assert.ok(consumed.readyAt>Date.now());
  assert.equal(await rpc('ack',{...a,intent:claimIntent}),true);
  assert.equal(await rpc('stage-supply',{...a,stage:claim}),'superseded','a compacted stage cannot be resurrected');
  assert.equal(await rpc('stage-supply',{...b,stage:competitor}),'reserved');

  // A rejected predecessor does not discard an already accepted contact.
  const lostStage=entry(),saved=await acquire(lostStage);
  const bad:EconomyIntent={eventId:randomUUID(),driverId:lostStage.driverId,fence:lostStage.fence,roomId:lostStage.room,
    revision:0,sequence:1,clock:0,action:{kind:'progress',progress:{...saved.progress,earned:-1}}};
  assert.deepEqual(await rpc('commit',{...lostStage,intent:bad}),{ok:false,reason:'invalid'});
  const accepted=stage(lostStage,2,5,'pickup-1','air');
  await rpc('hold-supply-stage',lostStage);const flight=rpc('stage-supply',{...lostStage,stage:accepted},30_000);void flight.catch(()=>{});
  await until(()=>rpc<boolean>('supply-stage-held',lostStage),'accepted stage reply held');
  assert.equal((await pickup(lostStage,'pickup-1')).eventId,accepted.eventId);
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',lostStage,15_000);
  const settled=await rpc<Profile>('profile',lostStage);
  assert.equal(settled.progress.cash,10_125);assert.equal(settled.progress.eligibleIncome,5);
  assert.equal((await pickup(lostStage,'pickup-1')).generation,1);
  await rpc('acquire',{...lostStage,fence:randomUUID()});
  assert.equal((await rpc<Profile>('profile',lostStage)).progress.cash,10_125);

  // A profile reply lost after credit leaves the generation reserved until
  // restart replays the receipt and advances it exactly once.
  const lostReply=entry();await acquire(lostReply);const pending=stage(lostReply,1,2),pendingIntent=intent(pending,0,1);
  assert.equal(await rpc('stage-supply',{...lostReply,stage:pending}),'accepted');await rpc('hold-supply-profile',lostReply);
  const pendingFlight=rpc('submit',{...lostReply,intent:pendingIntent},30_000);void pendingFlight.catch(()=>{});
  await until(()=>rpc<boolean>('supply-profile-held',lostReply),'committed profile reply held');
  assert.equal((await rpc<Profile>('profile',lostReply)).progress.cash,10_125);
  assert.equal((await pickup(lostReply)).eventId,pending.eventId);
  await stop(child);child=undefined;child=start();await ready();await rpc('freeze',lostReply,15_000);
  assert.equal((await rpc<Profile>('profile',lostReply)).progress.cash,10_125);
  assert.equal((await pickup(lostReply)).generation,1);

  // A terminal rejection releases, without consumption or credit, while the
  // failed physical receipt remains retained for diagnosis.
  const rejected=entry(),other=entry(rejected.room);await acquire(rejected);await acquire(other);
  const fail=stage(rejected,1,1),failIntent=intent(fail,0,1);
  assert.equal(await rpc('stage-supply',{...rejected,stage:fail}),'accepted');await rpc('reject-supply',rejected);
  assert.deepEqual(await rpc('submit',{...rejected,intent:failIntent}),{ok:false,reason:'invalid'});
  assert.deepEqual(await pickup(rejected),{eventId:null,generation:0,readyAt:0});
  assert.equal((await rpc<Profile>('profile',rejected)).progress.cash,10_120);
  assert.equal(await rpc('ack',{...rejected,intent:failIntent}),false);
  assert.equal(await rpc('stage-supply',{...other,stage:stage(other,1,1)}),'accepted');

  // A stale initial fence check cannot reserve after the old fence was sealed.
  const stale=entry();await acquire(stale);const staleClaim=stage(stale,1,2);
  await rpc('hold-fence',stale);const late=rpc<string>('stage-supply',{...stale,stage:staleClaim},20_000);
  await until(()=>rpc<boolean>('fence-held',stale),'stale initial check held');
  await rpc('freeze',stale,15_000);await rpc('release-fence',stale);
  assert.equal(await late,'superseded');assert.deepEqual(await pickup(stale),{eventId:null,generation:0,readyAt:0});

  // Once the transaction has inserted a stage, freeze adopts its reservation.
  // A delayed failed postcheck must not release or undo the adopted contact.
  const adopted=entry();await acquire(adopted);const adoptedClaim=stage(adopted,1,2);
  await rpc('hold-postcheck',adopted);const adoption=rpc<string>('stage-supply',{...adopted,stage:adoptedClaim},20_000);
  await until(()=>rpc<boolean>('postcheck-held',adopted),'post-insertion check held');
  await rpc('freeze',adopted,15_000);await rpc('release-postcheck',adopted);
  assert.equal(await adoption,'superseded');assert.equal((await pickup(adopted)).generation,1);
  assert.equal((await rpc<Profile>('profile',adopted)).progress.cash,10_125);
  console.log('supply journal reservation, ordering, rejection, crash and fencing integration passed');
}finally{
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

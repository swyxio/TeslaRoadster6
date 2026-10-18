// Isolated real-Wrangler profile, observation journal and fenced recovery.
// pnpm exec tsx tests/achievement-tier-wallet.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initialDelivery, pickupBonusFor, RESTAURANTS, type DeliveryStop } from '../shared/delivery';
import { evaluateAchievementEvidence, type AchievementEvidence } from '../shared/achievement-evidence';
import { terrainHeight } from '../shared/map';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { AchievementStage, DeliveryStage } from '../worker/room-economy';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw new Error(`Timed out: ${label}`);
}
async function freePort(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGKILL');}catch{}
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler shutdown');
}
const dir=await mkdtemp(join(tmpdir(),'tesland-tier-wallet-')),port=await freePort();
const base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-tier-wallet-test',main:resolve('tests/fixtures/achievement-tier-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','RoomEconomy','DriverProfile','GlobalIncome','GlobalEarningsEvent']}]}));
let child:ChildProcess|undefined,logs='';
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),
    '--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){
  await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
    try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',60_000);
}
async function call(path:string,body:object,timeout=10_000){
  return fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
}
async function rpc<T>(op:string,fields:Record<string,unknown>={},timeout=10_000):Promise<T>{
  const response=await call('/',{op,...fields},timeout),body=await response.text();
  if(!response.ok)throw new Error(`${op}: ${response.status} ${body}\n${logs}`);
  return JSON.parse(body) as T;
}
async function seed(driverId:string,fields:Record<string,unknown>,clearTiers=false){
  const response=await call('/__tier-test',{driverId,fields,clearTiers});
  if(!response.ok)throw new Error(`fixture seed: ${response.status} ${await response.text()}`);
}
type Profile={revision:number;sequence:number;progress:DriverProgress;fence:string};
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}
function entry(){return {room:`tier-${randomUUID().slice(0,8)}`,driverId:randomUUID(),fence:randomUUID()};}
function assertTiers(progress:DriverProgress):asserts progress is DriverProgress & {achievementTiers:NonNullable<DriverProgress['achievementTiers']>}{
  assert.ok(progress.achievementTiers,'profile must have achievement tiers');
}
function makeIntent(e:ReturnType<typeof entry>,stage:AchievementStage|DeliveryStage,profile:Profile):EconomyIntent {
  return {eventId:stage.eventId,driverId:e.driverId,fence:e.fence,roomId:e.room,
    revision:profile.revision,sequence:stage.walletOrder,clock:stage.clock,action:stage.action};
}
function achievement(e:ReturnType<typeof entry>,sequence:number,evidence:AchievementEvidence):AchievementStage {
  return {eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,walletOrder:sequence,clock:0,action:{kind:'achievement',evidence}};
}
async function profile(e:ReturnType<typeof entry>){return rpc<Profile>('profile',e);}
async function stageAndSubmit(e:ReturnType<typeof entry>,evidence:AchievementEvidence){
  const before=await profile(e),stage=achievement(e,before.sequence+1,evidence),intent=makeIntent(e,stage,before);
  assert.equal(await rpc('stage-achievement',{...e,stage}),'accepted');
  const result=await rpc<DriverOutcome>('submit',{...e,intent});success(result);
  assert.equal(await rpc('ack',{...e,intent}),true);
  return {before,stage,intent,result};
}

try{
  child=start();await ready();

  // A stored pre-tier profile normalizes once without retrospectively adding cash.
  const legacy=entry();await rpc('producer',{...legacy,active:true});await rpc('acquire',legacy);
  await seed(legacy.driverId,{cash:7_000,eligibleIncome:4_500,completed:25,
    unlocked:['deliveries-1','deliveries-10','roof-rider','race-winner','garage-champion']},true);
  const legacyAcquired=await rpc<Profile>('acquire',legacy);assertTiers(legacyAcquired.progress);
  const legacyTiers=legacyAcquired.progress.achievementTiers;
  assert.deepEqual(legacyTiers.deliveries,{count:25,claimed:2});
  assert.deepEqual(legacyTiers['roof-landings'],{count:1,claimed:1});
  assert.deepEqual(legacyTiers['races-finished'],{count:1,claimed:1});
  assert.deepEqual(legacyTiers['races-won'],{count:1,claimed:1});
  assert.deepEqual(legacyTiers['dome-matches'],{count:1,claimed:1});
  assert.deepEqual(legacyTiers['dome-wins'],{count:1,claimed:1});
  assert.equal(legacyTiers.pickups.count,0);assert.equal(legacyTiers['early-pickups'].count,0);
  assert.equal(legacyAcquired.progress.cash,7_000);assert.equal(legacyAcquired.progress.eligibleIncome,4_500);
  const legacyAgain=await rpc<Profile>('acquire',legacy);
  assert.deepEqual(legacyAgain.progress,legacyAcquired.progress,'acquire is normalization-idempotent');
  const legacyRoof=await stageAndSubmit(legacy,{kind:'roof',roof:'ordinary'});
  assert.equal(legacyRoof.result.progress.cash,7_000,'legacy first roof is not paid again');
  assert.equal(legacyRoof.result.progress.achievementTiers!['roof-landings'].count,2);

  // Malformed new state is held for repair, rather than silently reset.
  const corrupt=entry();await rpc('acquire',corrupt);
  await seed(corrupt.driverId,{achievementTiers:{bad:true}});
  const deniedAcquire=await call('/',{op:'acquire',...corrupt});
  assert.equal(deniedAcquire.status,500);assert.match(await deniedAcquire.text(),/Invalid achievement tier progress/);
  assert.deepEqual((await profile(corrupt)).progress.achievementTiers,{bad:true});

  // A matched early pickup atomically commits both counters and both $100 tiers.
  const driver=entry();await rpc('producer',{...driver,active:true});
  const order={...initialDelivery({x:0,z:0}).order,elapsed:0,pickupEstimate:60};
  const acquired=await rpc<Profile>('acquire',{...driver,progress:{cash:2_500,level:0,order,deliveryClock:0}});
  assertTiers(acquired.progress);
  const target=RESTAURANTS[order.restaurant],height=terrainHeight(target.x,target.z);assert.notEqual(height,null);
  const pickupStop:DeliveryStop={x:target.x,y:height!,z:target.z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false};
  const pickup:DeliveryStage={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,walletOrder:1,clock:0,
    action:{kind:'delivery',stop:pickupStop,atMs:Date.now()-1,multiplier:1}};
  const pickupIntent=makeIntent(driver,pickup,acquired);
  assert.equal(await rpc('stage',{...driver,stage:pickup}),'accepted');
  const paid=await rpc<DriverOutcome>('submit',{...driver,intent:pickupIntent});success(paid);assertTiers(paid.progress);
  assert.equal(paid.delivery?.matched,true);assert.equal(paid.progress.order.stage,'dropoff');
  assert.deepEqual(paid.progress.achievementTiers.pickups,{count:1,claimed:1});
  assert.deepEqual(paid.progress.achievementTiers['early-pickups'],{count:1,claimed:1});
  assert.equal(paid.progress.cash,2_500+pickupBonusFor(order)+200);
  assert.equal(paid.progress.eligibleIncome,pickupBonusFor(order)+200);
  assert.deepEqual(await rpc('submit',{...driver,intent:pickupIntent}),paid,'replayed event receives original receipt');
  assert.equal(await rpc('ack',{...driver,intent:pickupIntent}),true);
  const compactedReplay=await rpc<DriverOutcome>('submit',{...driver,intent:pickupIntent});
  assert.equal(compactedReplay.ok,false,'old sequence remains fenced after receipt compaction');
  assert.deepEqual((await profile(driver)).progress,paid.progress);

  // Distinct roof and contested race events each count once, even when their
  // evidence has identical content. The second rank pays once at ten.
  const roof={kind:'roof',roof:'ordinary'} as const;
  const race={kind:'race',status:'finished',phase:'active',rank:1,starterCount:2} as const;
  const roofLegacyReward=evaluateAchievementEvidence([],roof).reduce((sum,item)=>sum+item.reward,0);
  let firstRoof:DriverOutcome|null=null;
  for(let i=0;i<10;i++){
    const result=(await stageAndSubmit(driver,roof)).result;
    if(i===0)firstRoof=result;
    assert.equal(result.progress.achievementTiers!['roof-landings'].count,i+1);
  }
  assert.ok(firstRoof?.ok);assert.equal(firstRoof.progress.cash,paid.progress.cash+roofLegacyReward);
  const afterRoofs=await profile(driver);assert.equal(afterRoofs.progress.cash,paid.progress.cash+roofLegacyReward+350);
  for(let i=0;i<10;i++){
    const result=(await stageAndSubmit(driver,race)).result;
    assert.equal(result.progress.achievementTiers!['races-finished'].count,i+1);
    assert.equal(result.progress.achievementTiers!['races-won'].count,i+1);
  }
  const afterRaces=await profile(driver);assert.equal(afterRaces.progress.cash,afterRoofs.progress.cash+900);
  assert.deepEqual(afterRaces.progress.achievementTiers!['races-won'],{count:10,claimed:2});

  // Invalid observations and stale generic progress cannot alter counters.
  const invalid:EconomyIntent={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,
    revision:afterRaces.revision,sequence:afterRaces.sequence+1,clock:0,action:{kind:'achievement',evidence:{kind:'roof',roof:'invalid'} as never}};
  assert.deepEqual(await rpc('commit',{...driver,intent:invalid}),{ok:false,reason:'invalid'});
  const afterInvalid=await profile(driver);
  assert.deepEqual(afterInvalid.progress,afterRaces.progress);
  const stale=structuredClone(afterInvalid.progress);stale.achievementTiers=structuredClone(acquired.progress.achievementTiers);
  const staleIntent:EconomyIntent={eventId:randomUUID(),driverId:driver.driverId,fence:driver.fence,roomId:driver.room,
    revision:afterInvalid.revision,sequence:afterInvalid.sequence+1,clock:0,action:{kind:'progress',progress:stale}};
  const staleResult=await rpc<DriverOutcome>('commit',{...driver,intent:staleIntent});success(staleResult);
  assert.deepEqual(staleResult.progress.achievementTiers,afterInvalid.progress.achievementTiers,'generic progress cannot overwrite counters');

  // Capture a real accepted journal stage, crash the Worker before submission,
  // then recover the same driver through a new fence with no duplicate credit.
  const beforeCrash=await profile(driver),pending=achievement(driver,beforeCrash.sequence+1,roof);
  assert.equal(await rpc('stage-achievement',{...driver,stage:pending}),'accepted');
  assert.equal((await profile(driver)).progress.achievementTiers!['roof-landings'].count,10);
  await stop(child);child=start();await ready();
  const nextFence=randomUUID(),recovered=await rpc<Profile>('acquire',{...driver,fence:nextFence},20_000);
  assert.equal(recovered.progress.achievementTiers!['roof-landings'].count,11);
  assert.equal(recovered.progress.cash,beforeCrash.progress.cash);
  assert.equal(recovered.progress.eligibleIncome,beforeCrash.progress.eligibleIncome);
  assert.equal(await rpc('stage-achievement',{...driver,stage:pending}),'superseded');
  const newSession={...driver,fence:nextFence};
  assert.deepEqual((await profile(newSession)).progress,recovered.progress);
  console.log('PASS: tier legacy normalization, accepted early pickup, distinct observations, replay, rejection, stale writes and crashed-stage refence.');
}catch(error){console.error(error);console.error(`Wrangler logs:\n${logs}`);process.exitCode=1;}
finally{
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

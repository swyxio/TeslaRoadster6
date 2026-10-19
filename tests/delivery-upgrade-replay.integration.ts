// Cross-release local Durable Object recovery. The first Wrangler process runs
// a copy of the worker with the previous economy constants, then the second
// process opens the same persisted storage with the current worker.
// pnpm exec tsx tests/delivery-upgrade-replay.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeAchievementTiers } from '../shared/achievement-tiers';
import type { AchievementId } from '../shared/achievements';
import { CUSTOMERS, initialDelivery, isOrderAccessible, type DeliveryStop } from '../shared/delivery';
import { terrainHeight } from '../shared/map';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { DeliveryStage } from '../worker/room-economy';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await pause(50);}
  throw new Error(`Timed out: ${label}`);
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
function replaceOnce(source:string,before:string,after:string):string {
  assert.equal(source.split(before).length,2,`Expected exactly one old-rule substitution: ${before}`);
  return source.replace(before,after);
}

type Profile={revision:number;sequence:number;progress:DriverProgress};
type Entry={room:string;driverId:string;fence:string};
type Scenario={name:string;completed:number;unlocked:AchievementId[];legacyCash:number;cash:number;award?:AchievementId};
const scenarios:Scenario[]=[
  {name:'first delivery',completed:0,unlocked:['region-oakland'],legacyCash:10_650,cash:10_260,award:'deliveries-1'},
  {name:'third delivery',completed:2,unlocked:['region-oakland','deliveries-1'],legacyCash:10_900,cash:10_460,award:'regular'},
  {name:'fifth delivery',completed:4,unlocked:['region-oakland','deliveries-1','regular'],legacyCash:10_750,cash:10_310,award:'deliveries-5'},
  {name:'$10k boundary',completed:6,unlocked:['region-oakland','deliveries-1','regular','deliveries-5'],legacyCash:10_150,cash:9_910},
];
function entry():Entry{return {room:`upgrade-${randomUUID().slice(0,8)}`,driverId:randomUUID(),fence:randomUUID()};}
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}
function pose():DeliveryStop {
  const {x,z}=CUSTOMERS[0],y=terrainHeight(x,z);assert.notEqual(y,null);
  return {x,y:y!,z,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false};
}
function stage(e:Entry):DeliveryStage {
  return {eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,walletOrder:1,clock:0,
    action:{kind:'delivery',stop:pose(),atMs:Date.now()-2_000,multiplier:1}};
}
function intent(s:DeliveryStage):EconomyIntent {
  return {eventId:s.eventId,driverId:s.driverId,fence:s.fence,roomId:s.roomId,revision:0,sequence:1,clock:s.clock,action:s.action};
}

const dir=await mkdtemp(join(tmpdir(),'tesland-delivery-upgrade-'));
const legacy=join(dir,'legacy'),persist=join(dir,'storage'),p=await port(),base=`http://127.0.0.1:${p}`;
const config=join(dir,'wrangler.json');
let child:ChildProcess|undefined,logs='';
async function writeConfig(main:string){
  await writeFile(config,JSON.stringify({name:'tesland-delivery-upgrade-test',main,compatibility_date:'2026-10-17',
    durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'ECONOMIES',class_name:'RoomEconomy'},
      {name:'DRIVERS',class_name:'DriverProfile'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
    migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','RoomEconomy','DriverProfile','GlobalIncome','GlobalEarningsEvent']}]}));
}
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),
    '--persist-to',persist,'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
  try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',60_000);}
async function rpc<T>(op:string,fields:Record<string,unknown>={},timeout=10_000):Promise<T>{
  const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,...fields}),signal:AbortSignal.timeout(timeout)});
  const body=await response.text();if(!response.ok)throw new Error(`${op}: ${response.status} ${body}\n${logs}`);return JSON.parse(body) as T;
}
async function prepare(e:Entry,s:Scenario){
  await rpc('persistent-producer',{...e,active:true});
  const order={...initialDelivery({x:0,z:0}).order,stage:'dropoff' as const,customer:0,elapsed:0,base:600,estimate:60};
  const progress={cash:9_000,level:0,completed:s.completed,order,deliveryClock:0,unlocked:s.unlocked,
    achievementTiers:normalizeAchievementTiers(undefined,s.completed,s.unlocked)};
  await rpc('acquire',{...e,progress});
  const observed=stage(e),submitted=intent(observed);
  assert.equal(await rpc('stage',{...e,stage:observed}),'accepted');
  return {observed,submitted};
}

try {
  // Keep this fixture independent of Git history and fail loudly if the
  // candidate formulas change. Only the temporary copy receives old rules.
  await mkdir(join(legacy,'tests'),{recursive:true});
  await Promise.all([
    cp(resolve('shared'),join(legacy,'shared'),{recursive:true}),
    cp(resolve('worker'),join(legacy,'worker'),{recursive:true}),
    cp(resolve('tests/fixtures'),join(legacy,'tests/fixtures'),{recursive:true}),
    symlink(resolve('node_modules'),join(legacy,'node_modules'),'dir'),
    cp(resolve('package.json'),join(legacy,'package.json')),
  ]);
  const deliveryPath=join(legacy,'shared/delivery.ts');
  let delivery=await readFile(deliveryPath,'utf8');
  delivery=replaceOnce(delivery,'order.base * .25 * Math.max','order.base * .4 * Math.max');
  delivery=replaceOnce(delivery,'order.base * .35 * Math.min','order.base * .75 * Math.min');
  await writeFile(deliveryPath,delivery);
  const achievementsPath=join(legacy,'shared/achievements.ts');
  let achievements=await readFile(achievementsPath,'utf8');
  achievements=replaceOnce(achievements,"{count:1,id:'deliveries-1',reward:350}","{count:1,id:'deliveries-1',reward:500}");
  achievements=replaceOnce(achievements,"{count:3,id:'regular',reward:200}","{count:3,id:'regular',reward:400}");
  achievements=replaceOnce(achievements,"{count:5,id:'deliveries-5',reward:400}","{count:5,id:'deliveries-5',reward:600}");
  await writeFile(achievementsPath,achievements);
  await writeConfig(join(legacy,'tests/fixtures/delivery-journal-worker.ts'));child=start();await ready();

  const pending:Array<{scenario:Scenario;e:Entry;submitted:EconomyIntent}>=[];
  for(const scenario of scenarios){
    const e=entry(),{observed,submitted}=await prepare(e,scenario);
    await rpc('hold-assignment',e);
    const flight=rpc('submit',{...e,intent:submitted},45_000);void flight.catch(()=>{});
    await until(()=>rpc<boolean>('assignment-held',e),`${scenario.name}: old checkpoint held`,40_000);
    const checkpoint=await rpc<{done:boolean;version:number;context:string}>('assignment',{...e,eventId:observed.eventId});
    assert.equal(checkpoint.done,false);assert.ok(checkpoint.version>=1);
    const context=JSON.parse(checkpoint.context) as {order:{search:{level:number}};level:number};
    assert.equal(context.order.search.level,1,`${scenario.name}: old fare crossed $10k before assignment`);
    assert.equal(context.level,1,`${scenario.name}: old projected final level`);
    const before=await rpc<Profile>('profile',e);
    assert.equal(before.progress.cash,9_000);assert.equal(before.progress.completed,scenario.completed);
    assert.deepEqual(await rpc('sources',e),[],'checkpoint is durable before any earnings commit');
    pending.push({scenario,e,submitted});
  }
  // Checkpoint searches are initiated before these independent settlements,
  // which can otherwise warm the route cache and finish a search in one step.
  // The completed cases prove the same old worker pays the old fare and each
  // old achievement value, not merely that its source was transformed.
  for(const s of scenarios){
    const e=entry(),{submitted}=await prepare(e,s);
    const result=await rpc<DriverOutcome>('submit',{...e,intent:submitted},30_000);success(result);
    assert.equal(result.delivery?.earnings[0].amount,1_050,`${s.name}: old fare`);
    assert.equal(result.progress.cash,s.legacyCash,`${s.name}: old fare and achievement awards`);
    if(s.award)assert.ok(result.awards.includes(s.award),`${s.name}: old milestone`);
  }
  await stop(child);child=undefined;
  await writeConfig(resolve('tests/fixtures/delivery-journal-worker.ts'));child=start();await ready();

  for(const {scenario,e,submitted} of pending){
    if(scenario.name==='$10k boundary'){
      // The saved driver may switch rooms before its original producer retries.
      // Freeze must drain the staged stop directly and then seal the old fence.
      await rpc('freeze',e,40_000);
      const after=await rpc<Profile>('profile',e);
      assert.equal(after.progress.cash,9_910);
      assert.equal(after.progress.earned,810);
      assert.equal(after.progress.eligibleIncome,910);
      assert.equal(after.progress.completed,7);
      assert.equal(after.progress.level,0);
      assert.equal(after.progress.order.search,undefined);
      assert.equal(isOrderAccessible(after.progress.order,0,false),true);
      assert.deepEqual(await rpc('sources',e),['earned-source:delivery:7:dropoff']);
      assert.equal(await rpc('assignment',{...e,eventId:submitted.eventId}),null);
      const newFence=randomUUID();
      const recovered=await rpc<{progress:DriverProgress}>('acquire',{...e,fence:newFence});
      assert.deepEqual(recovered.progress,after.progress,'recovery preserves the settled wallet');
      assert.deepEqual((await rpc<{progress:DriverProgress}>('acquire',{...e,fence:newFence})).progress,after.progress);
      assert.deepEqual(await rpc('sources',e),['earned-source:delivery:7:dropoff']);
      continue;
    }
    const result=await rpc<DriverOutcome>('submit',{...e,intent:submitted},40_000);success(result);
    assert.equal(result.delivery?.matched,true,`${scenario.name}: accepted stop recovered`);
    assert.equal(result.delivery?.earnings[0].amount,810,`${scenario.name}: current fare`);
    assert.equal(result.progress.cash,scenario.cash,`${scenario.name}: current fare and achievements`);
    assert.equal(result.progress.completed,scenario.completed+1);
    assert.equal(result.progress.level,scenario.cash>=10_000?1:0);
    assert.equal(result.progress.order.search,undefined);
    assert.equal(isOrderAccessible(result.progress.order,result.progress.level,false),true);
    if(scenario.award)assert.ok(result.awards.includes(scenario.award));
    assert.deepEqual(await rpc('submit',{...e,intent:submitted}),result,'journal retry returns the same result');
    assert.deepEqual(await rpc('commit',{...e,intent:submitted}),result,'profile receipt returns the same result');
    const sources=[`earned-source:delivery:${scenario.completed+1}:dropoff`,
      ...((scenario.completed+1)%3===0?[`earned-source:delivery:${scenario.completed+1}:checkpoint`]:[])].sort();
    assert.deepEqual((await rpc<string[]>('sources',e)).sort(),sources);
    assert.equal(await rpc('assignment',{...e,eventId:submitted.eventId}),null);
    assert.equal(await rpc('ack',{...e,intent:submitted}),true);
    await rpc('freeze',e,20_000);
    const recovered=await rpc<{progress:DriverProgress}>('acquire',{...e,fence:randomUUID()});
    assert.equal(recovered.progress.cash,scenario.cash,'new fence cannot pay twice');
    assert.equal(recovered.progress.completed,scenario.completed+1);
    assert.deepEqual((await rpc<string[]>('sources',e)).sort(),sources);
  }
  console.log('PASS: old-rule assignment checkpoints replay under new fare and achievement rules across the $10k boundary.');
  console.log('PASS: accepted stops, committed receipts, source IDs and new-fence recovery remain exactly once.');
} finally {
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

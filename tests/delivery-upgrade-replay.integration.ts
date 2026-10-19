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
import type { EarningsEvents } from '../shared/earnings-events';
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
function stage(e:Entry,multiplier:1|null=1):DeliveryStage {
  return {eventId:randomUUID(),driverId:e.driverId,fence:e.fence,roomId:e.room,walletOrder:1,clock:0,
    action:{kind:'delivery',stop:pose(),atMs:Date.now()-2_000,multiplier}};
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
async function prepare(e:Entry,s:Scenario,multiplier:1|null=1,initialCash=9_000){
  await rpc('persistent-producer',{...e,active:true});
  const order={...initialDelivery({x:0,z:0}).order,stage:'dropoff' as const,customer:0,elapsed:0,base:600,estimate:60};
  const progress={cash:initialCash,level:0,completed:s.completed,order,deliveryClock:0,unlocked:s.unlocked,
    achievementTiers:normalizeAchievementTiers(undefined,s.completed,s.unlocked)};
  await rpc('acquire',{...e,progress});
  const observed=stage(e,multiplier),submitted=intent(observed);
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
  // Expose the profile's optional event history on this local fixture only so
  // the test can retry the actual receipt and reject different histories.
  let fixture=await readFile(resolve('tests/fixtures/delivery-journal-worker.ts'),'utf8');
  fixture=replaceOnce(fixture,"case 'commit':return Response.json(await driver.commit(body.intent));",
    "case 'commit':return Response.json(await driver.commit(body.intent,body.events));");
  await writeFile(join(legacy,'tests/fixtures/delivery-journal-worker.ts'),fixture);
  const current=join(dir,'current');
  await mkdir(join(current,'tests/fixtures'),{recursive:true});
  await Promise.all([
    writeFile(join(current,'tests/fixtures/delivery-journal-worker.ts'),fixture),
    cp(resolve('tests/fixtures/cybercab-events-worker.ts'),join(current,'tests/fixtures/cybercab-events-worker.ts')),
    symlink(resolve('shared'),join(current,'shared'),'dir'),symlink(resolve('worker'),join(current,'worker'),'dir'),
    symlink(resolve('node_modules'),join(current,'node_modules'),'dir'),cp(resolve('package.json'),join(current,'package.json')),
  ]);
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
  // A saved search can already be complete before its transaction commits.
  // Resolve a room-win boost from history, then crash at that exact point.
  const boostedEntry=entry(),boostedScenario=scenarios[0];
  await rpc('room-win',{...boostedEntry,eventId:randomUUID(),at:Date.now()-10_000});
  const {observed:boostedStop,submitted:boostedIntent}=await prepare(boostedEntry,boostedScenario,null,8_000);
  await rpc('hold-assignment',{...boostedEntry,done:true});
  const boostedFlight=rpc('submit',{...boostedEntry,intent:boostedIntent},45_000);void boostedFlight.catch(()=>{});
  await until(()=>rpc<boolean>('assignment-held',boostedEntry),'completed boosted assignment held',40_000);
  const boostedCheckpoint=await rpc<{done:boolean;context:string}>('assignment',{...boostedEntry,eventId:boostedStop.eventId});
  assert.equal(boostedCheckpoint.done,true);
  assert.equal((JSON.parse(boostedCheckpoint.context) as {level:number}).level,1,'old boosted payout crosses $10k');
  const boostedRecord=await rpc<{cabEvents:EarningsEvents}>('record',{...boostedEntry,eventId:boostedStop.eventId});
  assert.equal(boostedRecord.cabEvents.room.length,1,'the unresolved rate is saved with its room event history');
  assert.equal((await rpc<Profile>('profile',boostedEntry)).progress.cash,8_000);
  assert.deepEqual(await rpc('sources',boostedEntry),[]);
  // Checkpoint searches are initiated before these independent settlements,
  // which can otherwise warm the route cache and finish a search in one step.
  // The completed cases prove the same old worker pays the old fare and each
  // old achievement value, not merely that its source was transformed.
  const paid:Array<{scenario:Scenario;e:Entry;submitted:EconomyIntent;result:Extract<DriverOutcome,{ok:true}>;events?:EarningsEvents}>=[];
  for(const s of scenarios){
    const e=entry(),{submitted}=await prepare(e,s);
    const result=await rpc<DriverOutcome>('submit',{...e,intent:submitted},30_000);success(result);
    assert.equal(result.delivery?.earnings[0].amount,1_050,`${s.name}: old fare`);
    assert.equal(result.progress.cash,s.legacyCash,`${s.name}: old fare and achievement awards`);
    if(s.award)assert.ok(result.awards.includes(s.award),`${s.name}: old milestone`);
    paid.push({scenario:s,e,submitted,result});
  }
  const historyEntry=entry(),historyScenario=scenarios[0];
  const {submitted:historyIntent}=await prepare(historyEntry,historyScenario,null);
  const historyResult=await rpc<DriverOutcome>('submit',{...historyEntry,intent:historyIntent},30_000);success(historyResult);
  const historyRecord=await rpc<{cabEvents?:EarningsEvents}>('record',{...historyEntry,eventId:historyIntent.eventId});
  assert.ok(historyRecord.cabEvents,'old receipt records the event history used to determine its rate');
  assert.equal(historyResult.delivery?.earnings[0].amount,1_050);
  paid.push({scenario:historyScenario,e:historyEntry,submitted:historyIntent,result:historyResult,events:historyRecord.cabEvents});
  await stop(child);child=undefined;
  await writeConfig(join(current,'tests/fixtures/delivery-journal-worker.ts'));child=start();await ready();

  const boosted=await rpc<DriverOutcome>('submit',{...boostedEntry,intent:boostedIntent},40_000);success(boosted);
  assert.equal(boosted.delivery?.earnings[0].amount,1_215,'the revised fare keeps the 1.5x room boost');
  assert.equal(boosted.delivery?.earnings[0].multiplier,1.5);
  assert.equal(boosted.progress.cash,9_665);
  assert.equal(boosted.progress.level,0,'the revised payout stays below $10k');
  assert.equal(boosted.progress.order.search,undefined);
  assert.equal(isOrderAccessible(boosted.progress.order,0,false),true);
  assert.deepEqual(await rpc('submit',{...boostedEntry,intent:boostedIntent}),boosted);
  assert.deepEqual(await rpc('commit',{...boostedEntry,intent:boostedIntent,events:boostedRecord.cabEvents}),boosted);
  assert.deepEqual(await rpc('sources',boostedEntry),['earned-source:delivery:1:dropoff']);
  assert.equal(await rpc('assignment',{...boostedEntry,eventId:boostedStop.eventId}),null);

  // Go straight to the upgraded profile, before the room journal can answer
  // from its own cache: a committed legacy receipt keeps its original value.
  for(const {scenario,e,submitted,result,events} of paid){
    const replay=await rpc<DriverOutcome>('commit',{...e,intent:submitted,...(events?{events}:{})});
    assert.deepEqual(replay,result,`${scenario.name}: old profile receipt after upgrade`);
    assert.equal(replay.ok&&replay.delivery?.earnings[0].amount,1_050);
    assert.equal((await rpc<Profile>('profile',e)).progress.cash,scenario.legacyCash);
    const sources=[`earned-source:delivery:${scenario.completed+1}:dropoff`,
      ...((scenario.completed+1)%3===0?[`earned-source:delivery:${scenario.completed+1}:checkpoint`]:[])].sort();
    assert.deepEqual((await rpc<string[]>('sources',e)).sort(),sources);
    assert.equal(submitted.action.kind,'delivery');
    if(submitted.action.kind!=='delivery')throw new Error('Expected a delivery intent');
    const changed={...submitted,action:{...submitted.action,atMs:submitted.action.atMs+1}} satisfies EconomyIntent;
    assert.deepEqual(await rpc('commit',{...e,intent:changed,...(events?{events}:{})}),{ok:false,reason:'conflict'});
    if(events){
      const changedEvents:EarningsEvents={room:[{startsAtMs:1,endsAtMs:600_001}],global:[]};
      assert.notDeepEqual(changedEvents,events);
      assert.deepEqual(await rpc('commit',{...e,intent:submitted,events:changedEvents}),{ok:false,reason:'conflict'});
    }
    assert.deepEqual(await rpc('commit',{...e,intent:submitted,...(events?{events}:{})}),result,'conflicts do not alter the receipt');
    assert.deepEqual((await rpc<string[]>('sources',e)).sort(),sources);
  }

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
  console.log('PASS: upgraded profiles preserve committed old-rule receipts and reject changed intents or event histories.');
  console.log('PASS: a completed assignment with an unknown, boosted rate replays using its saved event history.');
  console.log('PASS: accepted stops, committed receipts, source IDs and new-fence recovery remain exactly once.');
} finally {
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

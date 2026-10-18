// Local-only Wrangler crash, retry, and fence tests for durable cab stages.
// pnpm exec tsx tests/cybercab-stage.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';
import type { CabIncomeStage } from '../worker/room-economy';
import { NEUTRAL } from '../shared/game';
import { RoomInputClient } from './room-input-client';

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
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-stage-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-cab-stage-test',main:resolve('tests/fixtures/cybercab-stage-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__cab-stage/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let child:ChildProcess|undefined,logs='';
const sockets:WebSocket[]=[];
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(data:Buffer)=>{logs=(logs+data.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){try{await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',60_000);}catch(error){throw new Error(`${String(error)}\n${logs}`);}}
async function post<T>(path:string,body:object,timeout=5000):Promise<T>{
  const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}\n${logs}`);return response.json() as Promise<T>;
}
const rpc=<T>(method:string,body:object,timeout=5000)=>post<T>(`/__wallet-test/${method}`,body,timeout);
const stage=(item:CabIncomeStage)=>post<'accepted'|'superseded'|'conflict'|{threw:true}>('/__cab-stage/stage',{room:item.roomId,stage:item});
type RecordState={revision:number;sequence:number;fence:string;progress:DriverProgress};
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const keys=(room:string,driverId:string)=>rpc<string[]>('economy-keys',{room,driverId});
function success(result:DriverOutcome|null):asserts result is Extract<DriverOutcome,{ok:true}>{assert.ok(result?.ok,JSON.stringify(result));}
async function seed(inRoom?:string){
  const driverId=randomUUID(),fence=randomUUID(),room=inRoom??`stage-${randomUUID().slice(0,8)}`;
  await rpc('acquire',{driverId,fence,room});
  const buy:EconomyIntent={eventId:randomUUID(),driverId,fence,roomId:room,revision:0,sequence:1,action:{kind:'cab-buy',assetId:'cab-a'}};
  const result=await rpc<DriverOutcome>('commit',{driverId,intent:buy});success(result);
  return {driverId,fence,room,progress:result.progress};
}
function batch(driverId:string,fence:string,roomId:string,_walletSequence:number,startMs:number,endMs:number):CabIncomeStage{
  return {eventId:randomUUID(),driverId,fence,roomId,sequence:1,intervals:[{assetId:'cab-a',startMs,endMs}]};
}
function cabIntent(stage:CabIncomeStage,revision:number):EconomyIntent{
  return {eventId:stage.eventId,driverId:stage.driverId,fence:stage.fence,roomId:stage.roomId,sequence:revision+1,revision,
    action:{kind:'cab-income',intervals:stage.intervals}};
}
type Message={type:string;[key:string]:any};
function connect(path:string,guest=false){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];
  const input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);
    if(guest&&message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
  });
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}

try{
  child=start();await ready();
  const simulation=await post<{initial:DriverProgress;persisted:DriverProgress;writes:EconomyIntent[];stages:CabIncomeStage[];barrier:number;failedDrained:boolean;failedQueue:number}>('/__cab-stage/rejected-head',{});
  assert.equal(simulation.stages.length,1);assert.equal(simulation.writes.length,3);
  assert.equal(simulation.writes[1].action.kind,'cab-income');assert.equal(simulation.writes[1].revision,0);
  assert.equal(simulation.writes[1].sequence,5);assert.equal(simulation.writes[2].action.kind,'progress');
  assert.equal(simulation.persisted.cash,simulation.initial.cash+1+100+1_000);
  assert.equal(simulation.persisted.eligibleIncome,simulation.initial.eligibleIncome+1+100+1_000);
  assert.ok(simulation.persisted.unlocked.includes('region-oakland'));
  assert.equal(simulation.barrier,99,'discarded later drafts do not complete the barrier before the stage');
  assert.equal(simulation.failedDrained,true);assert.equal(simulation.failedQueue,0,'failed cab income leaves no abandoned in-memory queue');
  const delayed=await post<{initial:DriverProgress;persisted:DriverProgress;writes:EconomyIntent[];barrier:number}>('/__cab-stage/delayed-income',{});
  assert.equal(delayed.writes.length,3);assert.equal(delayed.writes[0].action.kind,'cab-income');
  assert.equal(delayed.persisted.cash,delayed.initial.cash+6-7+100+1_000);
  assert.equal(delayed.persisted.eligibleIncome,delayed.initial.eligibleIncome+6+100+1_000);
  assert.ok(delayed.persisted.unlocked.includes('region-oakland'));
  assert.equal(delayed.persisted.cybercabs!.assets[0].gross,6);
  assert.equal(delayed.persisted.cybercabs!.assets[0].lastEndMs,480);
  assert.equal(delayed.barrier,42,'later progress and independent awards retain the authoritative cab credit');
  const ordering=await post<{beforeRelease:{attempted:number[];accepted:number[]};attempted:number[];accepted:number[];persisted:DriverProgress}>('/__cab-stage/stage-order',{});
  assert.deepEqual(ordering.beforeRelease,{attempted:[1],accepted:[]},'an uncertain earlier stage holds back later stages');
  assert.deepEqual(ordering.attempted,[1,2]);assert.deepEqual(ordering.accepted,[1,2]);
  assert.equal(ordering.persisted.cybercabs!.assets[0].lastEndMs,480);

  // A lost stage reply is retried by ID. Process death after acceptance drains
  // the stage even though it was never submitted as a wallet intent.
  const a=await seed(),first=batch(a.driverId,a.fence,a.room,2,0,4_800_000);
  await until(async()=>(await post<{total:number}>('/__cab-stage/total',{})).total===5_000,'initial outbox delivery');
  await post('/__cab-stage/lose-reply',{room:a.room});
  assert.deepEqual(await stage(first),{threw:true});assert.equal(await stage(first),'accepted');
  assert.equal(await stage({...first,intervals:[{...first.intervals[0],endMs:4_800_001}]}),'conflict');
  assert.ok((await keys(a.room,a.driverId)).includes(`cab-stage:${a.driverId}:${first.eventId}`));
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>{const state=await inspect(a.driverId);return state.progress.cybercabs!.assets[0].gross===20_000;},'orphan stage recovery');
  const recovered=await inspect(a.driverId);
  assert.equal(recovered.progress.cash,a.progress.cash+30_000);assert.equal(recovered.progress.eligibleIncome,a.progress.eligibleIncome+30_000);
  assert.deepEqual(recovered.progress.unlocked.filter(id=>id.startsWith('region-')),['region-oakland','region-peninsula','region-san-jose']);
  assert.deepEqual([recovered.progress.cybercabs!.assets[0].remainder,recovered.progress.cybercabs!.assets[0].lastEndMs,recovered.progress.cybercabs!.assets[0].revenueAwarded],[0,4_800_000,true]);
  await until(async()=>(await post<{total:number}>('/__cab-stage/total',{})).total===35_000,'recovered income outbox delivery');
  assert.equal(await stage(first),'superseded','a sealed fence cannot re-stage a compacted batch');
  await pause(1100);assert.equal((await post<{total:number}>('/__cab-stage/total',{})).total,35_000,'recovery credits global income only once');

  // Cross-room acquire must drain stages before sealing and handing off.
  const b=await seed(),second=batch(b.driverId,b.fence,b.room,2,0,100);
  assert.equal(await stage(second),'accepted');
  const laterProgress=structuredClone(b.progress);laterProgress.cash-=10;
  const later:EconomyIntent={eventId:randomUUID(),driverId:b.driverId,fence:b.fence,roomId:b.room,sequence:2,revision:1,
    action:{kind:'progress',progress:laterProgress}};
  success(await rpc<DriverOutcome|null>('submit',{room:b.room,driverId:b.driverId,intent:later}));
  assert.deepEqual(await rpc('ack',{room:b.room,driverId:b.driverId,intent:later}),{ok:true});
  assert.equal((await inspect(b.driverId)).sequence,2);
  const nextFence=randomUUID(),newRoom=`next-${randomUUID().slice(0,8)}`;
  const moved=await rpc<{revision:number;sequence:number;progress:DriverProgress}>('acquire',{driverId:b.driverId,fence:nextFence,room:newRoom},15_000);
  assert.equal(moved.progress.cash,b.progress.cash-10+8_000);assert.equal(moved.progress.cybercabs!.assets[0].lastEndMs,100);
  assert.equal(moved.progress.cybercabs!.assets[0].remainder,3_000_000);
  assert.equal(moved.sequence,3);assert.equal(await stage(second),'superseded');
  const stale=cabIntent(second,moved.revision);
  assert.deepEqual(await rpc<DriverOutcome>('commit',{driverId:b.driverId,intent:stale}),{ok:false,reason:'superseded'});
  const resumed=batch(b.driverId,nextFence,newRoom,3,100,240);assert.equal(await stage(resumed),'accepted');
  const resumedIntent=cabIntent(resumed,moved.revision);
  const resumedOutcome=await rpc<DriverOutcome>('submit',{room:newRoom,driverId:b.driverId,intent:resumedIntent});success(resumedOutcome);
  assert.equal(resumedOutcome.progress.cash,b.progress.cash-9+8_000);assert.equal(resumedOutcome.progress.cybercabs!.assets[0].remainder,0);
  assert.deepEqual(await rpc('ack',{room:newRoom,driverId:b.driverId,intent:resumedIntent}),{ok:true});

  // A committed profile result whose reply is lost is reconciled exactly once
  // from the pending journal and receipt after a process restart.
  const c=await seed(),third=batch(c.driverId,c.fence,c.room,2,0,240);
  assert.equal(await stage(third),'accepted');await rpc('arm',{driverId:c.driverId,fault:'lost-reply'});
  const submitted=cabIntent(third,1);
  assert.equal(await rpc<DriverOutcome|null>('submit',{room:c.room,driverId:c.driverId,intent:submitted}),null);
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>{const state=await inspect(c.driverId);return state.progress.cybercabs!.assets[0].gross===1;},'lost profile reply recovery');
  const after=await inspect(c.driverId);assert.equal(after.progress.cash,c.progress.cash+1+8_000);
  await pause(1200);assert.equal((await inspect(c.driverId)).progress.cash,after.progress.cash);
  assert.equal((await inspect(c.driverId)).progress.cybercabs!.assets[0].lastEndMs,240);

  // Staging is independent of a blocked preceding wallet write. A different
  // driver can commit while both this predecessor and its later cab stage wait.
  const d=await seed(),other=await seed(),fourth=batch(d.driverId,d.fence,d.room,3,0,240);
  const earlierProgress=structuredClone(d.progress);earlierProgress.cash-=123;
  const earlier:EconomyIntent={eventId:randomUUID(),driverId:d.driverId,fence:d.fence,roomId:d.room,revision:1,sequence:2,
    action:{kind:'progress',progress:earlierProgress}};
  await rpc('arm',{driverId:d.driverId,fault:'hold-before'});
  const held=rpc('submit',{room:d.room,driverId:d.driverId,intent:earlier},30_000);void held.catch(()=>{});
  await until(async()=>(await rpc<{held:boolean}>('fault-state',{driverId:d.driverId})).held,'preceding profile write held');
  assert.equal(await stage(fourth),'accepted');
  assert.ok((await keys(d.room,d.driverId)).includes(`cab-stage:${d.driverId}:${fourth.eventId}`));
  const independent:EconomyIntent={eventId:randomUUID(),driverId:other.driverId,fence:other.fence,roomId:other.room,revision:1,sequence:2,
    action:{kind:'cab-paint',assetId:'cab-a',paint:'mint'}};
  success(await rpc<DriverOutcome>('commit',{driverId:other.driverId,intent:independent}));
  assert.equal((await inspect(other.driverId)).progress.cash,other.progress.cash-18);
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>{const state=await inspect(d.driverId);return state.progress.cybercabs!.assets[0].gross===1;},'blocked predecessor and later stage recovery');
  assert.equal((await inspect(d.driverId)).progress.cash,d.progress.cash-123+1+8_000);

  // Overflow closes the observed tail and stages it behind 32 speculative
  // events, even while the first profile write remains blocked.
  type OverloadResult={queue:number;failed:boolean;closes:number;overloadApplied:boolean;final:CabIncomeStage[];open:number};
  async function overload(driver:Awaited<ReturnType<typeof seed>>,invalidHead:boolean,closedCount=0){
    await rpc('arm',{driverId:driver.driverId,fault:'hold-before'});
    const result=await post<OverloadResult>('/__cab-stage/overload',{...driver,invalidHead,closedCount});
    assert.equal(result.queue,32,'raw intervals do not reserve speculative wallet positions');
    assert.equal(result.final.length,1+(closedCount?1:0),'the final intervals add at most two bounded batches');
    assert.equal(result.failed,true);assert.equal(result.closes,1);assert.equal(result.overloadApplied,false);assert.equal(result.open,0);
    const tail=result.final.at(-1)!;
    assert.equal(tail.sequence,1+(closedCount?1:0));assert.deepEqual(tail.intervals,[{assetId:'cab-a',startMs:1000,endMs:1240}]);
    if(closedCount){assert.equal(result.final[0].sequence,1);assert.equal(result.final[0].intervals.length,closedCount);}
    await until(async()=>(await rpc<{held:boolean}>('fault-state',{driverId:driver.driverId})).held,'overloaded predecessor held');
    await until(async()=>{const saved=await keys(driver.room,driver.driverId);return result.final.every(item=>saved.includes(`cab-stage:${driver.driverId}:${item.eventId}`));},'overload tail durably staged');
    return tail;
  }
  const overloaded=await seed(),overloadObserver=connect(`/api/room/${overloaded.room}`,true);
  await until(()=>overloadObserver.input.active,'overload observer joins');
  const overloadTail=await overload(overloaded,false,128);
  const observedTick=overloadObserver.input.tick,applied=overloadObserver.input.control?.appliedSeq??0;
  const inputTimer=setInterval(()=>{if(overloadObserver.input.ready)overloadObserver.input.send(NEUTRAL);},100);
  try{await until(()=>overloadObserver.input.tick>=observedTick+8&&(overloadObserver.input.control?.appliedSeq??0)>applied,
    'other player receives room ticks and input while overload drains');}finally{clearInterval(inputTimer);}
  assert.equal((await rpc<{held:boolean}>('fault-state',{driverId:overloaded.driverId})).held,true);
  await stop(child);child=undefined;child=start();await ready();
  const overloadFence=randomUUID(),overloadRoom=`overload-next-${randomUUID().slice(0,8)}`;
  const overloadRecovered=await rpc<{sequence:number;progress:DriverProgress}>('acquire',
    {driverId:overloaded.driverId,fence:overloadFence,room:overloadRoom},15_000);
  assert.equal(overloadRecovered.sequence,4);assert.equal(overloadRecovered.progress.cash,overloaded.progress.cash+8_000);
  assert.equal(overloadRecovered.progress.cybercabs!.assets[0].gross,1);
  assert.equal(overloadRecovered.progress.cybercabs!.assets[0].lastEndMs,1240);
  assert.equal(overloadRecovered.progress.cybercabs!.assets[0].remainder,3_840_000);
  assert.equal(await stage({eventId:overloadTail.eventId,driverId:overloaded.driverId,fence:overloaded.fence,
    roomId:overloaded.room,sequence:overloadTail.sequence,intervals:[{assetId:'cab-a',startMs:1000,endMs:1240}]}),'superseded');
  const overloadAgain=await rpc<{progress:DriverProgress}>('acquire',
    {driverId:overloaded.driverId,fence:randomUUID(),room:`overload-again-${randomUUID().slice(0,8)}`},15_000);
  assert.equal(overloadAgain.progress.cash,overloadRecovered.progress.cash);assert.equal(overloadAgain.progress.cybercabs!.assets[0].gross,1);

  // An invalid predecessor can invalidate the speculative wallet entirely.
  // The observed tail still survives and is applied to the committed wallet.
  const invalidOverload=await seed(),invalidTail=await overload(invalidOverload,true);
  await rpc('release',{driverId:invalidOverload.driverId});
  await until(async()=>{const state=await post<{processing:boolean;staging:number}>('/__cab-stage/overload-state',{room:invalidOverload.room});
    return !state.processing&&state.staging===0;},'failed overloaded queue drains');
  assert.ok((await keys(invalidOverload.room,invalidOverload.driverId)).includes(`cab-stage:${invalidOverload.driverId}:${invalidTail.eventId}`));
  await rpc('producer-gone',{room:invalidOverload.room,driverId:invalidOverload.driverId,fence:invalidOverload.fence});
  const invalidRecovered=await rpc<{sequence:number;progress:DriverProgress}>('acquire',
    {driverId:invalidOverload.driverId,fence:randomUUID(),room:`overload-invalid-${randomUUID().slice(0,8)}`},15_000);
  assert.equal(invalidRecovered.sequence,3);assert.equal(invalidRecovered.progress.cash,invalidOverload.progress.cash+1+8_000);
  assert.equal(invalidRecovered.progress.earned,invalidOverload.progress.earned);
  assert.equal(invalidRecovered.progress.cybercabs!.assets[0].gross,1);

  // An alarm that finds a hung profile must return. A later alarm must find a
  // different driver's orphaned stage that was added after the first scan.
  const sharedRoom=`alarm-${randomUUID().slice(0,8)}`,slow=await seed(sharedRoom),orphan=await seed(sharedRoom);
  const slowProgress=structuredClone(slow.progress);slowProgress.cash-=1;
  const slowIntent:EconomyIntent={eventId:randomUUID(),driverId:slow.driverId,fence:slow.fence,roomId:sharedRoom,
    revision:1,sequence:2,action:{kind:'progress',progress:slowProgress}};
  await rpc('arm',{driverId:slow.driverId,fault:'hold-lost-reply'});
  await post('/__cab-stage/inject-pending',{room:sharedRoom,intent:slowIntent});
  await until(async()=>(await rpc<{held:boolean}>('fault-state',{driverId:slow.driverId})).held,'slow profile RPC held');
  type AlarmState={calls:number;active:boolean;recovering:string[]};
  const alarmState=()=>post<AlarmState>('/__cab-stage/alarm-state',{room:sharedRoom});
  await until(async()=>{const state=await alarmState();return state.calls>=1&&state.recovering.includes(slow.driverId);},'alarm reaches held profile');
  // The call counter increments before the scan. Ensure that scan has ended;
  // otherwise the new stage can legitimately be recovered by the first call.
  let callsBeforeStage=0;
  await until(async()=>{const state=await alarmState();if(state.active)return false;callsBeforeStage=state.calls;return true;},'first held-flight alarm returns');
  const started=(await rpc<{started:number}>('fault-state',{driverId:slow.driverId})).started;
  const orphanStage=batch(orphan.driverId,orphan.fence,sharedRoom,2,0,240);
  assert.equal(await stage(orphanStage),'accepted');
  await rpc('producer-gone',{room:sharedRoom,driverId:orphan.driverId,fence:orphan.fence});
  await until(async()=>{const state=await inspect(orphan.driverId);return state.progress.cybercabs!.assets[0].gross===1;},'later alarm recovers orphan while first profile hangs');
  await until(async()=>!(await keys(sharedRoom,orphan.driverId)).some(key=>
    ['cab-stage:','pending:','unacked:','cleanup:','frozen:'].some(prefix=>key.startsWith(`${prefix}${orphan.driverId}:`))),
  'orphan settlement cleanup');
  const settled=await inspect(orphan.driverId),stillHeld=await rpc<{held:boolean;started:number}>('fault-state',{driverId:slow.driverId});
  assert.ok((await alarmState()).calls>callsBeforeStage,'the watchdog ran another alarm after the stage arrived');
  assert.equal(stillHeld.held,true);assert.equal(stillHeld.started,started,'later alarms do not duplicate the held profile RPC');
  assert.equal(settled.sequence,2);assert.equal(settled.progress.cash,orphan.progress.cash+1+8_000);
  assert.equal(settled.progress.cybercabs!.assets[0].lastEndMs,240);
  await until(async()=>(await alarmState()).calls>=callsBeforeStage+2,'successive watchdog wakes while profile remains held');
  assert.equal((await inspect(orphan.driverId)).progress.cash,settled.progress.cash,'later alarms do not credit income twice');
  assert.equal((await rpc<{started:number}>('fault-state',{driverId:slow.driverId})).started,started);
  await rpc('release',{driverId:slow.driverId});
  await until(async()=>!(await keys(sharedRoom,slow.driverId)).includes(`pending:${slow.driverId}:${slowIntent.eventId}`),
    'detached rejection releases flight and watchdog retries');
  assert.equal((await inspect(slow.driverId)).progress.cash,slowProgress.cash,'lost reply retry does not apply progress twice');
  assert.equal((await rpc<{started:number}>('fault-state',{driverId:slow.driverId})).started,started+1);
  await until(async()=>!(await alarmState()).recovering.includes(slow.driverId),'completed recovery flight is removed');

  // Stop after the stage-to-intent transaction, before the profile commits.
  const e=await seed(),fifth=batch(e.driverId,e.fence,e.room,2,0,240);
  assert.equal(await stage(fifth),'accepted');await rpc('arm',{driverId:e.driverId,fault:'hold-before'});
  const pending=rpc('submit',{room:e.room,driverId:e.driverId,intent:cabIntent(fifth,1)},30_000);void pending.catch(()=>{});
  await until(async()=>(await rpc<{held:boolean}>('fault-state',{driverId:e.driverId})).held,'cab profile write held');
  const pendingKeys=await keys(e.room,e.driverId);
  assert.ok(pendingKeys.includes(`pending:${e.driverId}:${fifth.eventId}`));
  assert.ok(!pendingKeys.includes(`cab-stage:${e.driverId}:${fifth.eventId}`));
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>{const state=await inspect(e.driverId);return state.progress.cybercabs!.assets[0].gross===1;},'converted stage before profile write');
  assert.equal((await inspect(e.driverId)).progress.cash,e.progress.cash+1+8_000);

  // A later staged interval cannot settle before an earlier staged interval.
  const f=await seed(),sixth=batch(f.driverId,f.fence,f.room,2,0,240);assert.equal(await stage(sixth),'accepted');
  const seventh={...batch(f.driverId,f.fence,f.room,3,240,480),sequence:2};assert.equal(await stage(seventh),'accepted');
  assert.equal(await rpc<DriverOutcome|null>('submit',{room:f.room,driverId:f.driverId,intent:cabIntent(seventh,1)}),null);
  assert.equal((await inspect(f.driverId)).sequence,1);
  const ordered=await rpc<{progress:DriverProgress}>('acquire',{driverId:f.driverId,fence:randomUUID(),room:`ordered-${randomUUID().slice(0,8)}`},15_000);
  assert.equal(ordered.progress.cybercabs!.assets[0].lastEndMs,480);
  assert.equal(ordered.progress.cybercabs!.assets[0].gross,2);

  // A rejected income event retains its receipt and blocks fence handoff; it
  // must not be compacted into an apparent success or silently abandoned.
  const g=await seed(),bad=batch(g.driverId,g.fence,g.room,2,0,240);
  bad.intervals[0].assetId='missing-cab';assert.equal(await stage(bad),'accepted');
  assert.deepEqual(await rpc<DriverOutcome>('submit',{room:g.room,driverId:g.driverId,intent:cabIntent(bad,1)}),{ok:false,reason:'invalid'});
  assert.deepEqual(await rpc('ack',{room:g.room,driverId:g.driverId,intent:cabIntent(bad,1)}),{ok:false},'a rejected income receipt cannot be compacted');
  await assert.rejects(rpc('acquire',{driverId:g.driverId,fence:randomUUID(),room:`blocked-${randomUUID().slice(0,8)}`},15_000));
  assert.equal((await inspect(g.driverId)).fence,g.fence);
  const failedKeys=await keys(g.room,g.driverId);
  assert.ok(failedKeys.includes(`unacked:${g.driverId}:${bad.eventId}`));
  assert.ok(failedKeys.includes(`intent:${bad.eventId}`));

  // A held stage response affects this wallet only; real room snapshots and
  // input acknowledgements continue for a second connected driver.
  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  chat.socket.send(JSON.stringify({type:'hello',name:'Stage driver'}));await until(()=>!!chat.last('ready'),'chat ready');
  chat.socket.send(JSON.stringify({type:'save'}));await until(()=>!!chat.last('recovery'),'saved code');
  const code=chat.last('recovery')!.code as string;chat.socket.close();
  await until(()=>chat.socket.readyState===WebSocket.CLOSED,'chat closes');
  const liveId=randomUUID(),liveRoom=`live-${randomUUID().slice(0,8)}`;
  await rpc('associate',{driverId:liveId,code});await rpc('acquire',{driverId:liveId,fence:randomUUID()});
  await rpc('fund',{driverId:liveId,seedCash:25_000});
  const owner=connect(`/api/room/${liveRoom}`),observer=connect(`/api/room/${liveRoom}`,true);
  await until(()=>!!owner.last('welcome')&&!!owner.last('wallet'),'owner joins');
  owner.socket.send(JSON.stringify({type:'identity',code,requestId:1}));
  await until(()=>owner.messages.some(message=>message.type==='identityResult'&&message.ok)&&owner.input.active,'owner saved identity');
  await until(()=>observer.input.active&&!!observer.last('state'),'observer joins');
  owner.socket.send(JSON.stringify({type:'cab',action:'buy',requestId:2}));
  await until(()=>owner.messages.some(message=>message.type==='cabResult'&&message.requestId===2&&message.ok),'cab purchased');
  const assetId=(await inspect(liveId)).progress.cybercabs!.assets[0].id;
  await until(()=>owner.last('state')?.world.entities.some((entity:{cab?:{assetId:string}})=>entity.cab?.assetId===assetId),'cab dispatched');
  await post('/__cab-stage/hold-reply',{room:liveRoom});
  owner.input.send({...NEUTRAL,steer:1});await pause(500);owner.input.send(NEUTRAL);
  await until(async()=>(await post<{held:boolean}>('/__cab-stage/hold-state',{room:liveRoom})).held,'cab stage reply held',15_000);
  const beforeTick=observer.input.tick,sequence=observer.input.send({...NEUTRAL,steer:1});
  await until(()=>observer.input.tick>=beforeTick+8&&(observer.input.control?.appliedSeq??0)>=sequence,'other driver keeps receiving snapshots and input acknowledgements');
  assert.equal((await post<{held:boolean}>('/__cab-stage/hold-state',{room:liveRoom})).held,true);
  await rpc('arm',{driverId:liveId,fault:'hold-before'});
  await post('/__cab-stage/release',{room:liveRoom});
  await until(async()=>(await rpc<{held:boolean}>('fault-state',{driverId:liveId})).held,'live cab profile RPC held');
  const profileHeldTick=observer.input.tick,profileHeldSequence=observer.input.send(NEUTRAL);
  await until(()=>observer.input.tick>=profileHeldTick+8&&(observer.input.control?.appliedSeq??0)>=profileHeldSequence,
    'room physics continues while profile RPC is held');
  assert.equal((await rpc<{held:boolean}>('fault-state',{driverId:liveId})).held,true);
  await rpc('release',{driverId:liveId});
  await until(async()=>(await inspect(liveId)).progress.cybercabs!.assets[0].gross>0,'cab income commits after held stage reply');

  console.log('PASS: cab stage rebase, stalled writers, lost replies, process restart, exactly-once settlement, and cross-room fencing.');
}finally{for(const socket of sockets)try{socket.close();}catch{}if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

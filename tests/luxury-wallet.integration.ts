// Isolated local Wrangler fixture. Never run against a deployed game.
// pnpm exec tsx tests/luxury-wallet.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join as joinPath, resolve } from 'node:path';
import { LUXURY_CATALOG, luxuryPurchaseAwards, type LuxuryVehicleId } from '../shared/luxury';
import { UPGRADES } from '../shared/upgrades';
import { NEUTRAL } from '../shared/game';
import { RoomInputClient } from './room-input-client';
import type { DriverOutcome, DriverProgress, EconomyIntent } from '../worker/driver-profile';

const FUNDS = 20_000_000;
const pause = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check:()=>boolean|Promise<boolean>, label:string, timeout=15_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline) { if(await check()) return; await pause(30); }
  throw new Error(`Timed out: ${label}`);
}
async function freePort() {
  const server=createServer();
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await pause(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}
const dir=await mkdtemp(joinPath(tmpdir(),'tesland-wallet-'));
const port=await freePort(), base=`http://127.0.0.1:${port}`, config=joinPath(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-wallet-test',main:resolve('tests/fixtures/luxury-wallet-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*']},
  durable_objects:{bindings:[
    {name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
  ]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let child:ChildProcess|undefined;
const sockets:WebSocket[]=[];
let logs='';
function start() {
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',joinPath(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};
  c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready() {
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited during startup:\n${logs}`);
    try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
  },'Wrangler startup',30_000);
}
async function rpc<T>(method:string,body:object,timeout=15_000):Promise<T> {
  const response=await fetch(`${base}/__wallet-test/${method}`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),
  });
  if(!response.ok)throw new Error(`Fixture ${method} returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
type RecordState={revision:number;sequence:number;fence:string;progress:DriverProgress};
type Acquisition={revision:number;sequence:number;progress:DriverProgress;resumed:boolean};
type FaultState={started:number;held:boolean;heldAction?:EconomyIntent['action']};
const driver=()=>randomUUID();
const acquire=(driverId:string,fence:string,room='fixture')=>rpc<Acquisition>('acquire',{driverId,fence,room});
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const arm=(driverId:string,fault:'hold-before'|'hold-reject'|'fail-before'|'lost-reply'|'hold-lost-reply')=>rpc<FaultState>('arm',{driverId,fault});
const faultState=(driverId:string)=>rpc<FaultState>('fault-state',{driverId});
const release=(driverId:string)=>rpc('release',{driverId});
const intent=(driverId:string,fence:string,revision:number,vehicle:LuxuryVehicleId,sequence=revision+1):EconomyIntent=>({eventId:randomUUID(),driverId,fence,roomId:'fixture',revision,sequence,action:{kind:'luxury',vehicle}});
const commit=(item:EconomyIntent)=>rpc<DriverOutcome>('commit',{driverId:item.driverId,intent:item});
const scoped=(room:string,item:EconomyIntent):EconomyIntent=>({...item,roomId:room});
const submit=(room:string,item:EconomyIntent)=>rpc<DriverOutcome|null>('submit',{room,driverId:item.driverId,intent:scoped(room,item)});
const status=(room:string,item:EconomyIntent)=>rpc<DriverOutcome|null>('status',{room,driverId:item.driverId,eventId:item.eventId});
const ack=(room:string,item:EconomyIntent)=>rpc<{ok?:boolean;threw?:boolean}>('ack',{room,driverId:item.driverId,intent:scoped(room,item)});
const profileKeys=(driverId:string)=>rpc<string[]>('profile-keys',{driverId});
const economyKeys=(room:string,driverId:string)=>rpc<string[]>('economy-keys',{room,driverId});
const pending=(room:string,driverId:string)=>rpc<EconomyIntent[]>('pending',{room,driverId});
const freeze=(room:string,driverId:string,fence:string)=>rpc<{ok:boolean}>('freeze',{room,driverId,fence},5_000);
const getVehicle=(id:LuxuryVehicleId)=>LUXURY_CATALOG.find(item=>item.id===id)!;
function purchaseCash(before:number,id:LuxuryVehicleId,owned:LuxuryVehicleId[]=[],unlocked:string[]=[]) {
  return before-getVehicle(id).price+luxuryPurchaseAwards(id,owned,unlocked).reduce((sum,item)=>sum+item.reward,0);
}
function success(outcome:DriverOutcome|null):asserts outcome is Extract<DriverOutcome,{ok:true}> {assert.ok(outcome?.ok,JSON.stringify(outcome));}
type Message={type:string;[key:string]:any};
function connect(path:string,guest=false) {
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];
  const input=new RoomInputClient(socket);
  sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;
    input.observe(message);
    if(guest&&message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
    Object.defineProperty(message,'_receivedAt',{value:performance.now()});
    messages.push(message);
  });
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
function send(client:ReturnType<typeof connect>,message:object){
  const value=message as Message;
  if(value.type==='input'){client.input.send(value.input,{seq:value.seq});return;}
  if(value.type==='luxury'&&value.action==='collect'){client.input.action({type:'luxury',action:'collect',vehicle:value.vehicle,requestId:value.requestId});return;}
  client.socket.send(JSON.stringify(message));
}
const applied=(message?:Message)=>message?.control?.appliedSeq??0;
async function postIdentityState(client:ReturnType<typeof connect>,requestId:number){
  const result=client.messages.find(message=>message.type==='identityResult'&&message.requestId===requestId&&message.ok);
  assert.ok(result,`identity ${requestId} succeeded`);
  await until(()=>!!client.last('state')&&client.last('state')!._receivedAt>result._receivedAt,`control snapshot after identity ${requestId}`);
}
type TimingSample={elapsedMs:number;worldSeconds:number;worldRate:number;maxSnapshotGapMs:number;maxAckGapMs:number;maxInputLatencyMs:number;inputLatenciesMs:number[];snapshots:number;acks:number;lastSeq:number};
/** Sample the actual observer socket and input acknowledgements at 10 Hz. */
async function measureRoom(client:ReturnType<typeof connect>,startSeq:number,durationMs=1250):Promise<TimingSample> {
  const start=performance.now(),startIndex=client.messages.length,startWorld=client.last('state')!.world.time as number;
  const sent=new Map<number,number>();
  let seq=startSeq;
  const timer=setInterval(()=>{sent.set(++seq,performance.now());send(client,{type:'input',seq,input:NEUTRAL});},100);
  try { await pause(durationMs); } finally { clearInterval(timer); }
  const end=performance.now();
  await until(()=>applied(client.last('state'))>=seq,'sample input acknowledgements');
  const allStates=client.messages.slice(startIndex).filter(message=>message.type==='state');
  const states=allStates.filter(message=>message._receivedAt<=end);
  const gaps=(times:number[])=>Math.max(...times.slice(1).map((value,index)=>value-times[index]));
  const snapshotTimes=[start,...states.map(state=>state._receivedAt as number),end];
  let lastAck=startSeq;
  const ackTimes=[start];
  for(const state of states)if(applied(state)>lastAck){lastAck=applied(state);ackTimes.push(state._receivedAt as number);}
  ackTimes.push(end);
  const inputLatenciesMs=[...sent].map(([sentSeq,sentAt])=>{
    const acknowledged=allStates.find(state=>applied(state)>=sentSeq);
    assert.ok(acknowledged,`input ${sentSeq} has an acknowledgement`);
    return (acknowledged._receivedAt as number)-sentAt;
  });
  const elapsedMs=end-start,worldSeconds=(states.at(-1)?.world.time??startWorld)-startWorld;
  return {elapsedMs,worldSeconds,worldRate:worldSeconds/(elapsedMs/1000),
    maxSnapshotGapMs:gaps(snapshotTimes),maxAckGapMs:gaps(ackTimes),maxInputLatencyMs:Math.max(...inputLatenciesMs),inputLatenciesMs,snapshots:states.length,acks:ackTimes.length-2,lastSeq:seq};
}
async function savedCode(name:string) {
  const chat=connect('/api/chat');
  await until(()=>chat.socket.readyState===WebSocket.OPEN,`${name} chat opens`);
  send(chat,{type:'hello',name});
  await until(()=>!!chat.last('ready'),`${name} identity ready`);
  send(chat,{type:'save'});
  await until(()=>!!chat.last('recovery'),`${name} recovery code`);
  const code=chat.last('recovery')!.code as string;
  chat.socket.close();await until(()=>chat.socket.readyState===WebSocket.CLOSED,`${name} chat closes`);
  return code;
}
async function savedDriver(name:string) {
  const code=await savedCode(name),id=driver();
  assert.ok(await rpc('associate',{driverId:id,code}),'test code bound to seeded wallet');
  await acquire(id,randomUUID());
  return {id,code};
}
async function join(room:string,code:string) {
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),'guest room and wallet ready');
  send(client,{type:'identity',code,requestId:1});
  await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===1),'saved wallet attachment');
  const result=client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!;
  assert.equal(result.ok,true,JSON.stringify(result));
  await postIdentityState(client,1);
  await until(()=>client.input.ready,'saved driver control snapshot');
  return client;
}
async function barrier(client:ReturnType<typeof connect>,token:number){
  send(client,{type:'sync',token});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),`barrier ${token}`);
}
async function luxury(client:ReturnType<typeof connect>,action:'buy'|'collect',vehicle:LuxuryVehicleId,requestId:number) {
  send(client,{type:'luxury',action,vehicle,requestId});
  await until(()=>client.messages.some(message=>message.type==='luxuryResult'&&message.requestId===requestId),`${action} ${vehicle}`);
  return client.messages.find(message=>message.type==='luxuryResult'&&message.requestId===requestId)!;
}

async function verifyAutonomyWallet(){
  const owner=await savedDriver(`Pilot${randomUUID().slice(0,6)}`),room=`autonomy-${randomUUID().slice(0,8)}`;
  let client=await join(room,owner.code);
  const playerId=client.last('welcome')!.id as string;
  await rpc('workshop',{room,playerId});await pause(450);await barrier(client,700);
  const before=await inspect(owner.id);
  await arm(owner.id,'hold-reject');
  send(client,{type:'upgrade',upgrade:'autonomyJump',requestId:699});
  await until(async()=>(await faultState(owner.id)).held,'rejected upgrade waits for the wallet');
  await release(owner.id);
  await until(()=>client.messages.some(m=>m.type==='upgradeResult'&&m.requestId===699),'rejected upgrade result');
  assert.equal(client.messages.find(m=>m.type==='upgradeResult'&&m.requestId===699)!.ok,false);
  assert.equal((await inspect(owner.id)).progress.cash,before.progress.cash,'rejected purchase does not charge');
  await pause(450);
  await arm(owner.id,'hold-before');
  send(client,{type:'upgrade',upgrade:'autonomyJump',requestId:701});
  await until(async()=>(await faultState(owner.id)).held,'Leap wallet commit held');
  const current=()=>client.last('state')!.world.entities.find((item:Message)=>item.driver===playerId);
  assert.equal(current().upgrades.autonomyJump,false,'pending upgrade is not usable');
  assert.equal((await inspect(owner.id)).progress.cash,before.progress.cash,'pending upgrade is not charged');
  await release(owner.id);
  await until(()=>client.messages.some(m=>m.type==='upgradeResult'&&m.requestId===701),'Leap purchase result');
  assert.equal(client.messages.find(m=>m.type==='upgradeResult'&&m.requestId===701)!.ok,true);
  await pause(450);
  send(client,{type:'upgrade',upgrade:'autonomySky',requestId:702});
  await until(()=>client.messages.some(m=>m.type==='upgradeResult'&&m.requestId===702),'Plaid purchase result');
  assert.equal(client.messages.find(m=>m.type==='upgradeResult'&&m.requestId===702)!.ok,true);
  await barrier(client,703);
  const after=await inspect(owner.id);
  assert.equal(after.progress.cash,before.progress.cash-UPGRADES.autonomyJump.price-UPGRADES.autonomySky.price);
  assert.equal(after.progress.vehicles.roadster.upgrades.autonomyJump,true);
  assert.equal(after.progress.vehicles.roadster.upgrades.autonomySky,true);
  client.socket.close();await until(()=>client.socket.readyState===WebSocket.CLOSED,'owner disconnects');
  client=await join(`autonomy-rejoin-${randomUUID().slice(0,8)}`,owner.code);
  const restoredPlayer=client.last('welcome')!.id;
  await until(()=>{
    const car=client.last('state')?.world.entities.find((item:Message)=>item.driver===restoredPlayer);
    return car?.upgrades.autonomyJump===true&&car.upgrades.autonomySky===true;
  },'both self-driving upgrades restore after reconnect');
  console.log('PASS: self-driving upgrades wait for wallet commit, charge once, and restore to the saved vehicle');
}

async function verifyRolloutRetry(){
  // A previous chat version cannot accept either RPC. A failed dispatch made
  // no claim and must not leave identity retries waiting for release forever.
  const rolloutCode=await savedCode(`Rollout${randomUUID().slice(0,6)}`);
  const rollout=connect(`/api/room/rollout-${randomUUID().slice(0,8)}`,true);
  await until(()=>rollout.messages.some(message=>message.type==='identityResult'&&message.ok),'rollout guest joins');
  await rpc('binding-arm',{bindingStage:'missing-bind'});
  try{
    send(rollout,{type:'identity',code:rolloutCode,requestId:330});
    await until(()=>rollout.messages.some(message=>message.type==='identityResult'&&message.requestId===330),'missing bind returns');
    assert.equal(rollout.messages.find(message=>message.type==='identityResult'&&message.requestId===330)!.ok,false);
    send(rollout,{type:'identity',code:rolloutCode,requestId:331});
    await until(()=>rollout.messages.some(message=>message.type==='identityResult'&&message.requestId===331),'rollout retry does not await missing release');
    assert.equal(rollout.messages.find(message=>message.type==='identityResult'&&message.requestId===331)!.ok,true);
    console.log('PASS: saved-driver retry after unavailable bind RPC');
  }finally{
    await rpc('binding-arm',{bindingStage:'restore'});
    rollout.socket.close();
  }

}

try {
  child=start();await ready();
  if(process.argv.includes('--autonomy-only'))await verifyAutonomyWallet();
  else if(process.argv.includes('--rollout-only'))await verifyRolloutRetry();
  else {

  // Simulated world time crosses three checkpoint windows without a wall-clock
  // wait. Paused orders must not write again; changed timers flush on finish.
  const timers=await rpc<{paused:{counts:number[];writes:DriverProgress[]};active:{counts:number[];writes:DriverProgress[]}}>('checkpoint-simulation',{});
  assert.deepEqual(timers.paused.counts,[0,1,1,1,1,2],'an unchanged paused order does not create periodic writes');
  assert.deepEqual(timers.paused.writes.map(item=>item.order.elapsed),[2,2,2.5],'disconnect flushes newly advanced order time after a paid checkpoint');
  assert.deepEqual(timers.active.counts,[0,1,2,3,3,3],'active OTA time continues to checkpoint');
  assert.deepEqual(timers.active.writes.map(item=>item.ota.remaining),[90,80,70,68],'active OTA remaining time survives disconnect');
  type Rejection={initial:DriverProgress;after:{order:DriverProgress['order'];completed:number;remaining:number};queued:number;queuedBeforeRejection:number;writes:DriverProgress[]};
  const failures=await rpc<{same:Rejection;order:Rejection;renewal:Rejection;closedSame:Rejection;closedOrder:Rejection}>('rejection-simulation',{});
  assert.equal(failures.same.after.order.elapsed,7,'unchanged committed order keeps elapsed time after a rejected write');
  assert.equal(failures.same.after.remaining,95,'the committed OTA period keeps counting down');
  assert.deepEqual(failures.order.after.order,failures.order.initial.order,'a speculative order-stage change rolls back');
  assert.equal(failures.order.after.completed,failures.order.initial.completed,'a speculative completion rolls back');
  assert.equal(failures.renewal.after.remaining,95,'a speculative OTA renewal cannot extend the committed period');
  assert.ok(failures.closedSame.queuedBeforeRejection>=2,'disconnect queues a final checkpoint behind the pending head');
  assert.equal(failures.closedSame.after.order.elapsed,7,'the already-closed session retains valid elapsed time');
  assert.deepEqual(failures.closedOrder.after.order,failures.closedOrder.initial.order,'a final checkpoint cannot retain a speculative order');
  for(const [scenario,result] of Object.entries(failures)){
    assert.equal(result.queued,1,`${scenario}: disconnect queues the preserved timers while acknowledgement is held`);
    assert.equal(result.writes.length,2,`${scenario}: the disconnect checkpoint follows the rejected head`);
    assert.equal(result.writes[1].order.elapsed,result.after.order.elapsed,`${scenario}: the recovered order timer is saved`);
    assert.equal(result.writes[1].ota.remaining,95,`${scenario}: the recovered OTA time is saved`);
  }

  // Concurrent purchases with the same revision cannot both consume one balance.
  const a=driver(), fenceA=randomUUID();
  const initial=await acquire(a,fenceA);assert.equal(initial.progress.cash,FUNDS);
  const a1=intent(a,fenceA,0,'ducati-panigale-v4'),a2=intent(a,fenceA,0,'kawasaki-ninja-h2-carbon',2);
  const results=await Promise.all([commit(a1),commit(a2)]);
  assert.equal(results.filter(r=>r.ok).length,1,'only one concurrent purchase commits');
  assert.equal(results.filter(r=>!r.ok&&r.reason==='revision').length,1,'the stale revision is rejected');
  const winner=results[0].ok?a1:a2, winning=results.find(r=>r.ok)!;success(winning);
  assert.equal(winning.progress.cash,purchaseCash(FUNDS,(winner.action as {vehicle:LuxuryVehicleId}).vehicle));
  assert.deepEqual(await commit(winner),winning,'duplicate event returns its original receipt');
  const altered={...winner,action:{kind:'luxury' as const,vehicle:'bugatti-chiron' as const}};
  assert.deepEqual(await commit(altered),{ok:false,reason:'conflict'},'event ID cannot be reused with a different payload');
  const ownedAgain=intent(a,fenceA,1,(winner.action as {vehicle:LuxuryVehicleId}).vehicle,3);
  assert.deepEqual(await commit(ownedAgain),{ok:false,reason:'owned'});
  const saved=await inspect(a);
  assert.equal(saved.revision,1);assert.equal(saved.progress.cash,winning.progress.cash);
  assert.deepEqual(saved.progress.ownedLuxury,[(winner.action as {vehicle:LuxuryVehicleId}).vehicle]);
  const fenceA2=randomUUID();const resumed=await acquire(a,fenceA2);
  assert.equal(resumed.resumed,true);assert.equal(resumed.progress.cash,winning.progress.cash);
  assert.deepEqual(await commit(winner),winning,'a lost receipt remains replayable after a fence changes');
  assert.deepEqual(await commit(intent(a,fenceA,1,'bugatti-chiron',4)),{ok:false,reason:'superseded'},'stale fence cannot buy');

  // Independent constants check the design's first, model, and collection
  // awards as cash, without deriving the expectation from production helpers.
  const awardsDriver=driver(),awardsFence=randomUUID();await acquire(awardsDriver,awardsFence);
  const awardCases=[
    {vehicle:'ducati-panigale-v4',cash:18_545_000,awards:['luxury-first','luxury-panigale']},
    {vehicle:'kawasaki-ninja-h2-carbon',cash:16_620_000,awards:['luxury-ninja','luxury-collection-2']},
    {vehicle:'lamborghini-temerario',cash:13_660_000,awards:['luxury-temerario']},
    {vehicle:'lamborghini-revuelto',cash:9_320_000,awards:['luxury-revuelto','luxury-collection-4']},
    {vehicle:'bugatti-chiron',cash:2_420_000,awards:['luxury-chiron']},
    {vehicle:'bugatti-tourbillon',cash:8_400_000,awards:['luxury-tourbillon','luxury-collection-6']},
  ] as const;
  for(const [index,test] of awardCases.entries()){
    if(index===5)await rpc('fund',{driverId:awardsDriver}); // Local fixture seed before the final $12m purchase.
    const result=await commit(intent(awardsDriver,awardsFence,index,test.vehicle,index+1));success(result);
    assert.equal(result.progress.cash,test.cash,`${test.vehicle}: price and one-off cash awards`);
    assert.deepEqual(result.awards,test.awards,`${test.vehicle}: exact achievement IDs`);
  }

  // A rejected head must not leave its higher speculative revision frozen forever.
  const orphan=driver(), orphanFence=randomUUID(), orphanRoom=`orphan-${randomUUID()}`;
  await acquire(orphan,orphanFence,orphanRoom);
  const bad={...intent(orphan,orphanFence,0,'ducati-panigale-v4'),action:{kind:'luxury' as const,vehicle:'not-a-vehicle' as LuxuryVehicleId}};
  const tail=intent(orphan,orphanFence,1,'ducati-panigale-v4');
  assert.deepEqual(await submit(orphanRoom,bad),{ok:false,reason:'invalid'});
  assert.equal(await submit(orphanRoom,tail),null,'a successor cannot consume a nonexistent revision');
  assert.deepEqual(await freeze(orphanRoom,orphan,orphanFence),{ok:true},'freeze resolves the rejected head and orphan');
  assert.equal(await status(orphanRoom,tail),null,'freeze compacts the rejected orphan');
  assert.equal((await submit(orphanRoom,tail))?.ok,false,'a compacted orphan cannot be replayed');
  const orphanNext=randomUUID();
  const orphanResumed=await acquire(orphan,orphanNext,orphanRoom);
  assert.equal(orphanResumed.revision,0,'failed sequence left no debit');
  success(await submit(orphanRoom,intent(orphan,orphanNext,0,'ducati-panigale-v4',orphanResumed.sequence+1)));

  // One blocked writer must not hold another driver; its own N+1 waits for N.
  const slow=driver(),fast=driver(),sf=randomUUID(),ff=randomUUID(),room=`slow-${randomUUID()}`;
  await Promise.all([acquire(slow,sf,room),acquire(fast,ff,room)]);
  await arm(slow,'hold-before');
  const first=intent(slow,sf,0,'ducati-panigale-v4'),second=intent(slow,sf,1,'kawasaki-ninja-h2-carbon');
  const slowCall=submit(room,first);
  void slowCall.catch(()=>{});
  try {
    await until(async()=>(await faultState(slow)).held,'slow writer is held');
    const nextCall=submit(room,second);
    void nextCall.catch(()=>{});
    await until(async()=>(await pending(room,slow)).some(item=>item.eventId===second.eventId),'revision N+1 is queued');
    assert.equal(await status(room,second),null,'revision N+1 has not passed held revision N');
    const fastResult=await submit(room,intent(fast,ff,0,'lamborghini-temerario'));
    success(fastResult);
    assert.equal((await faultState(slow)).held,true,'other driver commits before the hold is released');
    assert.equal((await inspect(slow)).revision,0,'held commit has not mutated the slow profile');
    await release(slow);
    success(await slowCall);
    await nextCall;
    await until(async()=>(await status(room,second))?.ok===true,'next revision eventually commits');
    const final=await inspect(slow);
    assert.equal(final.revision,2);
    assert.deepEqual(final.progress.ownedLuxury,['ducati-panigale-v4','kawasaki-ninja-h2-carbon']);
    const cashAfterFirst=purchaseCash(FUNDS,'ducati-panigale-v4');
    const firstAwards=luxuryPurchaseAwards('ducati-panigale-v4',[],[]).map(award=>award.id);
    assert.equal(final.progress.cash,purchaseCash(cashAfterFirst,'kawasaki-ninja-h2-carbon',['ducati-panigale-v4'],firstAwards));
  } finally { await release(slow).catch(()=>{}); }

  // Failed writes and lost responses remain retryable; lost replies debit exactly once.
  for(const fault of ['fail-before','lost-reply'] as const) {
    const id=driver(), fence=randomUUID(), roomId=`retry-${randomUUID()}`;
    await acquire(id,fence,roomId);await arm(id,fault);
    const item=intent(id,fence,0,'lamborghini-revuelto');
    assert.equal(await submit(roomId,item),null,`${fault} initially remains pending`);
    await until(async()=>(await status(roomId,item))?.ok===true,`${fault} is reconciled`);
    const result=await status(roomId,item);success(result);
    const after=await inspect(id);
    assert.equal(after.revision,1);assert.equal(after.progress.cash,purchaseCash(FUNDS,'lamborghini-revuelto'));
    assert.deepEqual(after.progress.ownedLuxury,['lamborghini-revuelto']);
    assert.deepEqual(await submit(roomId,item),result,'repeated submission returns the stored receipt');
    assert.equal((await inspect(id)).revision,1,'retries do not debit twice');
  }

  // Unacknowledged outcomes remain durable while the producer is active,
  // even when acknowledgement is slower than the cleanup alarm.
  const active=driver(),activeFence=randomUUID(),activeRoom=`active-${randomUUID().slice(0,8)}`;
  await acquire(active,activeFence,activeRoom);
  const activeItem=intent(active,activeFence,0,'ducati-panigale-v4');
  success(await submit(activeRoom,activeItem));
  const conflict={...activeItem,action:{kind:'luxury' as const,vehicle:'bugatti-chiron' as const}};
  assert.deepEqual(await submit(activeRoom,conflict),{ok:false,reason:'conflict'});
  assert.deepEqual(await ack(activeRoom,conflict),{ok:true},'acknowledging a conflicting payload completes');
  assert.ok((await economyKeys(activeRoom,active)).includes(`intent:${activeItem.eventId}`),'conflicting payload cannot remove the real intent');
  assert.ok((await profileKeys(active)).includes(`receipt:${activeItem.eventId}`),'conflicting payload cannot remove the real receipt');
  await rpc('arm-ack',{room:activeRoom,ackFault:'hold-before'});
  const activeAck=ack(activeRoom,activeItem);void activeAck.catch(()=>{});
  try {
    await until(async()=>(await rpc<{held:boolean}>('ack-fault-state',{room:activeRoom})).held,'producer acknowledgement is held');
    await pause(1500);
    assert.ok((await economyKeys(activeRoom,active)).includes(`unacked:${active}:${activeItem.eventId}`),'live slow producer keeps the terminal outcome');
    assert.ok((await profileKeys(active)).includes(`receipt:${activeItem.eventId}`),'live slow producer keeps its receipt');
    success(await submit(activeRoom,activeItem));
    await rpc('release-ack',{room:activeRoom});
    assert.deepEqual(await activeAck,{ok:true});
  } finally { await rpc('release-ack',{room:activeRoom}).catch(()=>{}); }
  assert.equal((await submit(activeRoom,activeItem))?.ok,false,'an acknowledged event cannot buy twice');
  assert.equal((await inspect(active)).progress.cash,purchaseCash(FUNDS,'ducati-panigale-v4'));

  // A rejected event advances its sequence but not its revision. A later valid
  // event at that same revision succeeds, while the old rejection stays stale.
  const rejectedId=driver(),rejectedFence=randomUUID(),rejectedRoom=`reject-${randomUUID().slice(0,8)}`;
  await acquire(rejectedId,rejectedFence,rejectedRoom);
  const rejectedItem={...intent(rejectedId,rejectedFence,0,'ducati-panigale-v4'),action:{kind:'luxury' as const,vehicle:'not-a-vehicle' as LuxuryVehicleId}};
  assert.deepEqual(await submit(rejectedRoom,rejectedItem),{ok:false,reason:'invalid'});
  assert.deepEqual(await ack(rejectedRoom,rejectedItem),{ok:true});
  assert.equal((await submit(rejectedRoom,rejectedItem))?.ok,false);
  const validAtSameRevision=intent(rejectedId,rejectedFence,0,'ducati-panigale-v4',2);
  success(await submit(rejectedRoom,validAtSameRevision));
  assert.equal((await inspect(rejectedId)).revision,1);
  assert.equal((await inspect(rejectedId)).progress.cash,purchaseCash(FUNDS,'ducati-panigale-v4'));

  // A late old-fence acknowledgement must not poison the new fence's sequence
  // watermark, including a pickup rejection that never reached the profile.
  const handoffId=driver(),oldFence=randomUUID(),newFence=randomUUID(),handoffRoom=`watermark-${randomUUID().slice(0,8)}`;
  await acquire(handoffId,oldFence,handoffRoom);
  const handoff=await acquire(handoffId,newFence,handoffRoom);
  const late=intent(handoffId,oldFence,handoff.revision,'ducati-panigale-v4',1000);
  assert.deepEqual(await submit(handoffRoom,late),{ok:false,reason:'superseded'});
  assert.deepEqual(await ack(handoffRoom,late),{ok:true});
  const latePickup={...intent(handoffId,oldFence,handoff.revision,'ducati-panigale-v4',1001),pickup:{id:'missing-generation',generation:99}};
  assert.deepEqual(await submit(handoffRoom,latePickup),{ok:false,reason:'reserved'});
  assert.deepEqual(await ack(handoffRoom,latePickup),{ok:true});
  const current=intent(handoffId,newFence,handoff.revision,'ducati-panigale-v4',handoff.sequence+1);
  success(await submit(handoffRoom,current));
  assert.equal((await inspect(handoffId)).progress.cash,purchaseCash(FUNDS,'ducati-panigale-v4'));

  // Restart on either side of profile receipt deletion, and after an ack whose
  // response was lost. Durable cleanup must finish without repeating awards.
  for(const failure of ['before','after','lost-ack'] as const){
    const id=driver(),fence=randomUUID(),roomId=`compact-${randomUUID().slice(0,8)}`;
    await acquire(id,fence,roomId);
    const item=intent(id,fence,0,'lamborghini-revuelto');
    const result=await submit(roomId,item);success(result);
    assert.ok((await profileKeys(id)).includes(`receipt:${item.eventId}`));
    if(failure==='lost-ack')await rpc('arm-ack',{room:roomId,ackFault:'lost-reply'});
    else await rpc('arm-compact',{driverId:id,compactFault:failure});
    const reply=await ack(roomId,item);
    assert.deepEqual(reply,failure==='lost-ack'?{threw:true}:{ok:false});
    if(failure!=='lost-ack'){
      assert.ok((await economyKeys(roomId,id)).includes(`cleanup:${id}:${item.eventId}`),'unfinished cleanup is durable');
      assert.equal((await profileKeys(id)).includes(`receipt:${item.eventId}`),failure==='before');
    }
    await stop(child);child=undefined;child=start();await ready();
    await until(async()=>!(await economyKeys(roomId,id)).includes(`intent:${item.eventId}`)&&!(await profileKeys(id)).includes(`receipt:${item.eventId}`),`${failure} cleanup survives restart`);
    assert.equal((await submit(roomId,item))?.ok,false,'replaying a compacted event is stale');
    const after=await inspect(id);
    assert.equal(after.revision,1);assert.equal(after.progress.cash,purchaseCash(FUNDS,'lamborghini-revuelto'));
    assert.deepEqual(after.progress.ownedLuxury,['lamborghini-revuelto']);
    assert.equal(after.progress.unlocked.filter(award=>award==='luxury-revuelto').length,1,'award granted once');
  }

  // Stop with a durable pending event before its profile write. The alarm must
  // recover it after the room process disappears, without requiring an ack.
  const pendingId=driver(),pendingFence=randomUUID(),pendingRoom=`pending-${randomUUID().slice(0,8)}`;
  await acquire(pendingId,pendingFence,pendingRoom);await arm(pendingId,'hold-before');
  const pendingItem=intent(pendingId,pendingFence,0,'lamborghini-temerario');
  const pendingCall=submit(pendingRoom,pendingItem);void pendingCall.catch(()=>{});
  await until(async()=>(await faultState(pendingId)).held,'pending profile write is held');
  assert.ok((await economyKeys(pendingRoom,pendingId)).includes(`pending:${pendingId}:${pendingItem.eventId}`));
  await stop(child);child=undefined;child=start();await ready();
  await until(async()=>(await inspect(pendingId)).progress.ownedLuxury.includes('lamborghini-temerario'),'pending purchase survives process restart');
  await until(async()=>!(await economyKeys(pendingRoom,pendingId)).includes(`intent:${pendingItem.eventId}`),'abandoned pending outcome is compacted');
  const recoveredPending=await inspect(pendingId);
  assert.equal(recoveredPending.revision,1);assert.equal(recoveredPending.progress.cash,purchaseCash(FUNDS,'lamborghini-temerario'));
  assert.equal((await submit(pendingRoom,pendingItem))?.ok,false,'an abandoned recovered event cannot debit again');

  // A room can crash between the durable provisional bind and its reply.
  // Confirmed claims stay recoverable; abandoned provisional claims can expire.
  const crashPendingCode=await savedCode(`Pending${randomUUID().slice(0,6)}`),crashPendingWallet=driver(),crashPendingToken=randomUUID();
  const crashConfirmedCode=await savedCode(`Confirmed${randomUUID().slice(0,6)}`),crashConfirmedWallet=driver(),crashConfirmedToken=randomUUID();
  assert.equal((await rpc<{claim:boolean}>('binding-begin',{code:crashPendingCode,driverId:crashPendingWallet,token:crashPendingToken})).claim,true);
  assert.equal((await rpc<{claim:boolean}>('binding-begin',{code:crashConfirmedCode,driverId:crashConfirmedWallet,token:crashConfirmedToken})).claim,true);
  assert.equal(await rpc<boolean>('binding-confirm',{code:crashConfirmedCode,driverId:crashConfirmedWallet,token:crashConfirmedToken}),true);

  // Persisted ownership and receipts survive the whole Worker process restarting.
  await stop(child);child=undefined;child=start();await ready();
  await rpc('binding-expire',{code:crashPendingCode});
  const postCrashCode=await savedCode(`Reclaim${randomUUID().slice(0,6)}`);
  assert.equal((await rpc<{walletId:string}>('associate',{code:postCrashCode,driverId:crashPendingWallet})).walletId,crashPendingWallet,'expired provisional claim is reclaimed after restart');
  const replacementWallet=driver();
  assert.equal((await rpc<{walletId:string}>('associate',{code:crashPendingCode,driverId:replacementWallet})).walletId,replacementWallet,'unconfirmed identity is free after expiry');
  assert.equal((await rpc<{walletId:string}>('associate',{code:crashConfirmedCode,driverId:driver()})).walletId,crashConfirmedWallet,'a confirmed claim survives a lost reply and restart');
  await rpc('binding-release',{code:crashConfirmedCode,driverId:crashConfirmedWallet,token:crashConfirmedToken});
  assert.equal((await rpc<{walletId:string}>('associate',{code:crashConfirmedCode,driverId:driver()})).walletId,crashConfirmedWallet,'late cleanup cannot detach an adopted confirmed claim');
  const afterRestart=await acquire(a,randomUUID());
  assert.equal(afterRestart.resumed,true);assert.equal(afterRestart.progress.cash,winning.progress.cash);
  assert.deepEqual(afterRestart.progress.ownedLuxury,winning.progress.ownedLuxury);
  assert.deepEqual(await commit(winner),winning,'receipt survives a process restart');

  // A transient pickup-ledger failure must not poison the next join.
  const retryRoom=`refresh-${randomUUID().slice(0,8)}`;
  await rpc('arm-pickups',{room:retryRoom,pickupFault:'fail'});
  const rejected=connect(`/api/room/${retryRoom}`);
  await until(()=>rejected.socket.readyState===WebSocket.CLOSED,'first join fails on injected pickup read');
  assert.ok(!rejected.last('welcome'),'failed join never receives a playable session');
  const refreshClient=connect(`/api/room/${retryRoom}`,true);
  await until(()=>!!refreshClient.last('welcome')&&!!refreshClient.last('wallet'),'join retries a transient pickup-state failure');
  const refreshPlayer=refreshClient.last('welcome')!.id as string;

  // A refresh can finish after a pickup was committed. Its older generation
  // must not reactivate the pickup or roll back the cooldown.
  const pickupId='pickup-0';
  await rpc('arm-pickups',{room:retryRoom,pickupFault:'hold'});
  await rpc('refresh-pickups',{room:retryRoom});
  await until(async()=>(await rpc<{held:boolean}>('pickup-fault-state',{room:retryRoom})).held,'old pickup snapshot is held');
  try {
    await rpc('supply-pickup',{room:retryRoom,playerId:refreshPlayer,pickupId});
    await until(async()=>{
      const state=await rpc<{generation:number;pickup:{active:boolean}}>('pickup-state',{room:retryRoom,pickupId});
      return state.generation===1&&!state.pickup.active;
    },'supply pickup committed');
    await rpc('release-pickups',{room:retryRoom});
    await until(async()=>!(await rpc<{held:boolean}>('pickup-fault-state',{room:retryRoom})).held,'old snapshot released');
    await pause(200);
    const afterStale=await rpc<{generation:number;pickup:{active:boolean}}>('pickup-state',{room:retryRoom,pickupId});
    assert.equal(afterStale.generation,1,'late refresh cannot roll back the pickup generation');
    assert.equal(afterStale.pickup.active,false,'late refresh cannot bypass the pickup cooldown');
  } finally { await rpc('release-pickups',{room:retryRoom}).catch(()=>{}); }

  // A first save binds the earned guest wallet rather than starting it over.
  const guestRoomName=`guest-${randomUUID().slice(0,8)}`,guest=connect(`/api/room/${guestRoomName}`,true);
  await until(()=>!!guest.last('welcome')&&!!guest.last('wallet'),'first-time guest joins');
  const guestPlayer=guest.last('welcome')!.id as string;
  await rpc('delivery-pickup',{room:guestRoomName,playerId:guestPlayer});
  await until(()=>guest.last('wallet')?.earned>0,'guest earns a delivery pickup');
  await barrier(guest,201);
  const guestCash=guest.last('wallet')!.cash as number, guestEarned=guest.last('wallet')!.earned as number;
  const guestCode=await savedCode(`Guest${randomUUID().slice(0,6)}`);
  await until(()=>guest.input.active,'guest controls ready before saving');
  const recoveryRevision=guest.input.control!.revision;
  const queuedBeforeRecovery=guest.input.send({...NEUTRAL,throttle:1},{targetTick:guest.input.tick+7});
  await until(()=>guest.input.control?.queued.some(slot=>slot.seq===queuedBeforeRecovery)??false,'control queued before identity binding');
  send(guest,{type:'identity',code:guestCode,requestId:2});
  await until(()=>guest.messages.some(message=>message.type==='identityResult'&&message.requestId===2),'first guest binding');
  assert.equal(guest.messages.find(message=>message.type==='identityResult'&&message.requestId===2)!.ok,true);
  await until(()=>(guest.input.control?.revision??0)>recoveryRevision,'identity binding invalidates queued controls');
  assert.ok(!guest.input.control!.queued.some(slot=>slot.seq===queuedBeforeRecovery));
  assert.ok(guest.input.control!.appliedSeq<queuedBeforeRecovery,'queued movement did not run across identity binding');
  assert.equal(guest.input.control!.held.throttle,0);
  assert.equal(guest.last('wallet')!.cash,guestCash);assert.equal(guest.last('wallet')!.earned,guestEarned);
  // Checkpoint a partially completed order and paid OTA just before a quick reconnect.
  send(guest,{type:'ota',enabled:true,requestId:3});
  await until(()=>guest.messages.some(message=>message.type==='otaResult'&&message.requestId===3),'guest OTA activation');
  assert.equal(guest.messages.find(message=>message.type==='otaResult'&&message.requestId===3)!.ok,true);
  send(guest,{type:'input',seq:queuedBeforeRecovery+1,input:{...NEUTRAL,steer:1}});
  await until(()=>{
    const state=guest.last('state'),player=state?.world.players.find((item:Message)=>item.id===guestPlayer);
    return player?.delivery.order.stage==='dropoff'&&player.delivery.order.elapsed>=0.25&&player.delivery.ota.active;
  },'partial delivery and OTA timer advance');
  send(guest,{type:'input',seq:queuedBeforeRecovery+2,input:NEUTRAL});
  await until(()=>applied(guest.last('state'))===queuedBeforeRecovery+2,'guest stops steering');
  const oldState=guest.last('state')!,oldPlayer=oldState.world.players.find((item:Message)=>item.id===guestPlayer);
  const elapsedBefore=oldPlayer.delivery.order.elapsed as number;
  const otaBefore=oldPlayer.delivery.ota.renewAt-oldState.world.time;
  guest.socket.close();await until(()=>guest.socket.readyState===WebSocket.CLOSED,'first-time guest disconnects');
  const restoredGuest=await join(guestRoomName,guestCode),restoredPlayerId=restoredGuest.last('welcome')!.id as string;
  await until(()=>restoredGuest.last('wallet')?.earned===guestEarned,'guest earnings restored');
  await until(()=>{
    const state=restoredGuest.last('state'),player=state?.world.players.find((item:Message)=>item.id===restoredPlayerId);
    return player?.delivery.order.stage==='dropoff'&&player.delivery.order.elapsed>=elapsedBefore&&player.delivery.ota.active;
  },'partial delivery and paid OTA restored');
  const restoredState=restoredGuest.last('state')!,restoredPlayer=restoredState.world.players.find((item:Message)=>item.id===restoredPlayerId);
  const otaAfter=restoredPlayer.delivery.ota.renewAt-restoredState.world.time;
  assert.ok(otaAfter>0&&otaAfter<=otaBefore+1,'OTA time is retained rather than renewed for free');
  assert.equal(restoredGuest.last('wallet')!.cash,guestCash-5,'first-time identity retains guest cash and OTA debit');

  // An unbound code must not attach to a wallet already owned by a different
  // saved driver. Rejoining can bind it to its own fresh guest wallet instead.
  const boundGuest=(await rpc<{playerId:string;driverId:string}[]>('players',{room:guestRoomName})).find(session=>session.playerId===restoredPlayerId)!;
  const newCode=await savedCode(`Unbound${randomUUID().slice(0,6)}`);
  send(restoredGuest,{type:'identity',code:newCode,requestId:211});
  await until(()=>restoredGuest.messages.some(message=>message.type==='identityResult'&&message.requestId===211),'unbound identity switch settles');
  const switchResult=restoredGuest.messages.find(message=>message.type==='identityResult'&&message.requestId===211)!;
  assert.equal(switchResult.ok,false,'a second identity cannot claim the saved wallet');
  assert.match(switchResult.message,/rejoin/i);
  send(restoredGuest,{type:'identity',code:guestCode,requestId:212});
  await until(()=>restoredGuest.messages.some(message=>message.type==='identityResult'&&message.requestId===212),'same identity retry settles');
  assert.equal(restoredGuest.messages.find(message=>message.type==='identityResult'&&message.requestId===212)!.ok,true,'the original identity remains usable');
  await postIdentityState(restoredGuest,212);
  restoredGuest.socket.close();await until(()=>restoredGuest.socket.readyState===WebSocket.CLOSED,'original identity leaves');
  const newDriver=await join(guestRoomName,newCode),newPlayerId=newDriver.last('welcome')!.id as string;
  const newWallet=(await rpc<{playerId:string;driverId:string}[]>('players',{room:guestRoomName})).find(session=>session.playerId===newPlayerId)!;
  assert.notEqual(newWallet.driverId,boundGuest.driverId,'rejoining binds the new identity to a distinct wallet');
  assert.equal(newDriver.last('wallet')!.cash,2_500,'the new driver starts with its own balance');
  const originalAgain=await join(`guest-return-${randomUUID().slice(0,8)}`,guestCode);
  assert.equal(originalAgain.last('wallet')!.cash,guestCash-5,'the original balance survives the attempted switch');
  assert.equal(originalAgain.last('wallet')!.earned,guestEarned);

  // Durable reverse claims serialize overlapping binds. Same-code retries are
  // idempotent, and a rejected identity may claim a different guest wallet.
  type BoundIdentity={playerId:string;walletId:string|null};
  const raceCodeA=await savedCode(`BindA${randomUUID().slice(0,6)}`),raceCodeB=await savedCode(`BindB${randomUUID().slice(0,6)}`),raceWallet=driver();
  const candidates=await Promise.all([raceCodeA,raceCodeB].map(code=>rpc<BoundIdentity>('associate',{driverId:raceWallet,code})));
  assert.equal(candidates.filter(result=>result.walletId===raceWallet).length,1,'only one identity claims the wallet');
  assert.equal(candidates.filter(result=>result.walletId===null).length,1,'the competing identity must rejoin');
  const winnerIndex=candidates.findIndex(result=>result.walletId===raceWallet),loserIndex=1-winnerIndex;
  const codes=[raceCodeA,raceCodeB],otherWallet=driver();
  const retry=await rpc<BoundIdentity>('associate',{driverId:driver(),code:codes[winnerIndex]});
  assert.equal(retry.walletId,raceWallet,'an identity retry keeps its original wallet');
  const other=await rpc<BoundIdentity>('associate',{driverId:otherWallet,code:codes[loserIndex]});
  assert.equal(other.walletId,otherWallet,'the losing identity can bind a different wallet');

  const sameCode=await savedCode(`Same${randomUUID().slice(0,6)}`),sameWallets=[driver(),driver()];
  const sameResults=await Promise.all(sameWallets.map(driverId=>rpc<BoundIdentity>('associate',{driverId,code:sameCode})));
  assert.ok(sameWallets.includes(sameResults[0].walletId!));
  assert.equal(sameResults[0].walletId,sameResults[1].walletId,'concurrent retries of the same identity resolve to one wallet');
  const unusedWallet=sameWallets.find(id=>id!==sameResults[0].walletId)!;
  const unusedCode=await savedCode(`Unused${randomUUID().slice(0,6)}`);
  assert.equal((await rpc<BoundIdentity>('associate',{driverId:unusedWallet,code:unusedCode})).walletId,unusedWallet,'the losing guest wallet remains unclaimed');

  // Merely starting a second recovery must not permanently adopt a claim:
  // both independently stale requests can be released without losing ownership.
  const tentativeCode=await savedCode(`Tentative${randomUUID().slice(0,6)}`),tentativeWallet=driver(),tentativeA=randomUUID(),tentativeB=randomUUID();
  assert.equal((await rpc<{claim:boolean;walletId:string}>('binding-begin',{code:tentativeCode,driverId:tentativeWallet,token:tentativeA})).claim,true);
  const tentativeSecond=await rpc<{claim:boolean;walletId:string}>('binding-begin',{code:tentativeCode,driverId:driver(),token:tentativeB});
  assert.equal(tentativeSecond.claim,true);assert.equal(tentativeSecond.walletId,tentativeWallet);
  await rpc('binding-release',{code:tentativeCode,token:tentativeA});
  assert.equal(await rpc<boolean>('binding-confirm',{code:tentativeCode,token:tentativeB}),true,'second claimant remains after first cleanup');
  await rpc('binding-release',{code:tentativeCode,token:tentativeB});
  const reclaimedCode=await savedCode(`Unused${randomUUID().slice(0,6)}`);
  assert.equal((await rpc<BoundIdentity>('associate',{code:reclaimedCode,driverId:tentativeWallet})).walletId,tentativeWallet,'no unacknowledged claimant leaves a permanent binding');

  await verifyRolloutRetry();

  for(const stage of ['lost-bind','lost-confirm'] as const){
    const lostRoom=`${stage}-${randomUUID().slice(0,8)}`,lost=connect(`/api/room/${lostRoom}`,true);
    await until(()=>lost.messages.some(message=>message.type==='identityResult'&&message.ok),'lost-reply guest joins');
    await rpc('binding-arm',{bindingStage:stage});send(lost,{type:'identity',code:tentativeCode,requestId:305});
    await until(()=>lost.messages.some(message=>message.type==='identityResult'&&message.requestId===305),'lost-reply request settles');
    assert.equal(lost.messages.find(message=>message.type==='identityResult'&&message.requestId===305)!.ok,false);
    const fresh=driver();
    await until(async()=>{
      const token=randomUUID();
      const candidate=await rpc<{walletId:string;claim:boolean}>('binding-begin',{code:tentativeCode,driverId:fresh,token});
      await rpc('binding-release',{code:tentativeCode,token});
      return candidate.walletId===fresh;
    },`${stage} claim is cleaned after a committed reply is lost`);
    lost.socket.close();
  }

  // Supersession and disconnect in either actual chat transaction window must
  // release that request's claim before another identity uses the wallet.
  for(const stage of ['bind','confirm'] as const)for(const action of ['supersede','disconnect'] as const){
    const room=`bind-${stage}-${action}-${randomUUID().slice(0,6)}`,client=connect(`/api/room/${room}`,true);
    await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.ok),'race guest joins');
    const playerId=client.last('welcome')!.id as string;
    const wallet=(await rpc<{playerId:string;driverId:string}[]>('players',{room})).find(item=>item.playerId===playerId)!.driverId;
    const oldCode=await savedCode(`Old${randomUUID().slice(0,6)}`),newCode=await savedCode(`New${randomUUID().slice(0,6)}`);
    await rpc('binding-arm',{bindingStage:stage});
    send(client,{type:'identity',code:oldCode,requestId:301});
    try{
      await until(async()=>(await rpc<{held:boolean}>('binding-state',{})).held,`${stage} is held after its transaction`);
      if(action==='supersede'){
        send(client,{type:'identity',code:newCode,requestId:302});await pause(150);
      }else{
        client.socket.close();await until(()=>client.socket.readyState===WebSocket.CLOSED,'binding client disconnects');await pause(150);
      }
      await rpc('binding-resume',{});
      if(action==='supersede'){
        await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===302),'new identity settles');
        assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===302)!.ok,true);
        assert.ok(!client.messages.some(message=>message.type==='identityResult'&&message.requestId===301),'stale identity never confirms');
        assert.equal((await rpc<BoundIdentity>('associate',{driverId:driver(),code:newCode})).walletId,wallet,'new identity owns the original wallet');
      }else{
        let claimed:BoundIdentity|null=null;
        await until(async()=>{claimed=await rpc<BoundIdentity>('associate',{driverId:wallet,code:newCode});return claimed.walletId===wallet;},'disconnected claim is released');
      }
      const fresh=driver();
      assert.equal((await rpc<BoundIdentity>('associate',{driverId:fresh,code:oldCode})).walletId,fresh,'stale identity did not retain the guest wallet');
    }finally{await rpc('binding-resume',{}).catch(()=>{});}
  }

  // A different room may recover a provisional identity while the original
  // reply is held. Its adoption must fence the original and survive cleanup.
  const adoptRoom=`adopt-${randomUUID().slice(0,8)}`,adoptGuest=connect(`/api/room/${adoptRoom}`,true);
  await until(()=>adoptGuest.messages.some(message=>message.type==='identityResult'&&message.ok),'adoption guest joins');
  const adoptPlayer=adoptGuest.last('welcome')!.id as string;
  await rpc('delivery-pickup',{room:adoptRoom,playerId:adoptPlayer});
  await until(()=>adoptGuest.last('wallet')?.earned>0,'adoption guest earns money');
  await barrier(adoptGuest,303);
  const adoptCash=adoptGuest.last('wallet')!.cash as number;
  const adoptWallet=(await rpc<{playerId:string;driverId:string}[]>('players',{room:adoptRoom})).find(item=>item.playerId===adoptPlayer)!.driverId;
  const adoptCode=await savedCode(`Adopt${randomUUID().slice(0,6)}`);
  await rpc('binding-arm',{bindingStage:'bind'});send(adoptGuest,{type:'identity',code:adoptCode,requestId:304});
  try{
    await until(async()=>(await rpc<{held:boolean}>('binding-state',{})).held,'original provisional bind held');
    const adopter=await join(`adopter-${randomUUID().slice(0,8)}`,adoptCode);
    assert.equal(adopter.last('wallet')!.cash,adoptCash,'adopting session recovers the earned wallet');
    await rpc('binding-resume',{});await pause(200);
    assert.equal((await rpc<BoundIdentity>('associate',{driverId:driver(),code:adoptCode})).walletId,adoptWallet,'old cleanup cannot release the adopted wallet');
  }finally{await rpc('binding-resume',{}).catch(()=>{});}

  // An earned guest cannot silently overwrite its progress with an already
  // bound different driver; reconnecting makes the requested switch explicit.
  const switchRoom=`switch-${randomUUID().slice(0,8)}`,switchGuest=connect(`/api/room/${switchRoom}`,true);
  await until(()=>!!switchGuest.last('welcome')&&!!switchGuest.last('wallet'),'switching guest joins');
  const switchPlayer=switchGuest.last('welcome')!.id as string;
  await rpc('delivery-pickup',{room:switchRoom,playerId:switchPlayer});
  await until(()=>switchGuest.last('wallet')?.earned>0,'switching guest earns a pickup');
  await barrier(switchGuest,220);
  const switchSessions=await rpc<{playerId:string;driverId:string}[]>('players',{room:switchRoom});
  const switchId=switchSessions.find(session=>session.playerId===switchPlayer)!.driverId;
  const different=await savedDriver(`Different${randomUUID().slice(0,6)}`);
  const beforeGuest=await inspect(switchId),beforeDifferent=await inspect(different.id);
  send(switchGuest,{type:'identity',code:different.code,requestId:221});
  await until(()=>switchGuest.messages.some(message=>message.type==='identityResult'&&message.requestId===221),'earned guest switch is rejected');
  assert.equal(switchGuest.messages.find(message=>message.type==='identityResult'&&message.requestId===221)!.ok,false);
  await barrier(switchGuest,222);
  assert.deepEqual((await inspect(switchId)).progress,beforeGuest.progress,'guest progress remains intact');
  assert.deepEqual((await inspect(different.id)).progress,beforeDifferent.progress,'other saved wallet remains intact');
  switchGuest.socket.close();await until(()=>switchGuest.socket.readyState===WebSocket.CLOSED,'earned guest leaves before switching');
  const switched=await join(switchRoom,different.code);
  assert.ok(switched.messages.some(message=>message.type==='wallet'&&message.cash===beforeDifferent.progress.cash),'rejoining successfully restores the different wallet');

  // A pending identity cannot passively claim a free shared rocket pad.
  const rocketRoom=`rocket-wait-${randomUUID().slice(0,8)}`;
  const rocketWaiter=connect(`/api/room/${rocketRoom}`);
  await until(()=>!!rocketWaiter.last('state')&&!!rocketWaiter.last('welcome'),'rocket waiter joins');
  const rocketPlayer=rocketWaiter.last('welcome')!.id as string;
  await rpc('rocket-pickup',{room:rocketRoom,playerId:rocketPlayer,pickupId:'rocket-0'});
  const rocketTime=rocketWaiter.last('state')!.world.time;
  await until(()=>rocketWaiter.last('state')!.world.time>rocketTime+.5,'room advances with identity pending');
  let rocketWorld=rocketWaiter.last('state')!.world;
  assert.equal(rocketWorld.pickups.find((pickup:Message)=>pickup.id==='rocket-0').active,true,'pending driver does not consume the pad');
  assert.equal(rocketWorld.entities.find((entity:Message)=>entity.driver===rocketPlayer).upgrades.rocket,false,'pending driver gains no rocket');
  assert.equal(rocketWorld.entities.find((entity:Message)=>entity.driver===rocketPlayer).air,40,'pending driver receives no rocket refill');
  send(rocketWaiter,{type:'identity',code:null,requestId:1});
  await until(()=>rocketWaiter.messages.some(message=>message.type==='identityResult'&&message.requestId===1&&message.ok),'rocket driver chooses guest');
  try {
    await until(()=>{
      rocketWorld=rocketWaiter.last('state')!.world;
      const car=rocketWorld.entities.find((entity:Message)=>entity.driver===rocketPlayer);
      return rocketWorld.pickups.find((pickup:Message)=>pickup.id==='rocket-0')?.active===false&&car?.upgrades.rocket===true&&car.air===100;
    },'identified driver can collect the same pad',4_000);
  } catch(error) {
    throw new Error(`${error}: ${JSON.stringify({pickup:rocketWorld.pickups.find((pickup:Message)=>pickup.id==='rocket-0'),car:rocketWorld.entities.find((entity:Message)=>entity.driver===rocketPlayer),identity:rocketWaiter.last('identityResult')})}`);
  }
  rocketWaiter.socket.close();

  // From the first welcome, a driver awaiting a decision or a saved profile
  // cannot collect a landmark, drive, or spend while the room keeps running.
  const waitingDriver=await savedDriver(`Wait${randomUUID().slice(0,6)}`);
  const waitingRoom=`wait-${randomUUID().slice(0,8)}`;
  const waiting=connect(`/api/room/${waitingRoom}`),observer=connect(`/api/room/${waitingRoom}`,true);
  await until(()=>!!waiting.last('welcome')&&!!waiting.last('wallet')&&!!observer.last('state'),'waiting driver and guest observer join');
  const waitingId=waiting.last('welcome')!.id as string;
  await rpc('position',{room:waitingRoom,playerId:waitingId,side:-1});
  const waitingTime=waiting.last('state')!.world.time as number;
  send(waiting,{type:'input',seq:1,input:{...NEUTRAL,throttle:1}});
  send(waiting,{type:'ota',enabled:true,requestId:10});
  await until(()=>waiting.messages.some(message=>message.type==='otaResult'&&message.requestId===10),'pre-decision purchase rejected');
  assert.equal(waiting.messages.find(message=>message.type==='otaResult'&&message.requestId===10)!.ok,false);
  await until(()=>waiting.last('state')!.world.time>waitingTime+.4,'world ticks before the identity decision');
  assert.equal(applied(waiting.last('state')),0,'pre-decision controls are not applied');
  assert.equal(waiting.last('wallet')!.cash,2_500);
  assert.ok(!waiting.last('wallet')!.unlocked.includes('luxury-visit'),'nearby landmark does not award before the decision');

  await rpc('arm-acquire',{driverId:waitingDriver.id});
  send(waiting,{type:'identity',code:waitingDriver.code,requestId:11});
  let observerSeq=0;
  const observerTimer=setInterval(()=>send(observer,{type:'input',seq:++observerSeq,input:{...NEUTRAL,throttle:1}}),80);
  try {
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:waitingDriver.id})).held,'saved wallet acquire is held');
    const duringTime=waiting.last('state')!.world.time as number;
    send(waiting,{type:'input',seq:2,input:{...NEUTRAL,throttle:1}});
    send(waiting,{type:'ota',enabled:true,requestId:12});
    await until(()=>waiting.messages.some(message=>message.type==='otaResult'&&message.requestId===12),'purchase rejected during recovery');
    assert.equal(waiting.messages.find(message=>message.type==='otaResult'&&message.requestId===12)!.ok,false);
    await until(()=>waiting.last('state')!.world.time>duringTime+.4&&applied(observer.last('state'))>0,'other player and world continue during held recovery');
    assert.equal(applied(waiting.last('state')),0);
    assert.equal(waiting.last('wallet')!.cash,2_500);
    assert.ok(!waiting.last('wallet')!.unlocked.includes('luxury-visit'));
    await rpc('release-acquire',{driverId:waitingDriver.id});
    await until(()=>waiting.messages.some(message=>message.type==='identityResult'&&message.requestId===11&&message.ok),'held recovery completes');
    assert.ok(waiting.messages.some(message=>message.type==='wallet'&&message.cash===FUNDS),'saved balance is restored');
    await postIdentityState(waiting,11);
    send(waiting,{type:'input',seq:3,input:NEUTRAL});
    await until(()=>applied(waiting.last('state'))===3,'recovered driver can play');
  } finally { clearInterval(observerTimer);await rpc('release-acquire',{driverId:waitingDriver.id}).catch(()=>{}); }

  // A queued frame and active autonomous drive must not cross a held switch
  // from a guest into an already saved profile.
  const movingDriver=await savedDriver(`Moving${randomUUID().slice(0,6)}`);
  const movingRoom=`moving-${randomUUID().slice(0,8)}`;
  const moving=connect(`/api/room/${movingRoom}`,true);
  await until(()=>moving.input.active&&!!moving.last('state'),'moving guest is ready');
  const movingId=moving.last('welcome')!.id as string;
  const movingCar=()=>moving.last('state')?.world.entities.find((entity:Message)=>entity.driver===movingId);
  await rpc('arm-acquire',{driverId:movingDriver.id});
  try {
    moving.input.action({type:'autopilot'});
    await until(()=>movingCar()?.autopilot===true,'autopilot starts before recovery');
    const beforeRevision=moving.input.control!.revision;
    const target=moving.input.tick+7;
    const queued=moving.input.send({...NEUTRAL,throttle:1},{targetTick:target});
    await until(()=>moving.input.control?.queued.some(slot=>slot.seq===queued)??false,'future movement is queued before recovery');
    send(moving,{type:'identity',code:movingDriver.code,requestId:230});
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:movingDriver.id})).held,'recovery holds the new profile');
    await until(()=>(moving.input.control?.revision??0)>beforeRevision&&movingCar()?.autopilot===false,'recovery clears control and autonomous drive');
    assert.ok(!moving.input.control!.queued.some(slot=>slot.seq===queued),'future movement is removed during recovery');
    assert.equal(moving.input.control!.held.throttle,0);
    await rpc('release-acquire',{driverId:movingDriver.id});
    await until(()=>moving.messages.some(message=>message.type==='identityResult'&&message.requestId===230&&message.ok),'held moving recovery completes');
    await postIdentityState(moving,230);
    await until(()=>moving.input.tick>target+2,'room advances beyond the old target after recovery');
    assert.ok(moving.input.control!.appliedSeq<queued,'old queued movement did not execute after recovery');
    assert.equal(movingCar()?.autopilot,false,'recovered car remains out of autonomous mode');
    const resumed=moving.input.send(NEUTRAL);
    await until(()=>(moving.input.control?.appliedSeq??0)>=resumed,'recovered driver can send a fresh control');
  } finally {await rpc('release-acquire',{driverId:movingDriver.id}).catch(()=>{});moving.socket.close();}

  // A timed-out/closed room must not install a late acquisition, and retrying
  // the same saved driver must not be trapped behind its abandoned fence.
  const abandonedDriver=await savedDriver(`Abandoned${randomUUID().slice(0,6)}`);
  const abandoned=connect(`/api/room/${waitingRoom}`);
  await until(()=>!!abandoned.last('welcome'),'abandoned recovery socket joins');
  const abandonedId=abandoned.last('welcome')!.id as string;
  await rpc('arm-acquire',{driverId:abandonedDriver.id});
  send(abandoned,{type:'identity',code:abandonedDriver.code,requestId:15});
  try {
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:abandonedDriver.id})).held,'abandoned acquire is held');
    abandoned.socket.close();
    await until(()=>observer.last('state')!.world.players.every((player:Message)=>player.id!==abandonedId),'closed recovery is removed from room');
    await rpc('release-acquire',{driverId:abandonedDriver.id});
    const resumed=await join(waitingRoom,abandonedDriver.code);
    assert.ok(resumed.messages.some(message=>message.type==='wallet'&&message.cash===FUNDS),'retry restores the abandoned saved wallet');
    assert.ok(!abandoned.messages.some(message=>message.type==='identityResult'&&message.requestId===15&&message.ok),'closed recovery never reports success');
  } finally { await rpc('release-acquire',{driverId:abandonedDriver.id}).catch(()=>{}); }

  // A failed lookup stays paused even if null arrives. Rejoining is required
  // to choose a guest, and its abandoned actions never run.
  const invalid=connect(`/api/room/${waitingRoom}`);
  await until(()=>!!invalid.last('welcome'),'invalid-code driver joins');
  send(invalid,{type:'identity',code:'not-a-valid-recovery-code',requestId:20});
  await until(()=>invalid.messages.some(message=>message.type==='identityResult'&&message.requestId===20),'invalid recovery settles');
  assert.equal(invalid.messages.find(message=>message.type==='identityResult'&&message.requestId===20)!.ok,false);
  send(invalid,{type:'input',seq:1,input:{...NEUTRAL,throttle:1}});
  send(invalid,{type:'ota',enabled:true,requestId:21});
  await until(()=>invalid.messages.some(message=>message.type==='otaResult'&&message.requestId===21),'failed recovery rejects spending');
  assert.equal(invalid.messages.find(message=>message.type==='otaResult'&&message.requestId===21)!.ok,false);
  assert.equal(applied(invalid.last('state')),0);
  send(invalid,{type:'identity',code:null,requestId:22});
  await until(()=>invalid.messages.some(message=>message.type==='identityResult'&&message.requestId===22),'guest rejoin is required after failure');
  assert.equal(invalid.messages.find(message=>message.type==='identityResult'&&message.requestId===22)!.ok,false);
  send(invalid,{type:'input',seq:2,input:NEUTRAL});
  await pause(200);assert.equal(applied(invalid.last('state')),0,'null cannot resume a failed recovery');
  invalid.socket.close();
  const replacementGuest=connect(`/api/room/${waitingRoom}`,true);
  await until(()=>replacementGuest.messages.some(message=>message.type==='identityResult'&&message.ok),'new guest joins explicitly');
  send(replacementGuest,{type:'identity',code:null,requestId:23});
  await until(()=>replacementGuest.messages.some(message=>message.type==='identityResult'&&message.requestId===23&&message.ok),'repeated guest decision is harmless');
  await until(()=>replacementGuest.input.ready,'guest control snapshot');
  send(replacementGuest,{type:'input',seq:1,input:NEUTRAL});
  await until(()=>applied(replacementGuest.last('state'))===1,'new guest can play');
  assert.equal(replacementGuest.last('wallet')!.cash,2_500,'rejected action was not replayed');

  // A newer recovery supersedes a held request without exposing the old wallet.
  const firstChoice=await savedDriver(`First${randomUUID().slice(0,6)}`),secondChoice=await savedDriver(`Second${randomUUID().slice(0,6)}`);
  await rpc('fund',{driverId:secondChoice.id,seedCash:7_000_000});
  const changing=connect(`/api/room/supersede-${randomUUID().slice(0,8)}`);
  await until(()=>!!changing.last('welcome'),'superseded recovery socket joins');
  await rpc('arm-acquire',{driverId:firstChoice.id});
  send(changing,{type:'identity',code:firstChoice.code,requestId:30});
  try {
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:firstChoice.id})).held,'first choice is held');
    send(changing,{type:'identity',code:secondChoice.code,requestId:31});
    send(changing,{type:'input',seq:1,input:{...NEUTRAL,throttle:1}});
    await pause(200);assert.equal(applied(changing.last('state')),0);
    await rpc('release-acquire',{driverId:firstChoice.id});
    await until(()=>changing.messages.some(message=>message.type==='identityResult'&&message.requestId===31&&message.ok),'newer choice attaches');
    await postIdentityState(changing,31);
    assert.ok(!changing.messages.some(message=>message.type==='identityResult'&&message.requestId===30),'superseded request never confirms');
    assert.ok(changing.messages.some(message=>message.type==='wallet'&&message.cash===7_000_000),'only the newer wallet is installed');
    assert.ok(!changing.messages.some(message=>message.type==='wallet'&&message.cash===FUNDS),'old wallet is never exposed');
    send(changing,{type:'input',seq:2,input:NEUTRAL});
    await until(()=>applied(changing.last('state'))===2,'newer identity is usable');
  } finally { await rpc('release-acquire',{driverId:firstChoice.id}).catch(()=>{}); }

  // Two recoveries race after the first fence was installed but its reply was delayed.
  const racing=await savedDriver(`Race${randomUUID().slice(0,6)}`),racingRecord=await inspect(racing.id);
  success(await commit(intent(racing.id,racingRecord.fence,racingRecord.revision,'ducati-panigale-v4',racingRecord.sequence+1)));
  await rpc('arm-acquire',{driverId:racing.id});
  const firstRecovery=connect(`/api/room/race-a-${randomUUID().slice(0,8)}`);
  await until(()=>!!firstRecovery.last('welcome')&&!!firstRecovery.last('wallet'),'first recovery socket ready');
  send(firstRecovery,{type:'identity',code:racing.code,requestId:1});
  try {
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:racing.id})).held,'first recovery held after fence acquisition');
    const secondRecovery=connect(`/api/room/race-b-${randomUUID().slice(0,8)}`);
    await until(()=>!!secondRecovery.last('welcome')&&!!secondRecovery.last('wallet'),'second recovery socket ready');
    send(secondRecovery,{type:'identity',code:racing.code,requestId:1});
    await pause(150);
    await rpc('release-acquire',{driverId:racing.id});
    await until(()=>[firstRecovery,secondRecovery].every(client=>client.socket.readyState===WebSocket.CLOSED||!!client.last('identityResult')),'both recovery attempts settle');
    const usableClients=()=>[firstRecovery,secondRecovery].filter(client=>client.socket.readyState===WebSocket.OPEN&&client.last('identityResult')?.ok===true);
    await until(()=>usableClients().length===1,'only one recovered session retains usable ownership');
    const usable=usableClients();
    assert.equal(usable.length,1);
    const winner=usable[0],stale=winner===firstRecovery?secondRecovery:firstRecovery;
    await postIdentityState(winner,1);
    if(stale.socket.readyState===WebSocket.OPEN){
      const staleRoom=new URL(stale.socket.url).pathname.split('/').at(-1)!;
      await rpc('position',{room:staleRoom,playerId:stale.last('welcome')!.id,side:-1});
      await pause(200);
      assert.ok(!stale.last('wallet')?.unlocked?.includes('luxury-visit'),'failed recovery stays paused at the Vault');
      await barrier(stale,300);
      const staleCash=stale.last('wallet')!.cash,staleOwned=structuredClone(stale.last('wallet')!.ownedLuxury);
      assert.equal((await luxury(stale,'collect','ducati-panigale-v4',90)).ok,false,'superseded session cannot collect');
      await pause(450);
      assert.equal((await luxury(stale,'buy','kawasaki-ninja-h2-carbon',91)).ok,false,'superseded session cannot buy');
      await barrier(stale,302);
      assert.equal(stale.last('wallet')!.cash,staleCash);
      assert.deepEqual(stale.last('wallet')!.ownedLuxury,staleOwned);
    }else{
      assert.ok(!stale.messages.some(message=>message.type==='wallet'&&message.ownedLuxury?.includes('ducati-panigale-v4')),'the closed loser never receives the recovered collection');
    }
    const winnerRoom=new URL(winner.socket.url).pathname.split('/').at(-1)!;
    await rpc('position',{room:winnerRoom,playerId:winner.last('welcome')!.id,side:-1});
    await until(()=>winner.last('wallet')?.unlocked?.includes('luxury-visit'),'winning session showroom discovery');
    await barrier(winner,301);
    assert.equal((await luxury(winner,'collect','ducati-panigale-v4',92)).ok,true,'current owner can collect the recovered model');
    await rpc('position',{room:winnerRoom,playerId:winner.last('welcome')!.id,side:-1});
    await pause(450);
    assert.equal((await luxury(winner,'buy','kawasaki-ninja-h2-carbon',93)).ok,true,'current owner can make a new purchase');
  } finally { await rpc('release-acquire',{driverId:racing.id}).catch(()=>{}); }

  // A late-game purchase can lower the cash-based level. After reconnecting,
  // the owned vehicle remains collectable at an ordinary level-zero workshop.
  const levelDriver=await savedDriver(`Level${randomUUID().slice(0,6)}`),levelRoom=`level-${randomUUID().slice(0,8)}`;
  await rpc('fund',{driverId:levelDriver.id,seedCash:1_550_000});
  const beforeLevelClient=await join(levelRoom,levelDriver.code),levelPlayer=beforeLevelClient.last('welcome')!.id as string;
  await rpc('position',{room:levelRoom,playerId:levelPlayer,side:-1});
  await until(()=>beforeLevelClient.last('wallet')?.unlocked?.includes('luxury-visit'),'level-drop driver visits the Vault');
  await barrier(beforeLevelClient,350);await pause(450);
  const startingLevel=beforeLevelClient.last('wallet')!.level as number;
  assert.ok(startingLevel>=5&&beforeLevelClient.last('wallet')!.cash>=1_500_000);
  assert.equal((await luxury(beforeLevelClient,'buy','ducati-panigale-v4',351)).ok,true);
  await barrier(beforeLevelClient,352);
  const droppedLevel=beforeLevelClient.last('wallet')!.level as number;
  assert.ok(droppedLevel<startingLevel,'the purchase lowers the current cash-based level');
  beforeLevelClient.socket.close();await until(()=>beforeLevelClient.socket.readyState===WebSocket.CLOSED,'level-drop driver disconnects');
  const levelRejoined=await join(levelRoom,levelDriver.code),levelRejoinedId=levelRejoined.last('welcome')!.id as string;
  assert.equal(levelRejoined.last('wallet')!.level,droppedLevel);
  assert.ok(levelRejoined.last('wallet')!.ownedLuxury.includes('ducati-panigale-v4'));
  await rpc('workshop',{room:levelRoom,playerId:levelRejoinedId,shopIndex:0});
  await pause(450);
  assert.equal((await luxury(levelRejoined,'collect','ducati-panigale-v4',353)).ok,true,'owned car can be collected at the SF workshop after the level drop');
  await until(()=>{
    const world=levelRejoined.last('state')?.world,player=world?.players.find((item:Message)=>item.id===levelRejoinedId);
    return world?.entities.some((entity:Message)=>entity.id===player?.entityId&&entity.kind==='ducati-panigale-v4'&&entity.owner===levelRejoinedId&&entity.driver===levelRejoinedId);
  },'collected car is owned and driven after reconnect');

  // Hold a profile until the per-driver outage queue reaches its bound. Accepted
  // income ticks must drain even after the overflow closes the player's socket.
  const outage=await savedDriver(`Outage${randomUUID().slice(0,6)}`),outageRoom=`outage-${randomUUID().slice(0,8)}`;
  const outageClient=await join(outageRoom,outage.code),outagePlayer=outageClient.last('welcome')!.id as string;
  await until(()=>outageClient.last('wallet')?.unlocked?.includes('region-san-jose'),'outage driver milestones are committed');
  await barrier(outageClient,401);await pause(300);
  const outageCash=outageClient.last('wallet')!.cash as number;
  await arm(outage.id,'hold-before');
  const firstQueued=await rpc<{accepted:number;queued:number}>('queue-income',{room:outageRoom,playerId:outagePlayer,count:1});
  assert.equal(firstQueued.accepted,1);
  try {
    await until(async()=>(await faultState(outage.id)).held,'outage write is held');
    const filled=await rpc<{accepted:number;queued:number}>('queue-income',{room:outageRoom,playerId:outagePlayer,count:40});
    assert.equal(firstQueued.accepted+filled.accepted,32,'queue admits only its bounded number of events');
    await until(()=>outageClient.socket.readyState===WebSocket.CLOSED,'overloaded driver is disconnected');
    const resumedOutage=join(outageRoom,outage.code);void resumedOutage.catch(()=>{});
    await pause(150);
    await release(outage.id);
    const afterOutage=await resumedOutage;
    await until(()=>afterOutage.last('wallet')?.cash===outageCash+32,'all accepted income settles before reconnect');
    assert.equal((await inspect(outage.id)).progress.cash,outageCash+32,'the queue drains exactly once after the outage');
  } finally { await release(outage.id).catch(()=>{}); }

  // Exercise the real room wire protocol and actual saved driver identities.
  const [alice,bob]=await Promise.all([savedDriver(`WalletA${randomUUID().slice(0,6)}`),savedDriver(`WalletB${randomUUID().slice(0,6)}`)]);
  const liveRoom=`wallet-${randomUUID().slice(0,8)}`;
  let aliceRoom=await join(liveRoom,alice.code);
  const bobRoom=await join(liveRoom,bob.code);
  await until(()=>aliceRoom.last('wallet')?.cash>=FUNDS&&bobRoom.last('wallet')?.cash>=FUNDS,'seeded wallets restored');
  const alicePlayer=aliceRoom.last('welcome')!.id as string,bobPlayer=bobRoom.last('welcome')!.id as string;
  await rpc('position',{room:liveRoom,playerId:alicePlayer,side:-1});
  await rpc('position',{room:liveRoom,playerId:bobPlayer,side:1});
  await until(()=>aliceRoom.last('wallet')?.unlocked?.includes('luxury-visit')&&bobRoom.last('wallet')?.unlocked?.includes('luxury-visit'),'both showroom discovery awards committed');
  await Promise.all([barrier(aliceRoom,101),barrier(bobRoom,102)]);
  const baseline=await measureRoom(bobRoom,0);
  assert.ok(baseline.snapshots>=5&&baseline.acks>=5&&baseline.worldSeconds>0.5,'baseline has regular room snapshots and input acknowledgements');
  const cashBefore=aliceRoom.last('wallet')!.cash as number;
  await arm(alice.id,'hold-before');
  send(aliceRoom,{type:'luxury',action:'buy',vehicle:'ducati-panigale-v4',requestId:11});
  try {
    await until(async()=>(await faultState(alice.id)).held,'live purchase is held at profile write');
    assert.deepEqual((await faultState(alice.id)).heldAction,{kind:'luxury',vehicle:'ducati-panigale-v4'},'the held operation is the requested purchase');
    const sample=measureRoom(bobRoom,baseline.lastSeq);
    void sample.catch(()=>{});
    assert.equal(aliceRoom.messages.some(message=>message.type==='luxuryResult'&&message.requestId===11),false,'no purchase success before the write');
    assert.equal(aliceRoom.last('wallet')!.cash,cashBefore,'uncommitted debit is not displayed');
    const bobEarned=bobRoom.last('wallet')!.earned as number;
    await rpc('delivery-pickup',{room:liveRoom,playerId:bobPlayer});
    await until(()=>bobRoom.last('wallet')?.earned>bobEarned,'other driver earns a paid delivery pickup while the write is held');
    assert.equal((await faultState(alice.id)).held,true,'delivery income is saved before the hold is released');
    await rpc('position',{room:liveRoom,playerId:bobPlayer,side:1});
    const stolen=await luxury(bobRoom,'collect','ducati-panigale-v4',21);
    assert.equal(stolen.ok,false,'a driver cannot collect someone else’s model');
    await pause(450);
    const independent=await luxury(bobRoom,'buy','kawasaki-ninja-h2-carbon',22);
    assert.equal(independent.ok,true,'other driver can buy while the first writer is held');
    const heldSample=await sample;
    assert.equal((await faultState(alice.id)).held,true,'the held write remained blocked for the full sample');
    console.log('Real GameRoom isolation sample (milliseconds; 10 Hz input):',JSON.stringify({baseline,held:heldSample}));
    assert.ok(heldSample.elapsedMs>=1200&&heldSample.snapshots>=5&&heldSample.acks>=5,'room and input continue for the 1,200 ms write hold');
    assert.ok(baseline.worldRate>0.6&&heldSample.worldRate>baseline.worldRate*0.7,'world time continues at a rate comparable to the baseline');
    const limit=(normal:number)=>Math.min(650,Math.max(300,normal*2+100));
    assert.ok(heldSample.maxSnapshotGapMs<limit(baseline.maxSnapshotGapMs),'held write does not cause a long snapshot stall');
    assert.ok(heldSample.maxAckGapMs<limit(baseline.maxAckGapMs),'held write does not cause a long acknowledgement stall');
    assert.ok(heldSample.maxInputLatencyMs<limit(baseline.maxInputLatencyMs),'individual inputs are acknowledged without a long stall');
    await release(alice.id);
    await until(()=>aliceRoom.messages.some(message=>message.type==='luxuryResult'&&message.requestId===11&&message.ok),'held purchase completes');
  } finally { await release(alice.id).catch(()=>{}); }
  await barrier(aliceRoom,103);
  assert.equal(aliceRoom.last('wallet')!.cash,purchaseCash(cashBefore,'ducati-panigale-v4'));
  assert.ok(aliceRoom.last('wallet')!.ownedLuxury.includes('ducati-panigale-v4'));
  assert.ok(!bobRoom.last('wallet')!.ownedLuxury.includes('ducati-panigale-v4'),'Bob does not own Alice’s purchase');
  await until(()=>{
    const other=bobRoom.last('state')?.world.players.find((player:Message)=>player.id===alicePlayer);
    return other?.delivery.cash===aliceRoom.last('wallet')!.cash&&other.achievements.unlocked.includes('luxury-panigale');
  },'observer sees the other player’s public cash and achievements');
  const publicWorld=bobRoom.last('state')!.world,publicAlice=publicWorld.players.find((player:Message)=>player.id===alicePlayer);
  assert.equal(publicAlice.delivery.cash,aliceRoom.last('wallet')!.cash,'room snapshots expose player cash');
  assert.ok(publicAlice.achievements.unlocked.includes('luxury-panigale'),'room snapshots expose achievements');
  assert.ok(!JSON.stringify(publicWorld).includes('"ownedLuxury"'),'room snapshots omit private owned-luxury lists');
  assert.ok(!JSON.stringify(publicWorld).includes(alice.id),'room snapshots omit wallet IDs');
  assert.ok(!JSON.stringify(publicWorld).includes(alice.code),'room snapshots omit recovery codes');
  await pause(450);await barrier(bobRoom,105);
  const bobBefore=await inspect(bob.id),bobControlled=bobRoom.last('state')!.world.players.find((player:Message)=>player.id===bobPlayer).entityId;
  assert.equal((await luxury(bobRoom,'collect','ducati-panigale-v4',23)).ok,false,'Bob cannot collect the model after Alice owns it');
  await barrier(bobRoom,106);
  assert.equal(bobRoom.last('state')!.world.players.find((player:Message)=>player.id===bobPlayer).entityId,bobControlled,'denied collection leaves Bob’s controlled entity unchanged');
  const bobAfter=await inspect(bob.id);
  assert.equal(bobAfter.progress.cash,bobBefore.progress.cash,'denied collection leaves Bob’s cash unchanged');
  assert.deepEqual(bobAfter.progress.ownedLuxury,bobBefore.progress.ownedLuxury,'denied collection leaves Bob’s collection unchanged');
  await pause(450);
  assert.equal((await luxury(aliceRoom,'buy','ducati-panigale-v4',12)).ok,false,'a duplicate in-room purchase is rejected');
  await pause(450);
  const collectionRevision=aliceRoom.input.control!.revision;
  const queuedBeforeCollection=aliceRoom.input.send({...NEUTRAL,throttle:1},{targetTick:aliceRoom.input.tick+7});
  await until(()=>aliceRoom.input.control?.queued.some(slot=>slot.seq===queuedBeforeCollection)??false,'control queued before collection');
  assert.equal((await luxury(aliceRoom,'collect','ducati-panigale-v4',13)).ok,true,'owner collects their car');
  await until(()=>(aliceRoom.input.control?.revision??0)>collectionRevision,'collection invalidates the previous controls');
  assert.ok(!aliceRoom.input.control!.queued.some(slot=>slot.seq===queuedBeforeCollection));
  assert.ok(aliceRoom.input.control!.appliedSeq<queuedBeforeCollection,'queued throttle did not carry onto the collected vehicle');
  assert.equal(aliceRoom.input.control!.held.throttle,0);
  await until(()=>{
    const world=aliceRoom.last('state')?.world,player=world?.players.find((item:Message)=>item.id===alicePlayer);
    return world?.entities.some((entity:Message)=>entity.id===player?.entityId&&entity.kind==='ducati-panigale-v4');
  },'collected model is drivable in the room');
  const collectedWorld=aliceRoom.last('state')!.world,collectedId=collectedWorld.players.find((player:Message)=>player.id===alicePlayer).entityId;
  const collected=collectedWorld.entities.find((entity:Message)=>entity.id===collectedId);
  assert.equal(collected.owner,alicePlayer);assert.equal(collected.driver,alicePlayer);
  await until(()=>bobRoom.last('state')?.world.entities.some((entity:Message)=>entity.id===collectedId&&entity.owner===alicePlayer&&entity.driver===alicePlayer),'observer sees the owned, driven model');
  send(aliceRoom,{type:'input',seq:queuedBeforeCollection+1,input:{...NEUTRAL,throttle:1}});
  await until(()=>{
    const car=aliceRoom.last('state')?.world.entities.find((entity:Message)=>entity.id===collectedId);
    return car&&Math.hypot(car.x-collected.x,car.z-collected.z)>0.3;
  },'owner drives the collected model',5_000);
  send(aliceRoom,{type:'input',seq:queuedBeforeCollection+2,input:NEUTRAL});
  await until(()=>{
    const car=bobRoom.last('state')?.world.entities.find((entity:Message)=>entity.id===collectedId);
    return car&&Math.hypot(car.x-collected.x,car.z-collected.z)>0.3;
  },'observer sees the collected car move',5_000);

  // Finish and tune this owned model at a workshop; both must follow the owner.
  await rpc('workshop',{room:liveRoom,playerId:alicePlayer});
  await pause(450);
  send(aliceRoom,{type:'vehicleStyle',category:'paint',choice:'mint',requestId:30});
  await until(()=>aliceRoom.messages.some(message=>message.type==='vehicleStyleResult'&&message.requestId===30),'style purchase result');
  const styleResult=aliceRoom.messages.find(message=>message.type==='vehicleStyleResult'&&message.requestId===30)!;
  assert.equal(styleResult.ok,true);assert.equal(styleResult.category,'paint');assert.equal(styleResult.choice,'mint');
  await pause(450);
  send(aliceRoom,{type:'upgrade',upgrade:'motor',requestId:31});
  await until(()=>aliceRoom.messages.some(message=>message.type==='upgradeResult'&&message.requestId===31),'motor purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='upgradeResult'&&message.requestId===31)!.ok,true);
  await barrier(aliceRoom,104);
  await pause(450);
  send(aliceRoom,{type:'upgrade',upgrade:'rocket',requestId:32});
  await until(()=>aliceRoom.messages.some(message=>message.type==='upgradeResult'&&message.requestId===32),'rocket purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='upgradeResult'&&message.requestId===32)!.ok,true);
  await barrier(aliceRoom,105);
  const beforeAutonomy=await inspect(alice.id);
  await arm(alice.id,'hold-before');
  send(aliceRoom,{type:'upgrade',upgrade:'autonomyJump',requestId:33});
  await until(async()=>(await faultState(alice.id)).held,'self-driving upgrade waits for wallet commit');
  assert.equal(aliceRoom.last('state')!.world.entities.find((entity:Message)=>entity.id===collectedId).upgrades.autonomyJump,false,'uncommitted upgrade is unavailable');
  assert.equal((await inspect(alice.id)).progress.cash,beforeAutonomy.progress.cash,'pending purchase has not debited the wallet');
  await release(alice.id);
  await until(()=>aliceRoom.messages.some(message=>message.type==='upgradeResult'&&message.requestId===33),'Leap purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='upgradeResult'&&message.requestId===33)!.ok,true);
  await pause(450);
  send(aliceRoom,{type:'upgrade',upgrade:'autonomySky',requestId:34});
  await until(()=>aliceRoom.messages.some(message=>message.type==='upgradeResult'&&message.requestId===34),'Plaid purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='upgradeResult'&&message.requestId===34)!.ok,true);
  await barrier(aliceRoom,107);
  const afterAutonomy=await inspect(alice.id);
  assert.equal(afterAutonomy.progress.cash,beforeAutonomy.progress.cash-UPGRADES.autonomyJump.price-UPGRADES.autonomySky.price);
  assert.equal(afterAutonomy.progress.vehicles['ducati-panigale-v4'].upgrades.autonomyJump,true);
  assert.equal(afterAutonomy.progress.vehicles['ducati-panigale-v4'].upgrades.autonomySky,true);

  // The server commits, loses the reply, and the player disconnects during retry.
  // Recovery must drain the old event before changing the wallet fence.
  await rpc('position',{room:liveRoom,playerId:alicePlayer,side:-1});
  await pause(450);
  const beforeLost=await inspect(alice.id);
  await arm(alice.id,'hold-lost-reply');
  send(aliceRoom,{type:'luxury',action:'buy',vehicle:'lamborghini-temerario',requestId:14});
  await until(async()=>(await faultState(alice.id)).held&&(await inspect(alice.id)).progress.ownedLuxury.includes('lamborghini-temerario'),'purchase persisted with its response held');
  aliceRoom.socket.close();
  await until(()=>aliceRoom.socket.readyState===WebSocket.CLOSED,'owner disconnects while the reply is held');
  const reconnecting=join(liveRoom,alice.code);
  void reconnecting.catch(()=>{});
  await pause(150);
  await release(alice.id);
  aliceRoom=await reconnecting;
  await until(()=>aliceRoom.last('wallet')?.ownedLuxury?.includes('lamborghini-temerario'),'reconnected wallet contains the completed purchase');
  const restored=await inspect(alice.id);
  assert.ok(restored.revision>=beforeLost.revision+1,'the lost-reply purchase is committed; disconnect may also checkpoint timers');
  assert.equal(restored.progress.cash,purchaseCash(beforeLost.progress.cash,'lamborghini-temerario',beforeLost.progress.ownedLuxury,beforeLost.progress.unlocked));
  assert.equal(restored.progress.ownedLuxury.filter(id=>id==='lamborghini-temerario').length,1);
  assert.equal(restored.progress.unlocked.filter(id=>id==='luxury-temerario').length,1,'lost reply grants its achievement once');
  const rejoinedId=aliceRoom.last('welcome')!.id as string;
  await rpc('position',{room:liveRoom,playerId:rejoinedId,side:-1});
  await pause(450);
  assert.equal((await luxury(aliceRoom,'collect','lamborghini-temerario',15)).ok,true,'reconnected owner collects the saved model');
  await rpc('position',{room:liveRoom,playerId:rejoinedId,side:-1});
  await pause(450);
  assert.equal((await luxury(aliceRoom,'collect','ducati-panigale-v4',16)).ok,true,'reconnected owner collects the customized model');
  await until(()=>{
    const world=aliceRoom.last('state')?.world,player=world?.players.find((item:Message)=>item.id===rejoinedId);
    const car=world?.entities.find((entity:Message)=>entity.id===player?.entityId);
    return car?.kind==='ducati-panigale-v4'&&car.style.paint==='mint'&&car.upgrades.motor===true&&car.upgrades.autonomyJump===true&&car.upgrades.autonomySky===true;
  },'purchased paint, motor, and self-driving tiers restored on the owned car');
  assert.ok(!JSON.stringify(bobRoom.messages).includes(alice.code),'other player never receives the recovery code');
  assert.ok(!bobRoom.messages.some(message=>message.type==='wallet'&&message.ownedLuxury?.includes('lamborghini-temerario')),'other player never receives the owner wallet');

  // Crash the real room after its profile commit and before acknowledgement.
  // A live slow producer must retain the unacknowledged result; after restart
  // the abandoned result can be reclaimed while the owner keeps the car.
  await rpc('position',{room:liveRoom,playerId:rejoinedId,side:-1});
  await pause(450);
  const beforeCrash=await inspect(alice.id);
  await rpc('arm-ack',{room:liveRoom,ackFault:'hold-before'});
  send(aliceRoom,{type:'luxury',action:'buy',vehicle:'bugatti-chiron',requestId:40});
  await until(async()=>(await rpc<{held:boolean}>('ack-fault-state',{room:liveRoom})).held&&(await inspect(alice.id)).progress.ownedLuxury.includes('bugatti-chiron'),'committed purchase awaits room acknowledgement');
  await pause(1300);
  assert.ok((await economyKeys(liveRoom,alice.id)).some(key=>key.startsWith(`unacked:${alice.id}:`)),'live room does not abandon its slow producer');
  const committedBeforeCrash=await inspect(alice.id);
  assert.equal(committedBeforeCrash.revision,beforeCrash.revision+1);
  assert.equal(committedBeforeCrash.progress.cash,purchaseCash(beforeCrash.progress.cash,'bugatti-chiron',beforeCrash.progress.ownedLuxury,beforeCrash.progress.unlocked));
  await stop(child);child=undefined;child=start();await ready();
  const afterCrashRoom=await join(liveRoom,alice.code);
  await until(()=>afterCrashRoom.last('wallet')?.ownedLuxury?.includes('bugatti-chiron'),'owner recovers committed car after room crash');
  const afterCrash=await inspect(alice.id);
  assert.equal(afterCrash.progress.cash,committedBeforeCrash.progress.cash);
  assert.equal(afterCrash.progress.unlocked.filter(award=>award==='luxury-chiron').length,1,'crash retry does not repeat the award');
  await until(async()=>!(await economyKeys(liveRoom,alice.id)).some(key=>key.startsWith(`unacked:${alice.id}:`)),'abandoned room result eventually compacts');

  console.log('PASS: wallet revision races, duplicate receipts, fencing, ordered commits, failed and lost writes, compaction and crash recovery, independent drivers, rejected-head freeze, ownership and restart persistence; transient pickup refresh, stale pickup generation, bounded outage recovery, concurrent recovery, guest binding and bind/confirm supersession, disconnect, lost replies and adoption; paid pickup during a stalled write, showroom purchases and collection, customization, disconnect and recovery.');
  }
} finally {
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

// Isolated local Wrangler fixture. Never run against a deployed game.
// pnpm exec tsx tests/luxury-wallet.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LUXURY_CATALOG, luxuryPurchaseAwards, type LuxuryVehicleId } from '../shared/luxury';
import { NEUTRAL } from '../shared/game';
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
const dir=await mkdtemp(join(tmpdir(),'tesland-wallet-'));
const port=await freePort(), base=`http://127.0.0.1:${port}`, config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-wallet-test',main:resolve('tests/fixtures/luxury-wallet-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*']},
  durable_objects:{bindings:[
    {name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},
  ]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome']}],
}));
let child:ChildProcess|undefined;
const sockets:WebSocket[]=[];
let logs='';
function start() {
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
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
type FaultState={started:number;held:boolean};
const driver=()=>randomUUID();
const acquire=(driverId:string,fence:string,room='fixture')=>rpc<Acquisition>('acquire',{driverId,fence,room});
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const arm=(driverId:string,fault:'hold-before'|'fail-before'|'lost-reply'|'hold-lost-reply')=>rpc<FaultState>('arm',{driverId,fault});
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
function connect(path:string) {
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];
  sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;
    Object.defineProperty(message,'_receivedAt',{value:performance.now()});
    messages.push(message);
  });
  return {socket,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
function send(client:ReturnType<typeof connect>,message:object){client.socket.send(JSON.stringify(message));}
type TimingSample={elapsedMs:number;worldSeconds:number;maxSnapshotGapMs:number;maxAckGapMs:number;snapshots:number;acks:number;lastSeq:number};
/** Sample the actual observer socket and input acknowledgements at 10 Hz. */
async function measureRoom(client:ReturnType<typeof connect>,startSeq:number,durationMs=1250):Promise<TimingSample> {
  const start=performance.now(),startIndex=client.messages.length,startWorld=client.last('state')!.world.time as number;
  let seq=startSeq;
  const timer=setInterval(()=>send(client,{type:'input',seq:++seq,input:NEUTRAL}),100);
  try { await pause(durationMs); } finally { clearInterval(timer); }
  const end=performance.now();
  await until(()=>client.last('state')?.inputAck>=seq,'sample input acknowledgements');
  const states=client.messages.slice(startIndex).filter(message=>message.type==='state'&&message._receivedAt<=end);
  const gaps=(times:number[])=>Math.max(...times.slice(1).map((value,index)=>value-times[index]));
  const snapshotTimes=[start,...states.map(state=>state._receivedAt as number),end];
  let lastAck=startSeq;
  const ackTimes=[start];
  for(const state of states)if(state.inputAck>lastAck){lastAck=state.inputAck;ackTimes.push(state._receivedAt as number);}
  ackTimes.push(end);
  return {elapsedMs:end-start,worldSeconds:(states.at(-1)?.world.time??startWorld)-startWorld,
    maxSnapshotGapMs:gaps(snapshotTimes),maxAckGapMs:gaps(ackTimes),snapshots:states.length,acks:ackTimes.length-2,lastSeq:seq};
}
async function savedCode(name:string) {
  const chat=connect('/api/chat');
  await until(()=>chat.socket.readyState===WebSocket.OPEN,`${name} chat opens`);
  send(chat,{type:'hello',name});
  await until(()=>!!chat.last('ready'),`${name} identity ready`);
  send(chat,{type:'save'});
  await until(()=>!!chat.last('recovery'),`${name} recovery code`);
  return chat.last('recovery')!.code as string;
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

try {
  child=start();await ready();

  // Simulated world time crosses three checkpoint windows without a wall-clock
  // wait. Paused orders must not write again; changed timers flush on finish.
  const timers=await rpc<{paused:{counts:number[];writes:DriverProgress[]};active:{counts:number[];writes:DriverProgress[]}}>('checkpoint-simulation',{});
  assert.deepEqual(timers.paused.counts,[0,1,1,1,1,1],'an unchanged paused order does not create periodic writes');
  assert.deepEqual(timers.paused.writes.map(item=>item.order.elapsed),[2,2.5],'disconnect flushes newly advanced order time');
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

  // Persisted ownership and receipts survive the whole Worker process restarting.
  await stop(child);child=undefined;child=start();await ready();
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
  const refreshClient=connect(`/api/room/${retryRoom}`);
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
  const guestRoomName=`guest-${randomUUID().slice(0,8)}`,guest=connect(`/api/room/${guestRoomName}`);
  await until(()=>!!guest.last('welcome')&&!!guest.last('wallet'),'first-time guest joins');
  const guestPlayer=guest.last('welcome')!.id as string;
  await rpc('delivery-pickup',{room:guestRoomName,playerId:guestPlayer});
  await until(()=>guest.last('wallet')?.earned>0,'guest earns a delivery pickup');
  await barrier(guest,201);
  const guestCash=guest.last('wallet')!.cash as number, guestEarned=guest.last('wallet')!.earned as number;
  const guestCode=await savedCode(`Guest${randomUUID().slice(0,6)}`);
  send(guest,{type:'identity',code:guestCode,requestId:2});
  await until(()=>guest.messages.some(message=>message.type==='identityResult'&&message.requestId===2),'first guest binding');
  assert.equal(guest.messages.find(message=>message.type==='identityResult'&&message.requestId===2)!.ok,true);
  assert.equal(guest.last('wallet')!.cash,guestCash);assert.equal(guest.last('wallet')!.earned,guestEarned);
  // Checkpoint a partially completed order and paid OTA just before a quick reconnect.
  send(guest,{type:'ota',enabled:true,requestId:3});
  await until(()=>guest.messages.some(message=>message.type==='otaResult'&&message.requestId===3),'guest OTA activation');
  assert.equal(guest.messages.find(message=>message.type==='otaResult'&&message.requestId===3)!.ok,true);
  send(guest,{type:'input',seq:1,input:{...NEUTRAL,steer:1}});
  await until(()=>{
    const state=guest.last('state'),player=state?.world.players.find((item:Message)=>item.id===guestPlayer);
    return player?.delivery.order.stage==='dropoff'&&player.delivery.order.elapsed>=0.25&&player.delivery.ota.active;
  },'partial delivery and OTA timer advance');
  send(guest,{type:'input',seq:2,input:NEUTRAL});
  await until(()=>guest.last('state')?.inputAck===2,'guest stops steering');
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
    if(stale.socket.readyState===WebSocket.OPEN){
      assert.equal((await luxury(stale,'collect','ducati-panigale-v4',90)).ok,false,'superseded session cannot collect');
      await pause(450);
      assert.equal((await luxury(stale,'buy','kawasaki-ninja-h2-carbon',91)).ok,false,'superseded session cannot buy');
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
    assert.ok(heldSample.elapsedMs>=1200&&heldSample.snapshots>=5&&heldSample.acks>=5&&heldSample.worldSeconds>0.5,'room and input continue for the 1,200 ms write hold');
    assert.ok(heldSample.maxSnapshotGapMs<Math.max(700,baseline.maxSnapshotGapMs*2+100),'held write does not cause a long snapshot stall');
    assert.ok(heldSample.maxAckGapMs<Math.max(700,baseline.maxAckGapMs*2+100),'held write does not cause a long input acknowledgement stall');
    console.log('Real GameRoom isolation sample (milliseconds; 10 Hz input):',JSON.stringify({baseline,held:heldSample}));
    await release(alice.id);
    await until(()=>aliceRoom.messages.some(message=>message.type==='luxuryResult'&&message.requestId===11&&message.ok),'held purchase completes');
  } finally { await release(alice.id).catch(()=>{}); }
  await barrier(aliceRoom,103);
  assert.equal(aliceRoom.last('wallet')!.cash,purchaseCash(cashBefore,'ducati-panigale-v4'));
  assert.ok(aliceRoom.last('wallet')!.ownedLuxury.includes('ducati-panigale-v4'));
  assert.ok(!bobRoom.last('wallet')!.ownedLuxury.includes('ducati-panigale-v4'),'ownership is private and per-driver');
  await pause(450);
  assert.equal((await luxury(aliceRoom,'buy','ducati-panigale-v4',12)).ok,false,'a duplicate in-room purchase is rejected');
  await pause(450);
  assert.equal((await luxury(aliceRoom,'collect','ducati-panigale-v4',13)).ok,true,'owner collects their car');
  await until(()=>{
    const world=aliceRoom.last('state')?.world,player=world?.players.find((item:Message)=>item.id===alicePlayer);
    return world?.entities.some((entity:Message)=>entity.id===player?.entityId&&entity.kind==='ducati-panigale-v4');
  },'collected model is drivable in the room');

  // Finish and tune this owned model at a workshop; both must follow the owner.
  await rpc('workshop',{room:liveRoom,playerId:alicePlayer});
  await pause(450);
  send(aliceRoom,{type:'vehicleStyle',category:'paint',choice:'mint',requestId:30});
  await until(()=>aliceRoom.messages.some(message=>message.type==='vehicleStyleResult'&&message.requestId===30),'style purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='vehicleStyleResult'&&message.requestId===30)!.ok,true);
  await pause(450);
  send(aliceRoom,{type:'upgrade',upgrade:'motor',requestId:31});
  await until(()=>aliceRoom.messages.some(message=>message.type==='upgradeResult'&&message.requestId===31),'motor purchase result');
  assert.equal(aliceRoom.messages.find(message=>message.type==='upgradeResult'&&message.requestId===31)!.ok,true);
  await barrier(aliceRoom,104);

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
  assert.equal(restored.revision,beforeLost.revision+1,'lost reply is committed once');
  assert.equal(restored.progress.cash,purchaseCash(beforeLost.progress.cash,'lamborghini-temerario',beforeLost.progress.ownedLuxury,beforeLost.progress.unlocked));
  assert.equal(restored.progress.ownedLuxury.filter(id=>id==='lamborghini-temerario').length,1);
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
    return car?.kind==='ducati-panigale-v4'&&car.style.paint==='mint'&&car.upgrades.motor===true;
  },'purchased paint and motor restored on the owned car');
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

  console.log('PASS: wallet revision races, duplicate receipts, fencing, ordered commits, failed and lost writes, compaction and crash recovery, independent drivers, rejected-head freeze, ownership and restart persistence; transient pickup refresh, stale pickup generation, bounded outage recovery, concurrent recovery, guest binding, paid pickup during a stalled write, showroom purchases and collection, customization, disconnect and recovery.');
} finally {
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

// Local-only end-to-end test: pnpm exec tsx tests/award-wallet.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join as joinPath, resolve } from 'node:path';
import { NEUTRAL } from '../shared/game';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=30_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await pause(30);}
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
  if(child.exitCode===null&&child.signalCode===null){
    try{process.kill(-child.pid!,'SIGKILL');}catch{}
    await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler stopped');
  }
}
const dir=await mkdtemp(joinPath(tmpdir(),'tesland-award-wallet-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=joinPath(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-award-wallet-test',main:resolve('tests/fixtures/luxury-wallet-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*']},
  durable_objects:{bindings:[
    {name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
  ]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let child:ChildProcess|undefined,logs='';
const sockets:WebSocket[]=[];
function start() {
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',joinPath(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};
  c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready() {
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited during startup:\n${logs}`);
    try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
  },'Wrangler startup');
}
async function rpc<T>(method:string,body:object):Promise<T> {
  const response=await fetch(`${base}/__wallet-test/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`Fixture ${method} returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
function connect(path:string) {
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];
  const input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;
    input.observe(message);messages.push(message);
  });
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
type Client=ReturnType<typeof connect>;
function send(client:Client,message:object){client.socket.send(JSON.stringify(message));}
async function savedDriver(name:string) {
  const chat=connect('/api/chat');
  await until(()=>chat.socket.readyState===WebSocket.OPEN,`${name} chat opens`);
  send(chat,{type:'hello',name});await until(()=>!!chat.last('ready'),`${name} identity ready`);
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),`${name} recovery code`);
  const code=chat.last('recovery')!.code as string,id=randomUUID();
  assert.ok(await rpc('associate',{driverId:id,code}),'recovery code bound to wallet');
  await rpc('acquire',{driverId:id,fence:randomUUID()});
  return {id,code};
}
async function join(room:string,code:string) {
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),'guest room and wallet ready');
  send(client,{type:'identity',code,requestId:1});
  await until(()=>!!client.last('identityResult'),'saved wallet attachment');
  assert.equal(client.last('identityResult')!.ok,true,JSON.stringify(client.last('identityResult')));
  const resultIndex=client.messages.findIndex(message=>message.type==='identityResult');
  await until(()=>client.messages.slice(resultIndex+1).some(message=>message.type==='state')&&client.input.active,'saved driver control snapshot');
  return client;
}
async function joinGuest(room:string) {
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('state'),'guest room ready');
  send(client,{type:'identity',code:null,requestId:1});
  await until(()=>client.last('identityResult')?.requestId===1&&client.input.active,'guest identity ready');
  return client;
}
async function prepareDomeGuest() {
  const room=`bind-${randomUUID().slice(0,8)}`,client=await joinGuest(room);
  const playerId=client.last('welcome')!.id as string;
  const players=await rpc<{playerId:string;driverId:string}[]>('players',{room});
  const driverId=players.find(player=>player.playerId===playerId)!.driverId;
  client.input.action({type:'dome'});
  await until(()=>{
    const world=client.last('state')?.world,player=world?.players.find((item:Message)=>item.id===playerId);
    return world?.entities.find((entity:Message)=>entity.id===player?.entityId)?.inDome;
  },'guest enters Rocket Dome');
  await rpc('dome-participant',{room,playerId});
  return {room,client,playerId,driverId};
}
async function newRecoveryCode(name:string) {
  const chat=connect('/api/chat');
  await until(()=>chat.socket.readyState===WebSocket.OPEN,`${name} chat opens`);
  send(chat,{type:'hello',name});await until(()=>!!chat.last('ready'),`${name} chat ready`);
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),`${name} recovery code`);
  return chat.last('recovery')!.code as string;
}
async function barrier(client:Client,token:number) {
  send(client,{type:'sync',token});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),`wallet barrier ${token}`);
}
type FaultState={started:number;held:boolean;heldAction?:EconomyIntent['action']};
type RecordState={fence:string;progress:DriverProgress};
const faultState=(driverId:string)=>rpc<FaultState>('fault-state',{driverId});
const release=(driverId:string)=>rpc('release',{driverId});
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const awardCount=(awards:string[])=>awards.filter(award=>award==='park-it').length;
function assertDomeEvidence(action:EconomyIntent['action']|undefined){
  assert.ok(action?.kind==='achievement'&&action.evidence.kind==='dome','the write contains Dome evidence');
  assert.equal(action.evidence.touches.roadster,true);
  assert.ok(action.evidence.goals.roadster>0);
  assert.equal(action.evidence.won,true);
}

try {
  child=start();await ready();
  const [driver,spectator]=await Promise.all([savedDriver('Park Driver'),savedDriver('Park Spectator')]);
  const room=`park-${randomUUID().slice(0,8)}`;
  const owner=await join(room,driver.code),observer=await join(room,spectator.code);
  const ownerId=owner.last('welcome')!.id as string,observerId=observer.last('welcome')!.id as string;
  assert.notEqual(ownerId,observerId);
  owner.input.action({type:'minigame',game:'park'});
  const round=()=>owner.last('state')?.world.parking.rounds.find((item:Message)=>item.mode==='park'&&item.entrants.some((entry:Message)=>entry.playerId===ownerId));
  const entrant=()=>round()?.entrants.find((entry:Message)=>entry.playerId===ownerId);
  await until(()=>!!entrant()?.targetId,'driver joins a real Park It round');
  await barrier(owner,101);
  await until(async()=>{
    const queues=await rpc<{playerId:string;queued:number;processing:boolean}[]>('queues',{room});
    return queues.some(item=>item.playerId===ownerId&&item.queued===0&&!item.processing);
  },'owner wallet queue drains before the test');
  assert.equal(awardCount(owner.last('wallet')!.unlocked),0);
  const ownerBaseline=(await inspect(driver.id)).progress;
  await rpc('arm',{driverId:driver.id,fault:'hold-before'});
  try {
    const assigned=entrant().targetId as string;
    const placed=await rpc<{lotId:string;stallId:string}>('parking-stall',{room,playerId:ownerId});
    assert.equal(placed.stallId,assigned,'fixture positions at the assigned stall');
    await until(()=>entrant()?.finishedAt!==null&&entrant()?.finishedAt!==undefined,'authoritative parking completion');
    assert.equal(round()?.phase,'results');
    await until(async()=>(await faultState(driver.id)).held,'award write is held');
    const held=await faultState(driver.id);
    assert.deepEqual(held.heldAction,{kind:'achievement',evidence:{kind:'parking',mode:'park',finished:true}},'the held write contains the observed completion');
    assert.equal(awardCount(owner.last('wallet')!.unlocked),0,'uncommitted award is absent from wallet');
    const ownerBefore=owner.last('state')!.world.players.find((player:Message)=>player.id===ownerId);
    assert.equal(awardCount(ownerBefore.achievements.unlocked),0,'uncommitted award is absent from room state');
    assert.equal(awardCount((await inspect(driver.id)).progress.unlocked),0,'held write has not committed');

    // The other driver receives fresh snapshots and input acknowledgements while
    // the first driver's own profile commit is still deliberately blocked.
    const initialTime=observer.last('state')!.world.time as number;
    const first=observer.input.send(NEUTRAL);
    await until(()=>observer.input.control!.appliedSeq>=first,'other driver first input acknowledged during held write');
    const second=observer.input.send(NEUTRAL);
    await until(()=>observer.input.control!.appliedSeq>=second&&observer.last('state')!.world.time>initialTime,'other driver second input and world advancement during held write');
    assert.equal((await faultState(driver.id)).held,true,'profile write remains held while the other driver advances');
    assert.equal(awardCount(observer.last('wallet')!.unlocked),0,'spectator wallet does not inherit award');
    assert.equal(awardCount(observer.last('state')!.world.players.find((player:Message)=>player.id===observerId).achievements.unlocked),0);
  } finally { await release(driver.id).catch(()=>{}); }
  await until(()=>awardCount(owner.last('wallet')!.unlocked)===1,'committed award reaches owner wallet');
  await until(()=>awardCount(owner.last('state')!.world.players.find((player:Message)=>player.id===ownerId).achievements.unlocked)===1,'committed award reaches room state');
  await barrier(owner,102);await barrier(observer,103);
  assert.equal(awardCount((await inspect(driver.id)).progress.unlocked),1,'profile stores award exactly once');
  assert.equal((await inspect(driver.id)).progress.achievementTiers?.['parking-successes'].count,1);
  assert.equal((await inspect(driver.id)).progress.cash,ownerBaseline.cash+100,'the first parking tier credits once');
  assert.equal(awardCount((await inspect(spectator.id)).progress.unlocked),0,'spectator profile never inherits award');
  assert.ok(!observer.messages.some(message=>message.type==='wallet'&&message.unlocked.includes('park-it')),'owner wallet is never sent to spectator');
  assert.ok(!JSON.stringify(observer.messages).includes(driver.code),'spectator never receives owner recovery code');

  // A guest may save while a ball already in motion ends their Dome match.
  // Hold the actual bind, not the award commit, and verify the old wallet owns
  // the result before and after that same wallet becomes a saved driver.
  const same=await prepareDomeGuest(),sameCode=await newRecoveryCode('Dome Guest');
  await rpc('arm-bind',{});
  send(same.client,{type:'identity',code:sameCode,requestId:2});
  try {
    await until(async()=>(await rpc<{held:boolean}>('bind-fault-state',{})).held,'guest save bind held');
    await rpc('dome-score',{room:same.room});
    await until(()=>same.client.last('state')?.world.soccer.phase==='win','Dome ends during guest save');
    await until(async()=>(await inspect(same.driverId)).progress.unlocked.includes('rocket-rookie'),'pending-bind Dome award committed to guest wallet');
  } finally { await rpc('release-bind',{}); }
  await until(()=>same.client.last('identityResult')?.requestId===2,'guest save finishes');
  assert.equal(same.client.last('identityResult')!.ok,true,'saving the same wallet succeeds');
  await barrier(same.client,104);
  assert.equal((await inspect(same.driverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,1,'the original driver receives the award exactly once');

  // If an incoming different wallet is in flight, the result belongs to the
  // old driver and makes the switch ineligible rather than transferring it.
  const changed=await prepareDomeGuest(),incoming=await savedDriver('Incoming Driver');
  await rpc('arm-bind',{});
  send(changed.client,{type:'identity',code:incoming.code,requestId:2});
  try {
    await until(async()=>(await rpc<{held:boolean}>('bind-fault-state',{})).held,'different identity bind held');
    await rpc('dome-score',{room:changed.room});
    await until(async()=>(await inspect(changed.driverId)).progress.unlocked.includes('rocket-rookie'),'prior wallet owns result during different identity bind');
  } finally { await rpc('release-bind',{}); }
  await until(()=>changed.client.last('identityResult')?.requestId===2,'different identity bind resolves');
  assert.equal(changed.client.last('identityResult')!.ok,false,'a played guest cannot switch wallets in place');
  assert.equal((await inspect(changed.driverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,1);
  assert.equal((await inspect(incoming.id)).progress.unlocked.filter(id=>id==='rocket-rookie').length,0,'incoming wallet does not inherit the old result');

  // The second unstarted check also covers a result after the new profile
  // acquired its fence but before the acquire RPC returned to this room.
  const acquired=await prepareDomeGuest(),acquiredDriver=await savedDriver('Acquire Boundary');
  await rpc('arm-acquire',{driverId:acquiredDriver.id});
  send(acquired.client,{type:'identity',code:acquiredDriver.code,requestId:2});
  try {
    await until(async()=>(await rpc<{held:boolean}>('acquire-fault-state',{driverId:acquiredDriver.id})).held,'different identity held after acquire');
    await rpc('dome-score',{room:acquired.room});
    await until(async()=>(await inspect(acquired.driverId)).progress.unlocked.includes('rocket-rookie'),'original wallet owns result after incoming acquire');
  } finally { await rpc('release-acquire',{driverId:acquiredDriver.id}); }
  await until(()=>acquired.client.last('identityResult')?.requestId===2,'acquired identity decision resolves');
  assert.equal(acquired.client.last('identityResult')!.ok,false,'post-acquire check rejects replacement after an award');
  assert.equal((await inspect(acquiredDriver.id)).progress.unlocked.filter(id=>id==='rocket-rookie').length,0,'acquired wallet does not inherit the award');
  const boundPlayers=await rpc<{playerId:string;driverId:string}[]>('players',{room:acquired.room});
  assert.equal(boundPlayers.find(player=>player.playerId===acquired.playerId)?.driverId,acquired.driverId,'original wallet remains attached');

  // A provisional saved identity adds a second await after acquisition. A
  // win during confirmation still belongs only to the original driver.
  const confirming=await prepareDomeGuest(),confirmCode=await newRecoveryCode('Confirm Boundary');
  const confirmedDriverId=randomUUID(),priorClaim=randomUUID();
  await rpc('acquire',{driverId:confirmedDriverId,fence:randomUUID()});
  const provisional=await rpc<{walletId:string;claim:boolean}>('binding-begin',{code:confirmCode,driverId:confirmedDriverId,token:priorClaim});
  assert.equal(provisional.walletId,confirmedDriverId);assert.equal(provisional.claim,true);
  await rpc('binding-arm',{bindingStage:'confirm'});
  send(confirming.client,{type:'identity',code:confirmCode,requestId:2});
  try {
    await until(async()=>(await rpc<{held:boolean}>('binding-state',{})).held,'different identity held after confirmation');
    await rpc('dome-score',{room:confirming.room});
    await until(async()=>(await inspect(confirming.driverId)).progress.unlocked.includes('rocket-rookie'),'original wallet owns result during confirmation');
  } finally { await rpc('binding-resume',{}); }
  await until(()=>confirming.client.last('identityResult')?.requestId===2,'confirmed identity decision resolves');
  assert.equal(confirming.client.last('identityResult')!.ok,false,'post-confirm check rejects replacement after an award');
  assert.equal((await inspect(confirming.driverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,1,'the old driver keeps the award exactly once');
  assert.equal((await inspect(confirmedDriverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,0,'the incoming driver does not inherit the award');
  const confirmingPlayers=await rpc<{playerId:string;driverId:string}[]>('players',{room:confirming.room});
  assert.equal(confirmingPlayers.find(player=>player.playerId===confirming.playerId)?.driverId,confirming.driverId);
  await rpc('binding-release',{code:confirmCode,token:priorClaim});

  // The one-time win must survive rollback of a preceding rejected operation.
  // A speculative income behind the rejected operation must not be replayed.
  const replay=await prepareDomeGuest(),replayCode=await newRecoveryCode('Rejected Before Win');
  send(replay.client,{type:'identity',code:replayCode,requestId:2});
  await until(()=>replay.client.last('identityResult')?.requestId===2,'replay driver saved');
  assert.equal(replay.client.last('identityResult')!.ok,true);
  const baseline=(await inspect(replay.driverId)).progress;
  await rpc('arm',{driverId:replay.driverId,fault:'hold-reject'});
  try {
    await rpc('queue-income',{room:replay.room,playerId:replay.playerId,count:1});
    await until(async()=>(await faultState(replay.driverId)).held,'preceding operation held before rejection');
    await rpc('queue-income',{room:replay.room,playerId:replay.playerId,count:1});
    await rpc('dome-score',{room:replay.room});
    await until(()=>replay.client.last('state')?.world.soccer.phase==='win','Dome ends behind held operation');
    await until(async()=>{
      const queues=await rpc<{playerId:string;queued:number}[]>('queues',{room:replay.room});
      return (queues.find(item=>item.playerId===replay.playerId)?.queued??0)>=3;
    },'both speculative income and game award are queued');
    send(replay.client,{type:'sync',token:106});
    await pause(100);
    assert.ok(!replay.client.messages.some(message=>message.type==='state'&&message.sync===106),'barrier does not confirm before rollback');
  } finally { await release(replay.driverId); }
  await until(()=>replay.client.messages.some(message=>message.type==='state'&&message.sync===106),'barrier waits for recovered award');
  const afterReplay=(await inspect(replay.driverId)).progress;
  assert.equal(afterReplay.unlocked.filter(id=>id==='rocket-rookie').length,1,'Dome award survives rollback exactly once');
  assert.equal(afterReplay.unlocked.filter(id=>id==='roadster-champion').length,1,'Dome win survives rollback exactly once');
  assert.equal(afterReplay.achievementTiers?.['dome-matches'].count,1);
  assert.equal(afterReplay.achievementTiers?.['dome-wins'].count,1);
  assert.equal(afterReplay.cash,baseline.cash+1_200,'replay credits the two game awards and first Dome tiers');
  assert.equal(afterReplay.eligibleIncome,baseline.eligibleIncome+1_200,'rejected and speculative income are not replayed');
  assert.deepEqual(replay.client.messages.filter(message=>message.type==='reward').map(message=>message.reward),
    [{id:1,kind:'research',amount:1_200}],'one private celebration includes every award in the replayed transaction');
  let starshipRequest=700;
  await until(async()=>{
    const requestId=starshipRequest++;
    send(replay.client,{type:'starship',action:'status',requestId});
    await until(()=>replay.client.messages.some(message=>message.type==='starshipStatus'&&message.requestId===requestId),'private mission status');
    const status=replay.client.messages.find(message=>message.type==='starshipStatus'&&message.requestId===requestId)!;
    return status.status.personal===afterReplay.eligibleIncome;
  },'replayed game awards reach the global ledger without speculative income');

  // Lose a committed receipt, then hold its retry. The barrier waits for the
  // same evidence, and its awards and tier cash must not be credited twice.
  const lost=await prepareDomeGuest();
  await barrier(lost.client,201);
  await until(async()=>{
    const queues=await rpc<{playerId:string;queued:number;processing:boolean}[]>('queues',{room:lost.room});
    return queues.some(item=>item.playerId===lost.playerId&&item.queued===0&&!item.processing);
  },'lost-reply award queue drains');
  const lostBefore=(await inspect(lost.driverId)).progress;
  const lostArmed=await rpc<{started:number}>('arm',{driverId:lost.driverId,fault:['hold-lost-reply','hold-before']});
  try {
    await rpc('dome-score',{room:lost.room});
    await until(async()=>(await faultState(lost.driverId)).held,'committed receipt held before reply');
    const first=await faultState(lost.driverId);assertDomeEvidence(first.heldAction);
    const committed=(await inspect(lost.driverId)).progress;
    assert.equal(committed.cash,lostBefore.cash+1_200);
    send(lost.client,{type:'sync',token:211});
    await pause(100);
    assert.ok(!lost.client.messages.some(message=>message.type==='state'&&message.sync===211),'barrier waits for the lost reply');
    await release(lost.driverId);
    await until(async()=>{const state=await faultState(lost.driverId);return state.held&&state.started>=lostArmed.started+2;},'same achievement retried');
    const second=await faultState(lost.driverId);assertDomeEvidence(second.heldAction);
    assert.deepEqual(second.heldAction,first.heldAction,'retry carries the identical observation');
    assert.ok(!lost.client.messages.some(message=>message.type==='state'&&message.sync===211),'barrier waits for the retried receipt');
  } finally { await release(lost.driverId).catch(()=>{}); }
  await until(()=>lost.client.messages.some(message=>message.type==='state'&&message.sync===211),'barrier settles after receipt retry');
  const lostRecovered=(await inspect(lost.driverId)).progress;
  assert.equal(lostRecovered.unlocked.filter(id=>id==='rocket-rookie').length,1);
  assert.equal(lostRecovered.unlocked.filter(id=>id==='roadster-champion').length,1);
  assert.equal(lostRecovered.achievementTiers?.['dome-matches'].count,1);
  assert.equal(lostRecovered.achievementTiers?.['dome-wins'].count,1);
  assert.equal(lostRecovered.cash,lostBefore.cash+1_200,'receipt retry does not credit twice');
  assert.equal(lostRecovered.eligibleIncome,lostBefore.eligibleIncome+1_200);
  assert.deepEqual(lost.client.messages.filter(message=>message.type==='reward').map(message=>message.reward),
    [{id:1,kind:'research',amount:1_200}],'a lost reply produces one complete celebration after retry');

  // A rejected physical evidence write fails closed without acknowledging the
  // barrier or allowing later speculative income to become committed.
  for(const [index,reason] of ['invalid','revision'].entries()){
    const attempt=await prepareDomeGuest();
    const attemptCode=await newRecoveryCode(`Rejected ${reason}`);
    send(attempt.client,{type:'identity',code:attemptCode,requestId:2});
    await until(()=>attempt.client.last('identityResult')?.requestId===2,`${reason} wallet saved`);
    assert.equal(attempt.client.last('identityResult')!.ok,true);
    await barrier(attempt.client,221+index);
    await until(async()=>{
      const queues=await rpc<{playerId:string;queued:number;processing:boolean}[]>('queues',{room:attempt.room});
      return queues.some(item=>item.playerId===attempt.playerId&&item.queued===0&&!item.processing);
    },`${reason} permanent-failure queue drains`);
    let closed:CloseEvent|undefined;
    attempt.client.socket.addEventListener('close',event=>{closed=event;},{once:true});
    const beforeRecord=await inspect(attempt.driverId),before=beforeRecord.progress;
    const armed=await rpc<{started:number}>('arm',{driverId:attempt.driverId,fault:reason==='invalid'?'hold-reject':'hold-revision'});
    const token=231+index;
    try {
      await rpc('dome-score',{room:attempt.room});
      await until(async()=>(await faultState(attempt.driverId)).held,`${reason} permanent award write held`);
      const first=await faultState(attempt.driverId);
      assertDomeEvidence(first.heldAction);
      await rpc('queue-income',{room:attempt.room,playerId:attempt.playerId,count:1});
      send(attempt.client,{type:'sync',token});
      await pause(100);
      assert.ok(!attempt.client.messages.some(message=>message.type==='state'&&message.sync===token));
    } finally { await release(attempt.driverId).catch(()=>{}); }
    await until(()=>!!closed,`${reason} failed wallet closes`,15_000);
    assert.equal(closed!.code,1011);
    assert.match(closed!.reason,/Achievement interrupted/);
    assert.ok(!attempt.client.messages.some(message=>message.type==='state'&&message.sync===token),'failed award barrier is never acknowledged');
    assert.equal((await faultState(attempt.driverId)).started,armed.started+1,'a rejected physical event fails closed without retries');
    const failed=(await inspect(attempt.driverId)).progress;
    assert.ok(!failed.unlocked.includes('rocket-rookie'),'uncommitted award is not claimed as saved');
    assert.equal(failed.cash,before.cash,'later speculative income is not credited');
    assert.equal(failed.achievementTiers?.['dome-matches'].count,0);
    const reconnect=connect(`/api/room/failed-return-${randomUUID().slice(0,8)}`);
    await until(()=>!!reconnect.last('welcome')&&!!reconnect.last('wallet'),`${reason} reconnect guest ready`);
    send(reconnect,{type:'identity',code:attemptCode,requestId:1});
    await until(()=>reconnect.last('identityResult')?.requestId===1,`${reason} rejected evidence handoff resolves`);
    assert.equal(reconnect.last('identityResult')!.ok,false,'a rejected physical outcome blocks the handoff');
    assert.equal(reconnect.last('identityResult')!.message,'Could not load driver. Rejoin to retry.');
    assert.equal((await inspect(attempt.driverId)).fence,beforeRecord.fence,'a failed handoff does not install a new fence');
  }

  // Two real room clients start a race. The first finisher disconnects while
  // its award commit is held and the other driver is still on the course.
  const [raceDriver,raceOtherDriver]=await Promise.all([savedDriver('Race Winner'),savedDriver('Race Challenger')]);
  const raceRoom=`race-${randomUUID().slice(0,8)}`;
  const racer=await join(raceRoom,raceDriver.code),challenger=await join(raceRoom,raceOtherDriver.code);
  const racerId=racer.last('welcome')!.id as string,challengerId=challenger.last('welcome')!.id as string;
  const raceRound=()=>challenger.last('state')?.world.races.rounds.find((round:Message)=>round.courseId==='short');
  const raceEntrant=(id:string)=>raceRound()?.entrants.find((entrant:Message)=>entrant.playerId===id);
  racer.input.action({type:'minigame',game:'short'});
  await until(()=>!!raceEntrant(racerId),'first driver joins the race');
  challenger.input.action({type:'minigame',game:'short'});
  await until(()=>!!raceEntrant(challengerId),'second driver joins the race');
  send(racer,{type:'race',action:'start',courseId:'short'});
  await until(()=>raceRound()?.phase==='active'&&raceRound()?.starterCount===2,'contested race starts');
  await barrier(racer,107);
  await until(async()=>{
    const queues=await rpc<{playerId:string;queued:number;processing:boolean}[]>('queues',{room:raceRoom});
    return queues.some(item=>item.playerId===racerId&&item.queued===0&&!item.processing);
  },'winner wallet queue drains before the race finish');
  const raceBaseline=(await inspect(raceDriver.id)).progress;
  await rpc('arm',{driverId:raceDriver.id,fault:'hold-before'});
  try {
    for(let index=0;index<5;index++){
      const gate=await rpc<{index:number}>('race-gate',{room:raceRoom,playerId:racerId});
      assert.equal(gate.index,index);
      await until(()=>(raceEntrant(racerId)?.nextGate??0)>index,`race checkpoint ${index+1}`);
    }
    assert.equal(raceRound().phase,'active','the other racer has not finished');
    assert.equal(raceEntrant(racerId).rank,1);assert.equal(raceEntrant(challengerId).status,'entered');
    await until(async()=>(await faultState(raceDriver.id)).held,'winner award commit held');
    const raceHeld=await faultState(raceDriver.id);
    assert.deepEqual(raceHeld.heldAction,{kind:'achievement',evidence:{kind:'race',status:'finished',phase:'active',rank:1,starterCount:2}});
    assert.ok(!(await inspect(raceDriver.id)).progress.unlocked.includes('race-winner'),'uncommitted win is not exposed');
    racer.socket.close();
    await until(()=>challenger.last('state')?.world.players.every((player:Message)=>player.id!==racerId),'winner disconnects before the challenger finishes');
    assert.equal(raceRound().phase,'active');assert.equal(raceEntrant(challengerId).status,'entered');
  } finally { await release(raceDriver.id); }
  await until(async()=>(await inspect(raceDriver.id)).progress.unlocked.includes('race-winner'),'disconnected winner award commits');
  const recoveredRacer=await join(`race-return-${randomUUID().slice(0,8)}`,raceDriver.code);
  assert.equal(recoveredRacer.last('wallet')!.unlocked.filter((id:string)=>id==='race-winner').length,1,'First Across survives disconnect and recovery');
  assert.equal(recoveredRacer.last('wallet')!.achievementTiers['races-finished'].count,1);
  assert.equal(recoveredRacer.last('wallet')!.achievementTiers['races-won'].count,1);
  assert.equal(recoveredRacer.last('wallet')!.cash,raceBaseline.cash+200,'the first contested finish credits both tiers once');
  assert.ok(!challenger.last('wallet')!.unlocked.includes('race-winner'),'other racer does not inherit the win');

  // A successful switch before the result must also discard the old driver's
  // touches: a later goal without any new touch cannot earn the new wallet it.
  const beforeResult=await prepareDomeGuest(),replacement=await savedDriver('Replacement Driver');
  await rpc('race-result',{room:beforeResult.room,playerId:beforeResult.playerId});
  await until(()=>beforeResult.client.last('state')?.world.races.rounds.some((round:Message)=>round.entrants.some((entrant:Message)=>entrant.playerId===beforeResult.playerId)),'old driver race result visible');
  send(beforeResult.client,{type:'identity',code:replacement.code,requestId:2});
  await until(()=>beforeResult.client.last('identityResult')?.requestId===2,'switch before result completes');
  assert.equal(beforeResult.client.last('identityResult')!.ok,true,'an unstarted guest can switch');
  await until(()=>beforeResult.client.last('state')?.world.races.rounds.every((round:Message)=>round.entrants.every((entrant:Message)=>entrant.playerId!==beforeResult.playerId)),'replacement does not inherit old race result');
  await rpc('dome-score',{room:beforeResult.room});
  await until(()=>beforeResult.client.last('state')?.world.soccer.phase==='win','Dome ends after switch');
  await barrier(beforeResult.client,105);
  assert.equal((await inspect(replacement.id)).progress.unlocked.filter(id=>id==='rocket-rookie').length,0,'old touches cannot earn the replacement driver an award');

  // Restart Wrangler with the same Durable Object storage, then attach each
  // saved driver in a fresh room using its real recovery code.
  await stop(child);child=undefined;child=start();await ready();
  assert.equal(awardCount((await inspect(driver.id)).progress.unlocked),1,'award survives process restart');
  assert.equal((await inspect(same.driverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,1,'guest-save Dome award survives process restart');
  assert.equal((await inspect(replay.driverId)).progress.unlocked.filter(id=>id==='rocket-rookie').length,1,'recovered Dome award survives process restart');
  const restoredRoom=`restore-${randomUUID().slice(0,8)}`;
  const recovered=await join(restoredRoom,driver.code),recoveredObserver=await join(restoredRoom,spectator.code);
  const recoveredDome=await join(restoredRoom,sameCode);
  assert.equal(awardCount(recovered.last('wallet')!.unlocked),1,'owner recovers saved award in a new room');
  assert.equal(awardCount(recoveredObserver.last('wallet')!.unlocked),0,'spectator recovers without owner award');
  assert.equal(recoveredDome.last('wallet')!.unlocked.filter((id:string)=>id==='rocket-rookie').length,1,'saved guest recovers the Dome award');
  const recoveredId=recovered.last('welcome')!.id as string;
  assert.equal(awardCount(recovered.last('state')!.world.players.find((player:Message)=>player.id===recoveredId).achievements.unlocked),1);
  console.log('PASS: held and rejected writes preserve only earned awards, identity binds keep awards on the original driver, and a contested race winner recovers after disconnect.');
} catch(error) {
  console.error('Wrangler output:\n'+logs);
  throw error;
} finally {
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

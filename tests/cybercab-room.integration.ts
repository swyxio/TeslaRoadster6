// Local Wrangler only: production room + wallet with deterministic test faults.
// pnpm exec tsx tests/cybercab-room.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const delay = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check:()=>boolean|Promise<boolean>, label:string, timeout=15_000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await delay(30);}
  throw new Error(`Timed out: ${label}`);
}
async function freePort() {
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}
const dir=await mkdtemp(join(tmpdir(),'tesland-cab-room-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-cab-room-test',main:resolve('tests/fixtures/cybercab-room-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__cab-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let logs='',child:ChildProcess|undefined;
let ownerDrive:ReturnType<typeof setInterval>|undefined;
const sockets:WebSocket[]=[];
function start() {
  const processChild=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};
  processChild.stdout?.on('data',append);processChild.stderr?.on('data',append);return processChild;
}
async function rpc<T>(method:string,body:object):Promise<T> {
  const response=await fetch(`${base}/__wallet-test/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`Fixture ${method}: ${response.status} ${await response.text()}\n${logs}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
function connect(path:string,guest=false) {
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];
  const input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);
    if(guest&&message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
  });
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
type Client=ReturnType<typeof connect>;
function send(client:Client,message:object){client.socket.send(JSON.stringify(message));}
function world(client:Client):World{return client.last('state')!.world;}
const cab=(client:Client,assetId:string)=>world(client).entities.find(entity=>entity.cab?.assetId===assetId);
async function savedCode() {
  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  send(chat,{type:'hello',name:'Cab owner'});await until(()=>!!chat.last('ready'),'chat identity');
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),'recovery code');
  const code=chat.last('recovery')!.code as string;chat.socket.close();
  await until(()=>chat.socket.readyState===WebSocket.CLOSED,'chat closes');return code;
}
async function joinSaved(room:string,code:string,expectedCash=25_000) {
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),'initial wallet');
  assert.equal(client.last('welcome')!.version,PROTOCOL_VERSION);
  send(client,{type:'identity',code,requestId:1});
  await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===1),'saved identity');
  assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!.ok,true);
  await until(()=>client.input.active&&client.messages.some(message=>message.type==='wallet'&&message.cash===expectedCash),'saved wallet attached');
  return client;
}
async function joinGuest(room:string) {
  const client=connect(`/api/room/${room}`,true);
  await until(()=>client.input.active&&!!client.last('state'),'observing driver joins');return client;
}
type RecordState={progress:DriverProgress};
type FaultState={held:boolean;heldAction?:EconomyIntent['action']};
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const arm=(driverId:string,fault:string)=>rpc('arm',{driverId,fault});
const faultState=(driverId:string)=>rpc<FaultState>('fault-state',{driverId});
async function roomCabs(room:string):Promise<{assetId:string;owner:string|null;driver:string|null}[]> {
  const response=await fetch(`${base}/__cab-test/cabs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`Fixture room cabs: ${response.status} ${await response.text()}`);
  return response.json();
}
async function placeBorrower(room:string,playerId:string,assetId:string) {
  const response=await fetch(`${base}/__cab-test/place-borrower`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room,playerId,assetId}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`Fixture borrower placement: ${response.status} ${await response.text()}`);
}

try {
  child=start();
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited:\n${logs}`);
    try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
  },'Wrangler startup',30_000);
  const driverId=randomUUID(),code=await savedCode(),roomA=`cab-a-${Date.now()}`,roomB=`cab-b-${Date.now()}`;
  const associated=await rpc<{walletId:string}>('associate',{driverId,code});assert.equal(associated.walletId,driverId);
  await rpc('acquire',{driverId,fence:randomUUID()});await rpc('fund',{driverId,seedCash:25_000});
  const owner=await joinSaved(roomA,code),observer=await joinGuest(roomA);
  const ownerId=owner.last('welcome')!.id as string;
  // A spawn may land on a delivery pickup; drain any immediate game rewards
  // before arming the purchase fault and compare with the committed baseline.
  await delay(600);send(owner,{type:'sync',token:100});
  await until(()=>owner.messages.some(message=>message.type==='state'&&message.sync===100),'initial wallet barrier');
  const starting=(await inspect(driverId)).progress;
  assert.equal(starting.cybercabs?.assets.length??0,0);assert.ok(starting.cash>=25_000);

  // The profile commits, but its reply is held and then lost. The room must
  // withhold dispatch and the receipt while an unrelated driver keeps moving.
  await arm(driverId,'hold-lost-reply');send(owner,{type:'cab',action:'buy',requestId:2});
  await until(async()=>{const fault=await faultState(driverId);return fault.held&&fault.heldAction?.kind==='cab-buy';},'purchase reply held after commit');
  send(owner,{type:'cab',action:'buy',requestId:2});
  const committed=await inspect(driverId),assets=committed.progress.cybercabs!.assets;
  const purchaseCash=starting.cash-25_000+5_000,purchaseIncome=starting.eligibleIncome+5_000;
  assert.equal(assets.length,1);assert.equal(committed.progress.cash,purchaseCash);assert.equal(committed.progress.eligibleIncome,purchaseIncome);
  const assetId=assets[0].id;
  assert.equal(owner.last('wallet')!.cash,starting.cash,'committed-but-unconfirmed purchase stays private to the ledger');
  assert.ok(!owner.messages.some(message=>message.type==='cabResult'&&message.requestId===2));
  assert.ok(!cab(owner,assetId),'unconfirmed asset has not entered the world');
  const beforeTick=observer.input.tick;
  const sequence=observer.input.send({...NEUTRAL,steer:1});
  await until(()=>observer.input.tick>=beforeTick+8&&(observer.input.control?.appliedSeq??0)>=sequence,'other driver snapshots and input continue while the reply is held');
  assert.equal((await faultState(driverId)).held,true);
  await rpc('release',{driverId});
  await until(()=>owner.messages.some(message=>message.type==='cabResult'&&message.requestId===2),'purchase receipt after retry');
  const replies=()=>owner.messages.filter(message=>message.type==='cabResult'&&message.requestId===2);
  assert.equal(replies().length,1,'an in-flight duplicate is coalesced');
  assert.equal(replies()[0].ok,true);
  send(owner,{type:'cab',action:'buy',requestId:2});
  await until(()=>replies().length===2,'completed duplicate receipt replay');
  assert.deepEqual(replies()[1],replies()[0]);
  await until(()=>owner.last('wallet')?.cybercabs?.assets.some((asset:{id:string})=>asset.id===assetId),'committed fleet delivered');
  assert.equal((await inspect(driverId)).progress.cybercabs!.assets.length,1,'lost reply did not buy twice');
  await until(()=>!!cab(owner,assetId),'owned cab dispatched',10_000);
  const entity=cab(owner,assetId)!;
  assert.equal(entity.owner,ownerId);assert.equal(entity.kind,'cybercab');assert.equal(entity.npc,true);assert.equal(entity.autopilot,true);assert.equal(entity.driver,null);
  assert.deepEqual((await roomCabs(roomA)).filter(item=>item.assetId===assetId),[{assetId,owner:ownerId,driver:null}]);

  // Until actual control input the owner is idle; dispatch alone earns nothing.
  await delay(1_200);
  let saved=(await inspect(driverId)).progress;
  assert.equal(saved.cash,purchaseCash);assert.equal(saved.cybercabs!.assets[0].gross,0);assert.equal(saved.cybercabs!.assets[0].lastEndMs,0);
  owner.input.send({...NEUTRAL,steer:1});await delay(400);owner.input.send(NEUTRAL);
  await until(async()=>{const progress=(await inspect(driverId)).progress;return progress.cybercabs!.assets[0].gross>0;},'active interval settles after owner goes idle',12_000);
  saved=(await inspect(driverId)).progress;
  const earned=saved.cybercabs!.assets[0];
  assert.ok(earned.gross>0&&earned.lastEndMs>0);assert.equal(saved.cash,purchaseCash+earned.gross);assert.equal(saved.eligibleIncome,purchaseIncome+earned.gross);
  await delay(1_500);
  const beforeBorrow=(await inspect(driverId)).progress;
  assert.deepEqual([beforeBorrow.cash,beforeBorrow.cybercabs!.assets[0].gross,beforeBorrow.cybercabs!.assets[0].lastEndMs],
    [saved.cash,earned.gross,earned.lastEndMs],'an idle connected owner earns no further cab income');

  // The borrower exits their own car and enters the real cab via the normal
  // interact protocol. Fixture positioning only puts their avatar beside it.
  const observerId=observer.last('welcome')!.id as string;
  ownerDrive=setInterval(()=>{if(owner.input.active)owner.input.send({...NEUTRAL,steer:1});},200);
  await until(()=>{
    const state=world(owner),player=state.players.find(item=>item.id===ownerId);
    return !!player&&player.delivery.activeUntil>state.time;
  },'owner actively playing before cab takeover');
  observer.input.action({type:'interact'});
  await until(()=>{
    const state=world(observer),player=state.players.find(item=>item.id===observerId);
    return state.entities.some(entity=>entity.id===player?.entityId&&entity.kind==='person');
  },'borrower exits their car');
  await delay(500);
  await placeBorrower(roomA,observerId,assetId);
  observer.input.action({type:'interact'});
  await until(async()=>(await roomCabs(roomA)).some(item=>item.assetId===assetId&&item.owner===ownerId&&item.driver===observerId),'borrower takes the cab');
  await delay(250);send(owner,{type:'sync',token:101});
  await until(()=>owner.messages.some(message=>message.type==='state'&&message.sync===101),'pre-takeover income drains');
  const occupied=(await inspect(driverId)).progress;
  await delay(1_500);
  const stateWhileOccupied=world(owner),ownerWhileOccupied=stateWhileOccupied.players.find(player=>player.id===ownerId)!;
  assert.ok(ownerWhileOccupied.delivery.activeUntil>stateWhileOccupied.time,'owner remains active while cab is borrowed');
  assert.equal((await roomCabs(roomA)).find(item=>item.assetId===assetId)?.driver,observerId);
  const stillOccupied=(await inspect(driverId)).progress;
  assert.deepEqual([stillOccupied.cash,stillOccupied.eligibleIncome,stillOccupied.cybercabs!.assets[0].gross,stillOccupied.cybercabs!.assets[0].remainder,stillOccupied.cybercabs!.assets[0].lastEndMs],
    [occupied.cash,occupied.eligibleIncome,occupied.cybercabs!.assets[0].gross,occupied.cybercabs!.assets[0].remainder,occupied.cybercabs!.assets[0].lastEndMs],
    'an occupied cab earns nothing even while its owner is active');
  observer.input.action({type:'interact'});
  await until(async()=>(await roomCabs(roomA)).some(item=>item.assetId===assetId&&item.driver===null),'borrower releases the cab');
  await until(()=>cab(owner,assetId)?.autopilot===true,'released cab resumes autonomous service');
  await delay(1_200);
  clearInterval(ownerDrive);ownerDrive=undefined;owner.input.send(NEUTRAL);
  await until(async()=>(await inspect(driverId)).progress.cybercabs!.assets[0].gross>occupied.cybercabs!.assets[0].gross,'active cab earnings resume after release',12_000);
  await until(()=>{
    const state=world(owner),player=state.players.find(item=>item.id===ownerId);
    return !!player&&player.delivery.activeUntil<state.time;
  },'owner active window ends before the offline baseline',12_000);
  send(owner,{type:'sync',token:102});
  await until(()=>owner.messages.some(message=>message.type==='state'&&message.sync===102),'final active income drains before the offline baseline');
  const idle=(await inspect(driverId)).progress;

  owner.socket.close();await until(()=>owner.socket.readyState===WebSocket.CLOSED,'owner disconnects');
  await until(()=>!world(observer).players.some(player=>player.id===ownerId),'departed owner leaves room');
  await until(async()=>!(await roomCabs(roomA)).some(item=>item.assetId===assetId),'departed owner cab disappears from the authoritative room');
  await delay(1_000);
  const offline=(await inspect(driverId)).progress;
  assert.deepEqual([offline.cash,offline.cybercabs!.assets[0].gross,offline.cybercabs!.assets[0].remainder],
    [idle.cash,idle.cybercabs!.assets[0].gross,idle.cybercabs!.assets[0].remainder],'offline time earns nothing and the fractional remainder persists');

  const moved=await joinSaved(roomB,code,idle.cash),observerB=await joinGuest(roomB);
  const movedId=moved.last('welcome')!.id as string;
  await until(()=>!!cab(moved,assetId),'the same saved cab dispatches after reconnect',10_000);
  assert.equal(cab(moved,assetId)!.owner,movedId);
  assert.equal(moved.last('wallet')!.cybercabs.assets[0].id,assetId);
  const returned=await joinSaved(roomA,code,idle.cash);
  await until(()=>moved.socket.readyState===WebSocket.CLOSED,'older room fence is closed');
  await until(()=>!world(observerB).players.some(player=>player.id===movedId),'old owner leaves its room');
  await until(async()=>!(await roomCabs(roomB)).some(item=>item.assetId===assetId),'old room evicts the cab');
  await until(()=>!!cab(returned,assetId),'cab dispatches under the new room owner',10_000);
  assert.equal(cab(returned,assetId)!.owner,returned.last('welcome')!.id);
  assert.deepEqual((await roomCabs(roomA)).filter(item=>item.assetId===assetId),[{assetId,owner:returned.last('welcome')!.id,driver:null}]);
  assert.equal((await inspect(driverId)).progress.cybercabs!.assets.length,1);

  // Reconnect while a committed purchase reply is still uncertain. A new
  // request must stay unavailable until the old session's journal drains.
  const uncertainId=randomUUID(),uncertainCode=await savedCode(),roomC=`cab-c-${Date.now()}`,roomD=`cab-d-${Date.now()}`;
  await rpc('associate',{driverId:uncertainId,code:uncertainCode});
  await rpc('acquire',{driverId:uncertainId,fence:randomUUID()});await rpc('fund',{driverId:uncertainId,seedCash:25_000});
  const prior=await joinSaved(roomC,uncertainCode);
  await delay(600);send(prior,{type:'sync',token:200});
  await until(()=>prior.messages.some(message=>message.type==='state'&&message.sync===200),'uncertain driver initial barrier');
  await arm(uncertainId,'hold-lost-reply');send(prior,{type:'cab',action:'buy',requestId:50});
  await until(async()=>{const fault=await faultState(uncertainId);return fault.held&&fault.heldAction?.kind==='cab-buy';},'uncertain purchase committed but reply held');
  const uncertainCommit=(await inspect(uncertainId)).progress,uncertainAsset=uncertainCommit.cybercabs!.assets[0].id;
  prior.socket.close();await until(()=>prior.socket.readyState===WebSocket.CLOSED,'uncertain owner disconnects');
  const reconciling=connect(`/api/room/${roomD}`);
  await until(()=>!!reconciling.last('welcome')&&!!reconciling.last('wallet'),'reconnecting guest wallet');
  send(reconciling,{type:'identity',code:uncertainCode,requestId:1});await delay(400);
  assert.ok(!reconciling.messages.some(message=>message.type==='identityResult'&&message.requestId===1),'saved identity waits for the uncertain wallet');
  send(reconciling,{type:'cab',action:'buy',requestId:51});
  await until(()=>reconciling.messages.some(message=>message.type==='cabResult'&&message.requestId===51),'purchase during reconciliation rejected');
  assert.deepEqual(reconciling.messages.find(message=>message.type==='cabResult'&&message.requestId===51),
    {type:'cabResult',requestId:51,action:'buy',ok:false,reason:'unavailable'});
  await rpc('release',{driverId:uncertainId});
  await until(()=>reconciling.messages.some(message=>message.type==='identityResult'&&message.requestId===1&&message.ok),'uncertain purchase reconciles on reconnect');
  await until(()=>reconciling.messages.some(message=>message.type==='wallet'&&message.cash===uncertainCommit.cash&&message.cybercabs?.assets[0]?.id===uncertainAsset),'reconnected wallet includes the committed purchase');
  assert.equal((await inspect(uncertainId)).progress.cybercabs!.assets.length,1);
  await until(()=>!!cab(reconciling,uncertainAsset),'reconciled cab dispatches',10_000);
  assert.ok(!(await roomCabs(roomC)).some(item=>item.assetId===uncertainAsset),'uncertain old room has no cab');
  assert.equal((await roomCabs(roomD)).filter(item=>item.assetId===uncertainAsset).length,1);
  console.log('PASS: saved identity, purchase retries, independent snapshots, authoritative dispatch, active-only income, borrower takeover/release, offline persistence, and cross-room eviction.');
} catch(error) {
  console.error(logs);throw error;
} finally {
  if(ownerDrive)clearInterval(ownerDrive);
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);await rm(dir,{recursive:true,force:true});
}

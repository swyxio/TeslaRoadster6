// Real room, profile and pickup journal in isolated local Wrangler storage.
// pnpm exec tsx tests/supply-pickup.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverProgress, EconomyIntent } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=25_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(40);}throw new Error(`Timed out: ${label}`);
}
async function freePort(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function crash(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGKILL');}catch{}
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler shutdown',10_000);
}
const dir=await mkdtemp(join(tmpdir(),'tesland-supply-pickup-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-supply-pickup-test',main:resolve('tests/fixtures/supply-pickup-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__pickup-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
    {name:'MARKET',class_name:'MarketService'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent','MarketService']}]}));
let logs='',child:ChildProcess|undefined,token=0;
const sockets:WebSocket[]=[];
function start(){
  const current=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-30_000);};current.stdout?.on('data',append);current.stderr?.on('data',append);return current;
}
async function ready(){await until(async()=>{
  if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
  try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
},'Wrangler startup',40_000);}
async function rpc<T>(group:'wallet'|'pickup',method:string,body:object):Promise<T>{
  const response=await fetch(`${base}/__${group}-test/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error(`${group}/${method}: ${response.status} ${await response.text()}`);return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
type PickupState={eventId:string|null;generation:number;readyAt:number};
type Journal={pickup:PickupState;pending:EconomyIntent[];stages:{eventId:string}[]};
type Client={room:string;socket:WebSocket;messages:Message[];input:RoomInputClient;playerId:string;driverId:string};
const pickupId='pickup-0';
async function guest():Promise<Client>{
  const room=`supply-${randomUUID().slice(0,8)}`,socket=new WebSocket(base.replace(/^http/,'ws')+`/api/room/${room}`);
  const messages:Message[]=[],input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);
    if(message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
  });
  await until(()=>input.active&&messages.some(message=>message.type==='wallet'),'guest joins');
  const playerId=messages.find(message=>message.type==='welcome')!.id as string;
  const players=await rpc<{playerId:string;driverId:string}[]>('wallet','players',{room});
  const driverId=players.find(player=>player.playerId===playerId)?.driverId;assert.ok(driverId);
  const client={room,socket,messages,input,playerId,driverId};await delay(500);await sync(client);return client;
}
async function sync(client:Client){
  const id=++token;client.socket.send(JSON.stringify({type:'sync',token:id}));
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===id),'wallet barrier');
}
const inspect=(driverId:string)=>rpc<{progress:DriverProgress}>('wallet','inspect',{driverId});
const journal=(client:Client)=>rpc<Journal>('pickup','journal',{room:client.room,driverId:client.driverId,pickupId});
async function localPickup(client:Client){
  await rpc('pickup','car',{room:client.room,playerId:client.playerId,moveAway:false});
  await rpc('wallet','supply-pickup',{room:client.room,playerId:client.playerId,pickupId});
  await until(async()=>!(await rpc<{pickup:{active:boolean}}>('wallet','pickup-state',{room:client.room,pickupId})).pickup.active,'room observes pickup');
}
async function moveAway(client:Client){await rpc('pickup','car',{room:client.room,playerId:client.playerId,moveAway:true});}
function credit(before:DriverProgress,after:DriverProgress){
  assert.deepEqual(before.achievementTiers!['supply-pickups'],{count:0,claimed:0});
  assert.deepEqual(after.achievementTiers!['supply-pickups'],{count:1,claimed:1});
  assert.equal(after.cash,before.cash+105);assert.equal(after.eligibleIncome,before.eligibleIncome+105);assert.equal(after.earned,before.earned);
}

try{
  child=start();await ready();
  // Accept the physical pickup behind a held wallet head. Its reservation is
  // durable before any credit, and it must survive the head's rejection.
  const rejected=await guest(),initial=(await inspect(rejected.driverId)).progress;
  await rpc('wallet','arm',{driverId:rejected.driverId,fault:'hold-reject'});
  await rpc('wallet','queue-income',{room:rejected.room,playerId:rejected.playerId,count:1});
  await until(async()=>(await rpc<{held:boolean}>('wallet','fault-state',{driverId:rejected.driverId})).held,'preceding wallet head held');
  await localPickup(rejected);
  await until(async()=>(await rpc<{queued:number}[]>('wallet','queues',{room:rejected.room})).some(item=>item.queued>=2),'pickup queued behind head');
  await until(async()=>{
    const state=await journal(rejected);
    return !!state.pickup.eventId&&state.stages.some(stage=>stage.eventId===state.pickup.eventId);
  },'pickup stage and reservation accepted behind head');
  const acceptedBehindHead=await journal(rejected);
  assert.equal(acceptedBehindHead.pickup.generation,0);
  assert.ok(!acceptedBehindHead.pending.some(intent=>intent.pickup?.id===pickupId));
  assert.equal((await inspect(rejected.driverId)).progress.cash,initial.cash,'reservation is not wallet credit');
  await moveAway(rejected);await rpc('wallet','release',{driverId:rejected.driverId});await sync(rejected);
  credit(initial,(await inspect(rejected.driverId)).progress);
  const afterHead=await journal(rejected);assert.equal(afterHead.pickup.eventId,null);assert.equal(afterHead.pickup.generation,1);
  assert.equal((await rpc<{health:number}>('pickup','car-state',{room:rejected.room,playerId:rejected.playerId})).health,100);
  rejected.socket.close();

  // A durable reservation is not a credit. A rejected profile write releases
  // the reservation without advancing its generation or healing the car.
  const denied=await guest(),deniedBefore=(await inspect(denied.driverId)).progress;
  await rpc('pickup','arm',{driverId:denied.driverId,fault:'reject'});await localPickup(denied);
  await until(async()=>!!(await rpc<{held:string|null}>('pickup','held',{driverId:denied.driverId})).held,'pickup commit held before rejection');
  const reserved=await journal(denied);assert.ok(reserved.pickup.eventId);
  assert.ok(reserved.pending.some(intent=>intent.eventId===reserved.pickup.eventId&&intent.pickup?.id===pickupId));
  assert.equal((await inspect(denied.driverId)).progress.cash,deniedBefore.cash);
  assert.ok((await rpc<{health:number}>('pickup','car-state',{room:denied.room,playerId:denied.playerId})).health<100);
  await moveAway(denied);await rpc('pickup','release',{driverId:denied.driverId});
  await until(async()=>{const current=await journal(denied);return current.pickup.eventId===null;},'rejected reservation released');
  const released=await journal(denied);assert.deepEqual(released.pickup,{eventId:null,generation:0,readyAt:0});
  assert.equal((await inspect(denied.driverId)).progress.cash,deniedBefore.cash);
  assert.deepEqual(await rpc('pickup','status',{room:denied.room,eventId:reserved.pickup.eventId}),{ok:false,reason:'invalid'});
  denied.socket.close();

  // A successful stage response can be lost after the atomic reservation and
  // evidence commit, before the room has sent any wallet intent.
  const staged=await guest(),stagedBefore=(await inspect(staged.driverId)).progress;
  await rpc('pickup','arm-stage',{room:staged.room});await localPickup(staged);
  let heldStage:string|null=null;
  await until(async()=>{heldStage=(await rpc<{held:string|null}>('pickup','stage-held',{room:staged.room})).held;return !!heldStage;},'accepted supply stage reply held');
  const stagedJournal=await journal(staged);
  assert.equal(stagedJournal.pickup.eventId,heldStage);
  assert.ok(stagedJournal.stages.some(stage=>stage.eventId===heldStage));
  assert.ok(!stagedJournal.pending.some(intent=>intent.pickup?.id===pickupId));
  assert.equal((await inspect(staged.driverId)).progress.cash,stagedBefore.cash);
  await crash(child);child=start();await ready();
  await until(async()=>{
    const state=await journal(staged);
    return state.pickup.eventId===null&&state.pickup.generation===1&&!state.stages.some(stage=>stage.eventId===heldStage);
  },'accepted stage crash recovery',35_000);
  credit(stagedBefore,(await inspect(staged.driverId)).progress);

  // Crash on each side of profile commit after a reservation is durable.
  // Recovery must resolve the same intent once and advance the cooldown once.
  for(const fault of ['before-commit','after-commit'] as const){
    const client=await guest(),before=(await inspect(client.driverId)).progress;
    await rpc('pickup','arm',{driverId:client.driverId,fault});await localPickup(client);
    await until(async()=>!!(await rpc<{held:string|null}>('pickup','held',{driverId:client.driverId})).held,`${fault} held`);
    const accepted=await journal(client);assert.ok(accepted.pickup.eventId);
    assert.ok(accepted.pending.some(intent=>intent.eventId===accepted.pickup.eventId&&intent.pickup?.id===pickupId));
    const during=(await inspect(client.driverId)).progress;
    if(fault==='before-commit')assert.equal(during.cash,before.cash);else credit(before,during);
    await crash(child);child=start();await ready();
    await until(async()=>{
      const state=await journal(client);
      return state.pickup.eventId===null&&state.pickup.generation===1&&!state.pending.some(intent=>intent.pickup?.id===pickupId);
    },`${fault} recovery`,35_000);
    const after=(await inspect(client.driverId)).progress;credit(before,after);
    const recovered=await journal(client);assert.ok(recovered.pickup.readyAt>Date.now(),'successful recovery starts cooldown');
    await delay(1_200);credit(before,(await inspect(client.driverId)).progress);
  }
  console.log('PASS: staged supply pickup survives a rejected head and lost stage reply; terminal rejection and before/after-commit crashes preserve exactly-once credit.');
}catch(error){console.error(error);console.error(`Wrangler logs:\n${logs}`);process.exitCode=1;}
finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
  if(child)await crash(child);await rm(dir,{recursive:true,force:true});
}

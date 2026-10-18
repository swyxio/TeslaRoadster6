// Local-only regression: pnpm exec tsx tests/achievement-recovery.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DriverProgress } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await delay(40);}
  throw new Error(`Timed out: ${label}`);
}
async function freePort(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}
async function crash(child:ChildProcess){
  process.kill(-child.pid!,'SIGKILL');
  await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler process killed',10_000);
}
const dir=await mkdtemp(join(tmpdir(),'tesland-achievement-recovery-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-achievement-recovery-test',main:resolve('tests/fixtures/achievement-recovery-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__achievement-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
    {name:'MARKET',class_name:'MarketService'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent','MarketService']}],
}));
let logs='',child:ChildProcess|undefined;
const sockets:WebSocket[]=[];
function start(){
  const processChild=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-25_000);};
  processChild.stdout?.on('data',append);processChild.stderr?.on('data',append);return processChild;
}
async function ready(){
  await until(async()=>{
    if(child?.exitCode!==null)throw new Error(`Wrangler exited:\n${logs}`);
    try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
  },'Wrangler startup',30_000);
}
async function rpc<T>(group:'wallet'|'achievement',method:string,body:object):Promise<T>{
  const response=await fetch(`${base}/__${group}-test/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error(`Fixture ${group}/${method}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
function connect(path:string){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[],input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);});
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
type Client=ReturnType<typeof connect>;
function send(client:Client,message:object){client.socket.send(JSON.stringify(message));}
async function savedDriver(name:string){
  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  send(chat,{type:'hello',name});await until(()=>!!chat.last('ready'),'chat identity');
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),'recovery code');
  const code=chat.last('recovery')!.code as string,driverId=randomUUID();chat.socket.close();
  const associated=await rpc<{walletId:string}>('wallet','associate',{driverId,code});assert.equal(associated.walletId,driverId);
  await rpc('wallet','acquire',{driverId,fence:randomUUID()});
  return {driverId,code};
}
async function joinSaved(room:string,code:string){
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),'room welcome');
  send(client,{type:'identity',code,requestId:1});
  await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===1),'saved identity');
  assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!.ok,true);
  await until(()=>client.input.active,'saved driver active');return client;
}
async function sync(client:Client,token:number){
  send(client,{type:'sync',token});await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),'wallet barrier');
}
const inspect=(driverId:string)=>rpc<{progress:DriverProgress}>('wallet','inspect',{driverId});

async function observedVehicleDrive(){
  const driver=await savedDriver('Collection driver'),room=`collection-${randomUUID().slice(0,8)}`;
  const client=await joinSaved(room,driver.code),playerId=client.last('welcome')!.id as string;
  await sync(client,301);
  const before=(await inspect(driver.driverId)).progress;
  const drive=await rpc<{observed:boolean;distance:number}>('achievement','drive',{room,playerId});
  assert.equal(drive.observed,true,'actual room physics must record the model');
  assert.ok(drive.distance>=100,'the driven car must physically travel 100 m');
  await sync(client,302);
  const after=(await inspect(driver.driverId)).progress;
  assert.ok(after.vehicleCollections?.driven.includes('roadster'));
  assert.ok(after.unlocked.includes('tesla-drive-1'));
  assert.equal(after.cash,before.cash+100);assert.equal(after.eligibleIncome,before.eligibleIncome+100);
  client.socket.close();
  const restored=await joinSaved(`collection-return-${randomUUID().slice(0,8)}`,driver.code);
  await sync(restored,303);
  assert.ok((await inspect(driver.driverId)).progress.vehicleCollections?.driven.includes('roadster'));
  restored.socket.close();
}

async function observedNpcTakeover(source:'npc'|'parked'){
  const driver=await savedDriver(`Takeover ${source}`),room=`takeover-${randomUUID().slice(0,8)}`;
  const client=await joinSaved(room,driver.code),playerId=client.last('welcome')!.id as string;
  await sync(client,401);
  const before=(await inspect(driver.driverId)).progress;
  client.input.action({type:'interact'});
  await until(()=>{
    const world=client.last('state')?.world;
    const player=world?.players.find((item:{id:string})=>item.id===playerId);
    return world?.entities.some((entity:{id:string;kind:string})=>entity.id===player?.entityId&&entity.kind==='person');
  },'driver exits car');
  const npc=await rpc<{id:string;kind:string}>('achievement',source,{room,playerId});
  await delay(450);
  client.input.action({type:'interact'});
  await until(()=>client.last('state')?.world?.players.some((player:{id:string;entityId:string})=>player.id===playerId&&player.entityId===npc.id),`driver takes the ${source} car`);
  await sync(client,402);
  const after=(await inspect(driver.driverId)).progress;
  assert.deepEqual(after.vehicleCollections?.stolen,[npc.kind]);
  assert.ok(after.unlocked.includes('npc-theft-1'));
  assert.equal(after.cash,before.cash+100);assert.equal(after.eligibleIncome,before.eligibleIncome+100);
  client.socket.close();
}

async function rejectedPredecessor(kind:'roof'|'race'|'drive'){
  const driver=await savedDriver(`Regression ${kind}`),room=`award-${kind}-${randomUUID().slice(0,8)}`;
  const client=await joinSaved(room,driver.code),playerId=client.last('welcome')!.id as string;
  await delay(600);await sync(client,101);
  const before=(await inspect(driver.driverId)).progress;
  await rpc('wallet','arm',{driverId:driver.driverId,fault:'hold-reject'});
  await rpc('wallet','queue-income',{room,playerId,count:1});
  await until(async()=>(await rpc<{held:boolean}>('wallet','fault-state',{driverId:driver.driverId})).held,'earlier wallet action held');
  const observation=await rpc<{observed:boolean}>('achievement',kind,{room,playerId});
  assert.equal(observation.observed,true,`${kind} must be observed by the actual room tick`);
  send(client,{type:'sync',token:102});
  await rpc('wallet','release',{driverId:driver.driverId});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===102),'barrier after rejected predecessor');
  const after=(await inspect(driver.driverId)).progress;
  if(kind==='roof'){
    assert.equal(after.unlocked.filter(id=>id==='roof-rider').length,1,'transient roof achievement survives earlier rejection');
    assert.equal(after.achievementTiers!['roof-landings'].count,before.achievementTiers!['roof-landings'].count+1);
    assert.equal(after.cash,before.cash+500,'only the roof reward is credited');
    assert.equal(after.eligibleIncome,before.eligibleIncome+500);
  }else if(kind==='race'){
    assert.equal(after.unlocked.filter(id=>id==='race-finisher').length,1,'race completion survives earlier rejection');
    assert.equal(after.unlocked.filter(id=>id==='race-winner').length,1,'race win survives earlier rejection');
    assert.equal(after.achievementTiers!['races-finished'].count,before.achievementTiers!['races-finished'].count+1);
    assert.equal(after.achievementTiers!['races-won'].count,before.achievementTiers!['races-won'].count+1);
    assert.equal(after.cash,before.cash+200,'only the first finish and contested-win tiers are credited');
    assert.equal(after.eligibleIncome,before.eligibleIncome+200);
  }else{
    assert.deepEqual(after.vehicleCollections?.driven,['roadster'],'the observed model survives earlier rejection');
    assert.equal(after.unlocked.filter(id=>id==='tesla-drive-1').length,1);
    assert.equal(after.cash,before.cash+100,'the drive reward is credited once');
    assert.equal(after.eligibleIncome,before.eligibleIncome+100);
  }
  client.socket.close();
}

async function crashAfterAcceptedEvidence(){
  const driver=await savedDriver('Regression crash'),room=`award-crash-${randomUUID().slice(0,8)}`;
  const client=await joinSaved(room,driver.code),playerId=client.last('welcome')!.id as string;
  await delay(600);await sync(client,201);
  const before=(await inspect(driver.driverId)).progress;
  await rpc('wallet','arm',{driverId:driver.driverId,fault:'hold-before'});
  await rpc('wallet','queue-income',{room,playerId,count:1});
  await until(async()=>(await rpc<{held:boolean}>('wallet','fault-state',{driverId:driver.driverId})).held,'earlier wallet action held');
  assert.equal((await rpc<{observed:boolean}>('achievement','roof',{room,playerId})).observed,true);
  assert.equal((await rpc<{observed:boolean}>('achievement','race',{room,playerId})).observed,true);
  // The fixture logs only RPCs for which the production stage method returned
  // accepted; its marker is not itself the evidence journal.
  await until(async()=>{
    const accepted=await rpc<{action:{kind:string;evidence:{kind:string}}}[]>('achievement','accepted',{room,driverId:driver.driverId});
    const kinds=accepted.filter(item=>item.action?.kind==='achievement').map(item=>item.action.evidence?.kind);
    return kinds.includes('roof')&&kinds.includes('race');
  },'roof and race evidence accepted by the durable journal',8_000);
  const held=(await inspect(driver.driverId)).progress;
  assert.ok(!held.unlocked.includes('roof-rider')&&!held.unlocked.includes('race-winner'),'staged awards have not committed before the crash');
  await crash(child!);child=start();await ready();
  const recovered=await joinSaved(`award-return-${randomUUID().slice(0,8)}`,driver.code);
  await sync(recovered,202);
  const after=(await inspect(driver.driverId)).progress;
  assert.equal(after.unlocked.filter(id=>id==='roof-rider').length,1,'roof evidence settles exactly once after crash');
  assert.equal(after.unlocked.filter(id=>id==='race-finisher').length,1,'race finish settles exactly once after crash');
  assert.equal(after.unlocked.filter(id=>id==='race-winner').length,1,'race win settles exactly once after crash');
  assert.equal(after.achievementTiers!['roof-landings'].count,before.achievementTiers!['roof-landings'].count+1);
  assert.equal(after.achievementTiers!['races-finished'].count,before.achievementTiers!['races-finished'].count+1);
  assert.equal(after.achievementTiers!['races-won'].count,before.achievementTiers!['races-won'].count+1);
  assert.equal(after.cash,before.cash+701,'the accepted income, roof reward and race tiers are applied once');
  assert.equal(after.eligibleIncome,before.eligibleIncome+701);
  recovered.socket.close();
}

try{
  child=start();await ready();
  const failures:string[]=[];
  try{await observedVehicleDrive();console.log('PASS server-observed vehicle drive and saved recovery');}
  catch(error){failures.push(`vehicle drive: ${error instanceof Error?error.stack:String(error)}`);}
  for(const source of ['npc','parked'] as const){
    try{await observedNpcTakeover(source);console.log(`PASS actual ${source} takeover and wallet commit`);}
    catch(error){failures.push(`${source} takeover: ${error instanceof Error?error.stack:String(error)}`);}
  }
  for(const kind of ['roof','race','drive'] as const){
    try{await rejectedPredecessor(kind);console.log(`PASS ${kind} after rejected predecessor`);}
    catch(error){failures.push(`${kind}: ${error instanceof Error?error.stack:String(error)}`);}
  }
  try{await crashAfterAcceptedEvidence();console.log('PASS crash after accepted achievement evidence');}
  catch(error){failures.push(`crash: ${error instanceof Error?error.stack:String(error)}`);}
  if(failures.length)throw new Error(failures.join('\n'));
}catch(error){console.error(error);console.error(`Wrangler logs:\n${logs}`);process.exitCode=1;}
finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
  if(child)await stop(child);await rm(dir,{recursive:true,force:true});
}

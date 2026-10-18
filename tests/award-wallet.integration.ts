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
    {name:'INCOME',class_name:'GlobalIncome'},
  ]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome']}],
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
async function barrier(client:Client,token:number) {
  send(client,{type:'sync',token});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),`wallet barrier ${token}`);
}
type FaultState={held:boolean;heldAction?:EconomyIntent['action']};
type RecordState={progress:DriverProgress};
const faultState=(driverId:string)=>rpc<FaultState>('fault-state',{driverId});
const release=(driverId:string)=>rpc('release',{driverId});
const inspect=(driverId:string)=>rpc<RecordState>('inspect',{driverId});
const awardCount=(awards:string[])=>awards.filter(award=>award==='park-it').length;

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
  await rpc('arm',{driverId:driver.id,fault:'hold-before'});
  try {
    const assigned=entrant().targetId as string;
    const placed=await rpc<{lotId:string;stallId:string}>('parking-stall',{room,playerId:ownerId});
    assert.equal(placed.stallId,assigned,'fixture positions at the assigned stall');
    await until(()=>entrant()?.finishedAt!==null&&entrant()?.finishedAt!==undefined,'authoritative parking completion');
    assert.equal(round()?.phase,'results');
    await until(async()=>(await faultState(driver.id)).held,'award write is held');
    const held=await faultState(driver.id);
    assert.equal(held.heldAction?.kind,'progress');
    assert.ok(held.heldAction?.kind==='progress'&&held.heldAction.progress.unlocked.includes('park-it'),'the held write contains the earned award');
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
  assert.equal(awardCount((await inspect(spectator.id)).progress.unlocked),0,'spectator profile never inherits award');
  assert.ok(!observer.messages.some(message=>message.type==='wallet'&&message.unlocked.includes('park-it')),'owner wallet is never sent to spectator');
  assert.ok(!JSON.stringify(observer.messages).includes(driver.code),'spectator never receives owner recovery code');

  // Restart Wrangler with the same Durable Object storage, then attach each
  // saved driver in a fresh room using its real recovery code.
  await stop(child);child=undefined;child=start();await ready();
  assert.equal(awardCount((await inspect(driver.id)).progress.unlocked),1,'award survives process restart');
  const restoredRoom=`restore-${randomUUID().slice(0,8)}`;
  const recovered=await join(restoredRoom,driver.code),recoveredObserver=await join(restoredRoom,spectator.code);
  assert.equal(awardCount(recovered.last('wallet')!.unlocked),1,'owner recovers saved award in a new room');
  assert.equal(awardCount(recoveredObserver.last('wallet')!.unlocked),0,'spectator recovers without owner award');
  const recoveredId=recovered.last('welcome')!.id as string;
  assert.equal(awardCount(recovered.last('state')!.world.players.find((player:Message)=>player.id===recoveredId).achievements.unlocked),1);
  console.log('PASS: real Park It award commits only after the held write, other driver continues independently, and saved-driver recovery survives Wrangler restart.');
} catch(error) {
  console.error('Wrangler output:\n'+logs);
  throw error;
} finally {
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

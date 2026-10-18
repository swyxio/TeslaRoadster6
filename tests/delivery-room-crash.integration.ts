// Real room delivery accepted before an actual process kill and recovery.
// pnpm exec tsx tests/delivery-room-crash.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { applyDeliveryAwards, initialAchievements } from '../shared/achievements';
import { applyDeliveryStop, CUSTOMERS, initialDelivery, levelForCash, matchesDeliveryStop, orderTarget, payoutFor } from '../shared/delivery';
import type { SettledDeliveryEarning } from '../shared/earnings-events';
import type { DriverOutcome, DriverProgress } from '../worker/driver-profile';
import type { DeliveryStage } from '../worker/room-economy';
import { RoomInputClient } from './room-input-client';
import { NEUTRAL } from '../shared/game';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(40);}throw new Error(`Timed out: ${label}`);
}
async function freePort(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function crash(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  process.kill(-child.pid!,'SIGKILL');await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler killed');
}
const dir=await mkdtemp(join(tmpdir(),'tesland-delivery-room-crash-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-delivery-room-crash',main:resolve('tests/fixtures/delivery-room-crash-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__delivery-crash/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},{name:'MARKET',class_name:'MarketService'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent','MarketService']}],
}));
let child:ChildProcess|undefined,logs='';
const sockets:WebSocket[]=[];
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-25_000);};c.stdout?.on('data',append);c.stderr?.on('data',append);return c;
}
async function ready(){await until(async()=>{
  if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);
  try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
},'Wrangler startup',30_000);}
async function rpc<T>(group:'wallet-test'|'delivery-crash',method:string,body:object):Promise<T>{
  const response=await fetch(`${base}/__${group}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5_000)});
  if(!response.ok)throw new Error(`${group}/${method}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
function connect(path:string){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[],input=new RoomInputClient(socket);sockets.push(socket);
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data)) as Message;input.observe(message);messages.push(message);});
  return {socket,input,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
type Client=ReturnType<typeof connect>;
const send=(client:Client,message:object)=>client.socket.send(JSON.stringify(message));
async function joinSaved(room:string,code:string|null){
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
const inspect=(driverId:string)=>rpc<{progress:DriverProgress}>('wallet-test','inspect',{driverId});
const sources=(driverId:string)=>rpc<Record<string,SettledDeliveryEarning>>('delivery-crash','sources',{driverId});

try{
  child=start();await ready();
  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  send(chat,{type:'hello',name:'Crash Courier'});await until(()=>!!chat.last('ready'),'chat identity');
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),'recovery code');
  const code=chat.last('recovery')!.code as string,driverId=randomUUID(),room=`delivery-crash-${randomUUID().slice(0,8)}`;
  chat.socket.close();
  const associated=await rpc<{walletId:string}>('wallet-test','associate',{driverId,code});assert.equal(associated.walletId,driverId);
  await rpc('wallet-test','acquire',{driverId,fence:randomUUID()});
  const client=await joinSaved(room,code),playerId=client.last('welcome')!.id as string;
  await delay(600);await sync(client,1);
  await rpc('wallet-test','delivery-pickup',{room,playerId});
  await until(async()=>(await inspect(driverId)).progress.order.stage==='dropoff','pickup committed');
  await sync(client,2);
  const before=(await inspect(driverId)).progress;
  assert.equal(before.completed,0);assert.equal(before.order.stage,'dropoff');

  // An actual room keeps accepting and acknowledging both players' inputs
  // while one profile is held between durable assignment batches.
  const parallelRoom=`assignment-live-${randomUUID().slice(0,8)}`;
  const assignmentChat=connect('/api/chat');await until(()=>assignmentChat.socket.readyState===WebSocket.OPEN,'assignment chat opens');
  send(assignmentChat,{type:'hello',name:'Assignment Courier'});await until(()=>!!assignmentChat.last('ready'),'assignment chat identity');
  send(assignmentChat,{type:'save'});await until(()=>!!assignmentChat.last('recovery'),'assignment recovery code');
  const assignmentCode=assignmentChat.last('recovery')!.code as string,assigningDriver=randomUUID();
  assignmentChat.socket.close();
  await rpc('wallet-test','associate',{driverId:assigningDriver,code:assignmentCode});
  await rpc('wallet-test','acquire',{driverId:assigningDriver,fence:randomUUID()});
  const assigning=await joinSaved(parallelRoom,assignmentCode),observer=await joinSaved(parallelRoom,null);
  const assigningId=assigning.last('welcome')!.id as string;
  const players=await rpc<Array<{playerId:string;driverId:string}>>('wallet-test','players',{room:parallelRoom});
  assert.equal(players.find(item=>item.playerId===assigningId)!.driverId,assigningDriver,'assignment uses the saved driver');
  await rpc('wallet-test','delivery-pickup',{room:parallelRoom,playerId:assigningId});
  await until(async()=>(await inspect(assigningDriver)).progress.order.stage==='dropoff','assignment test pickup committed');
  await sync(assigning,10);await sync(observer,11);
  await rpc('delivery-crash','hold-assignment',{driverId:assigningDriver});
  await rpc('delivery-crash','dropoff',{room:parallelRoom,playerId:assigningId});
  await until(()=>rpc<boolean>('delivery-crash','assignment-held',{driverId:assigningDriver}),'assignment checkpoint held');
  const held=(await inspect(assigningDriver)).progress;
  assert.equal(held.completed,0,'payout waits for assignment');
  const ownerTick=assigning.input.tick,observerTick=observer.input.tick;
  const ownerSeq=assigning.input.send({...NEUTRAL,steer:1}),observerSeq=observer.input.send({...NEUTRAL,steer:1});
  await until(()=>assigning.input.tick>=ownerTick+8&&observer.input.tick>=observerTick+8&&
    (assigning.input.control?.appliedSeq??0)>=ownerSeq&&(observer.input.control?.appliedSeq??0)>=observerSeq,
    'both clients receive snapshots and applied inputs during assignment');
  const position=()=>{
    const world=assigning.last('state')?.world;
    const player=world?.players.find((item:{id:string})=>item.id===assigningId);
    return world?.entities.find((item:{id:string})=>item.id===player?.entityId) as {x:number;z:number}|undefined;
  };
  const startPosition=position();assert.ok(startPosition,'held driver has a car snapshot');
  for(let i=0;i<40;i++){assigning.input.send({...NEUTRAL,throttle:1});await delay(50);}
  const stopSeq=assigning.input.send(NEUTRAL);
  await until(()=>(assigning.input.control?.appliedSeq??0)>=stopSeq,'held driver releases throttle');
  const end=position();assert.ok(end&&Math.hypot(end.x-startPosition.x,end.z-startPosition.z)>1,'saved driver actually drives while assignment is held');
  await rpc('delivery-crash','release-assignment',{driverId:assigningDriver});
  await until(async()=>(await inspect(assigningDriver)).progress.completed===1,'assignment completes');
  const assigned=(await inspect(assigningDriver)).progress;
  assert.equal(assigned.order.search,undefined);
  assert.ok(assigned.order.elapsed<.1,`the new pickup did not count the held driving time: ${assigned.order.elapsed}`);
  assert.ok(Math.abs((assigned.deliveryClock??0)-(held.deliveryClock??0))<.1,'the paused delivery clock did not advance while driving');
  assigning.socket.close();observer.socket.close();

  // The event ends before recovery, proving settlement uses the rate at the
  // observed arrival, not the post-restart current rate.
  const event=await rpc<{startsAt:number;endsAt:number}>('delivery-crash','seed-event',{});
  await until(async()=>(await rpc<{multiplier:number}|null>('delivery-crash','rate',{room}))?.multiplier===2,'active event rate');
  await rpc('wallet-test','arm',{driverId,fault:'hold-before'});
  await rpc('wallet-test','queue-income',{room,playerId,count:1});
  await until(async()=>(await rpc<{held:boolean}>('wallet-test','fault-state',{driverId})).held,'earlier wallet action held');
  await rpc('delivery-crash','dropoff',{room,playerId});
  let accepted:DeliveryStage|undefined;
  await until(async()=>{
    const rows=await rpc<DeliveryStage[]>('delivery-crash','accepted',{room,driverId});
    accepted=rows.find(row=>matchesDeliveryStop(before.order,row.action.stop));return !!accepted;
  },'delivery stage accepted',8_000);
  const stage=accepted!;
  assert.equal(stage.action.kind,'delivery');assert.equal(stage.action.multiplier,2);
  assert.ok(stage.action.atMs>=event.startsAt&&stage.action.atMs<event.endsAt);
  assert.ok(matchesDeliveryStop(before.order,stage.action.stop),'journal contains the actual target arrival');
  await until(()=>Date.now()>=event.endsAt,'event expires before recovery',10_000);
  assert.equal((await inspect(driverId)).progress.completed,0,'profile commit is still blocked');
  await crash(child);child=start();await ready();
  const recovered=await joinSaved(`delivery-return-${randomUUID().slice(0,8)}`,code);await sync(recovered,3);
  const after=(await inspect(driverId)).progress,earned=await sources(driverId);
  const source=earned['earned-source:delivery:1:dropoff'];assert.ok(source);
  const order={...before.order,elapsed:before.order.elapsed+stage.clock-(before.deliveryClock??0)};
  const fare=payoutFor(order);
  assert.ok(fare>0);assert.equal(source.base,fare);assert.equal(source.amount,2*fare);
  assert.equal(source.multiplier,2);assert.equal(source.atMs,stage.action.atMs);
  assert.equal(after.completed,1);assert.equal(after.earned,before.earned+source.amount);

  const expected=initialDelivery(stage.action.stop),achievements=initialAchievements();
  Object.assign(expected,{cash:before.cash+1,lifetimeIncome:before.eligibleIncome+1,earned:before.earned,
    completed:before.completed,level:levelForCash(before.cash+1),order});
  achievements.unlocked=[...before.unlocked];
  const target=orderTarget(order),parts=applyDeliveryStop(expected,stage.action.stop,part=>part.amount*2);
  assert.ok(parts);applyDeliveryAwards(expected,achievements,target.rooftop,CUSTOMERS[order.customer]?.id,true);
  const early=order.elapsed<order.estimate;
  assert.equal(after.cash,expected.cash+(early?100:0));assert.equal(after.eligibleIncome,expected.lifetimeIncome+(early?100:0));
  assert.equal(after.achievementTiers?.deliveries.count,before.achievementTiers!.deliveries.count+1);
  assert.equal(after.achievementTiers?.['early-deliveries'].count,before.achievementTiers!['early-deliveries'].count+Number(early));
  assert.deepEqual(after.unlocked,achievements.unlocked);
  assert.equal(await rpc('delivery-crash','replay-stage',{room,stage}),'superseded');
  const replay=await rpc<DriverOutcome>('delivery-crash','replay-intent',{driverId,eventId:stage.eventId});
  assert.ok(!replay.ok&&replay.reason==='superseded','old intent is fenced after recovery');
  await sync(recovered,4);
  const final=(await inspect(driverId)).progress;
  assert.equal(final.cash,after.cash);assert.equal(final.eligibleIncome,after.eligibleIncome);assert.equal(final.completed,1);
  assert.deepEqual(await sources(driverId),earned,'stage and intent replays cannot duplicate any delivery source');
  console.log('PASS: accepted real-room delivery survives SIGKILL and settles once at its expired event-time rate.');
}catch(error){console.error(error);console.error(`Wrangler logs:\n${logs}`);process.exitCode=1;}
finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();
  if(child)await crash(child);await rm(dir,{recursive:true,force:true});
}

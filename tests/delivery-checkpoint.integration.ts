// Local-only: actual room, wallet and outbox with a faulted profile reply.
// pnpm exec tsx tests/delivery-checkpoint.integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CUSTOMERS } from '../shared/delivery';
import { LANDMARKS } from '../shared/map';
import type { DriverProgress } from '../worker/driver-profile';

type Message={type:string;[key:string]:any};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=15_000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await check())return;await sleep(30);}
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
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await sleep(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}

const dir=await mkdtemp(join(tmpdir(),'tesland-delivery-checkpoint-'));
const port=await freePort(),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-checkpoint-test',main:resolve('tests/fixtures/delivery-checkpoint-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__wallet-test/*','/__checkpoint-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}],
}));
let child:ChildProcess|undefined,logs='';
const sockets:WebSocket[]=[];
function connect(path:string){
  const socket=new WebSocket(base.replace(/^http/,'ws')+path),messages:Message[]=[];sockets.push(socket);
  socket.addEventListener('message',event=>messages.push(JSON.parse(String(event.data))));
  return {socket,messages,last(type:string){return messages.filter(message=>message.type===type).at(-1);}};
}
function send(client:ReturnType<typeof connect>,value:object){client.socket.send(JSON.stringify(value));}
async function rpc<T>(path:string,body:object):Promise<T>{
  const response=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
const wallet=<T>(method:string,body:object)=>rpc<T>(`/__wallet-test/${method}`,body);
let syncToken=0;
async function barrier(client:ReturnType<typeof connect>){
  const token=++syncToken;send(client,{type:'sync',token});
  await until(()=>client.messages.some(message=>message.type==='state'&&message.sync===token),`sync ${token}`);
}
async function joinRoom(room:string,code:string|null){
  const client=connect(`/api/room/${room}`);
  await until(()=>!!client.last('welcome')&&!!client.last('wallet'),'room wallet ready');
  send(client,{type:'identity',code,requestId:1});
  await until(()=>!!client.messages.find(message=>message.type==='identityResult'&&message.requestId===1),'identity result');
  assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!.ok,true);
  await barrier(client);return client;
}
function player(client:ReturnType<typeof connect>){
  const id=client.last('welcome')!.id;
  return client.last('state')?.world.players.find((item:Message)=>item.id===id);
}

try {
  child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
  await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup',30_000);

  const chat=connect('/api/chat');await until(()=>chat.socket.readyState===WebSocket.OPEN,'chat opens');
  send(chat,{type:'hello',name:'Checkpoint Driver'});await until(()=>!!chat.last('ready'),'chat ready');
  send(chat,{type:'save'});await until(()=>!!chat.last('recovery'),'recovery code');
  const code=chat.last('recovery')!.code as string,room=`checkpoint-${randomUUID().slice(0,8)}`;
  const driver=await joinRoom(room,code),observer=await joinRoom(room,null),id=driver.last('welcome')!.id as string;
  const entries=await wallet<Array<{playerId:string;driverId:string}>>('players',{room});
  const driverId=entries.find(entry=>entry.playerId===id)!.driverId;
  const observerId=entries.find(entry=>entry.playerId===observer.last('welcome')!.id)!.driverId;
  const inspect=async()=>wallet<{progress:DriverProgress}>('inspect',{driverId});
  async function pickup(){
    await wallet('delivery-pickup',{room,playerId:id});
    await until(()=>player(driver)?.delivery.order.stage==='dropoff','pickup committed');await barrier(driver);
  }
  async function dropoff(count:number){
    await rpc('/__checkpoint-test/dropoff',{room,playerId:id});
    await until(()=>player(driver)?.delivery.completed===count,`delivery ${count} committed`);await barrier(driver);
  }
  for(let count=1;count<=2;count++){await pickup();await dropoff(count);}
  await pickup();
  const before=(await inspect()).progress,observerCash=observer.last('wallet')!.cash as number;
  const rewardStart=driver.messages.length,observerStart=observer.messages.length;
  const armed=await wallet<{started:number}>('arm',{driverId,fault:'hold-lost-reply'});
  await rpc('/__checkpoint-test/dropoff',{room,playerId:id,atResearch:true});
  await until(async()=>(await wallet<{held:boolean}>('fault-state',{driverId})).held,'lost reply held');
  const committed=(await inspect()).progress;
  assert.equal(committed.completed,3,'drop-off is durable before the reply');
  assert.equal(player(driver).delivery.completed,2,'unacknowledged wallet stays private');
  assert.equal(driver.messages.slice(rewardStart).filter(message=>message.type==='reward').length,0,'held receipts do not announce rewards');
  const observerTime=observer.last('state')!.world.time as number;
  await until(()=>observer.last('state')!.world.time>observerTime+.2,'other driver keeps receiving room ticks');
  assert.equal(observer.last('wallet')!.cash,observerCash,'the other wallet is unaffected');
  await wallet('release',{driverId});
  await until(()=>player(driver)?.delivery.completed===3,'lost reply retried');await barrier(driver);
  const after=(await inspect()).progress;
  const added=after.unlocked.filter(id=>!before.unlocked.includes(id));
  assert.ok(added.includes('regular'),'the third-delivery milestone also commits');
  const awards:Record<string,number>={regular:200,'region-oakland':500,'stanford-research':600,'berkeley-research':400,'roof-rider':500,'sky-delivery':1_000};
  for(const award of added)assert.ok(award in awards,`unexpected award ${award}`);
  const awardCash=added.reduce((total,id)=>total+awards[id],0),fare=after.earned-before.earned;
  assert.ok(fare>=0);
  assert.equal(after.cash-before.cash,fare+350+awardCash);
  assert.equal(after.eligibleIncome-before.eligibleIncome,fare+350+awardCash);
  assert.ok((await wallet<{started:number}>('fault-state',{driverId})).started>=armed.started+2,'commit was retried');
  assert.ok(added.includes('stanford-research'),`the same stop also earns the separate research award: before=${JSON.stringify(before.unlocked)} added=${JSON.stringify(added)}`);
  const rewards=driver.messages.slice(rewardStart).filter(message=>message.type==='reward').map(message=>message.reward);
  assert.equal(rewards.length,2,'one message per committed reward');
  assert.deepEqual(rewards.map(reward=>reward.kind),['delivery-research','research']);
  assert.deepEqual(rewards.map(reward=>reward.amount),[fare+350+awardCash-600,600]);
  assert.equal(rewards[1].id,rewards[0].id+1,'messages retain receipt order');
  assert.equal(observer.messages.slice(observerStart).filter(message=>message.type==='reward').length,0,'other players do not receive private reward messages');

  driver.socket.close();await until(()=>driver.socket.readyState===WebSocket.CLOSED,'driver disconnected');
  await until(()=>observer.last('state')?.world.players.every((item:Message)=>item.id!==id),'driver removed');
  const recovered=await joinRoom(room,code);await barrier(recovered);
  assert.equal(player(recovered).delivery.completed,3);
  assert.equal(recovered.last('wallet')!.cash,after.cash);
  assert.equal(recovered.last('wallet')!.eligibleIncome,after.eligibleIncome);
  assert.equal((await inspect()).progress.cash,after.cash,'recovery did not repay the checkpoint');
  const observerProgress=(await wallet<{progress:DriverProgress}>('inspect',{driverId:observerId})).progress;
  const expectedIncome=after.eligibleIncome+observerProgress.eligibleIncome;
  await until(async()=>await rpc<number>('/__checkpoint-test/income',{})===expectedIncome,'global income outbox catches up');
  await sleep(700);
  assert.equal(await rpc<number>('/__checkpoint-test/income',{}),expectedIncome,'retry does not duplicate global income');
  assert.equal(driver.messages.slice(rewardStart).filter(message=>message.type==='reward').length,2,'lost reply does not duplicate notifications');

  // Seed a second driver's prior completion count and let the real scheduler
  // assign the third job from an SF origin. The landmark itself is untouched.
  const ucsfChat=connect('/api/chat');await until(()=>ucsfChat.socket.readyState===WebSocket.OPEN,'UCSF chat opens');
  send(ucsfChat,{type:'hello',name:'UCSF Checkpoint Driver'});await until(()=>!!ucsfChat.last('ready'),'UCSF chat ready');
  send(ucsfChat,{type:'save'});await until(()=>!!ucsfChat.last('recovery'),'UCSF recovery code');
  const ucsfCode=ucsfChat.last('recovery')!.code as string,ucsfRoom=`ucsf-${randomUUID().slice(0,8)}`;
  const setup=await joinRoom(ucsfRoom,ucsfCode),setupId=setup.last('welcome')!.id as string;
  const ucsfEntries=await wallet<Array<{playerId:string;driverId:string}>>('players',{room:ucsfRoom});
  const ucsfDriverId=ucsfEntries.find(entry=>entry.playerId===setupId)!.driverId;
  await barrier(setup);setup.socket.close();await until(()=>setup.socket.readyState===WebSocket.CLOSED,'UCSF setup disconnects');
  await until(async()=>(await wallet<Array<{playerId:string}>>('players',{room:ucsfRoom})).every(entry=>entry.playerId!==setupId),'UCSF setup removed');
  const seeded=await rpc<DriverProgress>('/__checkpoint-test/seed-ucsf',{driverId:ucsfDriverId});
  assert.equal(seeded.completed,2,'prior completion count is fixture setup');
  assert.equal(CUSTOMERS[seeded.order.customer].id,'landmark-ucsf','the scheduler assigns the real UCSF customer');
  assert.ok(!seeded.unlocked.includes('ucsf-research'));

  const ucsf=await joinRoom(ucsfRoom,ucsfCode),ucsfId=ucsf.last('welcome')!.id as string;
  assert.equal(CUSTOMERS[player(ucsf).delivery.order.customer].id,'landmark-ucsf');
  await wallet('delivery-pickup',{room:ucsfRoom,playerId:ucsfId});
  await until(()=>player(ucsf)?.delivery.order.stage==='dropoff','UCSF pickup committed');await barrier(ucsf);
  const ucsfInspect=async()=>wallet<{progress:DriverProgress}>('inspect',{driverId:ucsfDriverId});
  const ucsfBefore=(await ucsfInspect()).progress;
  assert.equal(CUSTOMERS[ucsfBefore.order.customer].id,'landmark-ucsf');
  assert.ok(!ucsfBefore.unlocked.includes('ucsf-research'));
  const ucsfRewardStart=ucsf.messages.length;
  const ucsfArmed=await wallet<{started:number}>('arm',{driverId:ucsfDriverId,fault:'hold-lost-reply'});
  const ucsfStop=await rpc<{x:number;z:number}>('/__checkpoint-test/dropoff',{room:ucsfRoom,playerId:ucsfId});
  assert.deepEqual(ucsfStop,LANDMARKS.find(landmark=>landmark.id==='ucsf')!.arrival,'drop-off uses the actual research location');
  await until(async()=>(await wallet<{held:boolean}>('fault-state',{driverId:ucsfDriverId})).held,'UCSF delivery reply held');
  const ucsfHeld=await wallet<{heldAction:{kind:string}}>('fault-state',{driverId:ucsfDriverId});
  assert.equal(ucsfHeld.heldAction.kind,'delivery');
  assert.equal((await ucsfInspect()).progress.completed,3,'UCSF checkpoint commits before the lost reply');
  assert.equal(player(ucsf).delivery.completed,2,'UCSF unacknowledged completion stays private');
  await wallet('release',{driverId:ucsfDriverId});
  await until(()=>player(ucsf)?.delivery.completed===3&&player(ucsf)?.achievements.unlocked.includes('ucsf-research'),'UCSF completion and research commit');
  await barrier(ucsf);
  const ucsfAfter=(await ucsfInspect()).progress,ucsfFare=ucsfAfter.earned-ucsfBefore.earned;
  assert.ok(ucsfFare>0);
  assert.equal(ucsfAfter.unlocked.filter(award=>award==='ucsf-research').length,1);
  assert.ok(ucsfAfter.unlocked.includes('regular'));
  assert.equal(ucsfAfter.achievementTiers!['early-deliveries'].count,1);
  assert.equal(ucsfAfter.cash-ucsfBefore.cash,ucsfFare+350+200+100+250,'fare, checkpoint, milestone, early tier and real UCSF reward are credited once');
  assert.equal(ucsfAfter.eligibleIncome-ucsfBefore.eligibleIncome,ucsfFare+350+200+100+250);
  assert.ok((await wallet<{started:number}>('fault-state',{driverId:ucsfDriverId})).started>=ucsfArmed.started+2,'UCSF delivery commit was retried');
  const ucsfRewards=ucsf.messages.slice(ucsfRewardStart).filter(message=>message.type==='reward').map(message=>message.reward);
  assert.deepEqual(ucsfRewards.map(reward=>reward.kind),['delivery-research','research']);
  assert.deepEqual(ucsfRewards.map(reward=>reward.amount),[ucsfFare+350+200+100,250]);
  ucsf.socket.close();await until(()=>ucsf.socket.readyState===WebSocket.CLOSED,'UCSF driver disconnects');
  await until(async()=>(await wallet<Array<{playerId:string}>>('players',{room:ucsfRoom})).every(entry=>entry.playerId!==ucsfId),'UCSF driver removed');
  const ucsfRecovered=await joinRoom(ucsfRoom,ucsfCode);await barrier(ucsfRecovered);
  assert.equal(player(ucsfRecovered).delivery.completed,3);
  assert.equal(ucsfRecovered.last('wallet')!.cash,ucsfAfter.cash);
  assert.equal(ucsfRecovered.last('wallet')!.eligibleIncome,ucsfAfter.eligibleIncome);
  assert.equal((await ucsfInspect()).progress.cash,ucsfAfter.cash,'UCSF recovery does not repay either reward');
  await until(async()=>await rpc<number>('/__checkpoint-test/income',{})===expectedIncome+ucsfAfter.eligibleIncome,'UCSF global income outbox catches up');
  await sleep(700);
  assert.equal(await rpc<number>('/__checkpoint-test/income',{}),expectedIncome+ucsfAfter.eligibleIncome,'UCSF retry does not duplicate global income');
  assert.equal(ucsf.messages.slice(ucsfRewardStart).filter(message=>message.type==='reward').length,2,'UCSF retry does not duplicate notifications');

  console.log('PASS: completed checkpoint committed once through a lost reply, another driver remained live, and recovery preserved cash and income.');
  console.log('PASS: scheduler-selected UCSF checkpoint and research reward committed once through a lost reply and recovery (prior two completions seeded).');
} finally {
  for(const socket of sockets)try{socket.close();}catch{}
  if(child)await stop(child);
  await rm(dir,{recursive:true,force:true});
}

// Isolated local Wrangler. A temporary worker seeds the original GameRoom key
// before the current worker ever initializes each room; no production endpoint
// exposes test funds, income, or positioning.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NEUTRAL, type World } from '../shared/game';
import type { EconomyIntent } from '../worker/driver-profile';
import { RoomInputClient } from './room-input-client';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw new Error(`Timed out: ${label}`);}
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const a=s.address();assert.ok(a&&typeof a!=='string');await new Promise<void>(r=>s.close(()=>r()));return a.port;}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;try{process.kill(-child.pid!,'SIGINT');}catch{}for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}}
async function crash(child:ChildProcess){try{process.kill(-child.pid!,'SIGKILL');}catch{}await until(()=>child.exitCode!==null||child.signalCode!==null,'local Worker terminated');}
type TestWorld=World & {mars:World['mars'] & {roomFund:number}};
type Event={type:string;id?:string;world?:TestWorld;requestId?:number;action?:string;amount?:number;available?:number;ok?:boolean;sync?:number;cash?:number};
function connect(url:string){
  const socket=new WebSocket(url),events:Event[]=[],input=new RoomInputClient(socket);
  socket.onmessage=e=>{const event=JSON.parse(String(e.data)) as Event;input.observe(event);events.push(event);if(event.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));};
  return {socket,events,input,world:()=>events.filter(e=>e.type==='state').at(-1)?.world,id:()=>events.find(e=>e.type==='welcome')?.id,
    result:(requestId:number)=>events.find(e=>e.type==='marsResult'&&e.requestId===requestId),
    barrier:(token:number)=>events.find(e=>e.type==='state'&&e.sync===token)};
}
type Client=ReturnType<typeof connect>;
const dir=await mkdtemp(join(tmpdir(),'tesland-mars-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json'),seedWorker=join(dir,'legacy-seed.js');
const configFor=(main:string)=>({name:'tesland-mars-test',main,compatibility_date:'2026-10-17',assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__mars-test/*']},durable_objects:{bindings:[{name:'ROOMS',class_name:'MarsTestRoom'},{name:'CHAT',class_name:'GlobalChat'},{name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'}]},migrations:[{tag:'v1',new_sqlite_classes:['MarsTestRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome']}]});
await writeFile(seedWorker,`
import { DurableObject } from 'cloudflare:workers';
export class MarsTestRoom extends DurableObject {
  async seed(amount) { await this.ctx.storage.put('mars-fund', amount); }
}
export class GlobalChat extends DurableObject {}
export class DriverProfile extends DurableObject {}
export class RoomEconomy extends DurableObject {}
export class GlobalIncome extends DurableObject {}
export default { async fetch(request, env) {
  const {room, amount} = await request.json();
  await env.ROOMS.get(env.ROOMS.idFromName(room)).seed(amount);
  return Response.json({ok:true});
} };
`);
let child:ChildProcess|undefined;const sockets:WebSocket[]=[];
function start(){const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});c.stdout?.resume();c.stderr?.resume();return c;}
async function ready(path='/api/health'){await until(async()=>{if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');try{return (await fetch(base+path,{method:path==='/__mars-test/seed'?'POST':'GET',headers:{'content-type':'application/json'},body:path==='/__mars-test/seed'?JSON.stringify({room:'readiness',amount:0}):undefined,signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
async function post(path:string,value:unknown){const res=await fetch(base+'/__mars-test/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});assert.ok(res.ok,`${path} returned ${res.status}`);return res.json();}
function open(room:string){const client=connect(`ws://127.0.0.1:${p}/api/room/${room}`);sockets.push(client.socket);return client;}
async function joined(client:Client,label:string){await until(()=>!!client.id()&&client.events.some(e=>e.type==='identityResult'&&e.ok)&&!!client.world(),`${label} connected`);}
function contribute(client:Client,amount:number,requestId:number,token:number){client.socket.send(JSON.stringify({type:'mars',action:'contribute',amount,requestId}));client.socket.send(JSON.stringify({type:'sync',token}));}
function cash(client:Client,world=client.world()!){return world.players.find(player=>player.id===client.id())!.delivery.cash;}
function assertBarrier(client:Client,requestId:number,token:number,expectedCash:number){
  const resultIndex=client.events.findIndex(e=>e.type==='marsResult'&&e.requestId===requestId);
  const barrierIndex=client.events.findIndex(e=>e.type==='state'&&e.sync===token);
  assert.ok(resultIndex>=0&&barrierIndex>resultIndex,'private result precedes the sync barrier');
  assert.equal(cash(client,client.events[barrierIndex].world!),expectedCash,'barrier contains the committed wallet balance');
}
try{
  // Write the exact legacy key in a previous worker revision, then restart with
  // the current worker so its first initialization must discover it on disk.
  await writeFile(config,JSON.stringify(configFor(seedWorker)));child=start();await ready('/__mars-test/seed');
  await post('seed',{room:'mars-test',amount:1_000});
  await post('seed',{room:'mars-other',amount:2_000});
  await post('seed',{room:'mars-cap',amount:999_999_750});
  await post('seed',{room:'mars-complete',amount:1_000_000_000});
  await post('seed',{room:'mars-lost',amount:1_000});
  await stop(child);child=undefined;
  await writeFile(config,JSON.stringify(configFor(resolve('tests/fixtures/mars-worker.ts'))));child=start();await ready();

  const completeBefore=open('mars-complete');await joined(completeBefore,'completed legacy room');
  await until(()=>completeBefore.world()?.mars.roomFund===1_000_000_000,'completed legacy fund loads');
  assert.equal(completeBefore.world()!.mars.fund,0,'completed legacy fund is not counted as global earnings');
  completeBefore.socket.close();
  await until(async()=>await post('sessions',{room:'mars-complete'})===0,'completed room disconnects');
  await stop(child);child=undefined;child=start();await ready();
  const complete=open('mars-complete');await joined(complete,'completed room after restart');
  await until(()=>complete.world()?.mars.roomFund===1_000_000_000,'completed legacy fund survives restart');
  assert.equal(complete.world()!.mars.fund,0,'global goal is still incomplete');
  await post('place',{room:'mars-complete',id:complete.id(),side:0});await delay(500);
  complete.socket.send(JSON.stringify({type:'mars',action:'board',requestId:41}));
  complete.socket.send(JSON.stringify({type:'sync',token:401}));
  await until(()=>complete.result(41)?.ok===true&&!!complete.barrier(401),'completed legacy room still boards after restart');
  assert.ok(complete.barrier(401)!.world!.players.find(player=>player.id===complete.id())!.achievements.unlocked.includes('to-mars'));
  await until(()=>complete.world()!.mars.fund>=10_000,'boarding award reaches global earnings');
  complete.socket.close();await until(async()=>await post('sessions',{room:'mars-complete'})===0,'boarding driver disconnects');
  await delay(1_100); // Let any final profile-income outbox reach the global ledger.
  const existingGlobal=await post('total',{}) as number;

  const a=open('mars-test'),b=open('mars-test'),other=open('mars-other'),fresh=open('mars-fresh');
  await Promise.all([joined(a,'Alice'),joined(b,'Bob'),joined(other,'other room'),joined(fresh,'new room')]);
  await until(()=>a.world()?.mars.roomFund===1_000&&b.world()?.mars.roomFund===1_000&&other.world()?.mars.roomFund===2_000,'legacy room funds loaded');
  assert.equal(fresh.world()!.mars.roomFund,0,'a new room starts with no donated funds');
  await until(()=>a.world()?.mars.fund===existingGlobal,'global earnings replicated');
  assert.equal(await post('total',{}),existingGlobal,'legacy room funds are not added to global earnings');
  const aCash=cash(a),bCash=cash(b),otherCash=cash(other);

  await delay(500);
  contribute(a,100,11,101);contribute(b,200,12,102);
  await until(()=>!!a.result(11)&&!!b.result(12)&&!!a.barrier(101)&&!!b.barrier(102),'concurrent contributions and barriers');
  assert.deepEqual({ok:a.result(11)!.ok,amount:a.result(11)!.amount},{ok:true,amount:100});
  assert.deepEqual({ok:b.result(12)!.ok,amount:b.result(12)!.amount},{ok:true,amount:200});
  assert.equal(a.result(12),undefined,'Bob\'s result is private');assert.equal(b.result(11),undefined,'Alice\'s result is private');
  assertBarrier(a,11,101,aCash-100);assertBarrier(b,12,102,bCash-200);
  await until(()=>a.world()?.mars.roomFund===1_300&&b.world()?.mars.roomFund===1_300,'both committed contributions replicated');
  assert.equal(other.world()!.mars.roomFund,2_000,'another room remains isolated');
  assert.equal(await post('total',{}),existingGlobal,'room donations do not count as new global earnings');

  await delay(500);contribute(a,aCash+1,13,103);
  await until(()=>!!a.result(13)&&!!a.barrier(103),'unaffordable contribution rejected');
  assert.deepEqual({ok:a.result(13)!.ok,amount:a.result(13)!.amount},{ok:false,amount:0});
  assertBarrier(a,13,103,aCash-100);assert.equal(a.barrier(103)!.world!.mars.roomFund,1_300);

  assert.equal(await post('credit',{id:'a',amount:600_000_000}),existingGlobal+600_000_000);
  assert.equal(await post('credit',{id:'a',amount:600_000_000}),existingGlobal+600_000_000,'repeated global earnings do not count twice');
  assert.equal(await post('credit',{id:'b',amount:400_000_000}),existingGlobal+1_000_000_000);
  await until(()=>a.world()?.mars.fund===1_000_000_000&&other.world()?.mars.fund===1_000_000_000,'global earnings shared across rooms');
  assert.equal(cash(a),aCash-100,'global progress does not spend cash');assert.equal(cash(other),otherCash);
  assert.equal(a.world()!.mars.roomFund,1_300);assert.equal(other.world()!.mars.roomFund,2_000);

  const capA=open('mars-cap'),capB=open('mars-cap');await Promise.all([joined(capA,'cap Alice'),joined(capB,'cap Bob')]);
  await until(()=>capA.world()?.mars.roomFund===999_999_750&&capB.world()?.mars.roomFund===999_999_750,'legacy near-cap fund loaded');
  const capACash=cash(capA),capBCash=cash(capB);
  await delay(500);
  contribute(capA,100,21,201);contribute(capB,200,22,202);
  await until(()=>!!capA.result(21)&&!!capB.result(22)&&!!capA.barrier(201)&&!!capB.barrier(202),'near-cap concurrent requests settle');
  const capResults=[capA.result(21)!,capB.result(22)!];
  assert.equal(capResults.filter(r=>r.ok).length,1,'only one full reservation fits');
  assert.equal(capResults.find(r=>!r.ok)!.amount,0,'the rejected request is not debited');
  assert.equal(capResults.find(r=>r.ok)!.amount,capA.result(21)!.ok?100:200);
  assert.equal(capResults.find(r=>!r.ok)!.available,250-capResults.find(r=>r.ok)!.amount!,'rejection reports the unreserved remainder');
  assertBarrier(capA,21,201,capACash-(capA.result(21)!.amount??0));
  assertBarrier(capB,22,202,capBCash-(capB.result(22)!.amount??0));
  const capped=999_999_750+capResults.find(r=>r.ok)!.amount!;
  await until(()=>capA.world()?.mars.roomFund===capped&&capB.world()?.mars.roomFund===capped,'near-cap fund does not exceed the goal');

  await post('place',{room:'mars-test',id:a.id(),side:-1});await post('place',{room:'mars-test',id:b.id(),side:1});
  await delay(500);
  a.socket.send(JSON.stringify({type:'mars',action:'board',requestId:31}));a.socket.send(JSON.stringify({type:'sync',token:301}));
  b.socket.send(JSON.stringify({type:'mars',action:'board',requestId:32}));b.socket.send(JSON.stringify({type:'sync',token:302}));
  await until(()=>a.result(31)?.ok===true&&b.result(32)?.ok===true&&!!a.barrier(301)&&!!b.barrier(302),'both players board after the global goal');
  assert.ok(a.barrier(301)!.world!.players.find(player=>player.id===a.id())!.achievements.unlocked.includes('to-mars'));
  a.socket.close();b.socket.close();await until(()=>a.socket.readyState===WebSocket.CLOSED&&b.socket.readyState===WebSocket.CLOSED,'donors disconnect');
  await until(async()=>await post('sessions',{room:'mars-test'})===0,'room resets after the final disconnect');
  const again=open('mars-test');await joined(again,'room rejoin');
  await until(()=>again.world()?.mars.roomFund===1_300,'room fund survives the last disconnect');
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  await delay(500);await stop(child);child=undefined;
  child=start();await ready();
  const restarted=open('mars-test'),restartedOther=open('mars-other'),restartedCap=open('mars-cap');
  await Promise.all([joined(restarted,'restarted room'),joined(restartedOther,'restarted other room'),joined(restartedCap,'restarted cap room')]);
  await until(()=>restarted.world()?.mars.roomFund===1_300&&restartedOther.world()?.mars.roomFund===2_000&&restartedCap.world()?.mars.roomFund===capped,'room funds survive Wrangler restart independently');
  await until(()=>restarted.world()?.mars.fund===1_000_000_000&&restartedOther.world()?.mars.fund===1_000_000_000,'global earnings survive restart and remain shared');

  // Hold a successful profile debit before the journal receives the reply.
  // The observer must continue to drive while that wallet is waiting. Killing
  // the local Worker leaves a committed receipt and a pending room reservation.
  const lost=open('mars-lost'),observer=open('mars-lost');await Promise.all([joined(lost,'held donor'),joined(observer,'observer')]);
  await until(()=>lost.world()?.mars.roomFund===1_000&&observer.input.active,'crash fixture ready');
  const donorCash=cash(lost),driverId=await post('wallet-id',{room:'mars-lost',id:lost.id()}) as string;
  type AlarmState={calls:number;alarm:number|null;now:number};
  const initialAlarm=await post('room-alarm',{room:'mars-lost'}) as AlarmState;
  await post('hold-donation',{driverId});await delay(500);contribute(lost,300,51,501);
  type FaultState={held:boolean;intent?:EconomyIntent};
  let fault:FaultState={held:false};
  await until(async()=>{fault=await post('fault-state',{driverId}) as FaultState;return fault.held;},'donation profile reply held');
  assert.equal(fault.intent?.action.kind,'contribute');
  assert.equal(fault.intent?.action.kind==='contribute'&&fault.intent.action.amount,300);
  assert.equal(await post('cash',{driverId}),donorCash-300,'profile debit is durable before the held reply');
  const startTime=observer.world()!.time,startWall=performance.now(),seq=observer.input.send({...NEUTRAL,throttle:1});
  await until(()=>observer.world()!.time>=startTime+0.6&&(observer.input.control?.appliedSeq??0)>=seq,'other driver input and world progress during held donation',2_500);
  assert.ok(performance.now()-startWall<2_500,'held wallet does not stop the other driver');
  let alarm:AlarmState=initialAlarm;
  await until(async()=>{alarm=await post('room-alarm',{room:'mars-lost'}) as AlarmState;return alarm.calls>initialAlarm.calls&&alarm.alarm!==null&&alarm.alarm>alarm.now;},'journal alarm starts and schedules another retry while the profile reply is held');
  assert.equal((await post('fault-state',{driverId}) as FaultState).held,true,'profile reply remains held during observation');
  await crash(child!);child=undefined;
  child=start();await ready();
  const recoveredRoom=open('mars-lost');await joined(recoveredRoom,'room after lost reply');
  await until(()=>recoveredRoom.world()?.mars.roomFund===1_300,'pending donation resolves after Worker crash');
  assert.equal(await post('cash',{driverId}),donorCash-300,'crash recovery does not debit twice');
  await post('replay',fault.intent!);
  await delay(1_100);
  assert.equal(await post('cash',{driverId}),donorCash-300,'replaying the original intent does not debit twice');
  assert.equal(recoveredRoom.world()!.mars.roomFund,1_300,'replaying the original intent does not credit twice');
  console.log('PASS: legacy room funds and completed-room boarding; concurrent private donations, cap and sync barriers; isolated global earnings; disconnect/restart; held donation isolation and crash inside the rearmed journal alarm with exact-once replay.');
}finally{for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

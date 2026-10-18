// Isolated local Wrangler. Real GameRoom ticks and profile/outbox code; only
// event seeding, player placement, and the injected lost replies are fixtures.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SettledDeliveryEarning } from '../shared/earnings-events';
import type { DriverProgress } from '../worker/driver-profile';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw new Error(`Timed out: ${label}`);}
async function port(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;}
async function crash(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;try{process.kill(-child.pid!,'SIGKILL');}catch{}await until(()=>child.exitCode!==null||child.signalCode!==null,'Wrangler termination');}
const dir=await mkdtemp(join(tmpdir(),'tesland-earnings-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-earnings-payout-test',main:resolve('tests/fixtures/earnings-payout-worker.ts'),compatibility_date:'2026-10-17',
  assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__earnings-test/*']},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},{name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome','GlobalEarningsEvent']}]}));
let child:ChildProcess|undefined,logs='';const sockets:WebSocket[]=[];
function start(){const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});const log=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};c.stdout?.on('data',log);c.stderr?.on('data',log);return c;}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
async function rpc<T>(method:string,data:object={}):Promise<T>{const response=await fetch(base+'/__earnings-test/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`${method}: ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}
type Profile={driver:{progress:DriverProgress};sources:Record<string,SettledDeliveryEarning>;pending:number|null;alarm:number|null;lost:boolean};
type Income={held:boolean;status:{total:number;personal:number}};
const profile=(driver:string)=>rpc<Profile>('profile',{driver});
const income=(driver:string)=>rpc<Income>('income',{driver});
function connect(room='earnings'){
  const socket=new WebSocket(`ws://127.0.0.1:${p}/api/room/${room}`),messages:Record<string,any>[]=[];sockets.push(socket);
  socket.onmessage=event=>{const message=JSON.parse(String(event.data));messages.push(message);if(message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));};
  return {socket,messages,last:(type:string)=>messages.filter(message=>message.type===type).at(-1)};
}
try{
  child=start();await ready();
  const courier=connect(),scorer=connect();
  await until(()=>!!courier.last('welcome')&&!!courier.last('wallet')&&!!scorer.last('welcome')&&!!scorer.last('wallet'),'both guest wallets connected');
  const courierId=courier.last('welcome')!.id as string,scorerId=scorer.last('welcome')!.id as string;
  const a=await rpc<{driver:string}>('player',{player:courierId}),b=await rpc<{driver:string}>('player',{player:scorerId});
  await until(async()=>{const room=await rpc<any>('room');return !!room.snapshot&&room.snapshot.events.room.length===0&&room.snapshot.events.global.length===0;},'base earnings rate');
  const before=await profile(a.driver);
  assert.equal((await rpc<{stage:string}>('place',{player:courierId})).stage,'pickup');
  await until(async()=>!!(await profile(a.driver)).sources['earned-source:delivery:1:pickup'],'base pickup receipt');
  const pickup=await profile(a.driver),pickupSource=pickup.sources['earned-source:delivery:1:pickup'];
  assert.equal(pickupSource.multiplier,1);assert.equal(pickupSource.amount,pickupSource.base);assert.ok(pickupSource.base>0);
  assert.equal(pickup.driver.progress.earned-before.driver.progress.earned,pickupSource.amount);
  await until(async()=>(await income(a.driver)).status.personal===pickup.driver.progress.eligibleIncome,'base earnings reach GlobalIncome');

  await rpc('seed-event');await rpc('win',{player:scorerId});
  await until(async()=>(await rpc<unknown[]>('wins')).length===1,'real Dome win published');
  await until(async()=>{const room=await rpc<any>('room');return !room.hasPending&&room.snapshot?.events.room.length===1&&room.snapshot?.events.global.length===1;},'room and global bonus lease');
  await rpc('lose-delivery',{driver:a.driver});await rpc('hold',{driver:a.driver});
  assert.equal((await rpc<{stage:string}>('place',{player:courierId})).stage,'dropoff');
  await until(async()=>{const state=await profile(a.driver);return !!state.sources['earned-source:delivery:1:dropoff']&&state.lost;},'delivery commits despite lost profile reply');
  await until(async()=>(await income(a.driver)).held,'global credit committed and reply held');
  const delivery=await profile(a.driver),source=delivery.sources['earned-source:delivery:1:dropoff'];
  assert.equal(source.multiplier,3);assert.equal(source.amount,source.base*3);assert.ok(source.base>0);
  assert.equal(delivery.driver.progress.earned-pickup.driver.progress.earned,source.amount);
  assert.equal(delivery.driver.progress.completed,1);
  assert.equal(delivery.pending,delivery.driver.progress.eligibleIncome);assert.ok(delivery.alarm!==null,'watchdog armed before awaiting global RPC');
  assert.equal((await income(a.driver)).status.personal,delivery.pending,'global credit committed before lost reply');
  const frozen=structuredClone(delivery.driver.progress),sources=structuredClone(delivery.sources);
  await crash(child);child=undefined;child=start();await ready();
  await until(async()=>(await profile(a.driver)).pending===null,'watchdog clears outbox after restart');
  await until(async()=>(await income(a.driver)).status.personal===frozen.eligibleIncome,'replayed global credit remains exactly once');
  const after=await profile(a.driver);assert.deepEqual(after.driver.progress,frozen);assert.deepEqual(after.sources,sources);
  assert.equal((await rpc<unknown[]>('wins')).length,1,'verified room win survives restart');
  await rpc('replay',{driver:a.driver});
  await delay(1100);
  const afterReplay=await profile(a.driver);
  assert.deepEqual(afterReplay.driver.progress,frozen);assert.deepEqual(afterReplay.sources,sources);
  assert.equal((await income(a.driver)).status.personal,frozen.eligibleIncome,'delivery intent replay cannot duplicate income');
  await until(async()=>{const scorerProfile=await profile(b.driver);return scorerProfile.pending===null;},'scorer outbox drained');
  const scorerProfile=await profile(b.driver);
  assert.equal((await income(a.driver)).status.total,frozen.eligibleIncome+scorerProfile.driver.progress.eligibleIncome,'global total equals both real wallets');

  // The win itself is journaled in GameRoom before it calls RoomEconomy.
  // Hold the already committed RPC reply, then restart before the journal is removed.
  const room='win-restart',winScorer=connect(room);
  await until(()=>!!winScorer.last('welcome')&&!!winScorer.last('wallet'),'win recovery guest connected');
  const winScorerId=winScorer.last('welcome')!.id as string;
  await rpc('hold-win',{room});await rpc('win',{room,player:winScorerId});
  await until(async()=>(await rpc<{held:boolean}>('win-fault',{room})).held,'committed room win reply held');
  const held=await rpc<{pending:{event_id:string;requested_at:number}[];hasPending:boolean;alarm:number|null}>('room',{room});
  const wins=await rpc<{event_id:string;requested_at:number;won_at:number;ends_at:number}[]>('wins',{room});
  assert.equal(held.pending.length,1);assert.equal(held.hasPending,true);assert.ok(held.alarm!==null,'room watchdog armed before awaiting win RPC');
  assert.equal(wins.length,1);assert.equal(wins[0].event_id,held.pending[0].event_id);assert.equal(wins[0].requested_at,held.pending[0].requested_at);
  await crash(child);child=undefined;child=start();await ready();
  await until(async()=>(await rpc<{pending:unknown[]}>('room',{room})).pending.length===0,'room watchdog replays committed win after restart');
  const recovered=await rpc<typeof wins>('wins',{room});
  assert.deepEqual(recovered,wins,'lost reply replay does not create or alter a second win');
  await delay(1100);
  assert.deepEqual(await rpc<typeof wins>('wins',{room}),wins,'later watchdog wakeups remain idempotent');
  console.log('PASS: real GameRoom base pickup, Dome wins, 3× delivery, lost replies and watchdog restart.');
}catch(error){console.error(logs.slice(-8000));throw error;}finally{for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();if(child)await crash(child);await rm(dir,{recursive:true,force:true});}

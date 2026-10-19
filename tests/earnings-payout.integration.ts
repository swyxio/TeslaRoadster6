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
import { NEUTRAL } from '../shared/game';
import { RoomInputClient } from './room-input-client';

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
async function ready(){try{await until(async()=>{if(child?.exitCode!==null)throw new Error(`Wrangler exited: ${logs}`);try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},'Wrangler startup',45_000);}catch(error){throw new Error(`${error}\n${logs}`);}}
async function rpc<T>(method:string,data:object={}):Promise<T>{const response=await fetch(base+'/__earnings-test/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`${method}: ${response.status}: ${await response.text()}`);return response.json() as Promise<T>;}
type Profile={driver:{progress:DriverProgress};sources:Record<string,SettledDeliveryEarning>;pending:number|null;alarm:number|null;lost:boolean};
type Income={held:boolean;status:{total:number;personal:number}};
const profile=(driver:string)=>rpc<Profile>('profile',{driver});
const income=(driver:string)=>rpc<Income>('income',{driver});
function connect(room='earnings'){
  const path=room.startsWith('public:')?`/api/public-room/${room.slice(7)}`:`/api/room/${room}`;
  const socket=new WebSocket(`ws://127.0.0.1:${p}${path}`),messages:Record<string,any>[]=[];sockets.push(socket);
  const input=new RoomInputClient(socket);
  socket.onmessage=event=>{const message=JSON.parse(String(event.data));input.observe(message);messages.push(message);if(message.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));};
  return {socket,input,messages,last:(type:string)=>messages.filter(message=>message.type===type).at(-1)};
}
try{
  child=start();await ready();
  const courier=connect(),scorer=connect();
  await until(()=>!!courier.last('welcome')&&!!courier.last('wallet')&&!!scorer.last('welcome')&&!!scorer.last('wallet'),'both guest wallets connected');
  const courierId=courier.last('welcome')!.id as string,scorerId=scorer.last('welcome')!.id as string;
  const a=await rpc<{driver:string}>('player',{player:courierId}),b=await rpc<{driver:string}>('player',{player:scorerId});
  await until(async()=>{const room=await rpc<any>('room');return !!room.snapshot&&room.snapshot.events.room.length===0&&room.snapshot.events.global.length===0;},'base earnings rate');
  // A future-issued lease is unavailable until its time arrives. Waiting is
  // asynchronous: real room ticks and snapshots must continue in the meantime.
  await rpc('lease-timing',{timing:'ahead'});
  const tickBefore=courier.last('state')!.tick;
  const delayed=await rpc<any>('refresh');
  assert.ok(delayed.snapshot,'a slightly ahead lease becomes usable');
  assert.ok(delayed.now>=delayed.snapshot.lease.issuedAtMs,'never publish before issue time');
  assert.ok(courier.last('state')!.tick>=tickBefore+4,'room advances during lease wait');
  const count=await rpc<number>('lease-timing',{timing:'ahead'});
  const invalidated=rpc<any>('refresh');
  await until(async()=>(await rpc<number>('lease-count'))>count,'future lease requested');
  await rpc('invalidate-rate');
  assert.equal((await invalidated).snapshot,null,'an invalidation during the wait cannot restore an obsolete rate');
  await rpc('lease-timing',{timing:'expired'});
  assert.equal((await rpc<any>('refresh')).snapshot,null,'expired lease still fails closed');
  await rpc('lease-timing',{timing:'far-future'});
  assert.equal((await rpc<any>('refresh')).snapshot,null,'do not wait beyond the observation freshness budget');
  await rpc('lease-timing',{timing:'normal'});
  assert.ok((await rpc<any>('refresh')).snapshot,'valid rates recover after failures');
  const before=await profile(a.driver);
  assert.equal((await rpc<{stage:string}>('place',{player:courierId})).stage,'pickup');
  await until(async()=>!!(await profile(a.driver)).sources['earned-source:delivery:1:pickup'],'base pickup receipt');
  const pickup=await profile(a.driver),pickupSource=pickup.sources['earned-source:delivery:1:pickup'];
  assert.equal(pickupSource.multiplier,1);assert.equal(pickupSource.amount,pickupSource.base);assert.ok(pickupSource.base>0);
  assert.equal(pickup.driver.progress.earned-before.driver.progress.earned,pickupSource.amount);
  await until(async()=>(await income(a.driver)).status.personal===pickup.driver.progress.eligibleIncome,'base earnings reach GlobalIncome');

  const scorerBefore=await profile(b.driver);
  await rpc('seed-event');await rpc('win',{player:scorerId});
  await until(async()=>(await rpc<unknown[]>('wins')).length===1,'real Dome win published');
  const match=await profile(b.driver);
  assert.equal(match.driver.progress.cash-scorerBefore.driver.progress.cash,2_700,'win pays $750 at the pre-win 2x rate plus $1,200 fixed achievement cash');
  assert.equal(match.driver.progress.eligibleIncome-scorerBefore.driver.progress.eligibleIncome,2_700);
  await until(()=>scorer.messages.some(message=>message.type==='wallet'&&message.progress?.delivery?.lastReward?.kind==='dome-match')||scorer.messages.some(message=>JSON.stringify(message).includes('dome-match')),'match reward reaches the player');
  await until(async()=>{const room=await rpc<any>('room');return !room.hasPending&&room.snapshot?.events.room.length===1&&room.snapshot?.events.global.length===1;},'room and global bonus lease');
  await rpc('cap-dome',{driver:b.driver});await rpc('win',{player:scorerId});
  await until(async()=>(await rpc<unknown[]>('wins')).length===2,'repeat Dome win published');
  const repeat=await profile(b.driver);
  assert.equal(repeat.driver.progress.cash-match.driver.progress.cash,2_250,'repeat win pays at the prior room and global 3x rate even after tier caps');
  assert.equal(repeat.driver.progress.achievementTiers?.['dome-wins'].count,10_000);
  await rpc('lose-delivery',{driver:a.driver});await rpc('hold',{driver:a.driver});
  assert.equal((await rpc<{stage:string}>('place',{player:courierId})).stage,'dropoff');
  try{
    await until(async()=>{const state=await profile(a.driver);return !!state.sources['earned-source:delivery:1:dropoff']&&state.lost;},'delivery commits despite lost profile reply');
  }catch(error){
    const world=courier.last('state')?.world,player=world?.players.find((p:any)=>p.id===courierId);
    console.error('Delivery diagnostic',JSON.stringify({player,car:world?.entities.find((e:any)=>e.id===player?.entityId),room:await rpc('room'),profile:await profile(a.driver)}));
    throw error;
  }
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
  assert.equal((await rpc<unknown[]>('wins')).length,2,'both verified room wins survive restart');
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
  const winner=await rpc<{driver:string}>('player',{room,player:winScorerId});
  const winnerBefore=await profile(winner.driver);
  await rpc('hold-win',{room});await rpc('win',{room,player:winScorerId});
  await until(async()=>(await rpc<{held:boolean}>('win-fault',{room})).held,'committed room win reply held');
  const held=await rpc<{pending:{event_id:string;requested_at:number}[];hasPending:boolean;alarm:number|null}>('room',{room});
  const wins=await rpc<{event_id:string;requested_at:number;won_at:number;ends_at:number}[]>('wins',{room});
  assert.equal(held.pending.length,1);assert.equal(held.hasPending,true);assert.ok(held.alarm!==null,'room watchdog armed before awaiting win RPC');
  assert.equal(wins.length,1);assert.equal(wins[0].event_id,held.pending[0].event_id);assert.equal(wins[0].requested_at,held.pending[0].requested_at);
  const paidBeforeCrash=await profile(winner.driver);
  assert.equal(paidBeforeCrash.driver.progress.cash-winnerBefore.driver.progress.cash,2_700,'match and fixed achievement cash are committed before the bonus is published');
  await crash(child);child=undefined;child=start();await ready();
  await until(async()=>(await rpc<{pending:unknown[]}>('room',{room})).pending.length===0,'room watchdog replays committed win after restart');
  const recovered=await rpc<typeof wins>('wins',{room});
  assert.deepEqual(recovered,wins,'lost reply replay does not create or alter a second win');
  await delay(1100);
  assert.deepEqual(await rpc<typeof wins>('wins',{room}),wins,'later watchdog wakeups remain idempotent');
  assert.deepEqual((await profile(winner.driver)).driver.progress,paidBeforeCrash.driver.progress,'a lost publish reply cannot duplicate match cash');

  // An earlier unresolved stop can share the exact match millisecond. Its
  // pre-win history must resolve even if the wallet disconnects meanwhile.
  const historyRoom='history-before-win',historyScorer=connect(historyRoom),unrelated=connect(historyRoom);
  await until(()=>!!historyScorer.last('welcome')&&!!historyScorer.last('wallet')&&unrelated.input.active,'history test guests connected');
  const historyId=historyScorer.last('welcome')!.id as string,historyDriver=(await rpc<{driver:string}>('player',{room:historyRoom,player:historyId})).driver;
  const historyBefore=await profile(historyDriver);
  await rpc('hold-history',{room:historyRoom});await rpc('invalidate-rate',{room:historyRoom});
  assert.equal((await rpc<{stage:string}>('place',{room:historyRoom,player:historyId})).stage,'pickup');
  await until(async()=>(await rpc<{held:boolean}>('history-fault',{room:historyRoom})).held,'historical pickup awaiting its rate');
  const timestamp=await rpc<{at:number}>('win-same-ms',{room:historyRoom,player:historyId});
  const pendingHistory=await rpc<{pending:{requested_at:number}[]}>('room',{room:historyRoom});
  assert.equal(pendingHistory.pending.length,1);
  assert.equal(pendingHistory.pending[0].requested_at,timestamp.at,'delivery and triggering match share the same millisecond');
  const previousTick=historyScorer.last('state')!.tick;
  await until(()=>historyScorer.last('state')!.tick>=previousTick+5,'world advances while payout history waits');
  const unrelatedId=unrelated.last('welcome')!.id;
  const beforeWorld=unrelated.last('state')!.world,unrelatedEntityId=beforeWorld.players.find((player:any)=>player.id===unrelatedId).entityId;
  const origin=structuredClone(beforeWorld.entities.find((entity:any)=>entity.id===unrelatedEntityId));
  for(let i=0;i<20;i++){unrelated.input.send({...NEUTRAL,throttle:1});await delay(50);}
  await until(()=>unrelated.input.control?.appliedSeq===unrelated.input.lastSeq,'unrelated driver input applies during the stalled payout');
  await until(()=>{const car=unrelated.last('state')?.world.entities.find((entity:any)=>entity.id===unrelatedEntityId);return !!car&&Math.hypot(car.x-origin.x,car.z-origin.z)>2;},'unrelated driver moves while payout waits');
  unrelated.input.send(NEUTRAL);
  historyScorer.socket.close();
  await delay(1500);
  assert.equal((await rpc<{pending:unknown[]}>('room',{room:historyRoom})).pending.length,1,'disconnect does not seal a draining wallet');
  await rpc('release-history',{room:historyRoom});
  await until(async()=>(await rpc<{pending:unknown[]}>('room',{room:historyRoom})).pending.length===0,'earlier delivery and match settle after disconnect');
  const historyAfter=await profile(historyDriver),historyPickup=historyAfter.sources['earned-source:delivery:1:pickup'];
  assert.equal(historyPickup.multiplier,2,'earlier same-millisecond pickup does not receive the triggering room bonus');
  assert.ok(historyAfter.driver.progress.cash>=historyBefore.driver.progress.cash+historyPickup.amount+2_700,'earlier pickup and match each reach the disconnected driver');

  // Crash after GameRoom journals the result but before its stage RPC succeeds.
  const stageRoom='stage-restart',stageScorer=connect(stageRoom);
  await until(()=>!!stageScorer.last('welcome')&&!!stageScorer.last('wallet'),'stage recovery guest connected');
  const stageId=stageScorer.last('welcome')!.id as string,stageDriver=(await rpc<{driver:string}>('player',{room:stageRoom,player:stageId})).driver;
  const stageBefore=await profile(stageDriver);
  await rpc('hold-stage',{room:stageRoom});await rpc('win',{room:stageRoom,player:stageId});
  await until(async()=>(await rpc<{held:boolean}>('stage-fault',{room:stageRoom})).held,'stage request held before acceptance');
  assert.equal((await rpc<{pending:unknown[]}>('room',{room:stageRoom})).pending.length,1,'immutable match descriptor is journaled before stage acceptance');
  assert.equal((await profile(stageDriver)).driver.progress.cash,stageBefore.driver.progress.cash);
  await crash(child);child=undefined;child=start();await ready();
  await until(async()=>(await rpc<{pending:unknown[]}>('room',{room:stageRoom})).pending.length===0,'journaled stage recovered after restart');
  const stageRecovered=await profile(stageDriver);
  assert.equal(stageRecovered.driver.progress.cash-stageBefore.driver.progress.cash,2_700,'recovered stage pays exactly once');
  assert.equal((await rpc<unknown[]>('wins',{room:stageRoom})).length,1);
  await delay(1100);
  assert.deepEqual((await profile(stageDriver)).driver.progress,stageRecovered.driver.progress,'stage replay remains idempotent');

  // A match can reach an economy object whose clock is slightly behind the
  // room. The transient rejection must not close the player's wallet socket.
  const skewRoom='stage-clock-skew',skewScorer=connect(skewRoom);
  await until(()=>!!skewScorer.last('welcome')&&!!skewScorer.last('wallet'),'clock skew guest connected');
  const skewId=skewScorer.last('welcome')!.id as string,skewDriver=(await rpc<{driver:string}>('player',{room:skewRoom,player:skewId})).driver;
  const skewBefore=await profile(skewDriver);
  await rpc('skew-stage',{room:skewRoom});await rpc('win',{room:skewRoom,player:skewId});
  await until(async()=>(await rpc<{observed:boolean}>('skew-observed',{room:skewRoom})).observed,'ahead-of-receiver match observed');
  await until(async()=>(await rpc<unknown[]>('wins',{room:skewRoom})).length===1,'clock skew match settles');
  assert.equal(skewScorer.socket.readyState,WebSocket.OPEN,'clock skew cannot disconnect the player');
  const skewAfter=await profile(skewDriver);
  assert.equal(skewAfter.driver.progress.cash-skewBefore.driver.progress.cash,2_700,'the original match settles exactly once');
  await delay(1100);
  assert.deepEqual((await profile(skewDriver)).driver.progress,skewAfter.driver.progress,'clock skew retry cannot duplicate rewards');

  // Public overflow uses an internal room identity that contains a colon.
  // Rewards must settle there through the same authoritative wallet path.
  const overflowRoom='public:1',overflow=connect(overflowRoom);
  await until(()=>!!overflow.last('welcome')&&!!overflow.last('wallet'),'overflow match guest connected');
  const overflowId=overflow.last('welcome')!.id as string,overflowDriver=(await rpc<{driver:string}>('player',{room:overflowRoom,player:overflowId})).driver;
  const overflowBefore=await profile(overflowDriver);
  await rpc('win',{room:overflowRoom,player:overflowId});
  await until(async()=>(await rpc<unknown[]>('wins',{room:overflowRoom})).length===1,'overflow match settles');
  assert.equal((await profile(overflowDriver)).driver.progress.cash-overflowBefore.driver.progress.cash,2_700,'overflow winner receives the match reward and achievements');
  assert.equal(overflow.socket.readyState,WebSocket.OPEN,'overflow player stays connected');

  const uncreditedRoom='uncredited',uncredited=connect(uncreditedRoom);
  await until(()=>!!uncredited.last('welcome')&&!!uncredited.last('wallet'),'uncredited match guest connected');
  const uncreditedId=uncredited.last('welcome')!.id as string,uncreditedDriver=(await rpc<{driver:string}>('player',{room:uncreditedRoom,player:uncreditedId})).driver;
  const uncreditedBefore=await profile(uncreditedDriver);
  await rpc('win-uncredited',{room:uncreditedRoom,player:uncreditedId});
  await until(async()=>(await profile(uncreditedDriver)).driver.progress.cash>=uncreditedBefore.driver.progress.cash+600,'uncredited participant receives cash');
  await until(async()=>(await rpc<{pending:unknown[]}>('room',{room:uncreditedRoom})).pending.length===0,'uncredited match settles');
  const uncreditedAfter=await profile(uncreditedDriver);
  assert.equal(uncreditedAfter.driver.progress.cash-uncreditedBefore.driver.progress.cash,600,'participation pays $250 at 2x plus the $100 first tier');
  assert.ok(uncreditedAfter.driver.progress.unlocked.includes('dome-debut'));
  assert.ok(!uncreditedAfter.driver.progress.unlocked.includes('dome-champion'));
  assert.equal((await rpc<unknown[]>('wins',{room:uncreditedRoom})).length,0,'no credited winner does not activate a room bonus');
  console.log('PASS: real GameRoom payouts, deliveries, lost replies and crash recovery before and after settlement.');
}catch(error){console.error(logs.slice(-8000));throw error;}finally{for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();if(child)await crash(child);await rm(dir,{recursive:true,force:true});}

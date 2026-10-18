// Isolated local Wrangler; the real room-economy binding is not touched.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOM_WIN_DURATION_MS, activityPayout, type EarningsWindow } from '../shared/earnings-events';
import type { PreparedRoomWin, RoomEventCursor } from '../worker/room-earnings-events';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const listener=createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
const address=listener.address();assert.ok(address&&typeof address!=='string');
const port=address.port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
const dir=await mkdtemp(join(tmpdir(),'tesland-room-events-')),config=join(dir,'wrangler.json'),base=`http://127.0.0.1:${port}`;
await writeFile(config,JSON.stringify({name:'tesland-room-events-test',main:resolve('tests/fixtures/room-earnings-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOM_ECONOMY',class_name:'RoomEconomy'}]},migrations:[{tag:'v1',new_sqlite_classes:['RoomEconomy']}]}));
let child:ChildProcess|undefined;
function start(){
  const proc=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  proc.stdout?.resume();proc.stderr?.resume();return proc;
}
async function stop(){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
}
async function ready(){
  const deadline=Date.now()+20_000;
  while(Date.now()<deadline){
    if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');
    try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
    await delay(50);
  }
  throw new Error('Wrangler startup timed out');
}
async function post(path:string,body:unknown){return fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
async function active(time:number){return (await fetch(base+`/active?time=${time}`)).json() as Promise<number|null>;}
async function history(from:number,to:number,cursor?:RoomEventCursor){
  const response=await post('/history',{from,to,cursor});assert.ok(response.ok);return response.json() as Promise<{windows:EarningsWindow[];next:RoomEventCursor|null}>;
}
try{
  child=start();await ready();
  const wonAt=1_000_000,second=wonAt+300_000;
  assert.ok((await post('/win',{id:'one',time:wonAt})).ok);
  assert.ok((await post('/win',{id:'one',time:wonAt})).ok,'duplicate record is idempotent');
  assert.equal((await post('/win',{id:'one',time:wonAt+1})).status,400,'conflicting retry is rejected');
  assert.ok((await post('/win',{id:'two',time:second})).ok);
  assert.equal(await active(wonAt-1),null);
  assert.equal(await active(wonAt),wonAt+ROOM_WIN_DURATION_MS);
  assert.equal(await active(second),second+ROOM_WIN_DURATION_MS,'second win refreshes timer');
  assert.equal(await active(second+ROOM_WIN_DURATION_MS),null,'expiry is exclusive');
  assert.deepEqual((await history(wonAt+1,second+1)).windows,[{startsAtMs:wonAt,endsAtMs:wonAt+ROOM_WIN_DURATION_MS},{startsAtMs:second,endsAtMs:second+ROOM_WIN_DURATION_MS}]);
  // Same-time events exercise keyset pagination without relying on timestamps being unique.
  for(let i=0;i<101;i++)assert.ok((await post('/win',{id:`page-${String(i).padStart(3,'0')}`,time:3_000_000})).ok);
  const first=await history(3_000_000,3_000_001);assert.equal(first.windows.length,100);assert.ok(first.next);
  assert.equal((await post('/win',{id:'late-history',time:2_999_999})).status,400,'a late win cannot change a paged history');
  assert.ok((await post('/win',{id:'page-000',time:3_000_000})).ok,'an already committed win remains retryable behind the fence');
  assert.ok((await post('/win',{id:'boundary',time:3_000_001})).ok,'a win at the exclusive history boundary is allowed');
  const secondPage=await history(3_000_000,3_000_001,first.next!);assert.equal(secondPage.windows.length,1);assert.equal(secondPage.next,null);
  assert.equal(await active(4_000_000),null);
  const sameMs=await (await post('/win',{id:'late-point',time:4_000_000})).json() as PreparedRoomWin;
  assert.equal(sameMs.startsAtMs,4_000_001,'a same-millisecond observation is ordered before the new win');
  assert.ok((await post('/win',{id:'next-point',time:4_000_001})).ok);
  assert.equal((await post('/history',{from:Date.now(),to:Date.now()+60_000})).status,400,'future history cannot fence wins');
  const reservation=await (await post('/prepare',{id:'match-pending',time:5_000_000})).json() as PreparedRoomWin;
  assert.equal(reservation.priorActiveUntilMs,null);
  assert.equal(activityPayout(100,'dome-match',reservation.startsAtMs,{room:[],global:[]}),100,'the triggering match uses the pre-win rate');
  assert.equal((await fetch(base+'/active?time=5000000')).status,400,'later payouts wait for the pending win');
  assert.equal((await post('/history',{from:4_999_999,to:5_000_001})).status,400,'cab history cannot skip a pending win');
  assert.equal((await post('/prepare',{id:'other-match',time:5_000_001})).status,400,'a later win cannot pass a pending win');
  assert.equal((await post('/no-payout',{id:'match-pending',time:5_000_000})).status,400,'a zero-payout operation cannot publish a match awaiting payout');
  await stop();child=start();await ready();
  assert.equal(await active(second),second+ROOM_WIN_DURATION_MS);
  assert.deepEqual(await history(3_000_000,3_000_001,first.next!),secondPage,'history and cursor survive restart');
  assert.deepEqual(await (await fetch(base+'/pending')).json(),reservation,'the reservation and prior rate survive restart');
  assert.equal((await post('/commit?lose-reply=1',{id:'match-pending'})).status,503);
  assert.deepEqual(await (await post('/commit',{id:'match-pending'})).json(),reservation,'a lost publish reply is retryable');
  assert.deepEqual(await (await post('/prepare',{id:'match-pending',time:5_000_000})).json(),reservation,'retry retains the original pre-win rate');
  assert.equal(await active(5_000_000),5_000_000+ROOM_WIN_DURATION_MS);
  assert.equal((await post('/win',{id:'late-after-restart',time:4_000_000})).status,400,'the observation fence survives restart');
  assert.ok((await post('/win',{id:'next-point',time:4_000_001})).ok,'a persisted win remains retryable after restart');
  assert.equal((await post('/no-payout?lose-reply=1',{id:'zero-match',time:6_000_000})).status,503);
  const zero=await (await post('/no-payout',{id:'zero-match',time:6_000_000})).json() as PreparedRoomWin;
  assert.equal(zero.startsAtMs,6_000_000);
  assert.equal(await active(6_000_000),6_000_000+ROOM_WIN_DURATION_MS);
  assert.equal(await (await fetch(base+'/pending')).json(),null,'zero-payout win publishes without an intermediate pending record');
  console.log('PASS: durable room bonus, refresh, idempotency, observation fences, pagination and restart.');
}finally{await stop();await rm(dir,{recursive:true,force:true});}

// Local-only real room test. The fixture skips four ticks after accepting a jump.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { NEUTRAL, PROTOCOL_VERSION } from '../shared/game';
import { RoomInputClient } from './room-input-client';

const listener=createServer();await new Promise<void>(done=>listener.listen(0,'127.0.0.1',done));
const port=(listener.address() as {port:number}).port;await new Promise<void>(done=>listener.close(()=>done()));
const dir=await mkdtemp(join(tmpdir(),'tesland-delayed-jump-')),base=`http://127.0.0.1:${port}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'local-delayed-jump',main:resolve('tests/fixtures/input-trace-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'}]},migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']}]}));
const child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1',
  '--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
  {detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-12000);});
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=10000){
  const end=performance.now()+timeout;while(performance.now()<end){if(await check())return;await sleep(20);}throw new Error(`${label}\n${logs}`);
}
async function trace(){const response=await fetch(base+'/__trace');assert.ok(response.ok);return response.json() as Promise<{events:Array<Record<string,any>>;dropped:number}>;}
async function arm(id:number){assert.ok((await fetch(`${base}/__delay-jump?id=${id}`,{method:'POST'})).ok);}
function connect(){
  const socket=new WebSocket(`${base.replace('http','ws')}/api/room/sandbox-trace`),input=new RoomInputClient(socket);
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));
    if(message.type==='welcome')assert.equal(message.version,PROTOCOL_VERSION);input.observe(message);});
  return {socket,input};
}
const clients:ReturnType<typeof connect>[]=[];
try{
  await until(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},'Wrangler startup',60000);
  const driver=connect(),observer=connect();clients.push(driver,observer);
  await until(()=>driver.input.ready&&observer.input.ready,'two room clients ready');
  await arm(1);
  const target=driver.input.tick+7,seq=driver.input.send({...NEUTRAL,jump:1},{targetTick:target});
  await until(async()=>{const t=await trace();return t.events.some(e=>e.kind==='receipt'&&e.seq===seq&&e.schedulerCalled&&e.result==='accepted');},'first press accepted');
  const heartbeat=setInterval(()=>{if(driver.input.ready)driver.input.send({...NEUTRAL,jump:1},{targetTick:target});},40);
  try{await until(()=>driver.input.edges.some(e=>e.kind==='jump'&&e.id===1&&(e.status==='processed'||e.status==='expired')),'first press outcome');}
  finally{clearInterval(heartbeat);}
  assert.equal(driver.input.edges.filter(e=>e.kind==='jump'&&e.id===1&&e.status==='processed').length,1);
  assert.equal(driver.input.edges.filter(e=>e.kind==='jump'&&e.id===1&&e.status==='expired').length,0);
  const evidence=await trace(),receipt=evidence.events.find(e=>e.kind==='receipt'&&e.seq===seq&&e.schedulerCalled)!;
  const applied=evidence.events.find(e=>e.kind==='advance'&&e.outcomes?.some((o:{kind:string;id:number;status:string})=>o.kind==='jump'&&o.id===1&&o.status==='processed'))!;
  assert.ok(applied.at-receipt.receiptTime>300,`delayed press took ${applied.at-receipt.receiptTime} ms`);
  assert.equal(evidence.events.filter(e=>e.kind==='tick-skipped').length,4);
  assert.equal(observer.input.edges.length,0,'other driver receives no private edge results');

  await arm(2);
  const staleTarget=driver.input.tick+7,staleSeq=driver.input.send({...NEUTRAL,jump:2},{targetTick:staleTarget});
  await until(async()=>{const t=await trace();return t.events.some(e=>e.kind==='receipt'&&e.seq===staleSeq&&e.schedulerCalled&&e.result==='accepted');},'second press accepted');
  await until(()=>driver.input.edges.some(e=>e.kind==='jump'&&e.id===2&&e.status==='expired'),'stale press expired');
  driver.input.send({...NEUTRAL,jump:2});await sleep(500);
  assert.equal(driver.input.edges.filter(e=>e.kind==='jump'&&e.id===2&&e.status==='processed').length,0,'expired press never replays');
  driver.socket.close();await sleep(100);
  const again=connect();clients.push(again);await until(()=>again.input.ready,'reconnect joins');
  assert.deepEqual(again.input.control!.jump.pending,[],'reconnect starts with no queued jump');
  assert.equal(again.input.control!.jump.processed,0);
  const final=await trace();assert.equal(final.dropped,0);
  console.log(JSON.stringify({firstPressDelayMs:applied.at-receipt.receiptTime,target,trace:final},null,2));
  console.error('PASS: delayed room ticks, active and stale presses, private outcomes and reconnect; local fixture only.');
}catch(error){
  try{console.log(JSON.stringify({failed:true,trace:await trace()},null,2));}catch{/* retain the original failure */}
  throw error;
}finally{
  for(const client of clients)client.socket.close();
  try{process.kill(-child.pid!,'SIGTERM');}catch{/* already stopped */}
  await new Promise<void>(done=>{if(child.exitCode!==null||child.signalCode!==null)return done();child.once('exit',()=>done());});
  await rm(dir,{recursive:true,force:true});
}

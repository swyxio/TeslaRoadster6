// Real local Wrangler; persistent services deliberately unavailable to playtest rooms.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { RoomInputClient } from './room-input-client';
import { SANDBOX_CASH } from '../shared/playtest';
import { NEUTRAL, type World } from '../shared/game';
const dir=await mkdtemp(join(tmpdir(),'tesland-playtest-isolation-'));
const portServer=createServer();await new Promise<void>(resolve=>portServer.listen(0,'127.0.0.1',resolve));
const port=(portServer.address() as {port:number}).port;await new Promise<void>(resolve=>portServer.close(()=>resolve()));
const config=join(dir,'wrangler.json'),base=`http://127.0.0.1:${port}`;
await writeFile(config,JSON.stringify({name:'playtest-isolation',main:resolve('tests/fixtures/playtest-worker.ts'),compatibility_date:'2026-10-17',durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'}]},migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']}]}));
const child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{logs=(logs+b).slice(-20000);});
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await check())return;await delay(30);}throw new Error(`${label}\n${logs}`);}
const sockets:WebSocket[]=[];
function connect(room:string){
  const socket=new WebSocket(base.replace('http','ws')+`/api/room/${room}`),input=new RoomInputClient(socket),events:any[]=[];
  const state:{world?:World;id?:string}={};sockets.push(socket);
  socket.onmessage=event=>{const m=JSON.parse(String(event.data));events.push(m);input.observe(m);if(m.type==='welcome'){state.id=m.id;socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}if(m.type==='state')state.world=m.world;};
  const send=(m:object)=>socket.send(JSON.stringify(m));
  return {socket,input,events,state,send,car:()=>state.world!.entities.find(e=>e.driver===state.id)!};
}
try{
  await until(async()=>{try{return(await fetch(base+'/health')).ok;}catch{return false;}},'startup',60000);
  const a=connect('sandbox-test'),b=connect('sandbox-test'),practice=connect('practice-test');
  await until(()=>a.input.active&&b.input.active&&practice.input.active,'all connected');
  assert.equal(a.car().tankLevel,5);assert.equal(practice.car().tankLevel,1);
  assert.equal(practice.state.world!.players[0].delivery.cash,2500);
  a.send({type:'identity',code:'never-bind-this-code',requestId:2});
  await until(()=>a.events.some(e=>e.type==='identityResult'&&e.requestId===2&&!e.ok),'saved identity rejected');
  a.send({type:'mars',action:'contribute',amount:1000000,requestId:3});
  await until(()=>a.events.some(e=>e.type==='marsResult'&&e.requestId===3&&!e.ok),'contribution rejected');
  await delay(450);
  a.input.action({type:'teleport',x:-165,z:180,requestId:4});
  await until(()=>a.events.some(e=>e.type==='teleportResult'&&e.requestId===4&&e.ok),'teleport accepted');
  await until(()=>b.state.world!.entities.some(e=>e.driver===a.state.id&&Math.hypot(e.x+165,e.z-180)<=20.1),'peer sees teleport');
  assert.ok(a.input.poseRevision>0);assert.equal(a.car().speed,0);
  await delay(450);
  a.input.action({type:'selectVehicle',kind:'bugatti-chiron'});
  await until(()=>a.car().kind==='bugatti-chiron','sandbox Vault car');assert.equal(a.car().tankLevel,5);
  a.send({type:'sync',token:100});await until(()=>a.events.some(e=>e.type==='state'&&e.sync===100),'ephemeral action barrier');
  await delay(450);
  a.send({type:'vehicleStyle',category:'paint',choice:'mint',requestId:5});
  await until(()=>a.events.some(e=>e.type==='vehicleStyleResult'&&e.requestId===5&&e.ok),'free sandbox paint');
  await until(()=>a.state.world!.players.find(p=>p.id===a.state.id)!.delivery.cash===SANDBOX_CASH,'cash replenished');
  practice.input.action({type:'teleport',x:-165,z:180,requestId:6});
  await until(()=>practice.events.some(e=>e.type==='teleportResult'&&e.requestId===6&&!e.ok),'practice cannot teleport');
  assert.equal(practice.input.poseRevision,0);
  for(const client of [a,b,practice])client.input.send(NEUTRAL);
  await delay(2100); // includes refresh and cab rebalance paths
  for(const room of ['sandbox-test','practice-test']){
    const report=await fetch(base+'/isolation/'+room).then(r=>r.json());
    assert.deepEqual(report,{accesses:[],keys:[],tables:[]},'no service calls, KV or SQL journals');
  }
  assert.equal(a.state.world!.mars.fund,0);assert.equal(a.state.world!.mars.roomFund,0);
  for(const client of [a,b,practice])assert.equal(client.events.filter(e=>e.type==='wallet').length,0);
  for(const socket of sockets)socket.close();await delay(250);
  const fresh=connect('practice-test');await until(()=>fresh.input.active,'fresh practice rejoin');
  assert.equal(fresh.car().tankLevel,1);assert.equal(fresh.state.world!.players[0].delivery.cash,2500);
  console.log('PASS: real room multiplayer, max fleet, fenced teleport, fresh practice, zero persistent service calls/journals.');
}finally{
  for(const socket of sockets)socket.close();try{process.kill(-child.pid!,'SIGTERM');}catch{}
  await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',()=>resolve());});
  await rm(dir,{recursive:true,force:true});
}

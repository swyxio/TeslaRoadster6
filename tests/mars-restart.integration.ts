// Local Wrangler only; credits and positioning come from the test fixture.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { World } from '../shared/game';
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(50);}throw new Error(`Timed out: ${label}`);}
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const a=s.address();assert.ok(a&&typeof a!=='string');await new Promise<void>(r=>s.close(()=>r()));return a.port;}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;try{process.kill(-child.pid!,'SIGINT');}catch{}for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}}
type Event={type:string;id?:string;world?:World;requestId?:number;ok?:boolean;sync?:number};
function connect(url:string){const socket=new WebSocket(url),events:Event[]=[];socket.onmessage=e=>{const event=JSON.parse(String(e.data));events.push(event);if(event.type==='welcome')socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));};return {socket,events,world:()=>events.filter(e=>e.type==='state').at(-1)?.world,id:()=>events.find(e=>e.type==='welcome')?.id};}
const dir=await mkdtemp(join(tmpdir(),'tesland-mars-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-mars-test',main:resolve('tests/fixtures/mars-worker.ts'),compatibility_date:'2026-10-17',assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*','/__mars-test/*']},durable_objects:{bindings:[{name:'ROOMS',class_name:'MarsTestRoom'},{name:'CHAT',class_name:'GlobalChat'},{name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},{name:'INCOME',class_name:'GlobalIncome'}]},migrations:[{tag:'v1',new_sqlite_classes:['MarsTestRoom','GlobalChat','DriverProfile','RoomEconomy','GlobalIncome']}]}));
let child:ChildProcess|undefined;const sockets:WebSocket[]=[];
function start(){const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});c.stdout?.resume();c.stderr?.resume();return c;}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
async function post(path:string,value:unknown){const res=await fetch(base+'/__mars-test/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});assert.ok(res.ok);return res.json();}
try{
  child=start();await ready();
  const a=connect(`ws://127.0.0.1:${p}/api/room/mars-test`),b=connect(`ws://127.0.0.1:${p}/api/room/mars-test`);sockets.push(a.socket,b.socket);
  await until(()=>!!a.id()&&!!b.id()&&a.events.some(e=>e.type==='identityResult'&&e.ok)&&b.events.some(e=>e.type==='identityResult'&&e.ok)&&a.world()?.players.length===2,'fixture guest players connected');
  const aCash=a.world()!.players.find(p=>p.id===a.id())!.delivery.cash;
  assert.equal(await post('credit',{id:'a',amount:600_000_000}),600_000_000);
  assert.equal(await post('credit',{id:'a',amount:600_000_000}),600_000_000,'repeated earnings do not count twice');
  assert.equal(await post('credit',{id:'b',amount:400_000_000}),1_000_000_000);
  await until(()=>a.world()?.mars.fund===1_000_000_000&&b.world()?.mars.fund===1_000_000_000,'global goal replicated');
  assert.equal(a.world()!.players.find(p=>p.id===a.id())!.delivery.cash,aCash,'goal progress does not spend cash');
  await post('place',{room:'mars-test',id:a.id(),side:-1});await post('place',{room:'mars-test',id:b.id(),side:1});
  a.socket.send(JSON.stringify({type:'mars',action:'board',requestId:3}));a.socket.send(JSON.stringify({type:'sync',token:103}));
  b.socket.send(JSON.stringify({type:'mars',action:'board',requestId:4}));b.socket.send(JSON.stringify({type:'sync',token:104}));
  await until(()=>a.events.some(e=>e.requestId===3&&e.ok)&&b.events.some(e=>e.requestId===4&&e.ok),'both players board');
  await until(()=>a.events.some(e=>e.sync===103)&&b.events.some(e=>e.sync===104),'boarding barriers');
  assert.ok(a.events.find(e=>e.sync===103)!.world!.players.find(p=>p.id===a.id())!.achievements.unlocked.includes('to-mars'));
  a.socket.close();b.socket.close();await delay(500);await stop(child);child=undefined;
  child=start();await ready();
  const restarted=connect(`ws://127.0.0.1:${p}/api/room/mars-test`),other=connect(`ws://127.0.0.1:${p}/api/room/mars-other`);sockets.push(restarted.socket,other.socket);
  await until(()=>restarted.world()?.mars.fund===1_000_000_000&&other.world()?.mars.fund===1_000_000_000,'global goal survives restart and is shared across rooms');
  console.log('PASS: idempotent global earnings, no cash debit, boarding barriers and global total survive restart. Local fixture supplies income and position.');
}finally{for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

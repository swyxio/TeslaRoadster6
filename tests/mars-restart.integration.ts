// Isolated local Wrangler; uses tests/fixtures/mars-worker.ts to supply endgame
// cash and positioning. Never contacts or alters the deployed game.
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
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid!,'SIGKILL');}catch{}}
}
type Event={type:string;id?:string;world?:World;requestId?:number;action?:string;ok?:boolean;amount?:number};
function connect(url:string){const socket=new WebSocket(url),events:Event[]=[];socket.onmessage=e=>events.push(JSON.parse(String(e.data)));return {socket,events,world:()=>events.filter(e=>e.type==='state').at(-1)?.world,id:()=>events.find(e=>e.type==='welcome')?.id};}
const dir=await mkdtemp(join(tmpdir(),'tesland-mars-'));
const p=await port(),base=`http://127.0.0.1:${p}`,url=`ws://127.0.0.1:${p}/api/room/mars-test`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-mars-test',main:resolve('tests/fixtures/mars-worker.ts'),compatibility_date:'2026-10-17',assets:{directory:resolve('dist'),binding:'ASSETS',run_worker_first:['/api/*']},durable_objects:{bindings:[{name:'ROOMS',class_name:'MarsTestRoom'},{name:'CHAT',class_name:'GlobalChat'}]},migrations:[{tag:'v1',new_sqlite_classes:['MarsTestRoom','GlobalChat']}]}));
let child:ChildProcess|undefined;const sockets:WebSocket[]=[];
function start(){
  const c=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],{cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  c.stdout?.resume();c.stderr?.resume();return c;
}
async function ready(){await until(async()=>{if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');try{return (await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}},'Wrangler startup');}
try{
  child=start();await ready();
  const a=connect(url),b=connect(url);sockets.push(a.socket,b.socket);
  await until(()=>!!a.id()&&!!b.id()&&a.world()?.players.length===2&&a.world()!.players.every(p=>p.delivery.cash===600_000_000),'fixture players connected');
  a.socket.send(JSON.stringify({type:'mars',action:'contribute',amount:500_000_000,requestId:1}));
  b.socket.send(JSON.stringify({type:'mars',action:'contribute',amount:500_000_000,requestId:2}));
  await until(()=>a.events.some(e=>e.requestId===1&&e.ok)&&b.events.some(e=>e.requestId===2&&e.ok)&&a.world()?.mars.fund===1_000_000_000&&b.world()?.mars.fund===1_000_000_000,'concurrent contributions saved and replicated');
  await until(()=>a.world()!.players.every(p=>p.delivery.cash===100_000_000),'cash debited exactly once');
  await delay(500);
  a.socket.send(JSON.stringify({type:'mars',action:'board',requestId:3}));b.socket.send(JSON.stringify({type:'mars',action:'board',requestId:4}));
  await until(()=>a.events.some(e=>e.requestId===3&&e.ok)&&b.events.some(e=>e.requestId===4&&e.ok),'both players board');
  await until(()=>a.world()!.players.every(p=>p.achievements.unlocked.includes('to-mars')),'both achievements replicated');
  a.socket.close();b.socket.close();await delay(500);
  const again=connect(url);sockets.push(again.socket);
  await until(()=>again.world()?.mars.fund===1_000_000_000,'fund survives last disconnect');
  assert.ok(!again.world()!.players[0].achievements.unlocked.includes('to-mars'),'personal achievement is session-only');
  await stop(child);child=undefined;
  child=start();await ready();
  const restarted=connect(url);sockets.push(restarted.socket);
  await until(()=>restarted.world()?.mars.fund===1_000_000_000,'fund survives Wrangler restart');
  const other=connect(`ws://127.0.0.1:${p}/api/room/mars-other`);sockets.push(other.socket);
  await until(()=>other.world()?.mars.fund===0,'another room has an independent fund');
  console.log('PASS: two concurrent real room contributions and boarding; fund survives last disconnect and Wrangler restart, and rooms are isolated. Test fixture grants cash and positions.');
} finally{
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
  if(child)await stop(child);await rm(dir,{recursive:true,force:true});
}

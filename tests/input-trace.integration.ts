// One real Session and one local Wrangler room, with controlled delays only.
// Run: pnpm exec tsx tests/input-trace.integration.ts
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Session } from '../src/session';
import { NEUTRAL } from '../shared/game';

type ClientInput={seq:number;targetTick:number;lastSnapshotTick:number;lastSnapshotAt:number;generatedAt:number;forwardedAt?:number;bufferedAmount:number};
type Trace={events:Array<Record<string,any>>;dropped:number};
const NativeSocket=globalThis.WebSocket;
const originals={WebSocket:globalThis.WebSocket,window:globalThis.window,location:globalThis.location};
let wireTick=-1,deliveredTick=-1,holdIncoming=false,holdNextInput=false,badEpochNext=false,futureNext=false;
let deliveredAt=0,clientDropped=0;
const heldIncoming:MessageEvent[]=[];
const sent:ClientInput[]=[];
const clientEvents:Array<Record<string,unknown>>=[];
function recordClient(event:Record<string,unknown>){if(clientEvents.length===512){clientEvents.shift();clientDropped++;}clientEvents.push(event);}
let heldInput:{data:string;sample:ClientInput}|null=null;
class Socket {
  static OPEN=1;
  static last:Socket;
  private socket:WebSocket;
  onmessage?: (event:MessageEvent)=>void;
  onclose?: (event:CloseEvent)=>void;
  onerror?: (event:Event)=>void;
  constructor(url:string){
    Socket.last=this;this.socket=new NativeSocket(url);
    this.socket.onmessage=event=>{
      const message=JSON.parse(String(event.data));
      if(message.type==='state'){wireTick=message.tick;recordClient({kind:'snapshot-wire',tick:wireTick,at:performance.now()});}
      if(holdIncoming){if(heldIncoming.length>=64)throw new Error('Incoming fixture queue overflow');heldIncoming.push(event);}
      else this.deliver(event);
    };
    this.socket.onclose=event=>this.onclose?.(event);this.socket.onerror=event=>this.onerror?.(event);
  }
  private deliver(event:MessageEvent){
    const message=JSON.parse(String(event.data));
    if(message.type==='state'){deliveredTick=message.tick;deliveredAt=performance.now();recordClient({kind:'snapshot-delivered',tick:deliveredTick,at:deliveredAt});}
    if(message.type==='inputEdge')recordClient({kind:'edge-delivered',at:performance.now(),edgeKind:message.kind,id:message.id,targetTick:message.targetTick,status:message.status});
    this.onmessage?.(event);
  }
  releaseIncoming(){holdIncoming=false;for(const event of heldIncoming.splice(0))this.deliver(event);}
  releaseInput(){assert.ok(heldInput);const {data,sample}=heldInput;heldInput=null;sample.forwardedAt=performance.now();recordClient({kind:'input-forwarded',seq:sample.seq,at:sample.forwardedAt});this.socket.send(data);}
  get readyState(){return this.socket.readyState;}
  send(data:string){
    const message=JSON.parse(data);
    if(message.type==='input'){
      if(badEpochNext){badEpochNext=false;message.roomEpoch='00000000-0000-4000-8000-000000000000';data=JSON.stringify(message);}
      if(futureNext){futureNext=false;message.targetTick+=100;data=JSON.stringify(message);}
      const sample:ClientInput={seq:message.seq,targetTick:message.targetTick,lastSnapshotTick:deliveredTick,lastSnapshotAt:deliveredAt,
        generatedAt:performance.now(),bufferedAmount:this.socket.bufferedAmount};sent.push(sample);
      recordClient({kind:'input-generated',...sample});
      if(holdNextInput){assert.equal(heldInput,null);holdNextInput=false;heldInput={data,sample};return;}
      sample.forwardedAt=performance.now();recordClient({kind:'input-forwarded',seq:sample.seq,at:sample.forwardedAt});
    }
    this.socket.send(data);
  }
  close(){this.socket.close();}
}
const portServer=createServer();await new Promise<void>(done=>portServer.listen(0,'127.0.0.1',done));
const port=(portServer.address() as {port:number}).port;await new Promise<void>(done=>portServer.close(()=>done()));
const dir=await mkdtemp(join(tmpdir(),'tesland-input-trace-')),config=join(dir,'wrangler.json'),base=`http://127.0.0.1:${port}`;
await writeFile(config,JSON.stringify({name:'local-input-trace',main:resolve('tests/fixtures/input-trace-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'}]},migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']}]}));
const child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1',
  '--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
  {detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-12000);});
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=10000){
  const start=performance.now();while(performance.now()-start<timeout){if(await check())return;await sleep(20);}throw new Error(`${label}\n${logs}`);
}
async function trace():Promise<Trace>{const response=await fetch(base+'/__trace');assert.ok(response.ok);return response.json() as Promise<Trace>;}
async function receipt(seq:number){let result:Record<string,any>|undefined;
  await until(async()=>{result=(await trace()).events.find(event=>event.kind==='receipt'&&event.seq===seq&&event.schedulerCalled);return !!result;},`input ${seq} receipt`);
  return result!;
}
const session=new Session();
try{
  await until(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},'Wrangler startup',60000);
  Object.assign(globalThis,{WebSocket:Socket,window:globalThis,location:{protocol:'http:',host:`127.0.0.1:${port}`}});
  session.join('sandbox-trace','Trace');await until(()=>session.status==='online'&&deliveredTick>=0,'Session online');
  // Normal input and a real queued jump, observing the edge after physics.
  session.queueEdge('jump',1);session.tick(.05,{...NEUTRAL,throttle:1,jump:1});
  await until(()=>sent.length===1,'first command');const normal=sent.at(-1)!,normalReceipt=await receipt(normal.seq);
  assert.equal(normalReceipt.result,'accepted');assert.ok(normalReceipt.jump.pending.some((edge:{id:number})=>edge.id===1));
  await until(async()=>(await trace()).events.some(event=>event.kind==='edge-send'&&event.edge.kind==='jump'&&event.edge.id===1&&event.edge.status==='processed'),'jump processed');

  // Hold all incoming frames in FIFO order, not only snapshots.
  await sleep(30);holdIncoming=true;const frozen=deliveredTick;
  await until(()=>wireTick>=frozen+4,'delayed snapshot advances');
  if(performance.now()-deliveredAt>=450)throw new Error('Held snapshots became too old to exercise a fresh Session command');
  session.tick(.05,{...NEUTRAL,throttle:0,steer:1,jump:1});
  await until(()=>sent.length===2,'stale-snapshot command');const stale=sent.at(-1)!,staleReceipt=await receipt(stale.seq);
  assert.equal(stale.lastSnapshotTick,frozen);assert.ok(staleReceipt.receiptTick-frozen>=4);
  Socket.last.releaseIncoming();await until(()=>deliveredTick>=wireTick-2,'deliver buffered snapshots');

  // Delay one real queued flip on the uplink until its target has passed.
  await sleep(30);holdNextInput=true;session.queueEdge('flip',1);session.tick(.05,{...NEUTRAL,throttle:1,jump:1,flip:1});
  await until(()=>heldInput!==null,'queued flip');const uplink=sent.at(-1)!;
  await until(()=>wireTick>=uplink.targetTick,'target passes during held uplink');Socket.last.releaseInput();
  const uplinkReceipt=await receipt(uplink.seq);assert.equal(uplinkReceipt.result,'late');
  await until(async()=>(await trace()).events.some(event=>event.kind==='edge-send'&&event.edge.kind==='flip'&&event.edge.id===1&&['rescheduled','expired','processed'].includes(event.edge.status)),'flip outcome');
  if(uplinkReceipt.flip.pending.some((edge:{id:number})=>edge.id===1))
    await until(async()=>(await trace()).events.some(event=>event.kind==='edge-send'&&event.edge.kind==='flip'&&event.edge.id===1&&event.edge.status==='processed'),'rescheduled flip processed');

  // Fixture-only delay after callback entry, while no later input is sent.
  assert.ok((await fetch(base+'/__hold',{method:'POST'})).ok);
  const previous=deliveredTick;await until(()=>deliveredTick>previous,'fresh snapshot before dispatch delay');
  session.tick(.05,{...NEUTRAL,throttle:-1,jump:1,flip:1});
  await until(()=>sent.length===4,'dispatch-delay command');const dispatch=sent.at(-1)!;
  let dispatchEntry:Record<string,any>|undefined;
  await until(async()=>{dispatchEntry=(await trace()).events.find(event=>event.kind==='receipt'&&event.seq===dispatch.seq);return !!dispatchEntry;},'dispatch callback entry');
  if(dispatchEntry!.entryTick>=dispatch.targetTick)throw new Error('Command was already late at callback entry; cannot isolate fixture dispatch delay');
  await sleep(30);session.tick(.05,{...NEUTRAL,throttle:-1,steer:1,jump:1,flip:1});
  await until(()=>sent.length===5,'input queued behind dispatch');const behind=sent.at(-1)!;
  await until(async()=>(await trace()).events.some(event=>event.kind==='receipt'&&event.seq===behind.seq&&!event.schedulerCalled),'second callback held');
  await until(()=>wireTick>=dispatch.targetTick,'target passes during held dispatch');
  assert.ok((await fetch(base+'/__release',{method:'POST'})).ok);const dispatchReceipt=await receipt(dispatch.seq);
  assert.ok(dispatchReceipt.receiptTick>dispatchReceipt.entryTick,'room advanced while fixture held dispatch');
  assert.equal(dispatchReceipt.result,'late');
  assert.equal(dispatchReceipt.receivedSeq,dispatch.seq);
  const behindReceipt=await receipt(behind.seq);assert.equal(behindReceipt.receivedSeq,behind.seq);

  // The scheduler also rejects future targets; an epoch rejection bypasses it.
  await sleep(30);futureNext=true;session.tick(.05,{...NEUTRAL,steer:-1,jump:1,flip:1});
  await until(()=>sent.length===6,'future command');const future=sent.at(-1)!,futureReceipt=await receipt(future.seq);
  assert.equal(futureReceipt.result,'future');assert.equal(futureReceipt.receivedSeq,future.seq);
  await sleep(30);badEpochNext=true;session.tick(.05,{...NEUTRAL,steer:1,jump:1,flip:1});
  await until(()=>sent.length===7,'wrong-epoch command');const epoch=sent.at(-1)!;
  let epochReceipt:Record<string,any>|undefined;
  await until(async()=>{epochReceipt=(await trace()).events.find(event=>event.kind==='receipt'&&event.seq===epoch.seq&&event.rejection==='epoch');return !!epochReceipt;},'epoch rejection');
  assert.equal(epochReceipt!.schedulerCalled,false);
  const result=await trace();assert.equal(result.dropped,0);assert.equal(clientDropped,0);assert.ok(result.events.some(event=>event.kind==='snapshot-send'));
  const edges=result.events.filter(event=>event.kind==='edge-send').map(event=>event.edge);
  const summary={normal:{client:normal,server:normalReceipt},staleSnapshot:{client:stale,server:staleReceipt},
    delayedUplink:{client:uplink,server:uplinkReceipt},delayedDispatch:{client:dispatch,server:dispatchReceipt},
    behindDispatch:{client:behind,server:behindReceipt},
    future:{client:future,server:futureReceipt},epoch:{client:epoch,server:epochReceipt},edges,trace:result,
    clientTrace:{events:clientEvents,dropped:clientDropped}};
  console.log(JSON.stringify(summary,null,2));
  console.error('PASS: real Session and room trace distinguish the injected delays; not a load or production measurement.');
}finally{
  session.disconnect();Object.assign(globalThis,originals);
  try{process.kill(-child.pid!,'SIGTERM');}catch{/* already exited */}
  await new Promise<void>(done=>{if(child.exitCode!==null||child.signalCode!==null)return done();child.once('exit',()=>done());});
  await rm(dir,{recursive:true,force:true});
}

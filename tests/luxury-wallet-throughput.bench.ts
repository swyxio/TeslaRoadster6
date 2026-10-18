// Local-only, bounded 5-client / 60-second active-wallet measurement.
// Start the test fixture described in tests/fixtures/README-luxury-wallet.md.
// pnpm exec tsx tests/luxury-wallet-throughput.bench.ts http://127.0.0.1:8797 /tmp/tesland-wallet-throughput.json
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {cpus,loadavg} from 'node:os';
import {resolve} from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {NEUTRAL,PROTOCOL_VERSION} from '../shared/game';
import {RoomInputClient} from './room-input-client';

const base=new URL(process.argv[2]??'http://127.0.0.1:8797');
if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Use an isolated local fixture only');
const output=resolve(process.argv[3]??`/tmp/tesland-wallet-throughput-${Date.now()}.json`);
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirtyWorktree=execFileSync('git',['status','--porcelain=v1'],{encoding:'utf8'}).trim().length>0;
const room=`throughput-${randomUUID().slice(0,8)}`,sockets:WebSocket[]=[];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string,timeout=20_000){
  const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await sleep(25);}throw new Error(`Timed out: ${label}`);
}
async function rpc<T>(route:string,body:object):Promise<T>{
  const response=await fetch(new URL(`/__wallet-test/${route}`,base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`Fixture ${route}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
type Message={type:string;[key:string]:any};
type InputTrace={sequence:number;sentMs:number;ackMs?:number;latencyMs?:number};
type SnapshotTrace={atMs:number;worldTime:number;appliedSeq:number;decodedBytes:number};
type ActionTrace={driver:number;requestId:number;choice:string;sentMs:number;resultMs?:number;ok?:boolean};
type Phase={start:number;end?:number;inputs:InputTrace[][];snapshots:SnapshotTrace[][];actions:ActionTrace[];missed:number};
type ServerSample={wallMs:number;worldSeconds:number;tickCount:number;players:number;ticksMs:number[];droppedTicks:number;maxQueue:number};
type Client={socket:WebSocket;input:RoomInputClient;messages:Message[];id:string;states:number;driverId?:string;pending:Map<number,{phase:Phase;trace:InputTrace}>};
let phase:Phase|undefined;
const clients:Client[]=[];
function connect(path:string):Client{
  const socket=new WebSocket(base.href.replace(/^http/,'ws').replace(/\/$/,'')+path);
  const client:Client={socket,input:new RoomInputClient(socket),messages:[],id:'',states:0,pending:new Map()};sockets.push(socket);
  socket.addEventListener('message',event=>{
    const raw=String(event.data),message=JSON.parse(raw) as Message,now=performance.now();
    client.input.observe(message);
    // Retain compact traces, not thousands of complete parsed world snapshots.
    if(message.type!=='state')client.messages.push(message);
    if(message.type==='welcome')client.id=message.id;
    if(message.type==='state'){
      client.states++;
      const index=clients.indexOf(client);
      const appliedSeq=message.control.appliedSeq as number;
      if(phase&&index>=0)phase.snapshots[index].push({atMs:now-phase.start,worldTime:message.world.time,appliedSeq,decodedBytes:Buffer.byteLength(raw)});
      for(const [seq,entry] of client.pending)if(appliedSeq>=seq){entry.trace.ackMs=now-entry.phase.start;entry.trace.latencyMs=entry.trace.ackMs-entry.trace.sentMs;client.pending.delete(seq);}
    }
    if(message.type==='vehicleStyleResult'&&activeData){
      const action=activeData.actions.find(item=>item.driver===clients.indexOf(client)&&item.requestId===message.requestId);
      if(action){action.ok=message.ok;action.resultMs=now-activeData.start;}
    }
  });
  return client;
}
function send(client:Client,value:object){if(client.socket.readyState!==WebSocket.OPEN)throw new Error('Client disconnected');client.socket.send(JSON.stringify(value));}
async function savedDriver(index:number){
  const chat=connect('/api/chat');
  await until(()=>chat.socket.readyState===WebSocket.OPEN,`chat ${index} opens`);
  send(chat,{type:'hello',name:`Throughput${index}-${randomUUID().slice(0,4)}`});
  await until(()=>chat.messages.some(message=>message.type==='ready'),`chat ${index} ready`);
  send(chat,{type:'save'});await until(()=>chat.messages.some(message=>message.type==='recovery'),`recovery ${index}`);
  const code=chat.messages.find(message=>message.type==='recovery')!.code as string,driverId=randomUUID(),fence=randomUUID();
  const association=await rpc<{walletId:string}|null>('associate',{driverId,code});
  assert.equal(association?.walletId,driverId);
  await rpc('acquire',{driverId,fence,room:'fixture'});
  const client=connect(`/api/room/${room}`);clients.push(client);
  await until(()=>client.id!==''&&client.messages.some(message=>message.type==='wallet'),`driver ${index} joins`);
  send(client,{type:'identity',code,requestId:1});
  await until(()=>client.messages.some(message=>message.type==='identityResult'&&message.requestId===1),`driver ${index} identity`);
  assert.equal(client.messages.find(message=>message.type==='identityResult'&&message.requestId===1)!.ok,true);
  const priorStates=client.states;await until(()=>client.states>priorStates,`driver ${index} post-recovery control snapshot`);
  await until(()=>client.input.ready,`driver ${index} control snapshot`);
  client.driverId=driverId;return client;
}
function newPhase():Phase{return {start:performance.now(),inputs:Array.from({length:5},()=>[]),snapshots:Array.from({length:5},()=>[]),actions:[],missed:0};}
const percentile=(values:number[],p:number)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];};
const distribution=(values:number[])=>({count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99),max:percentile(values,1)});
function summarize(data:Phase,server:ServerSample){
  const snapshots=data.snapshots.flatMap(items=>items.map((sample,index)=>index?sample.atMs-items[index-1].atMs:0).slice(1));
  const latencies=data.inputs.flat().flatMap(item=>item.latencyMs===undefined?[]:[item.latencyMs]);
  return {wallSeconds:server.wallMs/1000,worldSeconds:server.worldSeconds,worldRate:server.worldSeconds/(server.wallMs/1000),ticks:server.tickCount,
    tickMs:distribution(server.ticksMs),snapshotGapMs:distribution(snapshots),inputAckLatencyMs:distribution(latencies),
    decodedBytes:data.snapshots.flat().reduce((sum,item)=>sum+item.decodedBytes,0),maxQueue:server.maxQueue,droppedTickSamples:server.droppedTicks,
    sentInputs:data.inputs.reduce((sum,items)=>sum+items.length,0),unacknowledgedInputs:data.inputs.flat().filter(item=>item.ackMs===undefined).length,
    actionsAttempted:data.actions.length,actionsSucceeded:data.actions.filter(item=>item.ok).length,missedActions:data.missed};
}
const loop=monitorEventLoopDelay({resolution:20});let timer:ReturnType<typeof setInterval>|undefined;
let baselineData:Phase|undefined,activeData:Phase|undefined,baselineServer:ServerSample|undefined,activeServer:ServerSample|undefined;
try{
  const health=await (await fetch(new URL('/api/health',base))).json() as {version:number;capacity:number};
  assert.equal(health.version,PROTOCOL_VERSION);assert.ok(health.capacity>=5);
  for(let i=0;i<4;i++)await savedDriver(i);
  const observer=connect(`/api/room/${room}`);clients.push(observer);
  await until(()=>observer.id!==''&&observer.messages.some(message=>message.type==='wallet'),'observer joins');
  send(observer,{type:'identity',code:null,requestId:1});
  await until(()=>observer.messages.some(message=>message.type==='identityResult'&&message.requestId===1&&message.ok),'observer chooses guest');
  await until(()=>observer.input.ready,'observer control snapshot');
  for(let i=0;i<4;i++){
    const client=clients[i];await rpc('workshop',{room,playerId:client.id,shopIndex:[0,1,2,4][i]});
    await sleep(450);send(client,{type:'ota',enabled:true,requestId:2});
    await until(()=>client.messages.some(message=>message.type==='otaResult'&&message.requestId===2),`OTA ${i}`);
    assert.equal(client.messages.find(message=>message.type==='otaResult'&&message.requestId===2)!.ok,true);
  }
  const input={...NEUTRAL,brake:true};
  timer=setInterval(()=>{
    for(const [index,client] of clients.entries()){
      if(client.socket.readyState!==WebSocket.OPEN)continue;
      const now=performance.now(),seq=client.input.send(input);
      if(phase){const trace:InputTrace={sequence:seq,sentMs:now-phase.start};phase.inputs[index].push(trace);client.pending.set(seq,{phase,trace});}
    }
  },50);
  await sleep(5_000); // Input, saved wallets, OTA and startup awards settle.
  const loadBefore=loadavg();loop.enable();
  await rpc('measurement-start',{room});phase=baselineData=newPhase();
  await sleep(5_000);baselineData.end=performance.now()-baselineData.start;
  baselineServer=await rpc<ServerSample>('measurement-stop',{room});
  phase=undefined;await until(()=>clients.every(client=>client.pending.size===0),'baseline input acknowledgements');
  const commitBefore=await Promise.all(clients.slice(0,4).map(client=>rpc<{started:number}>('fault-state',{driverId:client.driverId})));
  loop.reset();await rpc('measurement-start',{room});phase=activeData=newPhase();
  const next=[250,1250,2250,3250],counts=[0,0,0,0];
  const actions=setInterval(()=>{
    const elapsed=performance.now()-activeData!.start;
    for(let i=0;i<4;i++)if(elapsed>=next[i]&&next[i]<60_000){
      if(elapsed-next[i]>1_000)activeData!.missed++;
      else{
        const choice=counts[i]++%2?'ember':'mint',requestId=1000+i*100+counts[i];
        if(clients[i].socket.readyState!==WebSocket.OPEN)activeData!.missed++;
        else{
          activeData!.actions.push({driver:i,requestId,choice,sentMs:elapsed});
          send(clients[i],{type:'vehicleStyle',category:'paint',choice,requestId});
        }
      }
      next[i]+=5_000;
    }
  },50);
  try{await sleep(60_000);}finally{clearInterval(actions);}
  activeData.end=performance.now()-activeData.start;
  activeServer=await rpc<ServerSample>('measurement-stop',{room});
  phase=undefined;clearInterval(timer);timer=undefined;
  let repliesDrained=true;
  try{await until(()=>clients.every(client=>client.pending.size===0)&&activeData!.actions.every(item=>item.ok!==undefined),'active input acknowledgements and purchase replies',15_000);}catch{repliesDrained=false;}
  loop.disable();
  let queuesDrained=true;
  try{await until(async()=>{const queues=await rpc<{queued:number;processing:boolean}[]>('queues',{room});return queues.every(item=>item.queued===0&&!item.processing);},'wallet queues drain',15_000);}catch{queuesDrained=false;}
  const commitAfter=await Promise.all(clients.slice(0,4).map(client=>rpc<{started:number}>('fault-state',{driverId:client.driverId})));
  const ledgerKeys=await rpc<string[]>('economy-keys',{room});
  const profileKeys=await Promise.all(clients.slice(0,4).map(client=>rpc<string[]>('profile-keys',{driverId:client.driverId})));
  const baseline=summarize(baselineData,baselineServer),active=summarize(activeData,activeServer);
  const results={timestamp:new Date().toISOString(),protocol:health.version,assumptions:{clients:5,activeDrivers:4,inputHz:20,baselineSeconds:5,activeSeconds:60,styleIntervalSeconds:5,OTA:'active; normal renewal is 120 simulated seconds',transport:'local Wrangler, same-host load generator and JSON decoding',tickTiming:'fixture measures synchronous production tick wall time',inputAck:'latency to a snapshot whose applied sequence reaches this frame; a later applied frame may have superseded it'},
    environment:{revision,dirtyWorktree,node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,loadBefore,loadAfter:loadavg(),clientEventLoopP95Ms:loop.percentile(95)/1e6,clientEventLoopMaxMs:loop.max/1e6},
    baseline,active,profileCommitAttempts:commitAfter.map((item,i)=>item.started-commitBefore[i].started),
    pendingLedgerKeys:ledgerKeys.filter(key=>/^(pending|unacked|cleanup|intent):/.test(key)).length,
    profileReceiptCounts:profileKeys.map(keys=>keys.filter(key=>key.startsWith('receipt:')).length),closed:clients.filter(client=>client.socket.readyState!==WebSocket.OPEN).length,inputRejections:clients.map(client=>client.input.rejectionCount),repliesDrained,queuesDrained,
    raw:{baseline:{server:baselineServer,inputs:baselineData.inputs,snapshots:baselineData.snapshots},active:{server:activeServer,inputs:activeData.inputs,snapshots:activeData.snapshots,actions:activeData.actions}}};
  await writeFile(output,JSON.stringify(results,null,2));
  console.log(JSON.stringify({artifact:output,baseline,active,profileCommitAttempts:results.profileCommitAttempts,pendingLedgerKeys:results.pendingLedgerKeys,profileReceiptCounts:results.profileReceiptCounts,closed:results.closed},null,2));
  assert.ok(activeServer.wallMs>=60_000&&active.worldSeconds>=57&&active.worldRate>=.95,'60-second simulation throughput gate');
  assert.ok(active.tickMs.p95!==null&&active.tickMs.p95<40,'tick p95 gate');
  assert.ok(repliesDrained&&queuesDrained&&active.maxQueue<32,'wallet work drains without reaching its queue limit');
  assert.equal(active.droppedTickSamples,0);assert.equal(active.unacknowledgedInputs,0);assert.equal(results.closed,0);assert.deepEqual(results.inputRejections,[0,0,0,0,0]);
  assert.equal(active.actionsAttempted,48);assert.equal(active.actionsSucceeded,48);assert.equal(active.missedActions,0);
  assert.equal(results.pendingLedgerKeys,0);assert.deepEqual(results.profileReceiptCounts,[0,0,0,0]);
}finally{
  phase=undefined;loop.disable();if(timer)clearInterval(timer);
  for(const socket of sockets)if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close();
}

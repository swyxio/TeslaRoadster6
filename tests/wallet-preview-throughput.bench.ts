// Measure an isolated preview using only the public room and chat protocols.
// pnpm exec tsx tests/wallet-preview-throughput.bench.ts <origin> <output.json> --confirm-isolated-preview
// Localhost may be used without the confirmation flag. Recovery codes stay in memory.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { NEUTRAL, PROTOCOL_VERSION } from '../shared/game';
import { Session } from '../src/session';

const supplied=process.argv[2],output=process.argv[3];
if(!supplied||!output)throw new Error('Supply an isolated origin and output file');
const origin=new URL(supplied);
const local=origin.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname);
const preview='https://codex-economy-stories-bay-drive.swyxio.workers.dev';
if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||
  (!local&&(origin.origin!==preview||!process.argv.includes('--confirm-isolated-preview'))))
  throw new Error('Use localhost or explicitly confirm the dedicated economy preview');
const healthResponse=await fetch(new URL('/api/health',origin));
if(!healthResponse.ok)throw new Error(`Health HTTP ${healthResponse.status}`);
const health=await healthResponse.json() as {ok:boolean;version:number;capacity:number};
assert.equal(health.ok,true);assert.equal(health.version,PROTOCOL_VERSION);assert.equal(health.capacity,8);

const nativeWebSocket=globalThis.WebSocket;
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const sockets:WebSocket[]=[];
const sessions:Session[]=[];
const room=`wallet-perf-${randomUUID().slice(0,8)}`;
type Sample={at:number;tick:number;world:number;players:number;bytes:number};
type Sent={seq:number;targetTick:number;at:number;ackAt?:number};
type Rejection={seq:number;targetTick:number;reason:string;sentAt:number|null;at:number};
type Close={at:number;code:number;reason:string};
type Purchase={driver:number;requestId:number;choice:string;sentAt:number;ok?:boolean;resultAt?:number};
type Slot={samples:Sample[];sent:Map<number,Sent>;pending:Map<number,Sent>;rejections:Rejection[];closed:Close[]};
const slots:Slot[]=Array.from({length:8},()=>({samples:[],sent:new Map(),pending:new Map(),rejections:[],closed:[]}));
const purchases:Purchase[]=[];
let measurementStart=Infinity,measurementEnd=Infinity,nextSlot=0;

async function until(check:()=>boolean,label:string,timeout=15_000):Promise<void>{
  const end=performance.now()+timeout;
  while(performance.now()<end){if(check())return;await delay(25);}
  throw new Error(`Timed out: ${label}`);
}
async function savedCode(index:number):Promise<string>{
  const url=new URL('/api/chat',origin);url.protocol=origin.protocol==='https:'?'wss:':'ws:';
  const socket=new nativeWebSocket(url);sockets.push(socket);
  let code:string|undefined,failed='';
  socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'hello',name:`WalletPerf-${index}-${room.slice(-6)}`})));
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.type==='ready')socket.send(JSON.stringify({type:'save'}));
    if(message.type==='recovery'&&typeof message.code==='string')code=message.code;
    if(message.type==='error')failed=String(message.message??'Chat error');
  });
  socket.addEventListener('close',()=>{if(!code)failed||='Chat disconnected';});
  await until(()=>!!code||!!failed,`saved driver ${index}`);
  if(failed||!code)throw new Error(`Saved driver ${index}: ${failed}`);
  return code;
}

// Capture wire outcomes around the actual Session and MotionClock, without
// recording identity messages or changing input scheduling.
class MonitoringWebSocket extends nativeWebSocket {
  private slot:number;
  constructor(url:string|URL,protocols?:string|string[]){
    super(url,protocols);this.slot=nextSlot++;
    if(this.slot>=slots.length)throw new Error('Unexpected extra room socket');
    const slot=slots[this.slot];sockets.push(this);
    this.addEventListener('message',event=>{
      const at=performance.now(),raw=String(event.data),message=JSON.parse(raw);
      if(message.type==='state'){
        for(const [seq,sent] of slot.pending)if(message.control.appliedSeq>=seq){sent.ackAt=at;slot.pending.delete(seq);}
        if(at>=measurementStart&&at<measurementEnd)
          slot.samples.push({at,tick:message.tick,world:message.world.time,players:message.world.players.length,bytes:Buffer.byteLength(raw)});
      }else if(message.type==='inputRejected'){
        slot.rejections.push({seq:message.seq,targetTick:message.targetTick,reason:message.reason,sentAt:slot.sent.get(message.seq)?.at??null,at});
      }else if(message.type==='vehicleStyleResult'){
        const purchase=purchases.find(item=>item.driver===this.slot&&item.requestId===message.requestId);
        if(purchase){purchase.ok=message.ok;purchase.resultAt=at;}
      }
    });
    this.addEventListener('close',event=>slot.closed.push({at:performance.now(),code:event.code,reason:event.reason}));
  }
  override send(data:string|ArrayBufferLike|Blob|ArrayBufferView):void {
    if(typeof data==='string'&&data.startsWith('{"type":"input"')){
      const message=JSON.parse(data),sent={seq:message.seq,targetTick:message.targetTick,at:performance.now()};
      slots[this.slot].sent.set(message.seq,sent);slots[this.slot].pending.set(message.seq,sent);
    }
    super.send(data);
  }
}
Object.defineProperty(globalThis,'WebSocket',{value:MonitoringWebSocket,configurable:true,writable:true});
Object.defineProperty(globalThis,'location',{value:origin,configurable:true});
Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});

const loop=monitorEventLoopDelay({resolution:20});
let frames:ReturnType<typeof setInterval>|undefined,actions:ReturnType<typeof setInterval>|undefined,frameFailure:unknown;
try{
  const codes=await Promise.all(Array.from({length:4},(_,i)=>savedCode(i)));
  for(let i=0;i<8;i++){
    const session=new Session();sessions.push(session);
    if(i<4)session.setIdentity(codes[i]);
    session.join(room,`WalletPerf ${i+1}`,'roadster');
  }
  let lastFrame=performance.now();
  frames=setInterval(()=>{
    try{
      const now=performance.now(),dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
      for(const [i,session] of sessions.entries()){
        session.tick(dt,{...NEUTRAL,throttle:.35,steer:Math.sin(i)*.2});
        if(session.status==='online'){
          // Presentation normally advances these clocks each frame.
          const clock=(session as any).clock,at=performance.now();
          clock.remote(at);clock.target(at);clock.estimate(at);clock.alpha(at);
        }
      }
    }catch(error){frameFailure=error;if(frames)clearInterval(frames);}
  },16);
  await until(()=>!!frameFailure||sessions.every((session,i)=>session.status==='online'&&(i>=4?session.identityResult?.ok:session.walletStatus==='ready')), 'all room identities');
  if(frameFailure)throw frameFailure;
  for(const session of sessions.slice(0,4))session.setOta(true);
  await until(()=>sessions.slice(0,4).every(session=>session.otaResult!==null),'OTA replies');
  assert.ok(sessions.slice(0,4).every(session=>session.otaResult?.ok));
  await until(()=>sessions.slice(0,4).every(session=>session.world.players.find(player=>player.id===session.id)?.delivery.ota.active),'committed OTA');
  await delay(2_000);
  if(frameFailure)throw frameFailure;
  const next=[250,1250,2250,3250],counts=[0,0,0,0];let missed=0;
  loop.enable();measurementStart=performance.now();const startedUtc=new Date().toISOString();
  actions=setInterval(()=>{
    const now=performance.now(),elapsed=now-measurementStart;
    for(let i=0;i<4;i++)if(elapsed>=next[i]&&next[i]<60_000){
      if(elapsed-next[i]>1_000)missed++;
      else{
        const choice=counts[i]++%2?'ember':'mint';
        const requestId=sessions[i].buyVehicleStyle({category:'paint',choice});
        purchases.push({driver:i,requestId,choice,sentAt:now});
      }
      next[i]+=5_000;
    }
  },50);
  await delay(60_000);measurementEnd=performance.now();const endedUtc=new Date().toISOString();
  clearInterval(actions);actions=undefined;
  let repliesDrained=true;
  try{await until(()=>purchases.every(item=>item.ok!==undefined),'purchase replies',10_000);}catch{repliesDrained=false;}
  await delay(1_000);loop.disable();
  if(frameFailure)throw frameFailure;
  const percentile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;};
  const gaps=slots.flatMap(slot=>slot.samples.slice(1).map((sample,i)=>sample.at-slot.samples[i].at));
  const clients=slots.map((slot,i)=>{
    const first=slot.samples[0],last=slot.samples.at(-1);
    const sent=[...slot.sent.values()].filter(item=>item.at>=measurementStart&&item.at<measurementEnd);
    return {client:i+1,role:i<4?'saved':'guest',snapshots:slot.samples.length,
      firstAtMs:first?first.at-measurementStart:null,lastAtMs:last?last.at-measurementStart:null,
      tickAdvance:first&&last?last.tick-first.tick:null,worldAdvance:first&&last?last.world-first.world:null,
      observedWorldRate:first&&last&&last.at>first.at?(last.world-first.world)*1000/(last.at-first.at):null,
      finalPlayerCount:last?.players??0,inputsSent:sent.length,unacknowledgedInputs:sent.filter(item=>item.ackAt===undefined).length,
      rejections:slot.rejections.filter(item=>item.sentAt!==null&&item.sentAt>=measurementStart&&item.sentAt<measurementEnd),
      closes:slot.closed.filter(item=>item.at<measurementEnd)};
  });
  const ackLatencies=slots.flatMap(slot=>[...slot.sent.values()].filter(item=>item.at>=measurementStart&&item.at<measurementEnd&&item.ackAt!==undefined).map(item=>item.ackAt!-item.at));
  const result={origin:origin.origin,room,health,startedUtc,endedUtc,elapsedSeconds:(measurementEnd-measurementStart)/1000,
    clientModel:'Eight real Session and MotionClock instances; frame-cadenced throttle 0.35 with fixed varied steering, no renderer.',
    assumptions:{savedDrivers:4,guestObservers:4,styleIntervalSeconds:5,ota:'active; 120 simulated second renewal',transport:'normal room and chat APIs',inputAck:'snapshot appliedSeq reaches this sequence; a later frame may have superseded it'},
    clients,minimumWorldAdvance:Math.min(...clients.map(client=>client.worldAdvance??0)),
    snapshotGapMs:{p50:percentile(gaps,.5),p95:percentile(gaps,.95),max:percentile(gaps,1)},
    inputAckLatencyMs:{count:ackLatencies.length,p50:percentile(ackLatencies,.5),p95:percentile(ackLatencies,.95),max:percentile(ackLatencies,1)},
    synchronousTickMs:'unavailable via normal room and chat APIs',
    decodedBytes:slots.flatMap(slot=>slot.samples).reduce((sum,sample)=>sum+sample.bytes,0),
    actions:{attempted:purchases.length,succeeded:purchases.filter(item=>item.ok===true).length,missing:purchases.filter(item=>item.ok===undefined).length,missed,repliesDrained,
      purchases:purchases.map(item=>({...item,sentAt:item.sentAt-measurementStart,...(item.resultAt===undefined?{}:{resultAt:item.resultAt-measurementStart})}))},
    inputRejections:clients.reduce((sum,client)=>sum+client.rejections.length,0),
    clientEventLoopP95Ms:loop.percentile(95)/1e6,clientEventLoopMaxMs:loop.max/1e6};
  await writeFile(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(result.elapsedSeconds<60||result.minimumWorldAdvance<57||result.inputRejections||missed||!repliesDrained||purchases.length!==48||purchases.some(item=>item.ok!==true)||clients.some(client=>client.closes.length||client.unacknowledgedInputs||client.finalPlayerCount!==8))
    process.exitCode=1;
}finally{
  if(actions)clearInterval(actions);if(frames)clearInterval(frames);loop.disable();
  for(const session of sessions)session.disconnect();
  for(const socket of sockets)if(socket.readyState===nativeWebSocket.OPEN||socket.readyState===nativeWebSocket.CONNECTING)socket.close();
}

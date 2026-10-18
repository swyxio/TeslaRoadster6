// One preview-only diagnostic using eight real Session instances.
// This file is copied into an isolated archive; it never modifies game source.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Session } from '../src/session';
import { NEUTRAL, PROTOCOL_VERSION } from '../shared/game';

const preview = __PREVIEW_ORIGIN__;
const supplied = process.argv[2];
if (supplied !== preview) throw new Error('Only the confirmed preview is allowed');
const healthResponse = await fetch(`${preview}/api/health`);
if (!healthResponse.ok) throw new Error(`Preview health HTTP ${healthResponse.status}`);
const health = await healthResponse.json() as {ok:boolean;version:number;capacity:number};
if (!health.ok || health.version !== PROTOCOL_VERSION || health.capacity !== 8)
  throw new Error(`Unexpected preview health: ${JSON.stringify(health)}`);

const room = `diag-${Date.now()}`;
console.error(`ROOM: ${room}`);
const sessions:Session[] = [];
let measurementStart = Infinity, measurementEnd = Infinity;
let timer:ReturnType<typeof setInterval>|undefined;
let frameFailure:unknown;
const eventLoop = monitorEventLoopDelay({resolution:20});
const delay = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));
const iso = (ms:number) => new Date(ms).toISOString();

type Sent = {seq:number;targetTick:number;lastSnapshotTick:number|null;sentMonotonicMs:number;sentUtc:string};
type Rejection = {client:number;reason:string;seq:number;targetTick:number;targetTickAtSend:number|null;lastSnapshotTickAtSend:number|null;
  lastSnapshotTickAtReceive:number|null;sentMonotonicMs:number|null;receivedMonotonicMs:number;
  sentUtc:string|null;receivedUtc:string};
type Slot = {socket?:WebSocket;lastSnapshotTick:number|null;lastSnapshotAt:number;lastMeasuredAt:number;
  snapshots:number;gaps:number[];bytes:number;firstTime:number|null;lastTime:number|null;lastPlayers:number;
  sent:Map<number,Sent>;rejections:Rejection[];closed:{code:number;reason:string;at:number}[]};
const slots:Slot[] = Array.from({length:8},()=>({lastSnapshotTick:null,lastSnapshotAt:0,lastMeasuredAt:0,
  snapshots:0,gaps:[],bytes:0,firstTime:null,lastTime:null,lastPlayers:0,sent:new Map(),rejections:[],closed:[]}));
const NativeWebSocket = globalThis.WebSocket;
let nextSlot=0;
class MonitoringWebSocket extends NativeWebSocket {
  private readonly slot:number;
  constructor(url:string | URL, protocols?:string|string[]) {
    super(url,protocols); this.slot=nextSlot++;
    if(this.slot>=8) {super.close(); throw new Error('Unexpected extra socket');}
    const slot=slots[this.slot]; slot.socket=this;
    this.addEventListener('message',event=>{
      const receivedAt=performance.now(),raw=String(event.data);
      if(raw.startsWith('{"type":"inputRejected"')){
        const message=JSON.parse(raw) as {seq:number;targetTick:number;reason:string};
        const sent=slot.sent.get(message.seq);
        slot.rejections.push({client:this.slot+1,reason:message.reason,seq:message.seq,targetTick:message.targetTick,targetTickAtSend:sent?.targetTick??null,
          lastSnapshotTickAtSend:sent?.lastSnapshotTick??null,lastSnapshotTickAtReceive:slot.lastSnapshotTick,
          sentMonotonicMs:sent?.sentMonotonicMs??null,receivedMonotonicMs:receivedAt,
          sentUtc:sent?.sentUtc??null,receivedUtc:iso(Date.now())});
      } else if(raw.startsWith('{"type":"state"') && receivedAt>=measurementStart && receivedAt<measurementEnd) {
        slot.bytes+=Buffer.byteLength(raw);
        // Session's message handler updates world later in this same event dispatch.
        queueMicrotask(()=>{
          const world=sessions[this.slot]?.world;
          if(!world)return;
          slot.firstTime??=world.time;slot.lastTime=world.time;slot.lastPlayers=world.players.length;
        });
      }
    });
    this.addEventListener('close',event=>slot.closed.push({code:event.code,reason:event.reason,at:performance.now()}));
  }
  override send(data:string | ArrayBufferLike | Blob | ArrayBufferView):void {
    if(typeof data==='string' && data.startsWith('{"type":"input"')){
      const value=JSON.parse(data) as {seq:number;targetTick:number};
      const slot=slots[this.slot];
      slot.sent.set(value.seq,{seq:value.seq,targetTick:value.targetTick,lastSnapshotTick:slot.lastSnapshotTick,
        sentMonotonicMs:performance.now(),sentUtc:iso(Date.now())});
    }
    super.send(data);
  }
}
Object.defineProperty(globalThis,'WebSocket',{value:MonitoringWebSocket,configurable:true,writable:true});
Object.defineProperty(globalThis,'location',{value:new URL(preview),configurable:true});
Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});

try {
  for(let i=0;i<8;i++){
    const session=new Session();sessions.push(session);
    // Observe the actual clock without changing its return value or input decisions.
    const clock=(session as any).clock;
    const originalObserve=clock.observe.bind(clock);
    clock.observe=(tick:number,at:number):boolean=>{
      const valid=originalObserve(tick,at);
      if(valid){
        const slot=slots[i];slot.lastSnapshotTick=tick;slot.lastSnapshotAt=at;
        if(at>=measurementStart&&at<measurementEnd){
          if(slot.lastMeasuredAt)slot.gaps.push(at-slot.lastMeasuredAt);
          slot.lastMeasuredAt=at;slot.snapshots++;
        }
      }
      return valid;
    };
    session.join(room,`Diagnostic ${i+1}`,'roadster');
  }
  let lastFrame=performance.now();
  timer=setInterval(()=>{
    try {
      const now=performance.now(),dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
      for(let i=0;i<sessions.length;i++){
        const session=sessions[i];session.tick(dt,{...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2});
        if(session.status==='online'){
          // Session.renderWorld normally calls these clock methods each frame.
          // Exercise the same clock progression without prediction or a renderer.
          const clock=(session as any).clock,at=performance.now();
          clock.remote(at);clock.target(at);clock.estimate(at);clock.alpha(at);
        }
      }
    } catch(error){frameFailure=error;clearInterval(timer);}
  },16);
  const connectDeadline=performance.now()+10000;
  while(sessions.some(session=>session.status!=='online') && performance.now()<connectDeadline && !frameFailure)await delay(25);
  if(frameFailure)throw frameFailure;
  if(sessions.some(session=>session.status!=='online'))throw new Error(`Not all sessions became online: ${sessions.map(s=>s.status).join(',')}`);
  await delay(2000);
  if(frameFailure)throw frameFailure;
  eventLoop.enable();measurementStart=performance.now();const startedUtc=iso(Date.now());
  await delay(20000);
  measurementEnd=performance.now();const endedUtc=iso(Date.now());eventLoop.disable();clearInterval(timer);timer=undefined;
  if(frameFailure)throw frameFailure;
  const onlineAtEnd=sessions.filter(session=>session.status==='online').length;
  const clientsWithAppliedInput=sessions.filter(session=>((session as any).prediction.control?.appliedSeq??0)>0).length;
  // Drain outstanding responses without sending new controls so rejections can
  // be attributed both to their receive window and their original send window.
  await delay(1000);
  const phase=(at:number|null):'warmup'|'measured'|'drain'|'unknown'=>at===null?'unknown':at<measurementStart?'warmup':at<measurementEnd?'measured':'drain';
  const rejections=slots.flatMap(slot=>slot.rejections).map(item=>({...item,sendPhase:phase(item.sentMonotonicMs),receivePhase:phase(item.receivedMonotonicMs)}));
  const by=(phaseKey:'sendPhase'|'receivePhase',window:'warmup'|'measured'|'drain'|'unknown')=>{
    const counts:Record<string,number>={};for(const item of rejections)if(item[phaseKey]===window)counts[item.reason]=(counts[item.reason]??0)+1;return counts;
  };
  const sentCounts={warmup:0,measured:0,drain:0,unknown:0};
  for(const slot of slots)for(const sent of slot.sent.values())sentCounts[phase(sent.sentMonotonicMs)]++;
  const gaps=slots.flatMap(slot=>slot.gaps).sort((a,b)=>a-b);
  const advances=slots.map(slot=>slot.firstTime===null||slot.lastTime===null?0:slot.lastTime-slot.firstTime).sort((a,b)=>a-b);
  const result={preview,room,health,startedUtc,endedUtc,elapsedSeconds:+((measurementEnd-measurementStart)/1000).toFixed(3),
    clientModel:'Eight real Session instances, MotionClock, frame-cadenced tick and clock sampling; no renderer or prediction render.',
    clients:8,onlineAtEnd,
    clientsSeeingAll:slots.filter(slot=>slot.lastPlayers===8).length,
    clientsWithAppliedInput,
    closeEventsBeforeEnd:slots.flatMap(slot=>slot.closed).filter(event=>event.at<measurementEnd),
    inputsSent:sentCounts,rejectionsByReceiveWindow:{warmup:by('receivePhase','warmup'),measured:by('receivePhase','measured'),drain:by('receivePhase','drain')},
    rejectionsBySendWindow:{warmup:by('sendPhase','warmup'),measured:by('sendPhase','measured'),drain:by('sendPhase','drain'),unknown:by('sendPhase','unknown')},
    rejections,snapshots:slots.reduce((total,slot)=>total+slot.snapshots,0),minSnapshots:Math.min(...slots.map(slot=>slot.snapshots)),
    minSimulatedSeconds:+advances[0].toFixed(2),medianSimulatedSeconds:+advances[4].toFixed(2),
    p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),
    decodedJsonMiB:+(slots.reduce((total,slot)=>total+slot.bytes,0)/1048576).toFixed(2),
    clientEventLoopP95Ms:+(eventLoop.percentile(95)/1e6).toFixed(1),
    note:'One synthetic preview room; clock calls approximate frame presentation without rendering. No production, sustained-capacity, browser-rendering or physical-device claim.'};
  console.log(JSON.stringify(result,null,2));
} finally {
  if(timer)clearInterval(timer);eventLoop.disable();
  for(const session of sessions)session.disconnect();
}

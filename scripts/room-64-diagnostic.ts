// Four Actions runners each use 16 real Sessions in one disposable preview room.
// The test is bounded and intentionally cannot target production or arbitrary URLs.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { Session } from '../src/session';
import { NEUTRAL, PROTOCOL_VERSION } from '../shared/game';
import { FUTURE_TICKS } from '../shared/tick-input';
import { movementTracker, newAckObservations, observeAcks, type SentInput } from './room-64-observations';
import { corridors, alignControl, driveControl, safelyStaged, yawError } from './room-64-corridors';
import { verifyInvocation } from './room-64-target.mjs';

verifyInvocation(process.env, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')));
const preview = process.env.TARGET_PREVIEW_URL ?? '';
const candidateSha = process.env.TARGET_SOURCE_SHA ?? '';
const group = Number(process.env.CAPACITY_GROUP);
const runId = process.env.GITHUB_RUN_ID ?? '';
const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '';
const runnerTemp = process.env.RUNNER_TEMP ?? '';
const approvedTarget=JSON.parse(readFileSync('scripts/room-64-target.json','utf8')) as {approved?:boolean;sha?:string;baseSha?:string;preview?:string;protocol?:number};
if (!/^https:\/\/[0-9a-f]{8}-bay-drive\.swyxio\.workers\.dev$/.test(preview) ||
    !/^[0-9a-f]{40}$/.test(candidateSha) || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==candidateSha ||
    !Number.isInteger(group) || group < 1 || group > 4 ||
    !/^\d{1,20}$/.test(runId) || !/^\d{1,4}$/.test(attempt) || !runnerTemp ||
    approvedTarget.approved!==true ||
    approvedTarget.sha!==candidateSha || !/^[0-9a-f]{40}$/.test(approvedTarget.baseSha??'') ||
    approvedTarget.preview!==preview || approvedTarget.protocol!==PROTOCOL_VERSION) {
  throw new Error('Only the four Actions jobs on the diagnostic branch may test the pinned PR preview');
}
const room = `sandbox-d${runId}-${attempt}`;
if (room.length > 32) throw new Error('Diagnostic room name is too long');
const socketUrl = `wss://${new URL(preview).host}/api/room/${room}`;
const markers = [1, 2, 3, 4].map(i => `probe-ready-${i}`);
const sourceFiles = [
  'scripts/room-64-diagnostic.ts', 'scripts/room-64-observations.ts', 'scripts/room-64-corridors.ts', 'scripts/room-64-target.mjs', 'scripts/room-64-target.json',
  'src/session.ts', 'src/motion-clock.ts', 'src/tick-prediction.ts',
  'worker/index.ts', 'worker/snapshot.ts', 'shared/tick-input.ts', 'wrangler.jsonc',
];
const sourceSha256 = Object.fromEntries(sourceFiles.map(path =>
  [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const outputDir = join(runnerTemp, 'capacity-preview-diagnostic');
const sessions:Session[] = [];
const loop = monitorEventLoopDelay({resolution:20});
const loadSamples:{utc:string;load:number[];cpuMicros:NodeJS.CpuUsage}[] = [];
const iso = () => new Date().toISOString();
const delay = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));
const deadline = performance.now() + 300_000;
let measurementStart = Infinity, measurementEnd = Infinity;
let startedUtc:string|null = null, endedUtc:string|null = null;
let barrierTick:number|null = null, targetTick:number|null = null;
let markedReady = false, saw64 = false, stopping = false;
let failure:string|null = null, highestTick = -1, lastProgressAt = performance.now();
let timer:ReturnType<typeof setInterval>|undefined;
let health:unknown = null;
let healthHeaders:Record<string,string|null> = {};
let extraClose:{code:number;reason:string}|null=null;

type Rejection = {client:number;reason:string;seq:number;targetTick:number;sentAt:number|null;sentUtc:string|null;
  receivedAt:number;receivedUtc:string;lastTickAtSend:number|null;lastTickAtReceive:number|null};
type Slot = {socket?:WebSocket;lastTick:number|null;lastMeasuredAt:number;snapshots:number;gaps:number[];bytes:number;
  firstTime:number|null;lastTime:number|null;firstTick:number|null;lastMeasuredTick:number|null;lastPlayers:number;
  sent:Map<number,SentInput>;sentCounts:Record<string,number>;sentDropped:number;rejections:Rejection[];
  closed:{code:number;reason:string;wasClean:boolean;utc:string;phase:string}[];
  movement:ReturnType<typeof movementTracker>;ack:ReturnType<typeof newAckObservations>;
  firstSnapshot:{elapsedMs:number;tick:number;worldTime:number}|null;lastSnapshot:{elapsedMs:number;tick:number;worldTime:number}|null;
  queues:{samples:number;levels:number;jump:number;flip:number;historySamples:number;history:number;historyOverflow:boolean;bufferedBytes:number};damage:boolean;impulse:boolean;initialHealth:number|null;
  maxLaneDeviation:number;leftCorridor:boolean};
const slots:Slot[] = Array.from({length:16},()=>({lastTick:null,lastMeasuredAt:0,snapshots:0,gaps:[],bytes:0,
  firstTime:null,lastTime:null,firstTick:null,lastMeasuredTick:null,lastPlayers:0,sent:new Map(),
  sentCounts:{warmup:0,measured:0,drain:0,unknown:0},sentDropped:0,rejections:[],closed:[],movement:movementTracker(60_000),
  ack:newAckObservations(),firstSnapshot:null,lastSnapshot:null,queues:{samples:0,levels:0,jump:0,flip:0,historySamples:0,history:0,historyOverflow:false,bufferedBytes:0},
  damage:false,impulse:false,initialHealth:null,maxLaneDeviation:0,leftCorridor:false}));
const stageMode:('idle'|'align')[] = Array(16).fill('idle');
let lanes:ReturnType<typeof corridors> = [];
const laneFor = (i:number) => lanes[(group-1)*16+i];
const carFor = (i:number) => {
  const session=sessions[i], player=session.world.players.find(p=>p.id===session.id);
  return session.world.entities.find(e=>e.id===player?.entityId&&e.driver===session.id)??null;
};
const fail = (reason:string) => { failure ??= reason; };
const interrupt = () => fail('Interrupted by the runner');
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);

// One parser remains in Session; this observer only parses small rejection and
// outgoing input frames. State metadata is read after Session handles each event.
const NativeWebSocket = globalThis.WebSocket;
let nextSlot = 0;
class MonitoringWebSocket extends NativeWebSocket {
  private readonly index:number;
  constructor(url:string | URL, protocols?:string|string[]) {
    if (String(url) !== socketUrl) throw new Error('Unexpected WebSocket target');
    super(url,protocols);
    this.index = nextSlot++;
    if (this.index >= 16) { super.close(); throw new Error('Unexpected extra socket'); }
    const slot = slots[this.index];
    slot.socket = this;
    this.addEventListener('message',event=>{
      const receivedAt = performance.now(), raw = String(event.data);
      if (raw.startsWith('{"type":"inputRejected"')) {
        const message = JSON.parse(raw) as {seq:number;targetTick:number;reason:string};
        const sent = slot.sent.get(message.seq);
        slot.rejections.push({client:(group-1)*16+this.index+1,reason:message.reason,seq:message.seq,targetTick:message.targetTick,
          sentAt:sent?.at??null,sentUtc:sent?.utc??null,receivedAt,receivedUtc:iso(),
          lastTickAtSend:sent?.lastSnapshotTick??null,lastTickAtReceive:slot.lastTick});
      } else if (raw.startsWith('{"type":"state"')) {
        const bytes = Buffer.byteLength(raw);
        queueMicrotask(()=>{
          try {
            const world = sessions[this.index]?.world, tick = slot.lastTick;
            if (!world || tick === null) return;
            const prediction = (sessions[this.index] as any).prediction;
            const control = prediction?.control;
            if (control) observeAcks(slot.ack,slot.sent,control.receivedSeq,control.appliedSeq,receivedAt,measurementStart,measurementEnd);
            if (world.players.length === 64) saw64 = true;
            if (markedReady && world.players.length !== 64) fail(`Room no longer has 64 players: ${world.players.length}`);
            if (this.index === 0 && markedReady && barrierTick === null && world.players.length === 64 &&
                markers.every(marker=>world.players.some(player=>player.name===marker))) {
              // All 64 have joined and all four runners have declared their 16
              // sessions ready. Every socket sees this same first complete state.
              barrierTick = tick;
              targetTick = tick + 200; // Ten simulation seconds of moving warm-up.
            }
            if (this.index === 0 && targetTick !== null && measurementStart === Infinity && tick >= targetTick) {
              if (tick !== targetTick) { fail(`Missed start tick ${targetTick}; saw ${tick}`); return; }
              measurementStart = performance.now(); measurementEnd = measurementStart + 60_000;
              startedUtc = iso(); lastProgressAt = measurementStart; loop.enable();
            }
            if (receivedAt >= measurementStart && receivedAt < measurementEnd) {
              if (slot.lastMeasuredAt) slot.gaps.push(receivedAt-slot.lastMeasuredAt);
              slot.lastMeasuredAt = receivedAt; slot.snapshots++; slot.bytes += bytes;
              slot.firstTime ??= world.time; slot.lastTime = world.time;
              slot.firstTick ??= tick; slot.lastMeasuredTick = tick; slot.lastPlayers = world.players.length;
              const sample={elapsedMs:receivedAt-measurementStart,tick,worldTime:world.time};
              slot.firstSnapshot ??= sample;slot.lastSnapshot=sample;
              const player=world.players.find(item=>item.id===sessions[this.index].id);
              const car=world.entities.find(item=>item.id===player?.entityId&&item.driver===sessions[this.index].id)??null;
              slot.movement.observe({atMs:sample.elapsedMs,tick,poseRevision:prediction?.poseRevision,vehicle:car});
              if(car){
                const deviation=Math.abs(car.x-laneFor(this.index).x);
                slot.maxLaneDeviation=Math.max(slot.maxLaneDeviation,deviation);
                if(deviation>3||car.z>4100.5||car.z<3000)slot.leftCorridor=true;
              }
              if(control&&Array.isArray(control.queued)&&Array.isArray(control.jump?.pending)&&Array.isArray(control.flip?.pending)){
                slot.queues.samples++;slot.queues.levels=Math.max(slot.queues.levels,control.queued.length);
                slot.queues.jump=Math.max(slot.queues.jump,control.jump.pending.length);slot.queues.flip=Math.max(slot.queues.flip,control.flip.pending.length);
                if(Array.isArray(prediction.pending)){slot.queues.historySamples++;slot.queues.history=Math.max(slot.queues.history,prediction.pending.length);}
              }
              if(car){slot.initialHealth??=car.health;slot.damage||=car.health<slot.initialHealth-.001;
                slot.impulse||=Math.hypot(car.pushX,car.pushZ)>.1;}
            }
          } catch (error) { fail(`Snapshot observer: ${String(error)}`); }
        });
      }
    });
    this.addEventListener('close',event=>{
      slot.closed.push({code:event.code,reason:event.reason,wasClean:event.wasClean,utc:iso(),phase:phase(performance.now())});
      if (!stopping) fail(`Client ${this.index+1} closed: ${event.code} ${event.reason}`);
    });
  }
  override send(data:string | ArrayBufferLike | Blob | ArrayBufferView):void {
    if (typeof data === 'string' && data.startsWith('{"type":"input"')) {
      const value = JSON.parse(data) as {seq:number;targetTick:number};
      const slot = slots[this.index];
      const at=performance.now();slot.sentCounts[phase(at)]++;
      slot.sent.set(value.seq,{at,utc:iso(),targetTick:value.targetTick,lastSnapshotTick:slot.lastTick});
      if(slot.sent.size>4096){slot.sent.delete(slot.sent.keys().next().value!);slot.sentDropped++;}
    }
    super.send(data);
  }
}

const waitUntil = async (ready:()=>boolean, description:string) => {
  while (!ready()) {
    if (failure) throw new Error(failure);
    if (performance.now() >= deadline) throw new Error(`Deadline while ${description}`);
    await delay(25);
  }
  if (failure) throw new Error(failure);
};
const phase = (at:number|null) => at === null ? 'unknown' : at < measurementStart ? 'warmup' : at < measurementEnd ? 'measured' : 'drain';
const distribution = (values:number[]) => {
  const sorted = [...values].sort((a,b)=>a-b);
  const at = (q:number) => sorted.length ? +sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))].toFixed(2) : null;
  return {count:sorted.length,p50:at(.5),p95:at(.95),max:at(1)};
};

try {
  lanes=corridors();
  const response = await fetch(`${preview}/api/health`,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error(`Preview health HTTP ${response.status}`);
  health = await response.json();
  if (!(health as {ok?:boolean}).ok || (health as {version?:number}).version !== PROTOCOL_VERSION ||
      (health as {capacity?:number}).capacity !== 64) throw new Error(`Unexpected preview health: ${JSON.stringify(health)}`);
  healthHeaders = Object.fromEntries(['date','cf-ray','etag'].map(name=>[name,response.headers.get(name)]));
  Object.defineProperty(globalThis,'WebSocket',{value:MonitoringWebSocket,configurable:true,writable:true});
  Object.defineProperty(globalThis,'location',{value:new URL(preview),configurable:true});
  Object.defineProperty(globalThis,'window',{value:globalThis,configurable:true});
  for (let i=0;i<16;i++) {
    const session = new Session(); sessions.push(session);
    const clock = (session as any).clock;
    const observe = clock.observe.bind(clock);
    clock.observe = (tick:number,at:number):boolean => {
      const valid = observe(tick,at);
      if (valid) {
        slots[i].lastTick = tick;
        if (tick > highestTick) { highestTick = tick; lastProgressAt = performance.now(); }
      }
      return valid;
    };
    session.join(room,`probe-${group}-${i+1}`,'roadster');
  }
  let lastFrame = performance.now(), lastLoadSample = 0;
  timer = setInterval(()=>{
    try {
      const now = performance.now(), dt = Math.min((now-lastFrame)/1000,.1); lastFrame = now;
      if (now-lastLoadSample >= 5000) {loadSamples.push({utc:iso(),load:loadavg(),cpuMicros:process.cpuUsage()});lastLoadSample=now;}
      if (highestTick >= 0 && now-lastProgressAt > 10_000) fail('No observed room progress for ten seconds');
      if (now >= deadline) fail('Diagnostic deadline exceeded');
      for(const slot of slots)slot.queues.bufferedBytes=Math.max(slot.queues.bufferedBytes,slot.socket?.bufferedAmount??0);
      if (slots.some(slot=>slot.queues.bufferedBytes>1_000_000)) fail('Client send buffer exceeded 1 MB');
      if (failure) return;
      for (let i=0;i<sessions.length;i++) {
        const session = sessions[i];
        const car=carFor(i);
        const input=stageMode[i]==='align' ? alignControl(car) : barrierTick!==null
          ? driveControl(car,laneFor(i),now-(session as any).lastState) : {...NEUTRAL};
        session.tick(dt,input);
        slots[i].queues.historyOverflow ||= !!(session as any).prediction?.overflow;
        if (session.status === 'online') {
          // Match the existing Session diagnostic's frame-cadenced clock calls;
          // there is no renderer and no prediction render in this sample.
          const clock = (session as any).clock, at = performance.now();
          clock.remote(at);clock.target(at);clock.estimate(at);clock.alpha(at);
        }
      }
    } catch (error) { fail(`Frame loop: ${String(error)}`); }
  },16);
  await waitUntil(()=>sessions.every(session=>session.status==='online'&&session.id&&session.sandbox&&session.capacity===64), 'connecting 16 sandbox sessions');
  await waitUntil(()=>saw64, 'waiting for all 64 players');
  if(group===1){
    extraClose=await new Promise<{code:number;reason:string}>((resolve,reject)=>{
      const probe=new NativeWebSocket(socketUrl);
      const timeout=setTimeout(()=>{probe.close();reject(new Error('65th-seat check timed out'));},10_000);
      probe.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('65th-seat check failed'));});
      probe.addEventListener('message',()=>{clearTimeout(timeout);probe.close();reject(new Error('65th seat was admitted'));});
      probe.addEventListener('close',event=>{clearTimeout(timeout);resolve({code:event.code,reason:event.reason});});
    });
    if(extraClose.code!==4003)throw new Error(`65th seat closed with ${extraClose.code}, not 4003`);
    const afterProbe=sessions[0].snapshotVersion;
    await waitUntil(()=>sessions[0].snapshotVersion>afterProbe && sessions[0].world.players.length===64 &&
      sessions.every(session=>session.status==='online'), '64 drivers remain after the full-room probe');
  }
  // Teleport uses the ordinary fenced sandbox action. It may search up to 20 m
  // away and preserves yaw, so require exact arrival, align, and teleport once
  // more to zero velocity. There is no staging override on the server.
  await Promise.all(sessions.map(async (session,i)=>{
    const lane=laneFor(i);
    const teleport=async()=>{
      const version=session.snapshotVersion, request=session.teleport(lane.x,lane.z);
      await waitUntil(()=>session.teleportResult?.requestId===request, `teleport reply ${i+1}`);
      if(!session.teleportResult?.ok)throw new Error(`Teleport rejected for client ${i+1}`);
      await waitUntil(()=>session.snapshotVersion>version && !!carFor(i) &&
        Math.hypot(carFor(i)!.x-lane.x,carFor(i)!.z-lane.z)<.5, `exact staged pose ${i+1}`);
    };
    await teleport();
    stageMode[i]='align';
    await waitUntil(()=>{const car=carFor(i);return !!car && Math.abs(yawError(car.yaw))<.035 && Math.abs(car.speed)<.5;}, `aligned heading ${i+1}`);
    stageMode[i]='idle';
    await delay(500);
    await teleport();
    await waitUntil(()=>safelyStaged(carFor(i),lane), `stationary lane ${i+1}`);
  }));
  markedReady = true;
  sessions[0].setName(markers[group-1]);
  await waitUntil(()=>barrierTick!==null, 'waiting for all four ready markers');
  await waitUntil(()=>measurementStart!==Infinity, 'waiting for the shared start tick');
  await waitUntil(()=>performance.now()>=measurementEnd, 'measuring');
  measurementEnd = performance.now(); endedUtc = iso(); loop.disable();
  if (timer) {clearInterval(timer);timer=undefined;}
  // A bounded drain captures some delayed replies, not necessarily every reply.
  await delay(1000);
  if (failure) throw new Error(failure);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  if (measurementStart !== Infinity && !endedUtc) {measurementEnd=performance.now();endedUtc=iso();}
} finally {
  stopping = true;
  if (timer) clearInterval(timer);
  loop.disable();
  const onlineAtEnd = sessions.filter(session=>session.status==='online').length;
  const clientsWithAppliedInput = sessions.filter(session=>((session as any).prediction.control?.appliedSeq??0)>0).length;
  const roomEpochs = [...new Set(sessions.map(session=>(session as any).roomEpoch).filter(Boolean))];
  for (const session of sessions) session.disconnect();
  process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
  const rejections = slots.flatMap(slot=>slot.rejections).map(item=>({...item,sendPhase:phase(item.sentAt),receivePhase:phase(item.receivedAt)}));
  const sentCounts:Record<string,number> = {warmup:0,measured:0,drain:0,unknown:0};
  for (const slot of slots) for (const key of Object.keys(sentCounts)) sentCounts[key]+=slot.sentCounts[key];
  const countRejections = (key:'sendPhase'|'receivePhase') => {
    const counts:Record<string,Record<string,number>> = {warmup:{},measured:{},drain:{},unknown:{}};
    for (const item of rejections) counts[item[key]][item.reason]=(counts[item[key]][item.reason]??0)+1;
    return counts;
  };
  const elapsedSeconds = measurementStart===Infinity ? null : +(Math.max(0,measurementEnd-measurementStart)/1000).toFixed(3);
  const advances = slots.map(slot=>slot.firstTime===null||slot.lastTime===null?0:+(slot.lastTime-slot.firstTime).toFixed(2)).sort((a,b)=>a-b);
  const measuredRejections = rejections.filter(item=>item.sendPhase==='measured');
  const movement=slots.map(slot=>slot.movement.summary());
  const incomplete:string[]=[];
  if(failure)incomplete.push('runner-failure');
  if(elapsedSeconds===null||elapsedSeconds<60)incomplete.push('less-than-60-wall-seconds');
  if(advances[0]<57)incomplete.push('less-than-57-simulated-seconds');
  if(slots.some(slot=>slot.closed.length))incomplete.push('client-disconnected');
  if(slots.some(slot=>slot.lastPlayers!==64))incomplete.push('not-all-clients-observed');
  if(movement.some(item=>item.blocks.some(block=>!block.complete)))incomplete.push('not-all-drivers-sustained-moving');
  if(slots.some(slot=>slot.leftCorridor))incomplete.push('driver-left-sampled-corridor');
  if(slots.some(slot=>!slot.ack.measuredApplied))incomplete.push('missing-measurement-applied-input');
  if(measuredRejections.length)incomplete.push('input-rejected');
  if(rejections.some(item=>item.sendPhase==='unknown'))incomplete.push('rejection-send-unattributed');
  if(slots.some(slot=>!slot.queues.samples||!slot.queues.historySamples))incomplete.push('missing-queue-or-history-observations');
  if(slots.some(slot=>slot.queues.levels>FUTURE_TICKS||slot.queues.jump>FUTURE_TICKS||slot.queues.flip>FUTURE_TICKS))incomplete.push('sampled-control-queue-bound-exceeded');
  if(slots.some(slot=>slot.queues.historyOverflow))incomplete.push('prediction-history-overflow-observed');
  if(slots.some(slot=>slot.sentDropped||slot.ack.unmatchedReceived||slot.ack.unmatchedApplied))incomplete.push('ack-observation-incomplete');
  const result = {
    preview,room,health,healthHeaders,group,runId,attempt,candidateSha,baseSha:approvedTarget.baseSha,diagnosticSha:process.env.GITHUB_SHA??null,sourceSha256,
    failure,startedUtc,endedUtc,elapsedSeconds,barrierTick,targetTick,highestTick,markedReady,saw64,extraClose,
    clients:16,onlineAtEnd,roomEpochs,clientsSeeingAll:slots.filter(slot=>slot.lastPlayers===64).length,
    clientsWithAppliedInput,
    snapshots:slots.reduce((sum,slot)=>sum+slot.snapshots,0),minSnapshots:Math.min(...slots.map(slot=>slot.snapshots)),
    snapshotGapMs:distribution(slots.flatMap(slot=>slot.gaps)),simulatedSeconds:{min:advances[0],median:advances[8]},
    decodedJsonMiB:+(slots.reduce((sum,slot)=>sum+slot.bytes,0)/1048576).toFixed(2),
    clientEventLoopP95Ms:measurementStart===Infinity?null:+(loop.percentile(95)/1e6).toFixed(2),
    inputsSent:sentCounts,rejectionsBySendWindow:countRejections('sendPhase'),rejectionsByReceiveWindow:countRejections('receivePhase'),
    measuredRejectionReplyMs:distribution(measuredRejections.flatMap(item=>item.sentAt===null?[]:[item.receivedAt-item.sentAt])),
    receivedObservationMs:distribution(slots.flatMap(slot=>slot.ack.receivedMs)),
    appliedObservationMs:distribution(slots.flatMap(slot=>slot.ack.appliedMs)),
    slots:slots.map((slot,i)=>({snapshots:slot.snapshots,firstTick:slot.firstTick,lastTick:slot.lastMeasuredTick,
      firstTime:slot.firstTime,lastTime:slot.lastTime,firstSnapshot:slot.firstSnapshot,lastSnapshot:slot.lastSnapshot,
      lastPlayers:slot.lastPlayers,closed:slot.closed,movement:movement[i],queues:slot.queues,damageObserved:slot.damage,impulseObserved:slot.impulse,
      maxLaneDeviation:slot.maxLaneDeviation,leftCorridor:slot.leftCorridor,
      sentCounts:slot.sentCounts,sentDropped:slot.sentDropped,measuredApplied:slot.ack.measuredApplied,
      lastReceivedSeq:slot.ack.lastReceived,lastAppliedSeq:slot.ack.lastApplied,
      unmatchedReceived:slot.ack.unmatchedReceived,unmatchedApplied:slot.ack.unmatchedApplied,
      receivedObservationMs:distribution(slot.ack.receivedMs),appliedObservationMs:distribution(slot.ack.appliedMs)})),
    diagnosticCoverageComplete:incomplete.length===0,incomplete,
    rejections,loadSamples,host:{platform:process.platform,node:process.version,cpus:cpus().length,totalMemoryBytes:totalmem()},
    note:'Four independent 16-Session runners use sandbox teleports and sampled static corridors. Sandbox upgrades cars and disables normal persistence, so this is not normal-room capacity. All four artifacts must be combined. ACKs measure only exact sequences observed in snapshots; received can include rejected inputs. Sampled queues/history and damage/impulse cannot prove inter-snapshot bounds or absence of contact. Decoded bytes are not wire bytes. A one-second drain can miss replies. No server tick-work, rendering, device or capacity claim.',
  };
  mkdirSync(outputDir,{recursive:true});
  writeFileSync(join(outputDir,`group-${group}.json.gz`),gzipSync(JSON.stringify(result)));
  console.log(JSON.stringify({...result,rejections:`${rejections.length} details in gzip`},null,2));
  const runFailed=!!failure||incomplete.length>0;
  if (runFailed) process.exitCode=1;
  // A wedged close handshake must not keep the job alive after evidence exists.
  setTimeout(()=>process.exit(runFailed?1:0),2000).unref();
}

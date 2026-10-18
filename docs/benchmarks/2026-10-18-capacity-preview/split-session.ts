// Four Actions runners each use 16 real Sessions in one disposable preview room.
// The test is bounded and intentionally cannot target production or arbitrary URLs.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { Session } from '../../../src/session';
import { NEUTRAL, PROTOCOL_VERSION } from '../../../shared/game';

const preview = 'https://codex-restore-room-capacity-bay-drive.swyxio.workers.dev';
const group = Number(process.env.CAPACITY_GROUP);
const runId = process.env.GITHUB_RUN_ID ?? '';
const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '';
const runnerTemp = process.env.RUNNER_TEMP ?? '';
if (!Number.isInteger(group) || group < 1 || group > 4 ||
    !/^\d{1,20}$/.test(runId) || !/^\d{1,4}$/.test(attempt) || !runnerTemp ||
    process.env.GITHUB_REF !== 'refs/heads/codex/restore-room-capacity') {
  throw new Error('Only the four Actions jobs on the capacity branch may run this diagnostic');
}
const room = `gha-${runId}-${attempt}`;
if (room.length > 32) throw new Error('Diagnostic room name is too long');
const socketUrl = `wss://${new URL(preview).host}/api/room/${room}`;
const markers = [1, 2, 3, 4].map(i => `probe-ready-${i}`);
const sourceFiles = [
  'docs/benchmarks/2026-10-18-capacity-preview/split-session.ts',
  '.github/workflows/capacity-preview-diagnostic.yml',
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
const deadline = performance.now() + 150_000;
let measurementStart = Infinity, measurementEnd = Infinity;
let startedUtc:string|null = null, endedUtc:string|null = null;
let barrierTick:number|null = null, targetTick:number|null = null;
let markedReady = false, saw64 = false, stopping = false;
let failure:string|null = null, highestTick = -1, lastProgressAt = performance.now();
let timer:ReturnType<typeof setInterval>|undefined;
let health:unknown = null;
let healthHeaders:Record<string,string|null> = {};

type Sent = {at:number;utc:string;targetTick:number;lastSnapshotTick:number|null};
type Rejection = {client:number;reason:string;seq:number;targetTick:number;sentAt:number|null;sentUtc:string|null;
  receivedAt:number;receivedUtc:string;lastTickAtSend:number|null;lastTickAtReceive:number|null};
type Slot = {socket?:WebSocket;lastTick:number|null;lastMeasuredAt:number;snapshots:number;gaps:number[];bytes:number;
  firstTime:number|null;lastTime:number|null;firstTick:number|null;lastMeasuredTick:number|null;lastPlayers:number;
  sent:Map<number,Sent>;rejections:Rejection[];closed:{code:number;reason:string;utc:string}[]};
const slots:Slot[] = Array.from({length:16},()=>({lastTick:null,lastMeasuredAt:0,snapshots:0,gaps:[],bytes:0,
  firstTime:null,lastTime:null,firstTick:null,lastMeasuredTick:null,lastPlayers:0,sent:new Map(),rejections:[],closed:[]}));
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
            if (world.players.length === 64) saw64 = true;
            if (markedReady && world.players.length !== 64) fail(`Room no longer has 64 players: ${world.players.length}`);
            if (this.index === 0 && markedReady && barrierTick === null && world.players.length === 64 &&
                markers.every(marker=>world.players.some(player=>player.name===marker))) {
              // All 64 have joined and all four runners have declared their 16
              // sessions ready. Every socket sees this same first complete state.
              barrierTick = tick;
              targetTick = tick + 80;
            }
            if (this.index === 0 && targetTick !== null && measurementStart === Infinity && tick >= targetTick) {
              if (tick !== targetTick) { fail(`Missed start tick ${targetTick}; saw ${tick}`); return; }
              measurementStart = performance.now(); measurementEnd = measurementStart + 20_000;
              startedUtc = iso(); lastProgressAt = measurementStart; loop.enable();
            }
            if (receivedAt >= measurementStart && receivedAt < measurementEnd) {
              if (slot.lastMeasuredAt) slot.gaps.push(receivedAt-slot.lastMeasuredAt);
              slot.lastMeasuredAt = receivedAt; slot.snapshots++; slot.bytes += bytes;
              slot.firstTime ??= world.time; slot.lastTime = world.time;
              slot.firstTick ??= tick; slot.lastMeasuredTick = tick; slot.lastPlayers = world.players.length;
            }
          } catch (error) { fail(`Snapshot observer: ${String(error)}`); }
        });
      }
    });
    this.addEventListener('close',event=>{
      slot.closed.push({code:event.code,reason:event.reason,utc:iso()});
      if (!stopping) fail(`Client ${this.index+1} closed: ${event.code} ${event.reason}`);
    });
  }
  override send(data:string | ArrayBufferLike | Blob | ArrayBufferView):void {
    if (typeof data === 'string' && data.startsWith('{"type":"input"')) {
      const value = JSON.parse(data) as {seq:number;targetTick:number};
      const slot = slots[this.index];
      slot.sent.set(value.seq,{at:performance.now(),utc:iso(),targetTick:value.targetTick,lastSnapshotTick:slot.lastTick});
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
      if (slots.some(slot=>(slot.socket?.bufferedAmount??0)>1_000_000)) fail('Client send buffer exceeded 1 MB');
      if (failure) return;
      for (let i=0;i<sessions.length;i++) {
        const session = sessions[i];
        session.tick(dt,{...NEUTRAL,throttle:.5,steer:Math.sin((group-1)*16+i)*.2});
        if (session.status === 'online') {
          // Match the existing Session diagnostic's frame-cadenced clock calls;
          // there is no renderer and no prediction render in this sample.
          const clock = (session as any).clock, at = performance.now();
          clock.remote(at);clock.target(at);clock.estimate(at);clock.alpha(at);
        }
      }
    } catch (error) { fail(`Frame loop: ${String(error)}`); }
  },16);
  await waitUntil(()=>sessions.every(session=>session.status==='online'&&session.identityResult?.ok===true), 'identifying 16 sessions');
  await waitUntil(()=>saw64, 'waiting for all 64 players');
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
  for (const slot of slots) for (const sent of slot.sent.values()) sentCounts[phase(sent.at)]++;
  const countRejections = (key:'sendPhase'|'receivePhase') => {
    const counts:Record<string,Record<string,number>> = {warmup:{},measured:{},drain:{},unknown:{}};
    for (const item of rejections) counts[item[key]][item.reason]=(counts[item[key]][item.reason]??0)+1;
    return counts;
  };
  const elapsedSeconds = measurementStart===Infinity ? null : +(Math.max(0,measurementEnd-measurementStart)/1000).toFixed(3);
  const advances = slots.map(slot=>slot.firstTime===null||slot.lastTime===null?0:+(slot.lastTime-slot.firstTime).toFixed(2)).sort((a,b)=>a-b);
  const measuredRejections = rejections.filter(item=>item.sendPhase==='measured');
  const result = {
    preview,room,health,healthHeaders,group,runId,attempt,gitSha:process.env.GITHUB_SHA??null,sourceSha256,
    failure,startedUtc,endedUtc,elapsedSeconds,barrierTick,targetTick,highestTick,markedReady,saw64,
    clients:16,onlineAtEnd,roomEpochs,clientsSeeingAll:slots.filter(slot=>slot.lastPlayers===64).length,
    clientsWithAppliedInput,
    snapshots:slots.reduce((sum,slot)=>sum+slot.snapshots,0),minSnapshots:Math.min(...slots.map(slot=>slot.snapshots)),
    snapshotGapMs:distribution(slots.flatMap(slot=>slot.gaps)),simulatedSeconds:{min:advances[0],median:advances[8]},
    decodedJsonMiB:+(slots.reduce((sum,slot)=>sum+slot.bytes,0)/1048576).toFixed(2),
    clientEventLoopP95Ms:measurementStart===Infinity?null:+(loop.percentile(95)/1e6).toFixed(2),
    inputsSent:sentCounts,rejectionsBySendWindow:countRejections('sendPhase'),rejectionsByReceiveWindow:countRejections('receivePhase'),
    measuredRejectionReplyMs:distribution(measuredRejections.flatMap(item=>item.sentAt===null?[]:[item.receivedAt-item.sentAt])),
    slots:slots.map(slot=>({snapshots:slot.snapshots,firstTick:slot.firstTick,lastTick:slot.lastMeasuredTick,
      firstTime:slot.firstTime,lastTime:slot.lastTime,lastPlayers:slot.lastPlayers,closed:slot.closed})),
    rejections,loadSamples,host:{platform:process.platform,node:process.version,cpus:cpus().length,totalMemoryBytes:totalmem()},
    note:'One 20-second preview sample using 4 independent 16-Session runners, no browser renderer or prediction render. The first shared ready snapshot defines the start tick; network delivery can shift wall-clock windows. A one-second drain can miss delayed rejections. Health does not prove deployed commit. No server tick-work, production, sustained or physical-device claim.',
  };
  mkdirSync(outputDir,{recursive:true});
  writeFileSync(join(outputDir,`group-${group}.json.gz`),gzipSync(JSON.stringify(result)));
  console.log(JSON.stringify({...result,rejections:`${rejections.length} details in gzip`},null,2));
  if (failure) process.exitCode=1;
  // A wedged close handshake must not keep the job alive after evidence exists.
  setTimeout(()=>process.exit(failure?1:0),2000).unref();
}

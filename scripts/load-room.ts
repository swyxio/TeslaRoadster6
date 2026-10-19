// Bounded headless clients, local Wrangler only. Example:
// pnpm exec tsx scripts/load-room.ts http://127.0.0.1:8787 8 10
// This includes client parsing and same-host scheduling; it does not isolate Worker CPU.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RoomInputClient } from '../tests/room-input-client';
import { NEUTRAL, PROTOCOL_VERSION, type World } from '../shared/game';
import { FUTURE_TICKS } from '../shared/tick-input';

type Pose={id:string;x:number;y:number;z:number;vx:number;vy:number;vz:number};
type MotionSample={atMs:number;tick:number;poseRevision:number;vehicle:Pose|null};

// Keep only bounded aggregates. A pose change, missing sample, or implausibly
// large jump cannot count as driving distance.
export function movementTracker(durationMs:number) {
  const blocks=Array.from({length:Math.ceil(durationMs/10_000)},(_,i)=>({
    startMs:i*10_000,durationMs:Math.min(10_000,durationMs-i*10_000),samples:0,movingSamples:0,
    distanceM:0,steps:0,discontinuities:0,invalidSamples:0,firstAtMs:null as number|null,lastAtMs:null as number|null,maxGapMs:0,
  }));
  let previous:MotionSample|null=null,lastValidAtMs:number|null=null,totalDistanceM=0,totalSteps=0;
  return {
    observe(sample:MotionSample) {
      const blockIndex=Math.floor(sample.atMs/10_000),block=blocks[blockIndex],car=sample.vehicle;
      if(!block||sample.atMs<0||sample.atMs>=durationMs)return;
      if(!car||typeof car.id!=='string'||!Number.isSafeInteger(sample.tick)||!Number.isSafeInteger(sample.poseRevision)||
        ![car.x,car.y,car.z,car.vx,car.vy,car.vz].every(Number.isFinite)){
        block.invalidSamples++;previous=null;return;
      }
      if(lastValidAtMs!==null&&sample.atMs<lastValidAtMs){block.invalidSamples++;previous=null;return;}
      if(lastValidAtMs!==null){
        const gap=sample.atMs-lastValidAtMs;
        // A gap can straddle a block boundary even when each block's first
        // and last sample is less than one second from that boundary.
        for(let i=Math.floor(lastValidAtMs/10_000);i<=blockIndex;i++)
          blocks[i].maxGapMs=Math.max(blocks[i].maxGapMs,gap);
      }
      lastValidAtMs=sample.atMs;
      block.samples++;
      block.firstAtMs??=sample.atMs;
      block.lastAtMs=sample.atMs;
      if(Math.hypot(car.vx,car.vy,car.vz)>5)block.movingSamples++;
      if(previous&&previous.vehicle){
        const old=previous.vehicle,delta=Math.hypot(car.x-old.x,car.y-old.y,car.z-old.z);
        if(sample.tick<=previous.tick||sample.poseRevision!==previous.poseRevision||car.id!==old.id||delta>24)block.discontinuities++;
        else {
          totalDistanceM+=delta;
          totalSteps++;
          if(Math.floor(previous.atMs/10_000)===blockIndex){block.distanceM+=delta;block.steps++;}
        }
      }
      previous=sample;
    },
    summary() {
      return {distanceM:totalSteps?totalDistanceM:null,blocks:blocks.map(block=>{
        const movingFraction=block.samples?block.movingSamples/block.samples:null;
        const distanceM=block.steps?block.distanceM:null;
        const complete=block.durationMs===10_000&&block.samples>=50&&block.invalidSamples===0&&block.discontinuities===0&&
          block.firstAtMs!==null&&block.firstAtMs-block.startMs<=1000&&block.lastAtMs!==null&&
          block.startMs+block.durationMs-block.lastAtMs<=1000&&block.maxGapMs<=1000&&
          distanceM!==null&&distanceM>=75&&movingFraction!==null&&movingFraction>=.8;
        return {...block,distanceM,movingFraction,complete};
      })};
    },
  };
}

// A warm-up acknowledgement alone cannot prove that measured inputs applied.
export function inputCoverage(samples:{lastSentBefore:number;applied:number|null;rejections:number}[]) {
  return {
    rejectedClients:samples.flatMap((sample,index)=>sample.rejections>0?[index]:[]),
    clientsWithoutAppliedInput:samples.flatMap((sample,index)=>
      Number.isSafeInteger(sample.applied)&&sample.applied!>sample.lastSentBefore?[]:[index]),
  };
}

async function main() {
const base=process.argv[2]??'http://127.0.0.1:8787';
const count=Number(process.argv[3]??'8'),seconds=Number(process.argv[4]??'10');
const host=new URL(base).hostname;
if(!['127.0.0.1','localhost','[::1]'].includes(host))throw new Error('Run this synthetic load only against a local server.');
if(!Number.isInteger(count)||count<1||count>128||!Number.isFinite(seconds)||seconds<2||seconds>60)throw new Error('Use 1–128 clients and a duration of 2–60 seconds.');
const health=await (await fetch(base+'/api/health')).json() as {version:number;capacity:number};
if(health.version!==PROTOCOL_VERSION||count>health.capacity)throw new Error(`Server version/capacity mismatch: ${JSON.stringify(health)}`);
const url=base.replace(/^http/,'ws')+`/api/room/load-${Date.now()}`;
const inputs:RoomInputClient[]=[];
const sockets:WebSocket[]=[],lastSnapshot=new Array<number>(count).fill(0),snapshotCounts=new Array<number>(count).fill(0);
const seenPlayers=new Array<number>(count).fill(0),firstTime=new Array<number|undefined>(count),lastTime=new Array<number|undefined>(count),gaps:number[]=[];
const playerIds=new Array<string>(count).fill(''),movement=Array.from({length:count},()=>movementTracker(seconds*1000));
const queues=Array.from({length:count},()=>({samples:0,levels:0,jumpEdges:0,flipEdges:0}));
const loopDelay=monitorEventLoopDelay({resolution:20});
let measuring=false,snapshots=0,bytes=0,sent=0,closed=0;
let measurementStart=0;
let timer:ReturnType<typeof setInterval>|undefined;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  const ready=Array.from({length:count},(_,i)=>new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(url);sockets.push(socket);const input=new RoomInputClient(socket);inputs.push(input);let joined=false;
    socket.addEventListener('message',event=>{
      const raw=String(event.data),message=JSON.parse(raw) as {type:string;id?:string;version?:number;tick:number;poseRevision:number;world?:World};
      input.observe(message);
      if(message.type==='welcome'){if(message.version!==PROTOCOL_VERSION){reject(new Error(`client ${i} received an incompatible welcome`));return;}playerIds[i]=message.id??'';socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));}
      if(!joined&&input.active){joined=true;resolve();}
      if(message.type==='state'&&message.world&&measuring){
        const now=performance.now();if(lastSnapshot[i])gaps.push(now-lastSnapshot[i]);lastSnapshot[i]=now;
        snapshots++;snapshotCounts[i]++;bytes+=Buffer.byteLength(raw);seenPlayers[i]=message.world.players.length;
        firstTime[i]??=message.world.time;lastTime[i]=message.world.time;
        const player=message.world.players.find(item=>item.id===playerIds[i]);
        const vehicle=message.world.entities.find(item=>item.id===player?.entityId&&item.driver===playerIds[i])??null;
        movement[i].observe({atMs:now-measurementStart,tick:message.tick,poseRevision:message.poseRevision,vehicle});
        const control=input.control;
        if(control&&Array.isArray(control.queued)&&Array.isArray(control.jump?.pending)&&Array.isArray(control.flip?.pending)){
          const queue=queues[i];queue.samples++;queue.levels=Math.max(queue.levels,control.queued.length);
          queue.jumpEdges=Math.max(queue.jumpEdges,control.jump.pending.length);queue.flipEdges=Math.max(queue.flipEdges,control.flip.pending.length);
        }
      }
    });
    socket.addEventListener('error',()=>{if(!joined)reject(new Error(`client ${i} failed to connect`));});
    socket.addEventListener('close',event=>{closed++;if(!joined)reject(new Error(`client ${i} closed before identity and controls: ${event.code}`));});
  }));
  timer=setInterval(()=>{
    for(let i=0;i<sockets.length;i++)if(inputs[i].active){
      inputs[i].send({...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2});if(measuring)sent++;
    }
  },50);
  let joinTimeout:ReturnType<typeof setTimeout>;
  try {await Promise.race([Promise.all(ready),new Promise<never>((_,reject)=>{joinTimeout=setTimeout(()=>reject(new Error('Timed out joining clients')),40000);})]);}
  finally {clearTimeout(joinTimeout!);}
  await delay(2000);loopDelay.enable();const start=performance.now(),lastSentBefore=inputs.map(input=>input.lastSeq);measurementStart=start;measuring=true;await delay(seconds*1000);measuring=false;
  const elapsed=(performance.now()-start)/1000;loopDelay.disable();gaps.sort((a,b)=>a-b);
  const advances=firstTime.map((first,i)=>first===undefined||lastTime[i]===undefined?0:lastTime[i]!-first);
  const motion=movement.map(tracker=>tracker.summary());
  const rejectionCounts=inputs.map(input=>input.rejectionCount);
  const coverage=inputCoverage(inputs.map((input,index)=>({lastSentBefore:lastSentBefore[index],applied:input.control?.appliedSeq??null,rejections:input.rejectionCount})));
  const stationaryClients=motion.flatMap((driver,index)=>driver.blocks.some(block=>block.durationMs===10_000&&
    block.samples>=50&&block.invalidSamples===0&&block.discontinuities===0&&block.firstAtMs!==null&&block.firstAtMs-block.startMs<=1000&&
    block.lastAtMs!==null&&block.startMs+block.durationMs-block.lastAtMs<=1000&&block.maxGapMs<=1000&&
    block.distanceM!==null&&block.distanceM<1&&block.movingFraction===0)?[index]:[]);
  const incomplete:string[]=[];
  if(seconds<10)incomplete.push('no-complete-ten-second-movement-block');
  if(seconds>=10&&seconds%10!==0)incomplete.push('partial-ten-second-movement-block');
  if(motion.some(driver=>driver.blocks.some(block=>block.durationMs===10_000&&!block.complete)))incomplete.push('not-all-drivers-sustained-moving');
  if(stationaryClients.length)incomplete.push('stationary-driver');
  if(queues.some(queue=>queue.samples===0))incomplete.push('missing-control-queue-observations');
  if(queues.some(queue=>queue.levels>FUTURE_TICKS||queue.jumpEdges>FUTURE_TICKS||queue.flipEdges>FUTURE_TICKS))incomplete.push('sampled-control-queue-bound-exceeded');
  if(coverage.rejectedClients.length)incomplete.push('input-rejected');
  if(coverage.clientsWithoutAppliedInput.length)incomplete.push('missing-applied-input');
  if(closed)incomplete.push('client-disconnected');
  if(seenPlayers.some(players=>players!==count))incomplete.push('not-all-clients-observed');
  console.log(JSON.stringify({clients:count,elapsedSeconds:+elapsed.toFixed(2),closed,sentInputs:sent,inputRejections:rejectionCounts.reduce((sum,n)=>sum+n,0),rejectionCounts,...coverage,
    clientsWithAppliedInput:count-coverage.clientsWithoutAppliedInput.length,snapshots,
    clientsSeeingAll:seenPlayers.filter(players=>players===count).length,minSnapshots:Math.min(...snapshotCounts),
    snapshotRatePerClient:+(snapshots/count/elapsed).toFixed(2),p95SnapshotGapMs:Math.round(gaps[Math.floor(gaps.length*.95)]??0),maxSnapshotGapMs:Math.round(gaps.at(-1)??0),
    decodedJsonMiB:+(bytes/1048576).toFixed(2),minSimulatedSeconds:+Math.min(...advances).toFixed(2),medianSimulatedSeconds:+advances.sort((a,b)=>a-b)[Math.floor(count/2)].toFixed(2),
    clientEventLoopP95Ms:+(loopDelay.percentile(95)/1e6).toFixed(1),movement:motion,stationaryClients,
    controlQueues:queues.map(queue=>queue.samples?queue:{samples:0,levels:null,jumpEdges:null,flipEdges:null}),
    diagnosticCoverageComplete:incomplete.length===0,incomplete,
    note:'Local same-host synthetic clients send input at 20 Hz and parse all received JSON. Movement blocks require 50 valid snapshots spanning the block with gaps at most 1 s, 75 m and speed above 5 m/s in 80% of samples; jumps over 24 m, identity changes and relocations do not count as driving. Input rejection counts include warm-up; applied input must advance beyond the last pre-measurement sequence. Queue maxima are sampled from owner snapshots and do not establish peaks between snapshots or client history bounds. No worker CPU, WAN, device or production capacity claim.'},null,2));
} finally {if(timer)clearInterval(timer);for(const socket of sockets)if(socket.readyState===WebSocket.OPEN)socket.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();

export type SentInput = {at:number;utc:string;targetTick:number;lastSnapshotTick:number|null};
export type AckObservations = {lastReceived:number;lastApplied:number;receivedMs:number[];appliedMs:number[];
  unmatchedReceived:number;unmatchedApplied:number;measuredApplied:boolean};

export const newAckObservations = ():AckObservations => ({lastReceived:0,lastApplied:0,receivedMs:[],appliedMs:[],
  unmatchedReceived:0,unmatchedApplied:0,measuredApplied:false});

// An observed received sequence can also be rejected. An applied sample only
// measures a sequence actually present in a snapshot; skipped sequences have
// no reported latency. Both ends use this generator's monotonic clock.
export function observeAcks(state:AckObservations, sent:Map<number,SentInput>, received:number, applied:number,
  now:number, start:number, end:number):void {
  const measuring=now>=start&&now<end;
  for(const [kind,seq] of [['received',received],['applied',applied]] as const){
    const last=kind==='received'?state.lastReceived:state.lastApplied;
    if(!Number.isSafeInteger(seq)||seq<=last)continue;
    if(kind==='received')state.lastReceived=seq;else state.lastApplied=seq;
    if(!measuring)continue;
    const command=sent.get(seq);
    if(!command){if(kind==='received')state.unmatchedReceived++;else state.unmatchedApplied++;continue;}
    if(command.at<start||command.at>=end)continue;
    (kind==='received'?state.receivedMs:state.appliedMs).push(now-command.at);
    if(kind==='applied')state.measuredApplied=true;
  }
}

type Pose={id:string;x:number;y:number;z:number;vx:number;vy:number;vz:number};
type MotionSample={atMs:number;tick:number;poseRevision:number;vehicle:Pose|null};

// Keep only bounded aggregates. A pose change, missing sample, or implausibly
// large jump cannot count as driving distance.
export function movementTracker(durationMs:number) {
  const blocks=Array.from({length:Math.ceil(durationMs/10_000)},(_,i)=>({
    startMs:i*10_000,durationMs:Math.min(10_000,durationMs-i*10_000),samples:0,movingSamples:0,
    distanceM:0,steps:0,discontinuities:0,invalidSamples:0,firstAtMs:null as number|null,lastAtMs:null as number|null,maxGapMs:0,
  }));
  let previous:MotionSample|null=null,totalDistanceM=0,totalSteps=0;
  return {
    observe(sample:MotionSample) {
      const blockIndex=Math.floor(sample.atMs/10_000),block=blocks[blockIndex],car=sample.vehicle;
      if(!block||sample.atMs<0||sample.atMs>=durationMs)return;
      if(!car||typeof car.id!=='string'||!Number.isSafeInteger(sample.tick)||!Number.isSafeInteger(sample.poseRevision)||
        ![car.x,car.y,car.z,car.vx,car.vy,car.vz].every(Number.isFinite)){
        block.invalidSamples++;previous=null;return;
      }
      block.samples++;
      block.firstAtMs??=sample.atMs;
      if(previous){
        const gap=sample.atMs-previous.atMs;
        block.maxGapMs=Math.max(block.maxGapMs,gap);
        // A stall spanning a block boundary must count in both blocks.
        const previousBlock=blocks[Math.floor(previous.atMs/10_000)];
        previousBlock.maxGapMs=Math.max(previousBlock.maxGapMs,gap);
      }
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


/**
 * Deterministic motion trace, not a browser frame-rate or collision benchmark.
 * Run: pnpm exec tsx scripts/motion-benchmark.ts [--adapter path] [--trace path]
 *       [--scenario drive|fast-turn|fast-slalom|flight-turn|fast-turn-npc|jump|flight|release|teleport|reset|network-stall|focus-loss|server-overload]
 *       [--profile zero|steady150|bunched150] [--tank-level 1|2|3|4|5]
 * An adapter module exports createMotionAdapter(context). Payloads are opaque;
 * the fixture schedules server ticks, client frames, and ordered transport.
 */
import { writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addPlayer, createWorld, NEUTRAL, resetPlayer, step, type Input, type World } from '../shared/game';
import type { TankLevel } from '../shared/air-tank';

export type Pose={x:number;y:number;z:number;q:[number,number,number,number];debug?:{supportId:string|null;yaw:number;pitch:number;roll:number;normal:{x:number;y:number;z:number}|null;speedMps?:number;timeline?:Record<string,unknown>}};
export type Frame={nowMs:number;dtMs:number};
export type AdapterContext={world:World;id:string;sendToServer:(message:unknown,timeMs:number)=>void;sendToClient:(message:unknown,timeMs:number)=>void};
export interface MotionAdapter {
  onLocalInput(input:Input,frame:Frame):void;
  onLocalAction(action:'reset',timeMs:number):void;
  onServerInput(message:unknown,timeMs:number):void;
  onServerRelocation(timeMs:number):void;
  onServerTick(timeMs:number):void;
  shouldSnapshot():boolean;
  makeSnapshot():unknown;
  onClientMessage(message:unknown,timeMs:number):void;
  render(frame:Frame):Pose;
  serverWorld():World;
  serverPose():Pose;
  diagnostics():Record<string,unknown>;
  close():void;
}
type Factory=(context:AdapterContext)=>MotionAdapter;
export type Scenario='drive'|'fast-turn'|'fast-slalom'|'flight-turn'|'fast-turn-npc'|'jump'|'flight'|'release'|'teleport'|'reset'|'network-stall'|'focus-loss'|'server-overload';
export type Profile='zero'|'steady150'|'bunched150';
export type Event={name:string;timeMs:number;measure:'position'|'height'|'rotation'|'yaw'};
export type Sample={timeMs:number;visual:Pose;authority:Pose;ideal?:{x:number;y:number;z:number;yaw:number};npc?:{x:number;y:number;z:number}};
type Packet={arrivalMs:number;payload:unknown};
export type Trace={samples:Sample[];diagnostics:Record<string,unknown>;packets:Record<string,number>};
const scenarios:Scenario[]=['drive','fast-turn','fast-slalom','flight-turn','fast-turn-npc','jump','flight','release','teleport','reset','network-stall','focus-loss','server-overload'];
const profiles:Profile[]=['zero','steady150','bunched150'];
const durationFrames=960,frameMs=1000/120,serverEveryFrames=6,id='benchmark-driver';
const distance=(a:Pose,b:Pose)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const angle=(a:Pose,b:Pose)=>2*Math.acos(Math.min(1,Math.abs(a.q.reduce((sum,v,i)=>sum+v*b.q[i],0))));
// Heading of the rendered local +Z axis, matching the scene's chase camera.
const heading=(pose:Pose)=>{const [x,y,z,w]=pose.q;return Math.atan2(2*(x*z+y*w),1-2*(x*x+y*y));};
const rounded=(n:number)=>+n.toFixed(3);
const percentile=(values:number[],p:number)=>{const a=[...values].sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)]??0;};

function events(s:Scenario):Event[] {
  if(s==='drive')return [{name:'drive',timeMs:1000,measure:'position'},{name:'steer',timeMs:2500,measure:'rotation'}];
  if(s==='fast-turn'||s==='fast-turn-npc'||s==='flight-turn')return [{name:'steer',timeMs:3000,measure:'yaw'}];
  if(s==='fast-slalom')return [{name:'left',timeMs:3000,measure:'yaw'},{name:'right',timeMs:3500,measure:'yaw'}];
  if(s==='jump')return [{name:'jump',timeMs:3500,measure:'height'}];
  if(s==='flight')return [{name:'steer',timeMs:2000,measure:'rotation'},{name:'roll',timeMs:3500,measure:'rotation'},{name:'flip',timeMs:5200,measure:'rotation'}];
  if(s==='release')return [{name:'release',timeMs:4000,measure:'position'}];
  return [];
}

function inputAt(s:Scenario,ms:number,excluded:string):Input {
  if(s==='fast-turn'||s==='fast-turn-npc'||s==='fast-slalom'||s==='flight-turn'){
    let steer=0;
    if(ms>=3000&&ms<7000){
      steer=s==='fast-slalom'?(Math.floor((ms-3000)/500)%2===0?.7:-.7):.7;
      if((s==='fast-slalom'&&excluded==='left'&&ms<3500)||(s!=='fast-slalom'&&excluded==='steer'))steer=0;
      if(s==='fast-slalom'&&excluded==='right'&&ms>=3500&&ms<4000)steer=.7;
    }
    return {...NEUTRAL,throttle:1,hover:s==='flight-turn',steer};
  }
  if(s==='flight')return {...NEUTRAL,hover:true,throttle:ms>=4500&&ms<7000?1:0,
    boost:ms>=4500&&ms<5000,steer:excluded!=='steer'&&ms>=2000&&ms<2400?.7:0,
    roll:excluded!=='roll'&&ms>=3500&&ms<3800?1:0,flip:excluded!=='flip'&&ms>=5200?1:0};
  const active=excluded!=='drive'&&ms>=1000&&(s!=='focus-loss'||ms<4000)&&(s!=='release'||excluded==='release'||ms<4000);
  return {...NEUTRAL,throttle:active?1:0,steer:s==='drive'&&excluded!=='steer'&&ms>=2500&&ms<3900?.7:0,
    jump:s==='jump'&&excluded!=='jump'&&ms>=3500?1:0};
}

function worldFor(s:Scenario,tankLevel:TankLevel):World {
  const world=createWorld(),player=addPlayer(world,id,'Benchmark');
  const npc=s==='fast-turn-npc'?world.entities.find(e=>e.id==='traffic-0'):undefined;
  world.entities=world.entities.filter(e=>e.id===player.entityId);world.pickups=[];
  const flight=s==='flight'||s==='flight-turn';
  const e=world.entities[0];Object.assign(e,{x:-300,z:flight?-1850:-2050,y:flight?100:0,yaw:Math.PI,
    speed:0,vx:0,vy:0,vz:0,supportId:flight?null:'ground',tankLevel});
  if(npc){
    Object.assign(npc,{x:-292,y:0,z:-2020,yaw:Math.PI,vx:0,vy:0,vz:0,speed:0,supportId:'ground',npc:true,autopilot:true,
      navigation:{destination:{x:-292,z:-1200},path:[{x:-292,z:-1200}],index:0,status:'driving'}});
    world.entities.push(npc);
  }
  return world;
}

export function runTrace(factory:Factory,scenario:Scenario,profile:Profile,excluded='',tankLevel:TankLevel=1):Trace {
  const world=worldFor(scenario,tankLevel),idealWorld=worldFor(scenario,tankLevel),up:Packet[]=[],down:Packet[]=[];
  const initialNpc=world.entities.find(entity=>entity.id==='traffic-0'),npcOrigin=initialNpc?{x:initialNpc.x,z:initialNpc.z}:null;
  let upLast=0,downLast=0,upIndex=0,downIndex=0,sent=0,received=0,batched=0;
  const enqueue=(direction:'up'|'down',payload:unknown,timeMs:number)=>{
    const index=direction==='up'?upIndex++:downIndex++;
    // TCP/WebSocket order is retained even when a later packet has less delay.
    const base=profile==='zero'?0:75;
    const extra=profile==='bunched150'?[0,0,125,-16.667,-16.667][index%5]:0;
    let arrival=Math.max(timeMs,timeMs+base+extra);
    // This stall affects the downlink only. Server ticks and inputs continue.
    if(scenario==='network-stall'&&direction==='down'&&timeMs>=4000&&timeMs<4800)arrival=Math.max(arrival,4800+base);
    const last=direction==='up'?upLast:downLast;
    if(arrival<last)batched++;
    arrival=Math.max(last,arrival);
    if(direction==='up'){upLast=arrival;up.push({arrivalMs:arrival,payload});sent++;}
    else {downLast=arrival;down.push({arrivalMs:arrival,payload});received++;}
  };
  const adapter=factory({world,id,sendToServer:(payload,timeMs)=>enqueue('up',payload,timeMs),sendToClient:(payload,timeMs)=>enqueue('down',payload,timeMs)});
  const samples:Sample[]=[];let lastFrame=0,npcMinDistance=Infinity,npcMaxTravel=0;
  const drain=(timeMs:number)=>{
    while(up.length&&up[0].arrivalMs<=timeMs+1e-6)adapter.onServerInput(up.shift()!.payload,timeMs);
    while(down.length&&down[0].arrivalMs<=timeMs+1e-6)adapter.onClientMessage(down.shift()!.payload,timeMs);
  };
  try {
    for(let f=1;f<=durationFrames;f++){
      const timeMs=f*frameMs,paused=scenario==='focus-loss'&&timeMs>=4000&&timeMs<4600;
      drain(timeMs);
      if(!paused){
        // GameScene caps dt after a background gap; server time is never capped.
        const frame={nowMs:timeMs,dtMs:Math.min(100,timeMs-lastFrame)};lastFrame=timeMs;
        adapter.onLocalInput(inputAt(scenario,timeMs,excluded),frame);
        if(scenario==='reset'&&f===480)adapter.onLocalAction('reset',timeMs);
      }
      drain(timeMs);
      if(f%serverEveryFrames===0){
        if(scenario==='teleport'&&f===480)idealWorld.entities[0].x+=30;
        if(scenario==='reset'&&f===480)resetPlayer(idealWorld,id);
        // Each completed reference tick samples controls at the start of its
        // 50 ms interval, without network delay or invented server authority.
        step(idealWorld,new Map([[id,inputAt(scenario,timeMs-50,excluded)]]),.05);
      }
      // Under load, the server runs half as many fixed-size steps; wall time
      // continues for input and message delivery, without inventing catch-up steps.
      const missedTick=scenario==='server-overload'&&timeMs>=4000&&timeMs<4800&&f%12===0;
      if(f%serverEveryFrames===0&&!missedTick){
        if(scenario==='teleport'&&f===480){
          const e=adapter.serverWorld().entities.find(entity=>entity.driver===id);if(!e)throw new Error('Missing teleport entity');e.x+=30;adapter.onServerRelocation(timeMs);
        }
        adapter.onServerTick(timeMs);
        if(adapter.shouldSnapshot())enqueue('down',adapter.makeSnapshot(),timeMs);
      }
      drain(timeMs);
      if(!paused){
        const prior=samples.at(-1)?.timeMs??0;
        const frame={nowMs:timeMs,dtMs:Math.min(100,timeMs-prior)};
        const ideal=idealWorld.entities.find(entity=>entity.driver===id);if(!ideal)throw new Error('Missing reference entity');
        const visual=adapter.render(frame),authority=adapter.serverPose(),npc=world.entities.find(entity=>entity.id==='traffic-0');
        if(npc&&npcOrigin){npcMinDistance=Math.min(npcMinDistance,Math.hypot(npc.x-authority.x,npc.y-authority.y,npc.z-authority.z));npcMaxTravel=Math.max(npcMaxTravel,Math.hypot(npc.x-npcOrigin.x,npc.z-npcOrigin.z));}
        samples.push({timeMs,visual,authority,ideal:{x:ideal.x,y:ideal.y,z:ideal.z,yaw:ideal.yaw},...(npc?{npc:{x:npc.x,y:npc.y,z:npc.z}}:{})});
      }
    }
    const npc=world.entities.find(entity=>entity.id==='traffic-0'),car=world.entities.find(entity=>entity.driver===id);
    return {samples,diagnostics:{...adapter.diagnostics(),...(npc?{npc:{minDistanceM:npcMinDistance,maxTravelM:npcMaxTravel,npcHealth:npc.health,carHealth:car?.health}}:{})},packets:{sent,received,batched}};
  } finally {adapter.close();}
}

export function traceMotion(trace:Trace){
  const steps:number[]=[],rotations:number[]=[],velocityChanges:number[]=[],authorityError:number[]=[],idealError:number[]=[],yawRates:number[]=[],yawChanges:number[]=[],speedRatios:number[]=[],idealYawError:number[]=[],authorityYawError:number[]=[];
  let maxMove={meters:0,timeMs:0},maxRotation={degrees:0,timeMs:0},maxVelocityChange={metersPerSecond:0,timeMs:0},velocityReversals=0,afterGap={meters:0,timeMs:0,gapMs:0},lastVelocity:undefined|[number,number,number],lastYawRate:number|undefined;
  for(let i=1;i<trace.samples.length;i++){
    const current=trace.samples[i],prior=trace.samples[i-1],dt=(current.timeMs-prior.timeMs)/1000,move=distance(current.visual,prior.visual);
    authorityError.push(distance(current.visual,current.authority));
    if(current.ideal){
      idealError.push(Math.hypot(current.visual.x-current.ideal.x,current.visual.y-current.ideal.y,current.visual.z-current.ideal.z));
      const d=heading(current.visual)-current.ideal.yaw;idealYawError.push(Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))*180/Math.PI);
    }
    if(current.authority.debug){const d=heading(current.visual)-current.authority.debug.yaw;authorityYawError.push(Math.abs(Math.atan2(Math.sin(d),Math.cos(d)))*180/Math.PI);}
    if(dt>frameMs/1000*1.5){if(move>afterGap.meters)afterGap={meters:move,timeMs:current.timeMs,gapMs:dt*1000};lastVelocity=undefined;lastYawRate=undefined;continue;}
    steps.push(move);if(move>maxMove.meters)maxMove={meters:move,timeMs:current.timeMs};
    const rotation=angle(current.visual,prior.visual)*180/Math.PI;rotations.push(rotation);
    if(rotation>maxRotation.degrees)maxRotation={degrees:rotation,timeMs:current.timeMs};
    const v:[number,number,number]=[(current.visual.x-prior.visual.x)/dt,(current.visual.y-prior.visual.y)/dt,(current.visual.z-prior.visual.z)/dt];
    const bodySpeed=current.visual.debug?.speedMps;
    if(bodySpeed!==undefined&&bodySpeed>10)speedRatios.push(Math.hypot(...v)/bodySpeed);
    const d=heading(current.visual)-heading(prior.visual),yawRate=Math.atan2(Math.sin(d),Math.cos(d))/dt*180/Math.PI;
    yawRates.push(Math.abs(yawRate));if(lastYawRate!==undefined)yawChanges.push(Math.abs(yawRate-lastYawRate));lastYawRate=yawRate;
    if(lastVelocity){
      const change=Math.hypot(v[0]-lastVelocity[0],v[1]-lastVelocity[1],v[2]-lastVelocity[2]);velocityChanges.push(change);
      if(change>maxVelocityChange.metersPerSecond)maxVelocityChange={metersPerSecond:change,timeMs:current.timeMs};
      if(Math.hypot(...v)>2&&Math.hypot(...lastVelocity)>2&&v[0]*lastVelocity[0]+v[1]*lastVelocity[1]+v[2]*lastVelocity[2]<0)velocityReversals++;
    }
    lastVelocity=v;
  }
  return {frameMoveP99M:rounded(percentile(steps,.99)),frameMoveMaxM:rounded(maxMove.meters),frameMoveMaxAtMs:rounded(maxMove.timeMs),
    frameRotationP99Degrees:rounded(percentile(rotations,.99)),frameRotationMaxDegrees:rounded(maxRotation.degrees),frameRotationMaxAtMs:rounded(maxRotation.timeMs),
    frameVelocityChangeP95Mps:rounded(percentile(velocityChanges,.95)),frameVelocityChangeMaxMps:rounded(maxVelocityChange.metersPerSecond),frameVelocityChangeMaxAtMs:rounded(maxVelocityChange.timeMs),
    frameVelocityReversals:velocityReversals,
    yawRateP95DegPerSec:yawRates.length?rounded(percentile(yawRates,.95)):null,yawRateMaxDegPerSec:yawRates.length?rounded(Math.max(...yawRates)):null,
    frameYawRateChangeP95DegPerSec:yawChanges.length?rounded(percentile(yawChanges,.95)):null,
    yawFromImmediateTickP95Degrees:idealYawError.length?rounded(percentile(idealYawError,.95)):null,yawFromServerTickP95Degrees:authorityYawError.length?rounded(percentile(authorityYawError,.95)):null,
    travelToBodySpeedRatio:speedRatios.length?{samples:speedRatios.length,p05:rounded(percentile(speedRatios,.05)),p50:rounded(percentile(speedRatios,.5)),p95:rounded(percentile(speedRatios,.95))}:null,
    distanceFromServerTickP95M:rounded(percentile(authorityError,.95)),distanceFromServerTickMaxM:rounded(Math.max(0,...authorityError)),
    distanceFromImmediateTickP95M:idealError.length?rounded(percentile(idealError,.95)):null,
    distanceFromImmediateTickMaxM:idealError.length?rounded(Math.max(...idealError)):null,
    afterFrameGap:{meters:rounded(afterGap.meters),atMs:rounded(afterGap.timeMs),gapMs:rounded(afterGap.gapMs)}};
}

export function measureResponse(trace:Trace,control:Trace,event:Event){
  const sameTime=new Map(control.samples.map(sample=>[sample.timeMs,sample]));
  let visual:number|null=null,authority:number|null=null,visualFrameMoveM:number|null=null,visualFrameRotationDegrees:number|null=null,visual1Degree:number|null=null,visual5Degrees:number|null=null;
  const eventSample=trace.samples.find(sample=>sample.timeMs+1e-6>=event.timeMs),eventSpeed=eventSample?.visual.debug?.speedMps;
  for(let i=0;i<trace.samples.length;i++){
    const sample=trace.samples[i];
    if(sample.timeMs+1e-6<event.timeMs)continue;
    const other=sameTime.get(sample.timeMs);if(!other)continue;
    const delta=event.measure==='position'?distance:event.measure==='height'?(a:Pose,b:Pose)=>a.y-b.y:event.measure==='yaw'?(a:Pose,b:Pose)=>{
      const d=heading(a)-heading(b);return Math.abs(Math.atan2(Math.sin(d),Math.cos(d)));
    }:angle;
    const angular=event.measure==='rotation'||event.measure==='yaw',threshold=angular?.002:.05;
    const visualDelta=delta(sample.visual,other.visual);
    if(angular&&visual1Degree===null&&visualDelta>Math.PI/180)visual1Degree=rounded(sample.timeMs-event.timeMs);
    if(angular&&visual5Degrees===null&&visualDelta>5*Math.PI/180)visual5Degrees=rounded(sample.timeMs-event.timeMs);
    if(visual===null&&visualDelta>threshold){
      visual=rounded(sample.timeMs-event.timeMs);
      const before=trace.samples[i-1];
      if(before){visualFrameMoveM=rounded(distance(sample.visual,before.visual));visualFrameRotationDegrees=rounded(angle(sample.visual,before.visual)*180/Math.PI);}
    }
    if(authority===null&&delta(sample.authority,other.authority)>threshold)authority=rounded(sample.timeMs-event.timeMs);
    if(visual!==null&&authority!==null&&(!angular||visual5Degrees!==null))break;
  }
  return {event:event.name,atMs:event.timeMs,measure:event.measure,threshold:event.measure==='rotation'||event.measure==='yaw'?'.002 rad':'.05 m',eventBodySpeedMps:eventSpeed===undefined?null:rounded(eventSpeed),firstVisualMs:visual,
    firstVisual1DegreeMs:visual1Degree,firstVisual5DegreesMs:visual5Degrees,firstVisualFrameMoveM:visualFrameMoveM,firstVisualFrameRotationDegrees:visualFrameRotationDegrees,firstServerTickMs:authority};
}

async function main(){
  const args=process.argv.slice(2);
  const option=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
  const selectedScenario=option('--scenario'),selectedProfile=option('--profile'),adapterPath=option('--adapter'),tracePath=option('--trace');
  const tankLevel=Number(option('--tank-level')??1);
  if(selectedScenario&&!scenarios.includes(selectedScenario as Scenario))throw new Error(`Unknown scenario: ${selectedScenario}`);
  if(selectedProfile&&!profiles.includes(selectedProfile as Profile))throw new Error(`Unknown profile: ${selectedProfile}`);
  if(!Number.isInteger(tankLevel)||tankLevel<1||tankLevel>5)throw new Error(`Unknown tank level: ${tankLevel}`);
  const factory:Factory=adapterPath?(await import(pathToFileURL(resolve(adapterPath)).href)).createMotionAdapter:(await import('./motion-adapter-ticks')).createMotionAdapter;
  if(typeof factory!=='function')throw new Error('Adapter must export createMotionAdapter(context)');
  const results:unknown[]=[],traces:Record<string,Trace>={};
  for(const scenario of selectedScenario?[selectedScenario as Scenario]:scenarios)for(const profile of selectedProfile?[selectedProfile as Profile]:profiles){
    const trace=runTrace(factory,scenario,profile,'',tankLevel as TankLevel),responses=[];
    if(tracePath)traces[`${scenario}/${profile}`]=trace;
    for(const event of events(scenario)){
      const control=runTrace(factory,scenario,profile,event.name,tankLevel as TankLevel);responses.push(measureResponse(trace,control,event));
      if(tracePath)traces[`${scenario}/${profile}/without-${event.name}`]=control;
    }
    results.push({scenario,profile,motion:traceMotion(trace),responses,network:trace.packets,adapter:trace.diagnostics});
  }
  const report={fixture:{renderHz:120,serverTickHz:20,tankLevel,durationMs:rounded(durationFrames*frameMs),
    transport:'FIFO, 0 or 75 ms one-way; bunched profile adds deterministic 125 ms spikes and -16.667 ms jitter',
    setup:'one controlled Roadster, starting at x=-300 and z=-2050 (ground) or z=-1850, y=100 (flight); initial ambient entities and pickups removed except one autonomous nearby NPC in fast-turn-npc; production traffic replenishment may spawn distant ambient vehicles after 5 s; no remote players or collision coverage; routes can cross the island oval and its banked surface',
    fastTurns:'full throttle from start; steer 0.7 at 3000 ms through 7000 ms; slalom alternates 0.7 and -0.7 every 500 ms from 3000 ms; flight-turn hovers at altitude',
    snapshotOverlay:'each delivered tick-adapter snapshot carries received time, server tick, acknowledged input and its controlled-car pose; samples also carry the present server tick pose and immediate-input reference',
    focusLoss:'client frames stop 4000–4600 ms and inputs clear; server ticks and socket delivery continue; resumed frame dt is capped at 100 ms',
    networkStall:'server-to-client messages sent 4000–4800 ms wait until 4800 ms plus base delay; upstream and server ticks continue',
    serverOverload:'only every other server tick runs 4000–4800 ms; inputs and snapshots can still be delivered; no later catch-up ticks are invented',
    teleport:'server applies a 30 m horizontal displacement at 4000 ms and calls the adapter relocation hook; reset uses the actual client action/barrier',
    response:'counterfactual traces disable only the named input interval; first position difference > .05 m, jump height increase > .05 m, or orientation/yaw difference > .002 rad; angular events also report 1 and 5 degree onset',
    travelRatio:'rendered frame-to-frame speed divided by predicted-body speed, sampled only when predicted-body speed exceeds 10 m/s; values can reflect correction, not physical wheel speed',
    yaw:'heading of rendered local +Z axis; yaw rate and frame-to-frame rate change use that heading rather than stored body yaw; reference/server yaw comparisons use discrete, possibly older, body poses and include support-normal tilt',
    velocityReversals:'consecutive rendered-frame velocity vectors point in opposite hemispheres and both exceed 2 m/s; these can also reflect legitimate abrupt maneuvers',
    immediateReference:'independent shared physics stepped every 50 ms without network using input at the start of each interval; sampled tick pose can be up to 50 ms old',
    limits:'Synthetic simulation and scene-transform emulation only; no GPU, browser, real network, remote collisions, ferry reference-frame rendering, throughput, or device claims.'},results};
  if(tracePath)await writeFile(resolve(tracePath),JSON.stringify({report,traces}));
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&realpathSync(resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url)))main().catch(error=>{console.error(error);process.exitCode=1;});

import assert from 'node:assert/strict';
import { analyze } from './analyze.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const secret='RECOVERY-DO-NOT-PRINT-827348';
const quat=degrees=>[0,Math.sin(degrees*Math.PI/360),0,Math.cos(degrees*Math.PI/360)];
const fixture=()=>{
  const frames=[];for(let t=0;t<=1500;t+=10)frames.push({atMs:t,localPredicted:true,snapLocal:false,snapCamera:false,menu:false,
    visual:{x:t/50,z:0,q:quat(0),secret},camera:{q:quat(0)},body:{vx:20,vz:0,supportId:'ground',health:100}});
  const states=[];for(let t=0;t<=1500;t+=100)states.push({atMs:t,tick:t/100,poseRevision:1,otherEntities:0,
    car:{supportId:'ground',health:100,pushX:0,pushZ:0},private:secret});
  const trace={frames,states,errors:0,dropped:{frames:0,states:0,sent:0,controls:0,events:0,marks:0,turnarounds:0},
    marks:[{atMs:0,label:'drive-start'},{atMs:4,label:secret},{atMs:1500,label:'drive-end'}],
    sent:[{atMs:20,seq:1,targetTick:4,input:{throttle:1,steer:0,brake:false,secret}}],
    controls:[{atMs:0,throttle:0,steer:0,brake:false,boost:false,hover:false},{atMs:10,throttle:1,steer:0,brake:false,boost:false,hover:false},
      {atMs:1460,throttle:0,steer:0,brake:false,boost:false,hover:false}],
    events:[{atMs:5,eventTimeMs:5,type:'keydown',code:'KeyW',trusted:true,repeat:false,secret},
      {atMs:7,type:'inputRejected',seq:2,reason:secret}, {atMs:8,type:'keydown',code:secret,private:secret},
      {atMs:1450,eventTimeMs:1450,type:'keyup',code:'KeyW',trusted:true,repeat:false}],
    turnarounds:[{seq:1,sentAtMs:50,receivedAtMs:200,elapsedMs:150,private:secret}]};
  const metadata={revision:'a'.repeat(40),observation:{complete:true},secret,setup:{networkProfile:'zero',
    clockBefore:{browserNowMs:0,nodeMinusBrowserMs:50,halfRoundTripMs:1},
    clockAfter:{browserNowMs:1500,nodeMinusBrowserMs:50,halfRoundTripMs:1}}};
  const network={profile:'zero',droppedEvents:0,overflow:false,sendsFailed:0,gap:{held:0},secret,events:[
    {event:'enqueued',id:1,releaseTargetNodeMs:130,private:secret},
    {event:'forwarded',id:1,direction:'down',type:'state',forwardInvokedNodeMs:140,queueDwellMs:40,private:secret},
    {event:'forwarded',id:2,direction:'down',type:'state',forwardInvokedNodeMs:240,queueDwellMs:30}]};
  return {trace,metadata,network};
};
{
 const f=fixture(),r=analyze(f);
 assert.equal(r.capture.complete,true);
 assert.equal(r.speedProxy.contactFreeProven,false);
 assert.equal(r.speedProxy.status,'diagnostic-only-contact-unproven');
 assert.ok(r.speedProxy.ratio.samples>20);
 assert.ok(Math.abs(r.speedProxy.ratio.min-1)<1e-10);
 assert.ok(Math.abs(r.speedProxy.ratio.max-1)<1e-10);
 assert.equal(r.input.events[0].atMs,5);
 assert.equal(r.input.events[0].observedControlDelayMs,5);
 assert.equal(r.input.events[1].observedControlDelayMs,10);
 assert.equal(r.input.sentInputs[0].atMs,20);
 assert.equal(r.input.inputRejections,1);
 assert.equal(r.input.gameObservedTurnaroundMs.p50,150);
 assert.equal(r.frames.sceneSubmittedIntervalMs.max,10);
 assert.equal(r.browserStateArrival.gapMs.max,100);
 assert.equal(r.routedMessages.directions.down.actualQueueDwellMs.samples,2);
 assert.equal(r.routedMessages.directions.down.targetLatenessMs.p50,10);
 assert.equal(r.routedMessages.directions.down.stateForwardGapMs.max,100);
 assert.ok(!JSON.stringify(r).includes(secret));
}
{
 const f=fixture();for(const s of f.trace.states)s.car.pushX=1;
 const r=analyze(f);assert.equal(r.speedProxy.ratio.samples,0);assert.ok(r.speedProxy.excludedIntervals.contactIndicators>0);
}
{
 const f=fixture();for(const s of f.trace.states)s.otherEntities=1;
 const r=analyze(f);assert.equal(r.speedProxy.ratio.samples,0);assert.ok(r.speedProxy.excludedIntervals.contactIndicators>0);
}
{
 const f=fixture();for(const x of f.trace.frames)x.body.vx=5;
 const r=analyze(f);assert.equal(r.speedProxy.ratio.samples,0);assert.ok(r.speedProxy.excludedIntervals.invalidFrame>0);
}
{
 const f=fixture();f.trace.frames.forEach((x,i)=>x.body.vx=i%2?20:25);
 const r=analyze(f);assert.equal(r.speedProxy.ratio.samples,0);assert.ok(r.speedProxy.excludedIntervals.unstableSpeed>0);
}
{
 const f=fixture();f.trace.states=f.trace.states.filter(x=>x.atMs%700===0);
 const r=analyze(f);assert.equal(r.speedProxy.ratio.samples,0);assert.ok(r.speedProxy.excludedIntervals.snapshotUnavailable>0);
}
{
 const f=fixture();f.trace.dropped.controls=1;
 const r=analyze(f);assert.equal(r.capture.complete,false);assert.equal(r.speedProxy.status,'unavailable-incomplete-capture');
}
{
 const f=fixture();delete f.trace.dropped.controls;
 assert.equal(analyze(f).capture.complete,false);
}
{
 const f=fixture();f.trace.frames[70].visual.q=quat(179);f.trace.frames[71].visual.q=quat(-179);
 const r=analyze(f);assert.ok(r.frames.vehicleYaw.absoluteStepDegrees.max<181);
}
{
 const r=analyze({});assert.equal(r.capture.complete,false);assert.equal(r.capture.frameCount,null);assert.equal(r.input.recordingAvailable,false);
 assert.equal(r.input.requiredTrustedEvents[0].observed,null);assert.equal(r.routedMessages.status,'unavailable');
 assert.equal(r.speedProxy.ratio.min,null);assert.equal(r.browserStateArrival.gapMs.max,null);
}
{
 const f=fixture();f.metadata.revision=secret;f.metadata.setup.networkProfile=secret;delete f.metadata.setup.clockAfter;
 const r=analyze(f);assert.equal(r.revision,null);assert.equal(r.profile,null);assert.equal(r.routedMessages.status,'unavailable-no-clock-calibration');assert.ok(!JSON.stringify(r).includes(secret));
}
{
 const f=fixture();[f.trace.frames[0],f.trace.frames[1]]=[f.trace.frames[1],f.trace.frames[0]];
 assert.equal(analyze(f).capture.orderedTimelines,false);assert.equal(analyze(f).capture.complete,false);
}
{
 const f=fixture();f.network.profile='gap250';
 assert.equal(analyze(f).capture.networkRecordingComplete,false);assert.equal(analyze(f).capture.complete,false);
}
{
 const d=mkdtempSync('/private/tmp/tesland-analyzer-test-');try{
   const f=fixture();for(const [name,value] of [['trace.json',f.trace],['metadata.json',f.metadata],['network-trace.json',f.network]])writeFileSync(join(d,name),JSON.stringify(value));
   const analyzer=fileURLToPath(new URL('./analyze.mjs',import.meta.url)),output=join(d,'analysis.json');
   const run=()=>spawnSync(process.execPath,[analyzer,d,'--out',output],{encoding:'utf8'});
   assert.equal(run().status,0);const contents=readFileSync(output,'utf8');assert.ok(!contents.includes(secret));
   assert.equal(JSON.parse(contents).speedProxy.status,'diagnostic-only-contact-unproven');
   assert.notEqual(run().status,0);assert.equal(readFileSync(output,'utf8'),contents);
 }finally{rmSync(d,{recursive:true,force:true});}
}
console.log('offline analyzer synthetic tests passed');

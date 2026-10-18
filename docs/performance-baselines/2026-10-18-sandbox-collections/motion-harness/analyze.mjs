#!/usr/bin/env node
// Offline diagnostic only. The predicted body is not a same-instant server
// reference, and sparse observations do not prove that contacts did not occur.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const number = x => typeof x === 'number' && Number.isFinite(x);
const num = x => number(x) ? x : null;
const integer = x => Number.isSafeInteger(x) ? x : null;
const list = x => Array.isArray(x) ? x : [];
const safeOrdered = xs => list(xs).filter(x=>x && number(x.atMs)).slice().sort((a,b)=>a.atMs-b.atMs);
const q = (v,p) => v.length ? v[Math.floor((v.length-1)*p)] : null;
const stats = raw => {
  const v=raw.filter(number).sort((a,b)=>a-b);
  return {samples:v.length,min:v.length?v[0]:null,p01:q(v,.01),p05:q(v,.05),p50:q(v,.50),p95:q(v,.95),p99:q(v,.99),max:v.length?v[v.length-1]:null};
};
const yaw = object => {
  const q=object?.q;if(!Array.isArray(q)||q.length!==4||!q.every(number))return null;
  const [x,y,z,w]=q;return Math.atan2(2*(x*z+y*w),1-2*(x*x+y*y));
};
const angle = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const bool = x => typeof x==='boolean'?x:null;
const keyCodes = new Set(['KeyW','KeyA','KeyD','Space','KeyE','KeyX']);
const profiles = new Set(['zero','steady150','bunched150','gap250']);
const keys = ['KeyW','KeyA','KeyD','Space'];
const expected = (code,type,c) => {
  const pressed=type==='keydown';
  if(code==='KeyW')return number(c.throttle)&&(pressed?c.throttle>0:c.throttle<=0);
  if(code==='KeyA')return number(c.steer)&&(pressed?c.steer>0:c.steer<=0);
  if(code==='KeyD')return number(c.steer)&&(pressed?c.steer<0:c.steer>=0);
  if(code==='Space')return typeof c.brake==='boolean'&&c.brake===pressed;
  return false;
};
const allowedControl = c => c && number(c.throttle) && c.throttle>=.9 && number(c.steer) && Math.abs(c.steer)<.001 && c.brake===false && c.boost===false && c.hover===false;
const speed = frame => number(frame?.body?.vx)&&number(frame?.body?.vz)?Math.hypot(frame.body.vx,frame.body.vz):null;
const validFrame = f => f?.localPredicted===true && f?.snapLocal===false && f?.snapCamera===false && f?.menu===false && f?.body?.supportId==='ground' && number(speed(f)) && speed(f)>10 && number(f?.body?.health) && ['x','z'].every(k=>number(f?.visual?.[k]));
const stateOK = s => s?.otherEntities===0 && s?.car?.supportId==='ground' && number(s?.car?.health) && number(s?.poseRevision) && number(s?.car?.pushX) && number(s?.car?.pushZ) && Math.hypot(s.car.pushX,s.car.pushZ)<.01;
function atOrBefore(xs,t) {let lo=0,hi=xs.length;while(lo<hi){const m=(lo+hi)>>1;if(xs[m].atMs<=t)lo=m+1;else hi=m;}return lo-1;}
function atOrAfter(xs,t) {let lo=0,hi=xs.length;while(lo<hi){const m=(lo+hi)>>1;if(xs[m].atMs<t)lo=m+1;else hi=m;}return lo;}
function frameYaw(frames,name){
  const rate=[],step=[],changes=[];let previousRate=null;
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i],dt=b.atMs-a.atMs,ya=yaw(a[name]),yb=yaw(b[name]);
    if(!(dt>0)||ya===null||yb===null){previousRate=null;continue;}
    const d=angle(ya,yb)*180/Math.PI,r=d*1000/dt;
    step.push(Math.abs(d));rate.push(Math.abs(r));
    if(previousRate!==null)changes.push(Math.abs(r-previousRate));
    previousRate=r;
  }
  return {absoluteStepDegrees:stats(step),absoluteRateDegreesPerSecond:stats(rate),absoluteSuccessiveRateChangeDegreesPerSecond:stats(changes)};
}
function networkSummary(network,start,end,setup){
  if(!network || typeof network!=='object')return {status:'unavailable'};
  const before=setup?.clockBefore,after=setup?.clockAfter;
  const calibrated=[before?.nodeMinusBrowserMs,after?.nodeMinusBrowserMs,before?.browserNowMs,after?.browserNowMs,before?.halfRoundTripMs,after?.halfRoundTripMs,start,end].every(number) && after.browserNowMs>before.browserNowMs;
  const offset=t=>before.nodeMinusBrowserMs+(after.nodeMinusBrowserMs-before.nodeMinusBrowserMs)*Math.max(0,Math.min(1,(t-before.browserNowMs)/(after.browserNowMs-before.browserNowMs)));
  const first=calibrated?start+offset(start):null,last=calibrated?end+offset(end):null;
  const events=list(network.events);
  const measured = e => calibrated && number(e.forwardInvokedNodeMs) && e.forwardInvokedNodeMs>=first && e.forwardInvokedNodeMs<=last;
  const forward=events.filter(e=>e?.event==='forwarded'&&['up','down'].includes(e.direction)&&measured(e));
  const enqueued=new Map(events.filter(e=>e?.event==='enqueued'&&Number.isSafeInteger(e.id)).map(e=>[e.id,e]));
  const directions={};
  for(const direction of ['up','down']){
    const items=forward.filter(e=>e.direction===direction);
    const latency=items.map(e=>e.queueDwellMs).filter(number);
    const lateness=items.flatMap(e=>{const start=enqueued.get(e.id);return number(start?.releaseTargetNodeMs)?[e.forwardInvokedNodeMs-start.releaseTargetNodeMs]:[];});
    const stateTimes=items.filter(e=>e.type==='state').map(e=>e.forwardInvokedNodeMs).sort((a,b)=>a-b);
    const matched=items.map(e=>enqueued.get(e.id)).filter(Boolean);
    directions[direction]={forwards:items.length,matchedEnqueues:matched.length,requestedBaseDelayMs:stats(matched.map(e=>e.requestedBaseDelayMs)),requestedJitterMs:stats(matched.map(e=>e.jitterMs)),requestedGapDelayMs:stats(matched.map(e=>e.gapDelayMs)),requestedFifoDelayMs:stats(matched.map(e=>e.fifoDelayMs)),actualQueueDwellMs:stats(latency),targetLatenessMs:stats(lateness),stateForwardGapMs:stats(stateTimes.slice(1).map((t,i)=>t-stateTimes[i]))};
  }
  const gap=network.gap || {};
  return {status:calibrated?'available':'unavailable-no-clock-calibration',
    clockAlignment:'Browser and Node clocks are distinct; window boundaries use interpolated midpoint offsets and are approximate.',
    approximateAlignmentUncertaintyMs:calibrated?Math.max(before.halfRoundTripMs,after.halfRoundTripMs)+Math.abs(after.nodeMinusBrowserMs-before.nodeMinusBrowserMs):null,
    directions:calibrated?directions:null,
    routeGap:{startNodeMs:num(gap.startAtNodeMs),targetEndNodeMs:num(gap.endTargetAtNodeMs),firstAfterNodeMs:num(gap.firstAfterNodeMs),held:integer(gap.held)},
    recording:{droppedEvents:integer(network.droppedEvents),overflow:bool(network.overflow),sendsFailed:integer(network.sendsFailed)},
    limitation:'Forward times are Playwright send invocations, not network or browser delivery; application messages are delayed, not physical packets.'};
}
export function analyze({trace,metadata,network}) {
  trace=trace&&typeof trace==='object'?trace:{};metadata=metadata&&typeof metadata==='object'?metadata:{};
  const marks=list(trace.marks),start=marks.find(m=>m?.label==='drive-start')?.atMs,end=marks.find(m=>m?.label==='drive-end')?.atMs;
  const windowOK=number(start)&&number(end)&&end>start;
  const within=x=>windowOK&&x.atMs>=start&&x.atMs<=end;
  const frames=safeOrdered(trace.frames).filter(within),states=safeOrdered(trace.states),windowStates=states.filter(within),controls=safeOrdered(trace.controls);
  const events=safeOrdered(trace.events).filter(within).filter(e=>['keydown','keyup'].includes(e.type)&&keyCodes.has(e.code));
  const reasons={invalidFrame:0,invalidInterval:0,control:0,insufficientHistory:0,unstableSpeed:0,snapshotUnavailable:0,contactIndicators:0};
  const ratios=[];
  for(let i=1;i<frames.length;i++){
    const a=frames[i-1],b=frames[i],dt=b.atMs-a.atMs;
    if(!validFrame(a)||!validFrame(b)){reasons.invalidFrame++;continue;}
    if(!(dt>0&&dt<=250)){reasons.invalidInterval++;continue;}
    const ci=atOrBefore(controls,a.atMs),c=controls[ci],ci2=atOrBefore(controls,b.atMs);
    if(!allowedControl(c)||ci!==ci2 || c.atMs>a.atMs-500){reasons.control++;continue;}
    const j=atOrBefore(frames,a.atMs-500);
    if(j<0){reasons.insufficientHistory++;continue;}
    const history=frames.slice(j,i+1);
    if(history.some((f,k)=>!validFrame(f)||f.body.health!==history[0].body.health||(k>0&&(f.atMs-history[k-1].atMs>100||f.atMs<=history[k-1].atMs)))){reasons.insufficientHistory++;continue;}
    const speeds=history.map(speed),mean=speeds.reduce((sum,v)=>sum+v,0)/speeds.length;
    if(Math.max(...speeds)-Math.min(...speeds)>Math.max(1,.05*mean)){reasons.unstableSpeed++;continue;}
    const si=atOrBefore(states,a.atMs),ei=atOrAfter(states,b.atMs);
    if(si<0||ei>=states.length||states[ei].atMs-states[si].atMs>500){reasons.snapshotUnavailable++;continue;}
    const bracket=states.slice(si,ei+1),first=bracket[0],last=bracket[bracket.length-1];
    if(!bracket.every(s=>stateOK(s)&&s.poseRevision===first.poseRevision&&s.car.health===first.car.health)){reasons.contactIndicators++;continue;}
    const displayM=Math.hypot(b.visual.x-a.visual.x,b.visual.z-a.visual.z),predicted=(speed(a)+speed(b))/2;
    ratios.push({atMs:b.atMs,ratio:displayM/(dt/1000)/predicted});
  }
  const inputEvents=events.map(e=>{
    const boundary=events.find(next=>next.atMs>e.atMs&&next.code===e.code)?.atMs ?? end;
    const observed=controls.find(c=>c.atMs>=e.atMs&&c.atMs<=boundary&&expected(e.code,e.type,c));
    return {type:e.type,code:e.code,atMs:e.atMs,relativeMs:e.atMs-start,eventTimeMs:num(e.eventTimeMs),trusted:bool(e.trusted),repeat:bool(e.repeat),
      nextMatchingControlAtMs:observed?observed.atMs:null,observedControlDelayMs:observed?observed.atMs-e.atMs:null};
  });
  const inputControls=controls.filter(within).map(c=>({atMs:c.atMs,relativeMs:c.atMs-start,throttle:num(c.throttle),steer:num(c.steer),brake:bool(c.brake),boost:bool(c.boost),hover:bool(c.hover)}));
  const sentInputs=safeOrdered(trace.sent).filter(within).map(s=>({atMs:s.atMs,relativeMs:s.atMs-start,seq:integer(s.seq),targetTick:integer(s.targetTick),throttle:num(s.input?.throttle),steer:num(s.input?.steer),brake:bool(s.input?.brake)}));
  const required=keys.flatMap(code=>['keydown','keyup'].map(type=>({code,type,observed:Array.isArray(trace.events)?events.some(e=>e.code===code&&e.type===type&&e.trusted===true):null})));
  const intervals=frames.slice(1).map((f,i)=>f.atMs-frames[i].atMs).filter(n=>n>0);
  const stateGaps=windowStates.slice(1).map((s,i)=>({startRelativeMs:windowStates[i].atMs-start,endRelativeMs:s.atMs-start,gapMs:s.atMs-windowStates[i].atMs,tickAdvance:number(s.tick)&&number(windowStates[i].tick)?s.tick-windowStates[i].tick:null})).filter(g=>g.gapMs>0);
  const largestGaps=stateGaps.slice().sort((a,b)=>b.gapMs-a.gapMs).slice(0,10).map(g=>{
    const local=frames.filter(f=>f.atMs>=start+g.startRelativeMs&&f.atMs<=start+g.endRelativeMs);
    const localRatios=ratios.filter(r=>r.atMs>=start+g.startRelativeMs&&r.atMs<=start+g.endRelativeMs).map(r=>r.ratio);
    return {...g,sceneFrames:local.length,vehicleYaw:frameYaw(local,'visual'),cameraYaw:frameYaw(local,'camera'),speedProxy:stats(localRatios)};
  });
  const rejected=list(trace.events).filter(e=>within(e)&&e.type==='inputRejected').length;
  const turnarounds=list(trace.turnarounds).filter(t=>number(t.receivedAtMs)&&t.receivedAtMs>=start&&t.receivedAtMs<=end).map(t=>t.elapsedMs);
  const dropKeys=['frames','states','sent','controls','events','marks','turnarounds'];
  const orderFields=[['frames','atMs'],['states','atMs'],['sent','atMs'],['controls','atMs'],['events','atMs'],['marks','atMs'],['turnarounds','receivedAtMs']];
  const ordered=orderFields.every(([key,field])=>Array.isArray(trace[key])&&trace[key].every((item,i,items)=>number(item?.[field])&&(i===0||item[field]>=items[i-1][field])));
  const networkComplete=!!network&&Array.isArray(network.events)&&network.droppedEvents===0&&network.overflow===false&&network.sendsFailed===0&&network.profile===metadata?.setup?.networkProfile&&profiles.has(network.profile);
  const captureComplete=metadata?.observation?.complete===true && windowOK && ordered && networkComplete && frames.length>1 && windowStates.length>1 && trace.errors===0 && dropKeys.every(k=>trace.dropped?.[k]===0);
  const result={format:1,kind:'offline-motion-diagnostic-not-release-gate',
    revision:typeof metadata.revision==='string'&&/^[0-9a-f]{40}$/.test(metadata.revision)?metadata.revision:null,
    profile:profiles.has(metadata?.setup?.networkProfile)?metadata.setup.networkProfile:null,
    capture:{complete:captureComplete,orderedTimelines:ordered,networkRecordingComplete:networkComplete,windowAvailable:windowOK,startBrowserMs:num(start),endBrowserMs:num(end),frameCount:Array.isArray(trace.frames)?frames.length:null,stateCount:Array.isArray(trace.states)?windowStates.length:null,
      dropped:Object.fromEntries(dropKeys.map(k=>[k,integer(trace.dropped?.[k])])),traceErrors:integer(trace.errors)},
    input:{recordingAvailable:Array.isArray(trace.events),events:inputEvents,controls:inputControls,sentInputs,requiredTrustedEvents:required,inputRejections:rejected,gameObservedTurnaroundMs:stats(turnarounds),
      note:'Control matches are the first later sampled control meeting the requested state before the next same-key event; this is not causality or input-to-photon latency. Turnaround includes server processing and snapshot cadence.'},
    frames:{sceneSubmittedIntervalMs:stats(intervals),vehicleYaw:frameYaw(frames,'visual'),cameraYaw:frameYaw(frames,'camera'),
      vehicleSnapCount:frames.filter(f=>f.snapLocal===true).length,cameraSnapCount:frames.filter(f=>f.snapCamera===true).length,
      note:'Scene callback timestamps and transforms do not establish GPU completion, presentation, or photons; absolute yaw and rate changes do not alone prove a surge.'},
    speedProxy:{status:!captureComplete?'unavailable-incomplete-capture':ratios.length?'diagnostic-only-contact-unproven':'unavailable-no-qualifying-samples',
      contactFreeProven:false,ratio:stats(ratios.map(x=>x.ratio)),excludedIntervals:reasons,
      filter:'Within drive window: adjacent predicted, unsnapped, non-menu ground frames above 10 m/s horizontal predicted-body speed; 0 < frame interval <= 250 ms; unchanged full-throttle straight, no-brake/boost/hover control for >= 500 ms; all prior 500 ms frames valid with gaps <= 100 ms unchanged predicted health and speed span <= max(1 m/s, 5% of mean); bracketing authoritative states <= 500 ms apart, no other entities, ground support, unchanged health and pose revision, push magnitude < 0.01. Each ratio is horizontal mesh displacement / elapsed time / mean horizontal predicted-body speed.',
      limitation:'No-contact indicators are not proof of contact-free movement: static collisions can occur between snapshots without health or retained push changes. The predicted body is a proxy, not a same-instant authoritative reference. This diagnostic cannot establish the release gate.'},
    browserStateArrival:{gapMs:stats(stateGaps.map(g=>g.gapMs)),largestGaps,note:'Browser-side state-arrival gaps, not packet-loss measurements. Motion observations inside each gap share the browser clock, but timing association is not evidence of causality and the speed ratio is only a proxy.'},
    routedMessages:networkSummary(network,start,end,metadata.setup),
    privacy:'Only explicitly selected numeric timing, geometry-derived aggregates, known input codes, booleans, and allowlisted revision/profile are emitted. Raw messages, identities, recovery codes, chat text and arbitrary metadata are not echoed.'};
  return result;
}
async function loadJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error?.code==='ENOENT')return null;throw new Error('Could not parse input JSON');}}
async function cli(){
  const {values,positionals}=parseArgs({options:{out:{type:'string'}},allowPositionals:true});
  if(positionals.length!==1)throw new Error('Usage: node analyze.mjs TRACE_DIRECTORY [--out /private/tmp/NEW_FILE.json]');
  const dir=resolve(positionals[0]);
  const [trace,metadata,network]=await Promise.all(['trace.json','metadata.json','network-trace.json'].map(name=>loadJson(join(dir,name))));
  const report=JSON.stringify(analyze({trace,metadata,network}),null,2)+'\n';
  if(values.out){const out=resolve(values.out);if(!out.startsWith('/private/tmp/'))throw new Error('Output must be under /private/tmp');await writeFile(out,report,{flag:'wx',mode:0o600});}
  else process.stdout.write(report);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)cli().catch(error=>{console.error(error.message);process.exitCode=1;});

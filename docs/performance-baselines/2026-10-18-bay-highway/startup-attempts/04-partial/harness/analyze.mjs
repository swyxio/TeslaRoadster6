// DRAFT ONLY: never use as a passing gate before review and validation.
// Reads retained manifest and incremental trace for one leg; writes JSON to stdout.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root=process.argv[2];
if(!root) throw Error('Usage: node analyze.mjs LEG_BROWSER_DIRECTORY');
const readJson=async f=>{try{return JSON.parse(await readFile(join(root,f),'utf8'));}catch{return null;}};
const manifest=await readJson('manifest.json');
let raw='';try{raw=await readFile(join(root,'live-events.ndjson'),'utf8');}catch{}
let invalidLines=0;
const events=raw.split('\n').filter(Boolean).flatMap(line=>{try{const v=JSON.parse(line);if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.kind!=='string')throw Error('invalid event');return [v];}catch{invalidLines++;return [];}});
const finite=Number.isFinite;
const ev=(kind)=>events.filter(e=>e.kind===kind);
const steps=Array.isArray(manifest?.events)?manifest.events.filter(s=>s&&typeof s==='object'&&!Array.isArray(s)):[];
const step=(type)=>steps.find(s=>s.type===type);
const gesture=ev('key-command-start')[0], start=gesture?.commandStartAtMs;
const observedEnd=ev('key-observation-end')[0]?.deadlineAtMs;
const end=finite(observedEnd)?observedEnd:finite(start)?start+10000:null;
const outcome=ev('key-command-outcome')[0];
const active=e=>finite(start)&&finite(end)&&finite(e.atMs)&&e.atMs>=start&&e.atMs<=end;
const reasons=[];
if(!manifest || manifest.status!=='complete')reasons.push('manifest missing or incomplete');
if(!raw || !raw.endsWith('\n') || invalidLines || ev('recorder-finalizing').length!==1 || events.at(-1)?.kind!=='recorder-finalizing')reasons.push('incremental event stream missing, incomplete, malformed or finalizer not last');
if(events.some((e,i)=>!finite(e.atMs)||(i>0&&e.atMs<events[i-1].atMs)))reasons.push('event timestamps missing or out of order');
if(!Array.isArray(manifest?.events)||steps.length!==manifest.events.length||steps.some(s=>typeof s.type!=='string'||!finite(s.commandStartedAtMs)||!finite(s.commandDurationMs)||!['ok','failed'].includes(s.status)))reasons.push('manifest action schema missing or malformed');
if(manifest?.liveTrace?.truncated!==false || manifest?.liveTrace?.error!==null || manifest?.snapshots?.truncated!==false || manifest?.trajectory?.status!=='available')reasons.push('trace or snapshot completeness flags missing, truncated or failed');
if(!finite(start) || !outcome || outcome.status!=='completed' || !finite(outcome.atMs) || outcome.atMs<start || outcome.atMs>end)reasons.push('first KeyV command absent, failed, late or timed out');
if(!finite(observedEnd)||!finite(start)||Math.abs((observedEnd-start)-10000)>1e-6)reasons.push('10-second observation did not finish');
const ref=manifest?.target?.refProvidedByOperator;
const expectedProtocol=ref==='fa1713cda3335e0caa1b798e3025e22e8e51ba76'?50:ref==='a1358fe83147eb2657bd815d4d437b86eacb9eb1'?51:null;
const welcome=ev('welcome');
if(expectedProtocol===null || welcome.length!==1 || welcome[0].version!==expectedProtocol)reasons.push('target reference or welcome protocol not verified');
if(manifest?.browserErrors?.pageErrors!==0 || manifest?.browserErrors?.consoleErrors!==0 || ev('page-error').length || ev('console-error').length)reasons.push('page or console error status is missing or errors were observed');
const ready=step('waitForRoomReady'), begin=step('beginRoom'), running=step('verifyRunningCar');
if(ready?.status!=='ok'||begin?.status!=='ok'||running?.status!=='ok'||ready.sample?.npcIdentityPreserved!==true||ready.sample?.controlledEntityId!=='ride-highway-startup-probe'||ready.sample?.controlledIdCount!==1||ready.sample?.controlledDriverMatches!==true||ready.sample?.controlledOwnerMatches!==true||ready.sample?.poseRevision!==1||begin.sample?.after?.controlledEntityId!=='ride-highway-startup-probe'||begin.sample?.after?.controlledIdCount!==1||begin.sample?.after?.controlledDriverMatches!==true||begin.sample?.after?.controlledOwnerMatches!==true||begin.sample?.after?.poseRevision!==1||running.sample?.controlledIdMatches!==true||running.sample?.pose?.poseRevision!==1)reasons.push('staged identity, NPC integrity or running pose not verified');
const allStates=ev('state').filter(e=>finite(e.receivedAtMs));
const allPoses=ev('controlled-pose');
if(allStates.length!==ev('state').length||allPoses.some(e=>!finite(e.receivedAtMs))||[...allStates,...allPoses].some(e=>e.receivedAtMs<0||e.receivedAtMs>e.atMs)||allStates.some((e,i)=>i>0&&e.receivedAtMs<allStates[i-1].receivedAtMs)||allPoses.some((e,i)=>i>0&&e.receivedAtMs<allPoses[i-1].receivedAtMs))reasons.push('state or pose receive times missing, impossible or out of order');
if(!Number.isSafeInteger(manifest?.snapshots?.samples)||manifest.snapshots.samples!==allStates.length||!Number.isSafeInteger(manifest?.trajectory?.samples)||manifest.trajectory.samples!==allPoses.length)reasons.push('manifest state or pose counts do not match the event stream');
const inStates=allStates.filter(e=>e.receivedAtMs>=start&&e.receivedAtMs<=end);
const beforeState=allStates.filter(e=>e.receivedAtMs<=start).at(-1);
const afterState=allStates.find(e=>e.receivedAtMs>=end);
const maxGapMs=(a,b)=>{
  if(!a.length)return null;
  let max=0; for(let i=1;i<a.length;i++)max=Math.max(max,a[i]-a[i-1]);
  return Math.max(max,a[0]-b[0],b[1]-a.at(-1));
};
const burst=[];
for(let i=0;i+3<inStates.length;i++){
  const a=inStates[i], b=inStates[i+3];
  if(finite(a.tick)&&finite(b.tick)&&b.tick>a.tick&&b.receivedAtMs-a.receivedAtMs<=5)burst.push({fromTick:a.tick,toTick:b.tick,arrivalSpanMs:b.receivedAtMs-a.receivedAtMs});
}
const revisions=[...new Set(inStates.map(e=>e.poseRevision))];
const activeTicks=inStates.map(e=>e.tick);
const monotonic=activeTicks.every((t,i)=>Number.isSafeInteger(t)&&(!i||t>activeTicks[i-1]));
const edgeStatus=!!(beforeState&&afterState&&inStates.length&&beforeState.poseRevision===1&&afterState.poseRevision===1);
const incomingGaps=maxGapMs(inStates.map(e=>e.receivedAtMs),[start,end]);
const actions=ev('ws-send').filter(e=>e.messageType==='autopilot'&&active(e));
const outAction=actions[0];
const outSync=ev('ws-send').find(e=>e.messageType==='sync'&&outAction&&e.atMs>=outAction.atMs&&e.atMs<=end);
const syncAck=outSync&&allStates.find(e=>e.receivedAtMs>=outSync.atMs&&e.receivedAtMs<=end&&Number.isSafeInteger(e.sync)&&e.sync>=outSync.token);
if(actions.length!==1||!outSync||!Number.isSafeInteger(outSync.token)||!syncAck)reasons.push('single autopilot action or matching sync barrier unobserved');
const pose=allPoses.filter(e=>finite(e.receivedAtMs));
const initial=pose.filter(e=>e.receivedAtMs<=start&&e.controlledIdMatches===true&&e.poseRevision===1).at(-1);
const after=pose.filter(e=>e.receivedAtMs>=start&&e.receivedAtMs<=end);
const coveredStates=[beforeState,...inStates,afterState].filter(Boolean);
const completePoses=coveredStates.every(s=>pose.some(p=>p.receivedAtMs===s.receivedAtMs&&p.tick===s.tick&&p.controlledIdMatches===true&&p.poseRevision===1&&finite(p.x)&&finite(p.z)));
const consistent=initial&&after.every(e=>e.controlledIdMatches===true&&e.poseRevision===1&&Number.isSafeInteger(e.tick)&&finite(e.x)&&finite(e.z));
const firstMove=consistent&&after.find(e=>Math.hypot(e.x-initial.x,e.z-initial.z)>=0.25);
// State is normally emitted every 100 ms; the preregistered 500 ms limit is
// a conservative missing-coverage alarm, not a playable-performance budget.
if(!edgeStatus || !monotonic || burst.length || revisions.length!==1 || revisions[0]!==1 || incomingGaps===null || incomingGaps>500)reasons.push('snapshot edges, >500 ms gap, monotonicity, pose revision or burst make timing coverage unavailable');
if(!initial || !finite(initial.speed) || Math.abs(initial.speed)>0.2 || start-initial.receivedAtMs>500 || !consistent || !completePoses || !firstMove)reasons.push('authoritative pose coverage, stationary pre-gesture anchor or motion onset missing or censored');
if(firstMove && (!outAction || firstMove.receivedAtMs<outAction.atMs))reasons.push('movement was observed before the autopilot action');
const anchor=step('clockAnchor')?.sample, frame=step('frameStop')?.sample, probe=step('probeRead')?.sample;
const anchorOk=anchor&&finite(anchor.before)&&finite(anchor.after)&&finite(anchor.pageClock?.now)&&anchor.after>=anchor.before;
const offsetLow=anchorOk?anchor.before-anchor.pageClock.now:null;
const offsetHigh=anchorOk?anchor.after-anchor.pageClock.now:null;
const uncertainty=anchorOk?offsetHigh-offsetLow:null;
const frameTimes=frame?.framesAtMs;
const frameOk=anchorOk&&uncertainty<=10&&Array.isArray(frameTimes)&&frame.truncated===false&&frameTimes.every((t,i)=>finite(t)&&(!i||t>frameTimes[i-1]));
// The interval boundary is uncertain by the clock-anchor round trip. A gap is
// reported as an interval, not a precisely aligned point estimate.
let frameSummary=null;
if(frameOk){
  const lo=start-offsetHigh, hi=start-offsetLow, elo=end-offsetHigh, ehi=end-offsetLow;
  const pred=frameTimes.filter(t=>t<lo).at(-1);
  const succ=frameTimes.find(t=>t>ehi);
  if(finite(pred)&&finite(succ)){
    const spans=[];
    for(let i=1;i<frameTimes.length;i++)if(frameTimes[i]>lo&&frameTimes[i-1]<ehi)spans.push(frameTimes[i]-frameTimes[i-1]);
    frameSummary={maxObservedGapMs:Math.max(...spans),longFrameCountOver50:spans.filter(n=>n>50).length,clockOffsetRangeMs:[offsetLow,offsetHigh],firstEdgeGapRangeMs:[Math.max(0,lo-pred),Math.max(0,hi-pred)],lastEdgeGapRangeMs:[Math.max(0,succ-ehi),Math.max(0,succ-elo)],note:'Full callback gaps intersecting the clock-uncertain window are reported, including pre/post boundary; may include a small amount outside it.'};
  }
}
if(!frameSummary)reasons.push('frame timestamps, edges or clock-anchor precision unavailable');
const pageEvents=Array.isArray(probe?.events)?probe.events:[];
if(pageEvents.some(e=>!e||typeof e!=='object'||Array.isArray(e)||typeof e.type!=='string'||!finite(e.atMs)))reasons.push('page event stream malformed');
const firstGesture=pageEvents.find(e=>e&&typeof e==='object'&&['keydown','pointerdown'].includes(e.type));
const cold=pageEvents.length<500&&firstGesture?.type==='keydown'&&firstGesture.code==='KeyV'&&firstGesture.trusted===true;
if(!cold)reasons.push('first trusted page gesture is not verified as KeyV');
const pageKeyRange=cold&&anchorOk&&finite(firstGesture.atMs)?[firstGesture.atMs+offsetLow,firstGesture.atMs+offsetHigh]:null;
if(!pageKeyRange||!finite(start)||!finite(outcome?.atMs)||!outAction||pageKeyRange[0]<start||pageKeyRange[1]>outcome.atMs||pageKeyRange[1]>outAction.atMs)
  reasons.push('trusted KeyV cannot be clock-bounded to the command before its action');
const report={status:reasons.length?'censored':'evidence-complete',reasons,target:manifest?.target,startedAt:manifest?.startedAt,
  command:{startAtMs:start??null,outcome:outcome??null,durationMs:outcome&&finite(start)?outcome.atMs-start:null},
  page:{firstGesture:firstGesture??null,firstGestureCold:cold,keyNodeTimeRangeMs:pageKeyRange,events:pageEvents,displayedMotion:'unmeasured'},
  action:{autopilotSentAtMs:outAction?.atMs??null,syncSentAtMs:outSync?.atMs??null,syncToken:outSync?.token??null,syncAcknowledgedAtMs:syncAck?.receivedAtMs??null},
  snapshot:{window:[start,end],count:inStates.length,preEdgeAtMs:beforeState?.receivedAtMs??null,postEdgeAtMs:afterState?.receivedAtMs??null,maxWindowGapMs:incomingGaps,monotonicTicks:monotonic,revisions,coalescedWindows:burst.length,throughput:'unavailable: 10-second startup probe'},
  motion:{initial:initial??null,firstAtOrBeyondQuarterMeter:firstMove??null,gestureToFirstReceivedMotionMs:firstMove&&finite(start)?firstMove.receivedAtMs-start:null},
  frame:frameSummary,limits:'Unreviewed, single-leg diagnostics. Authoritative pose is not displayed motion; no GPU, capacity, real-device or regression conclusion.'};
console.log(JSON.stringify(report,null,2));
if(reasons.length)process.exitCode=2;

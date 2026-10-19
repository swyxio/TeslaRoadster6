// Compare only complete legs from the same supervised, fixed-identity run.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const [runRoot, expectedA, expectedB] = process.argv.slice(2);
if (!runRoot || !/^[0-9a-f]{40}$/.test(expectedA ?? '') || !/^[0-9a-f]{40}$/.test(expectedB ?? '') || expectedA === expectedB)
  throw Error('Usage: node compare.mjs RUN_DIR BASE_REF CANDIDATE_REF (distinct full 40-character Git refs)');
const read = async (dir,path) => JSON.parse(await readFile(join(dir,path),'utf8'));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const percentile = (xs,p) => [...xs].sort((a,b) => a-b)[Math.floor((xs.length-1)*p)];
const round = n => Math.round(n*1000)/1000;
const report = {status:'HOLD', reasons:[], baseline:null, candidate:null, limits:'One local pair; browser callback intervals are not GPU or display timings. No displayed-motion, physical-device, WAN or capacity claim.'};
function path(poses) {
  const lengths=[0];
  for(let i=1;i<poses.length;i++) lengths.push(lengths[i-1]+Math.hypot(poses[i].x-poses[i-1].x,poses[i].y-poses[i-1].y,poses[i].z-poses[i-1].z));
  let k=1;const total=lengths.at(-1);
  const points=Array.from({length:41},(_,i)=>{const d=total*i/40;while(k<lengths.length-1&&lengths[k]<d)k++;const a=poses[k-1],b=poses[k],span=lengths[k]-lengths[k-1],t=span?(d-lengths[k-1])/span:0;return ['x','y','z'].map(axis=>a[axis]+(b[axis]-a[axis])*t);});
  return {lengthM:total,points};
}
async function leg(name, expected, index, journal) {
  const root=join(runRoot,`leg-${index}-${name}`);
  const starts=journal.filter(e=>e.event==='leg-start'&&e.index===index);
  const ends=journal.filter(e=>e.event==='leg-end'&&e.index===index);
  const analyses=journal.filter(e=>e.event==='leg-analysis'&&e.index===index);
  if(starts.length!==1||ends.length!==1||analyses.length!==1||starts[0].id!==name||ends[0].id!==name||starts[0].ref!==expected||analyses[0].status!=='evidence-complete'||analyses[0].analyzerSha256!==starts[0].fixture?.['analyze.mjs'])throw Error(`${name} supervisor provenance incomplete or mismatched`);
  const meta=starts[0];
  const [m,a,status,poses,raw] = await Promise.all([read(root,'browser/manifest.json'),read(root,'analysis.raw.json'),read(root,'analysis-status.json'),read(root,'browser/trajectory.json'),readFile(join(root,'browser/live-events.ndjson'),'utf8')]);
  if(!raw.endsWith('\n'))throw Error(`${name} live trace incomplete`);
  const events=raw.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const step = n => m.events.find(e=>e.type===n&&e.status==='ok')?.sample;
  const frame=step('frameStop'), last=step('sample'), commandStart=a.command?.startAtMs, key=a.page?.firstGesture?.atMs, keyRange=a.page?.keyNodeTimeRangeMs;
  const keyRangeValid=Array.isArray(keyRange)&&keyRange.length===2&&keyRange.every(finite)&&keyRange[1]>=keyRange[0]&&keyRange[1]-keyRange[0]<=10&&keyRange[1]>=commandStart&&keyRange[0]<=a.command?.outcome?.atMs;
  const start=keyRangeValid?(keyRange[0]+keyRange[1])/2:null;
  const env={cpu:m.runner?.cpu,platform:m.runner?.platform,arch:m.runner?.architecture,renderer:m.runner?.webgl?.renderer,viewport:m.viewport,recorder:m.runner?.recorderSourceSha256,browser:m.runner?.browserVersion};
  if(a.status!=='evidence-complete'||status.status!=='evidence-complete'||status.analyzerSha256!==meta.fixture?.['analyze.mjs']||m.status!=='complete'||m.target?.refProvidedByOperator!==expected||!finite(start)||!finite(key)||!keyRangeValid||!finite(a.command?.durationMs)||!finite(a.frame?.maxObservedGapMs)||!finite(a.page?.keydownToAutopilotSendMs)||!Array.isArray(poses)||!Array.isArray(frame?.framesAtMs)||frame.truncated!==false||!last?.connection?.startsWith('● LIVE')||!(last.perf?.drawCalls>0)||m.browserErrors?.pageErrors!==0||m.browserErrors?.consoleErrors!==0||m.liveTrace?.truncated!==false||m.liveTrace?.error!==null||m.snapshots?.truncated!==false||m.trajectory?.status!=='available'||m.runner?.recorderSourceSha256!==meta.fixture?.['scripts/playtest-record.ts']||Object.values(env).some(v=>v===undefined||v===null||v==='')||!Number.isFinite(env.viewport?.width)||!Number.isFinite(env.viewport?.height))throw Error(`${name} incomplete identity, startup, render or live-room evidence`);
  const states=events.filter(e=>e.kind==='state'), controlled=events.filter(e=>e.kind==='controlled-pose');
  if(!states.length||m.snapshots.samples!==states.length||m.trajectory.samples!==controlled.length||poses.length!==controlled.length||events.at(-1)?.kind!=='recorder-finalizing')throw Error(`${name} state or pose counts incomplete`);
  const before=states.filter(s=>finite(s.receivedAtMs)&&s.receivedAtMs<keyRange[0]).at(-1), after=states.find(s=>finite(s.receivedAtMs)&&s.receivedAtMs>keyRange[1]+64000);
  const inside=states.filter(s=>finite(s.receivedAtMs)&&s.receivedAtMs>=start&&s.receivedAtMs<=start+64000);
  if(!before||!after||inside.length<200||inside[0].receivedAtMs-start>250||start+64000-inside.at(-1).receivedAtMs>250)throw Error(`${name} missing state window edges`);
  const window=states.filter(s=>finite(s.receivedAtMs)&&s.receivedAtMs>=before.receivedAtMs&&s.receivedAtMs<=after.receivedAtMs);
  if(window.some((s,i)=>!Number.isSafeInteger(s.tick)||s.poseRevision!==1||!finite(s.worldTime)||!finite(s.receivedAtMs)||(i&&(s.receivedAtMs<=window[i-1].receivedAtMs||s.tick-window[i-1].tick!==2||s.worldTime<window[i-1].worldTime))))throw Error(`${name} state order or revision changed`);
  if(window.some((s,i)=>i+3<window.length&&window[i+3].tick>s.tick&&window[i+3].receivedAtMs-s.receivedAtMs<=5))throw Error(`${name} coalesced snapshot burst`);
  const gaps=window.slice(1).map((s,i)=>s.receivedAtMs-window[i].receivedAtMs);
  if(Math.max(...gaps)>2000)throw Error(`${name} snapshot gap over 2 seconds`);
  const poseByTime=new Map(), recordedByTime=new Map();
  for(const p of controlled) {if(!finite(p.receivedAtMs)||poseByTime.has(p.receivedAtMs))throw Error(`${name} duplicate or invalid controlled pose`);poseByTime.set(p.receivedAtMs,p);}
  for(const p of poses) {if(!finite(p.atMs)||recordedByTime.has(p.atMs))throw Error(`${name} duplicate or invalid trajectory`);recordedByTime.set(p.atMs,p);}
  for(const s of window){const p=poseByTime.get(s.receivedAtMs), t=recordedByTime.get(s.receivedAtMs);
    if(!p||!t||p.controlledIdMatches!==true||p.tick!==s.tick||t.tick!==s.tick||p.poseRevision!==1||t.poseRevision!==1||![p.x,p.y,p.z,t.x,t.y,t.z,t.worldTime].every(finite)||p.x!==t.x||p.y!==t.y||p.z!==t.z||s.worldTime!==t.worldTime)throw Error(`${name} controlled identity, pose or state coverage changed`);
  }
  const chosen=inside.map(s=>recordedByTime.get(s.receivedAtMs));
  if(chosen.some((p,i)=>i>20&&p.autopilot!==true))throw Error(`${name} autopilot was not sustained`);
  const frames=frame.framesAtMs;
  if(frames.some((t,i)=>!finite(t)||(i&&t<=frames[i-1]))||!frames.some(t=>t<key)||!frames.some(t=>t>key+64000))throw Error(`${name} frame capture does not cover gesture and 64 seconds`);
  const intervals=frames.slice(1).flatMap((t,i)=>t>key&&frames[i]<key+64000?[t-frames[i]]:[]);
  if(intervals.length<30||intervals.some(t=>!finite(t)||t<=0))throw Error(`${name} frame interval coverage unavailable`);
  const p=path(chosen), simSeconds=chosen.at(-1).worldTime-chosen[0].worldTime, wallSeconds=(chosen.at(-1).atMs-chosen[0].atMs)/1000;
  if(p.lengthM<=50||wallSeconds<63.5||simSeconds<=0)throw Error(`${name} insufficient authoritative movement or room progress`);
  return {target:expected,meta,env,loadStart:m.runner?.hostLoadAverageAtStart,loadFinish:m.runner?.hostLoadAverageAtFinish,gestureMs:a.command.durationMs,keydownToAutopilotSendMs:a.page.keydownToAutopilotSendMs,keyNodeTimeRangeMs:keyRange,startupFrameMaxMs:a.frame.maxObservedGapMs,frames:{p95Ms:percentile(intervals,.95),maxMs:Math.max(...intervals),over50:intervals.filter(n=>n>50).length,samples:intervals.length},room:{wallSeconds,simulationSeconds:simSeconds,ratio:simSeconds/wallSeconds,maxSnapshotGapMs:Math.max(...gaps),snapshots:inside.length},path:p};
}
try {
  const journalText=await readFile(join(runRoot,'supervisor-events.ndjson'),'utf8');
  if(!journalText.endsWith('\n'))throw Error('supervisor journal incomplete');
  const journal=journalText.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  if(journal.filter(e=>e.event==='run-finished').length!==1||journal.find(e=>e.event==='run-finished').status!=='complete')throw Error('supervisor run not complete');
  const [a,b]=await Promise.all([leg('A',expectedA,1,journal),leg('B',expectedB,2,journal)]);
  if(JSON.stringify(a.meta.fixture)!==JSON.stringify(b.meta.fixture)||a.meta.lockSha256!==b.meta.lockSha256||JSON.stringify(a.env)!==JSON.stringify(b.env))report.reasons.push('fixture, lockfile or browser environment differs');
  const d=a.path.points.map((p,i)=>Math.hypot(...p.map((x,j)=>x-b.path.points[i][j]))), p95=percentile(d,.95), max=Math.max(...d);
  report.pathSeparationM={p95:round(p95),max:round(max)};
  if(Math.abs(a.path.lengthM-b.path.lengthM)>Math.max(20,a.path.lengthM*.25)||p95>25||max>50)report.reasons.push('path alignment exceeds preregistered bounds');
  if((b.startupFrameMaxMs>=2000&&a.startupFrameMaxMs<2000)||(b.gestureMs>=2000&&a.gestureMs<2000))report.reasons.push('candidate-only multi-second startup delay repeats the earlier observation');
  if(b.frames.p95Ms>20&&b.frames.p95Ms>a.frames.p95Ms+4)report.reasons.push('candidate callback p95 exceeds 20 ms and is over 4 ms worse than baseline');
  if(b.room.ratio<.95&&b.room.ratio<a.room.ratio-.05)report.reasons.push('candidate room progress ratio is below .95 and over .05 worse than baseline');
  const summary=x=>({target:x.target,env:x.env,loadStart:x.loadStart,loadFinish:x.loadFinish,gestureMs:round(x.gestureMs),keydownToAutopilotSendMs:round(x.keydownToAutopilotSendMs),keyNodeTimeRangeMs:x.keyNodeTimeRangeMs,startupFrameMaxMs:round(x.startupFrameMaxMs),frames:{...x.frames,p95Ms:round(x.frames.p95Ms),maxMs:round(x.frames.maxMs)},room:{...x.room,wallSeconds:round(x.room.wallSeconds),simulationSeconds:round(x.room.simulationSeconds),ratio:round(x.room.ratio),maxSnapshotGapMs:round(x.room.maxSnapshotGapMs)},path:{lengthM:round(x.path.lengthM),points:x.path.points.map(p=>p.map(round))}});
  report.baseline=summary(a);report.candidate=summary(b);
  if(!report.reasons.length)report.status='COMPARABLE';
} catch(error) { report.reasons.push(String(error)); }
console.log(JSON.stringify(report,null,2));
if(report.status!=='COMPARABLE')process.exitCode=2;

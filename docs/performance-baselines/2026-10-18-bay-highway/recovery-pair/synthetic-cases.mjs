// UNRUN DRAFT. Requires the coordinator's synthetic-check reservation.
// Generates local-only fake recorder evidence; never starts the game or browser.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,statfsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const analyzer=join(dirname(fileURLToPath(import.meta.url)),'analyze.mjs');
const s=statfsSync(tmpdir());
if(s.bavail*s.bsize<1.5*1024**3) throw Error('Synthetic check refused: less than 1.5 GiB free');
const dir=mkdtempSync(join(tmpdir(),'tesland-startup-synthetic-'));
const rev='1b7b18bf44cb049b0f3b1b61bd1135bdd7d015fc';
const step=(type,sample)=>({type,status:'ok',commandStartedAtMs:100,commandDurationMs:1,sample});
function fixture(){
  const times=Array.from({length:650},(_,i)=>1800+i*16);
  const frames={framesAtMs:times,intervalsMs:times.map(()=>16),startMs:1784,stopMs:12190,tailMs:6,truncated:false};
  const ready={npcIdentityPreserved:true,controlledEntityId:'ride-highway-startup-probe',controlledIdCount:1,controlledDriverMatches:true,controlledOwnerMatches:true,poseRevision:1};
  const after={controlledEntityId:'ride-highway-startup-probe',controlledIdCount:1,controlledDriverMatches:true,controlledOwnerMatches:true,poseRevision:1};
  const manifest={status:'complete',target:{refProvidedByOperator:rev},liveTrace:{truncated:false,error:null},snapshots:{truncated:false,samples:102},trajectory:{status:'available',samples:102},browserErrors:{pageErrors:0,consoleErrors:0},events:[step('waitForRoomReady',ready),step('beginRoom',{after}),step('verifyRunningCar',{controlledIdMatches:true,pose:{poseRevision:1}}),step('clockAnchor',{before:1900,after:1902,pageClock:{now:1800}}),step('frameStop',frames),step('probeRead',{events:[{type:'commandReady',atMs:1903},{type:'keydown',code:'KeyV',trusted:true,atMs:1904},{type:'autopilotSendStart',atMs:1906},{type:'keyup',code:'KeyV',trusted:true,atMs:1910},{type:'commandReturned',atMs:1911}]})]};
  const events=[{kind:'welcome',atMs:100,version:52},{kind:'key-command-start',atMs:2000,commandStartAtMs:2000},{kind:'ws-send',atMs:2008,messageType:'autopilot'},{kind:'ws-send',atMs:2009,messageType:'sync',token:5},{kind:'key-command-outcome',atMs:2010,status:'completed'},{kind:'key-observation-end',atMs:12000,deadlineAtMs:12000},{kind:'recorder-finalizing',atMs:12500}];
  for(let i=0;i<=101;i++){
    const t=1950+i*100;
    const x=i<=1?0:(i-1)*0.4;
    events.push({kind:'state',atMs:t,receivedAtMs:t,tick:20+i,poseRevision:1,sync:i>=1?5:0});
    events.push({kind:'controlled-pose',atMs:t,receivedAtMs:t,tick:20+i,poseRevision:1,controlledIdMatches:true,x,y:0,z:3300,speed:i<=1?0:2});
  }
  return {manifest,events};
}
const remove=(f,p)=>{f.events=f.events.filter(e=>!p(e));};
const cases=[
 ['valid',f=>{},'evidence-complete'],
 ['no-first-state',f=>remove(f,e=>['state','controlled-pose'].includes(e.kind)&&e.receivedAtMs<2000),'censored'],
 ['no-last-state',f=>remove(f,e=>['state','controlled-pose'].includes(e.kind)&&e.receivedAtMs>=12000),'censored'],
 ['no-first-frame',f=>{f.manifest.events.find(x=>x.type==='frameStop').sample.framesAtMs=f.manifest.events.find(x=>x.type==='frameStop').sample.framesAtMs.filter(t=>t>=1900);},'censored'],
 ['no-last-frame',f=>{f.manifest.events.find(x=>x.type==='frameStop').sample.framesAtMs=f.manifest.events.find(x=>x.type==='frameStop').sample.framesAtMs.filter(t=>t<=11898);},'censored'],
 ['early-freeze',f=>{const x=f.manifest.events.find(x=>x.type==='frameStop').sample;x.framesAtMs=x.framesAtMs.filter(t=>t<1900||t>5900);},'evidence-complete'],
 ['timeout',f=>{f.events.find(e=>e.kind==='key-command-outcome').status='timeout';},'censored'],
 ['late-completion',f=>{f.events.find(e=>e.kind==='key-command-outcome').atMs=12001;},'censored'],
 ['burst',f=>{for(const e of f.events)if(['state','controlled-pose'].includes(e.kind)&&e.receivedAtMs>=2050&&e.receivedAtMs<=2350){e.receivedAtMs=2050;e.atMs=2050;}},'censored'],
 ['revision-change',f=>{for(const e of f.events)if(['state','controlled-pose'].includes(e.kind)&&e.receivedAtMs===3050)e.poseRevision=2;},'censored'],
 ['identity-loss',f=>{f.events.find(e=>e.kind==='controlled-pose'&&e.receivedAtMs===3050).controlledIdMatches=false;},'censored'],
 ['omitted-pose',f=>remove(f,e=>e.kind==='controlled-pose'&&e.receivedAtMs===3050),'censored'],
 ['wrong-protocol',f=>{f.events.find(e=>e.kind==='welcome').version=53;},'censored'],
 ['wrong-ref',f=>{f.manifest.target.refProvidedByOperator='wrong';},'censored'],
 ['no-motion',f=>{for(const e of f.events)if(e.kind==='controlled-pose'){e.x=0;e.speed=0;}},'censored'],
 ['clock-order',f=>{f.manifest.events.find(e=>e.type==='probeRead').sample.events.find(e=>e.type==='keydown').atMs=1890;},'censored'],
 ['missing-marker',f=>{const p=f.manifest.events.find(e=>e.type==='probeRead').sample;p.events=p.events.filter(e=>e.type!=='commandReady');},'censored'],
 ['action-before-key',f=>{f.manifest.events.find(e=>e.type==='probeRead').sample.events.find(e=>e.type==='autopilotSendStart').atMs=1902;},'censored'],
 ['wrong-keyup',f=>{f.manifest.events.find(e=>e.type==='probeRead').sample.events.find(e=>e.type==='keyup').trusted=false;},'censored'],
 ['duplicate-key',f=>{const p=f.manifest.events.find(e=>e.type==='probeRead').sample;p.events.push({type:'keydown',code:'KeyV',trusted:true,atMs:1905});},'censored'],
 ['truthy-not-boolean',f=>{f.manifest.events.find(e=>e.type==='waitForRoomReady').sample.npcIdentityPreserved='yes';},'censored'],
 ['missing-completeness',f=>{delete f.manifest.liveTrace.truncated;},'censored'],
 ['missing-frame-flag',f=>{delete f.manifest.events.find(e=>e.type==='frameStop').sample.truncated;},'censored'],
 ['missing-receive-time',f=>{delete f.events.find(e=>e.kind==='state'&&e.tick===40).receivedAtMs;},'censored'],
 ['receive-time-reversal',f=>{f.events.find(e=>e.kind==='state'&&e.tick===40).receivedAtMs=100;},'censored'],
 ['negative-receive-time',f=>{f.events.find(e=>e.kind==='state'&&e.tick===20).receivedAtMs=-1;},'censored'],
 ['future-receive-time',f=>{const e=f.events.find(e=>e.kind==='controlled-pose'&&e.tick===40);e.receivedAtMs=e.atMs+1;},'censored'],
 ['finalizer-not-last',f=>{f.events.find(e=>e.kind==='recorder-finalizing').atMs=1;},'censored'],
 ['count-mismatch',f=>{f.manifest.snapshots.samples++;},'censored'],
 ['null-event',f=>{f.events.push(null);},'censored'],
 ['fractional-deadline',f=>{const d=.123456;for(const e of f.events){if(typeof e.atMs==='number')e.atMs+=d;if(typeof e.receivedAtMs==='number')e.receivedAtMs+=d;if(typeof e.commandStartAtMs==='number')e.commandStartAtMs+=d;if(typeof e.deadlineAtMs==='number')e.deadlineAtMs+=d;}const a=f.manifest.events.find(e=>e.type==='clockAnchor').sample;a.before+=d;a.after+=d;},'evidence-complete'],
];
const failures=[];
try{
  for(const [name,change,expected] of cases){
    const space=statfsSync(tmpdir());if(space.bavail*space.bsize<1024**3)throw Error('Disk fell below 1 GiB');
    const f=fixture();change(f);f.events.sort((a,b)=>(a?.atMs??Infinity)-(b?.atMs??Infinity));const out=join(dir,name);mkdirSync(out);
    writeFileSync(join(out,'manifest.json'),JSON.stringify(f.manifest));
    writeFileSync(join(out,'live-events.ndjson'),f.events.map(e=>JSON.stringify(e)).join('\n')+'\n');
    const child=spawnSync(process.execPath,[analyzer,out],{encoding:'utf8',timeout:5000,maxBuffer:1024**2});
    let result;try{result=JSON.parse(child.stdout);}catch{result={status:'invalid-output'};}
    const expectedCode=expected==='evidence-complete'?0:2;
    if(child.status!==expectedCode||result.status!==expected||(name==='early-freeze'&&!(result.frame?.maxObservedGapMs>3900))||(name==='valid'&&result.page?.displayedMotion!=='unmeasured'))failures.push({name,expected,exit:child.status,status:result.status,stderr:child.stderr});
  }
  console.log(JSON.stringify({cases:cases.length,failures,notes:'Synthetic cases test analysis contract only; they are not a driving, performance or containment result.'},null,2));
}finally{rmSync(dir,{recursive:true,force:true});}
if(failures.length)process.exitCode=1;

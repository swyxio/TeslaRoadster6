// Synthetic comparison contract checks, not gameplay or performance evidence.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'tesland-highway-compare-test-'));
const script=join(dirname(fileURLToPath(import.meta.url)),'compare.mjs');
const refA='a'.repeat(40),refB='b'.repeat(40),fixtureHashes={'analyze.mjs':'analysis','scripts/playtest-record.ts':'recorder'};
function fixture(options={},ref=refA) {
  const frames=[];for(let t=900;t<80050;t+=options.interval??16.7)frames.push(t);
  const events=[{type:'frameStop',status:'ok',sample:{framesAtMs:frames,truncated:false}},{type:'sample',status:'ok',sample:{connection:'● LIVE / LOCAL',perf:{drawCalls:100}}}];
  const key=options.delayedKey?5000:1000;
  const poses=Array.from({length:751},(_,i)=>({atMs:900+i*100,tick:2*(i+1),worldTime:i*.1*(options.ratio??1),poseRevision:1,autopilot:true,x:options.x??0,y:0,z:Math.max(0,(900+i*100-key)*.02)}));
  if(options.missingBroadcast)poses.splice(300,1);
  if(options.burst)for(let i=300;i<304;i++)poses[i].atMs=poses[300].atMs+(i-300);
  const live=[...poses.flatMap((p,i)=>[{kind:'state',atMs:p.atMs,receivedAtMs:p.atMs,tick:p.tick,poseRevision:1,worldTime:p.worldTime},{kind:'controlled-pose',atMs:p.atMs,receivedAtMs:p.atMs,tick:p.tick,poseRevision:1,controlledIdMatches:!(options.badId&&i===400),x:p.x,y:p.y,z:p.z}]),{kind:'recorder-finalizing',atMs:80000}];
  if(options.missingEnd)poses.splice(640);
  const manifest={status:'complete',target:{refProvidedByOperator:ref},events,viewport:{width:1280,height:720,deviceScaleFactor:1},browserErrors:{pageErrors:0,consoleErrors:0},liveTrace:{truncated:false,error:null},snapshots:{truncated:false,samples:poses.length},trajectory:{status:'available',samples:poses.length},runner:{cpu:'cpu',platform:'darwin',architecture:'arm64',webgl:{renderer:'renderer'},recorderSourceSha256:'recorder',browserVersion:'browser'}};
  const analysis={status:'evidence-complete',command:{startAtMs:1000,durationMs:options.gesture??(options.delayedKey?4100:250),outcome:{atMs:options.delayedKey?5100:1250}},page:{firstGesture:{atMs:key},keyNodeTimeRangeMs:[key,key+2],keydownToAutopilotSendMs:20},frame:{maxObservedGapMs:options.startupMax??250}};
  const status={status:'evidence-complete',analyzerSha256:'analysis'};
  return {manifest,analysis,status,poses,live};
}
function save(root,name,index,data){const p=join(root,`leg-${index}-${name}`);mkdirSync(join(p,'browser'),{recursive:true});for(const [file,v] of [['browser/manifest.json',data.manifest],['analysis.raw.json',data.analysis],['analysis-status.json',data.status],['browser/trajectory.json',data.poses]])writeFileSync(join(p,file),JSON.stringify(v));writeFileSync(join(p,'browser/live-events.ndjson'),data.live.map(x=>JSON.stringify(x)).join('\n')+'\n');}
const tests=[['same',{},'COMPARABLE'],['different-path',{x:40},'HOLD'],['threshold-precision',{x:25.0004},'HOLD'],['startup-gap',{startupMax:2100},'HOLD'],['gesture-gap',{gesture:2100},'HOLD'],['frame-p95',{interval:25},'HOLD'],['very-low-fps',{interval:100},'HOLD'],['room-progress',{ratio:.87},'HOLD'],['missing-poses',{missingEnd:true},'HOLD'],['burst',{burst:true},'HOLD'],['missing-broadcast',{missingBroadcast:true},'HOLD'],['changed-car',{badId:true},'HOLD'],['delayed-key',{delayedKey:true},'HOLD']];
const failures=[];
try {for(const [name,options,expected] of tests){const root=join(dir,name);mkdirSync(root);save(root,'A',1,fixture({},refA));save(root,'B',2,fixture(options,refB));const journal=[{event:'leg-start',id:'A',index:1,ref:refA,fixture:fixtureHashes,lockSha256:'lock'},{event:'leg-analysis',index:1,status:'evidence-complete',analyzerSha256:'analysis'},{event:'leg-end',id:'A',index:1},{event:'leg-start',id:'B',index:2,ref:refB,fixture:fixtureHashes,lockSha256:'lock'},{event:'leg-analysis',index:2,status:'evidence-complete',analyzerSha256:'analysis'},{event:'leg-end',id:'B',index:2},{event:'run-finished',status:'complete'}];writeFileSync(join(root,'supervisor-events.ndjson'),journal.map(x=>JSON.stringify(x)).join('\n')+'\n');const run=spawnSync(process.execPath,[script,root,refA,refB],{encoding:'utf8',timeout:5000});let got;try{got=JSON.parse(run.stdout).status;}catch{}if(got!==expected||run.status!==(expected==='COMPARABLE'?0:2))failures.push({name,expected,got,status:run.status,stderr:run.stderr,stdout:run.stdout.slice(0,500)});}}
finally {rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({cases:tests.length,failures}));
if(failures.length)process.exitCode=1;

import {appendFileSync, closeSync, mkdirSync, openSync, statfsSync, writeFileSync, existsSync} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {join} from 'node:path';

const output='/private/tmp/tesland-highway-scene-final';
const candidate='/private/tmp/tesland-bay-highway-life';
const baseline='/private/tmp/tesland-highway-final-base';
const reporter='/private/tmp/tesland-highway-timing-harness/scripts/performance-report.mjs';
const minStart=1.5*1024**3, minDuring=1024**3;
const available=()=>{const s=statfsSync('/private/tmp');return s.bavail*s.bsize;};
const stamp=(phase,event,free,extra={})=>appendFileSync(join(output,'disk-monitor.jsonl'),JSON.stringify({at:new Date().toISOString(),phase,event,freeBytes:free,...extra})+'\n');
const checkStart=()=>{const free=available();if(free<minStart)throw new Error(`Not starting: ${Math.round(free/1024**2)} MiB free, below 1536 MiB`);return free;};
if(process.argv.includes('--validate')){console.log(JSON.stringify({freeBytes:available(),minStart,minDuring,baseline,candidate,reporter}));process.exit(0);}
mkdirSync(output,{recursive:true});
for(const name of ['base','candidate'])if(existsSync(join(output,name)))throw new Error(`Output exists: ${name}`);
let active=null, stopped=false;
function descendants(root){
  const lines=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n');
  const children=new Map();
  for(const line of lines){const [pid,ppid]=line.trim().split(/\s+/).map(Number);if(!Number.isInteger(pid)||!Number.isInteger(ppid))continue;const xs=children.get(ppid)||[];xs.push(pid);children.set(ppid,xs);}
  const found=[];const visit=pid=>{for(const next of children.get(pid)||[])visit(next);found.push(pid);};visit(root);return found;
}
function stopTree(reason){
  if(!active||stopped)return;
  stopped=true;
  let pids;try{pids=descendants(active.pid);}catch{pids=[active.pid];}
  let free=null;try{free=available();}catch{}
  try{stamp(active.phase,'stop',free,{reason,pids});}catch{}
  for(const pid of pids)try{process.kill(pid,'SIGTERM');}catch{}
  setTimeout(()=>{for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}},4000);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stopTree(signal));
async function run(phase,root){
  const free=checkStart();stamp(phase,'start',free);
  const tmp=join(output,`temp-${phase}`);mkdirSync(tmp,{recursive:true});
  const fd=openSync(join(output,`${phase}.log`),'w',0o600);
  const child=spawn(process.execPath,[reporter,'--target-root',root,'--out',join(output,phase),'--gpu','metal'],{
    cwd:candidate,env:{...process.env,GIT_WORK_TREE:root,TMPDIR:tmp},detached:true,stdio:['ignore',fd,fd]});
  active={pid:child.pid,phase};stopped=false;
  const timer=setInterval(()=>{
    try{const free=available();stamp(phase,'sample',free);if(free<minDuring)stopTree('available disk below 1 GiB');}
    catch(error){stopTree(`disk monitor error: ${String(error)}`);}
  },3000);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));}).finally(()=>{clearInterval(timer);closeSync(fd);});
  const wasStopped=stopped;active=null;
  stamp(phase,'end',available(),{...result,stopped:wasStopped});
  if(wasStopped||result.code!==0)throw new Error(`${phase} did not complete: ${JSON.stringify({...result,stopped:wasStopped})}`);
}
try{await run('base',baseline);await run('candidate',candidate);writeFileSync(join(output,'status.json'),JSON.stringify({ok:true},null,2)+'\n');}
catch(error){try{writeFileSync(join(output,'status.json'),JSON.stringify({ok:false,error:String(error)},null,2)+'\n');}catch{}console.error(error);process.exitCode=1;}

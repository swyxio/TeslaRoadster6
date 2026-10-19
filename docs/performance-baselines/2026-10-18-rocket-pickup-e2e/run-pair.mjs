import {spawn,execFileSync} from 'node:child_process';
import {openSync,closeSync,appendFileSync,writeFileSync} from 'node:fs';
import process from 'node:process';

const dir='/private/tmp/tesland-pickup-e2e-20261019';
const harness='/private/tmp/tesland-pickup-short-harness';
const host=`${dir}/host.log`;
const report=`${harness}/scripts/performance-report.mjs`;
let active=null,lowDisk=false,samples=0;
function processTable(){
  return execFileSync('ps',['-Ao','pid=,ppid=,pgid=,pcpu=,comm='],{encoding:'utf8'}).trim().split('\n').map(line=>{
    const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
    return m?{pid:+m[1],ppid:+m[2],pgid:+m[3],cpu:+m[4],comm:m[5]}:null;
  }).filter(Boolean);
}
function signalTree(pid,signal){
  let table;
  try{table=processTable()}catch(error){appendFileSync(host,`process table error: ${error}\n`);return;}
  const ids=new Set([pid]);let changed=true;
  while(changed){changed=false;for(const row of table)if(ids.has(row.ppid)&&!ids.has(row.pid)){ids.add(row.pid);changed=true;}}
  const descendants=table.filter(row=>ids.has(row.pid));
  // Kill only process groups created by this reporter or its descendants.
  for(const row of descendants)if(row.pid===row.pgid)try{process.kill(-row.pid,signal)}catch{}
  for(const row of descendants.reverse())try{process.kill(row.pid,signal)}catch{}
  appendFileSync(host,`${new Date().toISOString()} sent ${signal} to reporter tree ${pid}: ${descendants.map(x=>x.pid).join(',')}\n`);
}
function check(){
  try{
    const raw=execFileSync('df',['-Pk','/private/tmp'],{encoding:'utf8'});
    const line=raw.trim().split('\n').at(-1).trim().split(/\s+/),availableKiB=Number(line[3]);
    if(!Number.isFinite(availableKiB))throw Error('Unable to read disk availability');
    if(samples++%3===0){
      const top=processTable().sort((a,b)=>b.cpu-a.cpu).slice(0,15).map(p=>`${p.pid} ${p.ppid} ${p.pgid} ${p.cpu} ${p.comm}`).join('\n');
      const uptime=execFileSync('uptime',[],{encoding:'utf8'}).trim();
      appendFileSync(host,`\n${new Date().toISOString()} availableKiB=${availableKiB} ${uptime}\n${top}\n`);
    }
    if(availableKiB<=102400&&!lowDisk){
      lowDisk=true;appendFileSync(host,`${new Date().toISOString()} LOW DISK: ${availableKiB} KiB, stopping safely\n`);
      if(active){const pid=active.pid;signalTree(pid,'SIGTERM');setTimeout(()=>signalTree(pid,'SIGKILL'),3000).unref();}
    }
  }catch(error){
    if(!lowDisk){lowDisk=true;appendFileSync(host,`${new Date().toISOString()} MONITOR ERROR: ${error}; stopping safely\n`);if(active)signalTree(active.pid,'SIGTERM');}
  }
}
function run(label,root){
  if(lowDisk)return Promise.resolve({label,status:'skipped-low-disk'});
  const fd=openSync(`${dir}/${label}.log`,'w',0o600);
  const env={...process.env,GIT_WORK_TREE:root,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.bare',GIT_CONFIG_VALUE_0:'false',GIT_CONFIG_KEY_1:'core.excludesFile',GIT_CONFIG_VALUE_1:'/private/tmp/tesland-pickup-git-excludes'};
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[report,'--target-root',root,'--out',`${dir}/${label}`,'--gpu','metal'],{cwd:harness,env,detached:true,stdio:['ignore',fd,fd]});
    active=child;appendFileSync(host,`${new Date().toISOString()} ${label} started pid=${child.pid}\n`);
    child.once('error',error=>{active=null;closeSync(fd);reject(error)});
    child.once('close',(code,signal)=>{active=null;closeSync(fd);const result={label,code,signal,lowDisk};appendFileSync(host,`${new Date().toISOString()} ${JSON.stringify(result)}\n`);resolve(result)});
  });
}
check();const timer=setInterval(check,5000);let results=[];
try{
  const base=await run('base','/private/tmp/tesland-pickup-base');results.push(base);
  if(base.code===0&&!lowDisk)results.push(await run('candidate','/private/tmp/tesland-pickup-release'));
} catch(error){results.push({error:String(error)});}
clearInterval(timer);check();writeFileSync(`${dir}/run-status.json`,JSON.stringify({results,lowDisk,finishedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({results,lowDisk}));
if(lowDisk||results.length!==2||results.some(result=>result.code!==0))process.exitCode=1;

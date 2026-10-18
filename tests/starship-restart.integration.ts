// Runs against a test-only adapter and isolated local Wrangler storage.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { STARSHIP_GOAL, STARSHIP_LAUNCH_DELAY_MS, type StarshipContributors, type StarshipStatus } from '../shared/starship';
import type { StarshipReconciliation } from '../worker/starship';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>,label:string){
  const end=Date.now()+20_000;
  while(Date.now()<end){if(await check())return;await delay(50);}
  throw new Error(`Timed out: ${label}`);
}
async function port(){
  const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(r=>server.close(()=>r()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid!,'SIGKILL');}catch{}}
}
const dir=await mkdtemp(join(tmpdir(),'tesland-starship-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-starship-test',main:resolve('tests/fixtures/starship-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'STARSHIP',class_name:'Starship'}]},migrations:[{tag:'v1',new_sqlite_classes:['Starship']}]}));
let child:ChildProcess|undefined;
function start(){
  const processHandle=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local',
    '--ip','127.0.0.1','--port',String(p),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  processHandle.stdout?.resume();processHandle.stderr?.resume();return processHandle;
}
async function ready(){await until(async()=>{
  if(child?.exitCode!==null)throw new Error('Wrangler exited before startup');
  try{return (await fetch(base+'/status',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}
},'Wrangler startup');}
async function status(driver?:string):Promise<StarshipStatus>{
  const response=await fetch(base+'/status'+(driver?`?driver=${encodeURIComponent(driver)}`:''));assert.ok(response.ok);return response.json() as Promise<StarshipStatus>;
}
async function credit(input:StarshipReconciliation,lost=false){
  return fetch(base+'/credit'+(lost?'?lose-reply=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
}
async function page(cursor?:string):Promise<StarshipContributors>{
  const response=await fetch(base+'/contributors'+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''));assert.ok(response.ok);return response.json() as Promise<StarshipContributors>;
}
try {
  child=start();await ready();
  const first={driverId:'guest-a',sequence:1,total:100,name:'Guest A'};
  assert.equal((await credit(first,true)).status,503,'simulate a lost response after the commit');
  assert.equal((await credit(first)).status,200,'retry is accepted');
  assert.equal((await status('guest-a')).personal,100);
  const concurrent=await Promise.all(Array.from({length:40},()=>credit(first)));
  assert.ok(concurrent.every(response=>response.ok));
  assert.equal((await status()).total,100,'concurrent retries do not add money');
  assert.equal((await credit({...first,total:101})).status,400,'same sequence with different total is rejected');
  assert.equal((await credit({...first,sequence:3,total:300})).status,200);
  assert.equal((await credit({...first,sequence:2,total:200})).status,200,'older updates are ignored');
  assert.equal((await credit({...first,sequence:4,total:299})).status,400,'a newer total may not regress');
  assert.equal((await status('guest-a')).personal,300);

  const samples:number[]=[];
  const bulk=Array.from({length:64},(_,i)=>({driverId:`room-${i%4}-driver-${i}`,sequence:1,total:1_000,name:`Driver ${i}`}));
  await Promise.all(bulk.map(async input=>{const start=performance.now(),response=await credit(input);samples.push(performance.now()-start);assert.ok(response.ok);}));
  assert.equal((await status()).total,64_300,'independent room identities share one ledger');
  const before=Date.now();
  const threshold=[
    {driverId:'threshold-a',sequence:1,total:600_000_000,name:'Ada'},
    {driverId:'threshold-b',sequence:1,total:400_000_000,name:'Bea'},
  ];
  const results=await Promise.all(threshold.map(input=>credit(input)));assert.ok(results.every(response=>response.ok));
  const completed=await status();assert.equal(completed.total,1_000_064_300);
  assert.ok(completed.completedAt!==null&&completed.completedAt>=before);
  assert.equal(completed.launchAt,completed.completedAt+STARSHIP_LAUNCH_DELAY_MS);
  assert.ok(completed.launchId);assert.ok(completed.total>=STARSHIP_GOAL);
  let entries:StarshipContributors['contributors']=[],cursor:string|null=null;
  do {const result=await page(cursor??undefined);entries.push(...result.contributors);cursor=result.next;} while(cursor);
  assert.equal(entries.length,67);assert.equal(entries.reduce((sum,row)=>sum+row.amount,0),completed.total);
  assert.deepEqual(entries.slice(0,2),[{name:'Ada',amount:600_000_000},{name:'Bea',amount:400_000_000}]);
  assert.ok((await credit({...threshold[0],sequence:2,total:600_000_500,name:'Renamed'})).ok);
  assert.ok((await credit({driverId:'after',sequence:1,total:500,name:'Late driver'})).ok);
  assert.equal((await status('threshold-a')).personal,600_000_500);
  assert.equal((await status()).total,completed.total+1_000,'lifetime accounting continues after launch');
  assert.deepEqual((await page()).contributors.slice(0,2),entries.slice(0,2),'launch roll is frozen');
  await stop(child);child=undefined;child=start();await ready();
  const restarted=await status('threshold-a');
  assert.equal(restarted.total,completed.total+1_000);assert.equal(restarted.personal,600_000_500);
  assert.equal(restarted.launchId,completed.launchId);assert.equal(restarted.launchAt,completed.launchAt);
  assert.ok((await credit({...threshold[0],sequence:2,total:600_000_500,name:'Renamed'})).ok);
  assert.equal((await status()).total,restarted.total,'retry after restart remains a no-op');
  samples.sort((a,b)=>a-b);
  console.log(`PASS: retries, conflicts, cross-room totals, concurrent threshold, frozen paginated recognition and Wrangler restart. Local 64-credit burst latency p50=${samples[32].toFixed(1)}ms p95=${samples[60].toFixed(1)}ms.`);
} finally {if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

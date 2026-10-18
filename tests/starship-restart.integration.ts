// Real local Durable Object storage; no production routes or state are touched.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { STARSHIP_GOAL, STARSHIP_LAUNCH_DELAY_MS, type StarshipContributors, type StarshipStatus } from '../shared/starship';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>){
  const end=Date.now()+20_000;
  while(Date.now()<end){if(await check())return;await delay(50);}
  throw new Error('Timed out starting Wrangler');
}
async function port(){
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>(resolve=>server.close(()=>resolve()));return address.port;
}
async function stop(child:ChildProcess){
  if(child.exitCode!==null||child.signalCode!==null)return;
  try{process.kill(-child.pid!,'SIGINT');}catch{}
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid!,'SIGKILL');}catch{}}
}
const dir=await mkdtemp(join(tmpdir(),'tesland-starship-')),p=await port(),base=`http://127.0.0.1:${p}`,config=join(dir,'wrangler.json');
await writeFile(config,JSON.stringify({name:'tesland-starship-test',main:resolve('tests/fixtures/starship-worker.ts'),compatibility_date:'2026-10-17',
  durable_objects:{bindings:[{name:'INCOME',class_name:'GlobalIncome'}]},migrations:[{tag:'v1',new_sqlite_classes:['GlobalIncome']}]}));
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
});}
async function post(path:string,body:unknown){return fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function path(route:string,instance?:string,parameters:Record<string,string>={}):string{
  const query=new URLSearchParams(parameters);if(instance)query.set('instance',instance);
  return route+(query.size?`?${query}`:'');
}
async function credit(driverId:string,total:number,lost=false,instance?:string){return post(path('/credit',instance,lost?{'lose-reply':'1'}:{}),{driverId,total});}
async function status(driver?:string,instance?:string):Promise<StarshipStatus>{
  const response=await fetch(base+path('/status',instance,driver?{driver}:{}));assert.ok(response.ok);return response.json() as Promise<StarshipStatus>;
}
async function page(cursor?:string,instance?:string):Promise<StarshipContributors>{
  const response=await fetch(base+path('/contributors',instance,cursor?{cursor}:{}));assert.ok(response.ok);return response.json() as Promise<StarshipContributors>;
}
async function all(instance?:string){
  const entries:StarshipContributors['contributors']=[];let cursor:string|null=null,pages=0;
  do{const result=await page(cursor??undefined,instance);entries.push(...result.contributors);cursor=result.next;assert.ok(++pages<20);}while(cursor);
  return entries;
}
try{
  child=start();await ready();
  // These rows have exactly the keys and values that the existing counter writes.
  assert.ok((await post('/seed',{driverId:'legacy-a',total:10_000})).ok);
  for(let i=0;i<30;i++)assert.ok((await post('/seed',{driverId:`legacy-${i}`,total:100})).ok);
  const nameResponse=await post('/name',{driverId:'legacy-a',name:'Ada'});
  assert.ok(nameResponse.ok,await nameResponse.text());
  assert.equal(await (await fetch(base+'/name?driver=legacy-a')).json(),'Ada');
  assert.equal((await credit('guest-a',100,true)).status,503);
  assert.ok((await credit('guest-a',100)).ok);
  assert.ok((await credit('guest-a',300)).ok);
  assert.ok((await credit('guest-a',200)).ok,'out-of-order high-water marks are ignored');
  assert.equal((await status('guest-a')).personal,300);
  const pending=await status();assert.equal(pending.total,13_300,'legacy rows and retry share one counter');
  assert.equal(pending.crossing,'pending');assert.equal(pending.cutoverTotal,null);assert.equal(pending.cutoverAt,null);
  const before=Date.now();
  const crossing=await Promise.all([credit('threshold-a',600_000_000),credit('threshold-b',400_000_000)]);
  assert.ok(crossing.every(response=>response.ok));
  const completed=await status();assert.equal(completed.total,1_000_013_300);
  assert.equal(completed.crossing,'recorded');assert.equal(completed.cutoverTotal,null);assert.equal(completed.cutoverAt,null);
  assert.equal(completed.launchTotal,completed.total);
  assert.ok(completed.completedAt!==null&&completed.completedAt>=before);
  assert.equal(completed.launchAt,completed.completedAt+STARSHIP_LAUNCH_DELAY_MS);
  assert.ok(completed.launchId);assert.ok(completed.total>=STARSHIP_GOAL);
  const firstPage=await page();assert.equal(firstPage.contributors.length,20);assert.ok(firstPage.next);
  assert.ok(!firstPage.next!.includes('legacy-'),'cursor does not expose an identity');
  const altered=(firstPage.next![0]==='A'?'B':'A')+firstPage.next!.slice(1);
  assert.equal((await fetch(base+'/contributors?cursor='+encodeURIComponent(altered))).status,400);
  const initial=await all();assert.equal(initial.length,34);
  assert.deepEqual(initial.find(row=>row.name==='Ada'),{name:'Ada',amount:10_000});
  assert.equal(initial.filter(row=>row.name==='Anonymous driver').length,33);
  assert.ok(initial.filter(row=>row.name==='Anonymous driver').every(row=>row.amount===null),'anonymous amounts are private');
  assert.ok((await credit('legacy-a',10_500)).ok);
  assert.deepEqual((await all()).find(row=>row.name==='Ada'),{name:'Ada',amount:10_000},'the public amount remains frozen at crossing');
  // Post-launch identities, including many before the cursor's sort position,
  // are excluded without hiding earlier contributors or stalling pagination.
  for(let i=0;i<55;i++)assert.ok((await credit(`aaa-${String(i).padStart(2,'0')}`,1)).ok);
  assert.ok((await post('/name',{driverId:'legacy-a',name:null})).ok);
  const after=await all();assert.equal(after.length,initial.length);
  assert.ok(after.every(row=>row.name==='Anonymous driver'),'privacy changes apply after launch');
  assert.ok(after.every(row=>row.amount===null),'opt-out also hides the previously public amount');
  assert.equal((await status('legacy-a')).personal,10_500);

  // A legacy counter already above the goal has no recoverable crossing time.
  assert.ok((await post('/seed?instance=prior',{driverId:'prior-driver',total:STARSHIP_GOAL})).ok);
  assert.ok((await post('/name?instance=prior',{driverId:'prior-driver',name:'Prior'})).ok);
  const prior=await status(undefined,'prior');
  assert.equal(prior.crossing,'unknown');assert.equal(prior.cutoverTotal,STARSHIP_GOAL);
  assert.ok(prior.cutoverAt!==null);assert.equal(prior.launchTotal,null);
  assert.equal(prior.completedAt,null);assert.equal(prior.launchAt,null);assert.equal(prior.launchId,null);
  assert.ok((await credit('prior-driver',STARSHIP_GOAL+100,false,'prior')).ok);
  assert.deepEqual(await all('prior'),[{name:'Prior',amount:STARSHIP_GOAL}],'status-first cutover freezes the pre-credit amount');
  assert.equal((await status(undefined,'prior')).cutoverAt,prior.cutoverAt);

  // On a credit-first cutover, the snapshot must exclude the arriving credit.
  assert.ok((await post('/seed?instance=credit-first',{driverId:'first-driver',total:STARSHIP_GOAL-100})).ok);
  assert.ok((await post('/seed?instance=credit-first',{driverId:'other-driver',total:100})).ok);
  assert.ok((await post('/name?instance=credit-first',{driverId:'first-driver',name:'First'})).ok);
  assert.equal((await credit('first-driver',STARSHIP_GOAL+400,true,'credit-first')).status,503);
  assert.ok((await credit('first-driver',STARSHIP_GOAL+400,false,'credit-first')).ok);
  const creditFirst=await status('first-driver','credit-first');
  assert.equal(creditFirst.crossing,'unknown');assert.equal(creditFirst.cutoverTotal,STARSHIP_GOAL);
  assert.equal(creditFirst.total,STARSHIP_GOAL+500);assert.equal(creditFirst.personal,STARSHIP_GOAL+400);
  assert.equal(creditFirst.completedAt,null);assert.equal(creditFirst.launchAt,null);assert.equal(creditFirst.launchId,null);assert.equal(creditFirst.launchTotal,null);
  assert.deepEqual((await all('credit-first')).find(row=>row.name==='First'),{name:'First',amount:STARSHIP_GOAL-100});
  assert.ok((await credit('late-driver',10,false,'credit-first')).ok);
  assert.equal((await all('credit-first')).length,2,'new identities after the cutover do not join the frozen roster');

  // A roster can also be the first operation on the legacy counter.
  assert.ok((await post('/seed?instance=roster-first',{driverId:'roster-driver',total:STARSHIP_GOAL})).ok);
  assert.deepEqual(await all('roster-first'),[{name:'Anonymous driver',amount:null}]);
  assert.equal((await status(undefined,'roster-first')).crossing,'unknown');
  await stop(child);child=undefined;child=start();await ready();
  const restarted=await status('legacy-a');
  assert.equal(restarted.total,completed.total+555);assert.equal(restarted.launchId,completed.launchId);assert.equal(restarted.launchAt,completed.launchAt);
  assert.ok((await page(firstPage.next!)).contributors.length,'encrypted cursor survives restart');
  assert.ok((await credit('legacy-a',10_500)).ok);
  assert.equal((await status()).total,restarted.total,'retry after restart remains a no-op');
  assert.equal(restarted.launchTotal,completed.total,'later income does not change the completed season');
  assert.equal(await (await fetch(base+'/name?driver=legacy-a')).json(),null,'opt-out survives restart');
  assert.ok((await all()).every(row=>row.amount===null),'anonymous amounts remain hidden after restart');
  const priorAgain=await status(undefined,'prior');
  assert.equal(priorAgain.crossing,'unknown');assert.equal(priorAgain.cutoverAt,prior.cutoverAt);assert.equal(priorAgain.launchAt,null);
  assert.deepEqual(await all('prior'),[{name:'Prior',amount:STARSHIP_GOAL}]);
  const creditFirstAgain=await status(undefined,'credit-first');
  assert.equal(creditFirstAgain.cutoverAt,creditFirst.cutoverAt);assert.equal(creditFirstAgain.cutoverTotal,STARSHIP_GOAL);assert.equal(creditFirstAgain.launchAt,null);
  assert.deepEqual((await all('credit-first')).find(row=>row.name==='First'),{name:'First',amount:STARSHIP_GOAL-100});
  console.log('PASS: canonical-key upgrade, unknown legacy crossing, credit-first cutover, frozen roll, anonymous amounts, opt-out and restart.');
}finally{if(child)await stop(child);await rm(dir,{recursive:true,force:true});}

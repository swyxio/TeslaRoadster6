// Lightweight authenticated scheduling check against isolated local Wrangler.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert.ok(address&&typeof address!=='string');
const port=address.port;await new Promise<void>(resolve=>server.close(()=>resolve()));
const dir=await mkdtemp(join(tmpdir(),'tesland-event-admin-')),config=join(dir,'wrangler.json');
const token='local-fixture-token-abcdefghijklmnopqrstuvwxyz-0123456789';
await writeFile(config,JSON.stringify({name:'tesland-event-admin-test',main:resolve('tests/fixtures/global-event-worker.ts'),compatibility_date:'2026-10-17',
  vars:{STARSHIP_ADMIN_TOKEN:token},durable_objects:{bindings:[{name:'EVENTS',class_name:'TestGlobalEarningsEvent'}]},migrations:[{tag:'v1',new_sqlite_classes:['TestGlobalEarningsEvent']}]}));
const base=`http://127.0.0.1:${port}`;
let child:ChildProcess|undefined;
async function post(auth:string|null,requestId:string,startsAtMs:number){return fetch(base+'/admin',{method:'POST',headers:{'content-type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify({requestId,startsAtMs})});}
try{
  child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(dir,'storage'),'--show-interactive-dev-session','false'],
    {cwd:process.cwd(),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
  child.stdout?.resume();child.stderr?.resume();
  const deadline=Date.now()+20_000;let ready=false;
  while(Date.now()<deadline&&!ready){
    if(child.exitCode!==null)throw new Error('Wrangler exited before startup');
    try{ready=(await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok;}catch{}
    if(!ready)await delay(50);
  }
  assert.ok(ready,'Wrangler starts');
  const start=Date.now()+120_000;
  assert.equal((await post(null,'one',start)).status,401);
  assert.equal((await post('incorrect','one',start)).status,401);
  const first=await post(token,'one',start);assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{startsAtMs:start,endsAtMs:start+1_800_000});
  assert.equal((await post(token,'one',start)).status,200,'same request safely retries');
  assert.equal((await post(token,'one',start+1)).status,400,'a request ID cannot be reused');
  assert.equal((await post(token,'overlap',start+1)).status,400,'overlap is rejected');
  assert.equal((await post(token,'early',Date.now()+1000)).status,400,'new events require lead time');
  console.log('PASS: authenticated global event scheduling and idempotency through local Wrangler.');
}finally{
  if(child&&child.exitCode===null&&child.signalCode===null){
    try{process.kill(-child.pid!,'SIGINT');}catch{}
    for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
    if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{}
  }
  await rm(dir,{recursive:true,force:true});
}

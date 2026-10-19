// Run after pnpm build: pnpm exec tsx tests/playtest-stage.integration.ts
// PLAYTEST_TARGET_ROOT may select another built checkout, including the baseline.
// Mounts this same fixture onto the target with isolated Wrangler storage.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Entity, World } from '../shared/game';
import { RoomInputClient } from './room-input-client';

type Message = { type:string; [key:string]:any };
type Status = { paused:boolean; started:boolean; ready:boolean; tick:number; poseRevision:number|null; initialOrder: {restaurant:{id:string;x:number;z:number};customer:{id:string;x:number;y:number;z:number;rooftop:boolean}}|null };
const delay = (ms:number) => new Promise(resolveDelay=>setTimeout(resolveDelay,ms));
async function until(check:()=>boolean|Promise<boolean>, label:string, timeout=15_000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await delay(30);}
  throw new Error(`Timed out: ${label}`);
}
async function freePort() {
  const server=createServer();
  await new Promise<void>((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen);});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  await new Promise<void>((resolveClose,reject)=>server.close(error=>error?reject(error):resolveClose()));
  return address.port;
}
async function stop(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  try { process.kill(-child.pid!,'SIGTERM'); } catch { /* already stopped */ }
  for(let i=0;i<100&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);
  if(child.exitCode===null&&child.signalCode===null)try{process.kill(-child.pid!,'SIGKILL');}catch{ /* already stopped */ }
}

const targetRoot=resolve(process.env.PLAYTEST_TARGET_ROOT??'.');
const {createWorld,NEUTRAL,PROTOCOL_VERSION}=await import(pathToFileURL(join(targetRoot,'shared/game.ts')).href) as typeof import('../shared/game');
const directory=await mkdtemp(join(tmpdir(),'tesland-playtest-stage-'));
const port=await freePort();let inspectorPort=await freePort();while(inspectorPort===port)inspectorPort=await freePort();
const base=`http://127.0.0.1:${port}`;
const stageSecret=randomBytes(32).toString('hex'),secretFile=join(directory,'stage.env');
const authorization={Authorization:`Bearer ${stageSecret}`};
const sockets:WebSocket[]=[];
let worker:ChildProcess|undefined,logs='';
function connect(room:string) {
  const socket=new WebSocket(`${base.replace(/^http/,'ws')}/api/room/${room}`);
  const input=new RoomInputClient(socket),messages:Message[]=[];
  sockets.push(socket);
  socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)) as Message;messages.push(message);input.observe(message);
    if(message.type==='welcome'){
      assert.equal(message.version,PROTOCOL_VERSION);
      socket.send(JSON.stringify({type:'identity',code:null,requestId:1}));
    }
  });
  return {socket,input,messages,
    last(type:string){return messages.filter(message=>message.type===type).at(-1);},
    car():Entity|undefined {
      const id=messages.find(message=>message.type==='welcome')?.id;
      const world=this.last('state')?.world as World|undefined;
      const player=world?.players.find(candidate=>candidate.id===id);
      return world?.entities.find(entity=>entity.id===player?.entityId);
    },
  };
}
async function getStatus(room:string):Promise<Status> {
  const response=await fetch(`${base}/api/playtest/status/${room}`,{headers:authorization,signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);return response.json() as Promise<Status>;
}
function ambient(client:ReturnType<typeof connect>) {
  const world=client.last('state')!.world as World;
  return world.entities.filter(entity=>entity.npc).map(({id,kind,x,y,z,yaw,supportId})=>({id,kind,x,y,z,yaw,supportId})).sort((a,b)=>a.id.localeCompare(b.id));
}

try {
  const stage=await readFile(resolve('tests/fixtures/playtest-stage-worker.ts'),'utf8');
  const mounted=stage.replace(/(['"])\.\.\/\.\.\/(worker|shared)\/([^'"]+)\1/g,
    (_match,_quote,directory,module)=>JSON.stringify(join(targetRoot,directory,`${module}.ts`)));
  const config=JSON.parse((await readFile(resolve('tests/fixtures/wrangler.playtest-stage.jsonc'),'utf8')).replace(/^\s*\/\/.*$/gm,''));
  const stageFile=join(directory,'playtest-stage-worker.ts'),configFile=join(directory,'wrangler.json');
  config.main=stageFile;config.assets.directory=join(targetRoot,'dist');
  await writeFile(stageFile,mounted);await writeFile(configFile,JSON.stringify(config));
  await writeFile(secretFile,`PLAYTEST_STAGE_SECRET=${stageSecret}\n`,{mode:0o600,flag:'wx'});
  worker=spawn(process.execPath,[resolve(targetRoot,'node_modules/wrangler/bin/wrangler.js'),'dev',
    '--config',configFile,'--env-file',secretFile,'--local','--ip','127.0.0.1','--port',String(port),'--inspector-port',String(inspectorPort),
    '--var','PLAYTEST_X:-190','--var','PLAYTEST_Z:120','--var',`PLAYTEST_YAW:${-Math.PI/2}`,
    '--var','PLAYTEST_SEED:0','--var','PLAYTEST_PAUSE:1',
    '--persist-to',join(directory,'storage'),'--show-interactive-dev-session','false'],
    {cwd:targetRoot,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'true',CLOUDFLARE_INCLUDE_PROCESS_ENV:'false'}});
  const append=(chunk:Buffer)=>{logs=(logs+chunk.toString()).slice(-20_000);};
  worker.stdout?.on('data',append);worker.stderr?.on('data',append);
  await until(async()=>{
    if(worker?.exitCode!==null||worker?.signalCode!==null)throw new Error(`Wrangler exited: ${logs}`);
    try { return (await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(500)})).ok; } catch { return false; }
  },'local Wrangler startup',30_000);

  const firstRoom=`stage-a-${randomUUID().slice(0,8)}`,secondRoom=`stage-b-${randomUUID().slice(0,8)}`;
  const first=connect(firstRoom),second=connect(secondRoom);
  for(const [room,client] of [[firstRoom,first],[secondRoom,second]] as const){
    await until(async()=>client.input.active&&client.input.poseRevision===1&&(await getStatus(room)).ready,'fresh staged guest');
    const status=await getStatus(room),car=client.car();
    assert.deepEqual({paused:status.paused,started:status.started,tick:status.tick,revision:status.poseRevision},
      {paused:true,started:false,tick:2,revision:1});
    assert.deepEqual(status.initialOrder,{restaurant:{id:'tartine',x:-180,z:120},customer:{id:'cable',x:0,y:0,z:-180,rooftop:false}});
    assert.ok(car);assert.deepEqual({x:car.x,y:car.y,z:car.z,yaw:car.yaw,speed:car.speed,supportId:car.supportId},
      {x:-190,y:0,z:120,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  }
  assert.ok(ambient(first).length>0,'seeded background traffic is observable');
  assert.deepEqual(ambient(first),ambient(second),'same seed and tick produce the same ambient fleet and positions');
  const expectedFleet=new Map(createWorld(0).entities.filter(entity=>entity.npc).map(entity=>[entity.id,entity.kind]));
  for(const entity of ambient(first))assert.equal(entity.kind,expectedFleet.get(entity.id),`${entity.id} belongs to seed 0`);

  const pausedRevision=first.input.control!.revision;
  first.input.send({...NEUTRAL,throttle:1});
  await delay(1200);
  assert.equal((await getStatus(firstRoom)).tick,2,'room clock stays paused while controls are queued');
  assert.ok(first.messages.filter(message=>message.type==='state'&&message.tick===2).length>=2,'paused room continues to send snapshots');
  assert.equal(first.car()?.x,-190,'queued controls do not move the staged car');

  const wrong={Authorization:`Bearer ${randomBytes(32).toString('hex')}`};
  for(const headers of [undefined,wrong]){
    const status=await fetch(`${base}/api/playtest/status/${firstRoom}`,{headers,signal:AbortSignal.timeout(5000)});
    assert.equal(status.status,401,'status requires the correct bearer token');
    const denied=await fetch(`${base}/api/playtest/begin/${firstRoom}`,{method:'POST',headers,signal:AbortSignal.timeout(5000)});
    assert.equal(denied.status,401,'begin requires the correct bearer token');
    assert.equal((await getStatus(firstRoom)).tick,2,'unauthorized begin leaves the room paused');
  }
  const crossOrigin=await fetch(`${base}/api/playtest/begin/${firstRoom}`,{method:'POST',headers:{...authorization,Origin:'https://example.invalid'},signal:AbortSignal.timeout(5000)});
  assert.equal(crossOrigin.status,403,'cross-origin controls remain blocked');
  const begin=await fetch(`${base}/api/playtest/begin/${firstRoom}`,{method:'POST',headers:authorization,signal:AbortSignal.timeout(5000)});
  assert.equal(begin.status,200);const started=await begin.json() as {ok:boolean;tick:number};
  assert.equal(started.ok,true);assert.equal(started.tick,2);
  const again=await fetch(`${base}/api/playtest/begin/${firstRoom}`,{method:'POST',headers:authorization,signal:AbortSignal.timeout(5000)});
  assert.equal(again.status,409,'begin cannot be applied twice');
  await until(()=>first.input.tick>2&&!!first.input.control&&first.input.control.revision>pausedRevision,'normal ticks and control fence resume');
  await delay(300);
  assert.equal(first.car()?.x,-190,'begin fences any input queued before the run');
  const startX=first.car()!.x;
  for(let i=0;i<25&&Math.abs((first.car()?.x??startX)-startX)<1;i++){
    first.input.send({...NEUTRAL,throttle:1});await delay(100);
  }
  await until(()=>Math.abs((first.car()?.x??startX)-startX)>1,'new input moves the car after begin');
  assert.equal((await getStatus(secondRoom)).tick,2,'starting one room leaves the other paused');
  assert.ok(!logs.includes(stageSecret),'Wrangler output must not reveal the stage secret');
  console.log('PASS: authenticated seeded rooms start at the same paused pose and fleet, unauthorized starts are rejected, begin is one-use, and ticks and new input resume.');
} finally {
  for(const socket of sockets)try{socket.close();}catch{ /* already closed */ }
  if(worker)await stop(worker);
  await rm(directory,{recursive:true,force:true});
}

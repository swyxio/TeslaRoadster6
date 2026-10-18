#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { checkSources, instrument, plugin } from './instrument.mjs';
import { createNetworkProfile, profiles } from './network-profile.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const {values}=parseArgs({options:{check:{type:'string'},run:{type:'string'},out:{type:'string'},gpu:{type:'string',default:'metal'},profile:{type:'string',default:'zero'}}});
if(!!values.check===!!values.run)throw new Error('Choose exactly one: --check ROOT or --run ROOT --out /private/tmp/NEW_DIRECTORY');
const root=await realpath(resolve(values.check||values.run));
const require=createRequire(join(root,'package.json'));
const checked=await checkSources(root);
const ts=require('typescript');
for(const item of checked){
  const source=instrument(item.path,await readFile(join(root,item.path),'utf8'));
  const result=ts.transpileModule(source,{fileName:item.path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw new Error(`${item.path}: ${ts.flattenDiagnosticMessageText(errors[0].messageText,' ')}`);
}
if(values.check){console.log(JSON.stringify({root,checked},null,2));process.exit(0);}
if(!values.out)throw new Error('Specify a new --out directory');
if(!['metal','default','vulkan','swiftshader'].includes(values.gpu))throw new Error('Invalid --gpu');
if(!profiles.includes(values.profile))throw new Error(`Invalid --profile; choose ${profiles.join(', ')}`);
const out=resolve(values.out);
if(!out.startsWith('/private/tmp/'))throw new Error('Output must be a new directory under /private/tmp');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const status=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
if(status)throw new Error('Target worktree is dirty. Commit the exact candidate before a paired measurement.');
await mkdir(out,{mode:0o700});
const startedAt=new Date().toISOString(),loadBefore=os.loadavg();
const hashes={};
for(const path of ['instrument.mjs','browser-init.js','network-profile.mjs','run.mjs'])hashes[path]=createHash('sha256').update(await readFile(join(here,path))).digest('hex');
const dist=join(out,'dist');
const vite=await import(pathToFileURL(require.resolve('vite')).href);
process.chdir(root);
await vite.build({
  root,configFile:join(root,'vite.config.ts'),configLoader:'runner',cacheDir:join(out,'vite-cache'),
  build:{outDir:dist,emptyOutDir:true,manifest:true},plugins:[plugin(root)],
});
const stage=join(root,'tests/fixtures/playtest-stage-worker.ts');
const worker=join(out,'stage-worker.ts');
await writeFile(worker,`// Local-only deterministic, ambient-free staging. Never deploy.\nimport base, { GameRoom as StageRoom } from ${JSON.stringify(stage)};\nexport { GlobalChat, DriverProfile, RoomEconomy, GlobalIncome, GlobalEarningsEvent, MarketService } from ${JSON.stringify(stage)};\nexport class GameRoom extends StageRoom {\n  constructor(ctx:any, env:any) {\n    super(ctx,env);\n    const world=Reflect.get(this,'world');\n    world.entities=[];\n  }\n}\nexport default base;\n`);
const config=join(out,'wrangler.json');
await writeFile(config,JSON.stringify({
  name:'tesland-disposable-motion-gate',main:worker,compatibility_date:'2026-10-17',
  assets:{directory:dist,binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:['/api/*']},
  vars:{MAX_PLAYERS:'8',PLAYTEST_X:'-300',PLAYTEST_Z:'-2050',PLAYTEST_YAW:String(Math.PI)},
  durable_objects:{bindings:[{name:'ROOMS',class_name:'GameRoom'},{name:'CHAT',class_name:'GlobalChat'},
    {name:'DRIVERS',class_name:'DriverProfile'},{name:'ECONOMIES',class_name:'RoomEconomy'},
    {name:'INCOME',class_name:'GlobalIncome'},{name:'GLOBAL_EVENTS',class_name:'GlobalEarningsEvent'},
    {name:'MARKET',class_name:'MarketService'}]},
  migrations:[{tag:'v1',new_sqlite_classes:['GameRoom']},{tag:'v2',new_sqlite_classes:['GlobalChat']},
    {tag:'v3',new_sqlite_classes:['DriverProfile','RoomEconomy','GlobalIncome']},
    {tag:'v4',new_sqlite_classes:['GlobalEarningsEvent']},{tag:'v5',new_sqlite_classes:['MarketService']}],
},null,2));
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
const port=await freePort(),origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,
  '--local','--ip','127.0.0.1','--port',String(port),'--persist-to',join(out,'storage'),
  '--show-interactive-dev-session','false'],{cwd:root,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true',BROWSER:'none'}});
let logs='',exited=false,childError;
child.on('exit',()=>exited=true);child.on('error',e=>childError=e);
for(const stream of [child.stdout,child.stderr])stream.on('data',part=>{logs=(logs+String(part)).slice(-200_000);});
let browser,context,page,errors=0,consoleErrors=0,health,connections=0,networkErrors=0;
const network=createNetworkProfile(values.profile);
try {
  const deadline=Date.now()+90_000;
  while(!health&&Date.now()<deadline){
    if(childError||exited)throw childError||new Error('Wrangler exited before readiness');
    try{const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)});if(response.ok)health=await response.json();}catch{}
    if(!health)await new Promise(r=>setTimeout(r,500));
  }
  if(!health)throw new Error('Wrangler readiness timed out');
  const {chromium}=require('playwright');
  const gpuArgs=values.gpu==='metal'?['--use-gl=angle','--use-angle=metal','--enable-gpu']:
    values.gpu==='vulkan'?['--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface','--enable-gpu']:
    values.gpu==='swiftshader'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[];
  browser=await chromium.launch({headless:true,args:gpuArgs});
  context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  await context.addInitScript({path:join(here,'browser-init.js')});
  page=await context.newPage();
  page.on('pageerror',()=>errors++);page.on('console',message=>{if(message.type()==='error')consoleErrors++;});
  await page.routeWebSocket(url=>url.host===`127.0.0.1:${port}`&&url.pathname==='/api/room/motion-gate',ws=>{
    connections++;
    const server=ws.connectToServer();
    const forward=(direction,target)=>(message)=>{
      try{network.enqueue(direction,message,payload=>target.send(payload));}
      catch{networkErrors++;void ws.close({code:1011,reason:'Motion fixture queue error'}).catch(()=>{});}
    };
    ws.onMessage(forward('up',server));
    server.onMessage(forward('down',ws));
  });
  const response=await page.goto(`${origin}/?room=motion-gate&perf`,{waitUntil:'domcontentloaded',timeout:60_000});
  if(!response?.ok())throw new Error(`Page returned HTTP ${response?.status()}`);
  const renderer=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    if(!gl)return null;const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const result={renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR)};
    gl.getExtension('WEBGL_lose_context')?.loseContext();return result;
  });
  await page.waitForFunction(()=>document.querySelector('#connection')?.textContent?.includes('LIVE')&&
    window.__teslandTrace?.states?.some(s=>s.poseRevision>=1),null,{timeout:60_000});
  await page.waitForTimeout(1500);
  const initial=await page.evaluate(()=>window.__teslandTrace.states.at(-1));
  const headingError=initial?Math.abs(Math.atan2(Math.sin(initial.car.yaw-Math.PI),Math.cos(initial.car.yaw-Math.PI))):Infinity;
  if(!initial||Math.hypot(initial.car.x+300,initial.car.z+2050)>1||headingError>.01||
    Math.abs(initial.car.speed)>.5||Math.hypot(initial.car.vx,initial.car.vy,initial.car.vz)>.5||
    initial.car.supportId!=='ground'||initial.car.kind!=='roadster'||initial.otherEntities!==0)
    throw new Error(`Invalid staged start: ${JSON.stringify(initial)}`);
  async function calibrate(){
    const nodeBefore=performance.now();
    const browserClock=await page.evaluate(()=>({now:performance.now(),timeOrigin:performance.timeOrigin}));
    const nodeAfter=performance.now();
    return {nodeBeforeMs:nodeBefore,nodeAfterMs:nodeAfter,browserNowMs:browserClock.now,
      browserTimeOrigin:browserClock.timeOrigin,nodeMinusBrowserMs:(nodeBefore+nodeAfter)/2-browserClock.now,
      halfRoundTripMs:(nodeAfter-nodeBefore)/2};
  }
  const clockBefore=await calibrate();
  network.startScenario();
  await page.evaluate(()=>window.__teslandTraceMark('drive-start'));
  await page.keyboard.down('KeyW');await page.waitForTimeout(3000);
  if(values.profile==='gap250'){
    await page.evaluate(()=>window.__teslandTraceMark('gap-armed-request'));
    network.armGap();
  }
  await page.waitForTimeout(1000);
  await page.keyboard.down('KeyD');await page.waitForTimeout(1000);
  await page.keyboard.up('KeyD');await page.keyboard.down('KeyA');await page.waitForTimeout(1000);
  await page.keyboard.up('KeyA');await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');await page.keyboard.down('Space');await page.waitForTimeout(1000);
  await page.keyboard.up('Space');await page.waitForTimeout(1000);
  await page.evaluate(()=>window.__teslandTraceMark('drive-end'));
  const clockAfter=await calibrate();
  const connectionAtEnd=await page.evaluate(()=>document.querySelector('#connection')?.textContent?.trim()??null);
  const trace=await page.evaluate(()=>window.__teslandTrace);
  const cutoff=performance.now(),drainDeadline=cutoff+3000;
  while(network.pendingBefore(cutoff)>0&&performance.now()<drainDeadline)await new Promise(r=>setTimeout(r,20));
  const pendingBeforeCutoff=network.pendingBefore(cutoff),networkTrace=network.snapshot();
  const marks=trace.marks,begin=marks.find(item=>item.label==='drive-start')?.atMs,end=marks.find(item=>item.label==='drive-end')?.atMs;
  const frames=trace.frames.filter(frame=>frame.atMs>=begin&&frame.atMs<=end),states=trace.states.filter(state=>state.atMs>=begin&&state.atMs<=end);
  const intervals=frames.slice(1).map((f,i)=>f.atMs-frames[i].atMs).sort((a,b)=>a-b);
  const gaps=states.slice(1).map((s,i)=>s.atMs-states[i].atMs).sort((a,b)=>a-b);
  const pct=(data,p)=>data.length?data[Math.floor((data.length-1)*p)]:null;
  const first=frames[0]?.visual,last=frames.at(-1)?.visual;
  const displacementM=first&&last?Math.hypot(last.x-first.x,last.y-first.y,last.z-first.z):null;
  const events=trace.events.filter(event=>event.atMs>=begin&&event.atMs<=end);
  const controls=trace.controls.filter(control=>control.atMs>=begin&&control.atMs<=end);
  const requiredEvents=[['keydown','KeyW'],['keyup','KeyW'],['keydown','KeyD'],['keyup','KeyD'],
    ['keydown','KeyA'],['keyup','KeyA'],['keydown','Space'],['keyup','Space']];
  const missingEvents=requiredEvents.filter(([type,code])=>!events.some(event=>event.type===type&&event.code===code&&event.trusted));
  const controlsObserved=controls.some(control=>control.throttle>0)&&controls.some(control=>control.brake)&&
    controls.some(control=>control.steer>0)&&controls.some(control=>control.steer<0);
  const gap=networkTrace.gap;
  const gapSucceeded=values.profile!=='gap250'||(gap.startAtNodeMs!==null&&gap.endTargetAtNodeMs!==null&&
    gap.firstAfterNodeMs!==null&&gap.held>0&&gap.firstAfterNodeMs>=gap.endTargetAtNodeMs&&
    !networkTrace.events.some(event=>event.event==='forwarded'&&event.direction==='down'&&
      event.forwardInvokedNodeMs>gap.startAtNodeMs&&event.forwardInvokedNodeMs<gap.endTargetAtNodeMs));
  const turnaround=trace.turnarounds.filter(item=>item.receivedAtMs>=begin&&item.receivedAtMs<=end)
    .map(item=>item.elapsedMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const lastSnapshotAgeMs=states.length?end-states.at(-1).atMs:null;
  const complete=frames.length>=30&&states.length>=5&&displacementM>10&&!trace.errors&&
    Object.values(trace.dropped).every(n=>n===0)&&errors===0&&consoleErrors===0&&missingEvents.length===0&&controlsObserved&&
    connections===1&&networkErrors===0&&!networkTrace.overflow&&!networkTrace.sendsFailed&&!networkTrace.droppedEvents&&
    pendingBeforeCutoff===0&&gapSucceeded&&turnaround.length>0&&!!connectionAtEnd?.includes('LIVE')&&lastSnapshotAgeMs!==null&&lastSnapshotAgeMs<=1000;
  const metadata={format:1,startedAt,finishedAt:new Date().toISOString(),revision,dirty:false,health,
    environment:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,
      loadBefore,loadAfter:os.loadavg(),node:process.version,playwright:require('playwright/package.json').version,browser:browser.version(),gpu:values.gpu,renderer,
      viewport:{width:1280,height:720,deviceScaleFactor:1}},
    hashes,checked,setup:{start:{x:-300,z:-2050,yaw:Math.PI},room:'fresh local single player; ambient vehicles removed',initial,
      timing:'Browser performance.now for input/render/snapshot, Node performance.now for routed packet timing; cross-clock alignment is estimated',
      networkProfile:values.profile,
      networkProfileDetails:values.profile==='zero'?'0 ms scheduled in each direction':
        values.profile==='steady150'?'75 ms scheduled in each direction':
        values.profile==='bunched150'?'75 ms each direction plus repeating [0,0,125,-16.667,-16.667] ms per-direction jitter, FIFO enforced':
        '0 ms base; one 250 ms downlink hold begins after a state is forwarded, armed after 3 s driving',
      clockBefore,clockAfter,
      scenario:'W 4s, W+D 1s, W+A 1s, W 2s, release W + brake 1s, release brake 1s'},
    observation:{complete,frames:frames.length,states:states.length,displacementM,frameP95Ms:pct(intervals,.95),maxFrameMs:intervals.at(-1),
      snapshotGapP95Ms:pct(gaps,.95),maxSnapshotGapMs:gaps.at(-1),missingEvents,controlsObserved,
      gameObservedTurnaroundMs:{samples:turnaround.length,p50:pct(turnaround,.5),p95:pct(turnaround,.95),max:turnaround.at(-1)},
      connections,networkErrors,pendingBeforeCutoff,gapSucceeded,networkGap:gap,connectionAtEnd,lastSnapshotAgeMs,
      errors,consoleErrors,traceErrors:trace.errors,dropped:trace.dropped},
    limitations:['Temporary instrumented Vite build; browser callback/scene transforms are not GPU completion or displayed photons.',
      'Ambient vehicles removed for a repeatable stationary start; this is not representative room/render throughput or proof of no scenery contact.',
      'Only the room WebSocket is routed; socket setup, chat and other HTTP are unshaped. Profiles delay application messages, not actual TCP/IP packets or physical WAN.',
      'A proxy forward timestamp is the invocation of Playwright send, not confirmed network or browser delivery; align using measured clock brackets and browser receive events.',
      'The bunched phase is reset at drive start, but preceding in-flight messages retain FIFO order and packet counts can differ between revisions.',
      'Game observed turnaround includes server processing and snapshot cadence; it is not a pure network RTT.',
      'This scenario does not test touch, flight, physical devices or other contact cases.',
      'Authoritative snapshots arrive at about 10 Hz; their speed is not an exact same-instant reference at every rendered frame.',
      'Matching start does not guarantee identical routes or exclude scenery contacts; inspect the full poses, support, health, pushes, and timestamps.']};
  await writeFile(join(out,'trace.json'),JSON.stringify(trace,null,2)+'\n');
  await writeFile(join(out,'network-trace.json'),JSON.stringify(networkTrace,null,2)+'\n');
  await writeFile(join(out,'metadata.json'),JSON.stringify(metadata,null,2)+'\n');
  console.log(JSON.stringify(metadata,null,2));
  if(!complete)process.exitCode=1;
} finally {
  network.stop();
  if(context)await context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(!exited&&child.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);}
  if(!exited&&child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}
  await writeFile(join(out,'worker.log'),logs);
  await rm(join(out,'storage'),{recursive:true,force:true});
}

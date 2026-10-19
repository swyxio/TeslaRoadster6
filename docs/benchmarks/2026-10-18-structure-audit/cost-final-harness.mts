import {performance} from 'node:perf_hooks';
import {cpus,loadavg} from 'node:os';
const hostLoadStart=loadavg();
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const [baseDir,candidateDir]=process.argv.slice(2);
if(!baseDir||!candidateDir)throw new Error('Usage: pnpm exec tsx scripts/audit-structure-cost.ts BASE_CHECKOUT CANDIDATE_CHECKOUT');
const baseline=await import(pathToFileURL(resolve(baseDir,'shared/game.ts')).href) as typeof import('../shared/game');
const candidate=await import(pathToFileURL(resolve(candidateDir,'shared/game.ts')).href) as typeof import('../shared/game');
const revision=(dir:string)=>({head:execFileSync('git',['--work-tree',resolve(dir),'-c','core.bare=false','-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['--work-tree',resolve(dir),'-c','core.bare=false','-C',dir,'status','--porcelain'],{encoding:'utf8'}).trim().length>0});
const output:{name:string;ms:number[];entities:number;cpuMs:number;end:number[][]}[]=[];
for(let trial=0;trial<5;trial++)for(const name of (trial%2?['candidate','baseline']:['baseline','candidate'])){
 const game=name==='baseline'?baseline:candidate,world=game.createWorld(12345),inputs=new Map();
 const players=Array.from({length:5},(_,i)=>game.addPlayer(world,`cost-${i}`,`Cost ${i}`));
 for(const p of players)inputs.set(p.id,{...game.NEUTRAL,throttle:1});
 for(let i=0;i<50;i++)game.step(world,inputs,.05);
 const ms:number[]=[],cpuStart=process.cpuUsage();
 for(let i=0;i<100;i++){const start=performance.now();game.step(world,inputs,.05);ms.push(performance.now()-start);}
 const cpuUsed=process.cpuUsage(cpuStart);
 output.push({name,ms,cpuMs:(cpuUsed.user+cpuUsed.system)/1000,entities:world.entities.length,end:players.map(p=>{const e=world.entities.find(e=>e.id===p.entityId)!;return [e.x,e.y,e.z,e.speed]})});
}
const summary=Object.fromEntries(['baseline','candidate'].map(name=>{const rows=output.filter(r=>r.name===name),values=rows.flatMap(r=>r.ms).sort((a,b)=>a-b);return [name,{samples:values.length,cpuMsPerStep:rows.reduce((a,r)=>a+r.cpuMs,0)/values.length,medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)],meanMs:values.reduce((a,b)=>a+b,0)/values.length,entities:rows[0].entities,end:rows[0].end}]}));
console.log(JSON.stringify({cpu:cpus()[0].model,logicalCpus:cpus().length,hostLoadStart,hostLoadEnd:loadavg(),scope:'Pure simulation step cost, five drivers, fixed seed 12345, 50 warmup/100 measured ticks repeated five times in alternating order. No browser/network/Cloudflare/capacity inference.',baseline:revision(baseDir),candidate:revision(candidateDir),sameFinalDriverPoses:JSON.stringify(summary.baseline.end)===JSON.stringify(summary.candidate.end),summary,raw:output},null,2));

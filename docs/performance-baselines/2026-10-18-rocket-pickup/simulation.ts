/** Paired 64-player pure simulation. No room, network, real economy, or capacity claim. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {Session as Inspector} from 'node:inspector';
import {cpus,loadavg} from 'node:os';
import lanes from './lanes.json';
import * as before from './base/shared/game';
import * as after from './candidate/shared/game';

const mode=process.argv[2];
const ticks=Number(process.env.PICKUP_TICKS??60),pairs=Number(process.env.PICKUP_PAIRS??4);
if(!['parity','bench','profile'].includes(mode)||!Number.isInteger(ticks)||ticks<1||ticks>500||!Number.isInteger(pairs)||pairs<1||pairs>10)throw Error('Invalid bounded mode/ticks/pairs');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Scenario='city'|'open-lanes';
function prepare(scenario:Scenario){
  const world=before.createWorld(0),inputs=new Map<string,before.Input>();
  for(let i=0;i<64;i++){
    const id=`p${String(i).padStart(2,'0')}`,preferred=scenario==='open-lanes'?[lanes.poses[i]]:[];
    const p=before.addPlayer(world,id,`Driver ${i}`,preferred);
    if(scenario==='open-lanes'){
      const e=world.entities.find(item=>item.id===p.entityId)!;
      assert.equal(e.x,preferred[0].x);assert.equal(e.z,preferred[0].z);
    }
    inputs.set(id,{...before.NEUTRAL,throttle:.55,steer:scenario==='city'?Math.sin(i*1.3)*.13:0});
  }
  for(let i=0;i<30;i++)before.step(world,inputs,.05);
  return {world,inputs};
}
function sample(api:typeof before,world:before.World,inputs:Map<string,before.Input>,count:number){
  const initial=world.players.map(p=>{const e=world.entities.find(x=>x.id===p.entityId)!;return {x:e.x,z:e.z};});
  const startCpu=process.cpuUsage(),at=performance.now();let totalSubsteps=0,maxSubsteps=0;
  for(let i=0;i<count;i++)api.step(world,inputs,.05,{onSubsteps:n=>{totalSubsteps+=n;maxSubsteps=Math.max(maxSubsteps,n);}});
  const cpu=process.cpuUsage(startCpu),wall=performance.now()-at;
  const distances=world.players.map((p,i)=>{const e=world.entities.find(x=>x.id===p.entityId)!;return Math.hypot(e.x-initial[i].x,e.z-initial[i].z);});
  return {cpuMs:(cpu.user+cpu.system)/1000,wallMs:wall,hash:hash(world),minDisplacement:Math.min(...distances),moved1m:distances.filter(d=>d>=1).length,totalSubsteps,maxSubsteps};
}
async function profile(api:typeof before,world:before.World,inputs:Map<string,before.Input>,file:string){
  const inspector=new Inspector();inspector.connect();
  const post=(method:string,params={})=>new Promise<any>((resolve,reject)=>inspector.post(method as any,params,(error,result)=>error?reject(error):resolve(result)));
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:1000});await post('Profiler.start');
  const measurement=sample(api,world,inputs,ticks);
  const result=await post('Profiler.stop');inspector.disconnect();
  writeFileSync(file,JSON.stringify(result.profile));return measurement;
}
const startUtc=new Date().toISOString(),startLoad=loadavg();
for(const scenario of ['city','open-lanes'] as const){
  const prepared=prepare(scenario);
  if(mode==='parity'){
    const a=structuredClone(prepared.world),b=structuredClone(prepared.world);
    for(let t=0;t<ticks;t++){
      before.step(a,prepared.inputs,.05);after.step(b,prepared.inputs,.05);
      assert.deepStrictEqual(b,a,`${scenario} differs at tick ${t+1}`);
    }
    console.log(JSON.stringify({mode,scenario,players:a.players.length,ticks,equalEveryTick:true,hash:hash(a),worldSeconds:a.time}));
  } else if(mode==='bench'){
    const result=[];
    for(let i=0;i<pairs;i++){
      const outcomes:Record<string,ReturnType<typeof sample>>={};
      for(const label of i%2?['candidate','baseline']:['baseline','candidate'])
        outcomes[label]=sample(label==='baseline'?before:after,structuredClone(prepared.world),prepared.inputs,ticks);
      assert.equal(outcomes.baseline.hash,outcomes.candidate.hash,`pair ${i} state differs`);
      result.push({iteration:i,...outcomes});
    }
    console.log(JSON.stringify({mode,scenario,pairs,ticks,players:64,initialHash:hash(prepared.world),results:result}));
  } else {
    const a=await profile(before,structuredClone(prepared.world),prepared.inputs,`evidence/${scenario}-baseline.cpuprofile`);
    const b=await profile(after,structuredClone(prepared.world),prepared.inputs,`evidence/${scenario}-candidate.cpuprofile`);
    assert.equal(a.hash,b.hash);
    console.log(JSON.stringify({mode,scenario,ticks,baseline:a,candidate:b}));
  }
}
console.log(JSON.stringify({mode,startUtc,endUtc:new Date().toISOString(),logicalCpus:cpus().length,startLoad,endLoad:loadavg(),note:'Deterministic synthetic 64-player shared simulation only; no Worker, Session, network, production economy or capacity result. Timing and profiles include host effects.'}));

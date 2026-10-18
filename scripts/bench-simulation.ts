/** Deterministic same-process simulation benchmark, not a network load test. */
import { createHash } from 'node:crypto';
import { addPlayer, createWorld, NEUTRAL, step } from '../shared/game';

const count=Number(process.argv[2]??64);
if(!Number.isInteger(count)||count<1||count>64)throw new Error('Use 1–64 players.');
const world=createWorld();
const inputs=new Map();
for(let i=0;i<count;i++){
  const id=`driver-${String(i).padStart(2,'0')}`;
  addPlayer(world,id,`Driver ${i}`);
  inputs.set(id,{...NEUTRAL,throttle:.5,steer:Math.sin(i)*.2});
}
for(let i=0;i<30;i++)step(world,inputs,.05);
const cpuStart=process.cpuUsage(),started=performance.now(),times:number[]=[];
for(let i=0;i<100;i++){
  const start=performance.now();step(world,inputs,.05);times.push(performance.now()-start);
}
const elapsed=performance.now()-started,cpu=process.cpuUsage(cpuStart);
times.sort((a,b)=>a-b);
console.log(JSON.stringify({players:count,ticks:times.length,simulationSeconds:+world.time.toFixed(3),
  elapsedMs:+elapsed.toFixed(1),cpuMs:+((cpu.user+cpu.system)/1000).toFixed(1),
  tickP50Ms:+times[50].toFixed(2),tickP95Ms:+times[95].toFixed(2),
  stateSha256:createHash('sha256').update(JSON.stringify(world)).digest('hex'),
  note:'Same-process synthetic workload. CPU time and wall time include host contention; not a production capacity test.'},null,2));

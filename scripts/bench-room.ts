/**
 * Deterministic in-process room-loop workload, not a live service load test.
 * Example: pnpm exec tsx scripts/bench-room.ts 64 120
 * Run on the same host/runtime, compare the state hash and repeat alternating builds.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addPlayer, createWorld, enterMinigame, NEUTRAL, raceAction, step, travelDome, type Input, type World } from '../shared/game';
import { prepareSnapshots, snapshotFor } from '../worker/snapshot';

const count=Number(process.argv[2]??64), ticks=Number(process.argv[3]??120);
if(!Number.isInteger(count)||count<1||count>64||!Number.isInteger(ticks)||ticks<2||ticks>10000||ticks%2) {
  throw new Error('Use 1–64 players and an even number of 2–10000 measured ticks.');
}
const world=createWorld(), inputs=new Map<string,Input>();
// Match UUID lengths in live sessions; IDs and actions are deterministic.
const ids=Array.from({length:count},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);
ids.forEach((id,i)=>addPlayer(world,id,`Driver ${i+1}`));
const setup={dome:0,race:0,raceStarted:false,parking:0,ferry:0};
for(const [i,id] of ids.entries()){
  const group=i%16;
  if(group===0&&travelDome(world,id))setup.dome++;
  if(group===1&&enterMinigame(world,id,'short'))setup.race++;
  if(group===2&&enterMinigame(world,id,'park'))setup.parking++;
  if(group===3){
    // Place at most four cars on the real ferry deck to exercise its supported
    // crossing without spending the benchmark's setup time driving to the pier.
    const car=world.entities.find(e=>e.id===world.players[i].entityId)!;
    const slot=setup.ferry++;
    Object.assign(car,{x:slot%2?-3.5:3.5,z:world.ferry.z+(slot<2?-9:9),y:0,yaw:0,supportId:'ferry',speed:0});
  }
}
// Start the race after all entrants have joined; the warm-up spans its
// countdown. Park entrants remain in the lot throughout this short sample.
if(setup.race)setup.raceStarted=raceAction(world,ids[1],'start','short');
world.ferry.remaining=2;
function setInputs(tick:number){
  ids.forEach((id,i)=>{
    const group=i%16,fly=group===4;
    inputs.set(id,{...NEUTRAL,
      throttle:group===3||group===2||(group===1&&tick<60)?0:0.5,
      steer:group===3?0:Math.sin(i+Math.floor(tick/20))*.2,
      boost:fly&&tick%80<30,hover:fly&&tick%80<30,
      jump:fly?Math.floor((tick+20)/80):0,
      flip:fly?Math.floor((tick+40)/160):0,
    });
  });
}
function verifySnapshots(w:World){
  const prepare=prepareSnapshots(w);
  for(const id of ids)assert.deepEqual(JSON.parse(prepare(id,37,7)),JSON.parse(JSON.stringify({type:'state',world:snapshotFor(w,id),inputAck:37,sync:7})));
}
// Warm JIT and let the ferry depart before starting the measurement.
for(let i=0;i<60;i++){setInputs(i);step(world,inputs,.05);if(i%2===1){const prepare=prepareSnapshots(world);ids.forEach(id=>prepare(id,i));}}
verifySnapshots(world);
const initialTime=world.time,cpuStart=process.cpuUsage(),started=performance.now();
const stepTimes:number[]=[],prepareTimes:number[]=[],assembleTimes:number[]=[],tickTimes:number[]=[],bytes:number[]=[];
let minActiveRaceRounds=Infinity,minActiveParkingRounds=Infinity;
const measuredTicksWith={domeDriver:0,airborneDriver:0,ferryUnderway:0,ferryPassenger:0};
for(let tick=0;tick<ticks;tick++){
  setInputs(tick+60);
  const tickStart=performance.now(),stepStart=performance.now();
  step(world,inputs,.05);stepTimes.push(performance.now()-stepStart);
  if(tick%2===1){
    const prepareStart=performance.now(),prepare=prepareSnapshots(world);
    prepareTimes.push(performance.now()-prepareStart);
    const assembleStart=performance.now();
    for(const id of ids){const json=prepare(id,tick+60);bytes.push(Buffer.byteLength(json));}
    assembleTimes.push(performance.now()-assembleStart);
  }
  tickTimes.push(performance.now()-tickStart);
  minActiveRaceRounds=Math.min(minActiveRaceRounds,world.races.rounds.filter(round=>round.phase==='active').length);
  minActiveParkingRounds=Math.min(minActiveParkingRounds,world.parking.rounds.filter(round=>round.phase==='active').length);
  if(world.entities.some(entity=>entity.driver&&entity.inDome))measuredTicksWith.domeDriver++;
  if(world.entities.some(entity=>entity.driver&&entity.supportId===null))measuredTicksWith.airborneDriver++;
  if(world.ferry.phase==='to-island'||world.ferry.phase==='to-sf')measuredTicksWith.ferryUnderway++;
  if(world.ferry.passengers.length)measuredTicksWith.ferryPassenger++;
}
const elapsed=performance.now()-started,cpu=process.cpuUsage(cpuStart);
verifySnapshots(world);
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const describe=(values:number[])=>{
  const sorted=[...values].sort((a,b)=>a-b);
  const at=(fraction:number)=>+sorted[Math.floor((sorted.length-1)*fraction)].toFixed(3);
  return {totalMs:+sum(values).toFixed(1),p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
};
const sortedBytes=[...bytes].sort((a,b)=>a-b),totalBytes=sum(bytes);
const byPlayer=new Map(world.players.map(p=>[p.id,world.entities.find(e=>e.id===p.entityId)!]));
console.log(JSON.stringify({
  players:count,measuredTicks:ticks,snapshotRounds:bytes.length/count,simulatedSeconds:+(world.time-initialTime).toFixed(3),setup,
  measuredActivityMinimum:{activeRaceRounds:minActiveRaceRounds,activeParkingRounds:minActiveParkingRounds},
  measuredTicksWith,
  finalState:{entities:world.entities.length,dome:ids.filter(id=>byPlayer.get(id)?.inDome).length,
    airborne:ids.filter(id=>byPlayer.get(id)?.supportId===null).length,ferryPassengers:world.ferry.passengers.length,
    parkingRounds:world.parking.rounds.length,raceRounds:world.races.rounds.length,sha256:createHash('sha256').update(JSON.stringify(world)).digest('hex')},
  elapsedMs:+elapsed.toFixed(1),cpuMs:+((cpu.user+cpu.system)/1000).toFixed(1),
  simulation:describe(stepTimes),snapshotPreparation:describe(prepareTimes),recipientAssemblyAndByteCount:describe(assembleTimes),roomTickExcludingInput:describe(tickTimes),
  decodedJson:{totalBytes,perSnapshotP50Bytes:sortedBytes[Math.floor((sortedBytes.length-1)*.5)],perSnapshotP95Bytes:sortedBytes[Math.floor((sortedBytes.length-1)*.95)],
    aggregateBytesPerSimulatedSecond:Math.round(totalBytes/(world.time-initialTime))},
  note:'Same-process deterministic workload on Node, not the Cloudflare runtime. Mixed actions are scripted; ferry cars are fixture-positioned. Timings include host contention, exclude socket delivery, transport compression, client parsing, incoming message handling and rendering. Decoded JSON is not network-wire bandwidth or a playable-capacity claim.'
},null,2));

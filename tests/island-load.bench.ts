/** Same-process synthetic mixed-activity profiling; not a production load test. */
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, parkingAction, raceAction, step, travelDome } from '../shared/game';
import { snapshotFor } from '../worker/snapshot';

const world=createWorld();
const players=Array.from({length:64},(_,i)=>addPlayer(world,`driver-${String(i).padStart(2,'0')}`,`Driver ${i}`));
const car=(i:number)=>world.entities.find(e=>e.id===players[i].entityId)!;
for(let i=0;i<6;i++)Object.assign(car(i),{x:i%2?3.5:-3.5,z:world.ferry.z+[-11,0,11][Math.floor(i/2)],y:0,yaw:0,speed:0,supportId:'ferry'});
world.ferry.remaining=0;
for(let i=6;i<10;i++){
  Object.assign(car(i),{x:62+(i-6)*11,z:-1185,y:0,speed:0,supportId:'ground'});
  assert.ok(parkingAction(world,players[i].id,'park'));
}
for(let i=10;i<14;i++){
  Object.assign(car(i),{x:0,z:-1330,y:0,speed:0,supportId:'ground'});
  assert.ok(raceAction(world,players[i].id,'join','short'));
}
assert.ok(raceAction(world,players[10].id,'start','short'));
for(let i=14;i<18;i++)assert.ok(travelDome(world,players[i].id));
const inputs=new Map([[players[14].id,{...NEUTRAL,throttle:1}]]);

const stepTimes:number[]=[],snapshotTimes:number[]=[];let maxBytes=0,snapshots=0;
for(let tick=0;tick<100;tick++){
  let started=performance.now();step(world,inputs,.05);stepTimes.push(performance.now()-started);
  if(tick%2===0){
    started=performance.now();
    for(const player of players){
      const raw=JSON.stringify({type:'state',world:snapshotFor(world,player.id)});
      maxBytes=Math.max(maxBytes,Buffer.byteLength(raw));snapshots++;
    }
    snapshotTimes.push(performance.now()-started);
  }
}
assert.equal(world.ferry.phase,'to-island');assert.equal(world.ferry.passengers.length,6);
assert.equal(world.parking.rounds[0]?.entrants.length,4);assert.equal(world.races.rounds[0]?.entrants.length,4);
assert.equal(players.slice(14,18).filter(p=>world.entities.find(e=>e.id===p.entityId)?.inDome).length,4);
const p95=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor((values.length-1)*.95)];
console.log(JSON.stringify({result:'PASS',players:players.length,simulationSeconds:world.time,ferryPassengers:world.ferry.passengers.length,
  parkingEntrants:world.parking.rounds[0].entrants.length,raceEntrants:world.races.rounds[0].entrants.length,domePlayers:4,snapshots,
  stepP95Ms:p95(stepTimes),snapshotBatchP95Ms:p95(snapshotTimes),maxSnapshotBytes:maxBytes,
  note:'Same-process synthetic 5-second simulation including 64 serialized recipient snapshots per batch; not network, peak-traffic, mobile, sustained or production evidence.'},null,2));

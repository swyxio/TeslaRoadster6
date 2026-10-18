/** Same-process synthetic comparison; this is not a room capacity or production test. */
import assert from 'node:assert/strict';
import { addPlayer, createWorld, dispatchCybercab, MAX_DISPATCHED_CABS_PER_ROOM, NEUTRAL, step } from '../shared/game';
import { ScheduledInput } from '../shared/tick-input';
import { prepareSnapshots } from '../worker/snapshot';

const percentile=(values:number[],fraction:number) => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*fraction)];
const roomEpoch='00000000-0000-0000-0000-000000000000';

function sample(cabCount:number) {
  const world=createWorld();
  const players=Array.from({length:8},(_,i)=>addPlayer(world,`player-${i}`,`Driver ${i}`));
  const controls=players.map(()=>new ScheduledInput(NEUTRAL));
  for(let i=0;i<cabCount;i++)assert.ok(dispatchCybercab(world,players[i%players.length].id,`bench-${i}`));
  const initial=JSON.parse(prepareSnapshots(world,0,roomEpoch,1)(players[0].id,controls[0].snapshot(),0));
  assert.equal(initial.tick,0);assert.equal(initial.roomEpoch,roomEpoch);assert.equal(initial.substeps,1);
  assert.equal(initial.poseRevision,0);assert.equal(initial.control.appliedSeq,0);
  const stepTimes:number[]=[],snapshotTimes:number[]=[];let totalBytes=0,snapshots=0;
  for(let i=0;i<120;i++){
    let substeps=1;
    let started=performance.now();step(world,new Map(),.05,{onSubsteps:count=>{substeps=count;}});
    if(i>=20)stepTimes.push(performance.now()-started);
    if(i>=20&&(i+1)%2===0){
      started=performance.now();
      const prepare=prepareSnapshots(world,i+1,roomEpoch,substeps);
      for(let j=0;j<players.length;j++){totalBytes+=Buffer.byteLength(prepare(players[j].id,controls[j].snapshot(),0));snapshots++;}
      snapshotTimes.push(performance.now()-started);
    }
  }
  return {players:players.length,dispatchedCabs:cabCount,entities:world.entities.length,steps:stepTimes.length,snapshotBatches:snapshotTimes.length,
    stepMedianMs:percentile(stepTimes,.5),stepP95Ms:percentile(stepTimes,.95),
    snapshotBatchMedianMs:percentile(snapshotTimes,.5),snapshotBatchP95Ms:percentile(snapshotTimes,.95),
    meanSnapshotBytes:Math.round(totalBytes/snapshots)};
}

console.log(JSON.stringify({baseline:sample(0),withCabs:sample(MAX_DISPATCHED_CABS_PER_ROOM),
  note:'8 idle synthetic players, local 50 ms simulation steps and 8 recipient serializations per batch; no WebSocket, sustained-load, device or production claim.'},null,2));

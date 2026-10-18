/** Same-process synthetic comparison; this is not a room capacity or production test. */
import assert from 'node:assert/strict';
import { addPlayer, createWorld, dispatchCybercab, MAX_DISPATCHED_CABS_PER_ROOM, step } from '../shared/game';
import { prepareSnapshots } from '../worker/snapshot';

const percentile=(values:number[],fraction:number) => [...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*fraction)];

function sample(cabCount:number) {
  const world=createWorld();
  const players=Array.from({length:64},(_,i)=>addPlayer(world,`player-${i}`,`Driver ${i}`));
  for(let i=0;i<cabCount;i++)assert.ok(dispatchCybercab(world,players[i].id,`bench-${i}`));
  const stepTimes:number[]=[],snapshotTimes:number[]=[];let totalBytes=0,snapshots=0;
  for(let i=0;i<120;i++){
    let started=performance.now();step(world,new Map(),.05);
    if(i>=20)stepTimes.push(performance.now()-started);
    if(i>=20&&i%2===0){
      started=performance.now();
      const prepare=prepareSnapshots(world);
      for(const player of players){totalBytes+=Buffer.byteLength(prepare(player.id,0));snapshots++;}
      snapshotTimes.push(performance.now()-started);
    }
  }
  return {players:players.length,dispatchedCabs:cabCount,entities:world.entities.length,steps:stepTimes.length,snapshotBatches:snapshotTimes.length,
    stepMedianMs:percentile(stepTimes,.5),stepP95Ms:percentile(stepTimes,.95),
    snapshotBatchMedianMs:percentile(snapshotTimes,.5),snapshotBatchP95Ms:percentile(snapshotTimes,.95),
    meanSnapshotBytes:Math.round(totalBytes/snapshots)};
}

console.log(JSON.stringify({baseline:sample(0),withCabs:sample(MAX_DISPATCHED_CABS_PER_ROOM),
  note:'64 idle synthetic players, local 50 ms simulation steps and 64 recipient serializations per batch; no WebSocket, sustained-load, device or production claim.'},null,2));

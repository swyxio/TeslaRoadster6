import test from 'node:test';
import assert from 'node:assert/strict';
import {movementTracker,newAckObservations,observeAcks} from './room-64-observations';
import {alignControl,driveControl,safelyStaged,yawError} from './room-64-corridors';
import {makeEntity} from '../shared/game';

test('only observed applied sequences count as measured acknowledgements',()=>{
  const state=newAckObservations();
  const sent=new Map([[1,{at:100,utc:'',targetTick:4,lastSnapshotTick:2}], [2,{at:200,utc:'',targetTick:5,lastSnapshotTick:3}]]);
  observeAcks(state,sent,1,1,250,150,300);
  assert.equal(state.measuredApplied,false);
  observeAcks(state,sent,2,2,275,150,300);
  assert.equal(state.measuredApplied,true);
  assert.deepEqual(state.appliedMs,[75]);
  observeAcks(state,sent,3,3,280,150,300);
  assert.equal(state.unmatchedApplied,1);
});
test('movement coverage cannot be faked by teleports or stationary snapshots',()=>{
  const tracker=movementTracker(10_000);
  for(let i=0;i<100;i++)tracker.observe({atMs:i*100,tick:i+1,poseRevision:0,
    vehicle:{id:'car',x:0,y:0,z:-i,vx:0,vy:0,vz:-10}});
  assert.equal(tracker.summary().blocks[0].complete,true);
  const stationary=movementTracker(10_000);
  for(let i=0;i<100;i++)stationary.observe({atMs:i*100,tick:i+1,poseRevision:0,
    vehicle:{id:'car',x:0,y:0,z:0,vx:0,vy:0,vz:0}});
  assert.equal(stationary.summary().blocks[0].complete,false);
});
test('a stall spanning two movement blocks fails both blocks',()=>{
  const tracker=movementTracker(20_000);
  for(let at=0;at<20_000;at+=50){
    if(at>9050&&at<10950)continue;
    tracker.observe({atMs:at,tick:at/50+1,poseRevision:0,
      vehicle:{id:'car',x:0,y:0,z:-at/100,vx:0,vy:0,vz:-10}});
  }
  const blocks=tracker.summary().blocks;
  assert.deepEqual(blocks.map(block=>block.maxGapMs),[1900,1900]);
  assert.deepEqual(blocks.map(block=>block.complete),[false,false]);
});
test('controller refuses bad staging and stops when snapshots are stale',()=>{
  const car=makeEntity('driver','roadster',-1000,4100);
  const lane={x:-1000,z:4100};
  assert.equal(safelyStaged(car,lane),true);
  car.yaw=Math.PI/2;
  assert.equal(safelyStaged(car,lane),false);
  assert.ok(yawError(car.yaw)<0);
  assert.ok(alignControl(car).steer<0);
  assert.equal(driveControl(car,lane,501).throttle,0);
});

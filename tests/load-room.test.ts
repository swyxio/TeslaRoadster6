import assert from 'node:assert/strict';
import test from 'node:test';
import { inputCoverage, movementTracker } from '../scripts/load-room';

const vehicle=(x:number,speed=12,id='car')=>({id,x,y:0,z:0,vx:speed,vy:0,vz:0});

test('movement blocks require sustained authoritative travel, not just snapshots',()=>{
  const moving=movementTracker(20_000),stationary=movementTracker(20_000);
  for(let i=0;i<200;i++){
    moving.observe({atMs:i*100,tick:i,poseRevision:1,vehicle:vehicle(i*1.2)});
    stationary.observe({atMs:i*100,tick:i,poseRevision:1,vehicle:vehicle(i<100?i*1.2:118.8,i<100?12:0)});
  }
  const active=moving.summary(),stopped=stationary.summary();
  assert.ok(active.blocks.every(block=>block.complete&&block.distanceM!>=75));
  assert.ok(stopped.blocks[0].complete);
  assert.equal(stopped.blocks[1].complete,false);
  assert.equal(stopped.blocks[1].distanceM,0);
  assert.equal(stopped.blocks[1].movingFraction,0);
});

test('movement does not count teleports, replacement cars, or gaps in valid poses',()=>{
  const tracker=movementTracker(10_000);
  tracker.observe({atMs:0,tick:1,poseRevision:1,vehicle:vehicle(0)});
  tracker.observe({atMs:100,tick:2,poseRevision:1,vehicle:vehicle(1)});
  tracker.observe({atMs:200,tick:3,poseRevision:1,vehicle:vehicle(100)});
  tracker.observe({atMs:300,tick:4,poseRevision:2,vehicle:vehicle(101)});
  tracker.observe({atMs:400,tick:5,poseRevision:2,vehicle:vehicle(102,12,'other')});
  tracker.observe({atMs:500,tick:6,poseRevision:2,vehicle:null});
  tracker.observe({atMs:600,tick:7,poseRevision:2,vehicle:vehicle(200,12,'other')});
  const result=tracker.summary();
  assert.equal(result.distanceM,1);
  assert.equal(result.blocks[0].discontinuities,3);
  assert.equal(result.blocks[0].invalidSamples,1);
  assert.equal(result.blocks[0].complete,false);
});

test('clustered moving snapshots cannot certify a sustained ten-second block',()=>{
  const early=movementTracker(10_000),late=movementTracker(10_000),split=movementTracker(10_000);
  for(let i=0;i<50;i++){
    early.observe({atMs:i*100,tick:i,poseRevision:1,vehicle:vehicle(i*2,20)});
    late.observe({atMs:5000+i*100,tick:i,poseRevision:1,vehicle:vehicle(i*2,20)});
  }
  for(let i=0;i<80;i++){
    const atMs=i<40?i*100:6100+(i-40)*100;
    split.observe({atMs,tick:i,poseRevision:1,vehicle:vehicle(atMs/100,10)});
  }
  const first=early.summary().blocks[0],last=late.summary().blocks[0],second=split.summary().blocks[0];
  assert.equal(first.samples,50);assert.ok(first.distanceM!>=75);assert.equal(first.movingFraction,1);
  assert.equal(first.lastAtMs,4900);assert.equal(first.complete,false);
  assert.ok(last.distanceM!>=75);assert.equal(last.firstAtMs,5000);assert.equal(last.complete,false);
  assert.ok(second.distanceM!>=75);assert.equal(second.movingFraction,1);
  assert.equal(second.firstAtMs,0);assert.equal(second.lastAtMs,10000-100);
  assert.equal(second.maxGapMs,2200);assert.equal(second.complete,false);
});

test('input coverage rejects unacknowledged measurement inputs and any rejection',()=>{
  assert.deepEqual(inputCoverage([
    {lastSentBefore:50,applied:50,rejections:0},
    {lastSentBefore:20,applied:22,rejections:1},
    {lastSentBefore:0,applied:null,rejections:0},
  ]),{rejectedClients:[1],clientsWithoutAppliedInput:[0,2]});
  assert.deepEqual(inputCoverage([{lastSentBefore:50,applied:51,rejections:0}]),
    {rejectedClients:[],clientsWithoutAppliedInput:[]});
});

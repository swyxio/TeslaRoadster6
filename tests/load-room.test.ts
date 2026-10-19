import assert from 'node:assert/strict';
import test from 'node:test';
import { allPlayersPresent, inputCoverage, movementSample, movementTracker, simulationProgressComplete } from '../scripts/load-room';

const vehicle=(x:number,speed=12,id='car')=>({id,x,y:0,z:0,vx:speed,vy:0,vz:0});

test('movement blocks require sustained authoritative travel, not just snapshots',()=>{
  const moving=movementTracker(20_000),stationary=movementTracker(20_000);
  for(let i=0;i<200;i++){
    moving.observe({atMs:i*100,tick:i*2,poseRevision:1,vehicle:vehicle(i*1.2)});
    stationary.observe({atMs:i*100,tick:i*2,poseRevision:1,vehicle:vehicle(i<100?i*1.2:118.8,i<100?12:0)});
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
    early.observe({atMs:i*100,tick:i*2,poseRevision:1,vehicle:vehicle(i*2,20)});
    late.observe({atMs:5000+i*100,tick:i*2,poseRevision:1,vehicle:vehicle(i*2,20)});
  }
  for(let i=0;i<80;i++){
    const atMs=i<40?i*100:6100+(i-40)*100;
    split.observe({atMs,tick:atMs/50,poseRevision:1,vehicle:vehicle(atMs/100,10)});
  }
  const first=early.summary().blocks[0],last=late.summary().blocks[0],second=split.summary().blocks[0];
  assert.equal(first.samples,50);assert.ok(first.distanceM!>=75);assert.equal(first.movingFraction,1);
  assert.equal(first.lastAtMs,4900);assert.equal(first.complete,false);
  assert.ok(last.distanceM!>=75);assert.equal(last.firstAtMs,5000);assert.equal(last.complete,false);
  assert.ok(second.distanceM!>=75);assert.equal(second.movingFraction,1);
  assert.equal(second.firstAtMs,0);assert.equal(second.lastAtMs,10000-100);
  assert.equal(second.maxGapMs,2200);assert.equal(second.complete,false);
});

test('sparse stopped samples cannot count as sustained movement',()=>{
  const tracker=movementTracker(10_000);
  for(let i=0;i<47;i++){
    const atMs=i*100;
    tracker.observe({atMs,tick:atMs/50,poseRevision:1,vehicle:vehicle(atMs*.02,20)});
  }
  for(const atMs of [4950,5950,6950,7950,8950,9950])
    tracker.observe({atMs,tick:atMs/50,poseRevision:1,vehicle:vehicle(92,0)});
  const block=tracker.summary().blocks[0];
  assert.equal(block.samples,53);assert.ok(block.distanceM!>=75);assert.ok(block.movingFraction!>=.8);
  assert.ok(block.movingTimeFraction<.8);assert.equal(block.maxGapMs,1000);assert.equal(block.complete,false);
});

test('unobserved ticks and slow simulation cannot count as sustained movement',()=>{
  const lost=movementTracker(10_000),slow=movementTracker(10_000);
  for(let i=0;i<100;i++)lost.observe({atMs:i*100,tick:i*100,poseRevision:1,vehicle:vehicle(i*2,20)});
  for(let i=0;i<50;i++)slow.observe({atMs:i*200,tick:i,poseRevision:1,vehicle:vehicle(i*2.5,50)});
  const missing=lost.summary().blocks[0],lagging=slow.summary().blocks[0];
  assert.ok(missing.distanceM!>=75);assert.equal(missing.movingFraction,1);assert.equal(missing.movingTimeMs,0);
  assert.ok(lagging.distanceM!>=75);assert.equal(lagging.movingFraction,1);assert.equal(lagging.movingTimeMs,2450);
  assert.equal(missing.complete,false);assert.equal(lagging.complete,false);
});

test('malformed states and negative protocol metadata invalidate coverage',()=>{
  const missingWorld=movementTracker(10_000),negativeTick=movementTracker(10_000),negativeRevision=movementTracker(10_000);
  const world={players:[{id:'driver',entityId:'car'}],entities:[{...vehicle(0),driver:'driver'}]};
  for(let i=0;i<100;i++){
    const state={tick:i*2,poseRevision:1,roomEpoch:'room',world:{...world,entities:[{...vehicle(i*1.2),driver:'driver'}]}};
    const message=i===50?{...state,world:undefined}:state;
    missingWorld.observe(movementSample(i*100,'driver','room',message as Parameters<typeof movementSample>[3]));
    negativeTick.observe({atMs:i*100,tick:i*2-200,poseRevision:1,vehicle:vehicle(i*1.2)});
    negativeRevision.observe({atMs:i*100,tick:i*2,poseRevision:-1,vehicle:vehicle(i*1.2)});
  }
  assert.equal(missingWorld.summary().blocks[0].invalidSamples,1);
  assert.equal(missingWorld.summary().blocks[0].complete,false);
  assert.equal(negativeTick.summary().blocks[0].invalidSamples,100);
  assert.equal(negativeRevision.summary().blocks[0].invalidSamples,100);
  assert.equal(negativeTick.summary().blocks[0].complete,false);
  assert.equal(negativeRevision.summary().blocks[0].complete,false);
  const broken={tick:1,poseRevision:1,world:{players:null,entities:[]}};
  assert.equal(movementSample(0,'driver','room',broken as unknown as Parameters<typeof movementSample>[3]).vehicle,null);
  const otherEpoch={tick:1,poseRevision:1,roomEpoch:'new-room',world};
  assert.equal(movementSample(0,'driver','room',otherEpoch as Parameters<typeof movementSample>[3]).vehicle,null);
});

test('roster coverage requires every expected distinct client in each observation',()=>{
  assert.equal(allPlayersPresent([{id:'one'},{id:'two'}],['one','two']),true);
  assert.equal(allPlayersPresent([{id:'one'},{id:'other'}],['one','two']),false);
  assert.equal(allPlayersPresent([{id:'one'},{id:'one'}],['one','two']),false);
  assert.equal(allPlayersPresent([{id:'one'}],['one','one']),false);
  assert.equal(allPlayersPresent(null,['one','two']),false);
});

test('movement coverage cannot substitute for sixty-second simulation progress',()=>{
  assert.equal(simulationProgressComplete(60,[57,59.9],2),true);
  assert.equal(simulationProgressComplete(60,[50.9,59.9],2),false);
  assert.equal(simulationProgressComplete(10,[9.9,9.9],2),false);
  assert.equal(simulationProgressComplete(60,[59.9],2),false);
  assert.equal(simulationProgressComplete(60,new Array<number>(2),2),false);
});

test('a snapshot gap spanning two blocks invalidates both movement blocks',()=>{
  const tracker=movementTracker(20_000);
  for(let atMs=0;atMs<20_000;atMs+=50){
    if(atMs>9050&&atMs<10950)continue;
    tracker.observe({atMs,tick:atMs/50,poseRevision:1,vehicle:vehicle(atMs*.012)});
  }
  const {blocks}=tracker.summary();
  assert.equal(blocks[0].lastAtMs,9050);
  assert.equal(blocks[1].firstAtMs,10950);
  assert.deepEqual(blocks.map(block=>block.maxGapMs),[1900,1900]);
  assert.ok(blocks.every(block=>!block.complete));
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

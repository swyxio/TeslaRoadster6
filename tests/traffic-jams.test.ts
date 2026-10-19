import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,step} from '../shared/game';
import {body,contact} from '../shared/physics';
import {updateHighwayTraffic} from '../shared/traffic';

test('Bay highway queues start bumper-to-bumper in both directions and remain stable',()=>{
  const world=createWorld(),jams=world.entities.filter(e=>e.id.startsWith('jam-'));
  assert.ok(jams.length>=50&&jams.length<=60);
  for(const site of [0,1,2,4])for(const direction of [0,1]){
    const row=jams.filter(e=>e.id.startsWith(`jam-${site}-${direction}-0-`));
    assert.ok(row.length>=5&&row.length<=6);
    for(let i=1;i<row.length;i++){
      const gap=Math.hypot(row[i].x-row[i-1].x,row[i].z-row[i-1].z);
      assert.ok(gap>9&&gap<23,`queue spacing ${gap}`);
      assert.equal(contact(body(row[i]),body(row[i-1])),null);
    }
  }
  for(let i=0;i<600;i++)step(world,new Map(),.05);
  assert.ok(jams.every(e=>e.health===100),'the seeded queues avoid damaging each other');
  assert.ok(jams.filter(e=>e.speed<5).length>=50,'the traffic stays slow');
});

test('East Bay traffic fills three lanes, then clears the bend without damage',()=>{
  const world=createWorld();
  const groups=[0,1].map(direction=>[0,1,2].map(lane=>world.entities.filter(e=>e.id.startsWith(`jam-3-${direction}-${lane}-`))));
  for(const lanes of groups){
    assert.ok(lanes.every(lane=>lane.length===2));
    for(const lane of lanes){
      assert.ok(Math.hypot(lane[0].x-lane[1].x,lane[0].z-lane[1].z)<9);
      assert.equal(contact(body(lane[0]),body(lane[1])),null);
    }
  }
  for(let i=0;i<12000;i++){
    step(world,new Map(),.05);
    if(i===3599){
      for(const lanes of groups)assert.ok(lanes.every(lane=>lane.every(car=>car.speed>1&&car.health===100)));
    }
  }
  for(const lanes of groups)for(const lane of lanes)for(const car of lane){
    assert.equal(car.health,100);assert.equal(car.supportId,'ground');assert.ok(car.speed>1);
  }
});

test('both SFO queues begin near US 101 and keep moving without damage',()=>{
  const world=createWorld(),site={x:-698,z:1107};
  const queues=[0,1].map(direction=>world.entities.filter(e=>e.id.startsWith(`jam-2-${direction}-0-`)));
  for(const queue of queues){
    assert.ok(queue.length>=5);
    assert.ok(queue.every(car=>Math.hypot(car.x-site.x,car.z-site.z)<70));
  }
  for(let i=0;i<1200;i++)step(world,new Map(),.05);
  for(const queue of queues){
    assert.ok(queue.every(car=>car.health===100&&car.supportId==='ground'));
    assert.ok(queue.every(car=>car.speed>1&&car.speed<5));
  }
});

test('an occasional cow walks across a highway lane to the shoulder',()=>{
  assert.ok(!createWorld(0).entities.some(e=>e.id==='cow-crossing'));
  const world=createWorld(1),cow=world.entities.find(e=>e.id==='cow-crossing');
  assert.ok(cow);const {x,z}=cow;
  for(let i=0;i<1000;i++)step(world,new Map(),.05);
  assert.ok(Math.hypot(cow.x-x,cow.z-z)>7,'the cow crosses the lane');
  assert.equal(cow.speed,0);
  assert.equal(cow.supportId,'ground');
});

test('a dispersed queue refreshes only when both positions are unseen and clear',()=>{
  const world=createWorld(),player=addPlayer(world,'viewer','Viewer');
  const viewer=world.entities.find(e=>e.id===player.entityId)!;
  const otherPlayer=addPlayer(world,'other','Other');
  const otherViewer=world.entities.find(e=>e.id===otherPlayer.entityId)!;
  const cars=world.entities.filter(e=>e.id.startsWith('jam-3-0-'));
  const starts=cars.map(car=>({x:car.x,z:car.z}));
  for(const car of cars)car.x+=2000;
  const displaced=cars.map(car=>({x:car.x,z:car.z}));
  // Tick 4 selects the East Bay northbound cohort.
  world.time=20;otherViewer.x=1435;otherViewer.z=4050;
  updateHighwayTraffic(world,.05,makeEntity);
  assert.deepEqual(cars.map(car=>({x:car.x,z:car.z})),displaced,'never pop into any player’s view');
  otherViewer.x=displaced[0].x;otherViewer.z=displaced[0].z;world.time=70;
  updateHighwayTraffic(world,.05,makeEntity);
  assert.deepEqual(cars.map(car=>({x:car.x,z:car.z})),displaced,'never disappear from view');
  viewer.x=-190;viewer.z=0;otherViewer.x=-180;otherViewer.z=0;
  const blocker=makeEntity('queue-blocker','model-3',starts[0].x,starts[0].z);world.entities.push(blocker);
  world.time=120;updateHighwayTraffic(world,.05,makeEntity);
  assert.deepEqual(cars.map(car=>({x:car.x,z:car.z})),displaced,'never refresh into another vehicle');
  world.entities=world.entities.filter(car=>car!==blocker);
  cars[0].owner='someone';world.time=170;updateHighwayTraffic(world,.05,makeEntity);
  assert.deepEqual(cars.map(car=>({x:car.x,z:car.z})),displaced,'never move an owned vehicle');
  cars[0].owner=null;world.time=220;updateHighwayTraffic(world,.05,makeEntity);
  assert.deepEqual(cars.map(car=>({x:car.x,z:car.z})),starts,'the same unattended cars return to their supported starting positions');
});

test('East Bay queues remain discoverable during a longer session elsewhere',()=>{
  const world=createWorld();addPlayer(world,'sf-viewer','Viewer');
  const cars=world.entities.filter(e=>e.id.startsWith('jam-3-'));
  const starts=cars.map(car=>({x:car.x,z:car.z}));
  for(let i=0;i<2500;i++)step(world,new Map(),.05);
  assert.ok(cars.every((car,i)=>Math.hypot(car.x-starts[i].x,car.z-starts[i].z)<100));
  assert.ok(cars.every(car=>car.health===100&&car.supportId==='ground'));
});

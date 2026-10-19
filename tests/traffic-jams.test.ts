import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,step} from '../shared/game';
import {body,contact} from '../shared/physics';

test('Bay highway queues start bumper-to-bumper in both directions and remain stable',()=>{
  const world=createWorld(),jams=world.entities.filter(e=>e.id.startsWith('jam-'));
  assert.ok(jams.length>=50&&jams.length<=60);
  for(const site of [0,1,2,3,4])for(const direction of [0,1]){
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

test('an occasional cow walks across a highway lane to the shoulder',()=>{
  assert.ok(!createWorld(0).entities.some(e=>e.id==='cow-crossing'));
  const world=createWorld(1),cow=world.entities.find(e=>e.id==='cow-crossing');
  assert.ok(cow);const {x,z}=cow;
  for(let i=0;i<1000;i++)step(world,new Map(),.05);
  assert.ok(Math.hypot(cow.x-x,cow.z-z)>7,'the cow crosses the lane');
  assert.equal(cow.speed,0);
  assert.equal(cow.supportId,'ground');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, step } from '../shared/game';
import { BUILDINGS, terrainHeight } from '../shared/map';
import { currentAt, currentBlockedByProgression, JET_STREAMS } from '../shared/sky-currents';
import { LEVELS } from '../shared/delivery';

test('Bay skyways are directional, clear of buildings, and obey region gates',()=>{
  const lanes=JET_STREAMS.filter(l=>/^(101|880)-(north|south)$/.test(l.id));
  assert.equal(lanes.length,4);
  for(const lane of lanes){
    const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,length=Math.hypot(dx,dz);
    assert.ok(length>=800);
    for(let i=0;i<=100;i++){
      const t=i/100,x=lane.start.x+dx*t,z=lane.start.z+dz*t;
      assert.notEqual(terrainHeight(x,z),null,`${lane.id} stays above land`);
      assert.ok(BUILDINGS.every(b=>b.h<lane.height-lane.halfHeight-2||
        Math.abs(x-b.x)>b.w/2+lane.halfWidth+3||Math.abs(z-b.z)>b.d/2+lane.halfWidth+3),`${lane.id} clears solid buildings`);
    }
    const world=createWorld(),player=addPlayer(world,'skyway','Skyway');
    const car=world.entities.find(e=>e.id===player.entityId)!;
    world.entities=[car];world.pickups=[];
    const level=lane.id.startsWith('101-')?4:5;
    player.delivery.level=level;player.delivery.cash=LEVELS[level].cash+2500;
    Object.assign(car,{x:(lane.start.x+lane.end.x)/2,z:(lane.start.z+lane.end.z)/2,y:lane.height,air:0,supportId:null,vx:0,vy:0,vz:0});
    assert.equal(currentAt(car)?.id,lane.id);
    assert.ok(currentBlockedByProgression(lane,car,0));
    assert.ok(currentBlockedByProgression(lane,car,level-1 as 3|4));
    assert.equal(currentBlockedByProgression(lane,car,level),false);
    for(let i=0;i<20;i++)step(world,new Map([[player.id,NEUTRAL]]),.05);
    assert.ok((car.vx*dx+car.vz*dz)/length>2.9,`${lane.id} pushes in the marked direction`);
    assert.ok(car.air>3.9,`${lane.id} refills air`);
  }
  for(const route of ['101','880']){
    const south=lanes.find(l=>l.id===`${route}-south`)!,north=lanes.find(l=>l.id===`${route}-north`)!;
    assert.ok((south.end.x-south.start.x)*(north.end.x-north.start.x)+(south.end.z-south.start.z)*(north.end.z-north.start.z)<0);
  }
});

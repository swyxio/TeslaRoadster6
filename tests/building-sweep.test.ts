import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEntity } from '../shared/game';
import { BUILDINGS } from '../shared/map';
import { newLandmarkPrimitives } from '../shared/new-landmark-surfaces';
import { buildingSweepBlocked } from '../src/building-sweep';

test('a supported car can interpolate along the Hornet flight deck without crossing the island',()=>{
  const index=BUILDINGS.findIndex(building=>building.landmarkId==='new-uss-hornet');
  assert.notEqual(index,-1);
  const building=BUILDINGS[index],deck=newLandmarkPrimitives(building.landmarkId!)[1];
  assert.equal(deck.shape,'box');
  const start=makeEntity('remote','roadster',building.x-3,building.z+1,'other');
  Object.assign(start,{y:(building.landmarkBase??0)+deck.y+deck.h/2,yaw:0,pitch:0,roll:0,supportId:`roof:${index}:1`});
  const along={...start,z:start.z+.5};
  assert.equal(buildingSweepBlocked(start,along,building),false,'the deck does not block a level supported path');

  const throughIsland={...start,x:building.x+3,z:building.z-1.4};
  assert.equal(buildingSweepBlocked(start,throughIsland,building),true,'the raised ship island still blocks a path through it');
});

test('a raised canopy allows a supported underpass but blocks a vertical crossing',()=>{
  const index=BUILDINGS.findIndex(building=>building.landmarkId==='new-tilden-merry-go-round');
  assert.notEqual(index,-1);
  const building=BUILDINGS[index],parts=newLandmarkPrimitives(building.landmarkId!);
  const platform=parts[0],canopy=parts[2];
  assert.equal(platform.shape,'cylinder');assert.equal(canopy.shape,'roof');
  const start=makeEntity('remote','roadster',building.x+4,building.z-.5,'other');
  Object.assign(start,{y:(building.landmarkBase??0)+platform.y+platform.h/2,yaw:0,pitch:0,roll:0,supportId:`roof:${index}:0`});
  const under={...start,z:building.z+.5};
  assert.equal(buildingSweepBlocked(start,under,building),false,'the space beneath the canopy remains open');

  const above={...under,y:(building.landmarkBase??0)+canopy.y+canopy.h/2+4,supportId:null};
  const below={...under,y:(building.landmarkBase??0)+platform.y+platform.h/2+1,supportId:null};
  assert.equal(buildingSweepBlocked(above,below,building),true,'a path through the raised canopy is blocked');
});

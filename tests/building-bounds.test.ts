import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, type Building } from '../shared/map';
import { buildingBounds, buildingBoundsOverlap } from '../shared/building-bounds';
import { landmarkBlocksPose, landmarkPartContact } from '../shared/landmark-collision';
import { makeEntity } from '../shared/game';
import { verticalBounds } from '../shared/physics';
import { buildingSweepBlocked } from '../src/building-sweep';

test('whole-building rejection preserves exhaustive part contact across the catalog',()=>{
  let checked=0;
  for(const b of BUILDINGS){
    if(!b.parts)continue;
    for(const [dx,dz] of [[0,0],[-40,0],[40,0],[0,-40],[0,40],[b.w/2,0],[0,b.d/2]])
    for(const y of [0,10,50]){
      const e=makeEntity('bounds','roadster',b.x+dx,b.z+dz,'other');
      Object.assign(e,{y,yaw:.71,supportId:null,pitch:.3,roll:.2});
      const vertical=verticalBounds(e);
      const exhaustive=b.parts.some(p=>{
        const surface=landmarkPartContact(b,p,e);
        return surface!==null&&vertical.min<surface.top-.001&&vertical.max>surface.bottom+.001;
      });
      assert.equal(landmarkBlocksPose(b,e),exhaustive,`${b.style} at ${b.x},${b.z}: ${dx},${y},${dz}`);
      checked++;
    }
  }
  assert.ok(checked>8000);
});

test('cached bounds include a rotated overhang outside the main facade',()=>{
  const b:Building={x:100,z:200,w:2,d:2,h:2,district:'sf',style:'structure',parts:[
    {shape:'box',x:20,y:3,z:0,w:10,h:2,d:2,rotationY:Math.PI/4},
  ]};
  const bounds=buildingBounds(b);
  assert.equal(buildingBounds(b),bounds,'stable geometry reuses one enclosure');
  assert.ok(bounds.maxX>124&&bounds.minZ<196);
  const car=makeEntity('overhang','roadster',120,200,'other');
  Object.assign(car,{y:2,supportId:null});
  assert.equal(landmarkBlocksPose(b,car),true);
  assert.equal(buildingSweepBlocked({...car,x:115},{...car,x:125},b),true);
  assert.equal(buildingBoundsOverlap(b,130,131,199,201),false);
  assert.equal(buildingSweepBlocked({...car,x:130},{...car,x:131},b),false);
});

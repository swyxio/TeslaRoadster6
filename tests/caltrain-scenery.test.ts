import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redwoodCityTrees } from '../src/caltrain-scenery';
import { CALTRAIN_STOPS, CALTRAIN_TRACK } from '../shared/caltrain';
import { BUILDINGS, ROADS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { contact } from '../shared/physics';

test('Redwood City redwoods remain on land and clear the town, roads, parking and railway',()=>{
  const trees=redwoodCityTrees(),station=CALTRAIN_STOPS.find(s=>s.id==='redwood-city')!;
  assert.ok(trees.length>=20,'the station has a visible grove');
  assert.ok(trees.every(p=>Math.hypot(p.x-station.platform.x,p.z-station.platform.z)<=160));
  for(const tree of trees){
    const footprint={x:tree.x,z:tree.z,w:10,d:10,yaw:0};
    assert.equal(tree.y,terrainHeight(tree.x,tree.z),'tree roots follow terrain');
    for(const [dx,dz] of [[-4,0],[4,0],[0,-4],[0,4]])assert.notEqual(terrainHeight(tree.x+dx,tree.z+dz),null,'tree stands on supported land');
    for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`tree on road at ${tree.x},${tree.z}`);
    for(const building of BUILDINGS)assert.equal(contact(footprint,{...building,yaw:0}),null,`tree on building at ${tree.x},${tree.z}`);
    for(const lot of PARKING_LOTS)assert.equal(contact(footprint,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`tree on lot at ${tree.x},${tree.z}`);
    for(const stop of CALTRAIN_STOPS)assert.equal(contact(footprint,{x:stop.platform.x,z:stop.platform.z,w:44,d:8,yaw:0}),null,`tree on ${stop.name} platform`);
    for(let i=1;i<CALTRAIN_TRACK.length;i++){
      const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((tree.x-a.x)*dx+(tree.z-a.z)*dz)/(dx*dx+dz*dz)));
      assert.ok(Math.hypot(tree.x-a.x-t*dx,tree.z-a.z-t*dz)>=9,`tree at ${tree.x},${tree.z} blocks railway`);
    }
  }
});

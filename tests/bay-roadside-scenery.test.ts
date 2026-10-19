import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ROADS, terrainHeight } from '../shared/map';
import { bayRoadsideScenery } from '../src/bay-roadside-scenery';

test('roadside scenery is deterministic and clears road and building footprints',()=>{
  const scenery=bayRoadsideScenery();
  assert.deepEqual(bayRoadsideScenery(),scenery);
  assert.ok(scenery.plants.length>100);assert.ok(scenery.lights.length>10);
  for(const [items,radius] of [[scenery.plants,6],[scenery.lights,2]] as const){
    for(const item of items){
      for(const dx of [-radius,radius])for(const dz of [-radius,radius]){
        const y=terrainHeight(item.x+dx,item.z+dz);
        assert.notEqual(y,null);assert.ok(Math.abs(y!-item.y)<=2);
      }
      for(const rect of [...ROADS,...BUILDINGS]){
        const angle='angle' in rect?rect.angle??0:0,c=Math.cos(angle),s=Math.sin(angle),dx=item.x-rect.x,dz=item.z-rect.z;
        assert.ok(Math.abs(dx*c-dz*s)>rect.w/2+radius+5||Math.abs(dx*s+dz*c)>rect.d/2+radius+5,
          'scenery does not hide a road or collision building');
      }
    }
  }
  const first=scenery.plants[0];
  const excluded=bayRoadsideScenery([{x:first.x,z:first.z,w:24,d:24}]);
  assert.ok(!excluded.plants.some(p=>p.x===first.x&&p.z===first.z),'additional landmark footprints exclude props');
});

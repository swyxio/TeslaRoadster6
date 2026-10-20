import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { VEHICLES } from '../shared/vehicles';
import { chaseFraming } from '../src/camera';

test('chase view keeps every vehicle in frame and the road ahead visible',()=>{
  for(const [portrait,aspect] of [[false,1280/720],[false,844/390],[true,390/844]] as const){
    for(const [id,vehicle] of Object.entries(VEHICLES)){
      const {distance,height,lookAhead}=chaseFraming(portrait,vehicle,{distance:0,height:0,lookAhead:0});
      const camera=new T.PerspectiveCamera(55,aspect,.1,1800);
      camera.position.set(0,height,distance);camera.lookAt(0,1.3,-lookAhead);camera.updateMatrixWorld();
      for(const x of [-vehicle.width/2,vehicle.width/2])for(const y of [0,vehicle.height])for(const z of [-vehicle.length/2,vehicle.length/2]){
        const point=new T.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(point.x)<.95&&Math.abs(point.y)<.95&&point.z<1,`${id} should fit in ${portrait?'portrait':'landscape'} chase view`);
      }
      const roadAhead=new T.Vector3(0,0,-50).project(camera);
      assert.ok(Math.abs(roadAhead.y)<.8,`${id} should leave the road ahead visible`);
    }
  }
});

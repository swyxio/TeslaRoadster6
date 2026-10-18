import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { DOME } from '../shared/dome';
import { contact, type Body } from '../shared/physics';
import { ROUTES, type Point } from '../shared/traffic';
import { VEHICLE_IDS, VEHICLES } from '../shared/vehicles';
import { addDomeStadium } from '../src/dome-stadium';

test('ambient traffic routes avoid ground-level stadium architecture', () => {
  // Read the renderer's actual instanced boxes, including the brick facade,
  // entrance pillars and statue bases, at their real world coordinates.
  const group=new T.Group();group.position.set(DOME.x,0,DOME.z);addDomeStadium(group);group.updateMatrixWorld(true);
  const architecture=group.getObjectByName('dome-stadium-architecture');
  assert.ok(architecture instanceof T.InstancedMesh);
  const width=Math.max(...VEHICLE_IDS.map(id=>VEHICLES[id].width));
  const length=Math.max(...VEHICLE_IDS.map(id=>VEHICLES[id].length));
  const height=Math.max(...VEHICLE_IDS.map(id=>VEHICLES[id].height));
  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
  const obstacles:Body[]=[];
  for(let i=0;i<architecture.count;i++){
    architecture.getMatrixAt(i,matrix);matrix.premultiply(architecture.matrixWorld);
    matrix.decompose(position,rotation,scale);
    if(position.y-scale.y/2>=height||position.y+scale.y/2<=0)continue;
    obstacles.push({x:position.x,z:position.z,w:scale.x,d:scale.z,yaw:0});
  }
  assert.ok(obstacles.length>0);
  // Use a conservative envelope of the whole ambient fleet and sample each
  // segment at <=1 m so a vehicle-sized crossing cannot fall between samples.
  function crossing(route:Point[]):string|null {
    for(let i=0;i<route.length;i++){
      const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z;
      const steps=Math.ceil(Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz);
      for(let j=0;j<=steps;j++){
        const t=steps?j/steps:0;
        const vehicle={x:a.x+dx*t,z:a.z+dz*t,w:width,d:length,yaw};
        if(obstacles.some(obstacle=>contact(vehicle,obstacle)))return `(${a.x},${a.z})→(${b.x},${b.z})`;
      }
    }
    return null;
  }
  for(const route of ROUTES)assert.equal(crossing(route),null,'traffic route intersects stadium');
  const facade=obstacles.find(obstacle=>obstacle.w>40&&obstacle.z<DOME.z);
  assert.ok(facade,'a facade box exists');
  assert.ok(crossing([{x:facade.x,z:facade.z-10},{x:facade.x,z:facade.z+10}]),'a route through the facade is detected');
});

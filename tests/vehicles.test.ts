import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh,Box3 } from 'three';
import {createVehicle} from '../src/vehicles';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
test('fleet meshes retain scale, bounded complexity and independent articulated transforms',()=>{
 for(const id of VEHICLE_IDS){
  const first=createVehicle(id),second=createVehicle(id),spec=VEHICLES[id];let triangles=0;
  first.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});
  assert.ok(triangles<12000,`${id}: ${triangles}`);
  const bounds=new Box3().setFromObject(first);
  assert.ok(bounds.max.z-bounds.min.z<spec.length+.5,id);
  for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const a=first.getObjectByName(name)!,b=second.getObjectByName(name)!;assert.ok(a&&b);a.rotation.y=.4;assert.equal(b.rotation.y,0);}
  assert.ok(first.getObjectByName('jets'));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh,Box3 } from 'three';
import {createVehicle,addRocketKit,setRocketKit,setThrusterEffects} from '../src/vehicles';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {THRUSTER_REAR,THRUSTER_SIDE_LEFT} from '../shared/game';
test('fleet meshes retain scale, bounded complexity and independent articulated transforms',()=>{
 for(const id of VEHICLE_IDS){
  const first=createVehicle(id),second=createVehicle(id),spec=VEHICLES[id];let triangles=0;
  first.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});
  assert.ok(triangles<12000,`${id}: ${triangles}`);
  const jets=first.getObjectByName('jets')!;first.remove(jets);
  const bounds=new Box3().setFromObject(first);first.add(jets);
  assert.ok(bounds.max.z-bounds.min.z<spec.length+.5,id);
  for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const a=first.getObjectByName(name)!,b=second.getObjectByName(name)!;assert.ok(a&&b);a.rotation.y=.4;assert.equal(b.rotation.y,0);}
  assert.ok(first.getObjectByName('jets'));
 }
});
test('retrofit hardware and effects are independent for each non-Rocket vehicle',()=>{
 for(const id of VEHICLE_IDS.filter(id=>!VEHICLES[id].airThrusters)){
  const first=createVehicle(id),second=createVehicle(id);
  addRocketKit(first,id);addRocketKit(first,id);
  assert.equal(first.children.filter(o=>o.name==='rocket-kit').length,1,id);
  assert.equal(second.getObjectByName('rocket-kit'),undefined,id);
  setThrusterEffects(first,THRUSTER_REAR|THRUSTER_SIDE_LEFT,1);
  assert.equal(first.getObjectByName('plume_rear_l')!.visible,true,id);
  assert.equal(first.getObjectByName('plume_side_l')!.visible,true,id);
  assert.equal(first.getObjectByName('plume_side_r')!.visible,false,id);
  assert.equal(second.getObjectByName('jets')!.visible,false,id);
  setRocketKit(first,id,false);assert.equal(first.getObjectByName('rocket-kit')!.visible,false,id);
  setRocketKit(first,id,true);assert.equal(first.getObjectByName('rocket-kit')!.visible,true,id);
  assert.equal(first.children.filter(o=>o.name==='rocket-kit').length,1,id);
 }
});
test('Rocket has ten nozzles and independently controlled vapor on each clone',()=>{
 const first=createVehicle('roadster'),second=createVehicle('roadster');
 const names:string[]=[];first.traverse(o=>{if(o.name.startsWith('nozzle_'))names.push(o.name);});
 assert.equal(names.length,10);
 setThrusterEffects(first,THRUSTER_REAR|THRUSTER_SIDE_LEFT,1);
 assert.equal(first.getObjectByName('plume_rear_0')!.visible,true);
 assert.equal(first.getObjectByName('plume_side_l')!.visible,true);
 assert.equal(first.getObjectByName('plume_side_r')!.visible,false);
 assert.equal(first.getObjectByName('plume_down_l_f')!.visible,false);
 assert.equal(second.getObjectByName('jets')!.visible,false);
 setThrusterEffects(first,0,2);assert.equal(first.getObjectByName('jets')!.visible,false);
});

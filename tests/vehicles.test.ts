import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh,InstancedMesh,Box3 } from 'three';
import {createVehicle,setVehicleDetail,setVehicleStyle,addRocketKit,setRocketKit,setThrusterEffects} from '../src/vehicles';
import {LUXURY_VEHICLE_IDS,VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {THRUSTER_REAR,THRUSTER_SIDE_LEFT} from '../shared/game';
test('fleet meshes retain scale, bounded complexity and independent articulated transforms',()=>{
 for(const id of VEHICLE_IDS){
  const first=createVehicle(id),second=createVehicle(id),spec=VEHICLES[id];let triangles=0;
  first.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof InstancedMesh?o.count:1);for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});
  assert.ok(triangles<12000,`${id}: ${triangles}`);
  const jets=first.getObjectByName('jets')!;first.remove(jets);
  const bounds=new Box3().setFromObject(first);first.add(jets);
  assert.ok(bounds.max.z-bounds.min.z<spec.length+.5,id);
  for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']){const a=first.getObjectByName(name)!,b=second.getObjectByName(name)!;assert.ok(a&&b);a.rotation.y=.4;assert.equal(b.rotation.y,0);}
  assert.ok(first.getObjectByName('jets'));
 }
});
test('luxury models have independent wheels and share cached mesh geometry',()=>{
 for(const id of LUXURY_VEHICLE_IDS){
  const first=createVehicle(id),second=createVehicle(id),spec=VEHICLES[id];
  const motorcycle=spec.shape==='motorcycle',names=motorcycle?['wheel_f','wheel_r']:['wheel_fl','wheel_fr','wheel_rl','wheel_rr'];
  let triangles=0,firstMesh:Mesh|undefined,secondMesh:Mesh|undefined;
  first.traverse(o=>{if(o instanceof Mesh){firstMesh??=o;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v),id);}});
  second.traverse(o=>{if(o instanceof Mesh)secondMesh??=o;});
  assert.ok(firstMesh&&secondMesh&&firstMesh.geometry===secondMesh.geometry,id);
  assert.ok(triangles<12000,`${id}: ${triangles}`);
  const bounds=new Box3().setFromObject(first);
  assert.ok(bounds.max.z-bounds.min.z<spec.length+.5,id);
  assert.ok(bounds.min.y>=-1e-6,id);
  for(const name of names){const a=first.getObjectByName(name),b=second.getObjectByName(name);assert.ok(a&&b,id);a.rotation.y=.4;assert.equal(b.rotation.y,0,id);}
  assert.ok(first.getObjectByName('seat_driver'),id);
  assert.ok(first.getObjectByName('jets'),id);
  if(motorcycle){
   assert.ok(first.getObjectByName('rider'),id);
   first.getObjectByName('rider')!.visible=false;assert.equal(second.getObjectByName('rider')!.visible,true,id);
   assert.equal(first.getObjectByName('wheel_fl'),undefined,id);
  }
  setRocketKit(first,id,true);setThrusterEffects(first,THRUSTER_REAR,1,true);
  assert.ok(first.getObjectByName('plume_rear_0')?.visible,id);
  assert.equal(second.getObjectByName('rocket-kit'),undefined,id);
 }
});
test('retrofit hardware and effects are independent for each non-Rocket vehicle',()=>{
 for(const id of VEHICLE_IDS.filter(id=>!VEHICLES[id].airThrusters)){
  const first=createVehicle(id),second=createVehicle(id);
  addRocketKit(first,id);addRocketKit(first,id);
  assert.equal(first.children.filter(o=>o.name==='rocket-kit').length,1,id);
  assert.equal(second.getObjectByName('rocket-kit'),undefined,id);
  setThrusterEffects(first,THRUSTER_REAR|THRUSTER_SIDE_LEFT,1);
  assert.equal(first.getObjectByName('plume_rear_0')!.visible,true,id);
  assert.equal(first.getObjectByName('plume_side_l')!.visible,true,id);
  assert.equal(first.getObjectByName('plume_side_r')!.visible,false,id);
  assert.equal(second.getObjectByName('jets')!.visible,false,id);
  setThrusterEffects(first,0,2,true);
  assert.equal(first.getObjectByName('rocket_hardware')!.visible,true,id);
  assert.equal(first.getObjectByName('jets')!.visible,false,id);
  const nozzles:string[]=[];first.traverse(o=>{if(o.name.startsWith('nozzle_'))nozzles.push(o.name);});
  assert.equal(nozzles.length,10,id);
  assert.equal(new Set(nozzles).size,10,id);
  setRocketKit(first,id,false);assert.equal(first.getObjectByName('rocket-kit')!.visible,false,id);
  setThrusterEffects(first,0,2,false);assert.equal(first.getObjectByName('rocket_hardware')!.visible,false,id);
  setRocketKit(first,id,true);assert.equal(first.getObjectByName('rocket-kit')!.visible,true,id);
  setThrusterEffects(first,0,2,true);assert.equal(first.getObjectByName('rocket_hardware')!.visible,true,id);
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

test('distant fleet preserves silhouettes, bounds geometry and restores independent upgrades',()=>{
 for(const id of VEHICLE_IDS){
  const car=createVehicle(id),other=createVehicle(id);
  setThrusterEffects(car,THRUSTER_REAR,1,true);
  assert.equal(setVehicleDetail(car,130**2),false,id);
  const far=car.getObjectByName('vehicle-distant') as Mesh;
  assert.ok(far instanceof Mesh);
  assert.ok((far.geometry.index?.count??far.geometry.attributes.position.count)/3<4000,id);
  assert.equal(car.getObjectByName('vehicle-detail')!.visible,false);
  assert.equal(other.getObjectByName('vehicle-distant'),undefined);
  assert.equal(setVehicleDetail(car,110**2),false,'hysteresis retains distant detail');
  setRocketKit(car,id,true);
  assert.equal(car.getObjectByName('rocket-kit')!.parent!.name,'vehicle-detail');
  assert.equal(setVehicleDetail(car,99**2),true);
  assert.equal(far.visible,false);assert.equal(car.getObjectByName('jets')!.visible,true);
  assert.equal(setVehicleDetail(car,120**2),true,'hysteresis retains near detail');
  assert.equal(setVehicleDetail(car,2000**2,true),true,'controlled and police detail is retained');
 }
});

test('luxury cars use distant silhouettes while bikes retain independent riders',()=>{
 for(const id of LUXURY_VEHICLE_IDS){
  const car=createVehicle(id),other=createVehicle(id);
  if(VEHICLES[id].shape==='motorcycle'){
   const rider=car.getObjectByName('rider')!;rider.visible=false;
   assert.equal(setVehicleDetail(car,200**2),true,id);
   assert.equal(rider.visible,false,id);
   assert.equal(other.getObjectByName('rider')!.visible,true,id);
   assert.equal(car.getObjectByName('vehicle-distant'),undefined,id);
   continue;
  }
  assert.equal(setVehicleDetail(car,200**2),false,id);
  const far=car.getObjectByName('vehicle-distant') as Mesh,material=far.material;
  assert.ok(far instanceof Mesh,id);
  assert.equal(setVehicleDetail(car,200**2,true),true,id);
  setVehicleStyle(car,id,{paint:'mint',decal:'stripe'});
  assert.equal(far.material,material,id);
  assert.equal(car.getObjectByName('vehicle-decal')?.parent?.name,'vehicle-detail',id);
  setVehicleStyle(car,id,{paint:'stock',decal:'none'});
  assert.equal(car.getObjectByName('vehicle-decal'),undefined,id);
  assert.equal(setVehicleDetail(car,200**2),false,id);
  assert.equal(other.getObjectByName('vehicle-distant'),undefined,id);
 }
});

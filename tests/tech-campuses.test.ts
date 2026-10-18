import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TECH_CAMPUSES,TECH_CAMPUS_BUILDINGS} from '../shared/tech-campuses';
import {BUILDINGS,ROADS,nearbyBuildings,terrainHeight} from '../shared/map';
import {PARKING_LOTS} from '../shared/parking-lots';
import {SHOPS,SHOP_RADIUS} from '../shared/upgrades';
import {createWorld} from '../shared/game';
import {body,contact} from '../shared/physics';
import {buildTechCampuses} from '../src/tech-campuses';

test('campus buildings share collision envelopes and clear playable roads, lots and spawns',()=>{
 assert.deepEqual(TECH_CAMPUSES.map(c=>c.id),['stripe','meta','google','nvidia','apple']);
 const world=createWorld();
 for(const building of TECH_CAMPUS_BUILDINGS){
  const footprint={...building,yaw:0};
  assert.ok(nearbyBuildings(building.x,building.z).includes(building),`${building.campusId}: missing from shared collision index`);
  for(const dx of [-building.w/2,0,building.w/2])for(const dz of [-building.d/2,0,building.d/2])
   assert.equal(terrainHeight(building.x+dx,building.z+dz),0,`${building.campusId}: flat supported ground`);
  for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`${building.campusId}: road`);
  for(const lot of PARKING_LOTS)assert.equal(contact(footprint,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`${building.campusId}: ${lot.id} lot`);
  for(const shop of SHOPS)assert.equal(contact(footprint,{...shop,w:SHOP_RADIUS*2,d:SHOP_RADIUS*2,yaw:0}),null,`${building.campusId}: ${shop.id} shop`);
  for(const entity of world.entities)assert.equal(contact(footprint,body(entity)),null,`${building.campusId}: spawn`);
  for(const other of BUILDINGS)if(other!==building)assert.equal(contact(footprint,{...other,yaw:0}),null,`${building.campusId}: building collision`);
 }
});

test('Apple Park has a physical ring and a clear, driveable courtyard',()=>{
 const campus=TECH_CAMPUSES.find(c=>c.id==='apple')!;
 assert.ok(campus.buildings.length>=8);
 assert.equal(terrainHeight(campus.x,campus.z),0);
 const car={x:campus.x,z:campus.z,w:3,d:5,yaw:0};
 assert.ok(campus.buildings.every(b=>!contact(car,{...b,yaw:0})));
 assert.ok(!nearbyBuildings(car.x,car.z,20).some(b=>contact(car,{...b,yaw:0})));
 for(let z=campus.z;z<=campus.z+55;z+=2)
  assert.ok(campus.buildings.every(b=>!contact({...car,z},{...b,yaw:0})),`south entrance blocked at ${z}`);
 for(const [dx,dz] of [[0,-40],[40,0],[20,40],[-40,0]])
  assert.ok(campus.buildings.some(b=>contact({...car,x:car.x+dx,z:car.z+dz},{...b,yaw:0})),`ring is missing at ${dx},${dz}`);
});

test('campus models have rendered bodies and distance-bounded readable names',()=>{
 const labels:string[]=[];
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({
  getContext:()=>({fillRect(){},strokeRect(){},fillText(value:string){labels.push(value);}}),
 })}});
 try{
  const scene=new THREE.Scene();buildTechCampuses(scene);
  assert.equal(scene.children.length,TECH_CAMPUSES.length);
  for(let i=0;i<TECH_CAMPUSES.length;i++){
   const campus=TECH_CAMPUSES[i],group=scene.children[i];
   assert.equal(group.position.x,campus.x);assert.equal(group.position.z,campus.z);
   const meshes=group.children.filter(child=>child instanceof THREE.Mesh) as THREE.Mesh[];
   assert.ok(meshes.length>=2&&meshes.length<=8,`${campus.id}: independently culled material batches`);
   const bounds=new THREE.Box3();
   for(const mesh of meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox!);}
   for(const b of campus.buildings){
    assert.ok(bounds.min.x<=b.x-campus.x-b.w/2+.01&&bounds.max.x>=b.x-campus.x+b.w/2-.01);
    assert.ok(bounds.min.z<=b.z-campus.z-b.d/2+.01&&bounds.max.z>=b.z-campus.z+b.d/2-.01);
    assert.ok(bounds.max.y>=b.h-.01);
   }
   const name=group.children.find(child=>child instanceof THREE.LOD) as THREE.LOD|undefined;
   assert.ok(name&&name.levels[1].distance<=320,`${campus.id}: missing near-only nameplate`);
   assert.ok(labels.includes(campus.name));assert.ok(labels.includes(campus.city));
  }
 }finally{
  if(prior)Object.defineProperty(globalThis,'document',prior);else Reflect.deleteProperty(globalThis,'document');
 }
});

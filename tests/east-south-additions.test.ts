import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EAST_SOUTH_ADDITIONS } from '../shared/east-south-additions';
import { CALTRAIN_TRACK } from '../shared/caltrain';
import { BUILDINGS,LANDMARKS,ROADS,nearbyBuildings,terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { SHOPS,SHOP_RADIUS } from '../shared/upgrades';
import { createWorld } from '../shared/game';
import { body,contact } from '../shared/physics';
import { buildEastSouthAdditions } from '../src/east-south-additions';

test('new East and South Bay places have shared collision and preserve routes and features',()=>{
 assert.deepEqual(EAST_SOUTH_ADDITIONS.map(p=>p.id),['chabot-space','oakland-zoo','nasa-ames','levis-stadium']);
 const world=createWorld();
 for(const place of EAST_SOUTH_ADDITIONS){
  const footprint={...place,yaw:0};
  assert.ok(nearbyBuildings(place.x,place.z).includes(place),`${place.id}: missing shared collider`);
  for(const dx of [-place.w/2,0,place.w/2])for(const dz of [-place.d/2,0,place.d/2])
   assert.equal(terrainHeight(place.x+dx,place.z+dz),0,`${place.id}: supported flat ground`);
  for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`${place.id}: blocks road`);
  for(const lot of PARKING_LOTS)assert.equal(contact(footprint,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`${place.id}: blocks ${lot.id}`);
  for(const shop of SHOPS)assert.equal(contact(footprint,{...shop,w:SHOP_RADIUS*2,d:SHOP_RADIUS*2,yaw:0}),null,`${place.id}: blocks shop ${shop.id}`);
  for(const entity of world.entities)assert.equal(contact(footprint,body(entity)),null,`${place.id}: blocks spawn`);
  for(const arrival of LANDMARKS)assert.equal(contact(footprint,{...arrival.arrival,w:20,d:20,yaw:0}),null,`${place.id}: blocks arrival ${arrival.id}`);
  for(const other of BUILDINGS)if(other!==place)assert.equal(contact(footprint,{...other,yaw:0}),null,`${place.id}: overlaps another building`);
  for(let i=1;i<CALTRAIN_TRACK.length;i++){
   const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z;
   const t=Math.max(0,Math.min(1,((place.x-a.x)*dx+(place.z-a.z)*dz)/(dx*dx+dz*dz)));
   assert.ok(Math.hypot(place.x-a.x-dx*t,place.z-a.z-dz*t)>Math.hypot(place.w,place.d)/2+3,`${place.id}: blocks rail`);
  }
 }
});

test('landmark models stay inside their collidable envelopes and label themselves nearby',()=>{
 const labels:string[]=[];
 const prior=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>({
  fillRect(){},strokeRect(){},fillText(value:string){labels.push(value);},
 })})}});
 try{
  const scene=new THREE.Scene();buildEastSouthAdditions(scene);
  assert.equal(scene.children.length,EAST_SOUTH_ADDITIONS.length);
  for(let i=0;i<EAST_SOUTH_ADDITIONS.length;i++){
   const place=EAST_SOUTH_ADDITIONS[i],group=scene.children[i];
   assert.equal(group.position.x,place.x);assert.equal(group.position.z,place.z);
   const meshes=group.children.filter(child=>child instanceof THREE.Mesh) as THREE.Mesh[];
   assert.ok(meshes.length>=2&&meshes.length<=8,`${place.id}: independently culled material batches`);
   const bounds=new THREE.Box3();
   for(const mesh of meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox!);}
   assert.ok(bounds.min.x>=-place.w/2-.1&&bounds.max.x<=place.w/2+.1,`${place.id}: exceeds width`);
   assert.ok(bounds.min.z>=-place.d/2-.1&&bounds.max.z<=place.d/2+.1,`${place.id}: exceeds depth`);
   assert.ok(bounds.min.y>=-.1&&bounds.max.y<=place.h+.1,`${place.id}: exceeds height`);
   const name=group.children.find(child=>child instanceof THREE.LOD) as THREE.LOD|undefined;
   assert.ok(name&&name.levels[1].distance<=280,`${place.id}: missing near-only name`);
   assert.ok(labels.includes(place.name));
  }
 }finally{
  if(prior)Object.defineProperty(globalThis,'document',prior);else Reflect.deleteProperty(globalThis,'document');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NEW_LANDMARKS } from '../shared/new-landmarks';
import { BUILDINGS, EXTRA_LANDMARKS, LANDMARKS, ROADS, isLand, isBridge, terrainHeight, nearbyBuildings } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RESTAURANTS, CUSTOMERS } from '../shared/delivery';
import { SHOPS } from '../shared/upgrades';
import { contact } from '../shared/physics';
import { buildNorthLandmarks } from '../src/north-landmarks';

test('100 additional researched landmarks are distinct, supported and have appropriate collision',()=>{
 assert.equal(NEW_LANDMARKS.length,100);
 const all=[...LANDMARKS,...EXTRA_LANDMARKS,...NEW_LANDMARKS];
 assert.equal(new Set(all.map(place=>place.id)).size,all.length);
 assert.equal(new Set(NEW_LANDMARKS.map(place=>place.name.toLocaleLowerCase())).size,100);
 for(const place of NEW_LANDMARKS){
  assert.match(place.source,/^https:\/\//,place.id);
  for(const dx of [-place.w/2,0,place.w/2])for(const dz of [-place.d/2,0,place.d/2]){
   assert.ok(isLand(place.x+dx,place.z+dz)&&!isBridge(place.x+dx,place.z+dz),place.id);
   assert.equal(terrainHeight(place.x+dx,place.z+dz),0,`${place.id} is on level shared ground`);
  }
  const matches=nearbyBuildings(place.x,place.z,2).filter(b=>b.style==='landmark'&&b.x===place.x&&b.z===place.z);
  assert.equal(matches.length,place.solid?1:0,place.id);
  if(place.solid)assert.equal(matches[0].h,place.h,place.id);
  const bounds={...place,yaw:0};
  for(const other of BUILDINGS)if(other!==matches[0])assert.equal(contact(bounds,{...other,yaw:0}),null,`${place.id} overlaps ${other.style}`);
 }
});

test('new landmark footprints keep roads, lots and existing gameplay targets clear',()=>{
 const targets=[...CUSTOMERS,...RESTAURANTS,...SHOPS,...LANDMARKS.map(p=>p.arrival)];
 for(const place of NEW_LANDMARKS){
  const footprint={...place,w:place.w+4,d:place.d+4,yaw:0};
  for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`${place.id} overlaps a road`);
  for(const lot of PARKING_LOTS)for(const area of [lot.area,lot.approach]){
   assert.equal(contact(footprint,{x:area.x,z:area.z,w:area.width,d:area.length,yaw:area.yaw}),null,`${place.id} overlaps ${lot.id}`);
  }
  for(const target of targets)assert.ok(Math.hypot(place.x-target.x,place.z-target.z)>=24,`${place.id} near a destination`);
 }
});

test('new model parts stay inside their shared collision envelopes',()=>{
 const originalDocument=globalThis.document;
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})}});
 try{
  const matrix=new THREE.Matrix4(),center=new THREE.Vector3(),vertex=new THREE.Vector3(),seen=new Set<string>();
  // The real renderer uses geographic batches of fewer than 52 places per atlas.
  for(let start=0;start<NEW_LANDMARKS.length;start+=40){
   const places=NEW_LANDMARKS.slice(start,start+40),scene=new THREE.Scene();buildNorthLandmarks(scene,places,[]);
   for(const mesh of scene.children){
    if(!(mesh instanceof THREE.InstancedMesh))continue;
    const vertices=mesh.geometry.getAttribute('position');
    for(let i=0;i<mesh.count;i++){
     mesh.getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix);
     const place=places.find(p=>Math.abs(center.x-p.x)<=p.w/2+.001&&Math.abs(center.z-p.z)<=p.d/2+.001);
     assert.ok(place,`unassigned part at ${center.x}, ${center.z}`);seen.add(place.id);
     for(let j=0;j<vertices.count;j++){
      vertex.fromBufferAttribute(vertices,j).applyMatrix4(matrix);
      assert.ok(Math.abs(vertex.x-place.x)<=place.w/2+.001&&Math.abs(vertex.z-place.z)<=place.d/2+.001&&vertex.y>=-.001&&vertex.y<=place.h+.001,
       `${place.id} part at ${vertex.x.toFixed(2)},${vertex.y.toFixed(2)},${vertex.z.toFixed(2)} exceeds its envelope`);
     }
    }
   }
  }
  assert.equal(seen.size,100);
 }finally{
  if(originalDocument===undefined)Reflect.deleteProperty(globalThis,'document');
  else Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:originalDocument});
 }
});

test('small landmark batches use small label textures with valid UV coordinates',()=>{
 const originalDocument=globalThis.document;
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})}});
 try{
  for(const count of [1,40]){
   const scene=new THREE.Scene();buildNorthLandmarks(scene,NEW_LANDMARKS.slice(0,count),[]);
   const labels=scene.children.find(child=>child instanceof THREE.Mesh&&!(child instanceof THREE.InstancedMesh)) as THREE.Mesh;
   const material=labels.material as THREE.MeshBasicMaterial;
   assert.ok(material.map);assert.ok(material.map.image.height<=1024);
   if(count===1)assert.ok(material.map.image.height<=64,'a one-place cell should not allocate a full atlas');
   const uv=labels.geometry.getAttribute('uv');
   for(let i=0;i<uv.count;i++)assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
  }
 }finally{
  if(originalDocument===undefined)Reflect.deleteProperty(globalThis,'document');
  else Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:originalDocument});
 }
});

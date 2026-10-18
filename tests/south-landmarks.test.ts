import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUTH_LANDMARKS } from '../shared/south-landmarks';
import { AIRPORT_RUNWAY, HIGHWAYS, LANDMARKS, isLand, terrainHeight } from '../shared/map';
import { STATIONS } from '../shared/stations';
import { SHOPS } from '../shared/upgrades';
import * as THREE from 'three';
import { buildSouthLandmarks } from '../src/south-landmarks';

function distanceToRoad(x:number,z:number):number{
 let nearest=Infinity;
 for(const road of HIGHWAYS)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
 }
 return nearest;
}
const intersects=(a:{x:number;z:number;w:number;d:number},b:{x:number;z:number;w:number;d:number},margin=0)=>
 Math.abs(a.x-b.x)<(a.w+b.w)/2+margin&&Math.abs(a.z-b.z)<(a.d+b.d)/2+margin;

test('south landmarks are 50 distinct places, supported and clear of existing routes and features',()=>{
 assert.equal(SOUTH_LANDMARKS.length,50);
 assert.equal(new Set(SOUTH_LANDMARKS.map(item=>item.id)).size,50);
 assert.equal(new Set(SOUTH_LANDMARKS.map(item=>item.name)).size,50);
 for(const item of SOUTH_LANDMARKS){
  // Mission Peak is a terrain feature, not a building. Its summit marker
  // is based at shared ground height and can sit on the authored hill.
  for(const dx of [-item.w/2,0,item.w/2])for(const dz of [-item.d/2,0,item.d/2]){
   assert.ok(isLand(item.x+dx,item.z+dz),`${item.id} must remain on land`);
   if(item.style!=='peak')assert.equal(terrainHeight(item.x+dx,item.z+dz),0,`${item.id} needs a flat footprint`);
  }
  assert.ok(distanceToRoad(item.x,item.z)>16+Math.hypot(item.w,item.d)/2+3,`${item.id} blocks a highway`);
  assert.ok(!intersects(item,AIRPORT_RUNWAY,8),`${item.id} blocks SFO's runway`);
  for(const old of LANDMARKS){
   assert.ok(!intersects(item,old,12),`${item.id} overlaps ${old.id}`);
   assert.ok(!intersects(item,{...old.arrival,w:0,d:0},12),`${item.id} blocks ${old.id} arrival`);
  }
  for(const site of [...STATIONS,...SHOPS])assert.ok(!intersects(item,{...site,w:0,d:0},15),`${item.id} blocks ${site.id}`);
 }
 for(let i=0;i<SOUTH_LANDMARKS.length;i++)for(let j=i+1;j<SOUTH_LANDMARKS.length;j++){
  assert.ok(!intersects(SOUTH_LANDMARKS[i],SOUTH_LANDMARKS[j],5),`${SOUTH_LANDMARKS[i].id} overlaps ${SOUTH_LANDMARKS[j].id}`);
 }
});

test('landmark meshes fit their shared envelopes and retain near-only labels',()=>{
 const globalWithDocument=globalThis as typeof globalThis & {document?:Document};
 const prior=globalWithDocument.document;
 Object.defineProperty(globalWithDocument,'document',{configurable:true,value:{createElement:()=>({
  getContext:()=>({fillRect(){},strokeRect(){},fillText(){}}),
 })}});
 try{
  const scene=new THREE.Scene();buildSouthLandmarks(scene);
  assert.equal(scene.children.length,SOUTH_LANDMARKS.length);
  scene.children.forEach((group,index)=>{
   const landmark=SOUTH_LANDMARKS[index],meshes=group.children.filter(child=>child instanceof THREE.Mesh) as THREE.Mesh[];
   assert.ok(meshes.length,`${landmark.id} has no visible geometry`);
   for(const mesh of meshes){
    mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox!;
    assert.ok(bounds.min.x>=-landmark.w/2-.1&&bounds.max.x<=landmark.w/2+.1,`${landmark.id} exceeds its width`);
    assert.ok(bounds.min.z>=-landmark.d/2-.1&&bounds.max.z<=landmark.d/2+.1,`${landmark.id} exceeds its depth`);
    assert.ok(bounds.max.y<=landmark.h+.1,`${landmark.id} exceeds its roof`);
   }
   const label=group.children.find(child=>child instanceof THREE.LOD) as THREE.LOD|undefined;
   assert.ok(label&&label.levels[1].distance<=250,`${landmark.id} needs a distance-bounded nameplate`);
  });
 }finally{
  if(prior)Object.defineProperty(globalWithDocument,'document',{configurable:true,value:prior});
  else Reflect.deleteProperty(globalWithDocument,'document');
 }
});

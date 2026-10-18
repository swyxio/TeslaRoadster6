import test from 'node:test';
import assert from 'node:assert/strict';
import { NORTH_LANDMARKS, NORTH_NATURAL_LANDMARKS } from '../shared/north-landmarks';
import { BUILDINGS, LANDMARKS, ROADS, isLand, isBridge, nearbyBuildings, terrainHeight } from '../shared/map';
import { STATIONS } from '../shared/stations';
import { SHOPS } from '../shared/upgrades';
import { CUSTOMERS, RESTAURANTS } from '../shared/delivery';
import { contact } from '../shared/physics';

test('northern Bay adds 50 identifiable, varied physical landmarks',()=>{
 assert.equal(NORTH_LANDMARKS.length,50);
 assert.equal(new Set(NORTH_LANDMARKS.map(p=>p.id)).size,50);
 assert.equal(new Set(NORTH_LANDMARKS.map(p=>p.name)).size,50);
 assert.ok(new Set(NORTH_LANDMARKS.map(p=>p.shape)).size>=25);
 for(const p of NORTH_LANDMARKS){
  assert.ok(nearbyBuildings(p.x,p.z,2).some(b=>b.x===p.x&&b.z===p.z&&b.w===p.w&&b.d===p.d&&b.h===p.h),`${p.id} collision`);
  for(const dx of [-p.w/2,0,p.w/2])for(const dz of [-p.d/2,0,p.d/2]){
   assert.ok(isLand(p.x+dx,p.z+dz)&&!isBridge(p.x+dx,p.z+dz),`${p.id} supported`);
   assert.equal(terrainHeight(p.x+dx,p.z+dz),0,`${p.id} level ground`);
  }
 }
});

test('northern landmarks keep roads, special sites and gameplay targets clear',()=>{
 const targets=[...LANDMARKS,...STATIONS,...SHOPS,...CUSTOMERS,...RESTAURANTS];
 const protectedStyles=['pyramid','ferry','coit','salesforce','tribune','campanile','airport','hoover','mission','rotunda'];
 const protectedBuildings=BUILDINGS.filter(b=>protectedStyles.includes(b.style));
 for(const [i,p] of NORTH_LANDMARKS.entries()){
  const footprint={x:p.x,z:p.z,w:p.w+4,d:p.d+4,yaw:0};
  for(const road of ROADS)assert.ok(!contact(footprint,{...road,yaw:road.angle??0}),`${p.id} overlaps a road`);
  for(const target of targets)assert.ok(Math.hypot(p.x-target.x,p.z-target.z)>=24,`${p.id} near ${target.name}`);
  for(const b of protectedBuildings)assert.ok(!contact(footprint,{...b,yaw:0}),`${p.id} overlaps ${b.style}`);
  for(const q of NORTH_LANDMARKS.slice(i+1))assert.ok(!contact(footprint,{...q,w:q.w+4,d:q.d+4,yaw:0}),`${p.id} overlaps ${q.id}`);
 }
});

test('natural summits use the shared driveable terrain rather than collision boxes',()=>{
 for(const place of NORTH_NATURAL_LANDMARKS){
  const x=place.x+(place.id==='twin-peaks'?10:0);
  assert.ok((terrainHeight(x,place.z)??0)>0,`${place.name} has a supported summit`);
  assert.ok(!BUILDINGS.some(b=>b.x===place.x&&b.z===place.z),`${place.name} is not a building`);
 }
});

test('northern landmark solid geometry stays inside its authoritative envelope',async()=>{
 const THREE=await import('three');
 const {buildNorthLandmarks}=await import('../src/north-landmarks');
 // The only DOM dependency is the nameplate atlas, whose pixels are irrelevant here.
 const originalDocument=globalThis.document;
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})}});
 try{
  const scene=new THREE.Scene();buildNorthLandmarks(scene);
  const matrix=new THREE.Matrix4(),center=new THREE.Vector3(),vertex=new THREE.Vector3(),seen=new Set<string>();
  for(const mesh of scene.children){
   if(!(mesh instanceof THREE.InstancedMesh))continue;
   const vertices=mesh.geometry.getAttribute('position');
   for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix);
    const place=NORTH_LANDMARKS.find(p=>Math.abs(center.x-p.x)<=p.w/2+.001&&Math.abs(center.z-p.z)<=p.d/2+.001);
    if(!place){
     // The two summit signposts are decorative and have no building envelope.
     assert.ok(NORTH_NATURAL_LANDMARKS.some(p=>Math.hypot(center.x-p.x-(p.id==='twin-peaks'?10:0),center.z-p.z)<.2),`unassigned mesh at ${center.x}, ${center.z}`);
     continue;
    }
    seen.add(place.id);const ground=terrainHeight(place.x,place.z)??0;
    for(let j=0;j<vertices.count;j++){
     vertex.fromBufferAttribute(vertices,j).applyMatrix4(matrix);
     assert.ok(Math.abs(vertex.x-place.x)<=place.w/2+.001&&Math.abs(vertex.z-place.z)<=place.d/2+.001&&vertex.y>=ground-.001&&vertex.y<=ground+place.h+.001,
      `${place.id} vertex (${vertex.x.toFixed(2)}, ${vertex.y.toFixed(2)}, ${vertex.z.toFixed(2)}) exceeds its collision envelope`);
    }
   }
  }
  assert.equal(seen.size,NORTH_LANDMARKS.length);
 }finally{
  if(originalDocument===undefined)Reflect.deleteProperty(globalThis,'document');
  else Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:originalDocument});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { SOUTH_LANDMARKS } from '../shared/south-landmarks';
import { southBuildingParts } from '../shared/south-building-structures';
import { sampleLandmarkPrimitive } from '../shared/new-landmark-surfaces';
import { BUILDINGS, buildingRoofHeight } from '../shared/map';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { dimensions } from '../shared/physics';
import { addPlayer, createWorld, step } from '../shared/game';
import { buildSouthLandmarks } from '../src/south-landmarks';

function withRenderedSouth(run:(groups:readonly T.Object3D[])=>void):void {
 const previous=globalThis.document;
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})}});
 try{
  const scene=new T.Scene();buildSouthLandmarks(scene);scene.updateMatrixWorld(true);run(scene.children);
 }finally{
  if(previous===undefined)Reflect.deleteProperty(globalThis,'document');else globalThis.document=previous;
 }
}
function place(id:string){const result=SOUTH_LANDMARKS.find(p=>p.id===id);assert.ok(result,id);return result;}
function building(id:string){const p=place(id),b=BUILDINGS.find(b=>b.x===p.x&&b.z===p.z);assert.ok(b,id);assert.ok(b.parts,id);return b;}
function visibleTop(group:T.Object3D,x:number,z:number):number {
 const ray=new T.Raycaster(new T.Vector3(x,150,z),new T.Vector3(0,-1,0));
 return ray.intersectObjects(group.children.filter(child=>child instanceof T.Mesh),false)[0]?.point.y??0;
}
function setup(id:string,dx:number,dz:number){
 const b=building(id),world=createWorld(),player=addPlayer(world,'south-audit','South audit'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];player.delivery.level=6;player.delivery.cash=1e9;
 const x=b.x+dx,z=b.z+dz;
 Object.assign(car,{x,z,y:buildingRoofHeight(b,x,z)+5,supportId:null,vy:-5,speed:0});
 return {b,world,car};
}

test('South structure profiles are cached, bounded and omit the terrain-only summit marker',()=>{
 for(const p of SOUTH_LANDMARKS){
  const parts=southBuildingParts(p.x,p.z);
  if(p.style==='peak'){assert.equal(parts,undefined);continue;}
  assert.ok(parts&&parts.length>0&&parts.length<=16,p.id);
  assert.equal(parts,southBuildingParts(p.x,p.z),'profiles must not allocate on lookup');
  assert.equal(building(p.id).parts,parts,'physics must use the authored rendered profile');
 }
});

test('all South structures have visible support, including empty corners and raised roofs',()=>withRenderedSouth(groups=>{
 // Avoid rays exactly on authored box edges: Float32 render vertices can
 // differ from shared double-precision bounds by less than a micrometer.
 const xs=[-.491,-.331,-.171,.031,.191,.351,.491],zs=[-.491,-.311,-.131,.057,.231,.413,.491];
 SOUTH_LANDMARKS.forEach((p,i)=>{
  if(p.style==='peak')return;
  const b=building(p.id);
  for(const dx of xs)for(const dz of zs){
   const x=p.x+dx*p.w,z=p.z+dz*p.d,actual=buildingRoofHeight(b,x,z),visible=visibleTop(groups[i],x,z);
   // Decorative trim or plants may be higher, but physics cannot add an
   // invisible floor to any empty part of the old enclosing rectangle.
   assert.ok(actual<=visible+.002,`${p.id} (${dx},${dz}) physical ${actual}, visible ${visible}`);
  }
 });
}));

test('South curved roofs, rotated faceting, the dish bowl and tilted slide match actual render rays',()=>withRenderedSouth(groups=>{
 const cases:[string,number,number][]=[
  ['hiller',4.1,2.3],['moffett-hangar-one',-7.3,3.1],
  ['county-history',3.1,2.3],['cantor',-2.3,3.1],
  ['sap-center',4.1,3.3],['shoreline-amphitheatre',-3.2,4.3],
  ['south-sf-city-hall',1.3,2.1],['tech-interactive',-5.3,1.2],
  ['hp-garage',2.7,1.3],['filoli',-2.1,1.2],
  ['stanford-dish',4.1,2.1],['stanford-dish',-6.3,2.3],
  ['aqua-adventure',1.7,.3],['aqua-adventure',4.1,-.4],
 ];
 for(const [id,dx,dz] of cases){
  const p=place(id),b=building(id),group=groups[SOUTH_LANDMARKS.indexOf(p)],x=p.x+dx,z=p.z+dz;
  const actual=buildingRoofHeight(b,x,z),visible=visibleTop(group,x,z);
  assert.ok(Math.abs(actual-visible)<.002,`${id} physical ${actual}, rendered ${visible}`);
 }
 const dish=place('stanford-dish'),bowl=southBuildingParts(dish.x,dish.z)!.find(p=>p.inverted)!;
 const sample=sampleLandmarkPrimitive(bowl,4.1,2.1)!;
 assert.ok(sample.top<dish.h*.6,'the concave bowl must not acquire a flat lid at its rim');
 assert.ok(sample.top-sample.bottom<.21,'the bowl must leave clear air below its shell');
}));

test('temple and quad gaps stay open below their actual canopy undersides',()=>{
 for(const id of ['pulgas','stanford-quad']){
  const b=building(id),p=place(id),base=p.style==='quad'?p.h*.24:p.h*.12;
  const pose={kind:'roadster' as const,x:b.x,z:b.z,y:base,yaw:0,pitch:0,roll:0,supportId:null};
  assert.equal(landmarkBlocksPose(b,pose),false,`${id}: empty corridor below roof`);
  assert.equal(landmarkBlocksPose(b,{...pose,y:p.h*.78}),true,`${id}: roof still blocks`);
 }
});

test('authoritative drops land on the visible curved roof, dish bowl and tilted slide',()=>withRenderedSouth(groups=>{
 for(const [id,dx,dz] of [['hiller',4.1,2.3],['stanford-dish',4.1,2.1],['aqua-adventure',1.7,.3]] as const){
  const {b,world,car}=setup(id,dx,dz);
  for(let i=0;i<70&&car.supportId===null;i++)step(world,new Map(),.05);
  assert.ok(car.supportId?.startsWith('roof:'),`${id}: missing landing, y=${car.y}`);
  const p=place(id),group=groups[SOUTH_LANDMARKS.indexOf(p)];
  let contactHeight=-Infinity;
  const size=dimensions(car.kind),c=Math.cos(car.yaw),s=Math.sin(car.yaw);
  for(let ix=-10;ix<=10;ix++)for(let iz=-10;iz<=10;iz++){
   const dx=ix*size.width/20,dz=iz*size.length/20;
   contactHeight=Math.max(contactHeight,visibleTop(group,car.x+dx*c+dz*s,car.z-dx*s+dz*c));
  }
  assert.ok(Math.abs(car.y-contactHeight)<.08,`${id}: body contact ${car.y}, rendered ${contactHeight}`);
 }
}));

test('a South hangar corner does not retain its former full-height invisible roof',()=>{
 const {b,world,car}=setup('moffett-hangar-one',13,9);
 Object.assign(car,{y:place('moffett-hangar-one').h+5,vy:-5});
 for(let i=0;i<80;i++)step(world,new Map(),.05);
 assert.ok(car.y<b.h*.6,`landed on old envelope at ${car.y}`);
});

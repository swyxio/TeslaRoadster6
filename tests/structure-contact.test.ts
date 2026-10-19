import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BUILDINGS, type Building } from '../shared/map';
import { createEmptyWorld, makeEntity, step } from '../shared/game';
import { landmarkBlocksPose, landmarkPartContact } from '../shared/landmark-collision';
import { dimensions, type OrientedPose } from '../shared/physics';
import type { StructuralPrimitive } from '../shared/new-landmark-surfaces';

const rotunda=BUILDINGS.find(b=>b.style==='rotunda')!;
const nasa=BUILDINGS.find(b=>b.x===-280&&b.z===5030)!;

// Independent mesh rays use the actual construction in bay-world and
// east-south-additions, rather than the collision sampler being exercised.
function visibleSurface(b:Building,dx:number,dz:number,underside=false):number {
 const mesh=b===rotunda
  ?new T.Mesh(new T.SphereGeometry(9,20,10,0,Math.PI*2,0,Math.PI/2),new T.MeshBasicMaterial({side:T.DoubleSide}))
  :new T.Mesh(new T.CylinderGeometry(1,1,1,16),new T.MeshBasicMaterial({side:T.DoubleSide}));
 if(b===rotunda)mesh.position.y=14;
 else {mesh.position.y=22*.7;mesh.scale.set(6,38*.74,6);mesh.rotation.x=Math.PI/2;}
 mesh.updateMatrixWorld(true);
 const ray=new T.Raycaster(new T.Vector3(dx,underside?-50:100,dz),new T.Vector3(0,underside?1:-1,0));
 const hit=ray.intersectObject(mesh,false)[0];
 mesh.geometry.dispose();mesh.material.dispose();
 assert.ok(hit,'the independent ray must hit visible structure');
 return (b.landmarkBase??0)+hit.point.y;
}

function fixture(b:Building,dx:number,y:number) {
 const car=makeEntity('contact','roadster',b.x+dx,b.z,'contact'),world=createEmptyWorld();
 Object.assign(car,{y,supportId:null,air:0});world.entities.push(car);
 return {car,world};
}

for(const side of [-1,1])test(`rotunda roof blocks the ${side<0?'west':'east'} body edge before the pivot`,()=>{
 const {car}=fixture(rotunda,side*8.5,18);
 const edgeTop=visibleSurface(rotunda,side*7.5,0);
 assert.ok(edgeTop>car.y+.8,'fixture body edge visibly penetrates the roof');
 assert.equal(landmarkBlocksPose(rotunda,car),true);
 car.y=edgeTop+.02;
 assert.equal(landmarkBlocksPose(rotunda,car),false,'clearance above the highest touched facet stays open');
 car.x=rotunda.x+side*10.1;car.y=14.2;
 assert.equal(landmarkBlocksPose(rotunda,car),false,'the empty space beyond the dome edge stays open');
});

for(const side of [-1,1])test(`NASA barrel blocks the ${side<0?'west':'east'} body edge below its curved underside`,()=>{
 const {car}=fixture(nasa,side*5.7,11.6);
 const edgeBottom=visibleSurface(nasa,side*4.7,0,true);
 assert.ok(car.y>11.55,'fixture clears the lower campus slab');
 assert.ok(car.y+dimensions(car.kind).height>edgeBottom+.8,'fixture intersects the visible tube');
 assert.equal(landmarkBlocksPose(nasa,car),true);
 car.x=nasa.x+side*6.6;car.y=12.1;
 const clearBottom=visibleSurface(nasa,side*5.6,0,true);
 assert.ok(car.y+dimensions(car.kind).height<clearBottom-.02);
 assert.equal(landmarkBlocksPose(nasa,car),false,'a body below the actual barrel must stay clear');
 car.y=12.2;
 assert.equal(landmarkBlocksPose(nasa,car),true,'a small rise contacts the edge, even with the pivot outside');
});

for(const [name,b,dx] of [['rotunda',rotunda,8.5],['NASA barrel',nasa,5.7]] as const)
 test(`${name} edge drop rests above the visible body contact and retains that support`,()=>{
  const {world,car}=fixture(b,dx,25),edgeTop=visibleSurface(b,dx-1,0);
  car.vy=-5;let landed=false;
  for(let i=0;i<45;i++){
   step(world,new Map(),.05);
   assert.ok(car.y>=edgeTop-.002,`body sank below touched roof: ${car.y} < ${edgeTop}`);
   if(car.supportId!==null){landed=true;assert.ok(car.supportId.startsWith('roof:'));}
  }
  assert.ok(landed,'drop must acquire a structural roof support');
  assert.ok(Math.abs(car.y-edgeTop)<.002,'the car rests at contact height without a floating clearance gap');
 });

for(const side of [-1,1])test(`rising beneath NASA's ${side<0?'west':'east'} barrel edge stops before body penetration`,()=>{
 const {world,car}=fixture(nasa,side*6.6,11.6),bottom=visibleSurface(nasa,side*5.6,0,true);
 car.vy=6;let highest=-Infinity;
 for(let i=0;i<12;i++){
  step(world,new Map(),.05);
  const top=car.y+dimensions(car.kind).height;
  highest=Math.max(highest,top);
  assert.ok(top<=bottom+.002,`body crossed curved underside: ${top} > ${bottom}`);
 }
 assert.ok(Math.abs(highest-bottom)<.002,'upward motion reaches and resolves the visible underside');
});

function independentPartMesh(b:Building,p:StructuralPrimitive) {
 let geometry:T.BufferGeometry;
 if(p.shape==='box')geometry=new T.BoxGeometry(1,1,1);
 else if(p.shape==='roof'){
  geometry=new T.ConeGeometry(.5,1,4);
  if(!p.roofDiamond)geometry.rotateY(Math.PI/4);
 }else if(p.shape==='cylinder')geometry=new T.CylinderGeometry((p.topScale??1)*.5,.5,1,p.segments??12);
 else geometry=new T.SphereGeometry(.5,p.segments??16,p.rings??8,0,Math.PI*2,0,Math.PI/2);
 const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
 mesh.scale.set(p.w,p.shape==='dome'?p.h*2:p.h,p.d);
 mesh.rotation.set(p.rotationX??0,p.rotationY??0,p.inverted?Math.PI:p.rotationZ??0,'YXZ');
 mesh.position.set(b.x+p.x,(b.landmarkBase??0)+p.y,b.z+p.z);mesh.updateMatrixWorld(true);
 return mesh;
}

function sampledFootprint(mesh:T.Mesh,pose:OrientedPose) {
 const {width,length}=dimensions(pose.kind),yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),pose.yaw);
 const ray=new T.Raycaster(),point=new T.Vector3(),down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0);
 let top=-Infinity,bottom=Infinity,hits=0;
 // 25×25 rays are bounded regression evidence, not proof over every possible
 // pose. Include the body boundary; allow a small finite-grid extrema margin.
 for(let ix=0;ix<=24;ix++)for(let iz=0;iz<=24;iz++){
  point.set((ix/24-.5)*width,0,(iz/24-.5)*length).applyQuaternion(yaw);
  const x=pose.x+point.x,z=pose.z+point.z;
  ray.set(new T.Vector3(x,100,z),down);const high=ray.intersectObject(mesh,false)[0];
  ray.set(new T.Vector3(x,-100,z),up);const low=ray.intersectObject(mesh,false)[0];
  if(high&&low){top=Math.max(top,high.point.y);bottom=Math.min(bottom,low.point.y);hits++;}
 }
 return {top,bottom,hits};
}

const variableContacts:{name:string;part:StructuralPrimitive;dx:number;dz:number;yaw:number}[]=[
 {name:'pitched square roof',part:{shape:'roof',x:2,y:12,z:-1,w:14,h:5,d:10,rotationY:.33},dx:2.6,dz:1.4,yaw:.7},
 {name:'diamond roof',part:{shape:'roof',x:-3,y:12,z:2,w:14,h:6,d:10,roofDiamond:true,rotationY:.55},dx:2.4,dz:-1.1,yaw:-.3},
 {name:'narrowing cylinder',part:{shape:'cylinder',x:2,y:12,z:-1,w:12,h:8,d:10,segments:12,topScale:.4,rotationY:.26},dx:4,dz:1,yaw:.8},
 {name:'flaring cylinder',part:{shape:'cylinder',x:-3,y:12,z:2,w:12,h:8,d:10,segments:12,topScale:1.6,rotationY:-.35},dx:6.2,dz:0,yaw:.4},
 {name:'inverted dish',part:{shape:'dome',x:2,y:14,z:-1,w:20,h:5,d:16,segments:18,rings:10,inverted:true,rotationY:.22},dx:5.5,dz:1.2,yaw:-.6},
 {name:'tilted slab',part:{shape:'box',x:-3,y:12,z:2,w:12,h:1.2,d:9,rotationZ:-.52,rotationY:.4},dx:2.3,dz:1.1,yaw:-.7},
];

for(const {name,part,dx,dz,yaw} of variableContacts)test(`${name} footprint extrema match translated and yawed mesh contacts`,()=>{
 const b:Building={x:103,z:-77,w:40,d:40,h:40,district:'sf',style:'structure',landmarkBase:3.25,parts:[part]};
 const pose:OrientedPose={kind:'roadster',x:b.x+part.x+dx,z:b.z+part.z+dz,y:0,yaw,pitch:0,roll:0,supportId:null};
 const mesh=independentPartMesh(b,part),visible=sampledFootprint(mesh,pose);
 mesh.geometry.dispose();(mesh.material as T.Material).dispose();
 assert.ok(visible.hits>50,'fixture must overlap a substantial visible part');
 // The inverted mesh has no thickness; the documented physical dish shell
 // deliberately extends 0.2m down from it. Other shapes are closed solids.
 const expectedBottom=visible.bottom-(part.inverted?.2:0),margin=.12;
 const contact=landmarkPartContact(b,part,pose);assert.ok(contact,'visible overlap must have physical contact');
 assert.ok(contact.top>=visible.top-.002,`missed top contact ${contact.top} < ${visible.top}`);
 assert.ok(contact.top<=visible.top+margin,`excessive invisible roof ${contact.top} > ${visible.top}`);
 assert.ok(contact.bottom<=expectedBottom+.002,`missed underside ${contact.bottom} > ${expectedBottom}`);
 assert.ok(contact.bottom>=expectedBottom-margin,`excessive invisible underside ${contact.bottom} < ${expectedBottom}`);
 const height=dimensions(pose.kind).height;
 assert.equal(landmarkBlocksPose(b,{...pose,y:visible.top-.03}),true,'body reaching the visible top must contact');
 assert.equal(landmarkBlocksPose(b,{...pose,y:visible.top+margin+.02}),false,'clear air above stays clear');
 assert.equal(landmarkBlocksPose(b,{...pose,y:expectedBottom-height+.03}),true,'body reaching the physical underside must contact');
 assert.equal(landmarkBlocksPose(b,{...pose,y:expectedBottom-height-margin-.02}),false,'clear air below stays clear');
 assert.equal(landmarkBlocksPose(b,{...pose,x:b.x+50,y:(visible.top+expectedBottom)/2}),false,'translated empty space stays clear');
});

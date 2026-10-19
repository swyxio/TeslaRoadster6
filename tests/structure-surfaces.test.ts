import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { BUILDINGS, FREMONT_SPACEPORT, buildingRoofHeight, nearbyBuildings, supportHeight } from '../shared/map';
import { NORTH_LANDMARKS } from '../shared/north-landmarks';
import { SOUTH_LANDMARKS } from '../shared/south-landmarks';
import { addPlayer, createWorld, NEUTRAL, step } from '../shared/game';
import { planNavigation } from '../shared/navigation';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { EAST_SOUTH_ADDITIONS } from '../shared/east-south-additions';
import { buildEastSouthAdditions } from '../src/east-south-additions';
import { buildBay } from '../src/bay-world';
import { buildNorthLandmarks } from '../src/north-landmarks';
import { buildFremontSpaceport } from '../src/fremont-spaceport';
import { spaceportStructureBoxes } from '../shared/spaceport-structures';

function withCanvas<T>(run:()=>T):T {
 const previous=globalThis.document;
 const context=new Proxy({measureText:()=>({width:100})},{get:(target,key)=>key in target?Reflect.get(target,key):()=>{}});
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
 try{return run();}finally{if(previous===undefined)Reflect.deleteProperty(globalThis,'document');else globalThis.document=previous;}
}
function rayHeight(scene:T.Scene,x:number,z:number){
 scene.traverse(object=>{if(object instanceof T.Sprite)object.raycast=()=>{};});
 const ray=new T.Raycaster(new T.Vector3(x,200,z),new T.Vector3(0,-1,0));
 return ray.intersectObjects(scene.children,true).find(hit=>!(hit.object instanceof T.Sprite))?.point.y??0;
}
function setup(){
 const world=createWorld(),player=addPlayer(world,'audit','Audit'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];player.delivery.level=5;player.delivery.cash=1e8;
 return {world,car};
}

test('coordinate-keyed legacy structure catalogs have no ambiguous locations',()=>{
 const places=[...NORTH_LANDMARKS,...SOUTH_LANDMARKS,...EAST_SOUTH_ADDITIONS];
 const locations=new Map<string,string>();
 for(const place of places){
  const key=`${place.x},${place.z}`;
  assert.equal(locations.has(key),false,`${place.id} shares a profile location with ${locations.get(key)}`);
  locations.set(key,place.id);
 }
});

test('ordinary pitched roofs and round landmark caps match actual rendered rays',()=>withCanvas(()=>{
 const scene=new T.Scene();buildBay(scene);scene.updateMatrixWorld(true);
 for(const style of ['house','midrise','pyramid','salesforce','coit','rotunda','airport','campanile','mission','tribune'] as const){
  const b=BUILDINGS.find(p=>p.style===style)!;
  for(const [dx,dz] of [[.123,.217],[.2,.1],[-.31,.31],[.4,.4],[-.45,.425]]){
   const x=b.x+b.w*dx,z=b.z+b.d*dz,expected=rayHeight(scene,x,z),actual=buildingRoofHeight(b,x,z);
   assert.ok(Math.abs(actual-expected)<.12,`${style} (${dx},${dz}): physics ${actual}, rendered ${expected}`);
  }
 }
}));

test('Fremont factory panels and launch tower arms/cap have their rendered surfaces',()=>withCanvas(()=>{
 const scene=new T.Scene();buildFremontSpaceport(scene);scene.updateMatrixWorld(true);
 for(const kind of ['factory','tower'] as const){
  const site=FREMONT_SPACEPORT[kind],b=BUILDINGS.find(p=>p.x===site.x&&p.z===site.z)!;
  const points=kind==='factory'?[[.123,.217],[-.31,-.19],[.41,.36]]:[[0,0],[-15/site.w,5/site.d],[-15/site.w,-5/site.d]];
  for(const [dx,dz] of points){
   const x=b.x+b.w*dx,z=b.z+b.d*dz;
   assert.ok(Math.abs(buildingRoofHeight(b,x,z)-rayHeight(scene,x,z))<.001,`${kind} ${dx},${dz}`);
   assert.ok(nearbyBuildings(x,z,0).includes(b),'overhang is indexed outside the main tower body');
  }
  if(kind==='tower'){
   const pose={kind:'roadster' as const,x:b.x-15,z:b.z+5,y:0,yaw:0,pitch:0,roll:0,supportId:'ground' as const};
   assert.equal(landmarkBlocksPose(b,pose),false,'ground under tower arms stays clear');
   assert.equal(landmarkBlocksPose(b,{...pose,y:92,supportId:null}),true,'visible arms stop airborne cars');
  }
 }
}));

test('flame channel renders the shared physical wall, bridge and deflector surfaces',()=>withCanvas(()=>{
 const scene=new T.Scene();buildFremontSpaceport(scene);scene.updateMatrixWorld(true);
 const group=scene.getObjectByName('starbase-pad');assert.ok(group);
 const pad=FREMONT_SPACEPORT.pad;
 const heights=(x:number,z:number)=>new T.Raycaster(new T.Vector3(x,200,z),new T.Vector3(0,-1,0))
  .intersectObject(group,true).map(hit=>hit.point.y);
 for(const part of spaceportStructureBoxes('pad',pad)){
  const top=part.y+part.h/2;
  assert.ok(heights(pad.x+part.x,pad.z+part.z).some(y=>Math.abs(y-top)<.001),`missing rendered channel surface at ${part.x},${part.z}, y=${top}`);
 }
 assert.ok(heights(pad.x,pad.z+42).every(y=>y<=.1),'outlet is open above the decorative floor');
}));

test('Sutro has open space between posts and a real underside on each crossbeam',()=>{
 const b=BUILDINGS.find(b=>b.x===-270&&b.z===-30)!;
 const pose={kind:'roadster' as const,x:b.x,z:b.z,y:0,yaw:0,pitch:0,roll:0,supportId:'ground' as const};
 assert.equal(landmarkBlocksPose(b,pose),false,'empty space between posts must stay open');
 assert.equal(landmarkBlocksPose(b,{...pose,x:b.x+3.5}),true,'visible post must block');
 assert.equal(landmarkBlocksPose(b,{...pose,y:6.8,supportId:null}),true,'rising car must hit first crossbeam');
 assert.equal(landmarkBlocksPose(b,{...pose,y:4,supportId:null}),false,'car below crossbeam remains clear');
 // This was the original video impact, at the full envelope before the right post.
 assert.equal(landmarkBlocksPose(b,{...pose,x:-260.351338,z:-31.238959,yaw:1.2}),false);
 const {world,car}=setup();Object.assign(car,{x:-260.351338,z:-31.238959,yaw:1.2,speed:53.6448});
 step(world,new Map([['audit',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(car.speed>50,'no invisible envelope bounce at the recorded pose');
});

test('round-building empty corners no longer support a falling car',()=>{
 for(const [style,x,z] of [['salesforce',-20,-20],['rotunda',1689,8709]] as const){
  const {world,car}=setup(),b=BUILDINGS.find(b=>b.style===style)!;
  assert.equal(buildingRoofHeight(b,x,z),0);
  assert.equal(supportHeight(`roof:${BUILDINGS.indexOf(b)}`,x,z),null,'empty corner is not a ground-height roof');
  Object.assign(car,{x,z,y:b.h+3,supportId:null,vy:-8,speed:0});
  for(let i=0;i<60;i++)step(world,new Map(),.05);
  assert.ok(car.y<b.h-3,`${style} stuck on invisible corner at ${car.y}`);
 }
});

test('tower legs stop cars but leave the Bay Bridge roadway open',()=>{
 const blocked=setup();Object.assign(blocked.car,{x:98,z:71,y:0,supportId:'ground',yaw:-Math.PI/2,speed:20});
 for(let i=0;i<15;i++)step(blocked.world,new Map([['audit',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(blocked.car.x<104,'car passed through visible tower leg');
 const clear=setup();Object.assign(clear.car,{x:98,z:60,y:0,supportId:'ground',yaw:-Math.PI/2,speed:20});
 for(let i=0;i<15;i++)step(clear.world,new Map([['audit',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(clear.car.x>109,'crossbeam must not fill the road below');
});

test('stadium masonry is solid while its entrance remains open',()=>{
 const blocked=setup();Object.assign(blocked.car,{x:-10,z:135,y:0,supportId:'ground',yaw:Math.PI,speed:20});
 for(let i=0;i<15;i++)step(blocked.world,new Map([['audit',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(blocked.car.z<144,'car crossed the visible north brick facade');
 const clear=setup();Object.assign(clear.car,{x:-50,z:135,y:0,supportId:'ground',yaw:Math.PI,speed:20});
 for(let i=0;i<40;i++)step(clear.world,new Map([['audit',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(clear.car.inDome,'real entrance must remain driveable');
});

test('all northern authored structural profiles have ray-backed roof coverage',()=>withCanvas(()=>{
 const scene=new T.Scene();buildNorthLandmarks(scene);scene.updateMatrixWorld(true);
 for(const p of NORTH_LANDMARKS){
  const b=BUILDINGS.find(b=>b.x===p.x&&b.z===p.z)!;
  assert.ok(b.parts&&b.parts.length<=16,p.id);
  for(const [dx,dz] of [[.123,.217],[-.31,-.19],[.41,.36],[-.42,.42]]){
   const x=p.x+dx*p.w,z=p.z+dz*p.d,actual=buildingRoofHeight(b,x,z),visible=rayHeight(scene,x,z);
   // Decoration can rise above the solid roof; an invisible support cannot.
   assert.ok(actual<=visible+.02,`${p.id} invisible support ${actual} > ${visible}`);
  }
 }
}));

test('Chabot, Zoo, NASA barrel and Levi roofs match their rendered surfaces',()=>withCanvas(()=>{
 const scene=new T.Scene();buildEastSouthAdditions(scene);scene.updateMatrixWorld(true);
 for(const p of EAST_SOUTH_ADDITIONS){
  const b=BUILDINGS.find(b=>b.x===p.x&&b.z===p.z)!;
  for(const [dx,dz] of [[.123,.217],[-.31,-.19],[.41,.36],[-.42,.42],[.05,.08]]){
   const x=p.x+dx*p.w,z=p.z+dz*p.d,actual=buildingRoofHeight(b,x,z),visible=rayHeight(scene,x,z);
   assert.ok(Math.abs(actual-visible)<.04,`${p.id} profile ${actual} != mesh ${visible}`);
  }
 }
}));

test('self-driving stays on the road through the bridge tower opening',()=>{
 const {world,car}=setup();Object.assign(car,{x:92,z:63,y:0,yaw:-Math.PI/2,speed:10});
 const route=planNavigation(car,{x:125,z:63},6);assert.ok(route);car.navigation=route;car.autopilot=true;
 for(let i=0;i<120;i++)step(world,new Map(),.05);
 assert.ok(car.x>115,`self-drive was blocked under a crossbeam at ${car.x}`);
});

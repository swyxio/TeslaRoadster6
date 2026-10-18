import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeEntity,NEUTRAL,step,type Entity,type World} from '../shared/game';
import {BUILDINGS,HIGHWAYS,HILL,OVERPASS,isLand,overpassHeight,supportHeight,supportNormal,terrainHeight} from '../shared/map';
import {dimensions} from '../shared/physics';

const isolated=(car:Entity):World=>({entities:[car],players:[],pickups:[],time:0});
const drive=new Map([['p',{...NEUTRAL,throttle:1}]]);

test('hill is supported land with shared triangular heights and normals',()=>{
 const midX=(HILL.minX+HILL.maxX)/2,midZ=(HILL.minZ+HILL.maxZ)/2;
 assert.equal(terrainHeight(midX,midZ),HILL.height);
 for(const x of [HILL.minX,(HILL.minX+midX)/2,midX,(midX+HILL.maxX)/2,HILL.maxX]){
  for(const z of [HILL.minZ,midZ,HILL.maxZ])assert.ok(isLand(x,z));
 }
 assert.equal(terrainHeight(HILL.minX,midZ),0);
 const x=HILL.minX+(HILL.maxX-HILL.minX)*.31,z=HILL.minZ+(HILL.maxZ-HILL.minZ)*.41;
 const normal=supportNormal('ground',x,z)!,epsilon=.001;
 assert.ok(Math.abs(Math.hypot(normal.x,normal.y,normal.z)-1)<1e-12);
 assert.ok(Math.abs((terrainHeight(x+epsilon,z)!-terrainHeight(x,z)!)/epsilon+normal.x/normal.y)<1e-7);
 assert.ok(Math.abs((terrainHeight(x,z+epsilon)!-terrainHeight(x,z)!)/epsilon+normal.z/normal.y)<1e-7);
 const roof=BUILDINGS[0],roofNormal=supportNormal('roof:0',roof.x,roof.z)!;
 assert.equal(roofNormal.y,1);assert.ok(Math.abs(roofNormal.x)<1e-12&&Math.abs(roofNormal.z)<1e-12);
});

test('a car drives up and over the hill on the shared surface',()=>{
 const car=makeEntity('p','roadster',HILL.minX-10,(HILL.minZ+HILL.maxZ)/2,'p');
 car.yaw=-Math.PI/2;const world=isolated(car);let highest=0;
 for(let i=0;i<500&&car.x<HILL.maxX+5;i++){
  step(world,drive,.05);highest=Math.max(highest,car.y);
  assert.equal(car.supportId,'ground');assert.ok(Math.abs(car.y-terrainHeight(car.x,car.z)!)<1e-7);
 }
 assert.ok(car.x>HILL.maxX+5,`stopped on hill at ${car.x}`);assert.ok(highest>9);
});

test('overpass is driven from either ground-level ramp and returns to ground',()=>{
 for(const direction of [1,-1]){
  const car=makeEntity(`car-${direction}`,'roadster',direction===1?OVERPASS.start-15:OVERPASS.end+15,OVERPASS.z,'p');
  car.yaw=direction===1?-Math.PI/2:Math.PI/2;const world=isolated(car);let onDeck=false;
  for(let i=0;i<500&&(direction===1?car.x<OVERPASS.end+5:car.x>OVERPASS.start-5);i++){
   step(world,drive,.05);
   if(car.x>OVERPASS.deckStart&&car.x<OVERPASS.deckEnd){onDeck=true;assert.equal(car.supportId,'overpass');assert.equal(car.y,OVERPASS.height);}
  }
  assert.ok(onDeck,`did not reach deck from direction ${direction}; x=${car.x}`);
  assert.ok(direction===1?car.x>OVERPASS.end+5:car.x<OVERPASS.start-5,`did not leave ramp: x=${car.x}`);
  assert.equal(car.supportId,'ground');assert.equal(car.y,0);
 }
});

test('ramp approaches remain traversable at 100, 160 and 220 km/h in both directions',()=>{
 for(const direction of [1,-1])for(const kmh of [100,160,220]){
  const car=makeEntity('p','roadster',direction===1?OVERPASS.start-20:OVERPASS.end+20,OVERPASS.z,'p');
  Object.assign(car,{yaw:direction===1?-Math.PI/2:Math.PI/2,speed:kmh/3.6});const world=isolated(car);
  let onDeck=false;
  for(let i=0;i<300&&(direction===1?car.x<OVERPASS.end+5:car.x>OVERPASS.start-5);i++){
   step(world,new Map([['p',{...NEUTRAL,throttle:1,boost:true}]]),.05);
   if(car.supportId==='overpass'){
    const expected=overpassHeight(car.x,car.z);
    if(expected!==null)assert.ok(Math.abs(car.y-expected)<1e-7);
    if(car.x>OVERPASS.deckStart&&car.x<OVERPASS.deckEnd)onDeck=true;
   }
  }
  assert.ok(onDeck,`${kmh} km/h direction ${direction} failed to reach deck at x=${car.x}`);
  assert.ok(direction===1?car.x>OVERPASS.end+5:car.x<OVERPASS.start-5,`${kmh} km/h direction ${direction} stopped at x=${car.x}`);
  assert.equal(car.supportId,'ground');
 }
});

test('a highway car drives under the crossing without an underside collision',()=>{
 const points=HIGHWAYS[0].points;
 const index=points.findIndex((p,i)=>i>0&&p.z>=OVERPASS.z&&points[i-1].z<=OVERPASS.z);
 assert.ok(index>0);const a=points[index-1],b=points[index],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 const x=a.x+(OVERPASS.z-a.z)*dx/dz;
 assert.ok(x>OVERPASS.deckStart&&x<OVERPASS.deckEnd);
 const car=makeEntity('p','tesla-semi',x-dx/length*30,OVERPASS.z-dz/length*30,'p');
 Object.assign(car,{yaw:Math.atan2(-dx,-dz),speed:20});const world=isolated(car);
 for(let i=0;i<120&&car.z<OVERPASS.z+30;i++)step(world,drive,.05);
 assert.ok(car.z>OVERPASS.z+30,`highway car blocked at ${car.x},${car.z}`);
 assert.equal(car.supportId,'ground');assert.equal(car.y,0);assert.ok(car.speed>0);
});

test('collision separation resamples both supported cars on a slope',()=>{
 const x=HILL.minX+(HILL.maxX-HILL.minX)*.25,z=(HILL.minZ+HILL.maxZ)/2;
 const a=makeEntity('a','roadster',x,z),b=makeEntity('b','roadster',x+1,z);
 const world=isolated(a);world.entities.push(b);step(world,new Map(),.05);
 for(const car of [a,b]){
  assert.equal(car.supportId,'ground');assert.ok(Math.abs(car.y-terrainHeight(car.x,car.z)!)<1e-7);
 }
 assert.ok(b.x-a.x>1);
});

test('cars on the highway below and on the deck do not collide',()=>{
 const x=(OVERPASS.deckStart+OVERPASS.deckEnd)/2;
 const lower=makeEntity('lower','tesla-semi',x,OVERPASS.z),upper=makeEntity('upper','roadster',x,OVERPASS.z);
 upper.y=OVERPASS.height;upper.supportId='overpass';const world=isolated(lower);world.entities.push(upper);
 for(let i=0;i<20;i++)step(world,new Map(),.05);
 assert.equal(lower.y,0);assert.equal(lower.x,x);assert.equal(upper.y,OVERPASS.height);assert.equal(upper.x,x);
});

test('airborne cars land on the deck and cannot rise through its underside',()=>{
 const x=(OVERPASS.deckStart+OVERPASS.deckEnd)/2;
 const car=makeEntity('p','roadster',x,OVERPASS.z,'p');const world=isolated(car);
 Object.assign(car,{y:OVERPASS.height+3,vy:-5,supportId:null});
 for(let i=0;i<60&&car.supportId===null;i++)step(world,new Map(),.05);
 assert.equal(car.supportId,'overpass');assert.equal(car.y,OVERPASS.height);
 Object.assign(car,{y:0,vy:0,supportId:'ground'});
 const jump=new Map([['p',{...NEUTRAL,jump:1}]]);
 const hover=new Map([['p',{...NEUTRAL,jump:1,hover:true}]]);
 for(let i=0;i<100;i++){
  step(world,i===0?jump:hover,.05);
  assert.ok(car.y+dimensions(car.kind).height<=OVERPASS.height-OVERPASS.thickness+1e-7);
  assert.notEqual(car.supportId,'overpass');
 }
});

test('a car driven over the side clears the deck and falls to ground',()=>{
 const x=(OVERPASS.deckStart+OVERPASS.deckEnd)/2;
 const car=makeEntity('p','roadster',x,OVERPASS.z,'p');
 Object.assign(car,{y:OVERPASS.height,supportId:'overpass',yaw:Math.PI});const world=isolated(car);
 let airborne=false;
 for(let i=0;i<120;i++){step(world,drive,.05);airborne ||= car.supportId===null;if(airborne&&car.supportId==='ground')break;}
 assert.ok(airborne);assert.equal(car.supportId,'ground');assert.ok(car.z>OVERPASS.z+OVERPASS.width/2);
 assert.equal(car.y,terrainHeight(car.x,car.z));
});

test('overpass profile and normals are continuous at the ramp joins',()=>{
 for(const x of [OVERPASS.start,OVERPASS.deckStart,OVERPASS.deckEnd,OVERPASS.end]){
  assert.ok(Math.abs(overpassHeight(x,OVERPASS.z)!-(x===OVERPASS.start||x===OVERPASS.end?0:OVERPASS.height))<1e-9);
 }
 assert.ok(supportNormal('overpass',OVERPASS.start+5,OVERPASS.z)!.x<0);
 assert.ok(supportNormal('overpass',OVERPASS.end-5,OVERPASS.z)!.x>0);
 assert.equal(supportHeight('overpass',OVERPASS.start-1,OVERPASS.z),null);
});


test('a Rocket jumps from the elevated deck and lands back on it',()=>{
 const x=(OVERPASS.deckStart+OVERPASS.deckEnd)/2;
 const car=makeEntity('p','roadster',x,OVERPASS.z,'p');
 Object.assign(car,{y:OVERPASS.height,supportId:'overpass'});const world=isolated(car);
 step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
 assert.equal(car.supportId,null);assert.ok(car.y>OVERPASS.height);
 for(let i=0;i<70&&car.supportId===null;i++)step(world,new Map([['p',{...NEUTRAL,jump:1}]]),.05);
 assert.equal(car.supportId,'overpass');assert.equal(car.y,OVERPASS.height);
});

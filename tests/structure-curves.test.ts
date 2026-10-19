import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { makeEntity, NEUTRAL, step, type Entity, type World } from '../shared/game';
import { STUNT_RAMP, rampHeight } from '../shared/map';
import { DOME } from '../shared/dome';
import { dimensions } from '../shared/physics';
import { createFerry } from '../shared/ferry';
import { createParking } from '../shared/parking';
import { createRace } from '../shared/race';
import { initialSoccer } from '../shared/soccer';

function fixture(kind:Entity['kind']='roadster',x=390,z=192){
  const car=makeEntity('p',kind,x,z,'p');
  const world:World={entities:[car],players:[],pickups:[],time:0,ferry:createFerry(),parking:createParking(),
    races:createRace(),soccer:initialSoccer(),property:null,mars:{fund:0,roomFund:0,launchAt:null}};
  return {world,car};
}
const drive=new Map([['p',{...NEUTRAL,throttle:1}]]);

for(const airborne of [false,true])for(const side of [-1,1])test(`legacy ramp blocks its ${side<0?'north':'south'} wall ${airborne?'in flight':'on the ground'}`,()=>{
  const {world,car}=fixture('roadster',390,STUNT_RAMP.z+side*12);
  Object.assign(car,{yaw:side>0?0:Math.PI,speed:30,vz:-side*30,air:0,
    y:airborne?1.5:0,supportId:airborne?null:'ground'});
  for(let i=0;i<30;i++){
    step(world,airborne?new Map():drive,.05);
    assert.ok(side*(car.z-STUNT_RAMP.z)>=STUNT_RAMP.width/2+dimensions(car.kind).length/2-.02,
      `body crossed the visible side at ${car.x},${car.y},${car.z}`);
  }
});

for(const airborne of [false,true])test(`legacy ramp blocks its high end ${airborne?'in flight':'on the ground'}`,()=>{
  const {world,car}=fixture('roadster',STUNT_RAMP.end+10,STUNT_RAMP.z);
  Object.assign(car,{yaw:Math.PI/2,speed:30,vx:-30,air:0,y:airborne?2:0,supportId:airborne?null:'ground'});
  for(let i=0;i<30;i++){
    step(world,airborne?new Map():drive,.05);
    assert.ok(car.x>=STUNT_RAMP.end+dimensions(car.kind).length/2-.02,'body crossed the visible high face');
  }
});

test('legacy ramp still accepts a top landing and an above-wall flyover',()=>{
  const landing=fixture('roadster',390,STUNT_RAMP.z);
  Object.assign(landing.car,{y:6,vy:-8,supportId:null,air:0});
  for(let i=0;i<30&&landing.car.supportId===null;i++)step(landing.world,new Map(),.05);
  assert.equal(landing.car.supportId,'stunt-ramp');
  assert.equal(landing.car.y,rampHeight(landing.car.x,landing.car.z));
  const flyover=fixture('roadster',390,STUNT_RAMP.z+12);
  Object.assign(flyover.car,{y:10,vz:-35,supportId:null,air:0});
  for(let i=0;i<8;i++)step(flyover.world,new Map(),.05);
  assert.ok(flyover.car.z<STUNT_RAMP.z,'clear flight above the side continues');
  assert.ok(flyover.car.y>STUNT_RAMP.height);
});

test('legacy ramp entry and launch remain traversable',()=>{
  const {world,car}=fixture('model-3',STUNT_RAMP.start-10,STUNT_RAMP.z);
  Object.assign(car,{yaw:-Math.PI/2,speed:20});let climbed=false,launched=false;
  for(let i=0;i<80;i++){
    step(world,drive,.05);
    climbed ||= car.supportId==='stunt-ramp'&&car.y>1;
    if(car.x>STUNT_RAMP.end&&car.y>STUNT_RAMP.height){launched=true;break;}
  }
  assert.ok(climbed&&launched);
});

test('vehicle separation cannot push a car through a legacy ramp side',()=>{
  const {world,car}=fixture('roadster',390,STUNT_RAMP.z+8.3);
  const other=makeEntity('other','tesla-semi',390,car.z+2);
  world.entities.push(other);step(world,new Map(),.05);
  assert.ok(car.z>=STUNT_RAMP.z+STUNT_RAMP.width/2+dimensions(car.kind).length/2-.02);
});

// Construct the same rotation order as src/scene.ts independently of the
// collision helper, then test all eight corners of the physical vehicle box.
function renderedBoxCorners(car:Entity){
  const size=dimensions(car.kind),rotation=new T.Quaternion().setFromEuler(new T.Euler(car.pitch,car.yaw,car.roll,'YXZ'));
  return [-1,1].flatMap(x=>[0,1].flatMap(y=>[-1,1].map(z=>
    new T.Vector3(x*size.width/2,y*size.height,z*size.length/2).applyQuaternion(rotation).add(new T.Vector3(car.x,car.y,car.z)))));
}
function assertAirBodyInside(car:Entity){
  for(const p of renderedBoxCorners(car)){
    assert.ok(Math.abs(p.x-DOME.x)<=DOME.halfLength+1e-6,'body protruded through an end cap');
    const outsideFlat=Math.max(0,Math.abs(p.z-DOME.z)-DOME.flatHalfWidth);
    assert.ok(Math.hypot(outsideFlat,p.y-DOME.radius)<=DOME.radius+1e-6,
      `body protruded through the shell at ${p.y},${p.z}`);
  }
}

for(const [pitch,roll] of [[0,0],[.45,.8],[0,Math.PI/2],[.8,Math.PI]])test(`Dome ceiling contains an airborne stock car at pitch ${pitch}, roll ${roll}`,()=>{
  const {world,car}=fixture('model-3',DOME.x,DOME.z);
  Object.assign(car,{y:45,vy:20,yaw:.6,pitch,roll,inDome:true,supportId:null});let rebounded=false;
  for(let i=0;i<15;i++){
    step(world,new Map(),.05);assert.equal(car.supportId,null);assertAirBodyInside(car);
    rebounded ||= car.vy<0;
  }
  assert.ok(rebounded,'stock car bounced instead of attaching');
});

for(const side of [-1,1])test(`Dome curved ${side<0?'north':'south'} wall contains the airborne vehicle body`,()=>{
  const {world,car}=fixture('model-3',DOME.x,DOME.z+side*40);
  Object.assign(car,{y:24,vz:side*25,yaw:.3,pitch:.2,roll:.4,inDome:true,supportId:null});
  for(let i=0;i<12;i++){step(world,new Map(),.05);assert.equal(car.supportId,null);assertAirBodyInside(car);}
  assert.ok(car.vz*side<0,'stock car bounced inward');
});

test('airborne Rocket catches the ceiling when its body reaches it, before its pivot crosses',()=>{
  const {world,car}=fixture('roadster',DOME.x,DOME.z);
  Object.assign(car,{y:47,vy:10,inDome:true,supportId:null,air:0});let attached=false;
  for(let i=0;i<6;i++){
    step(world,new Map(),.05);
    if(car.supportId==='dome'){attached=true;assert.equal(car.y,2*DOME.radius);break;}
    assertAirBodyInside(car);
  }
  assert.ok(attached);assert.equal(car.air,0,'adhesion does not consume air');
});

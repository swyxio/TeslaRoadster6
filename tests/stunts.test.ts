import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeEntity,NEUTRAL,step,travelDome,THRUSTER_REAR,THRUSTER_DOWN_LEFT,THRUSTER_DOWN_RIGHT,THRUSTER_SIDE_RIGHT,type Input,type World} from '../shared/game';
import {STUNT_LOOP,STUNT_RAMP,rampHeight} from '../shared/map';
import {initialDelivery} from '../shared/delivery';
import {initialAchievements} from '../shared/achievements';
import {createFerry} from '../shared/ferry';
import {createParking} from '../shared/parking';
import {createRace} from '../shared/race';
import {initialSoccer} from '../shared/soccer';

function playground(x=0,z=0){
  const car=makeEntity('car','roadster',x,z,'driver');
  const world:World={entities:[car],players:[{id:'driver',name:'Driver',entityId:car.id,delivery:initialDelivery({x,z}),achievements:initialAchievements(),cockpit:{active:false,activeSeconds:0,deliveries:0,orderEligible:true,orderSeconds:0}}],pickups:[],time:0,ferry:createFerry(),parking:createParking(),races:createRace(),soccer:initialSoccer()};
  const send=(input:Input=NEUTRAL)=>step(world,new Map([['driver',input]]),.05);
  return {car,world,send};
}
test('island exploration pauses cockpit delivery eligibility while active cockpit time continues',()=>{
  const {car,world,send}=playground(0,-1300),player=world.players[0];
  send({...NEUTRAL,throttle:1});
  assert.equal(player.delivery.order.elapsed,0);
  assert.equal(player.cockpit.orderEligible,true);
  send({...NEUTRAL,throttle:1,cockpit:true});
  assert.ok(player.cockpit.activeSeconds>0);
  assert.equal(player.cockpit.orderSeconds,0);
  Object.assign(car,{x:0,y:0,z:0,speed:0,supportId:'ground'});
  send({...NEUTRAL,throttle:1});
  assert.equal(player.cockpit.orderEligible,false);
});
test('arena play pauses first-person delivery eligibility while cockpit play time still counts',()=>{
  const {world,send}=playground();
  send({...NEUTRAL,steer:1,cockpit:true});
  const cockpit=world.players[0].cockpit,active=cockpit.activeSeconds,order=cockpit.orderSeconds;
  assert.ok(travelDome(world,'driver'));
  send({...NEUTRAL,steer:1,cockpit:true});send({...NEUTRAL,steer:1,cockpit:false});
  assert.ok(cockpit.activeSeconds>active);assert.equal(cockpit.orderSeconds,order);assert.equal(cockpit.orderEligible,true);
  assert.ok(travelDome(world,'driver'));send({...NEUTRAL,steer:1,cockpit:true});
  assert.ok(cockpit.orderSeconds>order);assert.equal(cockpit.orderEligible,true);
});
test('thruster signals track actual boosts, jumps, flips and depleted air',()=>{
  const {car,send}=playground();
  send({...NEUTRAL,throttle:1,boost:true});assert.equal(car.thrusters,THRUSTER_REAR);
  send();assert.equal(car.thrusters,0);
  send({...NEUTRAL,jump:1});assert.equal(car.thrusters,THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT);
  for(let i=0;i<6;i++)send({...NEUTRAL,jump:1});assert.equal(car.thrusters,0);
  send({...NEUTRAL,jump:1,flip:1});assert.ok(car.thrusters&THRUSTER_SIDE_RIGHT);
  for(let i=0;i<18;i++)send({...NEUTRAL,jump:1,flip:1});
  car.air=0;send({...NEUTRAL,jump:1,flip:1,boost:true,hover:true,roll:1});assert.equal(car.thrusters,0);
});
test('a jump starts the delivery activity clock without keeping it active indefinitely',()=>{
  const {world,send}=playground();
  send({...NEUTRAL,jump:1});
  assert.equal(world.players[0].delivery.activeSeconds,.05);
  for(let i=0;i<80;i++)send({...NEUTRAL,jump:1});
  assert.ok(world.players[0].delivery.activeSeconds<3.2);
});
test('jump reaches the proposed height and duration and the starter tank lasts twice as long',()=>{
  const {car,send}=playground();let jump=0,flip=0;
  for(let sequence=0;sequence<3;sequence++){
    jump++;send({...NEUTRAL,jump,flip});flip++;send({...NEUTRAL,jump,flip});
    let peak=car.y,steps=2;
    while(car.y>0&&steps<100){send({...NEUTRAL,jump,flip});peak=Math.max(peak,car.y);steps++;}
    assert.ok(peak>5.5&&peak<6.2,`peak ${peak}`);assert.ok(steps*.05>2.1&&steps*.05<2.35,`duration ${steps*.05}`);
    assert.equal(car.stunts,sequence+1);assert.equal(car.pitch,0);assert.equal(car.roll,0);
  }
  assert.equal(car.air,68.5);
});
test('two deliberate flips fit in one jump and airborne steering banks',()=>{
  const {car,send}=playground();send({...NEUTRAL,jump:1});send({...NEUTRAL,jump:1,flip:1});
  for(let i=0;i<16;i++)send({...NEUTRAL,jump:1,flip:1});
  assert.equal(car.stunts,1);send({...NEUTRAL,jump:1,flip:2});
  for(let i=0;i<16;i++)send({...NEUTRAL,jump:1,flip:2});
  assert.equal(car.stunts,2);assert.ok(car.y>0);assert.equal(car.air,85);
  for(let i=0;i<4;i++)send({...NEUTRAL,jump:1,flip:2,steer:1});assert.ok(Math.sin(car.roll)>.05);assert.ok(car.yawRate>0);
});
test('empty tank disables thrust, jumps and flips while driving and gravity still work',()=>{
  const {car,send}=playground();car.air=0;
  send({...NEUTRAL,throttle:1,boost:true,jump:1,flip:1});
  assert.equal(car.y,0);assert.equal(car.air,0);assert.ok(car.speed>0);assert.equal(car.stunts,0);
  car.y=10;car.vy=0;car.supportId=null;const before=car.y;
  send({...NEUTRAL,boost:true,jump:2,flip:2});assert.ok(car.y<before);assert.equal(car.air,0);
});
test('fictional inverted hover uses tank thrust, then gravity resumes',()=>{
  const {car,send}=playground();car.y=10;car.supportId=null;car.roll=Math.PI;
  for(let i=0;i<20;i++)send({...NEUTRAL,hover:true});
  assert.ok(Math.abs(car.y-10)<.01);assert.ok(Math.abs(car.roll-Math.PI)<.01);assert.ok(car.air<92);
  send();assert.ok(car.y<10);
});
test('forward and reverse thrust work while airborne, including while hovering',()=>{
  const {car,send}=playground();car.y=20;car.supportId=null;
  for(let i=0;i<20;i++)send({...NEUTRAL,throttle:1,hover:true});
  assert.ok(car.z < -5,`forward distance ${car.z}`);assert.ok(car.vz < -10,`forward speed ${car.vz}`);
  assert.ok(Math.abs(car.y-20)<.01);assert.ok(car.thrusters&THRUSTER_REAR);assert.ok(Math.abs(car.pitch)<.01);
  car.vz=0;const z=car.z;for(let i=0;i<10;i++)send({...NEUTRAL,throttle:-1,hover:true});
  assert.ok(car.z>z);car.air=0;car.vz=0;send({...NEUTRAL,throttle:1,hover:true});assert.equal(car.vz,0);assert.ok(car.vy<0);
});
test('Rocket reaches 60 mph near the requested arcade times',()=>{
  for(const [boost,target] of [[false,1.6],[true,.59]] as const){
    const {car,send}=playground();let previous=0,elapsed=0;
    while(car.speed<26.8224&&elapsed<3){previous=car.speed;send({...NEUTRAL,throttle:1,boost});elapsed+=.05;}
    const crossing=elapsed-.05+(26.8224-previous)/(car.speed-previous)*.05;
    assert.ok(Math.abs(crossing-target)<.025,`${boost?'boost':'normal'} ${crossing}`);
  }
});
test('the visible ramp supports cars and launches their world velocity',()=>{
  const {car,send}=playground(STUNT_RAMP.start-2,STUNT_RAMP.z);car.yaw=-Math.PI/2;car.speed=18;
  let climbed=false,launched=false;
  for(let i=0;i<60;i++){
    send({...NEUTRAL,throttle:1});
    const height=rampHeight(car.x,car.z);
    if(height!==null&&height>1){climbed=true;assert.ok(Math.abs(car.y-height)<.01);assert.equal(car.supportId,'stunt-ramp');}
    if(car.x>STUNT_RAMP.end&&car.y>STUNT_RAMP.height){launched=true;assert.ok(car.vy>0);break;}
  }
  assert.ok(climbed);assert.ok(launched);
});
test('loop has a real attached ceiling, fans do not consume tank air, and jump detaches',()=>{
  const {car,send}=playground(STUNT_LOOP.x-3,STUNT_LOOP.z);car.yaw=-Math.PI/2;car.speed=18;car.air=0;
  let reachedCeiling=false,finished=false;
  for(let i=0;i<150;i++){
    send({...NEUTRAL,throttle:1});
    if(car.loopAngle!==null&&car.y>STUNT_LOOP.radius*1.8){assert.equal(car.supportId,'stunt-loop');reachedCeiling=true;assert.ok(Math.cos(car.pitch)<-.5);}
    if(reachedCeiling&&car.loopAngle===null){finished=true;break;}
  }
  assert.ok(reachedCeiling);assert.ok(finished);assert.equal(car.air,0);
  car.x=STUNT_LOOP.x-3;car.z=STUNT_LOOP.z;car.y=0;car.vy=0;car.supportId='ground';car.yaw=-Math.PI/2;car.speed=18;car.air=100;
  for(let i=0;i<30&&car.loopAngle===null;i++)send({...NEUTRAL,throttle:1});
  assert.notEqual(car.loopAngle,null);send({...NEUTRAL,jump:1});assert.equal(car.loopAngle,null);assert.ok(car.vy>0);
});


test('jump and flip edges fire once when a fast tick uses substeps',()=>{
  const {car,send}=playground();car.speed=60;
  send({...NEUTRAL,jump:1,flip:1});
  assert.equal(car.supportId,null);assert.equal(car.air,89.5);
  assert.equal(car.lastJump,1);assert.equal(car.lastFlip,1);
  send({...NEUTRAL,jump:1,flip:1});assert.equal(car.air,89.5);
});

test('low air gives a proportional jump and hover works with the remainder',()=>{
  const {car,send}=playground();car.air=9;send({...NEUTRAL,jump:1});
  assert.equal(car.supportId,null);assert.ok(car.y>0);assert.equal(car.air,3);
  const air=car.air;send({...NEUTRAL,jump:1,hover:true,throttle:1});assert.ok(car.air<air);assert.ok(car.vz<0);
  Object.assign(car,{x:0,z:0,y:0,vy:0,supportId:'ground',air:3});send({...NEUTRAL,jump:2});
  assert.equal(car.air,0);assert.ok(car.y>0);assert.ok(car.vy>0&&car.vy<6);
  Object.assign(car,{x:0,z:0,y:0,vy:0,supportId:'ground',air:0});send({...NEUTRAL,jump:3});
  assert.equal(car.supportId,'ground');assert.equal(car.y,0);
});

test('tank upgrades do not change jump power and air jumps do not stack upward velocity',()=>{
 const peaks:number[]=[];
 for(const level of [1,2] as const){
  const {car,send}=playground();car.tankLevel=level;send({...NEUTRAL,jump:1});const first=car.vy;
  send({...NEUTRAL,jump:2});assert.ok(car.vy<=first+.1,'second jump cannot add another full impulse');
  let peak=car.y;for(let i=0;i<45;i++){send({...NEUTRAL,jump:2});peak=Math.max(peak,car.y);}peaks.push(peak);
 }
 assert.ok(Math.abs(peaks[0]-peaks[1])<1e-8);
});
test('powered flight corrects opposing and sideways momentum without damping unpowered coasting',()=>{
 const {car,send}=playground();Object.assign(car,{y:40,supportId:null,vx:20,vz:20});
 for(let i=0;i<20;i++)send({...NEUTRAL,throttle:1,hover:true});
 assert.ok(car.vz<0,`reversed forward velocity: ${car.vz}`);assert.ok(Math.abs(car.vx)<2,`sideways momentum: ${car.vx}`);
 Object.assign(car,{vx:20,vz:20,air:0});send({...NEUTRAL,throttle:1});assert.equal(car.vx,20);assert.equal(car.vz,20);
});
test('the loop blocks outside approaches and attaches rockets from its interior',()=>{
 for(const inside of [false,true]){
  const {car,send}=playground(STUNT_LOOP.x+(inside?0:14),STUNT_LOOP.z);
  Object.assign(car,{y:STUNT_LOOP.radius,supportId:null,vx:inside?30:-30,vy:0});
  for(let i=0;i<15&&car.loopAngle===null;i++)send();
  if(inside)assert.equal(car.supportId,'stunt-loop');
  else {assert.equal(car.supportId,null);assert.ok(car.x>STUNT_LOOP.x+STUNT_LOOP.radius);assert.ok(car.vx>0);}
 }
});

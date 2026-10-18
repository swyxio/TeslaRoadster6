import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeEntity,NEUTRAL,step,THRUSTER_REAR,THRUSTER_DOWN_LEFT,THRUSTER_DOWN_RIGHT,THRUSTER_SIDE_RIGHT,type Input,type World} from '../shared/game';
import {STUNT_LOOP,STUNT_RAMP,rampHeight} from '../shared/map';
import {initialDelivery} from '../shared/delivery';

function playground(x=0,z=0){
  const car=makeEntity('car','roadster',x,z,'driver');
  const world:World={entities:[car],players:[{id:'driver',name:'Driver',entityId:car.id,delivery:initialDelivery({x,z})}],pickups:[],time:0};
  const send=(input:Input=NEUTRAL)=>step(world,new Map([['driver',input]]),.05);
  return {car,world,send};
}
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
test('jump reaches the proposed height and duration and three flips use 99 air',()=>{
  const {car,send}=playground();let jump=0,flip=0;
  for(let sequence=0;sequence<3;sequence++){
    jump++;send({...NEUTRAL,jump,flip});flip++;send({...NEUTRAL,jump,flip});
    let peak=car.y,steps=2;
    while(car.y>0&&steps<100){send({...NEUTRAL,jump,flip});peak=Math.max(peak,car.y);steps++;}
    assert.ok(peak>5.5&&peak<6.2,`peak ${peak}`);assert.ok(steps*.05>2.1&&steps*.05<2.35,`duration ${steps*.05}`);
    assert.equal(car.stunts,sequence+1);assert.equal(car.pitch,0);assert.equal(car.roll,0);
  }
  assert.equal(car.air,1);
});
test('two deliberate flips fit in one jump and airborne steering banks',()=>{
  const {car,send}=playground();send({...NEUTRAL,jump:1});send({...NEUTRAL,jump:1,flip:1});
  for(let i=0;i<16;i++)send({...NEUTRAL,jump:1,flip:1});
  assert.equal(car.stunts,1);send({...NEUTRAL,jump:1,flip:2});
  for(let i=0;i<16;i++)send({...NEUTRAL,jump:1,flip:2});
  assert.equal(car.stunts,2);assert.ok(car.y>0);assert.equal(car.air,58);
  for(let i=0;i<4;i++)send({...NEUTRAL,jump:1,flip:2,steer:1});assert.ok(Math.sin(car.roll)>.05);assert.ok(car.yawRate>0);
});
test('empty tank disables thrust, jumps and flips while driving and gravity still work',()=>{
  const {car,send}=playground();car.air=0;
  send({...NEUTRAL,throttle:1,boost:true,jump:1,flip:1});
  assert.equal(car.y,0);assert.equal(car.air,0);assert.ok(car.speed>0);assert.equal(car.stunts,0);
  car.y=10;car.vy=0;const before=car.y;
  send({...NEUTRAL,boost:true,jump:2,flip:2});assert.ok(car.y<before);assert.equal(car.air,0);
});
test('fictional inverted hover uses tank thrust, then gravity resumes',()=>{
  const {car,send}=playground();car.y=10;car.roll=Math.PI;
  for(let i=0;i<20;i++)send({...NEUTRAL,hover:true});
  assert.ok(Math.abs(car.y-10)<.01);assert.ok(Math.abs(car.roll-Math.PI)<.01);assert.ok(car.air<83);
  send();assert.ok(car.y<10);
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
    if(height!==null&&height>1){climbed=true;assert.ok(Math.abs(car.y-height)<.01);assert.ok(car.pitch>0);}
    if(car.x>STUNT_RAMP.end&&car.y>STUNT_RAMP.height){launched=true;assert.ok(car.vy>0);break;}
  }
  assert.ok(climbed);assert.ok(launched);
});
test('loop has a real attached ceiling, fans do not consume tank air, and jump detaches',()=>{
  const {car,send}=playground(STUNT_LOOP.x-3,STUNT_LOOP.z);car.yaw=-Math.PI/2;car.speed=18;car.air=0;
  let reachedCeiling=false,finished=false;
  for(let i=0;i<150;i++){
    send({...NEUTRAL,throttle:1});
    if(car.loopAngle!==null&&car.y>STUNT_LOOP.radius*1.8){reachedCeiling=true;assert.ok(Math.cos(car.pitch)<-.5);}
    if(reachedCeiling&&car.loopAngle===null){finished=true;break;}
  }
  assert.ok(reachedCeiling);assert.ok(finished);assert.equal(car.air,0);
  car.x=STUNT_LOOP.x-3;car.z=STUNT_LOOP.z;car.y=0;car.vy=0;car.yaw=-Math.PI/2;car.speed=18;car.air=100;
  for(let i=0;i<30&&car.loopAngle===null;i++)send({...NEUTRAL,throttle:1});
  assert.notEqual(car.loopAngle,null);send({...NEUTRAL,jump:1});assert.equal(car.loopAngle,null);assert.ok(car.vy>0);
});

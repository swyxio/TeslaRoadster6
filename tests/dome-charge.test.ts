import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, step, travelDome } from '../shared/game';
import { DOME, DOME_CHARGE_HEIGHT, DOME_CHARGE_RATE, chargingDomeWall } from '../shared/dome';
import { DOME_PERIMETER, domeSurface } from '../shared/map';
import { airCost, type TankLevel } from '../shared/air-tank';
import { hasRocket } from '../shared/rocket';
import { hasRockets } from '../shared/upgrades';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver');
  const car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];assert.ok(travelDome(world,'p'));car.air=25;
  return {world,car};
}
function placeWall(car:ReturnType<typeof setup>['car'],side:number,height:number){
  const angle=Math.acos(1-height/DOME.radius);
  const s=side>0?2*DOME.flatHalfWidth+DOME.radius*angle:DOME_PERIMETER-DOME.radius*angle;
  const surface=domeSurface(s);
  Object.assign(car,{inDome:true,supportId:'dome',domeS:s,y:surface.y,z:surface.z,x:DOME.x-30,yaw:-Math.PI/2,speed:12});
}

test('driving up either actual wall refills air in the shared simulation',()=>{
  for(const yaw of [0,Math.PI]){
    const {world,car}=setup();car.yaw=yaw;car.speed=30;
    let reached=false;
    for(let i=0;i<80;i++){
      step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
      if(car.y>=DOME_CHARGE_HEIGHT&&car.air>25){reached=true;break;}
    }
    assert.ok(reached,`wall reached and charged for heading ${yaw}`);
  }
});

test('wall charge requires a moving, attached Rocket above the marked height',()=>{
  for(const side of [-1,1]){
    const {world,car}=setup();placeWall(car,side,12);
    const before=car.air;step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.ok(car.air>before && car.air<=before+DOME_CHARGE_RATE*.05+1e-8);
    car.speed=0;assert.equal(chargingDomeWall(car,hasRockets(car)),false);
    car.speed=12;car.supportId=null;assert.equal(chargingDomeWall(car,hasRockets(car)),false);
    car.supportId='dome';car.inDome=false;assert.equal(chargingDomeWall(car,hasRockets(car)),false);
    car.inDome=true;placeWall(car,side,4);assert.equal(chargingDomeWall(car,hasRockets(car)),false);
    placeWall(car,side,12);car.kind='model-3';assert.equal(chargingDomeWall(car,hasRockets(car)),false);
    car.upgrades.rocket=true;assert.equal(chargingDomeWall(car,hasRockets(car)),true);
    world.time+=120;assert.equal(chargingDomeWall(car,hasRockets(car)),true,'a purchased kit does not expire');
  }
});

test('a temporary Rocket pickup charges on either wall until expiry',()=>{
  for(const side of [-1,1]){
    const {world,car}=setup();car.kind='model-3';car.rocketUntil=world.time+.15;placeWall(car,side,12);
    assert.equal(chargingDomeWall(car,hasRocket(car,world.time)),true);
    const before=car.air;step(world,new Map([['p',NEUTRAL]]),.05);
    assert.equal(car.supportId,'dome');assert.ok(car.air>before,'an active pickup refills air');
    world.time=car.rocketUntil-.01;const charged=car.air;
    step(world,new Map([['p',NEUTRAL]]),.02);
    assert.equal(hasRocket(car,world.time),false);
    assert.equal(car.supportId,null,'the car releases from the wall at expiry');
    assert.equal(chargingDomeWall(car,hasRocket(car,world.time)),false);
    assert.equal(car.air,charged,'the expired pickup does not refill air');
  }
});

test('ceiling driving charges even during boost and never exceeds a full tank',()=>{
  const {world,car}=setup(),s=3*DOME.flatHalfWidth+Math.PI*DOME.radius,surface=domeSurface(s);
  Object.assign(car,{supportId:'dome',domeS:s,y:surface.y,z:surface.z,yaw:-Math.PI/2,speed:20,air:50});
  step(world,new Map([['p',{...NEUTRAL,throttle:1,boost:true}]]),.05);
  assert.ok(car.air>50,'charge outpaces the boost spent while moving');
  car.air=99.9;step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
  assert.equal(car.air,100);
});

test('wall recharge fills the installed tank by percentage at every level',()=>{
  for(const level of [1,2,3,4,5] as TankLevel[]){
    const {world,car}=setup();placeWall(car,1,12);car.tankLevel=level;car.air=50;
    step(world,new Map([['p',{...NEUTRAL,throttle:1,boost:true}]]),.05);
    const expected=50+(DOME_CHARGE_RATE-airCost(14,level))*.05;
    assert.ok(Math.abs(car.air-expected)<1e-8,`level ${level} recharge and boost consumption`);
    car.air=99.9;step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.equal(car.air,100,`level ${level} is capped at 100%`);
  }
});

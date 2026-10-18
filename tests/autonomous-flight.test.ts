import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, setDestination, step, type Entity, type World } from '../shared/game';
import { initialAutonomousFlight, autonomousFlight, type AutonomousFlightState } from '../shared/autonomous-flight';
import { currentAt } from '../shared/sky-currents';
import { LEVELS, requiredLevelAt } from '../shared/delivery';
import type { DriveMode } from '../shared/drive-mode';

function fixture(x:number,z:number,yaw:number,target:{x:number;z:number},level:0|1=0){
  const world=createWorld(),player=addPlayer(world,'pilot','Pilot'),car=world.entities.find(e=>e.id===player.entityId)!;
  player.delivery.level=level;player.delivery.cash=LEVELS[level].cash+2500;
  Object.assign(car,{x,z,y:0,yaw,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
  world.entities=[car];world.pickups=[];
  const nav={destination:target,path:[target],index:0,status:'driving' as const};car.navigation=nav;
  return {world,player,car,nav};
}

// Drive the actual shared physics with the controller's pulses; held jump input
// counters remain independent of the controller's internal state.
function flight(world:World,car:Entity,nav:NonNullable<Entity['navigation']>,mode:DriveMode,level:0|1=0){
  const state:AutonomousFlightState=initialAutonomousFlight();let counter=0,jumps=0,airborne=false,peak=0,wind:string|null=null;
  for(let i=0;i<300;i++){
    car.navigation=nav;
    const throttle=Math.max(-1,Math.min(1,(8-car.speed)*.1));
    const result=autonomousFlight(car,world,level,mode,{...NEUTRAL,throttle},state);
    if(result.jump){jumps++;counter++;}
    step(world,new Map([['pilot',{...result.input,jump:counter}]]),.05);
    peak=Math.max(peak,car.y);if(car.supportId===null)airborne=true;
    wind=currentAt(car)?.id??wind;
    if(airborne&&car.supportId!==null)return {state,jumps,peak,wind,landed:true};
  }
  return {state,jumps,peak,wind,landed:false};
}

test('jump mode gets a Rocket over a single stopped car and lands without damage',()=>{
  const {world,car,nav}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
  const leader=makeEntity('leader','model-3',-285,0);world.entities.push(leader);
  const result=flight(world,car,nav,'jump');
  assert.equal(result.jumps,1);assert.ok(result.peak>4);assert.equal(result.landed,true);
  assert.ok(car.x>leader.x+4,'the car clears the leader before touching down');
  assert.equal(leader.x,-285,'the leader was not pushed');assert.equal(car.health,100);
});

test('sky mode uses two physical jumps and lands softly on a clear route',()=>{
  const {world,car,nav}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
  const result=flight(world,car,nav,'sky');
  assert.equal(result.jumps,2);assert.ok(result.peak>10);assert.equal(result.landed,true);
  assert.equal(car.health,100);assert.ok(car.air<100);assert.ok(car.x> -270);
});

test('sky mode can use the aligned thermal and leave it to land',()=>{
  const {world,car,nav}=fixture(0,-118,Math.PI,{x:0,z:30});
  const result=flight(world,car,nav,'sky');
  assert.equal(result.state.current,'pyramid');assert.equal(result.wind,'pyramid');
  assert.ok(result.peak>9);assert.equal(result.landed,true);assert.ok(car.z> -82);assert.equal(car.health,100);
});

test('sky mode catches a low jet only when the downstream exit is reachable',()=>{
  const {world,player,car,nav}=fixture(270,60,-Math.PI/2,{x:450,z:60},1);
  const result=flight(world,car,nav,'sky',1);
  assert.equal(result.state.current,'market');assert.equal(result.wind,'market');assert.equal(result.landed,true);
  assert.ok(car.x>300);assert.equal(car.health,100);assert.ok(requiredLevelAt(car.x,car.z)<=player.delivery.level);
  const far=fixture(-280,60,-Math.PI/2,{x:-30,z:60});
  const denied=autonomousFlight(far.car,far.world,0,'sky',NEUTRAL,initialAutonomousFlight());
  assert.equal(denied.jump,false,'do not fly into a current that would hold the car before its stop');
});

test('flight tiers fall back when unequipped, short of air, blocked, or crossing a gate',()=>{
  const {world,car}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
  const attempt=(mode:DriveMode)=>autonomousFlight(car,world,0,mode,NEUTRAL,initialAutonomousFlight());
  assert.equal(attempt('road').jump,false);
  car.kind='model-3';assert.equal(attempt('sky').jump,false);
  car.kind='roadster';car.air=0;assert.equal(attempt('sky').jump,false);
  car.air=100;assert.equal(attempt('jump').jump,false,'do not jump without a stopped leader');
  const blocked=fixture(-120,-90,-Math.PI/2,{x:60,z:-90});
  assert.equal(autonomousFlight(blocked.car,blocked.world,0,'sky',NEUTRAL,initialAutonomousFlight()).jump,false,'buildings block the corridor');
  const gate=fixture(-180,280,Math.PI,{x:-180,z:430});
  assert.equal(autonomousFlight(gate.car,gate.world,0,'sky',NEUTRAL,initialAutonomousFlight()).jump,false,'the planned corridor enters a locked region');
});

test('two nearby obstacles do not trigger a jump into a crowded landing area',()=>{
  const {world,car}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
  world.entities.push(makeEntity('leader','model-3',-288,0),makeEntity('second','model-3',-275,0));
  assert.equal(autonomousFlight(car,world,0,'jump',NEUTRAL,initialAutonomousFlight()).jump,false);
});

test('empty-air flight coasts and descends without another pulse or hover',()=>{
  const {world,car}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
  Object.assign(car,{y:20,supportId:null,air:0,vy:0,vx:3});
  const state=initialAutonomousFlight();Object.assign(state,{phase:'air',target:{x:-250,z:0},started:0});
  for(let i=0;i<80&&car.supportId===null;i++){
    const control=autonomousFlight(car,world,0,'sky',NEUTRAL,state);
    assert.equal(control.jump,false);assert.equal(control.input.hover,false);assert.equal(control.input.throttle,0);
    step(world,new Map([['pilot',control.input]]),.05);
  }
  assert.equal(car.supportId,'ground');assert.ok(car.x> -300);
});

test('flight decisions are deterministic for the same route and physics',()=>{
  const a=fixture(0,-118,Math.PI,{x:0,z:30}),b=fixture(0,-118,Math.PI,{x:0,z:30});
  assert.deepEqual(flight(a.world,a.car,a.nav,'sky'),flight(b.world,b.car,b.nav,'sky'));
  assert.deepEqual(a.car,b.car);
});


test('authoritative jump mode clears stopped traffic and follows its real route to the destination',()=>{
  const {world,car}=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
  car.upgrades.autonomyJump=true;
  const leader=makeEntity('leader','model-3',-227,-177);world.entities.push(leader);
  assert.equal(setDestination(world,'pilot',{x:-60,z:-177},'jump'),true);
  let airborne=false,landed=false;
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(car.supportId===null)airborne=true;else if(airborne)landed=true;
  }
  assert.equal(airborne,true);assert.equal(landed,true);
  assert.equal(car.navigation?.status,'arrived');assert.ok(Math.hypot(car.x+60,car.z+177)<4);
  assert.equal(car.health,100);assert.equal(leader.x,-227);
  assert.equal(car.lastJump,0,'autonomous pulses never mutate the manual counter');
});

test('authoritative sky mode rides a thermal, lands and continues to its destination',()=>{
  const {world,car}=fixture(3,-118,Math.PI,{x:3,z:60});
  car.upgrades.autonomyJump=true;car.upgrades.autonomySky=true;
  assert.equal(setDestination(world,'pilot',{x:3,z:60},'sky'),true);
  let airborne=false,landed=false,thermal=false,peak=0;
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(car.supportId===null)airborne=true;else if(airborne)landed=true;
    if(currentAt(car)?.id==='pyramid')thermal=true;peak=Math.max(peak,car.y);
  }
  assert.equal(airborne,true);assert.equal(landed,true);assert.equal(thermal,true);assert.ok(peak>9);
  assert.equal(car.navigation?.status,'arrived');assert.ok(Math.hypot(car.x-3,car.z-60)<8);
  assert.equal(car.health,100);assert.equal(car.lastJump,0);
});

test('manual steering immediately takes over during autonomous flight',()=>{
  const {world,car}=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
  car.upgrades.autonomyJump=true;car.upgrades.autonomySky=true;
  assert.equal(setDestination(world,'pilot',{x:-60,z:-177},'sky'),true);
  for(let i=0;i<200&&car.supportId!==null;i++)step(world,new Map(),.05);
  assert.equal(car.supportId,null);assert.equal(car.autopilot,true);
  step(world,new Map([['pilot',{...NEUTRAL,steer:1}]]),.05);
  assert.equal(car.autopilot,false);assert.equal(car.navigation,null);assert.equal(car.lastJump,0);
});

test('authoritative sky mode falls back to the road when the tank is empty',()=>{
  const {world,car}=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
  car.upgrades.autonomyJump=true;car.upgrades.autonomySky=true;car.air=0;
  assert.equal(setDestination(world,'pilot',{x:-60,z:-177},'sky'),true);
  let airborne=false;
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);if(car.supportId===null)airborne=true;
  }
  assert.equal(airborne,false);assert.equal(car.navigation?.status,'arrived');
  assert.ok(Math.hypot(car.x+60,car.z+177)<4);assert.equal(car.health,100);
});

test('both flight modes leave emergency braking in control when a large vehicle is too close to jump',()=>{
  for(const mode of ['jump','sky'] as const){
    const fast=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
    Object.assign(fast.car,{kind:'tesla-semi',speed:12,vx:12});
    fast.car.upgrades.rocket=true;
    const fastLeader=makeEntity('fast-leader','robovan',-232,-177);fastLeader.yaw=-Math.PI/2;fast.world.entities.push(fastLeader);
    const braking={...NEUTRAL,brake:true};
    const decision=autonomousFlight(fast.car,fast.world,0,mode,braking,initialAutonomousFlight());
    assert.equal(decision.jump,false,`${mode} must not launch at speed without enough clearance`);
    assert.deepEqual(decision.input,braking,`${mode} must preserve the road controller's emergency braking`);

    const {world,car}=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
    Object.assign(car,{kind:'tesla-semi',speed:4.5,vx:4.5});
    Object.assign(car.upgrades,{rocket:true,autonomyJump:true,autonomySky:true});
    const leader=makeEntity('leader','robovan',-232,-177);leader.yaw=-Math.PI/2;world.entities.push(leader);
    assert.equal(setDestination(world,'pilot',{x:-60,z:-177},mode),true);
    for(let i=0;i<40;i++){
      step(world,new Map(),.05);
      assert.equal(car.supportId,'ground',`${mode} must not launch into the leader`);
    }
    assert.equal(car.health,100);assert.equal(leader.x,-232);
    assert.ok(Math.abs(car.speed)<.1,`${mode} must brake to a stop`);
  }
});

test('a heavy Level 1 vehicle can launch either autonomous flight mode with a full tank',()=>{
  for(const mode of ['jump','sky'] as const)for(const economy of [false,true]){
    const {world,car,nav}=fixture(-300,0,-Math.PI/2,{x:-80,z:0});
    Object.assign(car,{kind:'tesla-semi',speed:8,vx:8,tankLevel:1,air:100});
    Object.assign(car.upgrades,{rocket:true,autonomyJump:true,autonomySky:true,economy});
    if(mode==='jump'){
      const leader=makeEntity('leader','model-3',-287,0);leader.yaw=-Math.PI/2;world.entities.push(leader);
    }
    const reserve=economy?81:90;
    car.air=reserve-.01;
    assert.equal(autonomousFlight(car,world,0,mode,NEUTRAL,initialAutonomousFlight()).jump,false,`${mode} waits for its reserve`);
    car.air=reserve;
    assert.equal(autonomousFlight(car,world,0,mode,NEUTRAL,initialAutonomousFlight()).jump,true,`${mode} can launch once its reserve is available`);
    car.air=100;
    const result=flight(world,car,nav,mode);
    assert.ok(result.jumps>=1,`${mode} starts shared physics`);
    assert.equal(result.landed,true,`${mode} lands after the flight`);
    assert.equal(car.health,100,`${mode} completes the sampled flight without damage`);
  }
});

test('both flight modes reject a heavy jump that cannot clear the leader on descent',()=>{
  for(const mode of ['jump','sky'] as const){
    const {world,car}=fixture(-240,-177,-Math.PI/2,{x:-60,z:-177});
    car.kind='tesla-semi';car.tankLevel=2;
    Object.assign(car.upgrades,{rocket:true,autonomyJump:true,autonomySky:true});
    const leader=makeEntity('leader','robovan',-227,-177);leader.yaw=-Math.PI/2;world.entities.push(leader);
    assert.equal(setDestination(world,'pilot',{x:-60,z:-177},mode),true);
    for(let i=0;i<40;i++){
      step(world,new Map(),.05);
      assert.equal(car.supportId,'ground',`${mode} must not jump into the leader`);
      assert.ok(Math.hypot(car.x-leader.x,car.z-leader.z)>9,`${mode} avoids the leader`);
    }
    assert.equal(car.health,100);assert.equal(leader.x,-227);
  }
});

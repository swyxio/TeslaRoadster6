import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createEmptyWorld, makeEntity, NEUTRAL, setDeliveryDestination, step } from '../shared/game';
import { body, contact } from '../shared/physics';
import { trafficInput } from '../shared/traffic';

function fixture(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  const destination={x:-60,z:-177};
  Object.assign(car,{kind:'model-3',x:-180,z:-177,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground',autopilot:true,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'road',
      recovery:{index:0,distance:120,at:0,attempts:0,reverseUntil:0}}});
  world.entities=[car];world.pickups=[];world.time=13;
  return {world,car};
}

test('a stopped active leader does not cause a reverse after the stall timeout',()=>{
  const {world,car}=fixture();
  const leader=makeEntity('leader','model-3',-172.5,-177,'other');leader.yaw=car.yaw;
  world.entities.push(leader);
  const input=trafficInput(car,world);
  assert.equal(input.throttle,0);
  assert.equal(input.brake,true);
  assert.equal(car.navigation?.recovery?.attempts,0);
});

test('a fast follower behind prevents a new recovery reverse',()=>{
  const {world,car}=fixture();
  const parked=makeEntity('parked','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-220,-177);
  Object.assign(parked,{yaw:car.yaw});Object.assign(rear,{yaw:car.yaw,speed:20,vx:20});
  world.entities.push(parked,rear);
  const input=trafficInput(car,world);
  assert.equal(input.throttle,0);
  assert.equal(input.brake,true);
  assert.equal(car.navigation?.recovery?.attempts,0);
});

for(const kind of ['driver','npc'] as const)test(`road self-driving waits 60 seconds behind queued ${kind} traffic and resumes`,()=>{
  const {world,car}=fixture();
  let leader;
  if(kind==='driver'){
    const player=addPlayer(world,'leader','Leader');leader=world.entities.find(entity=>entity.id===player.entityId)!;
  }else{
    leader=makeEntity('leader','model-3',-172.5,-177);
    Object.assign(leader,{npc:true,autopilot:true,routeId:0,waypoint:1,pauseUntil:1000});
  }
  Object.assign(leader,{kind:'model-3',x:-172.5,z:-177,y:0,yaw:car.yaw,speed:0});
  world.entities=[car,leader];world.time=0;car.navigation!.recovery!.at=0;
  for(let i=0;i<1200;i++){
    step(world,new Map(),.05);
    assert.ok(car.speed>-.1,'a traffic queue never makes the car reverse');
    assert.equal(car.navigation?.status,'driving');
    assert.ok(leader.x-car.x>4.72,'the cars remain separated');
  }
  assert.equal(car.health,100);assert.equal(leader.health,100);
  world.entities=[car];world.players=world.players.filter(player=>player.id!=='leader');
  for(let i=0;i<400&&car.x< -165;i++)step(world,new Map(),.05);
  assert.ok(car.x> -165,'the trip resumes when traffic clears');
});

for(const separation of [7.5,8.72])test(`a leader ${separation} m ahead cancels an active reverse`,()=>{
  const {world,car}=fixture();
  const player=addPlayer(world,'leader','Leader'),leader=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(leader,{kind:'model-3',x:car.x+separation,z:car.z,y:0,yaw:car.yaw,speed:0});
  Object.assign(car,{speed:-1,vx:-1});world.time=20;
  car.navigation!.recovery={index:0,distance:120,at:18,attempts:1,reverseUntil:22};
  world.entities=[car,leader];
  const input=trafficInput(car,world);
  assert.equal(input.brake,true);assert.equal(input.throttle,0);
  assert.equal(car.navigation?.recovery?.reverseUntil,0);
  assert.equal(car.navigation?.recovery?.attempts,0);
  let stopped=false;
  for(let i=0;i<400;i++){
    step(world,new Map(),.05);
    if(car.speed>-.1)stopped=true;
    if(stopped)assert.ok(car.speed>-.1,'the reverse does not restart in a queue');
  }
  assert.ok(stopped);assert.equal(car.health,100);assert.equal(leader.health,100);
});

for(const activeReverse of [false,true])test(`a fast rear car pauses ${activeReverse?'an active':'a pending'} reverse and recovery resumes`,()=>{
  const {world,car}=fixture();
  const follower=addPlayer(world,'following','Following'),rear=world.entities.find(entity=>entity.id===follower.entityId)!;
  Object.assign(rear,{kind:'model-3',x:-220,z:-177,y:0,yaw:car.yaw,speed:20,vx:20,vz:0,supportId:'ground'});
  const parked=makeEntity('parked','model-3',-172.5,-177);parked.yaw=car.yaw;
  Object.assign(car,{speed:activeReverse?-1:0,vx:activeReverse?-1:0});
  car.navigation!.recovery={index:0,distance:120,at:0,attempts:activeReverse?1:0,reverseUntil:activeReverse?17:0};
  world.entities=[car,rear,parked];
  const input=trafficInput(car,world);
  assert.equal(input.brake,true);assert.equal(input.throttle,0);
  let braked=false;
  for(let i=0;i<80;i++){
    if(car.x-rear.x<(activeReverse?14:12))braked=true;
    step(world,new Map([['following',{...NEUTRAL,throttle:braked?0:.22,brake:braked}]]),.05);
  }
  assert.equal(car.health,100);assert.equal(rear.health,100);
  world.entities=[car,parked];world.players=world.players.filter(player=>player.id!=='following');
  let resumed=false;
  for(let i=0;i<20&&car.autopilot;i++){step(world,new Map(),.05);if(car.speed<-.1){resumed=true;break;}}
  assert.ok(resumed,'the reverse resumes after the follower leaves');
});

for(const sample of [{name:'adjacent lane',z:-185,speed:20},{name:'moving away',z:-177,speed:-20}])
  test(`a rear car in the ${sample.name} does not stop recovery`,()=>{
    const {world,car}=fixture();
    const parked=makeEntity('parked','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-220,sample.z);
    Object.assign(parked,{yaw:car.yaw});Object.assign(rear,{yaw:car.yaw,speed:sample.speed,vx:sample.speed});
    world.entities.push(parked,rear);
    assert.ok(trafficInput(car,world).throttle<0);
  });

test('rear traffic detection accounts for a reverse collision impulse',()=>{
  const {world,car}=fixture();car.pushX=-10;
  const parked=makeEntity('parked','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-215,-177);
  Object.assign(parked,{yaw:car.yaw});Object.assign(rear,{yaw:car.yaw,speed:10});
  world.entities.push(parked,rear);
  const input=trafficInput(car,world);
  assert.equal(input.brake,true);assert.equal(input.throttle,0);
});

test('stationary obstructions still produce bounded recovery failure',()=>{
  const {world,car}=fixture();
  const front=makeEntity('front','model-3',-172.5,-177),rear=makeEntity('rear','model-3',-192,-177);
  front.yaw=rear.yaw=car.yaw;world.entities.push(front,rear);
  for(let i=0;i<2000&&car.autopilot;i++)step(world,new Map(),.05);
  assert.equal(car.navigation?.status,'failed');
  assert.equal(car.health,100);assert.equal(rear.health,100);
});

test('an equally close parked obstacle is not hidden by active traffic',()=>{
  for(const activeFirst of [true,false]){
    const {world,car}=fixture();
    const active=makeEntity('active','model-3',-172.5,-175.8,'other'),parked=makeEntity('parked','model-3',-172.5,-178.2);
    active.yaw=parked.yaw=car.yaw;world.entities.push(...(activeFirst?[active,parked]:[parked,active]));
    assert.ok(trafficInput(car,world).throttle<0,`activeFirst=${activeFirst}`);
  }
});

test('traffic beyond a wall does not suppress wall recovery',()=>{
  const {world,car}=fixture(),destination={x:-160,z:30};
  Object.assign(car,{x:-223,z:30,yaw:-Math.PI/2,speed:0,
    navigation:{destination,path:[destination],index:0,status:'driving',mode:'road',
      recovery:{index:0,distance:63,at:0,attempts:0,reverseUntil:0}}});
  const leader=makeEntity('leader','model-3',-215.5,30,'other');leader.yaw=car.yaw;world.entities=[car,leader];
  assert.ok(trafficInput(car,world).throttle<0);
});

test('a paused wall recovery restarts its straight clearance before turning',()=>{
  const {world,car}=fixture();world.time=0;
  Object.assign(car,{x:-225,z:40,yaw:0,speed:0,autopilot:false,navigation:null});
  assert.equal(setDeliveryDestination(world,'driver','road'),true);
  assert.equal(car.navigation?.mode,'road');assert.ok(car.navigation?.join);
  car.navigation.recovery={index:car.navigation.index,distance:120,at:world.time,attempts:1,reverseUntil:world.time+4};
  const rear=makeEntity('rear-approach','model-3',car.x,car.z+25);
  for(let i=0;i<80;i++){
    // Restage the moving follower each tick to isolate the interrupted maneuver.
    Object.assign(rear,{x:car.x,z:car.z+25,y:car.y,yaw:car.yaw,speed:10,pushX:0,pushZ:0});
    world.entities=[car,rear];step(world,new Map(),.05);
  }
  assert.ok(car.navigation?.recovery&&world.time-car.navigation.recovery.at<.2,'straight clearance is still available');
  assert.equal(car.health,100);world.entities=[car];
  let resumed=false;
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(i<20&&car.speed<-.1)resumed=true;
  }
  assert.ok(resumed,'the maneuver resumes within a second');
  assert.equal(car.health,100);assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.navigation?.mode,'road');
});

test('an away-facing road join still reverses away from a leader',()=>{
  const {world,car}=fixture();
  Object.assign(car,{x:-225,z:50,yaw:0,speed:0,autopilot:false,navigation:null});
  assert.equal(setDeliveryDestination(world,'driver'),true);
  assert.ok(car.navigation?.join);
  const player=addPlayer(world,'leader','Leader'),leader=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(leader,{kind:'model-3',x:-225,z:42.5,y:0,yaw:0,speed:0});world.entities=[car,leader];
  assert.ok(trafficInput(car,world).throttle<0);
  let reversed=false;
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);reversed ||= car.speed<-.1;
  }
  assert.ok(reversed);assert.equal(car.navigation?.status,'arrived');assert.equal(car.health,100);
});

test('road self-driving waits for a rotated leader for 20 seconds without contact',()=>{
  const {world,car}=fixture();
  const player=addPlayer(world,'leader','Leader'),leader=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(leader,{kind:'model-3',x:-172.5,z:-174.2,y:0,yaw:-Math.PI/4,speed:0});
  world.entities=[car,leader];world.time=0;car.navigation!.recovery!.at=0;
  for(let i=0;i<400;i++){
    step(world,new Map(),.05);
    assert.ok(car.speed>-.1,'the rotated leader does not trigger a reverse');
    assert.equal(car.navigation?.status,'driving');
    assert.equal(contact(body(car),body(leader)),null,'the vehicles stay physically separate');
  }
  assert.equal(car.health,100);assert.equal(leader.health,100);
});

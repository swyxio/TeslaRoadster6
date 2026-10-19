import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetAchievementFlight, updateAchievements } from '../shared/achievements';
import type { AchievementEvidence } from '../shared/achievement-evidence';
import { addPlayer, createEmptyWorld, makeEntity, NEUTRAL, step, type EconomyHooks, type Entity, type Player } from '../shared/game';
import { BUILDINGS, type SupportId } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { joinParking, startQueue } from '../shared/parking';
import { RACE_COURSES } from '../shared/race-courses';

function setup(){
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,player,car};
}
function sample(player:Player,car:Entity,evidence:AchievementEvidence[],x:number,y:number,z:number,supportId:SupportId|null,dt=.05){
  Object.assign(car,{x,y,z,supportId,inDome:false});
  updateAchievements(player,car,false,undefined,false,evidence,false,dt);
}
function roofs(evidence:AchievementEvidence[]){return evidence.filter(item=>item.kind==='roof');}
function hooks(events:{player:string;evidence:AchievementEvidence}[]):EconomyHooks{
  return {update:(_player,apply)=>apply(),pickup:()=>{},achievement:(player,evidence)=>events.push({player:player.id,evidence})};
}

test('one supported roof landing per meaningful airborne departure, not supported frames or surface chatter',()=>{
  const {player,car}=setup(),i=BUILDINGS.findIndex(building=>building.style==='midrise'),building=BUILDINGS[i];
  const evidence:AchievementEvidence[]=[];
  const pose=(y:number,supportId:SupportId|null)=>sample(player,car,evidence,building.x,y,building.z,supportId);
  pose(building.h,`roof:${i}`);
  for(let n=0;n<20;n++)pose(building.h,`roof:${i}`);
  assert.equal(roofs(evidence).length,0,'a fresh supported pose is not a landing');
  for(let n=0;n<12;n++){pose(building.h+.1,null);pose(building.h,`roof:${i}`);}
  assert.equal(roofs(evidence).length,0,'brief support chatter does not rearm');
  for(let landing=1;landing<=2;landing++){
    for(let n=0;n<10;n++)pose(building.h+3,null);
    pose(building.h,`roof:${i}`);
    for(let n=0;n<20;n++)pose(building.h,`roof:${i}`);
    assert.equal(roofs(evidence).length,landing);
  }
  assert.deepEqual(roofs(evidence),[{kind:'roof',roof:'ordinary'},{kind:'roof',roof:'ordinary'}]);
});

test('roof flight state cannot transfer through a reset, teleport or another vehicle',()=>{
  for(const interruption of ['reset','teleport','vehicle','airborne-reconnect'] as const){
    const {player,car}=setup(),i=BUILDINGS.findIndex(building=>building.style==='midrise'),building=BUILDINGS[i],events:AchievementEvidence[]=[];
    const ground=()=>sample(player,car,events,building.x,building.h,building.z,`roof:${i}`);
    if(interruption!=='airborne-reconnect')ground();
    for(let n=0;n<10;n++)sample(player,car,events,building.x,building.h+3,building.z,null);
    if(interruption==='reset')resetAchievementFlight(player);
    if(interruption==='teleport')sample(player,car,events,building.x+40,building.h+3,building.z,null);
    if(interruption==='vehicle'){
      const replacement=makeEntity('replacement',car.kind,building.x,building.z,player.id);
      sample(player,replacement,events,building.x,building.h,building.z,`roof:${i}`);
    }else ground();
    assert.equal(roofs(events).length,0,interruption);
  }
});

test('a real jump and landing on a rooftop produces one room observation',()=>{
  const {world,player,car}=setup(),i=BUILDINGS.findIndex(building=>building.style==='midrise'&&building.district==='sf'),building=BUILDINGS[i];
  const events:{player:string;evidence:AchievementEvidence}[]=[];
  Object.assign(car,{x:building.x,y:building.h,z:building.z,supportId:`roof:${i}`,speed:0,vx:0,vy:0,vz:0});
  step(world,new Map([[player.id,NEUTRAL]]),.05,{economy:hooks(events)});
  for(let n=0;n<100;n++)step(world,new Map([[player.id,{...NEUTRAL,jump:1}]]),.05,{economy:hooks(events)});
  assert.equal(car.supportId,`roof:${i}:1`);
  assert.deepEqual(events.filter(item=>item.evidence.kind==='roof'),[{player:player.id,evidence:{kind:'roof',roof:'ordinary'}}]);
});

test('each uninterrupted Bay crossing emits once and a bridge landing or teleport cancels it',()=>{
  const {player,car}=setup(),events:AchievementEvidence[]=[];
  const ground=(x:number)=>sample(player,car,events,x,0,60,'ground');
  const air=(x:number)=>sample(player,car,events,x,10,60,null);
  ground(50);
  for(let x=55;x<=310;x+=5)air(x);
  ground(310);
  for(let x=305;x>=50;x-=5)air(x);
  ground(50);
  assert.deepEqual(events.filter(item=>item.kind==='crossing'),[
    {kind:'crossing',origin:'sf',destination:'oakland',crossedWater:true},
    {kind:'crossing',origin:'oakland',destination:'sf',crossedWater:true},
  ]);
  for(let x=55;x<=145;x+=5)air(x);
  ground(150);
  for(let x=155;x<=310;x+=5)air(x);
  assert.equal(events.filter(item=>item.kind==='crossing').length,2,'a supported bridge breaks the flight');
  ground(50);
  air(55);air(310);
  assert.equal(events.filter(item=>item.kind==='crossing').length,2,'a teleport is not a crossing');
});

test('Park It and Cut the Queue emit one event on the authoritative successful transition',()=>{
  for(const mode of ['park','queue'] as const){
    const {world,player,car}=setup(),lot=PARKING_LOTS.find(item=>item.id==='sf-playground')!,events:{player:string;evidence:AchievementEvidence}[]=[];
    Object.assign(car,{x:lot.approach.x,y:0,z:lot.approach.z,yaw:0,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    assert.ok(joinParking(world.parking,lot,world,player.id,mode));
    if(mode==='queue')assert.ok(startQueue(world.parking,lot.id,world,player.id));
    const entrant=world.parking.rounds[0].entrants[0];
    const stall=mode==='queue'?lot.stalls[0]:lot.stalls.find(item=>item.id===entrant.targetId)!;
    Object.assign(car,{x:stall.x,y:stall.y,z:stall.z,yaw:stall.yaw,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    for(let n=0;n<60;n++)step(world,new Map([[player.id,NEUTRAL]]),.05,{economy:hooks(events)});
    assert.deepEqual(events.filter(item=>item.evidence.kind==='parking'),[{player:player.id,evidence:{kind:'parking',mode,finished:true}}]);
  }
});

test('simultaneous race finishes emit once with the authoritative deterministic ranks',()=>{
  for(const reverse of [false,true]){
    const {world,player:a,car:aCar}=setup(),z=addPlayer(world,'z','Z'),zCar=world.entities.find(entity=>entity.id===z.entityId)!;
    const course=RACE_COURSES.find(item=>item.id==='short')!,gate=course.gates.at(-1)!;
    const participants=[{player:a,car:aCar,offset:-5},{player:z,car:zCar,offset:5}];
    for(const {car,offset} of participants)Object.assign(car,{x:gate.x+1,y:0,z:gate.z+offset,yaw:gate.yaw,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
    world.entities=reverse?[zCar,aCar]:[aCar,zCar];
    world.races.rounds=[{courseId:course.id,phase:'active',hostId:a.id,openedAt:-4,startedAt:0,endsAt:100,starterCount:2,
      entrants:participants.map(({player,car,offset})=>({playerId:player.id,entityId:car.id,status:'entered',nextGate:course.gates.length-1,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:gate.x-1,y:0,z:gate.z+offset,time:0}}))}];
    const events:{player:string;evidence:AchievementEvidence}[]=[];
    for(let n=0;n<10;n++)step(world,new Map(),.05,{economy:hooks(events)});
    const finishes=events.filter(item=>item.evidence.kind==='race').sort((l,r)=>l.player.localeCompare(r.player));
    assert.deepEqual(finishes,[{player:'driver',evidence:{kind:'race',status:'finished',phase:'results',rank:1,starterCount:2}},
      {player:'z',evidence:{kind:'race',status:'finished',phase:'results',rank:2,starterCount:2}}]);
  }
});

test('a finisher is recorded before another racer completes, and only first place wins',()=>{
  const {world,player:a,car:aCar}=setup(),z=addPlayer(world,'z','Z'),zCar=world.entities.find(entity=>entity.id===z.entityId)!;
  const course=RACE_COURSES.find(item=>item.id==='short')!,gate=course.gates.at(-1)!;
  const participants=[{player:a,car:aCar,offset:-5},{player:z,car:zCar,offset:5}];
  for(const {player,car,offset} of participants)Object.assign(car,{x:gate.x+(player===a?1:-1),y:0,z:gate.z+offset,yaw:gate.yaw,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
  world.entities=[aCar,zCar];
  world.races.rounds=[{courseId:course.id,phase:'active',hostId:a.id,openedAt:-4,startedAt:0,endsAt:100,starterCount:2,
    entrants:participants.map(({player,car,offset})=>({playerId:player.id,entityId:car.id,status:'entered',nextGate:course.gates.length-1,finishedAt:null,elapsed:null,rank:null,feedback:null,feedbackUntil:0,previous:{x:gate.x-1,y:0,z:gate.z+offset,time:0}}))}];
  const events:{player:string;evidence:AchievementEvidence}[]=[];
  step(world,new Map(),.05,{economy:hooks(events)});
  assert.deepEqual(events.filter(item=>item.evidence.kind==='race'),[{player:'driver',evidence:{kind:'race',status:'finished',phase:'active',rank:1,starterCount:2}}]);
  zCar.x=gate.x+1;
  for(let n=0;n<10;n++)step(world,new Map(),.05,{economy:hooks(events)});
  assert.deepEqual(events.filter(item=>item.evidence.kind==='race'),[
    {player:'driver',evidence:{kind:'race',status:'finished',phase:'active',rank:1,starterCount:2}},
    {player:'z',evidence:{kind:'race',status:'finished',phase:'results',rank:2,starterCount:2}},
  ]);
});

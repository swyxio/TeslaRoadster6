import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, makeEntity, NEUTRAL, parkingAction, setDestination, step, travelDome, type World } from '../shared/game';
import { updateFerry } from '../shared/ferry';
import { terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { newPolice, updatePolice } from '../shared/police';
import { hasRocket } from '../shared/rocket';
import { VEHICLE_IDS, VEHICLES } from '../shared/vehicles';
import { parseMessage } from '../worker/protocol';

function drivingWorld(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,player,car};
}
function simulate(world:World,until:()=>boolean,seconds=120){
  for(let i=0;i<seconds*20&&!until();i++)step(world,new Map(),.05);
}

test('every Tesla can follow a chosen connected destination through city turns',()=>{
  for(const kind of VEHICLE_IDS.filter(id=>VEHICLES[id].brand==='Tesla')){
    const {world,car}=drivingWorld();car.kind=kind;
    assert.equal(setDestination(world,'driver',{x:-120,z:-60}),true,kind);
    simulate(world,()=>!car.autopilot);
    assert.equal(car.navigation?.status,'arrived',kind);
    assert.ok(Math.hypot(car.x+120,car.z+60)<12,kind);
    assert.equal(car.health,100,kind);
  }
});

test('invalid, locked and disconnected destinations are rejected; manual input takes over',()=>{
  const {world,player,car}=drivingWorld();
  assert.equal(setDestination(world,'driver',{x:180,z:-300}),false,'water is not a road');
  assert.equal(setDestination(world,'driver',{x:450,z:0}),false,'Oakland is locked at level zero');
  assert.equal(setDestination(world,'driver',{x:0,z:-1400}),false,'the island is disconnected from the road network');
  assert.equal(setDestination(world,'driver',{x:-180,z:60}),true);
  step(world,new Map([['driver',{...NEUTRAL,steer:1}]]),.05);
  assert.equal(car.autopilot,false);assert.equal(car.navigation,null);
  player.delivery.level=1;
  assert.equal(setDestination(world,'driver',{x:NaN,z:0}),false);
});

test('mini-game entry is immediate, safe and preserves the existing game on failure',()=>{
  for(const game of ['park','queue','short','oval'] as const){
    const {world,player,car}=drivingWorld();car.health=72;car.air=41;
    assert.equal(setDestination(world,'driver',{x:-180,z:60}),true);
    assert.equal(enterMinigame(world,'driver',game),true,game);
    assert.equal(car.navigation,null,'entering a game cancels navigation');
    assert.equal(car.health,72);assert.equal(car.air,41);assert.equal(car.supportId,'ground');
    assert.equal(player.delivery.level,0);
    if(game==='park'||game==='queue')assert.ok(world.parking.rounds.some(r=>r.mode===game&&r.entrants.some(e=>e.playerId==='driver')));
    else assert.ok(world.races.rounds.some(r=>r.courseId===game&&r.entrants.some(e=>e.playerId==='driver')));
    const before={x:car.x,z:car.z},other=game==='park'?'queue':game==='queue'?'park':game==='short'?'oval':'short';
    assert.equal(enterMinigame(world,'driver',other),false,'leave the existing round first');
    assert.deepEqual({x:car.x,z:car.z},before);
  }
});

test('mini-game entry from the dome preserves temporary rocket time and resources',()=>{
  for(const game of ['park','queue','short','oval'] as const){
    const {world,car}=drivingWorld();car.kind='model-3';car.rocketUntil=world.time+45;
    car.health=72;car.air=41;
    assert.equal(travelDome(world,'driver'),true);
    assert.equal(car.inDome,true);assert.equal(car.supportId,'dome');
    assert.equal(enterMinigame(world,'driver',game),true,game);
    assert.equal(car.inDome,false);assert.equal(car.supportId,'ground');
    assert.equal(car.rocketUntil,45);assert.equal(hasRocket(car,world.time),true);
    assert.equal(car.health,72);assert.equal(car.air,41);
  }
});

test('both parking games join and finish at every registered local lot',()=>{
  for(const lot of PARKING_LOTS)for(const game of ['park','queue'] as const){
    const {world,player,car}=drivingWorld();player.delivery.level=3;
    const region=game==='park'?lot.area:lot.approach;
    Object.assign(car,{x:region.x,z:region.z,y:terrainHeight(region.x,region.z),yaw:region.yaw,supportId:'ground',speed:0});
    const before={x:car.x,z:car.z};
    assert.equal(enterMinigame(world,'driver',game),true,`${lot.id}: ${game}`);
    assert.deepEqual({x:car.x,z:car.z},before,`${lot.id}: ${game} stays in place`);
    const round=world.parking.rounds[0];assert.equal(round.lotId,lot.id);
    if(game==='queue')assert.equal(parkingAction(world,'driver','start'),true);
    const target=game==='park'?lot.stalls.find(stall=>stall.id===round.entrants[0].targetId)!:lot.stalls[0];
    Object.assign(car,{x:target.x,y:target.y,z:target.z,yaw:target.yaw,supportId:'ground',speed:0,vx:0,vy:0,vz:0});
    for(let i=0;i<45&&round.entrants[0].finishedAt===null;i++)step(world,new Map(),.05);
    assert.notEqual(round.entrants[0].finishedAt,null,`${lot.id}: ${game} completes`);
  }
});

test('queue entry finds the local approach and a busy lot fails without relocating',()=>{
  for(const lot of PARKING_LOTS){
    const {world,car}=drivingWorld();
    Object.assign(car,{x:lot.area.x,z:lot.area.z+lot.area.length/2-1,
      y:terrainHeight(lot.area.x,lot.area.z+lot.area.length/2-1),supportId:'ground'});
    assert.equal(enterMinigame(world,'driver','queue'),true,lot.id);
    assert.equal(world.parking.rounds[0].lotId,lot.id);
    assert.ok(Math.abs(car.x-lot.approach.x)<=lot.approach.width/2&&
      Math.abs(car.z-lot.approach.z)<=lot.approach.length/2,`${lot.id}: local approach`);
  }
  const {world,car}=drivingWorld(),lot=PARKING_LOTS.find(l=>l.id.startsWith('charger-'))!;
  Object.assign(car,{x:lot.area.x,z:lot.area.z,y:terrainHeight(lot.area.x,lot.area.z),supportId:'ground'});
  const other=addPlayer(world,'other','Other'),otherCar=world.entities.find(e=>e.id===other.entityId)!;
  Object.assign(otherCar,{x:lot.area.x+10,z:lot.area.z,y:terrainHeight(lot.area.x+10,lot.area.z),supportId:'ground'});
  assert.equal(parkingAction(world,'other','park'),true);
  const before={x:car.x,y:car.y,z:car.z};
  assert.equal(enterMinigame(world,'driver','queue'),false);
  assert.deepEqual({x:car.x,y:car.y,z:car.z},before);
  assert.equal(world.parking.rounds.length,1);assert.equal(world.parking.rounds[0].lotId,lot.id);
});

test('securing a ferry passenger and issuing a ticket cancel chosen navigation',()=>{
  {
    const {world,car}=drivingWorld();
    assert.equal(setDestination(world,'driver',{x:-180,z:60}),true);
    Object.assign(car,{x:world.ferry.x,z:world.ferry.z,y:0,yaw:0,speed:0,supportId:'ferry'});
    world.ferry.remaining=0;updateFerry(world,.05,()=>true);
    assert.equal(world.ferry.phase,'to-island');
    assert.equal(car.autopilot,false);assert.equal(car.navigation,null);
  }
  {
    const {world,player,car}=drivingWorld();
    assert.equal(setDestination(world,'driver',{x:-180,z:60}),true);
    Object.assign(car,{x:0,z:6,y:0,speed:1,supportId:'ground'});
    const cop=makeEntity('cop','model-3',0,0);cop.police=newPolice();cop.police.targetId='driver';world.entities.push(cop);
    updatePolice(world,.05);
    assert.equal(player.delivery.tickets,1);
    assert.equal(car.autopilot,false);assert.equal(car.navigation,null);
  }
});

test('destination and mini-game protocol accepts only finite bounded requests',()=>{
  assert.deepEqual(parseMessage('{"type":"destination","x":12,"z":-100,"requestId":2}'),{type:'destination',x:12,z:-100,requestId:2});
  assert.equal(parseMessage('{"type":"destination","x":10001,"z":0,"requestId":1}'),null);
  assert.equal(parseMessage('{"type":"destination","x":0,"z":0,"requestId":0}'),null);
  assert.equal(parseMessage('{"type":"minigame","game":"bogus"}'),null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, NEUTRAL, setDestination, step, type World } from '../shared/game';
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
    assert.equal(enterMinigame(world,'driver',game),true,game);
    assert.equal(car.health,72);assert.equal(car.air,41);assert.equal(car.supportId,'ground');
    assert.equal(player.delivery.level,0);
    if(game==='park'||game==='queue')assert.ok(world.parking.rounds.some(r=>r.mode===game&&r.entrants.some(e=>e.playerId==='driver')));
    else assert.ok(world.races.rounds.some(r=>r.courseId===game&&r.entrants.some(e=>e.playerId==='driver')));
    const before={x:car.x,z:car.z},other=game==='park'?'queue':game==='queue'?'park':game==='short'?'oval':'short';
    assert.equal(enterMinigame(world,'driver',other),false,'leave the existing round first');
    assert.deepEqual({x:car.x,z:car.z},before);
  }
});

test('destination and mini-game protocol accepts only finite bounded requests',()=>{
  assert.deepEqual(parseMessage('{"type":"destination","x":12,"z":-100,"requestId":2}'),{type:'destination',x:12,z:-100,requestId:2});
  assert.equal(parseMessage('{"type":"destination","x":10001,"z":0,"requestId":1}'),null);
  assert.equal(parseMessage('{"type":"destination","x":0,"z":0,"requestId":0}'),null);
  assert.equal(parseMessage('{"type":"minigame","game":"bogus"}'),null);
});

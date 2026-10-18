import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOME } from '../shared/dome';
import { addPlayer, createWorld, makeEntity, removePlayer, step, travelDome, type Entity } from '../shared/game';
import { initialSoccer, stepSoccer, type SoccerState } from '../shared/soccer';
import { hasRockets } from '../shared/upgrades';
import type { VehicleId } from '../shared/vehicles';

function touchCar(state:SoccerState,car:Entity):void {
  Object.assign(car,{y:0,vx:400,vy:0,vz:0,yaw:-Math.PI/2,inDome:true});
  car.x=DOME.x+5;car.z=DOME.z;
  Object.assign(state.ball,{x:DOME.x,y:DOME.ballRadius,z:DOME.z,vx:0,vy:0,vz:0});
  stepSoccer(state,[car],.05,.05);
  assert.ok(state.ball.vx>0,'an actual collision moved the ball');
}
function touch(state:SoccerState,id:string|null,kind:VehicleId,retrofit=false):void {
  const car=makeEntity('striker',kind,DOME.x+5,DOME.z,id);
  car.upgrades.rocket=retrofit;
  touchCar(state,car);
}
function goal(state:SoccerState,direction:1|-1,time:number):void {
  Object.assign(state.ball,{x:DOME.x+direction*(DOME.halfLength-2),y:3,z:DOME.z,vx:direction*90,vy:0,vz:0});
  stepSoccer(state,[],.05,time);
  assert.notEqual(state.phase,'play');
}
function playerCar(world:ReturnType<typeof createWorld>,id:string):Entity {
  const player=world.players.find(p=>p.id===id)!;
  return world.entities.find(e=>e.id===player.entityId)!;
}
function finish(world:ReturnType<typeof createWorld>):void {
  world.soccer.blueScore=4;
  Object.assign(world.soccer.ball,{x:DOME.x+DOME.halfLength-2,y:3,z:DOME.z,vx:90,vy:0,vz:0});
  step(world,new Map(),.05);
  assert.equal(world.soccer.phase,'win');
}

test('ball contacts record the actual vehicle class and ignore undriven cars',()=>{
  for(const [kind,retrofit,expected] of [
    ['roadster',false,'roadster'],['roadster',true,'roadster'],
    ['roadster-original',false,'stock'],['roadster-original',true,'retrofit'],
    ['model-3',true,'retrofit'],['zoox',false,'stock'],['zoox',true,'retrofit'],
  ] as const){
    const state=initialSoccer();touch(state,'driver',kind,retrofit);
    assert.equal(state.lastTouch?.carClass,expected);
    assert.equal(state.participants[0].touches[expected],true);
  }
  const state=initialSoccer();touch(state,'driver','roadster');touch(state,null,'model-3');
  assert.equal(state.lastTouch,null,'an undriven car cannot credit its collision to the previous player');
  goal(state,1,1);assert.equal(state.participants[0].goals.roadster,0);
});

test('either goal credits the last driver and the top scorers share a tied match',()=>{
  const state=initialSoccer();
  const shots=[['a','roadster',false,-1],['b','model-3',true,1],['a','roadster',false,1],
    ['b','model-3',true,1],['a','roadster',false,1],['b','model-3',true,1]] as const;
  shots.forEach(([id,kind,retrofit,direction],i)=>{
    touch(state,id,kind,retrofit);goal(state,direction,10+i*4);
    if(state.phase==='goal')stepSoccer(state,[],.05,13+i*4);
  });
  assert.equal(state.phase,'win');assert.equal(state.blueScore,5);assert.equal(state.orangeScore,1);
  assert.deepEqual(state.winningPlayers,['a','b']);
  assert.equal(state.participants[0].goals.roadster,3);assert.equal(state.participants[1].goals.retrofit,3);
  stepSoccer(state,[],.05,state.phaseUntil);
  assert.deepEqual(state.participants,[]);assert.deepEqual(state.winningPlayers,[]);assert.equal(state.lastTouch,null);
});

test('a match without a player-credited goal has no personal winner',()=>{
  const state=initialSoccer();state.blueScore=4;goal(state,1,1);
  assert.deepEqual(state.winningPlayers,[]);
});

test('completed matches award only participating players still in the dome',()=>{
  const world=createWorld(),roadster=addPlayer(world,'roadster','Roadster'),stock=addPlayer(world,'stock','Stock'),spectator=addPlayer(world,'spectator','Spectator');
  const gone=addPlayer(world,'gone','Gone');
  for(const id of ['roadster','stock','spectator','gone'])assert.equal(travelDome(world,id),true);
  touch(world.soccer,roadster.id,'roadster');
  touch(world.soccer,gone.id,'model-3',true);
  touch(world.soccer,stock.id,'model-3');
  assert.equal(travelDome(world,gone.id),true,'participant leaves before the match finishes');
  assert.deepEqual(roadster.achievements.unlocked,[],'touches do not unlock until match completion');
  finish(world);
  assert.deepEqual(world.soccer.winningPlayers,[stock.id]);
  assert.ok(roadster.achievements.unlocked.includes('rocket-rookie'));
  assert.ok(!roadster.achievements.unlocked.includes('roadster-champion'));
  assert.ok(stock.achievements.unlocked.includes('no-rockets-needed'));
  assert.deepEqual(spectator.achievements.unlocked,[]);
  assert.deepEqual(gone.achievements.unlocked,[]);
  const seq=stock.achievements.lastUnlock?.id;step(world,new Map(),.05);
  assert.equal(stock.achievements.lastUnlock?.id,seq,'win display does not award twice');
});

test('Roadster and retrofit winners get both play and win awards based on the scoring touch',()=>{
  for(const [kind,retrofit,playAward,winAward] of [
    ['roadster',false,'rocket-rookie','roadster-champion'],
    ['model-3',true,'built-to-fly','garage-champion'],
  ] as const){
    const world=createWorld(),p=addPlayer(world,'p','Player');assert.equal(travelDome(world,p.id),true);
    touch(world.soccer,p.id,kind,retrofit);
    // Switching after the touch does not turn a Roadster/retrofit goal into a stock goal.
    playerCar(world,p.id).kind='model-3';playerCar(world,p.id).upgrades.rocket=false;
    finish(world);
    assert.ok(p.achievements.unlocked.includes(playAward));assert.ok(p.achievements.unlocked.includes(winAward));
    assert.ok(!p.achievements.unlocked.includes('no-rockets-needed'));
  }
});

test('stock win requires stock-only touches and a stock-credited goal',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');assert.equal(travelDome(world,p.id),true);
  touch(world.soccer,p.id,'roadster');touch(world.soccer,p.id,'model-3');finish(world);
  assert.ok(p.achievements.unlocked.includes('rocket-rookie'));
  assert.ok(!p.achievements.unlocked.includes('roadster-champion'));
  assert.ok(!p.achievements.unlocked.includes('no-rockets-needed'));
});

test('a pickup-installed Rocket kit earns retrofit awards and is not a rocket-free win',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player'),car=playerCar(world,p.id);
  car.kind='model-3';Object.assign(car,{x:0,z:60,y:0,speed:0,supportId:'ground'});
  world.entities=[car];world.pickups=[{id:'kit',x:0,z:60,kind:'rocket',active:true}];
  step(world,new Map(),.05);
  assert.ok(car.upgrades.rocket,'the pickup installs the Rocket kit');
  world.pickups=[];world.time+=120;step(world,new Map(),.05);
  assert.ok(hasRockets(car),'the pickup kit lasts for the session');
  assert.equal(travelDome(world,p.id),true);
  touchCar(world.soccer,car);
  assert.equal(world.soccer.lastTouch?.carClass,'retrofit');
  finish(world);
  assert.ok(p.achievements.unlocked.includes('built-to-fly'));
  assert.ok(p.achievements.unlocked.includes('garage-champion'));
  assert.ok(!p.achievements.unlocked.includes('no-rockets-needed'));
});

test('disconnect removes a participant and their pending touch',()=>{
  const world=createWorld(),p=addPlayer(world,'p','Player');assert.equal(travelDome(world,p.id),true);
  touch(world.soccer,p.id,'roadster');removePlayer(world,p.id);
  assert.deepEqual(world.soccer.participants,[]);assert.equal(world.soccer.lastTouch,null);
  finish(world);assert.deepEqual(world.soccer.winningPlayers,[]);
});

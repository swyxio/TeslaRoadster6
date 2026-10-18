import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, makeEntity, NEUTRAL, parkingAction, setDestination, step, travelDome, type World } from '../shared/game';
import { updateFerry } from '../shared/ferry';
import { HIGHWAYS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { newPolice, updatePolice } from '../shared/police';
import { hasRockets } from '../shared/upgrades';
import { VEHICLE_IDS, VEHICLES } from '../shared/vehicles';
import { parseMessage } from '../worker/protocol';
import { ALTERNATE_ROADS, PENINSULA_CROSS_STREETS } from '../shared/alternate-roads';
import { HIGHWAY_ROUTE_IDS, ROUTES } from '../shared/traffic';
import { LEVELS, requiredLevelAt } from '../shared/delivery';

function drivingWorld(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  return {world,player,car};
}
function simulate(world:World,until:()=>boolean,seconds=120){
  for(let i=0;i<seconds*20&&!until();i++)step(world,new Map(),.05);
}

function peninsulaPavementEdge(point:{x:number;z:number}):number{
  let edge=Infinity;
  for(const highway of HIGHWAYS)for(let i=1;i<highway.points.length;i++){
    const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
    edge=Math.min(edge,Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)-(highway.width??32)/2);
  }
  for(const street of PENINSULA_CROSS_STREETS)
    edge=Math.min(edge,Math.max(Math.abs(point.x-street.x)-street.w/2,Math.abs(point.z-street.z)-street.d/2));
  return edge;
}

test('map pins reach either Peninsula alternative in both directions after the level two unlock',()=>{
  for(const road of ALTERNATE_ROADS)for(const direction of [0,1] as const){
    const {world,player,car}=drivingWorld();
    const route=ROUTES[HIGHWAY_ROUTE_IDS[direction]];
    const reference=direction===0?{x:-1124,z:2347}:{x:60,z:6821};
    const index=route.findIndex(point=>Math.hypot(point.x-reference.x,point.z-reference.z)<10);
    assert.ok(index>=0,`${road.id}: starting lane`);
    const a=route[index],b=route[(index+1)%route.length];
    Object.assign(car,{x:a.x+(b.x-a.x)*.25,z:a.z+(b.z-a.z)*.25,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))});
    const target=road.points.find(point=>point.z>4500)!;
    player.delivery.level=1;player.delivery.cash=LEVELS[1].cash+2_500;
    assert.equal(setDestination(world,'driver',target),false,`${road.id}: locked at level one`);
    player.delivery.level=2;player.delivery.cash=LEVELS[2].cash+2_500;
    assert.equal(setDestination(world,'driver',target),true,`${road.id}: route from ${direction===0?'north':'south'}`);
    for(let i=0;i<6000&&car.autopilot;i++){
      step(world,new Map(),.05);
      if(i%10!==0)continue;
      assert.ok(peninsulaPavementEdge(car)<0,`${road.id}: self-driving stays on pavement`);
    }
    assert.equal(car.navigation?.status,'arrived',`${road.id}: destination reached`);
    assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<12,road.id);
    assert.equal(car.health,100,`${road.id}: did not hit a building`);
  }
});

test('after spending lowers a level, navigation can leave a locked region but cannot enter a higher one',()=>{
  const {world,player,car}=drivingWorld(),route=ROUTES[HIGHWAY_ROUTE_IDS[1]];
  const index=route.findIndex(point=>Math.hypot(point.x+1124,point.z-2347)<10);
  assert.ok(index>=0);
  const a=route[index],b=route[(index+1)%route.length];
  Object.assign(car,{x:a.x+(b.x-a.x)*.25,z:a.z+(b.z-a.z)*.25,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))});
  player.delivery.level=1;player.delivery.cash=LEVELS[1].cash+2_500;
  assert.equal(requiredLevelAt(car.x,car.z),2);
  assert.equal(setDestination(world,'driver',{x:1705,z:8730}),false,'a locked destination stays locked');
  assert.equal(setDestination(world,'driver',{x:-180,z:60}),true,'the route can leave the Peninsula');
  let previous={x:car.x,z:car.z},ceiling=2;
  for(const next of car.navigation!.path){
    const count=Math.max(1,Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)/20));
    for(let i=1;i<=count;i++){
      const t=i/count,required=requiredLevelAt(previous.x+(next.x-previous.x)*t,previous.z+(next.z-previous.z)*t);
      assert.ok(required<=ceiling,'the route does not re-enter a higher locked tier');
      ceiling=Math.max(player.delivery.level,required);
    }
    previous=next;
  }
});

test('nearby route changes use a shared cross street in either heading',()=>{
  const main={x:-734,z:4503},alternatives=[{x:-1023,z:4553},{x:-850,z:4553}];
  for(const yaw of [0,Math.PI])for(const alternative of alternatives)for(const back of [false,true]){
    const {world,player,car}=drivingWorld(),start=back?alternative:main,target=back?main:alternative;
    Object.assign(car,{...start,yaw});player.delivery.level=2;player.delivery.cash=LEVELS[2].cash+2_500;
    assert.equal(setDestination(world,'driver',target),true,`${yaw}: ${JSON.stringify(start)} to ${JSON.stringify(target)}`);
    assert.ok(car.navigation!.path.some(point=>PENINSULA_CROSS_STREETS.some(street=>Math.abs(point.z-street.z)<4)),
      'the route uses a local junction');
    for(let i=0;i<3600&&car.autopilot;i++){
      step(world,new Map(),.05);
      if(i%10===0)assert.ok(peninsulaPavementEdge(car)<0,'the car stays on pavement');
    }
    assert.equal(car.navigation?.status,'arrived');
    assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<12);
    assert.equal(car.health,100);
  }
});

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

test('a Tesla facing against its current lane can continue to an intersection and navigate',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-120,z:-177,yaw:Math.PI/2,speed:0});
  assert.equal(setDestination(world,'driver',{x:-120,z:-60}),true);
  assert.ok(car.navigation!.path[0].x<=car.x+.5,'the first waypoint stays ahead of the car');
  simulate(world,()=>!car.autopilot,180);
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.health,100);
});

test('navigation rejects an excessive directed detour to a nearby destination',()=>{
  const {world,player,car}=drivingWorld();player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
  Object.assign(car,{x:-210,z:177,yaw:-Math.PI/2,speed:0});
  assert.equal(setDestination(world,'driver',{x:-120,z:-60}),false);
});

test('invalid, locked and disconnected destinations are rejected; manual input takes over',()=>{
  const {world,player,car}=drivingWorld();
  assert.equal(setDestination(world,'driver',{x:180,z:-300}),false,'water is not a road');
  assert.equal(setDestination(world,'driver',{x:450,z:0}),false,'Oakland is locked at level zero');
  assert.equal(setDestination(world,'driver',{x:0,z:-1400}),false,'the island is disconnected from the road network');
  assert.equal(setDestination(world,'driver',{x:-180,z:60}),true);
  step(world,new Map([['driver',{...NEUTRAL,steer:1}]]),.05);
  assert.equal(car.autopilot,false);assert.equal(car.navigation,null);
  player.delivery.level=1;player.delivery.cash=LEVELS[1].cash+2_500;
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

test('mini-game entry from the dome preserves the rocket kit and resources',()=>{
  for(const game of ['park','queue','short','oval'] as const){
    const {world,car}=drivingWorld();car.kind='model-3';car.upgrades.rocket=true;
    car.health=72;car.air=41;
    assert.equal(travelDome(world,'driver'),true);
    assert.equal(car.inDome,true);assert.equal(car.supportId,'dome');
    assert.equal(enterMinigame(world,'driver',game),true,game);
    assert.equal(car.inDome,false);assert.equal(car.supportId,'ground');
    assert.equal(hasRockets(car),true);
    assert.equal(car.health,72);assert.equal(car.air,41);
  }
});

test('both parking games join and finish at every registered local lot',()=>{
  for(const lot of PARKING_LOTS)for(const game of ['park','queue'] as const){
    const {world,player,car}=drivingWorld();player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
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
  const fence={actionSeq:1,edgeBaseline:{jump:0,flip:0}};
  const valid={type:'destination',x:12,z:-100,requestId:2,...fence};
  assert.deepEqual(parseMessage(JSON.stringify(valid)),valid);
  assert.equal(parseMessage(JSON.stringify({...valid,x:10001})),null);
  assert.equal(parseMessage(JSON.stringify({...valid,requestId:0})),null);
  assert.equal(parseMessage(JSON.stringify({type:'minigame',game:'bogus',...fence})),null);
});

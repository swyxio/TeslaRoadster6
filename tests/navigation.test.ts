import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, enterMinigame, makeEntity, NEUTRAL, parkingAction, setDeliveryDestination, setDestination, step, travelDome, type World } from '../shared/game';
import { updateFerry } from '../shared/ferry';
import { BUILDINGS, HIGHWAYS, ROADS, terrainHeight } from '../shared/map';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { PARKING_LOTS } from '../shared/parking-lots';
import { newPolice, updatePolice } from '../shared/police';
import { hasRockets } from '../shared/upgrades';
import { VEHICLE_IDS, VEHICLES } from '../shared/vehicles';
import { parseMessage } from '../worker/protocol';
import { ALTERNATE_ROADS, PENINSULA_CROSS_STREETS } from '../shared/alternate-roads';
import { HIGHWAY_ROUTE_IDS, ROUTES } from '../shared/traffic';
import { CUSTOMERS, LEVELS, RESTAURANTS, requiredLevelAt } from '../shared/delivery';
import { DELIVERY_DESTINATION_SNAP, planNavigation } from '../shared/navigation';

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

function cityPavementEdge(point:{x:number;z:number}):number{
  let edge=Infinity;
  for(const road of ROADS){
    if(road.kind==='island')continue;
    const dx=point.x-road.x,dz=point.z-road.z,angle=road.angle??0,c=Math.cos(angle),s=Math.sin(angle);
    edge=Math.min(edge,Math.max(Math.abs(dx*c-dz*s)-road.w/2,Math.abs(dx*s+dz*c)-road.d/2));
  }
  return edge;
}

test('Oakland delivery navigation turns before the stunt loop and ramp',()=>{
  for(const kind of ['model-3','roadster'] as const){
    const {world,player,car}=drivingWorld();
    player.delivery.level=1;player.delivery.cash=LEVELS[1].cash+2_500;
    player.delivery.order.restaurant=RESTAURANTS.findIndex(place=>place.id==='oakland-saints');
    player.delivery.order.customer=CUSTOMERS.findIndex(place=>place.id==='customer-oakland-07');
    player.delivery.order.stage='dropoff';
    Object.assign(car,{kind,x:507,z:139,yaw:Math.PI,speed:0,vx:0,vz:0});
    assert.equal(setDeliveryDestination(world,'driver'),true,`${kind}: destination planned`);
    for(let i=0;i<6000&&car.autopilot;i++){
      step(world,new Map(),.05);
      assert.notEqual(car.supportId,'stunt-loop',`${kind}: does not enter the stunt loop`);
      assert.notEqual(car.supportId,'stunt-ramp',`${kind}: does not enter the stunt ramp`);
    }
    assert.equal(car.navigation?.status,'arrived',`${kind}: destination reached`);
    assert.ok(Math.hypot(car.x-487,car.z-117)<9,`${kind}: within delivery marker`);
    assert.equal(player.delivery.completed,1,`${kind}: actual dropoff completed`);
    assert.equal(car.health,100,`${kind}: no collision damage`);
  }
});

test('delivery navigation does not promise a direct route through either ramp end',()=>{
  const west=makeEntity('west','model-3',410,177);west.yaw=Math.PI/2;
  const east=makeEntity('east','model-3',350,177);east.yaw=-Math.PI/2;
  assert.equal(planNavigation(west,{x:360,z:177},1,DELIVERY_DESTINATION_SNAP),null);
  assert.equal(planNavigation(east,{x:410,z:177},1,DELIVERY_DESTINATION_SNAP),null);
});

test('delivery navigation reaches western and central SF markers on the mapped streets',()=>{
  const targets=[...RESTAURANTS.filter(place=>['burma','tartine','tonys','nanking'].includes(place.id)),
    CUSTOMERS.find(place=>place.id==='coast')!];
  for(const target of targets){
    const {world,player,car}=drivingWorld();
    player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
    const restaurant=RESTAURANTS.findIndex(place=>place.id===target.id);
    if(restaurant>=0)player.delivery.order.restaurant=restaurant;
    else {player.delivery.order.stage='dropoff';player.delivery.order.customer=CUSTOMERS.findIndex(place=>place.id===target.id);}
    assert.equal(setDeliveryDestination(world,'driver'),true,`${target.id}: connected`);
    for(let i=0;i<4800&&car.autopilot;i++){
      step(world,new Map(),.05);
      if(i%5===0)assert.ok(cityPavementEdge(car)<.05,`${target.id}: stays on mapped pavement`);
    }
    assert.equal(car.navigation?.status,'arrived',target.id);
    assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<9,`${target.id}: inside delivery marker`);
    assert.equal(car.health,100,`${target.id}: no building collision`);
    if(restaurant>=0)assert.equal(player.delivery.order.stage,'dropoff',`${target.id}: pickup completed`);
    else assert.equal(player.delivery.completed,1,`${target.id}: dropoff completed`);
  }
});

test('delivery navigation uses the current server order and rejects rooftop goals',()=>{
  const {world,player,car}=drivingWorld();
  player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
  player.delivery.order.restaurant=RESTAURANTS.findIndex(place=>place.id==='tartine');
  assert.equal(setDeliveryDestination(world,'driver'),true);
  const first=car.navigation!.destination;
  player.delivery.order.restaurant=RESTAURANTS.findIndex(place=>place.id==='burma');
  assert.equal(setDeliveryDestination(world,'driver'),true);
  const next=car.navigation!.destination,target=RESTAURANTS[player.delivery.order.restaurant];
  assert.ok(Math.hypot(next.x-target.x,next.z-target.z)<=DELIVERY_DESTINATION_SNAP);
  assert.ok(Math.hypot(next.x-first.x,next.z-first.z)>DELIVERY_DESTINATION_SNAP);
  player.delivery.order.stage='dropoff';player.delivery.order.customer=CUSTOMERS.findIndex(place=>place.rooftop);
  car.navigation=null;car.autopilot=false;
  assert.equal(setDeliveryDestination(world,'driver'),false);
  assert.equal(car.navigation,null);
});

test('map pins can snap farther than delivery destinations and point turnarounds are rejected',()=>{
  const {world,player,car}=drivingWorld();player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
  const pin={x:-330,z:-90};
  assert.equal(planNavigation(car,pin,player.delivery.level,DELIVERY_DESTINATION_SNAP),null,'delivery too far from a connected lane');
  assert.equal(setDestination(world,'driver',pin),true,'the same map pin can snap to a farther lane');
  const snap=car.navigation!.destination;
  assert.ok(Math.hypot(snap.x-pin.x,snap.z-pin.z)>DELIVERY_DESTINATION_SNAP);
  assert.ok(Math.hypot(snap.x-pin.x,snap.z-pin.z)<=100);
  car.autopilot=false;car.navigation=null;
  assert.equal(setDestination(world,'driver',{x:390,z:-120}),false,'unsafe cross-Bay turn');
  assert.equal(car.autopilot,false);
});

test('map pins reach either Peninsula alternative in both directions after the level four unlock',()=>{
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
    player.delivery.level=4;player.delivery.cash=LEVELS[4].cash+2_500;
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
  assert.equal(requiredLevelAt(car.x,car.z),3);
  assert.equal(setDestination(world,'driver',{x:1705,z:8730}),false,'a locked destination stays locked');
  assert.equal(setDestination(world,'driver',{x:-180,z:60}),true,'the route can leave the Peninsula');
  let previous={x:car.x,z:car.z},ceiling=3;
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
    Object.assign(car,{...start,yaw});player.delivery.level=4;player.delivery.cash=LEVELS[4].cash+2_500;
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
    const {world,player,car}=drivingWorld();player.delivery.level=6;player.delivery.cash=LEVELS[6].cash+2_500;
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
  const valid={type:'destination',x:12,z:-100,requestId:2,mode:'road',...fence};
  assert.deepEqual(parseMessage(JSON.stringify(valid)),valid);
  assert.equal(parseMessage(JSON.stringify({...valid,x:10001})),null);
  assert.equal(parseMessage(JSON.stringify({...valid,requestId:0})),null);
  const delivery={type:'deliveryDestination',requestId:3,mode:'road',...fence};
  assert.deepEqual(parseMessage(JSON.stringify(delivery)),delivery);
  assert.equal(parseMessage(JSON.stringify({...delivery,requestId:0})),null);
  assert.equal(parseMessage(JSON.stringify({type:'deliveryDestination',requestId:3})),null);
  assert.equal(parseMessage(JSON.stringify({type:'minigame',game:'bogus',...fence})),null);
});

test('self-driving rounds city turns without abrupt steering changes',()=>{
  const {world,car}=drivingWorld();
  assert.equal(setDestination(world,'driver',{x:-120,z:-60}),true);
  let previous=car.steering,maxChange=0;
  for(let i=0;i<2400&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(car.speed>2)maxChange=Math.max(maxChange,Math.abs(car.steering-previous));
    previous=car.steering;
  }
  assert.equal(car.navigation?.status,'arrived');assert.equal(car.health,100);
  assert.ok(maxChange<.21,`largest steering change while moving: ${maxChange}`);
});

test('self-driving follows a stopped car progressively and resumes when the lane clears',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-180,z:-177,yaw:-Math.PI/2,speed:12});
  const leader=makeEntity('stopped-leader','model-3',-140,-177);leader.yaw=-Math.PI/2;world.entities.push(leader);
  assert.equal(setDestination(world,'driver',{x:-60,z:-177}),true);
  let previousSpeed=car.speed,maxDeceleration=0,minSeparation=Infinity,stopped=false;
  for(let i=0;i<1200&&car.autopilot;i++){
    if(i===400)world.entities=world.entities.filter(e=>e!==leader);
    if(i<400)minSeparation=Math.min(minSeparation,leader.x-car.x);
    step(world,new Map(),.05);
    maxDeceleration=Math.max(maxDeceleration,(previousSpeed-car.speed)/.05);
    if(i<400&&car.speed<.2)stopped=true;
    previousSpeed=car.speed;
  }
  assert.ok(stopped,'the car waited for traffic');
  assert.ok(minSeparation>5,'the vehicles did not overlap');
  assert.ok(maxDeceleration<4,`largest deceleration: ${maxDeceleration}`);
  assert.equal(car.health,100);assert.equal(car.navigation?.status,'arrived');
});

test('an off-road delivery starts beside buildings and reverses to recover before rejoining the street',()=>{
  // A supported, clear pose on the building side of a block, facing away from
  // the street, reproduces the off-road start without relocating the player.
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-225,z:40,yaw:0,speed:0});
  const start={x:car.x,z:car.z};
  assert.equal(setDeliveryDestination(world,'driver'),true);
  assert.deepEqual({x:car.x,z:car.z},start,'engagement does not teleport');
  assert.ok(car.navigation?.join,'a checked approach to the lane is planned');
  let reversed=false,maxStep=0,previous={...start};
  for(let i=0;i<1800&&car.autopilot;i++){
    step(world,new Map(),.05);
    reversed ||= car.speed<-.1;
    maxStep=Math.max(maxStep,Math.hypot(car.x-previous.x,car.z-previous.z));
    previous={x:car.x,z:car.z};
  }
  assert.ok(reversed,'the car backs away from the wall and turns');
  assert.ok(maxStep<1,'all travel uses continuous vehicle physics');
  assert.equal(car.health,100,'recovery avoids damaging the building');
  assert.equal(car.navigation?.status,'arrived');
  assert.ok(Math.hypot(car.x+180,car.z-120)<9,'the pickup is reached');
});

test('off-road join routes around a block before reaching the delivery',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-215,z:20,yaw:0,speed:0});
  assert.equal(setDeliveryDestination(world,'driver'),true);
  assert.ok(car.navigation!.path.length>=4,'the approach has a detour around the building');
  simulate(world,()=>!car.autopilot,100);
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.health,100);
  assert.ok(Math.hypot(car.x+180,car.z-120)<9);
});

test('off-road navigation routes around the Starbase channel walls',()=>{
  const pad=BUILDINGS.find(building=>building.style==='spaceport'&&building.x===1960)!;
  for(const startX of [1960,1980]){ // Inside the channel and outside its east wall.
    const {world,player,car}=drivingWorld();
    Object.assign(car,{kind:'roadster',x:startX,z:6232,y:terrainHeight(startX,6232),yaw:Math.PI/2,speed:0});
    player.delivery.level=5;player.delivery.cash=LEVELS[5].cash+2_500;
    assert.equal(landmarkBlocksPose(pad,car),false,'the starting pose is clear');
    assert.equal(setDestination(world,'driver',{x:1913,z:6200}),true,'the open end provides a route');
    let previous={x:car.x,z:car.z};
    for(const next of car.navigation!.path){
      const count=Math.max(1,Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)*2));
      const yaw=Math.atan2(previous.x-next.x,previous.z-next.z);
      for(let i=1;i<=count;i++){
        const t=i/count,x=previous.x+(next.x-previous.x)*t,z=previous.z+(next.z-previous.z)*t;
        assert.equal(landmarkBlocksPose(pad,{...car,x,z,y:terrainHeight(x,z),yaw}),false,
          `planned segment crosses the channel at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
      previous=next;
    }
    simulate(world,()=>!car.autopilot,300);
    assert.equal(car.navigation?.status,'arrived',`starting at x=${startX}`);
    assert.equal(car.health,100,'the driven route avoids collisions');
  }
});

test('an awkward off-road approach resumes normal road speed after passing the join',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-225,z:40,yaw:Math.PI/2,speed:0});
  assert.equal(setDeliveryDestination(world,'driver'),true);
  let fastestOnRoad=0;
  for(let i=0;i<1200&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(!car.navigation?.join)fastestOnRoad=Math.max(fastestOnRoad,car.speed);
  }
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.navigation?.join,undefined,'slow joining mode ends after the lane is reached');
  assert.ok(fastestOnRoad>6,'the car accelerates beyond joining speed');
  assert.equal(car.health,100);
});

test('a permanent traffic obstruction produces bounded, visible failure without collision',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-180,z:-177,yaw:-Math.PI/2,speed:0});
  const leader=makeEntity('stopped-leader','model-3',-140,-177);leader.yaw=-Math.PI/2;world.entities.push(leader);
  assert.equal(setDestination(world,'driver',{x:-60,z:-177}),true);
  let clearance=Infinity,reversed=false;
  for(let i=0;i<1500&&car.autopilot;i++){
    step(world,new Map(),.05);
    clearance=Math.min(clearance,leader.x-car.x);
    reversed ||= car.speed<-.1;
  }
  assert.ok(reversed,'recovery attempts to back away');
  assert.ok(clearance>5,'the cars do not overlap');
  assert.equal(car.health,100);
  assert.equal(car.autopilot,false);
  assert.equal(car.navigation?.status,'failed','the driver is told when recovery cannot complete');
  assert.ok(world.time<75);
});

test('a red bridge signal does not trigger stuck recovery while a driver waits',()=>{
  const {world,player,car}=drivingWorld();
  player.delivery.level=1;player.delivery.cash=LEVELS[1].cash;
  Object.assign(car,{x:40,z:63,yaw:-Math.PI/2,speed:0});
  assert.equal(setDestination(world,'driver',{x:120,z:63}),true);
  world.time=30;
  let reversed=false,waited=false;
  for(let i=0;i<400&&car.autopilot;i++){
    step(world,new Map(),.05);
    if(world.time<48){reversed ||= car.speed<-.1;waited ||= Math.abs(car.speed)<.2;}
  }
  assert.ok(waited,'the car waits for the signal');
  assert.equal(reversed,false,'a red light is not an obstacle to reverse from');
  assert.ok(car.x>45,'the car proceeds after the signal turns green');
});

test('manual input takes over while off-road recovery is reversing',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-225,z:40,yaw:0,speed:0});
  assert.equal(setDeliveryDestination(world,'driver'),true);
  simulate(world,()=>car.speed<-.1,30);
  assert.ok(car.speed<-.1,'recovery engaged');
  step(world,new Map([['driver',{...NEUTRAL,steer:1}]]),.05);
  assert.equal(car.autopilot,false);
  assert.equal(car.navigation,null);
});

test('a blocked turn restores the last safe heading and can reverse clear',()=>{
  const {world,car}=drivingWorld();
  Object.assign(car,{x:-220.7,z:30,yaw:-Math.PI/2,speed:3});
  let collided=false;
  for(let i=0;i<40;i++){
    const before={x:car.x,z:car.z,yaw:car.yaw};
    step(world,new Map([['driver',{...NEUTRAL,throttle:1,steer:1}]]),.05);
    if(Math.hypot(car.x-before.x,car.z-before.z)<.001){
      assert.equal(car.yaw,before.yaw,'the rejected turn restores the safe heading');
      collided=true;break;
    }
  }
  assert.ok(collided,'the pose reached the building');
  const blockedX=car.x;
  for(let i=0;i<40;i++)step(world,new Map([['driver',{...NEUTRAL,throttle:-.3}]]),.05);
  assert.ok(car.x<blockedX-3,'the car can back away after the rejected turn');
});

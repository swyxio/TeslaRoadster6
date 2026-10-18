import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../shared/delivery';
import { DAY_LENGTH_SECONDS, dayMinute, trafficDemand } from '../shared/day';
import { addPlayer, createWorld, interact, makeEntity, removePlayer, step } from '../shared/game';
import { isBridge, isSurface, nearbyBuildings } from '../shared/map';
import { body, contact } from '../shared/physics';
import { engageAutopilot, HIGHWAY_ROUTE_IDS, ROUTES, seedHighwayTraffic, updateHighwayTraffic } from '../shared/traffic';
import { VEHICLES } from '../shared/vehicles';
import { initialSoccer } from '../shared/soccer';

const timeAtHour = (hour:number) => (((hour * 60 - 360) + 1440) % 1440) * 2;

test('autopilot attaches to a later highway segment without jumping to the first four points', () => {
  const route=ROUTES[HIGHWAY_ROUTE_IDS[0]],segment=8,a=route[segment],b=route[segment+1];
  const car=makeEntity('late-segment','roadster',(a.x+b.x)/2,(a.z+b.z)/2);
  car.yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));
  assert.ok(engageAutopilot(car));
  assert.equal(car.routeId,HIGHWAY_ROUTE_IDS[0]);
  assert.equal(car.waypoint,segment+1);
});

test('both highway directions complete the full circuit, including San Jose and the Bay Bridge', () => {
  for(const routeId of HIGHWAY_ROUTE_IDS){
    const world=createWorld(),route=ROUTES[routeId],a=route[0],b=route[1];
    const car=makeEntity('circuit-probe','roadster',a.x,a.z);
    Object.assign(car,{npc:true,autopilot:true,routeId,waypoint:1,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))});
    world.entities=[car];world.players=[];world.pickups=[];
    let previousWaypoint=car.waypoint,wraps=0,sawSouthBay=false,sawBridge=false;
    for(let i=0;i<24000;i++){
      const x=car.x,z=car.z;step(world,new Map(),.05);
      assert.ok(Math.hypot(car.x-x,car.z-z)<4,'traffic never teleports');
      if(car.waypoint<previousWaypoint)wraps++;
      previousWaypoint=car.waypoint;
      sawSouthBay ||= car.z>8000;
      sawBridge ||= car.x>100&&car.x<280&&isBridge(car.x,car.z);
      if(wraps&&car.waypoint===1)break;
    }
    assert.ok(wraps&&car.waypoint===1,`route ${routeId} did not complete`);
    assert.ok(sawSouthBay&&sawBridge,`route ${routeId} missed a landmark`);
    assert.equal(car.health,100);
  }
});

test('city and highway traffic can pass in opposite directions on the Bay Bridge', () => {
  const cityRoute=ROUTES.findIndex(route=>route.length===10&&route[0].x===0&&route[0].z===63);
  assert.ok(cityRoute>=0);
  for(const cityEastbound of [true,false]){
    const highwayId=HIGHWAY_ROUTE_IDS[cityEastbound?0:1],route=ROUTES[highwayId];
    const segment=route.findIndex((a,i)=>{
      const b=route[(i+1)%route.length];
      return Math.abs(a.z-60)<10&&Math.abs(b.z-60)<10&&
        (cityEastbound?a.x>300&&b.x<0:a.x<0&&b.x>300);
    });
    assert.ok(segment>=0);
    const city=makeEntity('city-bridge','model-3',cityEastbound?20:280,cityEastbound?63:57);
    const highway=makeEntity('highway-bridge','model-3',cityEastbound?280:20,cityEastbound?57.17:62.83);
    Object.assign(city,{npc:true,autopilot:true,routeId:cityRoute,waypoint:cityEastbound?1:6,yaw:cityEastbound?-Math.PI/2:Math.PI/2,speed:8});
    Object.assign(highway,{npc:true,autopilot:true,routeId:highwayId,waypoint:(segment+1)%route.length,yaw:cityEastbound?Math.PI/2:-Math.PI/2,speed:8});
    const world=createWorld();world.entities=[city,highway];world.players=[];world.pickups=[];
    let passed=false;
    for(let i=0;i<500;i++){
      step(world,new Map(),.05);
      passed ||= cityEastbound?city.x>highway.x:highway.x>city.x;
    }
    assert.ok(passed,`opposed traffic failed to pass, city eastbound=${cityEastbound}`);
    assert.equal(city.health,100);assert.equal(highway.health,100);
  }
});

test('ambient fleet is deterministic, capped and retains occupied or stopped cars', () => {
  const empty=()=>({entities:[],players:[],pickups:[],time:0,soccer:initialSoccer()} as ReturnType<typeof createWorld>);
  const first=empty(),second=empty();
  seedHighwayTraffic(first,makeEntity);seedHighwayTraffic(second,makeEntity);
  assert.equal(first.entities.length,5);
  assert.deepEqual(first,second);
  assert.ok(first.entities.every(car=>HIGHWAY_ROUTE_IDS.includes(car.routeId as typeof HIGHWAY_ROUTE_IDS[number])));
  for(const world of [first,second]){
    const occupied=world.entities[0],player=addPlayer(world,'p','Player');
    world.entities=world.entities.filter(entity=>entity.id!==player.entityId);
    occupied.driver='p';player.entityId=occupied.id;
  }
  for(let i=0;i<50;i++){
    first.time=timeAtHour(8)+i*5;second.time=first.time;
    updateHighwayTraffic(first,5,makeEntity);updateHighwayTraffic(second,5,makeEntity);
  }
  assert.equal(first.entities.length,13);
  assert.equal(first.entities.filter(car=>!car.driver&&car.autopilot).length,12);
  assert.deepEqual(first,second);
  const occupied=first.entities[0],queued=first.entities[1];
  queued.speed=0;
  first.entities.slice(2).forEach(car=>{car.speed=10;});
  for(let i=0;i<50;i++){
    first.time=timeAtHour(2)+i*5;
    updateHighwayTraffic(first,5,makeEntity);
  }
  assert.ok(first.entities.includes(occupied));
  assert.ok(first.entities.includes(queued));
  assert.ok(first.entities.length<=13);
});

test('taking ambient traffic replenishes it, and disconnecting off-route leaves it parked', () => {
  const world=createWorld();addPlayer(world,'observer','Observer');
  const player=addPlayer(world,'p','Player');player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
  const car=world.entities.find(entity=>entity.id==='ambient-seed-1')!;
  const person=makeEntity('person-p','person',car.x+3,car.z,'p');
  assert.equal(person.supportId,'ground');
  world.entities=world.entities.filter(entity=>entity.id!==player.entityId);
  world.entities.push(person);player.entityId=person.id;
  interact(world,'p');
  assert.equal(player.entityId,car.id);
  assert.equal(car.driver,'p');
  assert.equal(car.autopilot,false);
  world.time=5;updateHighwayTraffic(world,5,makeEntity);
  const ambient=()=>world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  assert.equal(ambient().length,6);
  assert.equal(ambient().filter(entity=>!entity.driver&&entity.autopilot).length,5);

  const offRoute=makeEntity('probe','model-3',-1000,3000);
  assert.equal(offRoute.supportId,'ground');
  assert.equal(engageAutopilot(offRoute),false);
  Object.assign(car,{x:offRoute.x,y:offRoute.y,z:offRoute.z,supportId:offRoute.supportId});
  removePlayer(world,'p');
  assert.equal(car.driver,null);
  assert.equal(car.autopilot,false);
  world.time=10;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(world.entities.includes(car));
  assert.equal(ambient().filter(entity=>!entity.driver&&entity.autopilot).length,5);
});

test('disconnecting a taken ambient car on a city route replenishes highway traffic', () => {
  const world=createWorld();addPlayer(world,'observer','Observer');
  const player=addPlayer(world,'p','Player');player.delivery.level=3;player.delivery.cash=LEVELS[3].cash+2_500;
  const car=world.entities.find(entity=>entity.id==='ambient-seed-1')!;
  const [a,b]=ROUTES[0],x=(a.x+b.x)/2,z=(a.z+b.z)/2,pose=makeEntity('probe','model-3',x,z);
  assert.equal(pose.supportId,'ground');
  world.entities=world.entities.filter(entity=>entity.id!==player.entityId);
  player.entityId=car.id;
  Object.assign(car,{driver:'p',autopilot:false,x,y:pose.y,z,supportId:pose.supportId,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))});
  removePlayer(world,'p');
  assert.equal(car.driver,null);
  assert.equal(car.autopilot,true);
  assert.ok(!HIGHWAY_ROUTE_IDS.includes(car.routeId as typeof HIGHWAY_ROUTE_IDS[number]));
  world.time=5;updateHighwayTraffic(world,5,makeEntity);
  const ambient=world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  assert.equal(ambient.length,6);
  assert.equal(ambient.filter(entity=>!entity.driver&&entity.autopilot&&HIGHWAY_ROUTE_IDS.includes(entity.routeId as typeof HIGHWAY_ROUTE_IDS[number])).length,5);
  assert.ok(world.entities.includes(car));
});

test('four taken highway cars replenish at peak without exceeding the sixteen-car pool', () => {
  const world=createWorld();addPlayer(world,'observer','Observer');
  for(let time=240;time<=280;time+=5){world.time=time;updateHighwayTraffic(world,5,makeEntity);}
  const ambient=()=>world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  const targets=ambient().filter(entity=>entity.autopilot&&!entity.driver).slice(0,4);
  assert.equal(targets.length,4);assert.equal(ambient().length,12);
  for(const [i,car] of targets.entries()){
    const id=`take-${i}`,player=addPlayer(world,id,id);player.delivery.level=3;player.delivery.cash=1_000_000;
    const person=makeEntity(`person-${id}`,'person',car.x+3,car.z,id);
    world.entities=world.entities.filter(entity=>entity.id!==player.entityId);
    world.entities.push(person);player.entityId=person.id;interact(world,id);
    assert.equal(player.entityId,car.id);assert.equal(car.driver,id);
  }
  for(let time=285;time<=300;time+=5){world.time=time;updateHighwayTraffic(world,5,makeEntity);}
  assert.equal(ambient().length,16);
  assert.equal(ambient().filter(entity=>!entity.driver&&entity.autopilot).length,12);
  for(const car of targets)assert.ok(world.entities.includes(car)&&car.driver,'occupied cars remain in the pool');
});

test('ambient reserve stays bounded and safely reclaims off-route and city cars when full', () => {
  const world=createWorld(),player=addPlayer(world,'p','Player');
  world.entities=world.entities.filter(entity=>!entity.id.startsWith('ambient-')&&entity.id!==player.entityId);
  const held=makeEntity('ambient-held','model-3',-950,3000,'p');
  Object.assign(held,{npc:true,autopilot:false});player.entityId=held.id;
  const abandoned=makeEntity('ambient-abandoned','model-3',-1000,3000);
  Object.assign(abandoned,{npc:true,autopilot:false});
  const city=makeEntity('ambient-city','model-3',-120,-177);
  Object.assign(city,{npc:true,autopilot:true,routeId:0,speed:0});
  const blocked=Array.from({length:13},(_,i)=>{
    const car=makeEntity(`ambient-blocked-${i}`,'model-3',3000+(i%11)*30,8000+Math.floor(i/11)*30);
    Object.assign(car,{npc:true,autopilot:false});return car;
  });
  world.entities.push(held,abandoned,city,...blocked);
  const ambient=()=>world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  assert.equal(ambient().length,16);
  world.time=5;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(world.entities.includes(abandoned),'visible abandoned car stays');
  assert.ok(world.entities.includes(city),'stopped city traffic stays');
  assert.equal(ambient().length,16);

  held.x=0;held.z=6000;
  world.time=10;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(!world.entities.includes(abandoned),'hidden abandoned car is reclaimed to make room');
  assert.ok(world.entities.includes(held),'occupied car is retained');
  assert.equal(ambient().length,15);
  world.time=15;updateHighwayTraffic(world,5,makeEntity);
  assert.equal(ambient().length,16);
  assert.equal(ambient().filter(entity=>!entity.driver&&entity.autopilot&&HIGHWAY_ROUTE_IDS.includes(entity.routeId as typeof HIGHWAY_ROUTE_IDS[number])).length,1);
  world.time=20;updateHighwayTraffic(world,5,makeEntity);
  assert.equal(ambient().length,16,'no space or safe reclaim means no further spawn');
  assert.ok(world.entities.includes(city),'stopped city traffic stays when hidden');
  assert.ok(world.entities.includes(held));
  assert.ok(blocked.every(car=>world.entities.includes(car)),'nearby abandoned cars are retained');
  city.speed=8;
  world.time=25;updateHighwayTraffic(world,5,makeEntity);
  assert.ok(!world.entities.includes(city),'free-flowing hidden city car is reclaimed');
  assert.equal(ambient().length,15);
  world.time=30;updateHighwayTraffic(world,5,makeEntity);
  assert.equal(ambient().length,16);
  assert.equal(ambient().filter(entity=>!entity.driver&&entity.autopilot).length,2);
  world.time=35;updateHighwayTraffic(world,5,makeEntity);
  assert.equal(ambient().length,16);
  assert.ok(world.entities.includes(held));
});

test('five-second reconciliation keeps up with a synthetic open-space morning ramp', () => {
  const world=createWorld();addPlayer(world,'p','Player');
  let maxShortfall=0;
  for(let time=5;time<=180;time+=5){
    world.time=time;updateHighwayTraffic(world,5,makeEntity);
    const target=Math.round(3+9*trafficDemand(time).intensity);
    const active=world.entities.filter(entity=>entity.id.startsWith('ambient-')&&!entity.driver&&entity.autopilot).length;
    maxShortfall=Math.max(maxShortfall,target-active);
    if(time===60)assert.equal(active,6);
    if(time===180)assert.equal(active,12);
  }
  assert.ok(maxShortfall<=1,`maximum shortfall ${maxShortfall}`);
});

test('initial highway traffic is supported and clear of buildings and the existing fleet', () => {
  const world=createWorld(),ambient=world.entities.filter(car=>car.id.startsWith('ambient-'));
  assert.equal(ambient.length,5);
  for(const car of ambient){
    assert.ok(isSurface(car.x,car.z),car.id);
    assert.ok(!nearbyBuildings(car.x,car.z,10).some(building=>contact(body(car),{...building,yaw:0})),car.id);
    assert.ok(world.entities.every(other=>other===car||Math.hypot(other.x-car.x,other.z-car.z)>=30),car.id);
  }
});

test('peak target is 20 moving ambient cars plus four police when no highway cars are taken or abandoned', () => {
  const world=createWorld();addPlayer(world,'budget-player','Player');
  for(let i=0;i<50;i++){
    world.time=timeAtHour(8)+i*5;
    updateHighwayTraffic(world,5,makeEntity);
  }
  assert.equal(world.entities.filter(car=>car.id.startsWith('traffic-')).length,8);
  assert.equal(world.entities.filter(car=>car.police).length,4);
  assert.equal(world.entities.filter(car=>car.id.startsWith('ambient-')).length,12);
  assert.equal(world.entities.filter(car=>car.npc).length,24);
});

test('a released Rocket NPC does not replay its former driver’s stunt inputs', () => {
  const world=createWorld(),car=makeEntity('released-rocket','roadster',-220,-177);
  Object.assign(car,{npc:true,autopilot:true,routeId:0,waypoint:1,yaw:-Math.PI/2,lastJump:1,lastFlip:1});
  world.entities=[car];world.players=[];world.pickups=[];
  step(world,new Map(),.05);
  assert.equal(car.supportId,'ground');
  assert.equal(car.air,100);
  assert.equal(car.flipRemaining,0);
});

test('the room day starts at six, advances thirtyfold and wraps without changing physics time', () => {
  assert.equal(DAY_LENGTH_SECONDS, 2880);
  assert.equal(dayMinute(0), 360);
  assert.equal(dayMinute(120), 420);
  assert.equal(dayMinute(2160), 0);
  assert.equal(dayMinute(DAY_LENGTH_SECONDS), 360);
  const world = createWorld();
  for(let i=0;i<20;i++)step(world,new Map(),.05);
  assert.ok(Math.abs(world.time-1)<1e-9);
  assert.ok(Math.abs(dayMinute(world.time)-360.5)<1e-9);
});

test('rush profiles peak separately and transition continuously', () => {
  const night = trafficDemand(timeAtHour(2));
  const morning = trafficDemand(timeAtHour(8));
  const afternoon = trafficDemand(timeAtHour(13));
  const evening = trafficDemand(timeAtHour(17));
  assert.ok(morning.intensity > afternoon.intensity && afternoon.intensity > night.intensity);
  assert.ok(evening.intensity > afternoon.intensity);
  assert.equal(morning.morning, 1); assert.equal(morning.evening, 0);
  assert.equal(evening.morning, 0); assert.equal(evening.evening, 1);
  for(const hour of [6, 6.5, 7, 7.5, 9, 10, 15.5, 16.5, 18, 19, 20, 21]){
    const t=timeAtHour(hour);
    assert.ok(Math.abs(trafficDemand(t-.05).intensity-trafficDemand(t+.05).intensity)<.001);
  }
});

test('a following car slows for a stopped leader and resumes after the obstruction clears', () => {
  const world=createWorld();
  const follower=makeEntity('follower','roadster',-220,-177);
  const leader=makeEntity('leader','model-3',-192,-177);
  Object.assign(follower,{npc:true,autopilot:true,routeId:0,waypoint:1,yaw:-Math.PI/2,speed:10});
  leader.yaw=-Math.PI/2;
  world.entities=[follower,leader];world.pickups=[];
  for(let i=0;i<200;i++)step(world,new Map(),.05);
  const clearance=leader.x-follower.x-(VEHICLES.roadster.length+VEHICLES['model-3'].length)/2;
  assert.ok(clearance>1,`clearance ${clearance}`);
  assert.ok(follower.speed<1,`speed ${follower.speed}`);
  const stopped=follower.x;world.entities=[follower];
  for(let i=0;i<100;i++)step(world,new Map(),.05);
  assert.ok(follower.x>stopped+5);
});

test('a short queue clears naturally once its obstruction moves', () => {
  const world=createWorld();world.pickups=[];
  const obstacle=makeEntity('obstacle','model-3',-135,-177);obstacle.yaw=-Math.PI/2;
  const queue=[-160,-188,-216].map((x,i)=>{
    const car=makeEntity(`queue-${i}`,'model-3',x,-177);
    Object.assign(car,{npc:true,autopilot:true,routeId:0,waypoint:1,yaw:-Math.PI/2,speed:8});
    return car;
  });
  world.entities=[obstacle,...queue];
  for(let i=0;i<600;i++)step(world,new Map(),.05);
  assert.ok(queue.every(car=>car.speed<1),'queue settles instead of driving through obstruction');
  const positions=queue.map(car=>car.x);world.entities=queue;
  for(let i=0;i<300;i++)step(world,new Map(),.05);
  assert.ok(queue.every((car,i)=>car.x>positions[i]+5),'all queued cars eventually move');
});

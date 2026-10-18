import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_BOUNDARIES, LEVELS, requiredLevelAt } from '../shared/delivery';
import { ACCESS_ROAD_GATES, ACCESS_ZONES, SERVICE_AREAS } from '../shared/service-areas';
import { FREMONT_SPACEPORT, HIGHWAYS, MAP_BOUNDS, insidePolygon } from '../shared/map';
import { CALTRAIN_STOPS } from '../shared/caltrain';
import { TECH_CAMPUSES } from '../shared/tech-campuses';
import { addPlayer, createWorld, setDestination, step } from '../shared/game';
import { trafficInput } from '../shared/traffic';
import { atMarsBoarding } from '../shared/mars';
import type { Navigation } from '../shared/navigation';

test('service-area catalog has stable, unique towns at the intended levels',()=>{
  const byLevel=[
    ['san-francisco','mill-valley','corte-madera','playground'],
    ['oakland','berkeley','emeryville'],
    ['south-san-francisco','sfo'],
    ['san-mateo','redwood-city'],
    ['palo-alto','menlo-park'],
    ['mountain-view','santa-clara','hayward','fremont'],
    ['san-jose','cupertino'],
  ];
  assert.equal(new Set(SERVICE_AREAS.map(area=>area.id)).size,SERVICE_AREAS.length);
  byLevel.forEach((expected,level)=>assert.deepEqual(SERVICE_AREAS.filter(area=>area.unlockLevel===level).map(area=>area.id),expected));
  for(const stop of CALTRAIN_STOPS)assert.equal(requiredLevelAt(stop.x,stop.z),stop.level,stop.id);
  for(const [id,level] of [['stripe',2],['meta',4],['google',5],['nvidia',5],['apple',6]] as const){
    const campus=TECH_CAMPUSES.find(item=>item.id===id)!;
    assert.equal(requiredLevelAt(campus.x,campus.z),level,campus.name);
  }
});

test('map shading and authoritative levels agree across the whole map',()=>{
  // Mid-cell samples avoid boundary-edge conventions and cover both routes,
  // the island approach, the divider and the open SF parking pocket.
  for(let z=MAP_BOUNDS.minZ+7.3;z<MAP_BOUNDS.maxZ;z+=37)for(let x=MAP_BOUNDS.minX+3.3;x<MAP_BOUNDS.maxX;x+=29){
    const shaded=ACCESS_ZONES.find(zone=>insidePolygon(x,z,zone.points)&&!zone.holes?.some(hole=>insidePolygon(x,z,hole)))?.level??0;
    assert.equal(shaded,requiredLevelAt(x,z),`map and access differ at ${x},${z}`);
  }
  const pocket=ACCESS_ZONES.find(zone=>zone.level===2)!.holes![0];
  assert.ok(insidePolygon(-300,340,pocket));
  assert.equal(requiredLevelAt(-300,340),0);
  assert.equal(requiredLevelAt(-200,340),2);
});

test('each road checkpoint crosses the shared tier boundary',()=>{
  for(const gate of ACCESS_ROAD_GATES){
    const road=HIGHWAYS.find(item=>item.id===gate.road)!;
    const segment=road.points.slice(1).map((b,i)=>({a:road.points[i],b})).find(({a,b})=>gate.z>=Math.min(a.z,b.z)&&gate.z<=Math.max(a.z,b.z))!;
    assert.ok(segment,`${gate.road} at ${gate.z}`);
    const {a,b}=segment,t=(gate.z-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*t;
    assert.ok(requiredLevelAt(x,gate.z-.2)<gate.level,`${gate.road} north of ${gate.z}`);
    assert.equal(requiredLevelAt(x,gate.z+.2),gate.level,`${gate.road} south of ${gate.z}`);
  }
  assert.equal(requiredLevelAt(ACCESS_BOUNDARIES.oaklandX-.1,60),0);
  assert.equal(requiredLevelAt(ACCESS_BOUNDARIES.oaklandX+.1,60),1);
});

test('southbound road and airborne cars stop at every actual gate until unlocked',()=>{
  for(const gate of ACCESS_ROAD_GATES.filter(item=>item.road==='peninsula'||item.road==='east-bay'))for(const airborne of [false,true]){
    const road=HIGHWAYS.find(item=>item.id===gate.road)!;
    const segment=road.points.slice(1).map((b,i)=>({a:road.points[i],b})).find(({a,b})=>gate.z>=Math.min(a.z,b.z)&&gate.z<=Math.max(a.z,b.z))!;
    const {a,b}=segment,t=(gate.z-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*t;
    const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
    world.entities=[car];world.pickups=[];
    player.delivery.level=(gate.level-1) as typeof player.delivery.level;player.delivery.cash=LEVELS[player.delivery.level].cash;
    Object.assign(car,{x,z:gate.z-.2,y:airborne?20:0,yaw:Math.PI,speed:70,vx:0,vz:70,vy:0,supportId:airborne?null:'ground'});
    step(world,new Map(),.05);
    assert.ok(car.z<=gate.z,`${gate.road} ${gate.z}: ${airborne?'air':'road'} stopped`);
    assert.equal(player.delivery.lastBlocked?.level,gate.level);
    player.delivery.level=gate.level;player.delivery.cash=LEVELS[gate.level].cash;
    Object.assign(car,{speed:70,vx:0,vz:70,vy:0});step(world,new Map(),.05);
    assert.ok(car.z>gate.z,`${gate.road} ${gate.z}: ${airborne?'air':'road'} unlocked`);
  }
});

test('Fremont boarding has a level-five highway route and a drivable last stretch',()=>{
  const z=FREMONT_SPACEPORT.entrance.z,road=HIGHWAYS.find(item=>item.id==='east-bay')!;
  const i=road.points.findIndex((point,index)=>index>0&&z>=Math.min(point.z,road.points[index-1].z)&&z<=Math.max(point.z,road.points[index-1].z));
  assert.ok(i>0);
  const a=road.points[i-1],b=road.points[i],x=a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z);
  const world=createWorld(),player=addPlayer(world,'d','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  Object.assign(car,{x:0,z:60,yaw:-Math.PI/2,kind:'model-3'});
  player.delivery.level=4;player.delivery.cash=LEVELS[4].cash;
  assert.equal(requiredLevelAt(FREMONT_SPACEPORT.entrance.x,z),5);
  assert.equal(setDestination(world,'d',{x,z}),false);
  player.delivery.level=5;player.delivery.cash=LEVELS[5].cash;
  assert.equal(setDestination(world,'d',{x,z}),true);
  for(let i=0;i<15000&&car.autopilot;i++)step(world,new Map(),.05);
  assert.equal(car.navigation?.status,'arrived');
  assert.ok(Math.hypot(car.x-x,car.z-z)<9);

  // The ring is off the road graph. Feed normal driving inputs around the
  // factory so the test verifies collisions and ground support on the final leg.
  const path=[{x:car.x,z:6240},{x:1929,z:6240},FREMONT_SPACEPORT.entrance];
  const route:Navigation={destination:FREMONT_SPACEPORT.entrance,path,index:0,status:'driving'};
  for(let i=0;i<2500&&route.status==='driving';i++){
    car.navigation=route;const input=trafficInput(car,world);car.navigation=null;
    step(world,new Map([['d',input]]),.05);
  }
  assert.equal(route.status,'arrived');
  assert.ok(atMarsBoarding(car));
  assert.equal(car.health,100);
});

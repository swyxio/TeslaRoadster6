import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,makeEntity,step} from '../shared/game';
import {HIGHWAY_ROUTE_IDS,isTrafficIncident,ROUTES,TRAFFIC_INCIDENT} from '../shared/traffic';

for(const kind of ['model-3','roadster'] as const)test(`an unattended ${kind} incident slows smoothly, queues traffic, and clears`,()=>{
  const routeId=HIGHWAY_ROUTE_IDS[0],route=ROUTES[routeId];
  const i=route.findIndex((a,index)=>{
    const b=route[(index+1)%route.length];
    return a.z>2000&&a.z<7000&&b.z>2000&&b.z<7000&&Math.hypot(b.x-a.x,b.z-a.z)>300;
  });
  assert.ok(i>=0,'a long highway segment exists');
  const a=route[i],b=route[(i+1)%route.length],length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2,yaw=Math.atan2(-dx,-dz);
  const leader=makeEntity(TRAFFIC_INCIDENT.entityId,kind,x,z),follower=makeEntity('incident-follower','model-3',x-dx*55,z-dz*55);
  for(const car of [leader,follower])Object.assign(car,{npc:true,autopilot:true,routeId,waypoint:(i+1)%route.length,yaw,speed:20});
  const world=createWorld();world.entities=[leader,follower];world.players=[];world.pickups=[];world.time=TRAFFIC_INCIDENT.startSeconds;
  assert.equal(isTrafficIncident(leader,world.time),true);
  for(let stepIndex=0;stepIndex<700;stepIndex++){
    const previous=leader.speed;step(world,new Map(),.05);
    if(previous>5)assert.ok(previous-leader.speed<.2,'high-speed deceleration is gradual');
  }
  assert.ok(leader.speed<1&&follower.speed<1,'following car queues behind stopped car');
  const before={x:follower.x,z:follower.z};
  for(let stepIndex=0;stepIndex<900;stepIndex++)step(world,new Map(),.05);
  assert.equal(isTrafficIncident(leader,world.time),false);
  assert.ok(Math.hypot(follower.x-before.x,follower.z-before.z)>20,'queue clears after incident');
});

test('a taken car cannot be selected for the incident',()=>{
  const route=ROUTES[HIGHWAY_ROUTE_IDS[0]],point=route.find(p=>p.z>2000&&p.z<7000)!;
  const car=makeEntity(TRAFFIC_INCIDENT.entityId,'roadster',point.x,point.z);
  Object.assign(car,{npc:true,autopilot:true,routeId:HIGHWAY_ROUTE_IDS[0]});
  assert.equal(isTrafficIncident(car,TRAFFIC_INCIDENT.startSeconds),true);
  car.driver='player';
  assert.equal(isTrafficIncident(car,TRAFFIC_INCIDENT.startSeconds),false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,makeEntity} from '../shared/game';
import {engageAutopilot,ROUTES,trafficInput} from '../shared/traffic';

test('ground routes cannot be engaged from an overlapping deck, roof, or the air',()=>{
  const car=makeEntity('support-test','roadster',0,57);
  for(const supportId of ['overpass','roof:0',null] as const){
    car.supportId=supportId;
    assert.equal(engageAutopilot(car),false);
  }
  car.supportId='ground';car.y=2;
  assert.equal(engageAutopilot(car),true,'raised terrain is still ground');
});

test('airborne autonomy resumes after landing and stacked vehicles use vertical body overlap',()=>{
  const world=createWorld(),route=ROUTES[0],a=route[0],b=route[1];
  const truck=makeEntity('truck','tesla-semi',a.x+10,a.z),other=makeEntity('other','model-3',a.x+20,a.z);
  Object.assign(truck,{npc:true,autopilot:true,routeId:0,waypoint:1,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),speed:4});
  world.entities=[truck,other];
  truck.supportId=null;
  assert.equal(trafficInput(truck,world).throttle,0);
  assert.equal(truck.autopilot,true,'temporary flight keeps the ground route');
  truck.supportId='ground';other.supportId='overpass';other.y=8;
  assert.ok(trafficInput(truck,world).throttle>0,'vehicle on upper deck is not a leader');
  other.y=2.1;
  assert.equal(trafficInput(truck,world).brake,true,'overlapping tall bodies are still obstacles');
  truck.supportId='overpass';trafficInput(truck,world);
  assert.equal(truck.autopilot,false,'cannot drive a ground route on a deck');
});

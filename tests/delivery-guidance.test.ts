import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld } from '../shared/game';
import { orderTarget } from '../shared/delivery';
import { nearbyBuildings, OVERPASS } from '../shared/map';
import { buildingBlocksPose } from '../shared/landmark-collision';
import { DELIVERY_DESTINATION_SNAP, planNavigation } from '../shared/navigation';
import { DeliveryGuidance, type GuidanceRequest } from '../src/delivery-guidance';

function fixture(){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  return {player,car:world.entities.find(entity=>entity.id===player.entityId)!,target:orderTarget(player.delivery.order)};
}

test('the opening guidance follows the street around buildings and advances at each turn',()=>{
  const {player,car,target}=fixture();
  const route=planNavigation(car,target,player.delivery.level,DELIVERY_DESTINATION_SNAP);
  assert.ok(route&&route.path.length>=3);
  const cutsBuilding=Array.from({length:101},(_,i)=>{
    const x=car.x+(target.x-car.x)*i/100,z=car.z+(target.z-car.z)*i/100;
    return nearbyBuildings(x,z,2).some(b=>Math.abs(x-b.x)<b.w/2+2&&Math.abs(z-b.z)<b.d/2+2);
  }).some(Boolean);
  assert.ok(cutsBuilding,'the direct bearing crosses a building');
  const points=[car,...route.path];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)));
    for(let j=0;j<=steps;j++){
      const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
      assert.ok(!nearbyBuildings(x,z,2).some(building=>building.style==='structure'
        ?buildingBlocksPose(building,{x,z,y:0,kind:'model-3',yaw:Math.atan2(a.x-b.x,a.z-b.z),pitch:0,roll:0,supportId:'ground'})
        :Math.abs(x-building.x)<building.w/2+2&&Math.abs(z-building.z)<building.d/2+2),`road segment ${i} crosses a building`);
    }
  }
  const requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  assert.equal(guide.update(car,target,player.delivery.level,0).status,'routing');
  guide.receive({id:requests[0].id,path:route.path});
  assert.deepEqual(guide.update(car,target,player.delivery.level,50).waypoint,route.path[0]);
  assert.deepEqual(guide.update({...car,...route.path[0]},target,player.delivery.level,100).waypoint,route.path[1]);
  assert.deepEqual(guide.update({...car,...route.path[1]},target,player.delivery.level,150).waypoint,route.path[2]);
});

test('a missed turn replans and stale worker replies cannot point at an old destination',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[{x:0,z:60},{x:0,z:120},{x:-180,z:120}]});
  assert.equal(guide.update({...car,x:40,z:-10},target,player.delivery.level,100).status,'routing');
  assert.equal(requests.length,2,'off-route movement requests a new road route immediately');
  const other={...target,x:-120,z:-60};
  guide.update(car,other,player.delivery.level,200);
  guide.receive({id:requests[1].id,path:[{x:0,z:60}]});
  assert.equal(guide.update(car,other,player.delivery.level,250).waypoint,null);
  guide.receive({id:requests[2].id,path:[{x:-100,z:-60}]});
  assert.deepEqual(guide.update(car,other,player.delivery.level,300).waypoint,{x:-100,z:-60});
});

test('turning around in place replans without treating a normal turn as a U-turn',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[{x:car.x,z:car.z-80}]});
  assert.equal(guide.update({...car,yaw:car.yaw+Math.PI/2},target,player.delivery.level,100).status,'ready');
  assert.equal(requests.length,1);
  assert.equal(guide.update({...car,yaw:car.yaw+Math.PI},target,player.delivery.level,200).status,'routing');
  assert.equal(requests.length,2);
});

test('a U-turn completed while a route is being planned requests a fresh route',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[{x:car.x,z:car.z-80}]});
  assert.equal(guide.update({...car,z:car.z-10,yaw:car.yaw+Math.PI},target,player.delivery.level,100).status,'routing');
  assert.equal(requests.length,2);
});

test('a nearby destination does not skip a remaining turn around an obstacle',()=>{
  const {player,car}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  const target={x:car.x+6,z:car.z},turn={x:car.x,z:car.z+20};
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[turn,target]});
  assert.deepEqual(guide.update(car,target,player.delivery.level,100).waypoint,turn);
});

test('a turn less than eight metres away is not skipped before it is reached',()=>{
  const {player,car}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  const target={x:car.x+20,z:car.z},turn={x:car.x,z:car.z+7};
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[turn,target]});
  assert.deepEqual(guide.update(car,target,player.delivery.level,100).waypoint,turn);
});

test('a rounded turn advances once the car has joined the next road',()=>{
  const {player,car}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  const turn={x:car.x,z:car.z+20},target={x:car.x+30,z:car.z+20};
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[turn,target]});
  assert.deepEqual(guide.update({...car,x:car.x+4,z:car.z+18},target,player.delivery.level,100).waypoint,target);
});

test('a turn already passed stays behind when approaching a nearby destination',()=>{
  const {player,car}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  const turn={x:car.x,z:car.z+20},target={x:car.x+20,z:car.z+20};
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:[turn,target]});
  assert.deepEqual(guide.update({...car,x:car.x+15,z:car.z+20},target,player.delivery.level,100).waypoint,target);
});

test('unreachable roads are labelled instead of falling back to a bearing through buildings',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  guide.receive({id:requests[0].id,path:null});
  assert.deepEqual(guide.update(car,target,player.delivery.level,100),{waypoint:null,status:'unavailable'});
  assert.equal(requests.length,1);
  guide.update(car,target,player.delivery.level,3001);
  assert.equal(requests.length,2,'retry is bounded');
  assert.deepEqual(guide.update({...car,supportId:null},target,player.delivery.level,3100),{waypoint:target,status:'flight'});
  assert.deepEqual(guide.update({...car,supportId:'ferry'},target,player.delivery.level,3200),{waypoint:null,status:'unavailable'});
});

test('a failed route worker does not leave the mission stuck finding a route',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  guide.workerFailed();
  guide.receive({id:requests[0].id,path:[target]});
  assert.deepEqual(guide.update(car,target,player.delivery.level,100),{waypoint:null,status:'unavailable'});
  assert.equal(requests.length,1);
});

test('guidance leads off an overpass and replans on returning to ground',()=>{
  const {player,car,target}=fixture(),requests:GuidanceRequest[]=[],guide=new DeliveryGuidance(request=>requests.push(request));
  guide.update(car,target,player.delivery.level,0);
  const onDeck={...car,x:(OVERPASS.start+OVERPASS.end)/2,z:OVERPASS.z,yaw:-Math.PI/2,supportId:'overpass' as const};
  assert.deepEqual(guide.update(onDeck,target,player.delivery.level,100),{waypoint:{x:OVERPASS.end,z:OVERPASS.z},status:'overpass'});
  guide.receive({id:requests[0].id,path:[target]});
  assert.equal(guide.update({...onDeck,x:OVERPASS.end,supportId:'ground'},target,player.delivery.level,200).status,'routing');
  assert.equal(requests.length,2);
  guide.receive({id:requests[1].id,path:[{x:OVERPASS.end+20,z:OVERPASS.z}]});
  assert.equal(guide.update({...onDeck,x:OVERPASS.end,supportId:'ground'},target,player.delivery.level,300).status,'ready');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMERS, LEVELS, type Level } from '../shared/delivery';
import { addPlayer, createWorld, setDeliveryDestination, setDestination, step, type World } from '../shared/game';
import { DELIVERY_DESTINATION_SNAP, planNavigation } from '../shared/navigation';
import { HIGHWAY_ROUTE_IDS, ROUTES } from '../shared/traffic';

function driverAt(pose:{x:number;z:number;yaw:number},level:Level){
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,pose,{kind:'robovan'});
  world.entities=[car];world.pickups=[];
  player.delivery.level=level;player.delivery.cash=LEVELS[level].cash+22_500;
  return {world,player,car};
}
function onPeninsulaHighway(direction:0|1,z:number){
  const route=ROUTES[HIGHWAY_ROUTE_IDS[direction]];
  const index=route.findIndex((a,i)=>{
    const b=route[(i+1)%route.length];
    return a.x<0&&b.x<0&&(a.z-z)*(b.z-z)<=0&&a.z!==b.z;
  });
  assert.ok(index>=0,'a highway segment crosses the chosen latitude');
  const a=route[index],b=route[(index+1)%route.length],t=(z-a.z)/(b.z-a.z);
  return {x:a.x+t*(b.x-a.x),z,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))};
}
function finishTrip(world:World,car:ReturnType<typeof driverAt>['car'],maxSeconds:number){
  for(let tick=0;tick<maxSeconds*20&&car.autopilot;tick++){
    const before={x:car.x,z:car.z};step(world,new Map(),.05);
    assert.ok(Math.hypot(car.x-before.x,car.z-before.z)<4,'the car drives there rather than relocating');
  }
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(car.health,100,'the route does not hit a building or vehicle');
}

test('Street Pilot and Hyperloop reach the actual SFO delivery from either direction',()=>{
  const target=CUSTOMERS.find(customer=>customer.id==='landmark-sfo')!;
  for(const [direction,z,level] of [[0,500,2],[1,1300,2],[0,2550,4],[1,2550,3]] as const){
    for(const mode of ['road','intercity'] as const){
      const {world,player,car}=driverAt(onPeninsulaHighway(direction,z),level);
      player.delivery.order.stage='dropoff';player.delivery.order.customer=CUSTOMERS.indexOf(target);
      if(mode==='intercity'){
        assert.equal(setDeliveryDestination(world,'driver',mode),false,'the upgrade is required');
        car.upgrades.autonomyIntercity=true;
      }
      assert.equal(setDeliveryDestination(world,'driver',mode),true,`${mode} finds a connected SFO route`);
      assert.ok(Math.hypot(car.navigation!.destination.x-target.x,car.navigation!.destination.z-target.z)<DELIVERY_DESTINATION_SNAP);
      finishTrip(world,car,400);
      assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<9,'the vehicle reaches the delivery marker');
      assert.equal(player.delivery.completed,1,'the delivery actually completes');
    }
  }
});

test('an upgraded route can make a checked approach to supported ground beside the highway',()=>{
  const lane=ROUTES[HIGHWAY_ROUTE_IDS[0]],a=lane[3],b=lane[4],next=lane[5];
  const {world,car}=driverAt({x:a.x,z:a.z,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))},6);
  const dx=next.x-b.x,dz=next.z-b.z,length=Math.hypot(dx,dz),offset=-50;
  const target={x:b.x+dz/length*offset,z:b.z-dx/length*offset};
  assert.equal(planNavigation(car,target,6,DELIVERY_DESTINATION_SNAP),null,'street routes do not snap to a distant marker');
  const route=planNavigation(car,target,6,DELIVERY_DESTINATION_SNAP,true);
  assert.ok(route?.exit,'the upgraded route includes a checked departure');
  assert.ok(route.path.some(point=>Math.hypot(point.x-route.exit!.x,point.z-route.exit!.z)<.1),'the departure survives path simplification');
  car.navigation={...route,mode:'intercity'};car.autopilot=true;
  finishTrip(world,car,300);
  assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<9);
});

test('the nearer opposite lane does not send a southbound delivery around the Bay',()=>{
  const target=CUSTOMERS.find(customer=>customer.id==='landmark-sfo')!;
  const {player,world,car}=driverAt(onPeninsulaHighway(0,500),2);
  player.delivery.order.stage='dropoff';player.delivery.order.customer=CUSTOMERS.indexOf(target);
  car.upgrades.autonomyIntercity=true;
  assert.equal(setDeliveryDestination(world,'driver','intercity'),true);
  const length=car.navigation!.path.reduce((total,point,index,path)=>{
    const previous=index?path[index-1]:car;
    return total+Math.hypot(point.x-previous.x,point.z-previous.z);
  },0);
  assert.ok(length<1300,`the local SFO trip takes the southbound lane (${length.toFixed(0)} m)`);
  finishTrip(world,car,200);
  assert.equal(player.delivery.completed,1);
});

test('Hyperloop drives complete intercity deliveries in both directions across the Bay',()=>{
  const cases=[
    {pose:{x:-177,z:57,yaw:Math.PI/2},id:'landmark-san-jose-city-hall'},
    {pose:{x:1700,z:8740,yaw:0},id:'poly'},
  ];
  for(const {pose,id} of cases){
    const {world,player,car}=driverAt(pose,6),target=CUSTOMERS.find(customer=>customer.id===id)!;
    player.delivery.order.stage='dropoff';player.delivery.order.customer=CUSTOMERS.indexOf(target);
    car.upgrades.autonomyIntercity=true;
    assert.equal(setDeliveryDestination(world,'driver','intercity'),true,`${id}: a connected route is found`);
    finishTrip(world,car,900);
    assert.ok(Math.hypot(car.x-target.x,car.z-target.z)<9,id);
    assert.equal(player.delivery.completed,1,`${id}: delivery completes`);
  }
});

test('checked delivery exits still reject buildings, locked regions and water',()=>{
  const {world,player,car}=driverAt(onPeninsulaHighway(1,2400),2);
  car.upgrades.autonomyIntercity=true;
  assert.equal(planNavigation(car,{x:-740,z:1200},2,DELIVERY_DESTINATION_SNAP,true),null,'the solid SFO tower is not an endpoint');
  assert.equal(planNavigation(car,{x:1705,z:8730},2,DELIVERY_DESTINATION_SNAP,true),null,'San Jose remains locked');
  assert.equal(planNavigation(car,{x:180,z:-300},2,DELIVERY_DESTINATION_SNAP,true),null,'open water has no route');
  assert.equal(planNavigation(car,{x:0,z:-1400},2,DELIVERY_DESTINATION_SNAP,true),null,'the disconnected island cannot be reached');
  const target=CUSTOMERS.find(customer=>customer.id==='landmark-sfo')!;
  assert.equal(setDestination(world,'driver',target,'intercity'),true,'map pins still use lane snapping');
  assert.equal(car.navigation?.exit,undefined);
  assert.ok(Math.hypot(car.navigation!.destination.x-target.x,car.navigation!.destination.z-target.z)>DELIVERY_DESTINATION_SNAP);
  assert.equal(player.delivery.level,2);
});

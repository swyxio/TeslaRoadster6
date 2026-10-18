import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceDeliverySearch, applyDeliveryStop, CUSTOMERS, initialDelivery, isOrderAccessible, LEVELS, RESTAURANTS, requiredLevelAt, rerouteInaccessibleOrder, updateDelivery, updateLevel, type DeliveryState, type DeliveryStop, type Level, type Order } from '../shared/delivery';
import { createDeliveryScheduler, DELIVERY_MAX_PICKUP_DISTANCE, DELIVERY_MAX_TRIP_DISTANCE, DELIVERY_SEARCH_CANDIDATES_PER_STEP, DELIVERY_SEARCH_PAIRS_PER_STEP, DELIVERY_SEARCH_PLANS_PER_STEP } from '../shared/delivery-scheduler';
import { addPlayer, createWorld, NEUTRAL } from '../shared/game';
import { isSurface, terrainHeight } from '../shared/map';
import { nearestNavigationAnchor } from '../shared/navigation';

const choose=createDeliveryScheduler(RESTAURANTS,CUSTOMERS,requiredLevelAt);
const metres=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function order(choice:{restaurant:number;customer:number}):Order {
  return {...choice,stage:'dropoff',elapsed:0,pickupEstimate:20,estimate:30,base:100};
}
function finishSearch(delivery:DeliveryState,canFly=false){
  for(let i=0;i<10_000&&delivery.order.search;i++)advanceDeliverySearch(delivery,canFly);
  assert.equal(delivery.order.search,undefined,'the bounded search eventually finishes');
}
test('assignment is deterministic, bounded, avoids consecutive venues, and introduces Oakland',()=>{
  let origin={x:0,z:-180},previous=order({restaurant:0,customer:2});
  const first=choose(1,origin,1,false,previous),again=choose(1,origin,1,false,previous);
  assert.deepEqual(first,again);assert.ok(first);
  const second=choose(2,origin,1,false,previous);assert.ok(second);
  assert.equal(requiredLevelAt(CUSTOMERS[second.customer].x,CUSTOMERS[second.customer].z),1,'the second eligible order introduces the new region');
  for(let completed=1;completed<=20;completed++){
    const next=choose(completed,origin,1,false,previous);assert.ok(next,`assignment ${completed}`);
    assert.notEqual(next.restaurant,previous.restaurant);assert.notEqual(next.customer,previous.customer);
    const pickup=RESTAURANTS[next.restaurant],dropoff=CUSTOMERS[next.customer];
    assert.ok(metres(origin,pickup)<=DELIVERY_MAX_PICKUP_DISTANCE);
    assert.ok(metres(pickup,dropoff)<=DELIVERY_MAX_TRIP_DISTANCE);
    assert.ok(requiredLevelAt(pickup.x,pickup.z)<=1&&requiredLevelAt(dropoff.x,dropoff.z)<=1);
    assert.equal(dropoff.rooftop,false,'a car without rockets never receives a rooftop');
    previous=order(next);origin=dropoff;
  }
});

test('a preferred rooftop may fall back to a reachable ground job when none is nearby',()=>{
  const tinyCustomers=CUSTOMERS.filter(c=>!c.rooftop);
  const groundOnly=createDeliveryScheduler(RESTAURANTS,tinyCustomers,requiredLevelAt);
  const choice=groundOnly(1,{x:0,z:-180},1 as Level,true);
  assert.ok(choice);assert.equal(tinyCustomers[choice.customer].rooftop,false);
});

test('unlocking an area keeps the active order and introduces it in the next two assignments',()=>{
  const delivery=initialDelivery({x:0,z:-180}),active={...delivery.order};
  delivery.cash=LEVELS[1].cash;updateLevel(delivery);
  assert.equal(rerouteInaccessibleOrder(delivery,{x:0,z:-180}),false);
  assert.deepEqual(delivery.order,active);
  let previous=order(active),origin={x:0,z:-180},introduced=false;
  for(let completed=1;completed<=2;completed++){
    const next=choose(completed,origin,delivery.level,false,previous);assert.ok(next);
    const dropoff=CUSTOMERS[next.customer];
    introduced ||= requiredLevelAt(dropoff.x,dropoff.z)===1;
    previous=order(next);origin=dropoff;
  }
  assert.equal(introduced,true);
});

test('orders remain available from a rooftop, an off-road pose, an access boundary, and a road',()=>{
  const roof=CUSTOMERS.findIndex(c=>c.rooftop),roofPoint=CUSTOMERS[roof];
  const samples=[
    {name:'roof',origin:{x:roofPoint.x,z:roofPoint.z,supportId:'roof:0' as const},level:1 as Level,canFly:true,previous:order({restaurant:0,customer:roof})},
    {name:'off-road',origin:{x:-330,z:120,supportId:'ground' as const},level:1 as Level,canFly:false,previous:order({restaurant:0,customer:2})},
    {name:'locked boundary',origin:{x:109,z:60,supportId:'ground' as const},level:0 as Level,canFly:false,previous:order({restaurant:0,customer:2})},
    {name:'road',origin:{x:-120,z:60,supportId:'ground' as const},level:1 as Level,canFly:false,previous:order({restaurant:0,customer:2})},
  ];
  for(const sample of samples){
    const next=choose(4,sample.origin,sample.level,sample.canFly,sample.previous);assert.ok(next,sample.name);
    const pickup=RESTAURANTS[next.restaurant],dropoff=CUSTOMERS[next.customer];
    assert.ok(metres(sample.origin,pickup)<=DELIVERY_MAX_PICKUP_DISTANCE,sample.name);
    assert.ok(requiredLevelAt(pickup.x,pickup.z)<=sample.level,sample.name);
    assert.ok(requiredLevelAt(dropoff.x,dropoff.z)<=sample.level,sample.name);
    if(!sample.canFly)assert.equal(dropoff.rooftop,false,sample.name);
  }
});

test('relocking a collected order preserves the stage and cannot pay pickup twice',()=>{
  const delivery=initialDelivery({x:-120,z:60});
  delivery.cash=0;delivery.level=0;delivery.completed=2;
  delivery.order={...delivery.order,customer:4,stage:'dropoff',elapsed:12,base:1000};
  const cash=delivery.cash;
  assert.equal(rerouteInaccessibleOrder(delivery,{x:-120,z:60},false),true);
  finishSearch(delivery);
  assert.equal(delivery.order.stage,'dropoff');assert.equal(delivery.order.elapsed,12);
  const pickup=RESTAURANTS[delivery.order.restaurant],dropoff=CUSTOMERS[delivery.order.customer];
  const pose=(point:{x:number;z:number}):DeliveryStop=>({x:point.x,z:point.z,y:terrainHeight(point.x,point.z)!,vy:0,speed:0,supportId:'ground',kind:'model-3',canFly:false});
  assert.equal(applyDeliveryStop(delivery,pose(pickup)),undefined);
  assert.equal(delivery.cash,cash);assert.equal(delivery.order.stage,'dropoff');
  assert.ok(applyDeliveryStop(delivery,pose(dropoff)));
  const paid=delivery.cash;assert.equal(delivery.completed,3);
  applyDeliveryStop(delivery,pose(dropoff));
  assert.equal(delivery.cash,paid);assert.equal(delivery.completed,3);
});

test('a relocked job at the far end of the playground is assigned on the mainland',()=>{
  for(const origin of [{x:600,z:-2050},{x:-350,z:-2000},{x:0,z:-600,supportId:'ferry' as const}]){
    const delivery=initialDelivery({x:-120,z:60});
    delivery.level=0;delivery.order={...delivery.order,customer:4,stage:'dropoff',elapsed:12};
    assert.equal(rerouteInaccessibleOrder(delivery,origin),true,JSON.stringify(origin));
    finishSearch(delivery);
    assert.equal(delivery.order.stage,'dropoff');assert.equal(delivery.order.elapsed,12);
    assert.equal(delivery.lastReroute?.reason,'ferry');
    for(const place of [RESTAURANTS[delivery.order.restaurant],CUSTOMERS[delivery.order.customer]])
      assert.equal(requiredLevelAt(place.x,place.z),0);
  }
});

test('a remote airborne driver can receive an open job without a road at their position',()=>{
  const delivery=initialDelivery({x:0,z:0});
  delivery.level=0;delivery.order={...delivery.order,customer:4,stage:'dropoff',elapsed:12};
  assert.equal(rerouteInaccessibleOrder(delivery,{x:-1700,z:-1600,supportId:null},true),true);
  finishSearch(delivery,true);
  assert.equal(delivery.order.stage,'dropoff');
  for(const place of [RESTAURANTS[delivery.order.restaurant],CUSTOMERS[delivery.order.customer]])
    assert.equal(requiredLevelAt(place.x,place.z),0);
});

test('an unavailable relock preserves and pauses the job until an open-road retry',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  const delivery=player.delivery;
  delivery.level=0;delivery.order={...delivery.order,customer:4,stage:'dropoff',elapsed:12};
  const original={...delivery.order};
  // An isolated synthetic origin makes the scheduler return no safe pair.
  assert.equal(rerouteInaccessibleOrder(delivery,{x:0,z:1e9}),true);
  assert.equal(delivery.lastReroute?.reason,'searching');finishSearch(delivery);
  assert.deepEqual(delivery.order,original);assert.equal(delivery.lastReroute?.reason,'unavailable');
  assert.equal(isOrderAccessible(delivery.order,delivery.level,false),false);
  const notice=delivery.lastReroute?.id;
  assert.equal(rerouteInaccessibleOrder(delivery,{x:0,z:1e9}),false);
  assert.equal(delivery.lastReroute?.id,notice,'repeated failures do not spam notices');
  updateDelivery(world,player,car,{...NEUTRAL,throttle:1},1);
  assert.equal(delivery.order.elapsed,12,'the unavailable job clock stays paused');
  assert.equal(rerouteInaccessibleOrder(delivery,{x:-120,z:60}),true);
  finishSearch(delivery);
  assert.equal(delivery.order.stage,'dropoff');assert.equal(delivery.order.elapsed,12);
  assert.equal(isOrderAccessible(delivery.order,delivery.level,false),true);
  assert.notEqual(delivery.lastReroute?.reason,'unavailable');
});


test('a disconnected catalog resumes candidate and route work without dropping pairs',()=>{
  const pickups=RESTAURANTS.filter(place=>place.cityId==='fremont');
  const origin=CUSTOMERS.find(place=>place.cityId==='fremont'&&!place.rooftop)!;
  const destinations:{id:string;x:number;z:number;rooftop:boolean}[]=[];
  for(let x=origin.x-300;x<=origin.x+300&&destinations.length<60;x+=17){
    for(let z=origin.z-300;z<=origin.z+300&&destinations.length<60;z+=19){
      const point={x,z};
      if(isSurface(x,z)&&requiredLevelAt(x,z)===5&&metres(point,pickups[0])>=60&&
        (nearestNavigationAnchor(point,5)?.distance??0)>7)destinations.push({id:`offroad-${destinations.length}`,x,z,rooftop:false});
    }
  }
  assert.equal(destinations.length,60);
  const select=createDeliveryScheduler(pickups,destinations,requiredLevelAt);
  let result=select.advance(2,origin,5,false,undefined),steps=0,scans=0;
  for(;;){
    assert.ok(result.scans<=DELIVERY_SEARCH_CANDIDATES_PER_STEP);
    assert.ok(result.plans<=DELIVERY_SEARCH_PLANS_PER_STEP);
    assert.ok(result.pairs<=DELIVERY_SEARCH_PAIRS_PER_STEP);
    scans+=result.scans;steps++;
    if(result.status!=='pending')break;
    assert.ok(steps<1_000,'the search progresses');
    result=select.advance(2,origin,5,false,undefined,result.cursor);
  }
  assert.ok(scans>DELIVERY_SEARCH_CANDIDATES_PER_STEP,'candidate construction crossed a batch boundary');
  assert.equal(result.status,'none','every disconnected destination was considered');
});

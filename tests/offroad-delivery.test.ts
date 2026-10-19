import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceDeliverySearch, CUSTOMERS, initialDelivery, LEVELS, RESTAURANTS, requiredLevelAt, rerouteInaccessibleOrder } from '../shared/delivery';
import { createDeliveryScheduler, DELIVERY_SEARCH_CANDIDATES_PER_STEP, DELIVERY_SEARCH_PAIRS_PER_STEP, DELIVERY_SEARCH_PLANS_PER_STEP, DELIVERY_SEARCH_VERSION } from '../shared/delivery-scheduler';
import { addPlayer, createEmptyWorld, NEUTRAL, setDeliveryDestination, step } from '../shared/game';
import { nearbyBuildings } from '../shared/map';
import { DELIVERY_DESTINATION_SNAP, nearestNavigationAnchor, planNavigation } from '../shared/navigation';

for(const {kind,completed,priorRestaurant,pickupId} of [
  {kind:'model-3',completed:5,priorRestaurant:0,pickupId:'south-san-francisco-la-guera'},
  {kind:'roadster',completed:5,priorRestaurant:0,pickupId:'south-san-francisco-la-guera'},
  {kind:'model-3',completed:18,priorRestaurant:RESTAURANTS.findIndex(place=>place.id==='south-san-francisco-la-guera'),pickupId:'south-san-francisco-maxs'},
] as const)test(`a ${kind} Street Pilot driver completes an off-lane delivery and starts the next pickup after ${completed} deliveries`,()=>{
  const previous=CUSTOMERS.findIndex(place=>place.id==='customer-south-san-francisco-10');
  const target=CUSTOMERS.findIndex(place=>place.id==='customer-south-san-francisco-11');
  assert.ok(previous>=0&&target>=0);
  const location=CUSTOMERS[target];
  assert.ok((nearestNavigationAnchor(location,2)?.distance??0)>DELIVERY_DESTINATION_SNAP);

  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind,x:CUSTOMERS[previous].x,z:CUSTOMERS[previous].z,
    y:0,yaw:Math.PI/2,speed:0,supportId:'ground'});
  player.delivery.cash=LEVELS[2].cash+2_500;player.delivery.level=2;player.delivery.completed=completed;
  player.delivery.order={...player.delivery.order,restaurant:priorRestaurant,customer:previous,stage:'dropoff'};
  world.pickups=[];
  step(world,new Map(),.05);
  assert.equal(player.delivery.completed,completed+1);
  for(let i=0;i<10_000&&player.delivery.order.search;i++)step(world,new Map(),.05);
  assert.equal(player.delivery.order.search,undefined,'bounded assignment finishes');
  assert.equal(player.delivery.order.stage,'pickup');
  assert.equal(CUSTOMERS[player.delivery.order.customer].id,location.id,'the actual catalog assigns the off-lane stop');
  assert.equal(RESTAURANTS[player.delivery.order.restaurant].id,pickupId);
  assert.equal(car.upgrades.autonomyIntercity,false,'no paid tier is required');

  function drive(label:string){
    assert.equal(setDeliveryDestination(world,'driver','road'),true,`${label} route is available`);
    for(let i=0;i<12_000&&car.autopilot;i++){
      const before={x:car.x,z:car.z};
      world.entities=[car];step(world,new Map(),.05);
      assert.ok(Math.hypot(car.x-before.x,car.z-before.z)<4,`${label}: no relocation`);
    }
    assert.equal(car.navigation?.status,'arrived',`${label} arrives`);
    assert.equal(car.health,100,`${label} avoids collisions`);
  }
  drive('pickup');
  assert.equal(player.delivery.order.stage,'dropoff');
  assert.equal(setDeliveryDestination(world,'driver','road'),true);
  assert.ok(car.navigation?.exit,'the route includes a checked departure');
  assert.deepEqual(car.navigation?.destination,{x:location.x,z:location.z});
  for(let i=0;i<12_000&&car.autopilot;i++){
    const before={x:car.x,z:car.z};
    world.entities=[car];step(world,new Map(),.05);
    assert.ok(Math.hypot(car.x-before.x,car.z-before.z)<4,'delivery: no relocation');
  }
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(player.delivery.completed,completed+2,'the delivery actually pays and completes');
  assert.equal(car.health,100);
  for(let i=0;i<10_000&&player.delivery.order.search;i++)step(world,new Map(),.05);
  assert.equal(player.delivery.order.search,undefined,'the next bounded assignment finishes');
  assert.equal(player.delivery.order.stage,'pickup');
  if(completed===18)assert.notEqual(RESTAURANTS[player.delivery.order.restaurant].id,'south-san-francisco-la-guera',
    'the inaccessible pickup from the actual off-lane origin is not assigned');
  drive('next pickup');
  assert.equal(player.delivery.order.stage,'dropoff','the follow-on pickup is actually collected');
});

test('off-lane departure chooses the same checked route at multiple headings',()=>{
  const location=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  const pickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-hidden-spot')!;
  assert.ok(nearbyBuildings(location.x,location.z,20).some(building=>
    Math.hypot(Math.max(0,Math.abs(location.x-building.x)-building.w/2),
      Math.max(0,Math.abs(location.z-building.z)-building.d/2))<20),'a solid building is near the join');
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:location.x,z:location.z,y:0,speed:0,supportId:'ground'});
  let expected:unknown;
  for(let i=0;i<16;i++){
    car.yaw=i*Math.PI/8;
    const route=planNavigation(car,pickup,2,DELIVERY_DESTINATION_SNAP,true);
    assert.ok(route,`heading ${i} has a route`);
    assert.ok(route.join,'the route joins a lane from the actual stop');
    if(i===0)expected=route.path;
    else assert.deepEqual(route.path,expected,`heading ${i} selects the same route`);
  }
});

for(const kind of ['model-3','roadster','tesla-semi'] as const)for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2,1.813562302317017])
test(`${kind} drives from the off-lane stop to the follow-on pickup at heading ${yaw.toFixed(2)}`,()=>{
  const location=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  const pickup=RESTAURANTS.findIndex(place=>place.id==='south-san-francisco-hidden-spot');
  const world=createEmptyWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind,x:location.x,z:location.z,y:0,yaw,speed:0,supportId:'ground'});
  player.delivery.cash=LEVELS[2].cash+2_500;player.delivery.level=2;
  player.delivery.order={...player.delivery.order,restaurant:pickup,stage:'pickup'};
  world.pickups=[];world.entities=[car];
  assert.equal(setDeliveryDestination(world,'driver','road'),true,'a checked route starts');
  for(let i=0;i<12_000&&car.autopilot;i++)step(world,new Map(),.05);
  assert.equal(car.navigation?.status,'arrived');
  assert.equal(player.delivery.order.stage,'dropoff');
  assert.equal(car.health,100);
});

test('a blocked off-lane origin is checked from the car, without retrying equivalent headings',()=>{
  const origin={x:-529.8766,z:918,supportId:'ground' as const};
  const pickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-la-guera')!;
  const target={...CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!,x:-500,z:1100};
  const choose=createDeliveryScheduler([pickup],[target],requiredLevelAt);
  let result=choose.advance(20,origin,2,false,undefined),plans=0;
  for(let i=0;;i++){
    assert.ok(i<100,'the search advances');
    assert.ok(result.scans<=DELIVERY_SEARCH_CANDIDATES_PER_STEP);
    assert.ok(result.pairs<=DELIVERY_SEARCH_PAIRS_PER_STEP);
    assert.ok(result.plans<=DELIVERY_SEARCH_PLANS_PER_STEP);
    plans+=result.plans;
    if(result.status!=='pending')break;
    result=choose.advance(20,origin,2,false,undefined,structuredClone(result.cursor));
  }
  assert.equal(result.status,'none','the otherwise anchored pickup is not reachable from this origin');
  assert.equal(plans,1,'a checked off-road start is independent of its synthetic heading');
});

test('a ground reroute from a rooftop order checks the pickup from the actual origin',()=>{
  const origin={x:-529.8766,z:918,supportId:'ground' as const};
  const roof=CUSTOMERS.findIndex(place=>place.id==='roof-sf--78--90');
  assert.ok(roof>=0);
  const delivery=initialDelivery(origin);
  delivery.level=2;delivery.completed=5;
  delivery.order={...delivery.order,restaurant:0,customer:roof,stage:'pickup'};
  assert.equal(rerouteInaccessibleOrder(delivery,origin,false),true);
  for(let i=0;delivery.order.search;i++){
    assert.ok(i<10_000,'the search advances');
    advanceDeliverySearch(delivery,false);
  }
  assert.notEqual(delivery.lastReroute?.reason,'unavailable','a safe alternative is available');
  const pickup=RESTAURANTS[delivery.order.restaurant];
  assert.ok(planNavigation({...origin,yaw:0,kind:'model-3',inDome:false},pickup,2,DELIVERY_DESTINATION_SNAP,true),
    'the selected pickup is reachable from the ground pose');
});

test('a pending old search restarts before trusting a previously checked pickup',()=>{
  const origin={x:-529.865,z:918,supportId:'ground' as const};
  const pickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-la-guera')!;
  const target=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  const vehicle={...origin,yaw:0,kind:'model-3' as const,inDome:false};
  assert.equal(planNavigation(vehicle,pickup,2,DELIVERY_DESTINATION_SNAP,true),null,'the new first leg is blocked');
  assert.ok(planNavigation({...vehicle,x:pickup.x,z:pickup.z},target,2,DELIVERY_DESTINATION_SNAP,true),
    'the dropoff leg alone would succeed if the stale cursor skipped pickup validation');
  for(const cursor of [{pair:0,leg:1 as const,heading:0},{pair:0,leg:1 as const,heading:0,version:0}]){
    const choose=createDeliveryScheduler([pickup],[target],requiredLevelAt);
    let result=choose.advance(20,origin,2,false,undefined,structuredClone(cursor));
    for(let i=0;result.status==='pending';i++){
      assert.ok(i<100,'the search advances');
      result=choose.advance(20,origin,2,false,undefined,structuredClone(result.cursor));
    }
    assert.equal(result.status,'none','the obsolete leg-one cursor did not skip the new pickup check');
  }
});

test('a current search cursor survives preparation after eviction',()=>{
  const location=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  const origin={x:location.x+.0123456,z:location.z,supportId:'ground' as const};
  const previous={restaurant:RESTAURANTS.findIndex(place=>place.id==='south-san-francisco-maxs'),customer:CUSTOMERS.indexOf(location)};
  const cursor={pair:5,leg:1 as const,heading:1,version:DELIVERY_SEARCH_VERSION};
  const restarted=createDeliveryScheduler(RESTAURANTS,CUSTOMERS,requiredLevelAt).advance(20,origin,2,false,previous,cursor);
  assert.equal(restarted.status,'pending');
  if(restarted.status==='pending')assert.deepEqual(restarted.cursor,cursor,'rebuilding candidates preserves current-version progress');
});

test('the off-lane stop is physically reachable with manual controls',()=>{
  const target=CUSTOMERS.findIndex(place=>place.id==='customer-south-san-francisco-11');
  const location=CUSTOMERS[target],world=createEmptyWorld(),player=addPlayer(world,'manual','Manual');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:location.x+16,z:location.z,y:0,yaw:Math.PI/2,speed:0,supportId:'ground'});
  player.delivery.level=2;player.delivery.cash=LEVELS[2].cash+2_500;
  player.delivery.order={...player.delivery.order,customer:target,stage:'dropoff'};
  world.pickups=[];
  for(let i=0;i<400&&player.delivery.completed===0;i++){
    world.entities=[car];step(world,new Map([['manual',{...NEUTRAL,throttle:.1}]]),.05);
  }
  assert.equal(player.delivery.completed,1);
  assert.ok(car.x<location.x+10,'the car drove into the marker');
  assert.equal(car.health,100);
});

test('checked off-lane assignment remains bounded and rejects unsafe locations',()=>{
  const pickup=RESTAURANTS.find(place=>place.id==='south-san-francisco-la-guera')!;
  const target=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-11')!;
  const origin=CUSTOMERS.find(place=>place.id==='customer-south-san-francisco-10')!;
  const select=(customer:typeof target)=>{
    const choose=createDeliveryScheduler([pickup],[customer],requiredLevelAt);
    let result=choose.advance(6,origin,2,false,undefined);
    for(let i=0;result.status==='pending';i++){
      assert.ok(i<100,'the search advances');
      assert.ok(result.scans<=DELIVERY_SEARCH_CANDIDATES_PER_STEP);
      assert.ok(result.pairs<=DELIVERY_SEARCH_PAIRS_PER_STEP);
      assert.ok(result.plans<=DELIVERY_SEARCH_PLANS_PER_STEP);
      result=choose.advance(6,origin,2,false,undefined,structuredClone(result.cursor));
    }
    assert.ok(result.scans<=DELIVERY_SEARCH_CANDIDATES_PER_STEP);
    assert.ok(result.pairs<=DELIVERY_SEARCH_PAIRS_PER_STEP);
    assert.ok(result.plans<=DELIVERY_SEARCH_PLANS_PER_STEP);
    return result.status;
  };
  assert.equal(select(target),'found');
  assert.equal(select({...target,id:'water',x:180,z:-300}),'none');
  assert.equal(select({...target,id:'building',x:-740,z:1200}),'none');
  assert.equal(select({...target,id:'locked',x:1705,z:8730}),'none');
});

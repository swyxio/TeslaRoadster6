import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,buyUpgrade,chooseVehicle,createWorld,interact,makeEntity,NEUTRAL,resetPlayer,step,travelDome} from '../shared/game';
import {ACCESS_BOUNDARIES,CUSTOMERS,LEVELS,orderTarget,requiredLevelAt,updateDelivery,updateLevel} from '../shared/delivery';
import {FERRY_DOCKS,ISLAND_TRACK,ROCKET_ISLAND} from '../shared/map';
import {ovalBankSurface} from '../shared/oval-bank';
import {PARKING_LOTS} from '../shared/parking-lots';
import {SHOPS} from '../shared/upgrades';
import {RACE_COURSES} from '../shared/race-courses';
import {ISLAND_CLIFF} from '../shared/island-stunts';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];return {world,player,car};
}
function completeGroundOrder(s:ReturnType<typeof setup>, late=false){
  const {world,player,car}=s;
  for(let i=0;player.delivery.order.search&&i<100;i++)updateDelivery(world,player,car,NEUTRAL,.05);
  assert.equal(player.delivery.order.search,undefined,'the next assignment becomes ready');
  const order=player.delivery.order;
  for(const stage of ['pickup','dropoff'] as const){
    const target=orderTarget(order);
    assert.equal(order.stage,stage);
    assert.equal(target.rooftop,false);
    Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
    order.elapsed=late?(stage==='pickup'?order.pickupEstimate:order.estimate*1.5):0;
    updateDelivery(world,player,car,NEUTRAL,.05);
  }
  return order;
}

test('current cash opens regions and new orders stay in accessible areas',()=>{
  for(const tier of [0,1,2,3] as const){
    const s=setup(),{player,car}=s;car.kind='model-3';
    player.delivery.cash=LEVELS[tier].cash;updateLevel(player.delivery);
    assert.equal(player.delivery.level,tier);
    completeGroundOrder(s,true);
    const target=CUSTOMERS[player.delivery.order.customer];
    assert.ok(requiredLevelAt(target.x,target.z)<=player.delivery.level);
  }
});

test('a workshop purchase can lower level without erasing lifetime earnings',()=>{
  const {player,world,car}=setup();car.kind='model-3';
  player.delivery.cash=LEVELS[1].cash+10;player.delivery.earned=12_000;updateLevel(player.delivery);
  Object.assign(car,{x:SHOPS[0].x,z:SHOPS[0].z,y:0,speed:0,vy:0,vx:0,vz:0,pushX:0,pushZ:0,supportId:'ground'});
  assert.ok(buyUpgrade(world,'p','armor'));
  assert.equal(player.delivery.level,0);assert.equal(player.delivery.earned,12_000);
});

test('simulation without economy hooks reroutes a collected order after a purchase lowers its level',()=>{
  const {world,player,car}=setup();car.kind='model-3';
  player.delivery.cash=LEVELS[1].cash+10;player.delivery.level=1;player.delivery.earned=700;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,elapsed:8};
  Object.assign(car,{x:SHOPS[0].x,z:SHOPS[0].z,y:0,speed:0,vy:0,vx:0,vz:0,pushX:0,pushZ:0,supportId:'ground'});
  assert.ok(buyUpgrade(world,'p','armor'));assert.equal(player.delivery.level,0);
  step(world,new Map(),.05);assert.ok(player.delivery.order.search,'a replacement is searched');
  for(let i=0;player.delivery.order.search&&i<100;i++)step(world,new Map(),.05);
  assert.equal(player.delivery.order.search,undefined,'the replacement completes');
  assert.equal(player.delivery.order.stage,'dropoff','the collected order remains collected');
  assert.equal(player.delivery.earned,700,'rerouting cannot pay another pickup bonus');
  assert.ok(requiredLevelAt(orderTarget(player.delivery.order).x,orderTarget(player.delivery.order).z)<=player.delivery.level);
});

test('simulation without economy hooks retries an unavailable order after reaching open ground',()=>{
  const {world,player,car}=setup();car.kind='model-3';
  player.delivery.cash=0;player.delivery.level=0;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:4,elapsed:8};
  player.delivery.lastReroute={id:1,reason:'unavailable',origin:{x:450,z:60},level:0};
  Object.assign(car,{x:450,z:60,y:0,speed:0,vy:0,supportId:'ground'});
  step(world,new Map(),.05);assert.equal(player.delivery.order.search,undefined,'closed ground does not restart a failed search');
  Object.assign(car,{x:-120,z:60,y:0,speed:0,vy:0,supportId:'ground'});
  step(world,new Map(),.05);assert.ok(player.delivery.order.search,'open ground starts a retry');
  for(let i=0;player.delivery.order.search&&i<100;i++)step(world,new Map(),.05);
  assert.equal(player.delivery.order.search,undefined);assert.equal(player.delivery.order.stage,'dropoff');
  assert.ok(requiredLevelAt(orderTarget(player.delivery.order).x,orderTarget(player.delivery.order).z)<=player.delivery.level);
});

test('a zero-payout delivery does not open a region; a later pickup can',()=>{
  const {world,player,car}=setup();car.kind='model-3';
  player.delivery.cash=LEVELS[1].cash-1;updateLevel(player.delivery);
  const target=CUSTOMERS[player.delivery.order.customer];player.delivery.order.stage='dropoff';player.delivery.order.elapsed=player.delivery.order.estimate*5;
  Object.assign(car,{x:target.x,z:target.z,y:0,speed:0,vy:0,supportId:'ground'});updateDelivery(world,player,car,NEUTRAL,.05);
  assert.equal(player.delivery.completed,1);assert.equal(player.delivery.level,0);
  for(let i=0;player.delivery.order.search&&i<100;i++)updateDelivery(world,player,car,NEUTRAL,.05);
  assert.equal(player.delivery.order.search,undefined,'the next assignment becomes ready');
  const pickup=orderTarget(player.delivery.order);Object.assign(car,{x:pickup.x,z:pickup.z,y:0});
  updateDelivery(world,player,car,NEUTRAL,.05);assert.equal(player.delivery.level,1);
});

test('level gates stop ground driving, jumps and the north approach while leaving NPCs and unlocked drivers free',()=>{
  const {world,player,car}=setup();
  Object.assign(car,{x:109.9,z:60,y:0,yaw:-Math.PI/2,speed:70,supportId:'ground'});
  step(world,new Map(),.05);assert.ok(car.x<=ACCESS_BOUNDARIES.oaklandX);assert.equal(player.delivery.lastBlocked?.level,1);assert.equal(car.health,100);
  Object.assign(car,{x:109.9,z:60,y:20,yaw:-Math.PI/2,speed:70,vx:70,vz:0,vy:0,supportId:null});
  step(world,new Map(),.05);assert.ok(car.x<=ACCESS_BOUNDARIES.oaklandX,'flight cannot bypass the bridge gate');
  Object.assign(car,{x:200,z:ACCESS_BOUNDARIES.islandNorthZ-.1,y:20,yaw:Math.PI,speed:70,vx:0,vz:70,vy:0,supportId:null});
  step(world,new Map(),.05);assert.ok(car.z<ACCESS_BOUNDARIES.islandNorthZ,'the northern corridor cannot enter Oakland');
  player.delivery.cash=LEVELS[1].cash;player.delivery.level=1;Object.assign(car,{x:109.9,z:60,y:0,yaw:-Math.PI/2,speed:70,vx:0,vz:0,supportId:'ground'});
  step(world,new Map(),.05);assert.ok(car.x>ACCESS_BOUNDARIES.oaklandX);
  const npc=makeEntity('npc','model-3',109.9,60);Object.assign(npc,{yaw:-Math.PI/2,speed:70,npc:true});world.entities=[npc];
  step(world,new Map(),.05);assert.ok(npc.x>ACCESS_BOUNDARIES.oaklandX,'NPC traffic is not restricted');
});

test('the island and its approach are open while the Oakland gates remain locked',()=>{
  for(const point of [...ROCKET_ISLAND.points,...ISLAND_TRACK])
    assert.equal(requiredLevelAt(point.x,point.z),0,`island at ${point.x},${point.z}`);
  assert.equal(requiredLevelAt(FERRY_DOCKS.island.x,FERRY_DOCKS.island.z),0);
  for(let z=FERRY_DOCKS.sf.z;z>=FERRY_DOCKS.island.z;z-=10)
    for(const x of [-7,0,7])assert.equal(requiredLevelAt(x,z),0,`ferry approach at ${x},${z}`);
  assert.equal(requiredLevelAt(600,FERRY_DOCKS.island.z-1),0,'air alongside the island');
  assert.equal(requiredLevelAt(600,FERRY_DOCKS.island.z+1),1,'northern water does not open Oakland');
  assert.equal(requiredLevelAt(111,60),1,'Bay Bridge remains locked');
  assert.equal(requiredLevelAt(200,ACCESS_BOUNDARIES.islandNorthZ+.1),1,'the island approach remains locked to the south');

  // Cross the old x=430 boundary on the banked oval in either direction,
  // then repeat in the air. All moves use a level-zero controlled car.
  for(const direction of [-1,1])for(const airborne of [false,true]){
    const {world,player,car}=setup(),x=ACCESS_BOUNDARIES.islandMaxX-direction*.1,z=-1338;
    const surface=ovalBankSurface(x,z);assert.ok(surface,'fixture lies on the banked oval');
    Object.assign(car,{x,z,y:airborne?30:surface.height,yaw:direction>0?-Math.PI/2:Math.PI/2,
      speed:12,vx:direction*12,vy:0,vz:0,supportId:airborne?null:'island-oval'});
    step(world,new Map(),.05);
    assert.ok(direction*(car.x-ACCESS_BOUNDARIES.islandMaxX)>0,`${airborne?'air':'oval'} direction ${direction}`);
    assert.equal(player.delivery.lastBlocked,null);
  }
});

test('the SF playground has a connected, bounded level-zero pocket for driving and walking',()=>{
  const lot=PARKING_LOTS.find(l=>l.id==='sf-playground')!,area=lot.area;
  for(const kind of ['car','person'] as const){
    const {world,player}=setup();
    if(kind==='person')interact(world,'p');
    const entity=world.entities.find(e=>e.id===player.entityId)!;
    assert.equal(entity.kind==='person',kind==='person');
    world.entities=[entity];
    Object.assign(entity,{x:area.x,z:ACCESS_BOUNDARIES.bayMaxZ-1,y:0,yaw:Math.PI,speed:0,vx:0,vy:0,vz:0,supportId:'ground'});
    for(let i=0;i<160&&entity.z<area.z-area.length/2+1;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.ok(entity.z>=area.z-area.length/2+1,`${kind} enters the lot`);
    Object.assign(entity,{yaw:0,speed:0,vx:0,vy:0,vz:0,pushX:0,pushZ:0});
    for(let i=0;i<160&&entity.z>=ACCESS_BOUNDARIES.bayMaxZ;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
    assert.ok(entity.z<ACCESS_BOUNDARIES.bayMaxZ,`${kind} returns to SF`);
    assert.equal(player.delivery.lastBlocked,null);
  }
  for(const [x,z,yaw,axis,limit,sign] of [
    [area.x-area.width/2+.1,area.z,Math.PI/2,'x',area.x-area.width/2,-1],
    [area.x+area.width/2-.1,area.z,-Math.PI/2,'x',area.x+area.width/2,1],
    [area.x,area.z+area.length/2-.1,Math.PI,'z',area.z+area.length/2,1],
  ] as const){
    const {world,player,car}=setup();
    Object.assign(car,{x,z,y:0,yaw,speed:12,vx:0,vy:0,vz:0,supportId:'ground'});
    step(world,new Map(),.05);
    assert.ok(sign*(car[axis]-limit)<=0,'the pocket does not bypass the Peninsula gate');
    assert.equal(player.delivery.lastBlocked?.level,2);
  }
});

test('Peninsula gates apply in the air and allow the next unlocked level',()=>{
  for(const [level,z,boundary] of [[1,299.9,ACCESS_BOUNDARIES.bayMaxZ],[5,6999.9,ACCESS_BOUNDARIES.cupertinoMinZ]] as const){
    const {world,player,car}=setup();player.delivery.cash=LEVELS[level].cash;player.delivery.level=level;
    Object.assign(car,{x:0,z,y:20,yaw:Math.PI,speed:70,vx:0,vz:70,vy:0,supportId:null});
    step(world,new Map(),.05);assert.ok(car.z<=boundary);assert.equal(player.delivery.lastBlocked?.level,level+1);
    player.delivery.level=(level+1) as 2|6;player.delivery.cash=LEVELS[player.delivery.level].cash;Object.assign(car,{speed:70,vx:0,vz:70,vy:0});
    step(world,new Map(),.05);assert.ok(car.z>boundary);
  }
});

test('an airborne car can slide and descend along a southbound progression gate',()=>{
  const {world,player,car}=setup();
  Object.assign(car,{x:-200,z:ACCESS_BOUNDARIES.bayMaxZ-.2,y:150,vx:8,vy:0,vz:30,air:0,supportId:null});
  step(world,new Map(),.05);
  assert.equal(player.delivery.lastBlocked?.level,2);
  assert.ok(car.z<=ACCESS_BOUNDARIES.bayMaxZ);
  assert.ok(car.x> -200,'movement along the boundary is preserved');
  assert.ok(car.y<150,'gravity is preserved');
});

test('vehicle takeover cannot transport a locked player through the gate; dome and reset remain open',()=>{
  const {world,player,car}=setup();
  assert.ok(travelDome(world,'p'));assert.equal(car.inDome,true);
  assert.ok(travelDome(world,'p'));assert.equal(car.inDome,false);assert.equal(requiredLevelAt(car.x,car.z),0);
  Object.assign(car,{x:109,z:60,speed:0,y:0,supportId:'ground'});interact(world,'p');
  const person=world.entities.find(e=>e.id===player.entityId)!;assert.equal(person.kind,'person');
  Object.assign(person,{x:109,z:60});const locked=makeEntity('locked-car','model-3',111,60);world.entities=[person,locked];
  interact(world,'p');assert.equal(player.entityId,person.id);
  player.delivery.level=1;interact(world,'p');assert.equal(player.entityId,locked.id);
  resetPlayer(world,'p');assert.equal(requiredLevelAt(locked.x,locked.z),0);
  assert.ok(chooseVehicle(world,'p','roadster'));assert.equal(requiredLevelAt(world.entities.find(e=>e.id===player.entityId)!.x,world.entities.find(e=>e.id===player.entityId)!.z),0);
});

test('a vehicle collision cannot push a locked player through the bridge boundary',()=>{
  const {world,player,car}=setup();
  Object.assign(car,{x:109.8,z:60,y:0,yaw:-Math.PI/2,speed:0,supportId:'ground'});
  const npc=makeEntity('pusher','model-3',107,60);npc.yaw=-Math.PI/2;world.entities=[npc,car];
  step(world,new Map(),.05);
  assert.ok(car.x<=ACCESS_BOUNDARIES.oaklandX);assert.equal(player.delivery.lastBlocked?.level,1);
});

test('the default Roadster starts with two ground deliveries',()=>{
  const s=setup();
  for(let i=0;i<2;i++)completeGroundOrder(s);
  assert.equal(s.player.delivery.completed,2);assert.ok(s.player.delivery.cash>0);
});


test('the entire Rocket Island and SF parking playground are open before progression unlocks',()=>{
  for(const point of [{x:800,z:-1700},{x:ISLAND_CLIFF.x,z:ISLAND_CLIFF.z},...RACE_COURSES.flatMap(c=>c.gates)])assert.equal(requiredLevelAt(point.x,point.z),0,`${point.x},${point.z}`);
  const lot=PARKING_LOTS.find(l=>l.id==='sf-playground')!;
  for(const point of [lot.area,lot.approach,...lot.stalls,{x:lot.approach.x,z:300}])assert.equal(requiredLevelAt(point.x,point.z),0,`${point.x},${point.z}`);
  assert.equal(requiredLevelAt(-200,340),2,'other Peninsula areas remain locked');
});

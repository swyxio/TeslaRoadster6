import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type World } from '../shared/game';
import { CUSTOMERS, RESTAURANTS, initialDelivery, orderTarget, payoutFor, pickupBonusFor, updateDelivery } from '../shared/delivery';
import { updateAchievements } from '../shared/achievements';
import { newPolice, updatePolice } from '../shared/police';
import { BUILDINGS, HILL, OVERPASS, STUNT_LOOP, STUNT_RAMP, buildingRoofHeight, domeRoofHeight, isSurface, nearbyBuildings, overpassHeight, rampHeight, terrainHeight } from '../shared/map';
import { DOME } from '../shared/dome';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];player.delivery.cash=0;return {world,player,car};
}
function tick(world:World,input=NEUTRAL,n=1){for(let i=0;i<n;i++)step(world,new Map([['p',input]]),.05);}
test('a fast first delivery pays a useful reward without immediately unlocking Oakland',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  const order=player.delivery.order;
  assert.equal(player.delivery.cash,2_500);
  assert.equal(order.base,600);
  const pickup=orderTarget(order);Object.assign(car,{x:pickup.x,z:pickup.z,y:0,speed:0,vy:0,supportId:'ground'});
  updateDelivery(world,player,car,NEUTRAL,0);
  assert.equal(player.delivery.cash,2_740);
  const dropoff=orderTarget(order);Object.assign(car,{x:dropoff.x,z:dropoff.z,y:0,speed:0,vy:0,supportId:'ground'});
  updateDelivery(world,player,car,NEUTRAL,0);
  updateAchievements(player,car,false,undefined,true);
  assert.equal(player.delivery.cash,4_290);
  assert.equal(player.delivery.lifetimeIncome,1_790);
  assert.equal(player.delivery.level,0);
  assert.ok(player.achievements.unlocked.includes('deliveries-1'));
  updateAchievements(player,car,false,undefined,true);
  assert.equal(player.delivery.cash,4_290,'the first-delivery award is one-off');
});
test('restaurant and fictional customer markers are on clear, reachable ground',()=>{
  for(const place of [...RESTAURANTS,...CUSTOMERS.filter(c=>!c.rooftop)]){
    assert.ok(isSurface(place.x,place.z),place.name);
    assert.ok(!nearbyBuildings(place.x,place.z,4).some(b=>Math.abs(place.x-b.x)<b.w/2+2&&Math.abs(place.z-b.z)<b.d/2+2),place.name);
  }
});
test('delivery pay keeps the fast bonus and late penalty until the 50% floor',()=>{
  const order={...initialDelivery({x:40,z:60}).order,base:600,estimate:100};
  assert.equal(payoutFor({...order,elapsed:0}),1_050);
  assert.equal(payoutFor({...order,elapsed:50}),825);
  assert.equal(payoutFor({...order,elapsed:100}),600);
  assert.equal(payoutFor({...order,elapsed:125}),500);
  assert.equal(payoutFor({...order,elapsed:175}),300);
  assert.equal(payoutFor({...order,elapsed:500}),300,'very late deliveries still pay');
});
test('the minimum fare rounds up for odd-dollar quotes',()=>{
  const order={...initialDelivery({x:40,z:60}).order,base:601,estimate:100};
  assert.equal(payoutFor({...order,elapsed:100}),601);
  assert.equal(payoutFor({...order,elapsed:125}),501);
  assert.equal(payoutFor({...order,elapsed:175}),301);
  assert.equal(payoutFor({...order,elapsed:500}),301);
});
test('pickup bonus decreases with active time and expires at the estimate',()=>{
  const order=initialDelivery({x:40,z:60}).order;
  const early=pickupBonusFor(order),later=pickupBonusFor({...order,elapsed:order.pickupEstimate/2});
  assert.ok(early>later&&later>0);assert.equal(pickupBonusFor({...order,elapsed:order.pickupEstimate}),0);
  assert.equal(pickupBonusFor({...order,elapsed:order.pickupEstimate*2}),0);
});
test('pickup time pauses while idle and a late pickup awards no bonus',()=>{
  const {world,player,car}=setup(),order=player.delivery.order;
  tick(world,{...NEUTRAL,steer:1},20);tick(world,NEUTRAL,160);
  const elapsed=order.elapsed;tick(world,NEUTRAL,100);assert.equal(order.elapsed,elapsed);
  order.elapsed=order.pickupEstimate+1;
  const target=orderTarget(order);Object.assign(car,{x:target.x,z:target.z,y:0,speed:0});tick(world);
  assert.equal(order.stage,'dropoff');assert.equal(player.delivery.cash,0);assert.equal(player.delivery.lastReward,null);
});
test('pickup and delivery require stopping on the ground; payment occurs exactly once',()=>{
  const {world,player,car}=setup(),order=player.delivery.order,restaurant=orderTarget(order);
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:10,speed:0,supportId:null});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{y:.8,vy:0,speed:0,supportId:null});tick(world);assert.equal(order.stage,'pickup','a low hover is not grounded');
  Object.assign(car,{y:0,vy:0,speed:10,supportId:'ground'});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:0,speed:0});tick(world);assert.equal(order.stage,'dropoff');
  const pickup=player.delivery.cash;assert.ok(pickup>0);assert.deepEqual(player.delivery.lastReward,{id:1,kind:'pickup',amount:pickup});
  const target=orderTarget(order);Object.assign(car,{x:target.x,z:target.z,speed:0});tick(world);
  assert.equal(player.delivery.completed,1);const payout=player.delivery.cash-pickup;assert.ok(payout>order.base);
  assert.deepEqual(player.delivery.lastReward,{id:2,kind:'delivery-research',amount:payout});
  assert.ok(player.achievements.unlocked.includes('deliveries-1'));
  tick(world,NEUTRAL,20);assert.equal(player.delivery.completed,1);assert.equal(player.delivery.cash,pickup+payout);assert.equal(player.delivery.lastReward?.id,2);
});
test('active clock and delivery estimate pause after inactivity; player scores are independent',()=>{
  const {world,player,car}=setup(),other=addPlayer(world,'other','Other');other.delivery.cash=0;
  const target=orderTarget(player.delivery.order);Object.assign(car,{x:target.x,z:target.z});tick(world);assert.equal(player.delivery.order.stage,'dropoff');
  tick(world,{...NEUTRAL,steer:1},20);const afterInput=player.delivery.activeSeconds;assert.ok(afterInput>.9);
  tick(world,NEUTRAL,160);const stopped=player.delivery.activeSeconds;assert.ok(stopped>=3.9&&stopped<4.1);
  tick(world,NEUTRAL,100);assert.equal(player.delivery.activeSeconds,stopped);assert.equal(player.delivery.order.elapsed,stopped);
  assert.equal(other.delivery.activeSeconds,0);assert.equal(other.delivery.cash,0);
});
test('police see nearby flight, chase, slow and ticket once; grace prevents instant repeat',()=>{
  const {world,player,car}=setup(),cop=makeEntity('police-test','model-3',0,0);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:0,z:30,y:10,vy:1,supportId:null});tick(world);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{x:0,z:6,y:0,vy:0,speed:10,supportId:'ground'});const before=car.speed;updatePolice(world,.05);assert.ok(car.speed<before);assert.equal(player.delivery.tickets,0);
  car.speed=1;updatePolice(world,.05);assert.ok(player.delivery.cash<=-60);assert.equal(player.delivery.cash,-player.delivery.lastTicket!.amount);assert.equal(player.delivery.tickets,1);assert.equal(cop.police.targetId,null);
  Object.assign(car,{y:10,vy:1,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,null);assert.equal(player.delivery.tickets,1);
});
test('police choose the nearest eligible flyer, preserving player order for ties',()=>{
  const {world,player,car}=setup(),second=addPlayer(world,'second','Second');
  const secondCar=world.entities.find(entity=>entity.id===second.entityId)!;
  const cop=makeEntity('police-test','model-3',0,0);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:0,z:20,y:10,supportId:null});
  Object.assign(secondCar,{x:0,z:-20,y:10,supportId:null});
  updatePolice(world,.05);assert.equal(cop.police.targetId,player.id);
  cop.police=newPolice();secondCar.z=-10;
  updatePolice(world,.05);assert.equal(cop.police.targetId,second.id);
  cop.police=newPolice();second.delivery.ticketGraceUntil=world.time+20;
  updatePolice(world,.05);assert.equal(cop.police.targetId,player.id);
});
test('police do not see grounded, distant or rooftop cars; an escaped chase expires',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,0);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:0,z:10,y:0});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  Object.assign(car,{x:0,z:200,y:10,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  const roof=BUILDINGS[0];Object.assign(cop,{x:roof.x,z:roof.z});Object.assign(car,{x:roof.x,z:roof.z,y:roof.h,supportId:'roof:0'});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  Object.assign(cop,{x:0,z:0});
  Object.assign(car,{x:0,z:10,y:10,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{x:0,z:200});world.time+=11;updatePolice(world,.05);assert.equal(cop.police.targetId,null);
});
test('police measure flight above curved landmark roofs at the current position',()=>{
  for(const shape of ['rotunda','coit'] as const){
    const roof=BUILDINGS.find(b=>b.style===shape)!;
    const x=roof.x+(shape==='rotunda'?roof.w*.45:0),z=roof.z;
    const height=buildingRoofHeight(roof,x,z);
    assert.ok(shape==='rotunda'?height<roof.h:height>roof.h,`${shape} exercises the curved roof`);
    const {world,player,car}=setup(),cop=makeEntity('cop','model-3',x,z);
    cop.police=newPolice();world.entities.push(cop);
    Object.assign(car,{x,z,y:height+2,supportId:null});
    world.time=.05;updatePolice(world,.05);
    assert.equal(cop.police.targetId,null,`${shape}: two meters above the roof is not detectable`);
    assert.ok(Math.abs(player.delivery.flight.peakHeight-2)<1e-8,`${shape}: flight height uses the visible roof`);
    car.y=height+4;world.time+=.05;updatePolice(world,.05);
    assert.equal(cop.police.targetId,player.id,`${shape}: four meters above the roof is detectable`);
  }
});
test('police do not use a landmark roof outside its footprint',()=>{
  const roof=BUILDINGS.find(b=>b.style==='rotunda')!;
  const x=roof.x+roof.w/2+1,z=roof.z;
  assert.ok(!nearbyBuildings(x,z,0).some(b=>Math.abs(x-b.x)<=b.w/2&&Math.abs(z-b.z)<=b.d/2));
  const {world,player,car}=setup(),cop=makeEntity('cop','model-3',x,z);
  cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x,z,y:roof.h+2,supportId:null});
  world.time=.05;updatePolice(world,.05);
  assert.equal(cop.police.targetId,player.id);
  assert.equal(player.delivery.flight.peakHeight,roof.h+2);
});
test('police measure exterior flight above the stadium roof without protecting it as arena interior',()=>{
  const {world,player,car}=setup(),x=DOME.x,z=DOME.z,height=domeRoofHeight(x,z)!;
  const cop=makeEntity('cop','model-3',x,z);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x,z,y:height+2,supportId:null,inDome:false});
  world.time=.05;updatePolice(world,.05);
  assert.equal(cop.police.targetId,null);
  assert.ok(Math.abs(player.delivery.flight.peakHeight-2)<1e-8);
  car.y=height+4;world.time+=.05;updatePolice(world,.05);
  assert.equal(cop.police.targetId,player.id,'outside flight is still detectable');
  car.inDome=true;world.time+=.05;updatePolice(world,.05);
  assert.equal(cop.police.targetId,null,'arena protection still ends a chase');
  assert.equal(player.delivery.flight.seconds,0);
});
test('a roof above the car does not count as the surface beneath it',()=>{
  const {world,player,car}=setup(),cop=makeEntity('cop','model-3',DOME.x,DOME.z);
  cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:DOME.x,z:DOME.z,y:10,supportId:null,inDome:false});
  world.time=.05;updatePolice(world,.05);
  assert.equal(cop.police.targetId,player.id);
  assert.equal(player.delivery.flight.peakHeight,10);
});
test('a chasing police car drives toward a target on an unobstructed street',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,60);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:0,z:15,y:20,vy:0,supportId:null});cop.yaw=0;tick(world);assert.equal(cop.police.targetId,'p');
  for(let i=0;i<80;i++){car.y=20;car.vy=0;tick(world);}
  assert.ok(cop.z<45,`police should advance: z=${cop.z}`);
});

test('police follow a turn instead of circling back to an intersection',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,60);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:-60,z:0,y:20,vy:0,supportId:null});cop.yaw=0;
  for(let i=0;i<210;i++){car.y=20;car.vy=0;tick(world);}
  assert.ok(Math.hypot(cop.x-car.x,cop.z-car.z)<20,`police should follow the corner: ${cop.x}, ${cop.z}`);
});

test('rooftop customers use flat physical roofs and require an actual landing',()=>{
  const {world,player,car}=setup();
  player.delivery.cash=10_000;player.delivery.level=1;car.tankLevel=3;
  for(const target of CUSTOMERS.filter(c=>c.rooftop)){
    assert.ok(BUILDINGS.some(b=>b.x===target.x&&b.z===target.z&&b.h===target.y&&b.style==='midrise'),target.name);
  }
  const customer=CUSTOMERS.findIndex(c=>c.rooftop),target=CUSTOMERS[customer];
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer};
  Object.assign(car,{x:target.x,z:target.z,y:0,speed:0,vy:0});
  // Direct update proves a car below the roof cannot collect the delivery.
  updateDelivery(world,player,car,NEUTRAL,.05);assert.equal(player.delivery.completed,0);
  Object.assign(car,{y:target.y+.03,vy:0,supportId:null});updateDelivery(world,player,car,NEUTRAL,.05);assert.equal(player.delivery.completed,0,'a near-roof hover is not a landing');
  Object.assign(car,{y:target.y+.03,vy:-5,supportId:null});updateDelivery(world,player,car,NEUTRAL,.05);assert.equal(player.delivery.completed,0);
  Object.assign(car,{x:target.x,z:target.z,y:target.y+2,speed:0,vy:-4,supportId:null});
  tick(world,NEUTRAL,20);
  assert.equal(car.y,target.y);assert.ok(car.supportId?.startsWith('roof:'));assert.equal(player.delivery.completed,1);
  assert.ok(player.achievements.unlocked.includes('roof-rider'));assert.ok(player.achievements.unlocked.includes('sky-delivery'));
});

test('eligible Roadster orders can be rooftop after Oakland unlock; ordinary cars receive ground orders',()=>{
  for(const kind of ['roadster','model-3'] as const){
    const {world,player,car}=setup();car.kind=kind;car.tankLevel=3;player.delivery.cash=10_000;player.delivery.level=1;player.delivery.earned=50;player.delivery.completed=6;
    const target=CUSTOMERS[player.delivery.order.customer];player.delivery.order.stage='dropoff';
    Object.assign(car,{x:target.x,z:target.z,y:0,speed:0,vy:0});tick(world,NEUTRAL,20);
    assert.equal(player.delivery.order.search,undefined);
    assert.equal(player.delivery.completed,7);assert.equal(CUSTOMERS[player.delivery.order.customer].rooftop,kind==='roadster');
  }
});

test('citations increase with flight duration, height and repeat offenses without double charging',()=>{
  function fine(seconds:number,height:number,prior:number){
    const {world,player,car}=setup(),cop=makeEntity('cop','model-3',0,0);cop.police=newPolice();world.entities.push(cop);
    player.delivery.tickets=prior;player.delivery.flight={seconds,peakHeight:height,lastAirborneAt:world.time};
    Object.assign(car,{x:0,z:6,y:0,speed:0});cop.police.targetId=player.id;cop.police.lastSeen=world.time;
    updatePolice(world,.05);const result=player.delivery.lastTicket!;
    assert.equal(player.delivery.tickets,prior+1);assert.equal(player.delivery.cash,-result.amount);assert.equal(result.offense,prior+1);
    updatePolice(world,.05);assert.equal(player.delivery.cash,-result.amount);return result;
  }
  const first=fine(2,10,0),long=fine(12,10,0),high=fine(2,50,0),repeat=fine(2,10,2);
  assert.ok(long.amount>first.amount);assert.ok(high.amount>first.amount);assert.equal(repeat.amount,first.amount+70);
});


test('flight above police sight ceiling continues to increase citation severity during a pursuit',()=>{
  const {world,player,car}=setup(),cop=makeEntity('cop','model-3',0,0);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:0,z:6,y:90,vy:0,supportId:null});world.time=.05;updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  car.y=50;world.time+=.05;updatePolice(world,.05);assert.equal(cop.police.targetId,player.id);
  car.y=2;world.time+=.05;updatePolice(world,.05);assert.ok(player.delivery.flight.seconds>=.15);
  car.y=90;for(let i=0;i<240;i++){world.time+=.05;updatePolice(world,.05);}
  assert.ok(player.delivery.flight.seconds>=12);assert.equal(player.delivery.flight.peakHeight,90);
  Object.assign(car,{y:0,vy:0,speed:0,supportId:'ground'});world.time+=.05;updatePolice(world,.05);
  assert.ok(player.delivery.lastTicket!.durationFine>=48);assert.equal(player.delivery.lastTicket!.heightFine,80);
});

test('supported stunt-loop and ramp travel is not police-detectable flight',()=>{
  const {world,player,car}=setup(),cop=makeEntity('cop','model-3',STUNT_LOOP.x,STUNT_LOOP.z);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:STUNT_LOOP.x,z:STUNT_LOOP.z,y:24,vy:3,loopAngle:Math.PI,supportId:'stunt-loop'});
  world.time=.05;updatePolice(world,.05);assert.equal(cop.police.targetId,null);assert.equal(player.delivery.flight.seconds,0);
  const x=STUNT_RAMP.end-1,z=STUNT_RAMP.z;Object.assign(cop,{x,z});
  Object.assign(car,{x,z,y:rampHeight(x,z),vy:2,loopAngle:null,supportId:'stunt-ramp'});
  world.time+=.05;updatePolice(world,.05);assert.equal(cop.police.targetId,null);assert.equal(player.delivery.flight.seconds,0);
});

test('police measure flight above local ground and can ticket on a hill',()=>{
  const {world,player,car}=setup(),x=(HILL.minX+HILL.maxX)/2,z=(HILL.minZ+HILL.maxZ)/2;
  const cop=makeEntity('police-hill','model-3',x+4,z);cop.police=newPolice();world.entities.push(cop);
  const ground=terrainHeight(x,z)!;Object.assign(car,{x,z,y:ground,speed:0,supportId:'ground'});
  updatePolice(world,.05);assert.equal(cop.police.targetId,null,'a supported hill is not flight');
  Object.assign(car,{y:ground+2,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,null,'height is relative to the hill');
  car.y=ground+4;updatePolice(world,.05);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{y:ground,supportId:'ground'});updatePolice(world,.05);
  assert.equal(player.delivery.tickets,1,'grounded drivers on the hill are eligible for a ticket');
  assert.equal(player.delivery.lastTicket?.peakHeight,4,'citation height is above local terrain');
});

test('police distinguish the elevated deck from ground and measure flight above it',()=>{
  const {world,player,car}=setup(),x=(OVERPASS.deckStart+OVERPASS.deckEnd)/2,z=OVERPASS.z;
  const cop=makeEntity('police-below','model-3',x,z);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x,z,y:OVERPASS.height,speed:10,supportId:'overpass'});
  updatePolice(world,.05);assert.equal(cop.police.targetId,null,'the upper deck is not flight');
  Object.assign(car,{y:OVERPASS.height+2,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  car.y=OVERPASS.height+4;updatePolice(world,.05);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{y:OVERPASS.height,supportId:'overpass',speed:10});updatePolice(world,.05);
  assert.equal(car.speed,10,'a car on the upper deck is not slowed from below');assert.equal(player.delivery.tickets,0);
});

test('pursuing police leave the overpass at either ramp before resuming ground routes',()=>{
  for(const direction of [1,-1]){
    const {world,player,car}=setup();
    Object.assign(car,{x:(OVERPASS.deckStart+OVERPASS.deckEnd)/2,z:OVERPASS.z,y:20,supportId:null});
    const cop=makeEntity('police-ramp','model-3',direction===1?OVERPASS.start-10:OVERPASS.end+10,OVERPASS.z);
    Object.assign(cop,{yaw:direction===1?-Math.PI/2:Math.PI/2,speed:20,npc:true,autopilot:true,police:newPolice()});
    cop.police!.targetId=player.id;world.entities.push(cop);let reachedDeck=false,leftDeck=false;
    for(let i=0;i<800;i++){
      Object.assign(car,{y:20,vy:0,supportId:null});tick(world);
      reachedDeck ||= cop.supportId==='overpass';
      if(reachedDeck&&cop.supportId==='ground'&&(direction===1?cop.x>OVERPASS.end:cop.x<OVERPASS.start)){leftDeck=true;break;}
    }
    assert.ok(reachedDeck,`cop did not enter ramp from direction ${direction}`);
    assert.ok(leftDeck,`cop stuck on ramp from direction ${direction}: ${cop.x}, ${cop.supportId}`);
  }
});

test('a chase expiring on the ramp returns the officer to a ground patrol',()=>{
  for(const direction of [1,-1]){
    const {world,player,car}=setup(),start=direction===1?OVERPASS.start+5:OVERPASS.end-5;
    Object.assign(car,{x:1000,z:1000,y:20,supportId:null});
    const cop=makeEntity('police-recovery','model-3',start,OVERPASS.z);
    Object.assign(cop,{y:8*5/90,supportId:'overpass',yaw:direction===1?-Math.PI/2:Math.PI/2,speed:10,npc:true,autopilot:true,police:newPolice()});
    cop.police!.targetId=player.id;world.entities.push(cop);let expiredOnDeck=false,rejoined=false;
    for(let i=0;i<2400;i++){
      Object.assign(car,{y:20,vy:0,supportId:null});tick(world);
      if(cop.police!.targetId===null&&cop.supportId==='overpass')expiredOnDeck=true;
      if(expiredOnDeck&&cop.supportId==='ground'&&cop.autopilot&&cop.police!.path.length===0){rejoined=true;break;}
    }
    assert.ok(expiredOnDeck,`pursuit did not expire on ramp from direction ${direction}`);
    assert.ok(rejoined,`cop failed to rejoin patrol from direction ${direction}: ${cop.x},${cop.z}, ${cop.supportId}`);
  }
});

test('a patrol leaving either end of the ramp rejoins without hitting the deck',()=>{
  for(const direction of [1,-1])for(const x of [OVERPASS.start+30,OVERPASS.deckStart+25,OVERPASS.deckEnd-25,OVERPASS.end-30]){
    const {world,player,car}=setup();world.time=11;
    Object.assign(car,{x:1000,z:1000,y:20,supportId:null});
    const cop=makeEntity('police-recovery','model-3',x,OVERPASS.z);
    Object.assign(cop,{y:overpassHeight(x,OVERPASS.z),supportId:'overpass',yaw:direction===1?-Math.PI/2:Math.PI/2,speed:10,npc:true,autopilot:true,police:newPolice()});
    cop.police!.targetId=player.id;world.entities.push(cop);updatePolice(world,.05);
    assert.equal(cop.police!.targetId,null,'the pursuit expired on the deck');
    let rejoined=false;
    for(let i=0;i<1200;i++){
      Object.assign(car,{y:20,vy:0,supportId:null});tick(world);
      if(cop.supportId==='ground'&&cop.autopilot&&cop.police!.path.length===0){rejoined=true;break;}
    }
    assert.ok(rejoined,`patrol failed to rejoin from ${x} toward ${direction}: ${cop.x},${cop.z}`);
    assert.equal(cop.health,100,`patrol was damaged leaving ${x} toward ${direction}`);
  }
});

test('delivery active time is independent of high-speed simulation subdivision',()=>{
  const slow=setup(),fast=setup(),moving=makeEntity('fast','roadster',-180,-100);
  moving.speed=60;fast.world.entities.push(moving);
  for(let i=0;i<20;i++){
    tick(slow.world,{...NEUTRAL,steer:1});tick(fast.world,{...NEUTRAL,steer:1});
  }
  assert.ok(Math.abs(slow.player.delivery.activeSeconds-1)<1e-9);
  assert.ok(Math.abs(fast.player.delivery.activeSeconds-slow.player.delivery.activeSeconds)<1e-9);
  assert.ok(Math.abs(fast.world.time-slow.world.time)<1e-9);
});


test('police measure flight above the stunt ramp rather than world zero',()=>{
  const {world,car}=setup(),x=STUNT_RAMP.end-1,z=STUNT_RAMP.z;
  const cop=makeEntity('police-stunt','model-3',x+5,z);cop.police=newPolice();world.entities.push(cop);
  const height=rampHeight(x,z)!;Object.assign(car,{x,z,y:height,supportId:'stunt-ramp'});
  updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  Object.assign(car,{y:height+2,supportId:null});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  car.y=height+4;updatePolice(world,.05);assert.equal(cop.police.targetId,'p');
});

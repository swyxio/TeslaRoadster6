import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type World } from '../shared/game';
import { CUSTOMERS, RESTAURANTS, initialDelivery, orderTarget, payoutFor, pickupBonusFor, updateDelivery } from '../shared/delivery';
import { newPolice, updatePolice } from '../shared/police';
import { BUILDINGS, isSurface, nearbyBuildings } from '../shared/map';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];return {world,player,car};
}
function tick(world:World,input=NEUTRAL,n=1){for(let i=0;i<n;i++)step(world,new Map([['p',input]]),.05);}
test('restaurant and fictional customer markers are on clear, reachable ground',()=>{
  for(const place of [...RESTAURANTS,...CUSTOMERS.filter(c=>!c.rooftop)]){
    assert.ok(isSurface(place.x,place.z),place.name);
    assert.ok(!nearbyBuildings(place.x,place.z,4).some(b=>Math.abs(place.x-b.x)<b.w/2+2&&Math.abs(place.z-b.z)<b.d/2+2),place.name);
  }
});
test('early bonus and late penalty change the base fare in the expected direction',()=>{
  const order=initialDelivery({x:40,z:60}).order;
  const early=payoutFor({...order,elapsed:order.estimate/2});
  const onTime=payoutFor({...order,elapsed:order.estimate});
  const late=payoutFor({...order,elapsed:order.estimate*1.5});
  assert.ok(early>onTime&&onTime>late&&late>=0);assert.equal(onTime,order.base);assert.equal(payoutFor({...order,elapsed:order.estimate*5}),0);
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
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:10,speed:0});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{y:0,speed:10});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:0,speed:0});tick(world);assert.equal(order.stage,'dropoff');
  const pickup=player.delivery.cash;assert.ok(pickup>0);assert.deepEqual(player.delivery.lastReward,{id:1,kind:'pickup',amount:pickup});
  const target=orderTarget(order);Object.assign(car,{x:target.x,z:target.z,speed:0});tick(world);
  assert.equal(player.delivery.completed,1);const payout=player.delivery.cash-pickup;assert.ok(payout>order.base);
  assert.deepEqual(player.delivery.lastReward,{id:2,kind:'delivery',amount:payout});
  tick(world,NEUTRAL,20);assert.equal(player.delivery.completed,1);assert.equal(player.delivery.cash,pickup+payout);assert.equal(player.delivery.lastReward?.id,2);
});
test('active clock and delivery estimate pause after inactivity; player scores are independent',()=>{
  const {world,player,car}=setup(),other=addPlayer(world,'other','Other');
  const target=orderTarget(player.delivery.order);Object.assign(car,{x:target.x,z:target.z});tick(world);assert.equal(player.delivery.order.stage,'dropoff');
  tick(world,{...NEUTRAL,steer:1},20);const afterInput=player.delivery.activeSeconds;assert.ok(afterInput>.9);
  tick(world,NEUTRAL,160);const stopped=player.delivery.activeSeconds;assert.ok(stopped>=3.9&&stopped<4.1);
  tick(world,NEUTRAL,100);assert.equal(player.delivery.activeSeconds,stopped);assert.equal(player.delivery.order.elapsed,stopped);
  assert.equal(other.delivery.activeSeconds,0);assert.equal(other.delivery.cash,0);
});
test('police see nearby flight, chase, slow and ticket once; grace prevents instant repeat',()=>{
  const {world,player,car}=setup(),cop=makeEntity('police-test','model-3',0,0);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:0,z:30,y:10,vy:1});tick(world);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{x:0,z:6,y:0,vy:0,speed:10});const before=car.speed;updatePolice(world,.05);assert.ok(car.speed<before);assert.equal(player.delivery.tickets,0);
  car.speed=1;updatePolice(world,.05);assert.ok(player.delivery.cash<=-60);assert.equal(player.delivery.cash,-player.delivery.lastTicket!.amount);assert.equal(player.delivery.tickets,1);assert.equal(cop.police.targetId,null);
  Object.assign(car,{y:10,vy:1});updatePolice(world,.05);assert.equal(cop.police.targetId,null);assert.equal(player.delivery.tickets,1);
});
test('police do not see grounded, distant or rooftop cars; an escaped chase expires',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,0);cop.police=newPolice();world.entities.push(cop);
  Object.assign(car,{x:0,z:10,y:0});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  Object.assign(car,{x:0,z:200,y:10});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  const roof=BUILDINGS[0];Object.assign(cop,{x:roof.x,z:roof.z});Object.assign(car,{x:roof.x,z:roof.z,y:roof.h});updatePolice(world,.05);assert.equal(cop.police.targetId,null);
  Object.assign(cop,{x:0,z:0});
  Object.assign(car,{x:0,z:10,y:10});updatePolice(world,.05);assert.equal(cop.police.targetId,'p');
  Object.assign(car,{x:0,z:200});world.time+=11;updatePolice(world,.05);assert.equal(cop.police.targetId,null);
});
test('a chasing police car drives toward a target on an unobstructed street',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,60);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:0,z:15,y:20,vy:0});cop.yaw=0;tick(world);assert.equal(cop.police.targetId,'p');
  for(let i=0;i<80;i++){car.y=20;car.vy=0;tick(world);}
  assert.ok(cop.z<45,`police should advance: z=${cop.z}`);
});

test('police follow a turn instead of circling back to an intersection',()=>{
  const {world,car}=setup(),cop=makeEntity('police-test','model-3',0,60);cop.police=newPolice();cop.npc=true;cop.autopilot=true;world.entities.push(cop);
  Object.assign(car,{x:-60,z:0,y:20,vy:0});cop.yaw=0;
  for(let i=0;i<210;i++){car.y=20;car.vy=0;tick(world);}
  assert.ok(Math.hypot(cop.x-car.x,cop.z-car.z)<20,`police should follow the corner: ${cop.x}, ${cop.z}`);
});


test('rooftop customers use flat physical roofs and require an actual landing',()=>{
  const {world,player,car}=setup();
  for(const target of CUSTOMERS.filter(c=>c.rooftop)){
    assert.ok(BUILDINGS.some(b=>b.x===target.x&&b.z===target.z&&b.h===target.y&&b.style==='midrise'),target.name);
  }
  const customer=CUSTOMERS.findIndex(c=>c.rooftop),target=CUSTOMERS[customer];
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer};
  Object.assign(car,{x:target.x,z:target.z,y:0,speed:0,vy:0});
  // Direct update proves a car below the roof cannot collect the delivery.
  updateDelivery(world,player,car,NEUTRAL,.05);assert.equal(player.delivery.completed,0);
  Object.assign(car,{x:target.x,z:target.z,y:target.y+2,speed:0,vy:-4});
  tick(world,NEUTRAL,20);
  assert.equal(car.y,target.y);assert.equal(player.delivery.completed,1);
  assert.ok(player.achievements.unlocked.includes('roof-rider'));assert.ok(player.achievements.unlocked.includes('sky-delivery'));
});

test('the next eligible Roadster order is rooftop; ordinary cars receive ground orders',()=>{
  for(const kind of ['roadster','model-3'] as const){
    const {world,player,car}=setup();car.kind=kind;
    const target=CUSTOMERS[player.delivery.order.customer];player.delivery.order.stage='dropoff';
    Object.assign(car,{x:target.x,z:target.z,y:0,speed:0,vy:0});tick(world);
    assert.equal(player.delivery.completed,1);assert.equal(CUSTOMERS[player.delivery.order.customer].rooftop,kind==='roadster');
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

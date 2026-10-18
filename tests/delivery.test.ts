import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, makeEntity, NEUTRAL, step, type World } from '../shared/game';
import { CUSTOMERS, RESTAURANTS, initialDelivery, orderTarget, payoutFor } from '../shared/delivery';
import { newPolice, updatePolice } from '../shared/police';
import { BUILDINGS, isSurface, nearbyBuildings } from '../shared/map';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];world.pickups=[];return {world,player,car};
}
function tick(world:World,input=NEUTRAL,n=1){for(let i=0;i<n;i++)step(world,new Map([['p',input]]),.05);}
test('restaurant and fictional customer markers are on clear, reachable ground',()=>{
  for(const place of [...RESTAURANTS,...CUSTOMERS]){
    assert.ok(isSurface(place.x,place.z),place.name);
    assert.ok(!nearbyBuildings(place.x,place.z,4).some(b=>Math.abs(place.x-b.x)<b.w/2+2&&Math.abs(place.z-b.z)<b.d/2+2),place.name);
  }
});
test('early bonus and late penalty change the base fare in the expected direction',()=>{
  const order=initialDelivery().order;
  const early=payoutFor({...order,elapsed:order.estimate/2});
  const onTime=payoutFor({...order,elapsed:order.estimate});
  const late=payoutFor({...order,elapsed:order.estimate*1.5});
  assert.ok(early>onTime&&onTime>late&&late>=0);assert.equal(onTime,order.base);assert.equal(payoutFor({...order,elapsed:order.estimate*5}),0);
});
test('pickup and delivery require stopping on the ground; payment occurs exactly once',()=>{
  const {world,player,car}=setup(),order=player.delivery.order,restaurant=orderTarget(order);
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:10,speed:0});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{y:0,speed:10});tick(world);assert.equal(order.stage,'pickup');
  Object.assign(car,{x:restaurant.x,z:restaurant.z,y:0,speed:0});tick(world);assert.equal(order.stage,'dropoff');
  const target=orderTarget(order);Object.assign(car,{x:target.x,z:target.z,speed:0});tick(world);
  assert.equal(player.delivery.completed,1);const payout=player.delivery.cash;assert.ok(payout>order.base);
  tick(world,NEUTRAL,20);assert.equal(player.delivery.completed,1);assert.equal(player.delivery.cash,payout);
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
  car.speed=1;updatePolice(world,.05);assert.equal(player.delivery.cash,-25);assert.equal(player.delivery.tickets,1);assert.equal(cop.police.targetId,null);
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

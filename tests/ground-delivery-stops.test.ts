import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADDED_CUSTOMERS} from '../shared/delivery-locations';
import {LEVELS, type Level} from '../shared/delivery';
import {addPlayer, createEmptyWorld, step} from '../shared/game';
import {DELIVERY_DESTINATION_SNAP, planNavigation} from '../shared/navigation';

test('new ground customers are reachable and returnable in an empty-world drive',()=>{
 const cases=[
  {id:'customer-san-francisco-05',start:{x:-227,z:-177,yaw:-Math.PI/2},level:0},
  {id:'customer-san-francisco-06',start:{x:-227,z:-177,yaw:-Math.PI/2},level:0},
  {id:'customer-oakland-07',start:{x:567,z:64,yaw:-Math.PI},level:1},
 ] as const;
 for(const {id,start,level} of cases){
  const target=ADDED_CUSTOMERS.find(p=>p.id===id);assert.ok(target,id);
  const world=createEmptyWorld(),player=addPlayer(world,`probe-${id}`,'Probe');
  const car=world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(car,{kind:'model-3',x:start.x,z:start.z,y:0,yaw:start.yaw,supportId:'ground',health:100});
  player.delivery.level=level as Level;player.delivery.cash=LEVELS[level].cash;
  function drive(to:{x:number;z:number},label:string){
   const nav=planNavigation(car,to,level as Level,DELIVERY_DESTINATION_SNAP);assert.ok(nav,label);
   car.navigation=nav;car.autopilot=true;
   for(let i=0;i<6000&&car.autopilot;i++){step(world,new Map(),.05);world.entities=world.entities.filter(e=>e.id===car.id);}
   assert.equal(car.navigation?.status,'arrived',`${label}: ${JSON.stringify({x:car.x,y:car.y,z:car.z,yaw:car.yaw,speed:car.speed,support:car.supportId,health:car.health,level:player.delivery.level,cash:player.delivery.cash,blocked:player.delivery.lastBlocked,navigation:car.navigation})}`);
   assert.ok(Math.hypot(car.x-to.x,car.z-to.z)<9,`${label}: arrival`);
   assert.equal(car.health,100,`${label}: damage`);
  }
  drive(target,`${id}: pickup to customer`);
  drive(start,`${id}: customer back to pickup`);
 }
});

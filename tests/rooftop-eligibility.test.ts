import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPlayer, createEmptyWorld, createWorld, makeEntity, NEUTRAL, step } from '../shared/game';
import { advanceDeliverySearch, applyDeliveryStop, canAssignDeliveryRoof, captureDeliveryStop, CUSTOMERS, initialDelivery, rerouteInaccessibleOrder, type DeliveryState } from '../shared/delivery';
import { BUILDINGS } from '../shared/map';
import { currentAt } from '../shared/sky-currents';

const roofCustomer=CUSTOMERS.findIndex(customer=>customer.rooftop);
function finishSearch(delivery:DeliveryState){
  for(let i=0;i<10_000&&delivery.order.search;i++)advanceDeliverySearch(delivery,delivery.order.search.roofEligible);
  assert.equal(delivery.order.search,undefined,'the bounded assignment finishes');
}

test('roof jobs require rockets and a Level 3 tank at the recorded stop',()=>{
  for(const kind of ['roadster','tesla-semi'] as const)for(const tankLevel of [1,2,3] as const){
    const car=makeEntity('car',kind,0,0);car.tankLevel=tankLevel;car.upgrades.rocket=true;
    const target=CUSTOMERS[0];Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
    const stop=captureDeliveryStop(car),delivery=initialDelivery(stop);
    Object.assign(delivery,{cash:10_000,level:1,completed:6});delivery.order={...delivery.order,stage:'dropoff',customer:0};
    // Changing vehicles later cannot change the captured event-time capability.
    car.tankLevel=tankLevel===3?1:3;
    assert.equal(stop.roofEligible,tankLevel===3);
    assert.ok(applyDeliveryStop(delivery,stop));
    finishSearch(delivery);
    assert.equal(CUSTOMERS[delivery.order.customer].rooftop,tankLevel===3,`${kind} level ${tankLevel}`);
  }
  const car=makeEntity('car','model-3',0,0);car.tankLevel=3;
  assert.equal(canAssignDeliveryRoof(car),false,'a large tank alone is insufficient');
  const target=CUSTOMERS[0];Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
  const oldStop={...captureDeliveryStop(car),canFly:true};delete oldStop.roofEligible;
  const oldDelivery=initialDelivery(oldStop);Object.assign(oldDelivery,{cash:10_000,level:1,completed:6});oldDelivery.order={...oldDelivery.order,stage:'dropoff',customer:0};
  assert.ok(applyDeliveryStop(oldDelivery,oldStop));
  finishSearch(oldDelivery);
  assert.equal(CUSTOMERS[oldDelivery.order.customer].rooftop,false,'older staged evidence does not imply a Level 3 tank');
});

test('an inaccessible saved rooftop order reroutes without a second pickup payment',()=>{
  for(const stage of ['pickup','dropoff'] as const){
    const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
    world.entities=[car];world.pickups=[];
    Object.assign(player.delivery,{cash:10_000,level:1,completed:7});
    player.delivery.order={...player.delivery.order,stage,customer:roofCustomer,elapsed:37,base:900};
    const old=structuredClone(player.delivery.order);
    car.tankLevel=3;
    assert.equal(rerouteInaccessibleOrder(player.delivery,car,canAssignDeliveryRoof(car)),false);
    // Merely leaving the capable car on foot must not cancel the job.
    car.kind='person';step(world,new Map([['p',NEUTRAL]]),.05);
    assert.equal(player.delivery.order.customer,roofCustomer);
    const cashBeforeRepair=player.delivery.cash;
    // On entering a less capable vehicle, the same simulation path repairs it.
    car.kind='tesla-semi';car.upgrades.rocket=true;car.tankLevel=1;
    step(world,new Map([['p',NEUTRAL]]),.05);
    assert.ok(player.delivery.order.search,'repair starts an incremental search');
    finishSearch(player.delivery);
    assert.equal(CUSTOMERS[player.delivery.order.customer].rooftop,false);
    assert.equal(player.delivery.order.stage,stage);assert.equal(player.delivery.completed,7);
    assert.equal(player.delivery.cash,cashBeforeRepair);assert.equal(player.delivery.lastReroute?.id,2);
    if(stage==='dropoff'){
      assert.equal(player.delivery.order.elapsed,old.elapsed);assert.ok(player.delivery.order.base<=old.base);
    }
  }
});

test('on foot, a geographically locked roof is rerouted without requiring a vehicle',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),person=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[person];world.pickups=[];player.delivery.cash=9_960;player.delivery.level=0;
  const oaklandRoof=CUSTOMERS.findIndex(customer=>customer.rooftop&&customer.id.includes('oakland'));
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:oaklandRoof,elapsed:37,base:900};
  person.kind='person';step(world,new Map([['p',NEUTRAL]]),.05);
  assert.ok(player.delivery.order.search,'a locked region starts a bounded search');
  finishSearch(player.delivery);
  assert.equal(CUSTOMERS[player.delivery.order.customer].rooftop,false);
  assert.equal(player.delivery.order.stage,'dropoff');assert.equal(player.delivery.order.elapsed,37);
});

test('roof repair waits for an unresolved delivery decision',()=>{
  const world=createWorld(),player=addPlayer(world,'p','Driver'),car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];player.delivery.cash=10_000;player.delivery.level=1;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:roofCustomer};
  car.tankLevel=1;
  step(world,new Map([['p',NEUTRAL]]),.05,{economy:{update:(_player,apply)=>{apply();},decisionsAvailable:()=>false}});
  assert.equal(player.delivery.order.customer,roofCustomer);
  step(world,new Map([['p',NEUTRAL]]),.05);
  finishSearch(player.delivery);
  assert.equal(CUSTOMERS[player.delivery.order.customer].rooftop,false);
});

test('a full Level 3 Roadster and Semi can land on each delivery roof in a controlled fixture',()=>{
  for(const roof of CUSTOMERS.filter(customer=>customer.rooftop))for(const kind of ['roadster','tesla-semi'] as const){
    const building=BUILDINGS.find(b=>b.x===roof.x&&b.z===roof.z&&b.h===roof.y)!;
    const world=createEmptyWorld(),car=makeEntity('car',kind,roof.x,roof.z+building.d/2+8,'p');
    car.upgrades.rocket=true;car.tankLevel=3;world.entities=[car];
    let jump=0,phase:'climb'|'cross'|'land'='climb';
    for(let tick=0;tick<1200;tick++){
      let throttle=0,hover=false;
      if(phase==='climb'){
        if(tick===0||(car.supportId===null&&car.vy<=.1&&car.y<roof.y+5&&car.air>0))jump++;
        if(car.y>=roof.y+4)phase='cross';
      }
      if(phase==='cross'){
        hover=true;
        const distance=car.z-roof.z,toward=-car.vz;
        if(distance<1.5&&Math.abs(car.vz)<2){phase='land';hover=false;}
        else throttle=distance>Math.max(1.5,toward*toward/(2*(kind==='tesla-semi'?13.33:16))+1)?1:-1;
      }
      assert.equal(currentAt(car),undefined,'fixture does not depend on a sky current');
      step(world,new Map([['p',{...NEUTRAL,jump,hover,throttle}]]),.05);
      if(phase==='land'&&car.supportId!==null)break;
      if(tick>0&&car.supportId==='ground')break;
    }
    assert.ok(car.supportId?.startsWith('roof:'),`${kind} landed on ${roof.name}`);
    assert.equal(car.y,roof.y);assert.ok(Math.hypot(car.x-roof.x,car.z-roof.z)<=6);
    assert.ok(car.air>0,`${kind} retained air at ${roof.name}`);
  }
});

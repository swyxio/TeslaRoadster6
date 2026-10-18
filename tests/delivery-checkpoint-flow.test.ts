import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, NEUTRAL, step, type EconomyHooks } from '../shared/game';
import { CUSTOMERS, RESTAURANTS, orderTarget, rerouteInaccessibleOrder, updateDelivery } from '../shared/delivery';
import { updateAchievements } from '../shared/achievements';

function readyDropoff(completed:number,elapsed=100) {
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];
  player.delivery.completed=completed;
  player.delivery.order={...player.delivery.order,stage:'dropoff',customer:0,elapsed,estimate:100,base:1_000};
  const target=CUSTOMERS[0];
  Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
  return {world,player,car};
}

test('a completed drop-off pays the checkpoint on every third job without inflating delivery earnings',()=>{
  for(const [before,checkpoint] of [[1,0],[2,750],[3,0],[5,750]] as const){
    const {world,player,car}=readyDropoff(before);
    const delivery=player.delivery as typeof player.delivery & {lifetimeIncome:number};
    const cash=delivery.cash,income=delivery.lifetimeIncome,earned=delivery.earned;
    updateDelivery(world,player,car,NEUTRAL,0);
    assert.equal(delivery.completed,before+1);
    assert.equal(delivery.lastPayout,1_000);
    assert.equal(delivery.cash-cash,1_000+checkpoint);
    assert.equal(delivery.lifetimeIncome-income,1_000+checkpoint);
    assert.equal(delivery.earned-earned,1_000);
    updateDelivery(world,player,car,NEUTRAL,0);
    assert.equal(delivery.completed,before+1,'the same drop-off cannot complete again');
    assert.equal(delivery.cash-cash,1_000+checkpoint);
  }
});

test('a third delivery still pays its checkpoint when the late fare is zero',()=>{
  const {world,player,car}=readyDropoff(2,1_000);
  const delivery=player.delivery as typeof player.delivery & {lifetimeIncome:number};
  const cash=delivery.cash,income=delivery.lifetimeIncome,earned=delivery.earned;
  updateDelivery(world,player,car,NEUTRAL,0);
  assert.equal(delivery.lastPayout,0);
  assert.equal(delivery.cash-cash,750);
  assert.equal(delivery.lifetimeIncome-income,750);
  assert.equal(delivery.earned,earned);
  assert.equal(delivery.lastReward?.amount,750);
});

test('a checkpoint, delivery milestone and region unlock can be grouped in one completion',()=>{
  const {world,player}=readyDropoff(2);
  const delivery=player.delivery as typeof player.delivery & {lifetimeIncome:number};
  delivery.cash=8_250;
  player.achievements.unlocked.push('deliveries-1');
  step(world,new Map([['driver',NEUTRAL]]),.05);
  assert.equal(delivery.completed,3);
  assert.equal(delivery.lastPayout,1_000);
  assert.equal(delivery.cash,12_000);
  assert.equal(delivery.lifetimeIncome,3_750);
  assert.equal(delivery.earned,1_000);
  assert.ok(player.achievements.unlocked.includes('regular'));
  assert.ok(player.achievements.unlocked.includes('region-oakland'));
  assert.equal(delivery.lastReward?.amount,3_750);
});

test('the authoritative resolver applies to fare before level and award cascades, not the checkpoint',()=>{
  const {world,player,car}=readyDropoff(2);
  player.delivery.cash=8_250;player.achievements.unlocked.push('deliveries-1');
  const seen:string[]=[];
  const parts=updateDelivery(world,player,car,NEUTRAL,0,false,false,component=>{
    seen.push(component.sourceId);return component.amount*2;
  })!;
  assert.deepEqual(seen,['delivery:3:dropoff']);
  assert.deepEqual(parts.map(part=>[part.component.kind,part.component.amount,part.amount]),[['delivery',1_000,2_000],['checkpoint',750,750]]);
  assert.equal(player.delivery.cash,11_000);
  assert.equal(player.delivery.level,1,'resolved pay determines the level before the next order');
  updateAchievements(player,car,false,undefined,true);
  assert.equal(player.delivery.cash,13_000);
  assert.equal(player.delivery.earned,2_000);
  assert.equal(player.delivery.lifetimeIncome,4_750);
  assert.equal(player.delivery.lastReward?.amount,4_750);
});

test('rerouting the single accepted job does not change its completion source ID',()=>{
  const {world,player,car}=readyDropoff(2);
  player.delivery.cash=0;player.delivery.level=0;player.delivery.order.customer=4;
  assert.equal(rerouteInaccessibleOrder(player.delivery,car),true);
  const target=orderTarget(player.delivery.order);
  Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
  const parts=updateDelivery(world,player,car,NEUTRAL,0)!;
  assert.deepEqual(parts.map(part=>part.component.sourceId),['delivery:3:dropoff','delivery:3:checkpoint']);
});

for(const stage of ['pickup','dropoff'] as const)test(`a deferred ${stage} retries without changing wallet or awards while another driver progresses`,()=>{
  const {world,player,car}=readyDropoff(2);
  player.delivery.cash=8_250;player.achievements.unlocked.push('deliveries-1');
  if(stage==='pickup'){
    player.delivery.order={...player.delivery.order,stage:'pickup',restaurant:0,elapsed:10,pickupEstimate:100};
    const target=RESTAURANTS[0];Object.assign(car,{x:target.x,z:target.z,y:target.y,speed:0,vy:0,supportId:'ground'});
  }
  updateAchievements(player,car,false);
  const other=addPlayer(world,'other','Other'),otherCar=world.entities.find(entity=>entity.id===other.entityId)!;
  const destination=CUSTOMERS[1];
  other.delivery.order={...other.delivery.order,stage:'dropoff',customer:1,elapsed:100,estimate:100,base:1_000};
  Object.assign(otherCar,{x:destination.x,z:destination.z,y:destination.y,speed:0,vy:0,supportId:'ground'});
  updateAchievements(other,otherCar,false);
  let available=false;
  const settled:{playerId:string;result:NonNullable<ReturnType<typeof updateDelivery>>}[]=[];
  const hooks:EconomyHooks={
    update:(p,apply)=>{const result=apply();if(result)settled.push({playerId:p.id,result});},
    pickup:()=>{},
    resolveDeliveryPayout:(p,component)=>p.id===player.id&&!available?null:component.amount*2,
  };
  const before={cash:player.delivery.cash,earned:player.delivery.earned,income:player.delivery.lifetimeIncome,completed:player.delivery.completed,stage:player.delivery.order.stage,elapsed:player.delivery.order.elapsed,achievements:structuredClone(player.achievements)};
  const input={...NEUTRAL,brake:true};
  step(world,new Map([[player.id,input]]),.05,{economy:hooks,substeps:1});
  assert.equal(player.delivery.cash,before.cash);assert.equal(player.delivery.earned,before.earned);
  assert.equal(player.delivery.lifetimeIncome,before.income);assert.equal(player.delivery.completed,before.completed);
  assert.equal(player.delivery.order.stage,before.stage);assert.equal(player.delivery.order.elapsed,before.elapsed);
  assert.deepEqual(player.achievements,before.achievements);
  assert.equal(other.delivery.completed,1,'the other player is not held by the unavailable rate');
  assert.equal(settled.filter(item=>item.playerId===player.id).length,0);
  available=true;
  step(world,new Map([[player.id,input]]),.05,{economy:hooks,substeps:1});
  const records=settled.filter(item=>item.playerId===player.id);
  assert.equal(records.length,1);
  assert.equal(records[0].result[0].component.kind,stage==='pickup'?'pickup':'delivery');
  if(stage==='dropoff'){
    assert.deepEqual(records[0].result.map(part=>part.amount),[2_000,750]);
    assert.equal(player.delivery.completed,3);
    assert.ok(player.achievements.unlocked.includes('regular'));
    assert.ok(player.achievements.unlocked.includes('region-oakland'));
    assert.equal(player.delivery.lastReward?.amount,4_750);
  }else assert.equal(player.delivery.order.stage,'dropoff');
  step(world,new Map([[player.id,input]]),.05,{economy:hooks,substeps:1});
  assert.equal(settled.filter(item=>item.playerId===player.id).length,1,'settled arrival cannot pay twice');
});

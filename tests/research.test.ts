import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, buyUpgrade, createWorld, NEUTRAL, step } from '../shared/game';
import { CUSTOMERS, payoutFor } from '../shared/delivery';
import { RESEARCH_SITES, researchArrival, upgradePrice } from '../shared/research';
import { SHOPS, UPGRADES } from '../shared/upgrades';
import { terrainHeight } from '../shared/map';
import { updateAchievements } from '../shared/achievements';
import { parseMessage } from '../worker/protocol';

function setup(){
  const world=createWorld(),player=addPlayer(world,'p','Driver'),other=addPlayer(world,'q','Other');
  const car=world.entities.find(e=>e.id===player.entityId)!,otherCar=world.entities.find(e=>e.id===other.entityId)!;
  world.entities=[car,otherCar];world.pickups=[];player.delivery.level=2;
  return {world,player,other,car};
}

test('research visits require a stopped ground vehicle, pay once, and belong to the driver',()=>{
  for(const site of RESEARCH_SITES){
    const {world,player,other,car}=setup(),at=researchArrival(site);
    Object.assign(car,{...at,y:terrainHeight(at.x,at.z),supportId:null,speed:0,vy:0});
    updateAchievements(player,car,false);assert.equal(player.delivery.cash,0,'hover does not count');
    car.supportId='ground';car.speed=5;updateAchievements(player,car,false);assert.equal(player.delivery.cash,0,'moving too fast does not count');
    car.speed=0;step(world,new Map([['p',NEUTRAL]]),.05);
    assert.ok(player.achievements.unlocked.includes(site.achievement));
    assert.equal(player.delivery.cash,site.cash);assert.equal(player.delivery.earned,0);
    assert.equal(player.delivery.lastReward?.kind,'research');assert.equal(other.delivery.cash,0);
    step(world,new Map([['p',NEUTRAL]]),.05);assert.equal(player.delivery.cash,site.cash,'cannot claim twice');
    assert.ok(!other.achievements.unlocked.includes(site.achievement));
  }
  assert.equal(parseMessage('{"type":"research","site":"ucsf"}'),null,'clients cannot claim a visit');
});

test('research discounts are applied by the authoritative workshop to real purchases',()=>{
  for(const site of RESEARCH_SITES){
    const {world,player,car}=setup(),at=researchArrival(site);
    Object.assign(car,{...at,y:terrainHeight(at.x,at.z),supportId:'ground',speed:0,vy:0});
    step(world,new Map([['p',NEUTRAL]]),.05);
    Object.assign(car,{x:SHOPS[0].x,z:SHOPS[0].z,y:0,speed:0,vy:0,pushX:0,pushZ:0,supportId:'ground',health:80});
    const standard=site.upgrade==='tank'?30:UPGRADES[site.upgrade].price;
    const price=upgradePrice(player,car,site.upgrade);assert.ok(price<standard);
    player.delivery.cash=price;assert.equal(buyUpgrade(world,player.id,site.upgrade),true,site.landmark);
    assert.equal(player.delivery.cash,0);
  }
});

test('an SFO drop-off earns its visit and express bonuses once alongside the fare',()=>{
  const {world,player,car}=setup(),site=RESEARCH_SITES.find(item=>item.landmark==='sfo')!,at=researchArrival(site);
  const customer=CUSTOMERS.findIndex(item=>item.id==='landmark-sfo');assert.ok(customer>=0);
  Object.assign(player.delivery.order,{stage:'dropoff',customer,elapsed:0});
  player.achievements.lastPosition={x:at.x,z:at.z};
  const fare=payoutFor(player.delivery.order);
  Object.assign(car,{...at,y:terrainHeight(at.x,at.z),supportId:'ground',speed:0,vy:0});
  step(world,new Map([['p',NEUTRAL]]),.05);
  assert.equal(player.delivery.completed,1);assert.equal(player.delivery.earned,fare);
  assert.equal(player.delivery.cash,fare+site.cash+80);
  assert.ok(player.achievements.unlocked.includes('sfo-ground-crew'));
  assert.ok(player.achievements.unlocked.includes('sfo-express'));
  assert.equal(player.delivery.lastReward?.amount,site.cash+80);
  step(world,new Map([['p',NEUTRAL]]),.05);assert.equal(player.delivery.cash,fare+site.cash+80);
});

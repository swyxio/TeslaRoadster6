import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, updateAchievements } from '../shared/achievements';
import { addPlayer, createWorld } from '../shared/game';
import { CALTRAIN_TRACK } from '../shared/caltrain';
import { LUXURY_CATALOG, LUXURY_SHOWROOM, atLuxuryShowroom, luxuryPurchaseAwards } from '../shared/luxury';
import { BUILDINGS, LANDMARKS, ROADS, terrainHeight } from '../shared/map';
import { PARKING_LOTS } from '../shared/parking-lots';
import { contact } from '../shared/physics';
import { SHOPS, SHOP_RADIUS } from '../shared/upgrades';

test('Vault site and forecourt share clear, supported world geometry',()=>{
  const {building,arrival,radius}=LUXURY_SHOWROOM;
  const site=BUILDINGS.filter(b=>b.style==='luxury-showroom');
  assert.equal(site.length,1);
  assert.deepEqual({x:site[0].x,z:site[0].z,w:site[0].w,d:site[0].d,h:site[0].h},building);
  const forecourt={...arrival,w:radius*2,d:radius*2,yaw:0};
  for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])
    assert.equal(terrainHeight(arrival.x+dx,arrival.z+dz),0);
  for(const b of BUILDINGS)assert.equal(contact(forecourt,{...b,yaw:0}),null);
  for(const road of ROADS)assert.equal(contact(forecourt,{...road,yaw:road.angle??0}),null);
  for(const lot of PARKING_LOTS)assert.equal(contact(forecourt,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null);
  for(const landmark of LANDMARKS)assert.ok(Math.hypot(arrival.x-landmark.arrival.x,arrival.z-landmark.arrival.z)>radius+9);
  for(const shop of SHOPS)assert.ok(Math.hypot(arrival.x-shop.x,arrival.z-shop.z)>radius+SHOP_RADIUS);
  for(let i=1;i<CALTRAIN_TRACK.length;i++){
    const a=CALTRAIN_TRACK[i-1],b=CALTRAIN_TRACK[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((arrival.x-a.x)*dx+(arrival.z-a.z)*dz)/(dx*dx+dz*dz)));
    assert.ok(Math.hypot(arrival.x-a.x-t*dx,arrival.z-a.z-t*dz)>radius+4);
  }
});

test('Vault interactions require a stopped driver in the ground-level forecourt',()=>{
  const entity={...LUXURY_SHOWROOM.arrival,y:0,speed:0,vy:0,pushX:0,pushZ:0,supportId:'ground',inDome:false};
  assert.equal(atLuxuryShowroom(entity),true);
  for(const change of [{x:entity.x+11},{speed:3},{vy:2},{pushX:2},{supportId:null},{inDome:true},{y:5}])
    assert.equal(atLuxuryShowroom({...entity,...change}),false);
});

test('model, first-purchase and collection awards are one-off',()=>{
  assert.equal(LUXURY_CATALOG.reduce((sum,model)=>sum+model.price,0),30_000_000);
  assert.equal(new Set(LUXURY_CATALOG.map(model=>model.id)).size,6);
  for(const model of LUXURY_CATALOG)assert.ok(model.achievement in ACHIEVEMENTS);
  const first=LUXURY_CATALOG[0],second=LUXURY_CATALOG[1];
  assert.deepEqual(luxuryPurchaseAwards(first.id,[],[]),[
    {id:'luxury-first',reward:25_000},{id:first.achievement,reward:first.reward},
  ]);
  assert.deepEqual(luxuryPurchaseAwards(first.id,[first.id],[]),[]);
  assert.deepEqual(luxuryPurchaseAwards(second.id,[first.id],['luxury-first']),[
    {id:second.achievement,reward:second.reward},{id:'luxury-collection-2',reward:50_000},
  ]);
  assert.deepEqual(luxuryPurchaseAwards(second.id,[first.id,'unknown','unknown'],[second.achievement,'luxury-collection-2']),[]);
});

test('visiting the Vault awards cash and lifetime income only once',()=>{
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const entity=world.entities.find(item=>item.id===player.entityId)!;
  Object.assign(entity,{...LUXURY_SHOWROOM.arrival,y:0,speed:0,vy:0,pushX:0,pushZ:0,supportId:'ground'});
  const cash=player.delivery.cash,income=player.delivery.lifetimeIncome;
  updateAchievements(player,entity,false);updateAchievements(player,entity,false);
  assert.equal(player.delivery.cash,cash+5_000);
  assert.equal(player.delivery.lifetimeIncome,income+5_000);
  assert.equal(player.achievements.unlocked.filter(id=>id==='luxury-visit').length,1);
});

test('delivery and actual region milestones pay once and survive spending',()=>{
  const world=createWorld(),player=addPlayer(world,'driver','Driver');
  const entity=world.entities.find(item=>item.id===player.entityId)!;
  player.delivery.cash=0;player.delivery.lifetimeIncome=0;
  for(const count of [1,10,25,50,100]){player.delivery.completed=count;updateAchievements(player,entity,false);}
  assert.equal(player.delivery.cash,63_000);
  assert.equal(player.delivery.lifetimeIncome,63_000);
  assert.ok(player.achievements.unlocked.includes('region-oakland'));
  assert.equal(player.delivery.level,2);
  player.delivery.cash=0;updateAchievements(player,entity,false);
  assert.equal(player.delivery.cash,0);
  assert.equal(player.delivery.lifetimeIncome,63_000);
  assert.equal(player.achievements.unlocked.filter(id=>id.startsWith('deliveries-')).length,10);
});

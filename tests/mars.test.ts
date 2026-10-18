import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld } from '../shared/game';
import { BUILDINGS, FREMONT_SPACEPORT, ROADS, isLand, terrainHeight } from '../shared/map';
import { body, contact } from '../shared/physics';
import { MARS_GOAL, marsGoalReached } from '../shared/mars';
import { awardMarsAchievement } from '../shared/achievements';
import { parseMessage } from '../worker/protocol';
import { PARKING_LOTS } from '../shared/parking-lots';

test('room funding remains independent of global income',()=>{
  const world=createWorld();world.mars.roomFund=MARS_GOAL-1;
  assert.equal(marsGoalReached(world.mars),false);
  world.mars.roomFund=MARS_GOAL;
  assert.equal(marsGoalReached(world.mars),true);
  assert.equal(world.mars.fund,0);
});

test('the Mars reward credits cash and eligible income once',()=>{
  const player=addPlayer(createWorld(),'a','A');
  const cash=player.delivery.cash,income=player.delivery.lifetimeIncome;
  awardMarsAchievement(player);awardMarsAchievement(player);
  assert.equal(player.delivery.cash,cash+10_000);
  assert.equal(player.delivery.lifetimeIncome,income+10_000);
  assert.deepEqual(player.achievements.unlocked,['to-mars']);
});

test('spaceport collision footprints and boarding ring occupy supported, clear Fremont ground',()=>{
  const {factory,pad,tower,entrance}=FREMONT_SPACEPORT;
  for(const part of [factory,pad,tower]){
    assert.ok(BUILDINGS.some(b=>b.style==='spaceport'&&b.x===part.x&&b.z===part.z&&b.h===part.h));
    for(const x of [part.x-part.w/2,part.x+part.w/2])for(const z of [part.z-part.d/2,part.z+part.d/2]){
      assert.ok(isLand(x,z));assert.equal(terrainHeight(x,z),0);
    }
    assert.ok(!ROADS.some(road=>contact({...part,yaw:0},{...road,yaw:road.angle??0})),'spaceport does not block a road');
    assert.ok(!BUILDINGS.some(b=>b.style!=='spaceport'&&contact({...part,yaw:0},{...b,yaw:0})),'spaceport does not overlap other buildings');
    assert.ok(!PARKING_LOTS.some(lot=>contact({...part,yaw:0},{...lot.area,w:lot.area.width,d:lot.area.length})),'spaceport does not obstruct a parking or charging lot');
  }
  assert.equal(terrainHeight(entrance.x,entrance.z),0);
  const world=createWorld(),player=addPlayer(world,'a','A'),car=world.entities.find(e=>e.id===player.entityId)!;
  Object.assign(car,entrance);
  assert.ok(!BUILDINGS.some(b=>contact(body(car),{...b,yaw:0})),'boarding point is clear for a car');
});

test('Mars wire requests require valid contribution amounts and request IDs',()=>{
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount:5,requestId:7})),{type:'mars',action:'contribute',amount:5,requestId:7});
  for(const amount of [0,-1,1.5,MARS_GOAL+1])assert.equal(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount,requestId:7})),null);
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:8})),{type:'mars',action:'board',requestId:8});
  assert.equal(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:0})),null);
});

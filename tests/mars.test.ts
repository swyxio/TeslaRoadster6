import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld } from '../shared/game';
import { BUILDINGS, FREMONT_SPACEPORT, ROADS, isLand, terrainHeight } from '../shared/map';
import { body, contact } from '../shared/physics';
import { MARS_GOAL, applyMarsContribution, atMarsBoarding, boardMars, marsContribution } from '../shared/mars';
import { parseMessage } from '../worker/protocol';
import { PARKING_LOTS } from '../shared/parking-lots';

test('different players fund one shared mission with exact cash and a capped final contribution',()=>{
  const world=createWorld(),a=addPlayer(world,'a','A'),b=addPlayer(world,'b','B');
  a.delivery.cash=100;b.delivery.cash=200;
  for(const bad of [-1,0,1.5,NaN,Infinity,101])assert.equal(marsContribution(world,'a',bad),0);
  assert.equal(marsContribution(world,'missing',1),0);
  const first=marsContribution(world,'a',60);applyMarsContribution(world,'a',first);
  const second=marsContribution(world,'b',70);applyMarsContribution(world,'b',second);
  assert.equal(world.mars.fund,130);assert.equal(a.delivery.cash,40);assert.equal(b.delivery.cash,130);
  world.mars.fund=MARS_GOAL-5;
  const last=marsContribution(world,'b',100);assert.equal(last,5);applyMarsContribution(world,'b',last);
  assert.equal(world.mars.fund,MARS_GOAL);assert.equal(b.delivery.cash,125);assert.equal(marsContribution(world,'a',1),0);
});

test('each player must be stopped at the spaceport with a fully funded mission to win',()=>{
  const world=createWorld(),a=addPlayer(world,'a','A'),b=addPlayer(world,'b','B');
  const car=world.entities.find(e=>e.id===a.entityId)!;
  Object.assign(car,{...FREMONT_SPACEPORT.entrance,supportId:'ground',speed:0});
  assert.ok(atMarsBoarding(car));assert.equal(boardMars(world,'a'),false);
  world.mars.fund=MARS_GOAL;assert.equal(boardMars(world,'b'),false);
  car.speed=2;assert.equal(boardMars(world,'a'),false);car.speed=0;car.supportId=null;assert.equal(boardMars(world,'a'),false);
  car.supportId='ground';world.time=123;assert.ok(boardMars(world,'a'));
  assert.equal(world.mars.launchAt,123);assert.deepEqual(a.achievements.unlocked,['to-mars']);
  assert.deepEqual(b.achievements.unlocked,[]);assert.ok(boardMars(world,'a'));assert.deepEqual(a.achievements.unlocked,['to-mars']);
  const carB=world.entities.find(e=>e.id===b.entityId)!;Object.assign(carB,{...FREMONT_SPACEPORT.entrance,supportId:'ground',speed:0});
  assert.ok(boardMars(world,'b'));assert.deepEqual(b.achievements.unlocked,['to-mars']);
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

test('Mars wire requests reject malformed amounts and use request IDs',()=>{
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount:5,requestId:7})),{type:'mars',action:'contribute',amount:5,requestId:7});
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:8})),{type:'mars',action:'board',requestId:8});
  for(const amount of [-1,0,1.5,1_000_000_001])assert.equal(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount,requestId:1})),null);
  assert.equal(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:0})),null);
});

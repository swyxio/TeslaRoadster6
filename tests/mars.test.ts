import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, createWorld, step } from '../shared/game';
import { BUILDINGS, FREMONT_SPACEPORT, ROADS, STARBASE_PERIMETER_RADIUS, STARSHIP_STACK_HEIGHT, buildingRoofHeight, isLand, nearbyBuildings, supportHeight, terrainHeight } from '../shared/map';
import { landmarkBlocksPose } from '../shared/landmark-collision';
import { spaceportStructureBoxes } from '../shared/spaceport-structures';
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

test('raised flame channel has shared walls, an open outlet and clear road and boarding approaches',()=>{
  assert.equal(STARSHIP_STACK_HEIGHT,120);
  assert.equal(STARBASE_PERIMETER_RADIUS,360);
  const {pad,entrance}=FREMONT_SPACEPORT;
  const index=BUILDINGS.findIndex(b=>b.style==='spaceport'&&b.x===pad.x&&b.z===pad.z);
  assert.ok(index>=0);
  const building=BUILDINGS[index];
  for(const part of spaceportStructureBoxes('pad',pad)){
    const footprint={...part,x:pad.x+part.x,z:pad.z+part.z,yaw:0};
    for(const x of [footprint.x-part.w/2,footprint.x+part.w/2])for(const z of [footprint.z-part.d/2,footprint.z+part.d/2]){
      assert.equal(terrainHeight(x,z),0,'channel parts stand on supported ground');
    }
    assert.ok(!ROADS.some(road=>contact(footprint,{...road,yaw:road.angle??0})),'channel does not obstruct a road');
    const dx=Math.max(0,Math.abs(entrance.x-footprint.x)-part.w/2);
    const dz=Math.max(0,Math.abs(entrance.z-footprint.z)-part.d/2);
    assert.ok(Math.hypot(dx,dz)>14,'full boarding radius is clear');
    assert.ok(nearbyBuildings(footprint.x,footprint.z,0).includes(building),'every part is in the spatial index');
    assert.ok((supportHeight(`roof:${index}`,footprint.x,footprint.z)??-Infinity)>=part.y+part.h/2,'every part supports landings');
  }
  const pose={kind:'roadster' as const,x:pad.x,z:pad.z+42,y:0,yaw:0,pitch:0,roll:0,supportId:'ground' as const};
  assert.equal(landmarkBlocksPose(building,pose),false,'channel outlet remains open');
  assert.equal(landmarkBlocksPose(building,{...pose,x:pad.x+8}),true,'visible wall blocks a car');
  const wallX=pad.x+8,wallZ=pad.z+42;
  assert.ok(nearbyBuildings(wallX,wallZ,0).includes(building),'extended wall is in the spatial index');
  assert.equal(buildingRoofHeight(building,wallX,wallZ),4);
  assert.equal(supportHeight(`roof:${index}`,wallX,wallZ),4);
  assert.equal(buildingRoofHeight(building,pad.x,wallZ),0,'open channel is not an invisible roof');

  const world=createWorld(),player=addPlayer(world,'landing','Landing');
  const car=world.entities.find(e=>e.id===player.entityId)!;
  world.entities=[car];player.delivery.level=5;
  Object.assign(car,{x:wallX,z:wallZ,y:9,vy:-5,supportId:null,speed:0});
  for(let i=0;i<80;i++)step(world,new Map(),.05);
  assert.ok(Math.abs(car.y-4)<.01,'falling car lands on the extended wall');
});

test('Mars wire requests require valid contribution amounts and request IDs',()=>{
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount:5,requestId:7})),{type:'mars',action:'contribute',amount:5,requestId:7});
  for(const amount of [0,-1,1.5,MARS_GOAL+1])assert.equal(parseMessage(JSON.stringify({type:'mars',action:'contribute',amount,requestId:7})),null);
  assert.deepEqual(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:8})),{type:'mars',action:'board',requestId:8});
  assert.equal(parseMessage(JSON.stringify({type:'mars',action:'board',requestId:0})),null);
});

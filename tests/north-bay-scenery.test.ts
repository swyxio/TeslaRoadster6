import test from 'node:test';
import assert from 'node:assert/strict';
import { northBayScenery } from '../src/north-bay-scenery';
import { BUILDINGS, FERRY_DOCKS, ROADS, isLand, terrainHeight } from '../shared/map';
import { contact } from '../shared/physics';
import { PARKING_LOTS } from '../shared/parking-lots';
import { RACE_COURSES } from '../shared/race-courses';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';

test('woodland and vineyard scenery follows the shared land and clears playable areas',()=>{
 const {trees,vines}=northBayScenery(),all=[...trees.marin,...trees['rocket-island'],...vines];
 assert.ok(trees.marin.length>40,'Marin has a visible grove');
 assert.ok(trees['rocket-island'].length>300,'the playground has wooded surroundings');
 assert.ok(vines.length>100,'vineyards have visible rows');
 for(const p of all){
  assert.ok(isLand(p.x,p.z),`unsupported plant at ${p.x},${p.z}`);
  assert.equal(p.y,terrainHeight(p.x,p.z),'tree roots follow the collision terrain');
  assert.ok(Math.abs(p.x)>25||p.z<FERRY_DOCKS.island.deckZ-25||p.z>FERRY_DOCKS.sf.deckZ+25,'plant in ferry corridor');
  const footprint={x:p.x,z:p.z,w:8,d:8,yaw:0};
  for(const r of ROADS)assert.equal(contact(footprint,{...r,yaw:r.angle??0}),null,`plant on road at ${p.x},${p.z}`);
  for(const b of BUILDINGS)assert.equal(contact(footprint,{...b,yaw:0}),null,`plant on building at ${p.x},${p.z}`);
  for(const l of PARKING_LOTS)assert.equal(contact(footprint,{x:l.area.x,z:l.area.z,w:l.area.width,d:l.area.length,yaw:l.area.yaw}),null,`plant in parking lot at ${p.x},${p.z}`);
  for(const course of RACE_COURSES){
   assert.ok(Math.hypot(p.x-course.start.x,p.z-course.start.z)>course.start.radius+4,`plant at race start`);
   for(const gate of course.gates)assert.equal(contact(footprint,{x:gate.x,z:gate.z,w:gate.width,d:12,yaw:gate.yaw}),null,`plant on race gate ${gate.id}`);
  }
  for(const j of ISLAND_JUMPS)assert.ok(p.x<j.start-50||p.x>j.end+100||Math.abs(p.z-j.z)>=j.width/2+40,`plant in jump corridor ${j.id}`);
  assert.ok(p.x<ISLAND_BANK.startX-35||p.x>ISLAND_BANK.endX+35||Math.abs(p.z-ISLAND_BANK.z)>=ISLAND_BANK.halfWidth+25,'plant on bank');
  assert.ok(Math.abs(p.x-ISLAND_CLIFF.x)>=75||Math.abs(p.z-ISLAND_CLIFF.z)>=60,'plant on cliff approach');
 }
});

test('the removed Colossus has no remaining hidden building or minimap marker',async()=>{
 const {TESLAND_MONUMENTS,nearbyBuildings}=await import('../shared/map');
 assert.ok(!TESLAND_MONUMENTS.some(p=>String(p.id)==='colossus'));
 assert.ok(!nearbyBuildings(-205,-445,1).some(b=>b.x===-205&&b.z===-445));
});

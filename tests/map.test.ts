import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,NEUTRAL,step,toggleAutopilot} from '../shared/game';
import {AIRPORT_RUNWAY,BAY_CIRCUIT,BRIDGES,BUILDINGS,FERRY_DOCKS,HIGHWAYS,ISLAND_TRACK,LAKE_MERRITT,LANDMARKS,MYSTERY_YACHT,ROADS,isLand,isRocketIsland,isSurface,nearbyBuildings,terrainHeight} from '../shared/map';
import {CHARGER_LOT,STATIONS,stationStalls} from '../shared/stations';
import {PARKING_LOTS} from '../shared/parking-lots';
import {body,contact} from '../shared/physics';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {DOME} from '../shared/dome';

function drive(x:number,z:number,yaw:number,goal:(x:number,z:number)=>boolean){
 const world=createWorld(),player=addPlayer(world,'crossing','Crossing');
 const car=world.entities.find(e=>e.id===player.entityId)!;
 player.delivery.level=3;
 world.entities=[car];world.pickups=[];Object.assign(car,{x,z,yaw});
 for(let i=0;i<650&&!goal(car.x,car.z);i++)step(world,new Map([['crossing',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(goal(car.x,car.z),`crossing stopped at ${car.x.toFixed(1)}, ${car.z.toFixed(1)}`);
}
test('both bridges traverse water and connect the correct shores',()=>{
 assert.equal(BRIDGES.length,2);
 assert.ok(isLand(60,60)&&isLand(340,60)&&!isLand(120,60)&&isSurface(120,60));
 assert.ok(isLand(-240,-250)&&isLand(-240,-430)&&!isLand(-240,-345)&&isSurface(-240,-345));
 drive(45,60,-Math.PI/2,(x)=>x>340);
 drive(-240,-220,0,(_,z)=>z< -430);
});
test('Rocket Island loop and ferry approaches are clear, supported and separated by water',()=>{
 assert.ok(isRocketIsland(200,-1650));
 assert.ok(!isRocketIsland(0,-800));
 // The connected dome shares the island's protected area.
 assert.ok(isLand(DOME.x,DOME.z));
 assert.ok(isRocketIsland(DOME.x,DOME.z));
 for(let i=0;i<ISLAND_TRACK.length;i++){
  const a=ISLAND_TRACK[i],b=ISLAND_TRACK[(i+1)%ISLAND_TRACK.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  for(let n=0;n<=10;n++)for(const offset of [-16,0,16]){
   const x=a.x+dx*n/10+dz/length*offset,z=a.z+dz*n/10-dx/length*offset;
   assert.ok(isRocketIsland(x,z),`track shoulder unsupported at ${x},${z}`);
   assert.ok(!nearbyBuildings(x,z,12).length);
  }
 }
 // The entire swept deck corridor between its two docked positions is water.
 for(let z=FERRY_DOCKS.island.deckZ+20;z<FERRY_DOCKS.sf.deckZ-20;z+=5)
  for(const x of [-7,0,7])assert.ok(!isSurface(x,z),`ferry corridor blocked at ${x},${z}`);
 for(const id of VEHICLE_IDS){
  const {width,length}=VEHICLES[id];
  for(const z of [-245,-225,-1070,-1090,-1110]){
   const e=makeEntity('clearance',id,0,z);
   for(const x of [-width/2,width/2])for(const dz of [-length/2,length/2])
    assert.ok(isLand(x,z+dz),`${id} is unsupported on dock at ${x},${z+dz}`);
   assert.ok(!nearbyBuildings(e.x,e.z,12).some(building=>contact(body(e),{...building,yaw:0})),`${id} hits a dock obstacle`);
  }
 }
 drive(0,-180,0,(_,z)=>z< -240);
 drive(0,-1250,Math.PI,(_,z)=>z> -1090);
});
test('shore blocks grounded cars while water landings recover to a safe surface',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];Object.assign(car,{x:80,z:0,yaw:-Math.PI/2,speed:10});
 for(let i=0;i<60;i++)step(world,new Map([['p',{...NEUTRAL,throttle:1}]]),.05);
 assert.ok(isLand(car.x,car.z));assert.ok(car.x<100);
 Object.assign(car,{x:130,z:-20,y:.1,vy:-5,speed:0,supportId:null});
 step(world,new Map(),.05);assert.ok(isSurface(car.x,car.z));assert.equal(car.y,0);
});
test('parked vehicles and stations begin on land outside collision buildings',()=>{
 const world=createWorld();
 for(const e of world.entities.filter(e=>e.id.startsWith('parked-'))){
  assert.ok(isSurface(e.x,e.z),e.id);
  assert.ok(!nearbyBuildings(e.x,e.z,10).some(b=>contact(body(e),{...b,yaw:0})),e.id);
 }
 for(const station of STATIONS)assert.ok(isLand(station.x,station.z),station.id);
 assert.ok(BUILDINGS.length>100);
});

test('Supercharger lots are on flat land, clear of buildings and roads, with usable stalls',()=>{
 for(const station of STATIONS){
  const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`)!;
  assert.ok(lot,station.id);
  const footprint={x:station.x,z:station.z,w:CHARGER_LOT.width,d:CHARGER_LOT.length,yaw:0};
  for(const dx of [-12,0,12])for(const dz of [-12,0,12])assert.equal(terrainHeight(station.x+dx,station.z+dz),0,station.id);
  assert.ok(!nearbyBuildings(station.x,station.z,30).some(b=>contact(footprint,{...b,yaw:0})),`${station.id} building`);
  assert.ok(!ROADS.some(r=>contact(footprint,{...r,yaw:r.angle??0})),`${station.id} road`);
  assert.equal(lot.stalls.length,4);
  for(const stall of stationStalls(station))for(const kind of VEHICLE_IDS){
   assert.ok(VEHICLES[kind].width<=stall.width&&VEHICLES[kind].length<=stall.length,`${stall.id}: ${kind}`);
  }
 }
});

test('Bay highway shoulders are supported and its lanes clear the largest truck',()=>{
 for(const highway of HIGHWAYS)for(let i=1;i<highway.points.length;i++){
  const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  assert.ok(length>0,`${highway.id} segment ${i}`);
  const samples=Math.ceil(length/20);
  for(let n=0;n<=samples;n++)for(const offset of [-20,-9,0,9,20]){
   const x=a.x+dx*n/samples+dz/length*offset,z=a.z+dz*n/samples-dx/length*offset;
   assert.ok(isLand(x,z),`${highway.id} segment ${i}: unsupported at ${x},${z}`);
   if(Math.abs(offset)>9)continue;
   const car=makeEntity('clearance','waymo-peterbilt',x,z);car.yaw=Math.atan2(-dx,-dz);
   assert.ok(!nearbyBuildings(x,z,12).some(building=>contact(body(car),{...building,yaw:0})),`${highway.id} segment ${i}: blocked at ${x},${z}`);
  }
 }
 const length=BAY_CIRCUIT.reduce((sum,a,i)=>{const b=BAY_CIRCUIT[(i+1)%BAY_CIRCUIT.length];return sum+Math.hypot(b.x-a.x,b.z-a.z);},0);
 assert.ok(length>19_000&&length<21_000,`unexpected circuit length ${length}`);
 assert.deepEqual(HIGHWAYS[0].points.at(-1),HIGHWAYS[1].points[0]);
});

test('landmarks and their delivery arrivals share supported, collision-clear geography',()=>{
 assert.equal(LANDMARKS.length,5);
 for(const landmark of LANDMARKS){
  assert.ok(BUILDINGS.some(b=>b.x===landmark.x&&b.z===landmark.z&&b.style===landmark.style),landmark.id);
  for(const sx of [-1,1])for(const sz of [-1,1])assert.ok(isLand(landmark.x+sx*landmark.w/2,landmark.z+sz*landmark.d/2),landmark.id);
  const {x,z}=landmark.arrival,truck=makeEntity('landmark','waymo-peterbilt',x,z);
  assert.ok(isSurface(x,z),landmark.id);
  assert.ok(!nearbyBuildings(x,z,12).some(b=>contact(body(truck),{...b,yaw:0})),landmark.id);
 }
 for(let x=AIRPORT_RUNWAY.x-AIRPORT_RUNWAY.w/2;x<=AIRPORT_RUNWAY.x+AIRPORT_RUNWAY.w/2;x+=10)
  for(let z=AIRPORT_RUNWAY.z-AIRPORT_RUNWAY.d/2;z<=AIRPORT_RUNWAY.z+AIRPORT_RUNWAY.d/2;z+=10)assert.ok(isSurface(x,z),'runway');
 for(const island of LAKE_MERRITT.islands)assert.ok(isLand(island.x,island.z),'decorative island');
 assert.ok(!isSurface(MYSTERY_YACHT.x,MYSTERY_YACHT.z),'fictional yacht is offshore');
});

test('autopilot can cross the Bay and return without teleporting',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 player.delivery.level=3;car.yaw=-Math.PI/2;world.entities=[car];world.pickups=[];assert.ok(toggleAutopilot(world,'p'));let furthest=car.x;
 for(let i=0;i<2400;i++){const x=car.x,z=car.z;step(world,new Map(),.05);assert.ok(Math.hypot(car.x-x,car.z-z)<2);furthest=Math.max(furthest,car.x);}
 assert.ok(furthest>330);assert.ok(car.x<100);assert.equal(car.autopilot,true);
});

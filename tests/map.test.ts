import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,NEUTRAL,step,toggleAutopilot} from '../shared/game';
import {AIRPORT_RUNWAY,BAY_CIRCUIT,BRIDGES,BUILDINGS,EXTRA_LANDMARKS,FERRY_DOCKS,HIGHWAYS,ISLAND_TRACK,LAKE_MERRITT,LANDMARKS,MYSTERY_YACHT,NATURAL_HILLS,ROADS,TESLAND_MONUMENTS,isLand,isRocketIsland,isSurface,nearbyBuildings,terrainHeight} from '../shared/map';
import {STATIONS} from '../shared/stations';
import {PARKING_LOTS} from '../shared/parking-lots';
import {fitsParkingStall} from '../shared/parking';
import {FERRY_DECK} from '../shared/ferry';
import {ROUTES} from '../shared/traffic';
import {BILLBOARDS,BILLBOARD_WIDTH} from '../shared/billboards';
import {RACE_COURSES} from '../shared/race-courses';
import {body,contact} from '../shared/physics';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {DOME} from '../shared/dome';
import {ovalBankSurface} from '../shared/oval-bank';

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
 // The dome is on the SF waterfront, separate from the island.
 assert.ok(isLand(DOME.x,DOME.z));
 assert.ok(!isRocketIsland(DOME.x,DOME.z));
 assert.ok(!isLand(300,-850),'the old Alcatraz arena land is gone');
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
test('the stadium street approach is supported and clear of the bank and parking',()=>{
 const road=ROADS.find(r=>r.x===DOME.x&&r.z===(120+DOME.z-DOME.flatHalfWidth)/2&&r.w===18);
 assert.ok(road,'the shared approach is also rendered as a road');
 for(let z=120;z<=DOME.z-DOME.flatHalfWidth;z+=4)for(let x=road.x-8;x<=road.x+8;x+=4){
  assert.equal(terrainHeight(x,z),0,`approach unsupported at ${x},${z}`);
  assert.ok(!isRocketIsland(x,z),`approach must be on city land at ${x},${z}`);
  assert.equal(ovalBankSurface(x,z),null,`bank crosses the approach at ${x},${z}`);
  assert.ok(!nearbyBuildings(x,z,7).some(b=>contact({x,z,w:1,d:1,yaw:0},{...b,yaw:0})),`building on the approach at ${x},${z}`);
 }
 const approach={...road,yaw:road.angle??0};
 for(const lot of PARKING_LOTS){
  const area={x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw};
  assert.equal(contact(approach,area),null,`${lot.id} overlaps the Dome approach`);
 }
 for(const other of ROADS.filter(r=>r.kind==='island'))
  assert.equal(contact(approach,{...other,yaw:other.angle??0}),null,'the approach does not overlay a race course');
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

test('the Rocket Dome plaza and street entrance are clear of city buildings and billboards',()=>{
 const plaza={x:DOME.x,z:DOME.z+7.5,w:192,d:145,yaw:0};
 const entrance={x:DOME.x,z:(120+DOME.z-DOME.flatHalfWidth)/2,w:28,d:DOME.z-DOME.flatHalfWidth-120,yaw:0};
 for(const area of [plaza,entrance]){
  for(const building of BUILDINGS)assert.equal(contact(area,{...building,yaw:0}),null,`building at ${building.x},${building.z}`);
  for(const billboard of BILLBOARDS)assert.equal(contact(area,{...billboard,w:BILLBOARD_WIDTH,d:.35}),null,`billboard at ${billboard.x},${billboard.z}`);
 }
 assert.ok(!EXTRA_LANDMARKS.some(place=>place.id==='oracle-park'),'the Rocket Dome replaces the miniature ballpark');
});

test('charger playgrounds, posts and pickups clear roads, buildings, spawns and ferry',()=>{
 const world=createWorld();
 const ferry={x:0,z:(FERRY_DOCKS.sf.deckZ+FERRY_DOCKS.island.deckZ)/2,w:FERRY_DECK.width,
  d:Math.abs(FERRY_DOCKS.sf.deckZ-FERRY_DOCKS.island.deckZ)+FERRY_DECK.length,yaw:0};
 const largestRadius=Math.max(...VEHICLE_IDS.map(id=>Math.hypot(VEHICLES[id].width,VEHICLES[id].length)/2));
 for(const station of STATIONS){
  const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`)!;
  assert.ok(lot,station.id);
  const area={x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw};
  const approach={x:lot.approach.x,z:lot.approach.z,w:lot.approach.width,d:lot.approach.length,yaw:lot.approach.yaw};
  const pad={x:lot.pickup.x,z:lot.pickup.z,w:14,d:14,yaw:0};
  assert.equal(contact(area,{x:DOME.x,z:DOME.z+7.5,w:192,d:145,yaw:0}),null,`${station.id}: stadium plaza`);
  assert.equal(contact(pad,approach),null,`${station.id}: pickup clears queue`);
  assert.equal(contact(area,ferry),null,`${station.id}: ferry`);
  for(const other of PARKING_LOTS)if(other.id!==lot.id)assert.equal(contact(area,{x:other.area.x,z:other.area.z,w:other.area.width,d:other.area.length,yaw:other.area.yaw}),null,`${station.id}: overlaps ${other.id}`);
  for(const dx of [-20,-10,0,10,20])for(const dz of [-20,-10,0,10,20])
   assert.equal(terrainHeight(station.x+dx,station.z+dz),0,`${station.id}: land`);
  for(const r of ROADS){
   const road={...r,yaw:r.angle??0};
   assert.equal(contact(area,road),null,`${station.id}: road`);
   assert.equal(contact(pad,road),null,`${station.id}: pickup near road`);
  }
  for(const b of BUILDINGS)assert.equal(contact(area,{...b,yaw:0}),null,`${station.id}: building`);
  for(const e of world.entities)assert.equal(contact(area,body(e)),null,`${station.id}: spawn ${e.id}`);
  assert.equal(lot.stalls.length,4,station.id);
  for(const stall of lot.stalls){
   const post={x:stall.x,z:stall.z-stall.length/2-.8,w:1.16,d:.6,yaw:0};
   assert.equal(terrainHeight(post.x,post.z),0,`${stall.id}: post support`);
   for(const r of ROADS)assert.equal(contact(post,{...r,yaw:r.angle??0}),null,`${stall.id}: post road clearance`);
   for(const b of BUILDINGS)assert.equal(contact(post,{...b,yaw:0}),null,`${stall.id}: post building clearance`);
   for(const kind of VEHICLE_IDS){
    const car=makeEntity('fit',kind,stall.x,stall.z);car.yaw=stall.yaw;
    assert.equal(fitsParkingStall(stall,car),true,`${stall.id}: ${kind}`);
   }
  }
  // A maximum-size vehicle centered on any authored traffic segment remains clear.
  for(const route of ROUTES)for(let i=0;i<route.length;i++){
   const a=route[i],b=route[(i+1)%route.length],samples=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
   for(let n=0;n<=samples;n++){
    const t=samples?n/samples:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    const distance=Math.hypot(Math.max(0,Math.abs(x-area.x)-area.w/2),Math.max(0,Math.abs(z-area.z)-area.d/2));
    assert.ok(distance>=largestRadius,`${station.id}: traffic route near lot`);
   }
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
 assert.equal(LANDMARKS.length,6);
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

test('new building landmarks share collision identities and remain distinct from the prior landmarks',()=>{
 assert.equal(EXTRA_LANDMARKS.length,100);
 assert.equal(new Set([...LANDMARKS,...EXTRA_LANDMARKS].map(place=>place.id)).size,106);
 for(const place of EXTRA_LANDMARKS){
  const matching=BUILDINGS.filter(b=>b.style==='landmark'&&b.x===place.x&&b.z===place.z);
  if(place.id==='mission-peak')assert.equal(matching.length,0);
  else {assert.equal(matching.length,1,place.id);assert.equal(matching[0].h,place.h,place.id);}
 }
});

test('Tesland monument bases are supported, collision-backed and clear of roads and landmarks',()=>{
 for(const monument of TESLAND_MONUMENTS){
  const base=BUILDINGS.find(b=>b.style==='monument'&&b.x===monument.x&&b.z===monument.z);
  assert.ok(base,monument.id);
  assert.equal(base.h,monument.h);
  for(const sx of [-1,1])for(const sz of [-1,1])assert.equal(terrainHeight(monument.x+sx*monument.w/2,monument.z+sz*monument.d/2),0,monument.id);
  const footprint={...monument,yaw:0};
  for(const road of ROADS)assert.equal(contact(footprint,{...road,yaw:road.angle??0}),null,`${monument.id} overlaps a road`);
  for(const building of BUILDINGS)if(building!==base)assert.equal(contact(footprint,{...building,yaw:0}),null,`${monument.id} overlaps a building`);
 }
});

test('new landmarks, hills and signs clear parking, ferry and race gameplay areas',()=>{
 const features=[
  ...EXTRA_LANDMARKS.filter(place=>place.id!=='mission-peak').map(place=>({id:place.id,x:place.x,z:place.z,w:place.w,d:place.d,yaw:0})),
  ...NATURAL_HILLS.map(hill=>({id:hill.id,x:(hill.minX+hill.maxX)/2,z:(hill.minZ+hill.maxZ)/2,w:hill.maxX-hill.minX,d:hill.maxZ-hill.minZ,yaw:0})),
  ...BILLBOARDS.map((sign,i)=>({id:`billboard-${i}`,x:sign.x,z:sign.z,w:BILLBOARD_WIDTH+.35,d:1,yaw:sign.yaw})),
 ];
 const areas=[
  ...PARKING_LOTS.flatMap(lot=>[lot.area,lot.approach].map((area,i)=>({id:`${lot.id}:${i?'approach':'lot'}`,x:area.x,z:area.z,w:area.width,d:area.length,yaw:area.yaw}))),
  ...RACE_COURSES.flatMap(course=>course.gates.map(gate=>({id:`${course.id}:${gate.id}`,x:gate.x,z:gate.z,w:gate.width,d:12,yaw:gate.yaw}))),
  ...ROADS.filter(road=>road.kind==='island').map((road,i)=>({id:`island-road-${i}`,...road,yaw:road.angle??0})),
  {id:'sf-ferry-approach',x:0,z:-225,w:24,d:60,yaw:0},
  {id:'ferry-corridor',x:0,z:(FERRY_DOCKS.sf.deckZ+FERRY_DOCKS.island.deckZ)/2,w:24,d:FERRY_DOCKS.sf.deckZ-FERRY_DOCKS.island.deckZ,yaw:0},
 ];
 for(const area of areas)for(const feature of features){
  assert.ok(!contact(area,feature),`${feature.id} overlaps ${area.id}`);
 }
});

test('autopilot can cross the Bay and return without teleporting',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 player.delivery.level=3;car.yaw=-Math.PI/2;world.entities=[car];world.pickups=[];assert.ok(toggleAutopilot(world,'p'));let furthest=car.x;
 for(let i=0;i<2400;i++){const x=car.x,z=car.z;step(world,new Map(),.05);assert.ok(Math.hypot(car.x-x,car.z-z)<2);furthest=Math.max(furthest,car.x);}
 assert.ok(furthest>330);assert.ok(car.x<100);assert.equal(car.autopilot,true);
});

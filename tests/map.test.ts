import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,makeEntity,NEUTRAL,step,toggleAutopilot} from '../shared/game';
import {BAY_CIRCUIT,BRIDGES,BUILDINGS,FERRY_DOCKS,HIGHWAYS,ISLAND_TRACK,ROADS,isLand,isRocketIsland,isSurface,nearbyBuildings,terrainHeight} from '../shared/map';
import {STATIONS} from '../shared/stations';
import {PARKING_LOTS} from '../shared/parking-lots';
import {fitsParkingStall} from '../shared/parking';
import {FERRY_DECK} from '../shared/ferry';
import {ROUTES} from '../shared/traffic';
import {body,contact} from '../shared/physics';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {DOME} from '../shared/dome';

function drive(x:number,z:number,yaw:number,goal:(x:number,z:number)=>boolean){
 const world=createWorld(),player=addPlayer(world,'crossing','Crossing');
 const car=world.entities.find(e=>e.id===player.entityId)!;
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
 // The existing Alcatraz dome and new playground have separate safety boundaries.
 assert.ok(isLand(DOME.x,DOME.z));
 assert.ok(!isRocketIsland(DOME.x,DOME.z));
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
  assert.equal(contact(pad,approach),null,`${station.id}: pickup clears queue`);
  assert.equal(contact(area,ferry),null,`${station.id}: ferry`);
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

test('autopilot can cross the Bay and return without teleporting',()=>{
 const world=createWorld(),player=addPlayer(world,'p','P'),car=world.entities.find(e=>e.id===player.entityId)!;
 world.entities=[car];world.pickups=[];assert.ok(toggleAutopilot(world,'p'));let furthest=car.x;
 for(let i=0;i<2400;i++){const x=car.x,z=car.z;step(world,new Map(),.05);assert.ok(Math.hypot(car.x-x,car.z-z)<2);furthest=Math.max(furthest,car.x);}
 assert.ok(furthest>330);assert.ok(car.x<100);assert.equal(car.autopilot,true);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUSTOMERS,LEVELS,requiredLevelAt} from '../shared/delivery';
import {addPlayer,createWorld,makeEntity,step} from '../shared/game';
import {isBridge,isRocketIsland,isSurface,nearbyBuildings,ROADS,terrainHeight} from '../shared/map';
import {DELIVERY_DESTINATION_SNAP,planNavigation} from '../shared/navigation';
import {PARKING_LOTS} from '../shared/parking-lots';
import {body,contact} from '../shared/physics';
import {STATIONS} from '../shared/stations';
import {ROUTES} from '../shared/traffic';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';

type Pose={x:number;z:number;yaw:number};
const campusLoop=[{x:393,z:-237},{x:507,z:-237},{x:507,z:-123},{x:393,z:-123}];
const campus=()=>CUSTOMERS.find(customer=>customer.id==='landmark-berkeley')!;
const berkeleyPoses=():Pose[]=>JSON.parse(readFileSync(new URL('./fixtures/delivery-location-routes.json',import.meta.url),'utf8')).berkeley;
function paved(x:number,z:number):boolean {
 return ROADS.some(road=>{
  const dx=x-road.x,dz=z-road.z,angle=road.angle??0,c=Math.cos(angle),s=Math.sin(angle);
  return Math.abs(dx*c-dz*s)<=road.w/2&&Math.abs(dx*s+dz*c)<=road.d/2;
 });
}

test('Berkeley campus lane stays paved, supported and clear for the largest vehicle and every charger',()=>{
 assert.ok(ROUTES.some(route=>JSON.stringify(route)===JSON.stringify(campusLoop)),'the campus loop is registered in the authoritative routes');
 const largestId=VEHICLE_IDS.reduce((largest,id)=>
  Math.hypot(VEHICLES[id].width,VEHICLES[id].length)>Math.hypot(VEHICLES[largest].width,VEHICLES[largest].length)?id:largest);
 const vehicle=VEHICLES[largestId],radius=Math.hypot(vehicle.width,vehicle.length)/2;
 for(let i=0;i<campusLoop.length;i++){
  const a=campusLoop[i],b=campusLoop[(i+1)%campusLoop.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  const fx=dx/length,fz=dz/length,rx=-fz,rz=fx,samples=Math.ceil(length);
  for(let n=0;n<=samples;n++){
   const t=n/samples,x=a.x+dx*t,z=a.z+dz*t;
   assert.equal(requiredLevelAt(x,z),1);
   assert.equal(terrainHeight(x,z),0);
   assert.ok(!isBridge(x,z)&&!isRocketIsland(x,z));
   const car=makeEntity('campus-clearance',largestId,x,z);car.yaw=Math.atan2(-dx,-dz);
   for(const forward of [-vehicle.length/2,0,vehicle.length/2])for(const side of [-vehicle.width/2,0,vehicle.width/2]){
    const px=x+fx*forward+rx*side,pz=z+fz*forward+rz*side;
    assert.ok(isSurface(px,pz)&&paved(px,pz),`vehicle footprint leaves paved ground at ${px},${pz}`);
   }
   assert.ok(!nearbyBuildings(x,z,radius+5).some(building=>contact(body(car),{...building,yaw:0})),`building at ${x},${z}`);
   for(const station of STATIONS){
    const lot=PARKING_LOTS.find(place=>place.id===`charger-${station.id}`)!;
    const distance=Math.hypot(Math.max(0,Math.abs(x-lot.area.x)-lot.area.width/2),Math.max(0,Math.abs(z-lot.area.z)-lot.area.length/2));
    assert.ok(distance>=radius,`${station.id}: campus lane near charger lot`);
   }
  }
 }
});

test('historic Berkeley landmark remains reachable from and returns to each authored Berkeley stop',()=>{
 const target=campus();assert.equal(target.x,510);assert.equal(target.z,-240);
 const origin=makeEntity('campus-origin','model-3',target.x,target.z);origin.yaw=-Math.PI/2;
 for(const pose of berkeleyPoses()){
  const car=makeEntity('campus-start','model-3',pose.x,pose.z);car.yaw=pose.yaw;
  assert.ok(planNavigation(car,target,1,DELIVERY_DESTINATION_SNAP),`${pose.x},${pose.z} to Berkeley landmark`);
  assert.ok(planNavigation(origin,pose,1,DELIVERY_DESTINATION_SNAP),`Berkeley landmark to ${pose.x},${pose.z}`);
 }
});

test('empty-world cars reach the Berkeley landmark and drive back from their actual arrived pose',()=>{
 const poses=berkeleyPoses(),target=campus();
 for(const pose of [poses[0],poses[Math.floor(poses.length/2)],poses.at(-1)!]){
  const world=createWorld(),player=addPlayer(world,'campus-driver','Driver');
  player.delivery.level=1;player.delivery.cash=LEVELS[1].cash+1;
  const car=world.entities.find(entity=>entity.id===player.entityId)!;
  world.entities=[car];world.pickups=[];Object.assign(car,pose,{speed:0,vx:0,vz:0});
  for(const destination of [target,pose]){
   const navigation=planNavigation(car,destination,1,DELIVERY_DESTINATION_SNAP);
   assert.ok(navigation,`trip to ${destination.x},${destination.z} planned`);
   car.navigation=navigation;car.autopilot=true;
   for(let tick=0;tick<6000&&car.autopilot;tick++)step(world,new Map(),.05);
   assert.equal(car.navigation?.status,'arrived');
   assert.ok(Math.hypot(car.x-destination.x,car.z-destination.z)<9);
   assert.equal(car.health,100);
  }
 }
});

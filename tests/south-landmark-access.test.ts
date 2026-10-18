import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANDMARKS,ROADS,terrainHeight,isSurface,isBridge,isRocketIsland,inDomePlaza,nearbyBuildings,rampHeight} from '../shared/map';
import {LEVELS} from '../shared/delivery';
import {LANDMARK_ACCESS_ROADS,LANDMARK_ACCESS_ROUTES} from '../shared/landmark-access-roads';
import {TOWN_DELIVERY_LAYOUTS,TOWN_DELIVERY_ROUTES} from '../shared/town-delivery-roads';
import {PARKING_LOTS} from '../shared/parking-lots';
import {STATIONS} from '../shared/stations';
import {VEHICLES,VEHICLE_IDS} from '../shared/vehicles';
import {body,contact} from '../shared/physics';
import {createEmptyWorld,addPlayer,step,makeEntity} from '../shared/game';
import {planNavigation,DELIVERY_DESTINATION_SNAP} from '../shared/navigation';
import {CALTRAIN_STOPS} from '../shared/caltrain';
import {SHOPS} from '../shared/upgrades';

type Point={x:number;z:number};
type Stop=Point&{segment:number};
const fixture=JSON.parse(readFileSync(new URL('./fixtures/town-delivery-stops.json',import.meta.url),'utf8')) as Record<string,{stops:Stop[]}>;
const cases=[
 {id:'mission-san-jose',town:'fremont',target:{x:1770,z:6035},exitYaw:Math.PI/2},
 {id:'san-jose-city-hall',town:'san-jose',target:{x:1705,z:8730},exitYaw:0},
];
const level=LEVELS[LEVELS.length-1].level;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const roads=LANDMARK_ACCESS_ROADS.filter(road=>road.x>1000);
const routes=LANDMARK_ACCESS_ROUTES.filter(route=>route[0].x>1000);
function edge(p:Point){
 let best=Infinity;
 for(const r of ROADS){
  if(r.kind==='island')continue;
  const dx=p.x-r.x,dz=p.z-r.z,angle=r.angle??0,c=Math.cos(angle),s=Math.sin(angle);
  best=Math.min(best,Math.max(Math.abs(dx*c-dz*s)-r.w/2,Math.abs(dx*s+dz*c)-r.d/2));
 }
 return best;
}
function carAt(p:Stop,route:Point[]){
 const a=route[p.segment],b=route[(p.segment+1)%route.length],car=makeEntity('probe','model-3',p.x,p.z);
 car.yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));return car;
}

test('Mission and City Hall access roads are supported and clear for the largest vehicle',()=>{
 assert.equal(roads.length,8);assert.equal(routes.length,4);
 for(const [i,road] of roads.entries()){
  assert.ok(ROADS.includes(road));const box={...road,yaw:road.angle??0};
  for(const lot of PARKING_LOTS)assert.equal(contact(box,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`road ${i}: lot ${lot.id}`);
  for(const b of nearbyBuildings(road.x,road.z,Math.max(road.w,road.d)/2+20))assert.equal(contact(box,{...b,yaw:0}),null,`road ${i}: building ${b.x},${b.z}`);
  const n=Math.ceil(Math.max(road.w,road.d)/5);
  for(let j=0;j<=n;j++)for(const across of [-8,0,8]){
   const along=(j/n-.5)*Math.max(road.w,road.d),x=road.x+(road.axis==='x'?along:across),z=road.z+(road.axis==='x'?across:along);
   assert.ok(isSurface(x,z)&&!isBridge(x,z)&&!isRocketIsland(x,z)&&!inDomePlaza(x,z)&&rampHeight(x,z)===null,`road ${i}: unsupported ${x},${z}`);
   assert.ok((terrainHeight(x,z)??Infinity)<=.5,`road ${i}: terrain ${x},${z}`);
   assert.ok(!SHOPS.some(s=>Math.hypot(s.x-x,s.z-z)<12),`road ${i}: shop ${x},${z}`);
   assert.ok(!CALTRAIN_STOPS.some(s=>Math.abs(x-s.platform.x)<26&&Math.abs(z-s.platform.z)<7),`road ${i}: platform ${x},${z}`);
  }
 }
 const largestId=VEHICLE_IDS.reduce((a,b)=>Math.hypot(VEHICLES[b].width,VEHICLES[b].length)>Math.hypot(VEHICLES[a].width,VEHICLES[a].length)?b:a);
 const largest=VEHICLES[largestId],radius=Math.hypot(largest.width,largest.length)/2;
 for(const [ri,route] of routes.entries())for(let i=0;i<route.length;i++){
  const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=distance(a,b),n=Math.ceil(length),fx=dx/length,fz=dz/length,rx=-fz,rz=fx;
  for(let j=0;j<=n;j++){
   const x=a.x+dx*j/n,z=a.z+dz*j/n,car=makeEntity('largest-clearance',largestId,x,z);car.yaw=Math.atan2(-dx,-dz);
   assert.ok(!nearbyBuildings(x,z,radius+5).some(building=>contact(body(car),{...building,yaw:0})),`route ${ri}: building at ${x},${z}`);
   for(const f of [-largest.length/2,0,largest.length/2])for(const s of [-largest.width/2,0,largest.width/2]){
    const p={x:x+fx*f+rx*s,z:z+fz*f+rz*s};assert.ok(isSurface(p.x,p.z)&&edge(p)<=0,`route ${ri}: vehicle footprint off pavement ${p.x},${p.z}`);
   }
   for(const station of STATIONS){
    const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`);assert.ok(lot,station.id);
    const clearance=Math.hypot(Math.max(0,Math.abs(x-lot.area.x)-lot.area.width/2),Math.max(0,Math.abs(z-lot.area.z)-lot.area.length/2));
    assert.ok(clearance>=radius,`route ${ri}: ${station.id} clearance ${clearance}`);
   }
  }
 }
});

test('both preserved landmark arrivals connect to every authored stop in their town',()=>{
 for(const c of cases){
  const landmark=LANDMARKS.find(l=>l.id===c.id);assert.deepEqual(landmark?.arrival,c.target);
  const index=TOWN_DELIVERY_LAYOUTS.findIndex(t=>t.id===c.town),route=TOWN_DELIVERY_ROUTES[index*2],stops=fixture[c.town].stops;
  assert.ok(route,c.town);assert.equal(stops.length,20,c.town);
  for(const [i,p] of stops.entries()){
   const start=carAt(p,route),from=makeEntity('landmark-origin','model-3',c.target.x,c.target.z);from.yaw=c.exitYaw;
   assert.ok(planNavigation(start,c.target,level,DELIVERY_DESTINATION_SNAP),`${c.id}: ${i} -> landmark`);
   assert.ok(planNavigation(from,p,level,DELIVERY_DESTINATION_SNAP),`${c.id}: landmark -> ${i}`);
  }
 }
});

test('cars reach both historic landmarks and return from the actual arrival pose without leaving pavement',()=>{
 for(const c of cases){
  const index=TOWN_DELIVERY_LAYOUTS.findIndex(t=>t.id===c.town),route=TOWN_DELIVERY_ROUTES[index*2],stops=fixture[c.town].stops;
  for(const p of [stops[0],stops[19]]){
   const start=carAt(p,route),world=createEmptyWorld(),player=addPlayer(world,'probe','Probe'),car=world.entities.find(e=>e.id===player.entityId)!;
   Object.assign(car,{x:p.x,z:p.z,y:terrainHeight(p.x,p.z)??0,yaw:start.yaw,supportId:'ground',health:100});player.delivery.level=level;player.delivery.cash=LEVELS[LEVELS.length-1].cash;
   for(const dest of [c.target,p]){
    const navigation=planNavigation(car,dest,level,DELIVERY_DESTINATION_SNAP);assert.ok(navigation);car.navigation=navigation;car.autopilot=true;
    for(let tick=0;tick<16000&&car.autopilot;tick++){
     step(world,new Map(),.05);world.entities=world.entities.filter(e=>e.id===car.id);
     const fx=-Math.sin(car.yaw),fz=-Math.cos(car.yaw),rx=-fz,rz=fx,model=VEHICLES['model-3'];
     for(const f of [-model.length/2,0,model.length/2])for(const s of [-model.width/2,0,model.width/2]){
      const point={x:car.x+fx*f+rx*s,z:car.z+fz*f+rz*s};assert.ok(edge(point)<=0,`${c.id}: vehicle footprint left pavement at ${point.x},${point.z}`);
     }
    }
    assert.equal(car.navigation?.status,'arrived',c.id);assert.ok(distance(car,dest)<9,c.id);assert.equal(car.health,100,c.id);
   }
  }
 }
});

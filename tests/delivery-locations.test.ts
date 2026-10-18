import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ADDED_CUSTOMERS, ADDED_RESTAURANTS, HISTORIC_CUSTOMER_AREAS, HISTORIC_RESTAURANT_DETAILS} from '../shared/delivery-locations';
import {CUSTOMERS, RESTAURANTS, requiredLevelAt} from '../shared/delivery';
import {MARIN_ARRIVAL_POINTS} from '../shared/marin-roads';
import {inDomePlaza, isBridge, isRocketIsland, isSurface, nearbyBuildings, terrainHeight} from '../shared/map';
import {NORTH_LANDMARKS} from '../shared/north-landmarks';
import {PARKING_LOTS} from '../shared/parking-lots';
import {ROUTES} from '../shared/traffic';
import {SHOPS} from '../shared/upgrades';

const historicGround=[...RESTAURANTS,...CUSTOMERS.filter(place=>!place.rooftop)];
const added=[...ADDED_RESTAURANTS,...ADDED_CUSTOMERS];
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function laneHeading(p:{x:number;z:number}):number{
 let bestDistance=Infinity,bestYaw=0;
 for(const route of ROUTES)for(let i=0;i<route.length;i++){
  const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  if(d<bestDistance){bestDistance=d;bestYaw=Math.atan2(-dx,-dz);}
 }
 return bestYaw;
}

test('historical saved indices retain their exact prefix and all have town metadata',()=>{
 assert.deepEqual(RESTAURANTS.map(place=>place.id),['tartine','tonys','burma','nanking','homeroom','comal']);
 assert.deepEqual(CUSTOMERS.map(place=>place.id),['poly','fog','cable','coast','oak','lake','port',
  'landmark-berkeley','landmark-sfo','landmark-stanford','landmark-mission-san-jose',
  'landmark-san-jose-city-hall','landmark-ucsf','roof-sf--78--90','roof-sf-42-150','roof-oakland-350--30']);
 assert.deepEqual(Object.keys(HISTORIC_RESTAURANT_DETAILS).sort(),RESTAURANTS.map(place=>place.id).sort());
 assert.deepEqual(Object.keys(HISTORIC_CUSTOMER_AREAS).sort(),CUSTOMERS.map(place=>place.id).sort());
});

test('new places have stable unique IDs, source-backed food details, and distinct fictional customers',()=>{
 const ids=[...RESTAURANTS,...CUSTOMERS,...added].map(place=>place.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.equal(new Set(ADDED_CUSTOMERS.map(place=>place.name)).size,ADDED_CUSTOMERS.length);
 const icons=new Set(['pizza','burger','sandwich','noodles','taco','bakery','bowl','plate']);
 for(const place of ADDED_RESTAURANTS){
  assert.ok(place.address&&place.cuisine&&place.signatureDish,place.id);
  assert.ok(icons.has(place.cuisineIcon),place.id);
  assert.equal(new URL(place.sourceUrl).protocol,'https:',place.id);
  if(place.menuUrl)assert.equal(new URL(place.menuUrl).protocol,'https:',place.id);
 }
});

test('new handoffs fit supported land, clear geometry and do not overlap other stops',()=>{
 for(const [i,p] of added.entries()){
  assert.ok(isSurface(p.x,p.z)&&!isBridge(p.x,p.z)&&!isRocketIsland(p.x,p.z)&&!inDomePlaza(p.x,p.z),p.id);
  assert.notEqual(terrainHeight(p.x,p.z),null,p.id);
  for(const dx of [-3,3])for(const dz of [-3,3])assert.ok(isSurface(p.x+dx,p.z+dz),p.id);
  assert.ok(!nearbyBuildings(p.x,p.z,8).some(b=>Math.abs(p.x-b.x)<b.w/2+4&&Math.abs(p.z-b.z)<b.d/2+4),p.id);
  assert.ok(NORTH_LANDMARKS.every(landmark=>distance(p,landmark)>=24),p.id);
  assert.ok(SHOPS.every(shop=>distance(p,shop)>=18),p.id);
  assert.ok(PARKING_LOTS.every(lot=>Math.abs(p.x-lot.area.x)>=lot.area.width/2+6||Math.abs(p.z-lot.area.z)>=lot.area.length/2+6),p.id);
  for(const old of historicGround)assert.ok(distance(p,old)>=18,`${p.id} overlaps ${old.id}`);
  for(const q of added.slice(i+1))assert.ok(distance(p,q)>=18,`${p.id} overlaps ${q.id}`);
 }
});

test('each authored city has ten pickups and ten customers including its historical prefix',()=>{
 for(const cityId of ['san-francisco','oakland','berkeley','emeryville'] as const){
  const pickups=RESTAURANTS.filter(place=>HISTORIC_RESTAURANT_DETAILS[place.id].cityId===cityId).length+
   ADDED_RESTAURANTS.filter(place=>place.cityId===cityId).length;
  const customers=CUSTOMERS.filter(place=>HISTORIC_CUSTOMER_AREAS[place.id as keyof typeof HISTORIC_CUSTOMER_AREAS]?.cityId===cityId).length+
   ADDED_CUSTOMERS.filter(place=>place.cityId===cityId).length;
  assert.equal(pickups,10,cityId);assert.equal(customers,10,cityId);
 }
});

test('each Marin town uses ten pickup and ten customer arrival points at level zero',()=>{
 for(const cityId of ['mill-valley','corte-madera'] as const){
  const pickups=ADDED_RESTAURANTS.filter(place=>place.cityId===cityId);
  const customers=ADDED_CUSTOMERS.filter(place=>place.cityId===cityId);
  assert.equal(pickups.length,10,cityId);assert.equal(customers.length,10,cityId);
  const expected=MARIN_ARRIVAL_POINTS[cityId].map(p=>`${p.x},${p.z}`).sort();
  assert.deepEqual([...pickups,...customers].map(p=>`${p.x},${p.z}`).sort(),expected,cityId);
  for(const place of [...pickups,...customers])assert.equal(requiredLevelAt(place.x,place.z),0,place.id);
 }
});

test('authored city stops route between every pair from a sampled lane heading',async()=>{
 const {readFileSync}=await import('node:fs');
 const {makeEntity}=await import('../shared/game');
 const {planNavigation,DELIVERY_DESTINATION_SNAP}=await import('../shared/navigation');
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/delivery-location-routes.json',import.meta.url),'utf8')) as Record<string,{x:number;z:number;yaw:number}[]>;
 assert.deepEqual(Object.keys(fixtures).sort(),[...new Set(added.map(place=>place.cityId))].sort());
 for(const [city,poses] of Object.entries(fixtures)){
  const targets=added.filter(place=>place.cityId===city);
  assert.equal(poses.length,targets.length,city);
  assert.equal(new Set(poses.map(p=>`${p.x},${p.z}`)).size,poses.length,city);
  const level=city==='san-francisco'||city==='mill-valley'||city==='corte-madera'?0:1;
  for(const pose of poses){
   assert.ok(targets.some(p=>distance(p,pose)<.01),`${city}: fixture target`);
   if(city==='mill-valley'||city==='corte-madera'){
    const difference=pose.yaw-laneHeading(pose);
    assert.ok(Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))<1e-9,`${city}: nearest-lane heading`);
   }
   const car=makeEntity('delivery-route-probe','model-3',pose.x,pose.z);car.yaw=pose.yaw;
   for(const target of targets)if(distance(pose,target)>.01)
    assert.ok(planNavigation(car,target,level,DELIVERY_DESTINATION_SNAP),`${city}: ${pose.x},${pose.z} to ${target.id}`);
  }
 }
});

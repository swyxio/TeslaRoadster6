import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ADDED_CUSTOMERS, ADDED_RESTAURANTS, HISTORIC_CUSTOMER_AREAS, HISTORIC_RESTAURANT_DETAILS, type DeliveryCityId} from '../shared/delivery-locations';
import {CUSTOMERS, RESTAURANTS, requiredLevelAt, type Level} from '../shared/delivery';
import {MARIN_ARRIVAL_POINTS} from '../shared/marin-roads';
import {inDomePlaza, isBridge, isRocketIsland, isSurface, nearbyBuildings, terrainHeight} from '../shared/map';
import {NORTH_LANDMARKS} from '../shared/north-landmarks';
import {PARKING_LOTS} from '../shared/parking-lots';
import {SFO_DELIVERY_ROUTES, SFO_DELIVERY_STOPS} from '../shared/sfo-delivery-road';
import {ROUTES} from '../shared/traffic';
import {SHOPS} from '../shared/upgrades';

const historicRestaurants=RESTAURANTS.slice(0,6);
const historicCustomers=CUSTOMERS.slice(0,16);
const historicGround=[...historicRestaurants,...historicCustomers.filter(place=>!place.rooftop)];
const added=[...ADDED_RESTAURANTS,...ADDED_CUSTOMERS];
const cities:readonly DeliveryCityId[]=['san-francisco','oakland','berkeley','emeryville','mill-valley','corte-madera',
 'south-san-francisco','san-mateo','redwood-city','menlo-park','palo-alto','mountain-view',
 'santa-clara','cupertino','san-jose','hayward','fremont'];
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
 assert.deepEqual(historicRestaurants.map(place=>place.id),['tartine','tonys','burma','nanking','homeroom','comal']);
 assert.deepEqual(historicCustomers.map(place=>place.id),['poly','fog','cable','coast','oak','lake','port',
  'landmark-berkeley','landmark-sfo','landmark-stanford','landmark-mission-san-jose',
  'landmark-san-jose-city-hall','landmark-ucsf','roof-sf--78--90','roof-sf-42-150','roof-oakland-350--30']);
 assert.deepEqual(Object.keys(HISTORIC_RESTAURANT_DETAILS).sort(),historicRestaurants.map(place=>place.id).sort());
 assert.deepEqual(Object.keys(HISTORIC_CUSTOMER_AREAS).sort(),historicCustomers.map(place=>place.id).sort());
});

test('the complete saved customer index prefix stays unchanged when the picnic stop is appended',()=>{
 const prefix=CUSTOMERS.slice(0,180).map(place=>place.id);
 // The hash records the ordered catalog immediately before the new stop.
 assert.equal(createHash('sha256').update(JSON.stringify(prefix)).digest('hex'),
  'eb78ee0603081cda9f851d6ba02e9d144522bf6a4495f9fdf0d0733029986821');
 assert.equal(CUSTOMERS[180].id,'customer-south-san-francisco-11');
});

test('new places have stable unique IDs, source-backed food details, and distinct fictional customers',()=>{
 const ids=[...historicRestaurants,...historicCustomers,...added].map(place=>place.id);
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

test('each town has ten pickups and at least ten ground customers excluding landmarks',()=>{
 for(const cityId of cities){
  const pickups=historicRestaurants.filter(place=>HISTORIC_RESTAURANT_DETAILS[place.id].areaId===cityId).length+
   ADDED_RESTAURANTS.filter(place=>place.areaId===cityId).length;
  const customers=[...historicCustomers.filter(place=>!place.id.startsWith('landmark-')&&
   HISTORIC_CUSTOMER_AREAS[place.id as keyof typeof HISTORIC_CUSTOMER_AREAS]?.areaId===cityId),
   ...ADDED_CUSTOMERS.filter(place=>place.areaId===cityId)];
  assert.equal(pickups,10,cityId);assert.equal(customers.filter(place=>!place.rooftop).length,cityId==='south-san-francisco'?11:10,cityId);
  assert.equal(customers.length,cityId==='san-francisco'?12:cityId==='oakland'||cityId==='south-san-francisco'?11:10,cityId);
 }
 assert.deepEqual(ADDED_CUSTOMERS.slice(-4).map(place=>place.id),
  ['customer-san-francisco-05','customer-san-francisco-06','customer-oakland-07','customer-south-san-francisco-11']);
});

test('SFO has its own sourced pickup and fictional customer, plus its historical landmark',()=>{
 const pickups=ADDED_RESTAURANTS.filter(place=>place.areaId==='sfo');
 const customers=ADDED_CUSTOMERS.filter(place=>place.areaId==='sfo');
 assert.deepEqual(pickups.map(place=>place.id),['sfo-bun-mee']);
 assert.deepEqual(customers.map(place=>place.id),['customer-sfo-01']);
 assert.deepEqual([...pickups,...customers].map(p=>`${p.x},${p.z}`).sort(),
  SFO_DELIVERY_STOPS.map(p=>`${p.x},${p.z}`).sort());
 assert.ok(historicCustomers.some(place=>place.id==='landmark-sfo'));
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
 const towns=JSON.parse(readFileSync(new URL('./fixtures/town-delivery-stops.json',import.meta.url),'utf8')) as Record<string,{level:Level;stops:{x:number;z:number;segment:number}[]}>;
 const baselineLevels:Record<string,Level>={'san-francisco':0,'mill-valley':0,'corte-madera':0,oakland:1,berkeley:1,emeryville:1,sfo:2};
 assert.deepEqual(Object.keys(fixtures).sort(),[...new Set(added.map(place=>place.areaId))].sort());
 for(const [area,poses] of Object.entries(fixtures)){
  // The appended picnic stop is intentionally off-lane and has a dedicated
  // assignment and driving test instead of a road-aligned fixture heading.
  const targets=added.filter(place=>place.areaId===area&&place.id!=='customer-south-san-francisco-11');
  assert.equal(poses.length,targets.length,area);
  assert.equal(new Set(poses.map(p=>`${p.x},${p.z}`)).size,poses.length,area);
  const town=towns[area];
  const level=town?.level??baselineLevels[area];
  assert.notEqual(level,undefined,`${area}: unlock level`);
  if(town)assert.deepEqual(poses.map(p=>`${p.x},${p.z}`).sort(),town.stops.map(p=>`${p.x},${p.z}`).sort(),area);
  for(const pose of poses){
   assert.ok(targets.some(p=>distance(p,pose)<.01),`${area}: fixture target`);
   if(area==='mill-valley'||area==='corte-madera'){
    const difference=pose.yaw-laneHeading(pose);
    assert.ok(Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))<1e-9,`${area}: nearest-lane heading`);
   }
   if(town){
    const stop=town.stops.find(p=>distance(p,pose)<.01)!;
    const heading=[-Math.PI/2,-Math.PI,Math.PI/2,0][stop.segment];
    const difference=pose.yaw-heading;
    assert.ok(Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))<1e-9,`${area}: town lane heading`);
   }
   if(area==='sfo'){
    const [a,b]=SFO_DELIVERY_ROUTES[0];
    const difference=pose.yaw-Math.atan2(-(b.x-a.x),-(b.z-a.z));
    assert.ok(Math.abs(Math.atan2(Math.sin(difference),Math.cos(difference)))<1e-9,`${area}: airport lane heading`);
   }
   const car=makeEntity('delivery-route-probe','model-3',pose.x,pose.z);car.yaw=pose.yaw;
   for(const target of targets)if(distance(pose,target)>.01)
    assert.ok(planNavigation(car,target,level,DELIVERY_DESTINATION_SNAP),`${area}: ${pose.x},${pose.z} to ${target.id}`);
  }
 }
});

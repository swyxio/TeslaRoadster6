import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANDMARKS,ROADS,terrainHeight,isSurface,isBridge,isRocketIsland,inDomePlaza,rampHeight,nearbyBuildings} from '../shared/map';
import {PARKING_LOTS} from '../shared/parking-lots';
import {CALTRAIN_STOPS} from '../shared/caltrain';
import {SHOPS} from '../shared/upgrades';
import {STATIONS} from '../shared/stations';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {LEVELS,requiredLevelAt,type Level} from '../shared/delivery';
import {ROUTES} from '../shared/traffic';
import {TOWN_DELIVERY_LAYOUTS,TOWN_DELIVERY_ROUTES} from '../shared/town-delivery-roads';
import {LANDMARK_ACCESS_ROADS,LANDMARK_ACCESS_ROUTES} from '../shared/landmark-access-roads';
import {body,contact} from '../shared/physics';
import {createEmptyWorld,addPlayer,makeEntity,step} from '../shared/game';
import {planNavigation,DELIVERY_DESTINATION_SNAP} from '../shared/navigation';

type Point={x:number;z:number};type Stop=Point&{segment:number};
const fixture=JSON.parse(readFileSync(new URL('./fixtures/town-delivery-stops.json',import.meta.url),'utf8')) as Record<string,{stops:Stop[]}>;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const landmark=LANDMARKS.find(p=>p.id==='stanford');assert.ok(landmark);
const target=landmark.arrival,roads=[...LANDMARK_ACCESS_ROADS.slice(0,4),LANDMARK_ACCESS_ROADS.at(-1)!],routes=[...LANDMARK_ACCESS_ROUTES.slice(0,2),LANDMARK_ACCESS_ROUTES.at(-1)!];
function carAt(p:Stop,route:Point[]){const a=route[p.segment],b=route[(p.segment+1)%route.length],car=makeEntity('probe','model-3',p.x,p.z);car.yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));return car;}
function edge(p:Point){let best=Infinity;for(const r of ROADS){if(r.kind==='island')continue;const dx=p.x-r.x,dz=p.z-r.z,a=r.angle??0,c=Math.cos(a),s=Math.sin(a);best=Math.min(best,Math.max(Math.abs(dx*c-dz*s)-r.w/2,Math.abs(dx*s+dz*c)-r.d/2));}return best;}
function maxLevel(a:Point,b:Point):Level{return Math.max(requiredLevelAt(a.x,a.z),requiredLevelAt(b.x,b.z)) as Level;}
function townRoute(id:string){const i=TOWN_DELIVERY_LAYOUTS.findIndex(a=>a.id===id);assert.ok(i>=0,id);return TOWN_DELIVERY_ROUTES[i*2];}

test('Stanford access keeps the historic point and is supported and obstacle-clear',()=>{
 assert.deepEqual(target,{x:-940,z:4030});
 assert.equal(roads.length,5);assert.equal(routes.length,3);
 assert.ok(roads.every(r=>ROADS.includes(r)));assert.ok(routes.every(r=>ROUTES.includes(r)));
 // The historical point lies on an authored lane, rather than being moved.
 assert.ok(routes.some(route=>route.some((a,i)=>{
  const b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return distance(target,{x:a.x+t*dx,z:a.z+t*dz})<1e-6;
 })));
 for(const r of roads){const box={...r,yaw:r.angle??0};
  for(const lot of PARKING_LOTS){const a=lot.area;assert.equal(contact(box,{x:a.x,z:a.z,w:a.width,d:a.length,yaw:a.yaw}),null,lot.id);}
  for(const b of nearbyBuildings(r.x,r.z,Math.max(r.w,r.d)/2+20))assert.equal(contact(box,{...b,yaw:0}),null,`building ${b.x},${b.z}`);
  const alongX=r.w>r.d,length=Math.max(r.w,r.d),steps=Math.ceil(length/5);
  for(let i=0;i<=steps;i++)for(const across of [-(alongX?r.d:r.w)/2+1,0,(alongX?r.d:r.w)/2-1]){const along=(i/steps-.5)*length,x=r.x+(alongX?along:across),z=r.z+(alongX?across:along);
   assert.ok(isSurface(x,z)&&!isBridge(x,z)&&!isRocketIsland(x,z)&&!inDomePlaza(x,z)&&rampHeight(x,z)===null,`unsupported at ${x},${z}`);
   assert.ok((terrainHeight(x,z)??Infinity)<=.5,`terrain at ${x},${z}`);
   assert.ok(!SHOPS.some(a=>Math.hypot(a.x-x,a.z-z)<12),`shop at ${x},${z}`);
   assert.ok(!CALTRAIN_STOPS.some(a=>Math.abs(x-a.platform.x)<26&&Math.abs(z-a.platform.z)<7),`station platform at ${x},${z}`);
  }
 }
 const radius=Math.max(...VEHICLE_IDS.map(id=>Math.hypot(VEHICLES[id].width,VEHICLES[id].length)/2));
 for(const station of STATIONS){const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`);assert.ok(lot);const area=lot.area;
  for(const route of routes)for(let i=0;i<route.length;i++){const a=route[i],b=route[(i+1)%route.length],samples=Math.ceil(distance(a,b));for(let n=0;n<=samples;n++){const t=samples?n/samples:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,d=Math.hypot(Math.max(0,Math.abs(x-area.x)-area.width/2),Math.max(0,Math.abs(z-area.z)-area.length/2));assert.ok(d>=radius,`${station.id}: traffic near charger`);}}
 }
 const largestId=VEHICLE_IDS.reduce((a,b)=>Math.hypot(VEHICLES[b].width,VEHICLES[b].length)>Math.hypot(VEHICLES[a].width,VEHICLES[a].length)?b:a);
 const largest=VEHICLES[largestId];
 for(const [ri,route] of routes.entries())for(let i=0;i<route.length;i++){
  const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=distance(a,b),n=Math.ceil(length),fx=dx/length,fz=dz/length,rx=-fz,rz=fx;
  for(let j=0;j<=n;j++){
   const x=a.x+dx*j/n,z=a.z+dz*j/n,car=makeEntity('largest-clearance',largestId,x,z);car.yaw=Math.atan2(-dx,-dz);
   assert.ok(!nearbyBuildings(x,z,radius+5).some(building=>contact(body(car),{...building,yaw:0})),`route ${ri}: building at ${x},${z}`);
   for(const f of [-largest.length/2,0,largest.length/2])for(const s of [-largest.width/2,0,largest.width/2]){
    const p={x:x+fx*f+rx*s,z:z+fz*f+rz*s};assert.ok(isSurface(p.x,p.z)&&edge(p)<=0,`route ${ri}: vehicle footprint off pavement ${p.x},${p.z}`);
   }
  }
 }
});

test('every Menlo Park and Palo Alto stop connects to Stanford in both directions',()=>{
 for(const id of ['menlo-park','palo-alto']){
  const route=townRoute(id),stops=fixture[id].stops;assert.equal(stops.length,20);
  for(const [i,p] of stops.entries()){
   const level=maxLevel(p,target),inbound=planNavigation(carAt(p,route),target,level,DELIVERY_DESTINATION_SNAP);assert.ok(inbound,`${id} ${i} -> Stanford`);
   assert.ok(distance(inbound.destination,target)<=DELIVERY_DESTINATION_SNAP,`${id} ${i}: target snap`);
   const outgoing=makeEntity('stanford','model-3',target.x,target.z);outgoing.yaw=-Math.PI/2;
   assert.ok(planNavigation(outgoing,p,level,DELIVERY_DESTINATION_SNAP),`Stanford -> ${id} ${i}`);
  }
 }
});

test('Stanford arrival and return use the actual simulated pose',()=>{
 const source=fixture['menlo-park'].stops[0],model=carAt(source,townRoute('menlo-park')),level=maxLevel(source,target);
 const world=createEmptyWorld(),player=addPlayer(world,'stanford','Stanford'),car=world.entities.find(e=>e.id===player.entityId)!;
 Object.assign(car,{x:source.x,z:source.z,y:terrainHeight(source.x,source.z)??0,yaw:model.yaw,supportId:'ground',health:100});player.delivery.level=level;player.delivery.cash=LEVELS[level].cash;
 function drive(to:Point,label:string){const nav=planNavigation(car,to,level,DELIVERY_DESTINATION_SNAP);assert.ok(nav,label);car.navigation=nav;car.autopilot=true;let maxCorner=-Infinity;
  for(let i=0;i<14000&&car.autopilot;i++){
   step(world,new Map(),.05);const {width,length}=VEHICLES['model-3'];
   for(const x of [-1,1])for(const z of [-1,1]){const p={x:car.x+x*width/2*Math.cos(car.yaw)-z*length/2*Math.sin(car.yaw),z:car.z-x*width/2*Math.sin(car.yaw)-z*length/2*Math.cos(car.yaw)};maxCorner=Math.max(maxCorner,edge(p));}
   world.entities=world.entities.filter(e=>e.id===car.id);
  }
  assert.equal(car.navigation?.status,'arrived',label);assert.ok(distance(car,to)<9,`${label}: distance`);assert.equal(car.health,100,`${label}: health`);assert.ok(maxCorner<=0,`${label}: car corner left pavement by ${maxCorner}m`);
 }
 drive(target,'Menlo -> Stanford');
 // Do not reset heading or position after arrival: use the real return pose.
 drive(source,'Stanford -> Menlo');
});

test('the Stanford connection lets the largest truck complete a free-cruise lap on pavement',()=>{
 const route=routes.at(-1)!,a=route[0],b=route[1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 const world=createEmptyWorld(),player=addPlayer(world,'truck-probe','Truck'),car=world.entities.find(e=>e.id===player.entityId)!;
 Object.assign(car,{kind:'waymo-peterbilt',x:a.x+dx/length*15,z:a.z+dz/length*15,y:0,yaw:Math.atan2(-dx,-dz),
  supportId:'ground',health:100,routeId:ROUTES.indexOf(route),waypoint:1,autopilot:true});
 player.delivery.level=LEVELS.at(-1)!.level;player.delivery.cash=LEVELS.at(-1)!.cash;
 const visited=new Set<number>(),spec=VEHICLES['waymo-peterbilt'];
 for(let i=0;i<4000;i++){
  step(world,new Map(),.05);world.entities=world.entities.filter(e=>e.id===car.id);visited.add(car.waypoint);
  for(const side of [-1,1])for(const fore of [-1,1]){
   const p={x:car.x+side*spec.width/2*Math.cos(car.yaw)-fore*spec.length/2*Math.sin(car.yaw),
    z:car.z-side*spec.width/2*Math.sin(car.yaw)-fore*spec.length/2*Math.cos(car.yaw)};
   assert.ok(edge(p)<=0,`truck corner left pavement at ${p.x},${p.z}`);
  }
 }
 assert.equal(visited.size,4,'truck completes the loop');
 assert.equal(car.health,100,'truck remains undamaged');
});

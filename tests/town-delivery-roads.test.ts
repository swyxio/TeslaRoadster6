import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HIGHWAYS,LANDMARKS,AIRPORT_RUNWAY,ROADS,isSurface,isBridge,isRocketIsland,inDomePlaza,terrainHeight,nearbyBuildings,rampHeight} from '../shared/map';
import {CALTRAIN_STOPS} from '../shared/caltrain';
import {PARKING_LOTS} from '../shared/parking-lots';
import {STATIONS} from '../shared/stations';
import {SHOPS} from '../shared/upgrades';
import {VEHICLE_IDS,VEHICLES} from '../shared/vehicles';
import {LEVELS} from '../shared/delivery';
import {HIGHWAY_ROUTE_IDS,ROUTES} from '../shared/traffic';
import {TOWN_DELIVERY_LAYOUTS,TOWN_DELIVERY_ROADS,TOWN_DELIVERY_ROUTES} from '../shared/town-delivery-roads';
import {SFO_DELIVERY_STOPS,SFO_DELIVERY_ROADS,SFO_DELIVERY_ROUTES} from '../shared/sfo-delivery-road';
import {contact} from '../shared/physics';
import {createEmptyWorld,addPlayer,makeEntity,step} from '../shared/game';
import {planNavigation,DELIVERY_DESTINATION_SNAP} from '../shared/navigation';

type Point={x:number;z:number};
type Stop=Point&{segment:number};
type TownFixture={id:string;stops:Stop[]};
const fixture=JSON.parse(readFileSync(new URL('./fixtures/town-delivery-stops.json',import.meta.url),'utf8')) as Record<string,TownFixture>;
const level=LEVELS[LEVELS.length-1].level;
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const config:Record<string,{h:number;z:number}>={
 'south-san-francisco':{h:0,z:275},'san-mateo':{h:0,z:1200},'redwood-city':{h:0,z:1200},
 'menlo-park':{h:0,z:2950},'palo-alto':{h:0,z:2950},'mountain-view':{h:0,z:4650},'santa-clara':{h:0,z:4650},
 'cupertino':{h:0,z:6800},'san-jose':{h:1,z:7400},'hayward':{h:1,z:275},'fremont':{h:1,z:275},
};
function highwayX(h:number,z:number){const pts=HIGHWAYS[h].points;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];if(z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z)&&a.z!==b.z)return a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z);}throw Error(`No highway at ${z}`);}
function anchor(h:number,z:number){const route=ROUTES[HIGHWAY_ROUTE_IDS[h===0?0:1]];let best:{x:number;z:number;d:number;yaw:number}|undefined,center=highwayX(h,z);for(let i=0;i<route.length;i++){const a=route[i],b=route[(i+1)%route.length];if(z<Math.min(a.z,b.z)||z>Math.max(a.z,b.z)||a.z===b.z)continue;const t=(z-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*t,d=Math.abs(x-center);if(!best||d<best.d)best={x,z,d,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z))};}assert.ok(best);return {source:best,target:{x:center,z}};}
function vehicle(p:Stop,route:Point[]){const a=route[p.segment],b=route[(p.segment+1)%route.length],car=makeEntity('probe','model-3',p.x,p.z);car.yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z));return car;}
function edge(p:Point){let best=Infinity;for(const r of ROADS){if(r.kind==='island')continue;const dx=p.x-r.x,dz=p.z-r.z,angle=r.angle??0,c=Math.cos(angle),s=Math.sin(angle);best=Math.min(best,Math.max(Math.abs(dx*c-dz*s)-r.w/2,Math.abs(dx*s+dz*c)-r.d/2));}return best;}
function simulatedDrive(start:Point,yaw:number,end:Point,label:string){
 const world=createEmptyWorld(),player=addPlayer(world,'route-test','Route test'),car=world.entities.find(e=>e.id===player.entityId)!;
 Object.assign(car,{x:start.x,z:start.z,y:terrainHeight(start.x,start.z)??0,yaw,supportId:'ground',health:100});
 player.delivery.level=level;player.delivery.cash=LEVELS[LEVELS.length-1].cash;
 const nav=planNavigation(car,end,level,DELIVERY_DESTINATION_SNAP);assert.ok(nav,`${label}: route`);car.navigation=nav;car.autopilot=true;
 let maxEdge=-Infinity;for(let i=0;i<14000&&car.autopilot;i++){step(world,new Map(),.05);maxEdge=Math.max(maxEdge,edge(car));world.entities=world.entities.filter(e=>e.id===car.id);}
 assert.equal(car.navigation?.status,'arrived',`${label}: arrival`);assert.ok(dist(car,end)<9,`${label}: arrival distance`);
 assert.equal(car.health,100,`${label}: damage`);assert.ok(maxEdge<=0,`${label}: center left pavement by ${maxEdge}m`);
}

test('town and airport streets are supported and clear of obstacles',()=>{
 const roads=[...TOWN_DELIVERY_ROADS,...SFO_DELIVERY_ROADS];
 for(const [i,r] of roads.entries()){
  assert.ok(ROADS.includes(r),`road ${i}: shared authoritative pavement`);
  const box={...r,yaw:r.angle??0};
  for(const lot of PARKING_LOTS)assert.equal(contact(box,{x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length,yaw:lot.area.yaw}),null,`road ${i}: parking ${lot.id}`);
  for(const b of nearbyBuildings(r.x,r.z,Math.max(r.w,r.d)/2+20))assert.equal(contact(box,{...b,yaw:0}),null,`road ${i}: building ${b.x},${b.z}`);
  if(SFO_DELIVERY_ROADS.includes(r))assert.equal(contact(box,{...AIRPORT_RUNWAY,yaw:0}),null,`road ${i}: runway`);
  const angle=r.angle??0,c=Math.cos(angle),s=Math.sin(angle),length=Math.max(r.w,r.d),alongX=r.w>r.d,n=Math.ceil(length/5);
  for(let j=0;j<=n;j++)for(const across of [-8,0,8]){
   const along=(j/n-.5)*length,localX=alongX?along:across,localZ=alongX?across:along,x=r.x+localX*c+localZ*s,z=r.z-localX*s+localZ*c;
   assert.ok(isSurface(x,z)&&!isBridge(x,z)&&!isRocketIsland(x,z)&&!inDomePlaza(x,z)&&rampHeight(x,z)===null,`road ${i}: unsupported/protected at ${x},${z}`);
   assert.ok((terrainHeight(x,z)??Infinity)<=.5,`road ${i}: uneven terrain at ${x},${z}`);
   assert.ok(!SHOPS.some(a=>Math.hypot(x-a.x,z-a.z)<12),`road ${i}: shop at ${x},${z}`);
   assert.ok(!CALTRAIN_STOPS.some(a=>Math.abs(x-a.platform.x)<26&&Math.abs(z-a.platform.z)<7),`road ${i}: station platform at ${x},${z}`);
  }
 }
});

test('town and SFO stops remain distinct',()=>{
 const all=[...Object.values(fixture).flatMap(t=>t.stops.map(p=>({city:t.id,...p}))),...SFO_DELIVERY_STOPS.map(p=>({city:'sfo',...p}))];
 assert.equal(all.length,222);
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(dist(all[i],all[j])>=18.2,`${all[i].city} / ${all[j].city}: stops ${i},${j}`);
});

test('sampled town deliveries connect to the highway and one another',()=>{
 for(const [i,town] of TOWN_DELIVERY_LAYOUTS.entries()){
  const row=fixture[town.id];assert.ok(row,town.id);assert.equal(row.stops.length,20,town.id);
  const forward=TOWN_DELIVERY_ROUTES[i*2],back=TOWN_DELIVERY_ROUTES[i*2+1];assert.ok(ROUTES.includes(forward)&&ROUTES.includes(back),town.id);
  const {source,target}=anchor(config[town.id].h,config[town.id].z),inbound=makeEntity('in','model-3',source.x,source.z);inbound.yaw=source.yaw;
  for(const index of [0,7,14,19]){
   const p=row.stops[index],car=vehicle(p,forward);
   assert.ok(planNavigation(inbound,p,level,DELIVERY_DESTINATION_SNAP),`${town.id}: highway -> ${index}`);
   assert.ok(planNavigation(car,target,level,DELIVERY_DESTINATION_SNAP),`${town.id}: ${index} -> highway`);
   for(const other of [0,7,14,19])if(other!==index)assert.ok(planNavigation(car,row.stops[other],level,DELIVERY_DESTINATION_SNAP),`${town.id}: ${index} -> ${other}`);
  }
 }
});

test('sampled town journeys run without collision or leaving the pavement',()=>{
 for(const [i,town] of TOWN_DELIVERY_LAYOUTS.entries()){
  const row=fixture[town.id],route=TOWN_DELIVERY_ROUTES[i*2];
  for(const [from,to] of [[0,7],[7,0]]){const p=row.stops[from],car=vehicle(p,route);simulatedDrive(p,car.yaw,row.stops[to],`${town.id}: ${from} -> ${to}`);}
 }
});

test('SFO deliveries run both directions and connect to the SF highway',()=>{
 const airport=LANDMARKS.find(p=>p.id==='sfo');assert.ok(airport);
 assert.ok(SFO_DELIVERY_ROUTES.every(r=>ROUTES.includes(r)));
 for(const p of SFO_DELIVERY_STOPS)assert.ok(dist(p,airport)<120,'airport handoff is near the landmark');
 const route=SFO_DELIVERY_ROUTES[0],[a,b]=SFO_DELIVERY_STOPS,carA=vehicle(a,route),carB=vehicle(b,route),{source,target}=anchor(0,275);
 simulatedDrive(source,source.yaw,a,'highway -> airport');
 simulatedDrive(a,carA.yaw,b,'airport pickup -> dropoff');
 simulatedDrive(b,carB.yaw,a,'airport dropoff -> pickup');
 simulatedDrive(b,carB.yaw,target,'airport -> highway');
});

test('largest traffic vehicles on town and SFO routes clear every charger',()=>{
 const largestRadius=Math.max(...VEHICLE_IDS.map(id=>Math.hypot(VEHICLES[id].width,VEHICLES[id].length)/2));
 for(const station of STATIONS){
  const lot=PARKING_LOTS.find(l=>l.id===`charger-${station.id}`);assert.ok(lot,station.id);
  const area={x:lot.area.x,z:lot.area.z,w:lot.area.width,d:lot.area.length};
  for(const route of [...TOWN_DELIVERY_ROUTES,...SFO_DELIVERY_ROUTES])for(let i=0;i<route.length;i++){
   const a=route[i],b=route[(i+1)%route.length],samples=Math.ceil(dist(a,b));
   for(let n=0;n<=samples;n++){const t=samples?n/samples:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    const distance=Math.hypot(Math.max(0,Math.abs(x-area.x)-area.w/2),Math.max(0,Math.abs(z-area.z)-area.d/2));
    assert.ok(distance>=largestRadius,`${station.id}: traffic route near lot`);
   }
  }
 }
});

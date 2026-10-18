import type { Entity, Input, World } from './game';
import { BAY_CIRCUIT, isSurface, nearbyBuildings } from './map';
import { ALTERNATE_ROADS, PENINSULA_CROSS_STREETS } from './alternate-roads';
import { CALTRAIN_ACCESS_ROUTES } from './caltrain';
import { body, contact } from './physics';
import { trafficDemand } from './day';
import { BAY_BRIDGE_SIGNAL, bayBridgeSignal } from './bridge-signal';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from './vehicles';
export type Point = {x:number;z:number};
// Clockwise loops use the right-hand lane. The block loops cover every street;
// large district loops let NPCs tour more than a single block.
function loop(left:number,top:number,right:number,bottom:number):Point[]{return [{x:left+3,z:top+3},{x:right-3,z:top+3},{x:right-3,z:bottom-3},{x:left+3,z:bottom-3}];}
export const ROUTES:Point[][]=[loop(-240,-180,0,120),loop(-180,-120,60,120),loop(-120,-60,0,60),loop(330,-180,510,180),loop(390,-120,570,120),loop(330,-60,450,60)];
for(let x=-240;x<0;x+=60)for(let z=-180;z<180;z+=60){
  if(x>=-180&&z>=120)continue; // The China Basin stadium replaces these blocks.
  ROUTES.push(loop(x,z,x+60,z+60));
}
// Cross-Bay route includes loops on both shores; no mid-bridge U-turn.
ROUTES.push([{x:0,z:63},{x:327,z:63},{x:333,z:117},{x:387,z:117},{x:387,z:57},{x:330,z:57},{x:3,z:57},{x:3,z:117},{x:57,z:117},{x:57,z:63}]);

// Both loops derive from the very same centerline used by map rendering and support.
// Lane offsets are right of travel, and retain full-size cars and road widths.
function lane(points:Point[]):Point[]{
  return points.map((point,i)=>{
    const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    const before={x:point.x-previous.x,z:point.z-previous.z},after={x:next.x-point.x,z:next.z-point.z};
    const bl=Math.hypot(before.x,before.z)||1,al=Math.hypot(after.x,after.z)||1;
    const tx=before.x/bl+after.x/al,tz=before.z/bl+after.z/al,length=Math.hypot(tx,tz)||1;
    return {x:point.x-4*tz/length,z:point.z+4*tx/length};
  });
}
const forward=BAY_CIRCUIT,reverse=[...BAY_CIRCUIT].reverse();
const highwayLanes=[lane(forward),lane(reverse)];
export const HIGHWAY_ROUTE_IDS:number[]=[ROUTES.length,ROUTES.length+1];
ROUTES.push(...highwayLanes);

// Reuse the exact main-circuit lane up to and after each junction. That lets
// the directed navigation graph change roads at the split rather than treating
// visually touching centerlines as disconnected lanes.
function alternateCircuit(circuit:Point[],baseLane:Point[],road:Point[]):Point[]{
  const matches=(a:Point,b:Point)=>a.x===b.x&&a.z===b.z;
  const first=circuit.findIndex(point=>matches(point,road[0]));
  const last=circuit.findIndex(point=>matches(point,road[road.length-1]));
  if(first<0||last<=first)throw new Error('Alternate road does not join the Bay circuit');
  return [...baseLane.slice(0,first+1),...lane(road).slice(1,-1),...baseLane.slice(last)];
}
for(const road of ALTERNATE_ROADS){
  HIGHWAY_ROUTE_IDS.push(ROUTES.length,ROUTES.length+1);
  ROUTES.push(alternateCircuit(forward,highwayLanes[0],road.points),
    alternateCircuit(reverse,highwayLanes[1],[...road.points].reverse()));
}
// Each street's directed lanes intersect all three existing corridors.
// Both ends turn inside the shared paved rectangle.
for(const cross of PENINSULA_CROSS_STREETS)ROUTES.push([
  {x:cross.x-cross.w/2+12,z:cross.z+3},
  {x:cross.x+cross.w/2-12,z:cross.z+3},
  {x:cross.x+cross.w/2-12,z:cross.z-3},
  {x:cross.x-cross.w/2+12,z:cross.z-3},
]);
// Local two-way streets extend the same directed graph to the station lots.
ROUTES.push(...CALTRAIN_ACCESS_ROUTES);

/** A fictional disabled-car vignette; timing uses real room seconds. */
export const TRAFFIC_INCIDENT={entityId:'ambient-seed-0',cycleSeconds:360,startSeconds:180,endSeconds:240} as const;
/** Renderer and simulation derive the same indicator from the authoritative snapshot. */
export function isTrafficIncident(e:Entity,time:number):boolean {
  const phase=((time%TRAFFIC_INCIDENT.cycleSeconds)+TRAFFIC_INCIDENT.cycleSeconds)%TRAFFIC_INCIDENT.cycleSeconds;
  return e.id===TRAFFIC_INCIDENT.entityId&&e.npc&&!e.driver&&e.autopilot&&e.supportId==='ground'&&
    HIGHWAY_ROUTE_IDS.includes(e.routeId as typeof HIGHWAY_ROUTE_IDS[number])&&e.z>1000&&e.z<8000&&
    phase>=TRAFFIC_INCIDENT.startSeconds&&phase<TRAFFIC_INCIDENT.endSeconds;
}

const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
export function routePose(index:number,count:number) {
  const routeId=index%6,route=ROUTES[routeId],side=(index*4/count)%4,segment=Math.floor(side),t=side-segment;
  const a=route[segment],b=route[(segment+1)%4];
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:(segment+1)%4};
}
export function engageAutopilot(e:Entity):boolean {
  // All current routes follow ground; an overlapping deck or roof is not a route.
  if(e.kind==='person'||e.supportId!=='ground')return false;
  let best=Infinity,routeId=0,waypoint=0;
  ROUTES.forEach((route,id)=>route.forEach((a,i)=>{
    const b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z;
    const lengthSquared=dx*dx+dz*dz;if(!lengthSquared)return;
    const t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.z-a.z)*dz)/lengthSquared));
    const distance=Math.hypot(e.x-a.x-t*dx,e.z-a.z-t*dz);
    if(distance>9)return;
    // Parallel routes at a bridge can be equally close; prefer the direction the car is facing.
    const alignment=(-Math.sin(e.yaw)*dx-Math.cos(e.yaw)*dz)/Math.sqrt(lengthSquared);
    const score=distance+3*(1-alignment)+(HIGHWAY_ROUTE_IDS.includes(id as typeof HIGHWAY_ROUTE_IDS[number])?.5:0);
    if(score<best){best=score;routeId=id;waypoint=(i+1)%route.length;}
  }));
  if(!Number.isFinite(best))return false;
  Object.assign(e,{autopilot:true,routeId,waypoint,pauseUntil:0});return true;
}
export function trafficInput(e:Entity,world:World):Input {
  const neutral:Input={throttle:0,steer:0,boost:false,hover:false,roll:0,brake:false,jump:0,flip:0,cockpit:false};
  if(e.kind==='person')return neutral;
  if(e.supportId===null)return neutral; // Resume the ground route after landing.
  if(e.supportId!=='ground'){e.autopilot=false;e.navigation=null;return neutral;}
  const navigation=e.navigation?.status==='driving'?e.navigation:null;
  const route=navigation?navigation.path:ROUTES[e.routeId];if(!route?.length){e.autopilot=false;e.navigation=null;return neutral;}
  let waypoint=navigation?navigation.index:e.waypoint;
  if(waypoint<0||waypoint>=route.length)waypoint=0;
  let target=route[waypoint];
  const previous=navigation&&waypoint===0?{x:e.x+Math.sin(e.yaw)*10,z:e.z+Math.cos(e.yaw)*10}:route[(waypoint+route.length-1)%route.length];
  const final=!!navigation&&waypoint===route.length-1;
  const next=final?target:route[(waypoint+1)%route.length];
  const incoming={x:target.x-previous.x,z:target.z-previous.z};
  const outgoing={x:next.x-target.x,z:next.z-target.z};
  const cosine=(incoming.x*outgoing.x+incoming.z*outgoing.z)/(Math.hypot(incoming.x,incoming.z)*Math.hypot(outgoing.x,outgoing.z)||1);
  const distance=Math.hypot(target.x-e.x,target.z-e.z);
  const progress=((e.x-previous.x)*incoming.x+(e.z-previous.z)*incoming.z)/(incoming.x*incoming.x+incoming.z*incoming.z||1);
  const lateral=Math.abs((e.x-previous.x)*incoming.z-(e.z-previous.z)*incoming.x)/(Math.hypot(incoming.x,incoming.z)||1);
  // On city corners, pause briefly; points along a straight road are not stops.
  if(final&&distance<5&&Math.abs(e.speed)<.15){navigation!.status='arrived';e.autopilot=false;return {...neutral,brake:true};}
  if(!final&&(distance<7||(progress>=1&&lateral<10))){
    waypoint=(waypoint+1)%route.length;
    if(navigation)navigation.index=waypoint;else e.waypoint=waypoint;
    if(!e.driver&&cosine<.75)e.pauseUntil=world.time+.7;
    target=route[waypoint];
  }
  const angle=wrap(Math.atan2(-(target.x-e.x),-(target.z-e.z))-e.yaw);
  const spec=VEHICLES[e.kind];
  const steer=Math.max(-1,Math.min(1,angle*1.8));
  const highway=!navigation&&HIGHWAY_ROUTE_IDS.includes(e.routeId as typeof HIGHWAY_ROUTE_IDS[number]);
  const variety=.92+(hash(e.id)%17)/100;
  let cruise=navigation?12:highway?Math.min(spec.maxSpeed*.92,26*variety):8;
  if(final)cruise=Math.min(cruise,Math.sqrt(3*Math.max(0,distance-3)));
  // Start braking before bends; the approach length uses real-time speed.
  if(e.driver&&!final&&cosine<.95){
    const turnSpeed=Math.max(4.5,6+8*Math.max(0,cosine));
    cruise=Math.min(cruise,Math.sqrt(turnSpeed*turnSpeed+4*Math.max(0,distance-7)));
  }else if(!e.driver&&cosine<.95&&distance<Math.max(16,Math.abs(e.speed)*2))cruise=Math.min(cruise,Math.max(4.5,6+20*Math.max(0,cosine)));
  if(Math.abs(angle)>.5)cruise=Math.min(cruise,4.5);
  const forward={x:-Math.sin(e.yaw),z:-Math.cos(e.yaw)};
  let safeSpeed=cruise,hazardGap=Infinity;
  // The meter is a virtual stopped leader on the eastbound approach. Cars that
  // have already crossed the stop line continue, including on a phase change.
  if(bayBridgeSignal(world.time).state==='red'&&forward.x>.8&&Math.abs(e.z-BAY_BRIDGE_SIGNAL.centerZ)<BAY_BRIDGE_SIGNAL.halfWidth){
    const gap=BAY_BRIDGE_SIGNAL.stopX-e.x-spec.length/2;
    if(gap>=0&&gap<150){hazardGap=Math.min(hazardGap,gap);safeSpeed=Math.min(safeSpeed,Math.max(0,(gap-2-Math.max(0,e.speed)*1.5)*.55));}
  }
  for(const other of world.entities){
    if(other===e)continue;
    const otherHeight=other.kind==='person'?1.9:VEHICLES[other.kind].height;
    if(e.y>=other.y+otherHeight||other.y>=e.y+spec.height)continue;
    const dx=other.x-e.x,dz=other.z-e.z;
    const along=dx*forward.x+dz*forward.z,side=Math.abs(dx*forward.z-dz*forward.x);
    const size=other.kind==='person'?{length:.7,width:.7}:VEHICLES[other.kind];
    if(along<=0||side>(spec.width+size.width)/2+.35)continue;
    const gap=along-(spec.length+size.length)/2;
    hazardGap=Math.min(hazardGap,gap);
    const otherForward={x:-Math.sin(other.yaw),z:-Math.cos(other.yaw)};
    const leaderSpeed=Math.max(0,other.speed*(forward.x*otherForward.x+forward.z*otherForward.z));
    // 2 m standstill gap and 1.5 seconds of headway, in real simulation time.
    const followingSpeed=Math.max(0,leaderSpeed+(gap-2-Math.max(0,e.speed)*1.5)*.55);
    safeSpeed=Math.min(safeSpeed,followingSpeed);
  }
  if(world.time<e.pauseUntil)safeSpeed=0;
  if(isTrafficIncident(e,world.time)&&safeSpeed>=e.speed-1){
    // Decelerate progressively (~2.5 m/s² at highway speed); braking is reserved
    // for the final crawl. Following cars see the same normal authoritative car.
    if(e.speed<=2)return {...neutral,brake:true,steer};
    const throttle=Math.max(.001,Math.min(1,(e.speed*.12-2.5)/spec.acceleration));
    return {...neutral,throttle,steer};
  }
  if(e.driver){
    // Let occupied cars roll through bends and slow progressively instead of
    // applying full brakes at each snapshot-sized speed change.
    if(hazardGap<Math.max(2,e.speed*e.speed/10+2))return {...neutral,brake:true,steer};
    if(safeSpeed<.1&&Math.abs(e.speed)<.15)return {...neutral,brake:true,steer};
    const acceleration=Math.max(-2.2,Math.min(2.2,(safeSpeed-e.speed)*.9));
    const throttle=Math.max(-1,Math.min(1,(Math.max(0,e.speed)*.12+acceleration)/(spec.acceleration*(e.upgrades.motor?1.25:1))));
    return {...neutral,throttle,steer};
  }
  if(e.speed>safeSpeed+1||safeSpeed<.1)return {...neutral,brake:true,steer};
  // Counter the normal drag to hold speed, instead of accelerating and coasting in bursts.
  const throttle=Math.max(0,Math.min(1,(Math.max(0,e.speed)*.12+(safeSpeed-e.speed)*.9)/spec.acceleration));
  return {...neutral,throttle,steer};
}

/** Fixed, replayable choice; no browser clock or random state enters simulation. */
function hash(value:string):number {
  let result=2166136261;
  for(let i=0;i<value.length;i++)result=Math.imul(result^value.charCodeAt(i),16777619);
  return result>>>0;
}

function routeDistancePose(routeId:number,fraction:number){
  const route=ROUTES[routeId];
  const lengths=route.map((a,i)=>Math.hypot(route[(i+1)%route.length].x-a.x,route[(i+1)%route.length].z-a.z));
  const length=lengths.reduce((a,b)=>a+b,0);let distance=((fraction%1)+1)%1*length;
  for(let i=0;i<route.length;i++){
    if(distance>lengths[i]){distance-=lengths[i];continue;}
    const a=route[i],b=route[(i+1)%route.length],t=lengths[i]?distance/lengths[i]:0;
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:(i+1)%route.length};
  }
  throw new Error('Empty highway route');
}

type EntityFactory=(id:string,kind:VehicleId,x:number,z:number)=>Entity;
const AMBIENT_MAX=34; // Target for unattended traffic, in addition to catalog NPCs and police.
const AMBIENT_POOL_MAX=68; // Also bounds taken and abandoned optional cars.
const AMBIENT_INTERVAL=5; // Real seconds, independent of the accelerated clock.
const HIDDEN_DISTANCE=1600; // Beyond both scene fog and the ambient snapshot radius.

function desiredAmbient(time:number):number{return Math.round(5+29*trafficDemand(time).intensity);}
function observers(world:World):Entity[]{
  return world.players.map(player=>world.entities.find(entity=>entity.id===player.entityId)).filter((entity):entity is Entity=>!!entity);
}
function hidden(x:number,z:number,viewers:Entity[]):boolean{
  return viewers.every(viewer=>Math.hypot(viewer.x-x,viewer.z-z)>HIDDEN_DISTANCE);
}
function addAmbient(world:World,id:string,clockwise:boolean,make:EntityFactory):boolean {
  // Spread the same bounded ambient fleet among the main route and both
  // Peninsula alternatives. Preserve the incident's original main route.
  const alternative=id==='ambient-seed-0'?0:hash(`road-${id}`)%(HIGHWAY_ROUTE_IDS.length/2);
  const routeId=HIGHWAY_ROUTE_IDS[alternative*2+(clockwise?0:1)],viewers=observers(world);
  const kind=VEHICLE_IDS[hash(id)%VEHICLE_IDS.length];
  for(let attempt=0;attempt<36;attempt++){
    const fraction=(hash(`${id}:${attempt}`)%100000)/100000;
    const pose=routeDistancePose(routeId,fraction);
    if(!isSurface(pose.x,pose.z)||!hidden(pose.x,pose.z,viewers))continue;
    if(world.entities.some(other=>Math.hypot(other.x-pose.x,other.z-pose.z)<30))continue;
    const car=make(id,kind,pose.x,pose.z);Object.assign(car,pose,{npc:true,autopilot:true});
    if(nearbyBuildings(car.x,car.z,10).some(building=>contact(body(car),{...building,yaw:0})))continue;
    world.entities.push(car);return true;
  }
  return false;
}

/** Called after the permanent 26 NPCs and parked fleet have been created. */
export function seedHighwayTraffic(world:World,make:EntityFactory):void {
  const target=desiredAmbient(world.time);
  for(let i=0;i<target;i++)addAmbient(world,`ambient-seed-${i}`,i%2===0,make);
}

/** Reconcile one optional highway car every five real seconds, never an occupied or visible car. */
export function updateHighwayTraffic(world:World,dt:number,make:EntityFactory):void {
  if(!world.players.length)return;
  const tick=Math.floor((world.time+1e-7)/AMBIENT_INTERVAL);
  if(tick<=0||tick===Math.floor((world.time-dt+1e-7)/AMBIENT_INTERVAL))return;
  const ambient=world.entities.filter(entity=>entity.id.startsWith('ambient-'));
  const onHighway=(entity:Entity)=>HIGHWAY_ROUTE_IDS.includes(entity.routeId as typeof HIGHWAY_ROUTE_IDS[number]);
  const unattended=ambient.filter(entity=>!entity.driver&&entity.autopilot&&onHighway(entity));
  const target=Math.min(AMBIENT_MAX,desiredAmbient(world.time));
  if(unattended.length<target&&ambient.length<AMBIENT_POOL_MAX){
    const demand=trafficDemand(world.time);
    const clockwiseChance=.5+.25*demand.morning-.25*demand.evening;
    addAmbient(world,`ambient-${tick}`,(hash(`direction-${tick}`)%10000)/10000<clockwiseChance,make);
  }else if(unattended.length>target||(unattended.length<target&&ambient.length>=AMBIENT_POOL_MAX)){
    const viewers=observers(world);
    // Retain queues and blocked vehicles. Reclaim off-route or free-flowing city cars only when the pool blocks replenishment.
    const excessTraffic=unattended.length>target;
    const removable=ambient.find(entity=>entity.id!==TRAFFIC_INCIDENT.entityId&&!entity.driver&&
      (excessTraffic?entity.autopilot&&onHighway(entity)&&entity.speed>5:!entity.autopilot||(!onHighway(entity)&&entity.speed>5))&&hidden(entity.x,entity.z,viewers)&&
      !world.entities.some(other=>other!==entity&&Math.hypot(other.x-entity.x,other.z-entity.z)<35));
    if(removable)world.entities=world.entities.filter(entity=>entity!==removable);
  }
}

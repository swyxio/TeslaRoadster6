import type { Entity, Input, World } from './game';
import { BAY_CIRCUIT, HIGHWAYS, ROADS, isSurface, nearbyBuildings } from './map';
import { ALTERNATE_ROADS, PENINSULA_CROSS_STREETS } from './alternate-roads';
import { CALTRAIN_ACCESS_ROUTES } from './caltrain';
import { MARIN_ROUTES } from './marin-roads';
import { TOWN_DELIVERY_ROUTES } from './town-delivery-roads';
import { SFO_DELIVERY_ROUTES } from './sfo-delivery-road';
import { LANDMARK_ACCESS_ROUTES } from './landmark-access-roads';
import { body, contact } from './physics';
import { trafficDemand } from './day';
import { BAY_BRIDGE_SIGNAL, bayBridgeSignal } from './bridge-signal';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from './vehicles';
import { requiredLevelAt } from './delivery';
export type Point = {x:number;z:number};
// Clockwise loops use the right-hand lane. The block loops cover every street;
// large district loops let NPCs tour more than a single block.
function loop(left:number,top:number,right:number,bottom:number):Point[]{return [{x:left+3,z:top+3},{x:right-3,z:top+3},{x:right-3,z:bottom-3},{x:left+3,z:bottom-3}];}
// Turn north before the Oakland stunt loop and ramp, then rejoin the city loop.
const oaklandLoop:Point[]=[{x:333,z:-177},{x:507,z:-177},{x:507,z:177},
  {x:453,z:177},{x:453,z:117},{x:333,z:117}];
export const ROUTES:Point[][]=[loop(-240,-180,0,120),loop(-180,-120,60,120),loop(-120,-60,0,60),oaklandLoop,loop(390,-120,570,120),loop(330,-60,450,60)];
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
ROUTES.push(...MARIN_ROUTES);
ROUTES.push(...TOWN_DELIVERY_ROUTES,...SFO_DELIVERY_ROUTES,...LANDMARK_ACCESS_ROUTES);
// Existing Berkeley street tiles reach the preserved Campanile delivery marker.
ROUTES.push([{x:393,z:-237},{x:507,z:-237},{x:507,z:-123},{x:393,z:-123}]);

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
// Reverse only through currently supported, unlocked space with clearance for
// the whole car. Recovery is local and does not relocate or phase through cars.
function clearBehind(e:Entity,world:World):boolean {
  if(e.kind==='person')return false;
  const spec=VEHICLES[e.kind],forward={x:-Math.sin(e.yaw),z:-Math.cos(e.yaw)};
  const player=world.players.find(p=>p.id===e.driver),ceiling=Math.max(player?.delivery.level??0,requiredLevelAt(e.x,e.z));
  for(let d=1;d<=5;d+=1){
    const x=e.x-forward.x*d,z=e.z-forward.z*d;
    if(!isSurface(x,z)||requiredLevelAt(x,z)>ceiling)return false;
    const pose=body({...e,x,z});
    if(nearbyBuildings(x,z,spec.length+2).some(b=>contact(pose,{...b,yaw:0})))return false;
    for(const other of world.entities){
      if(other===e)continue;
      const height=other.kind==='person'?1.9:VEHICLES[other.kind].height;
      if(e.y>=other.y+height||other.y>=e.y+spec.height)continue;
      if(contact(pose,body(other)))return false;
    }
  }
  return true;
}
function wallAhead(e:Entity):boolean {
  if(e.kind==='person')return false;
  const spec=VEHICLES[e.kind],forward={x:-Math.sin(e.yaw),z:-Math.cos(e.yaw)};
  for(let d=1;d<=3;d++){
    const x=e.x+forward.x*d,z=e.z+forward.z*d,pose=body({...e,x,z});
    if(nearbyBuildings(x,z,spec.length+2).some(b=>contact(pose,{...b,yaw:0})))return true;
  }
  return false;
}
export function routePose(index:number,count:number) {
  const routeId=index%6,route=ROUTES[routeId],side=(index*route.length/count)%route.length,segment=Math.floor(side),t=side-segment;
  const a=route[segment],b=route[(segment+1)%route.length];
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:(segment+1)%route.length};
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

// The navigation graph stays on the inner lane. Ambient cars may use the
// middle lane only on a long, straight part of a primary 32 m highway.
// Keep the complete vehicle envelope inside one authoritative road rectangle;
// tapered ends and intersecting local roads provide space to merge back.
type GeneralLane={a:Point;ux:number;uz:number;length:number;cuts:{at:number;radius:number}[]};
const generalLanes=new Map<string,GeneralLane>();
const GENERAL_LANE_OFFSET=5.5; // From the +/-4 m navigation lane to the middle lane.
const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
for(const routeId of HIGHWAY_ROUTE_IDS){
  const route=ROUTES[routeId];
  for(let i=0;i<route.length;i++){
    const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<500)continue;
    const ux=dx/length,uz=dz/length,rx=-uz,rz=ux;
    let supported=false;
    for(const highway of HIGHWAYS.slice(0,2))for(let j=1;j<highway.points.length;j++){
      const p=highway.points[j-1],q=highway.points[j],hx=q.x-p.x,hz=q.z-p.z,hLength=Math.hypot(hx,hz);
      if(!hLength||Math.abs((hx*ux+hz*uz)/hLength)<.9995)continue;
      const hxUnit=hx/hLength,hzUnit=hz/hLength;
      // Three meters covers the largest ambient body plus turning clearance.
      const fits=[15,length-15].every(s=>[0,GENERAL_LANE_OFFSET].every(offset=>{
        const x=a.x+ux*s+rx*offset-p.x,z=a.z+uz*s+rz*offset-p.z;
        const along=x*hxUnit+z*hzUnit,side=Math.abs(cross(hxUnit,hzUnit,x,z));
        return along>=8&&along<=hLength-8&&side<=13;
      }));
      if(fits){supported=true;break;}
    }
    if(!supported)continue;
    const cuts:{at:number;radius:number}[]=[];
    for(const road of ROADS){
      if(road.kind==='highway'||road.kind==='island')continue;
      const angle=road.angle??(road.axis==='x'?Math.PI/2:0);
      const vx=Math.sin(angle),vz=Math.cos(angle),half=(road.axis==='x'?road.w:road.d)/2;
      const denominator=cross(ux,uz,vx,vz);
      if(Math.abs(denominator)<.1)continue;
      const x=road.x-a.x,z=road.z-a.z;
      const at=cross(x,z,vx,vz)/denominator,along=cross(x,z,ux,uz)/denominator;
      if(at>0&&at<length&&Math.abs(along)<=half+20){
        const width=road.axis==='x'?road.d:road.w;
        cuts.push({at,radius:20+(width/2+10)/Math.abs(denominator)});
      }
    }
    generalLanes.set(`${routeId}:${(i+1)%route.length}`,{a,ux,uz,length,cuts});
  }
}
function generalLaneTarget(e:Entity,world:World,waypoint:number):{target:Point;blocked:boolean}|null {
  // Keep the scripted incident on its original route for its entire cycle so
  // its gradual stop and the following queue are not changed by a lane merge.
  if(e.kind==='person'||e.driver||!e.npc||!e.id.startsWith('ambient-')||e.id===TRAFFIC_INCIDENT.entityId||e.navigation)return null;
  const segment=generalLanes.get(`${e.routeId}:${waypoint}`);if(!segment)return null;
  const {a,ux,uz,length,cuts}=segment,rx=-uz,rz=ux;
  const x=e.x-a.x,z=e.z-a.z,s=x*ux+z*uz,side=x*rx+z*rz;
  if(s<0||s>length||side< -3||side>10)return null;
  const lookahead=Math.max(30,Math.min(45,Math.abs(e.speed)*1.8));
  const at=Math.min(length,s+lookahead);
  let clearance=Math.min(at-20,length-20-at);
  for(const cut of cuts)clearance=Math.min(clearance,Math.abs(at-cut.at)-cut.radius);
  const factor=Math.max(0,Math.min(1,clearance/140));
  const offset=GENERAL_LANE_OFFSET*factor*factor*(3-2*factor);
  const movingSide=Math.abs(offset-side)>.4;
  let blocked=false;
  if(movingSide){
    const spec=VEHICLES[e.kind],ownVx=-Math.sin(e.yaw)*e.speed+e.pushX,ownVz=-Math.cos(e.yaw)*e.speed+e.pushZ;
    for(const other of world.entities){
      if(other===e)continue;
      const size=other.kind==='person'?{width:.7,length:.7,height:1.9}:VEHICLES[other.kind];
      if(e.y>=other.y+size.height||other.y>=e.y+spec.height)continue;
      const ox=other.x-e.x,oz=other.z-e.z;
      const vx=-Math.sin(other.yaw)*other.speed+other.pushX-ownVx,vz=-Math.cos(other.yaw)*other.speed+other.pushZ-ownVz;
      const along=ox*ux+oz*uz,lateral=ox*rx+oz*rz;
      const endAlong=along+4*(vx*ux+vz*uz),endLateral=lateral+4*(vx*rx+vz*rz);
      // A following car cannot obstruct the merge if its entire projected body
      // stays behind ours over the sweep. Treating it as adjacent traffic can
      // make the leader brake forever while the follower waits for it.
      const bodyClearance=(Math.hypot(spec.length,spec.width)+Math.hypot(size.length,size.width))/2+1;
      if(Math.max(along,endAlong)<-bodyClearance)continue;
      const reach=Math.max(35,Math.abs(e.speed)*2)+(spec.length+size.length)/2;
      const gap=(spec.width+size.width)/2+1.5;
      if(Math.min(along,endAlong)<reach&&Math.max(along,endAlong)>-reach&&
        Math.min(lateral,endLateral)<Math.max(0,offset-side)+gap&&
        Math.max(lateral,endLateral)>Math.min(0,offset-side)-gap){blocked=true;break;}
    }
  }
  // Freeze the merge while the sweep is occupied. Braking also prevents an
  // middle-lane car from reaching a junction before its return lane is clear.
  const desired=blocked?side:offset;
  return {target:{x:a.x+ux*at+rx*desired,z:a.z+uz*at+rz*desired},blocked};
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
  let previous=navigation&&waypoint===0?{x:e.x+Math.sin(e.yaw)*10,z:e.z+Math.cos(e.yaw)*10}:route[(waypoint+route.length-1)%route.length];
  let final=!!navigation&&waypoint===route.length-1;
  let next=final?target:route[(waypoint+1)%route.length];
  let incoming={x:target.x-previous.x,z:target.z-previous.z};
  let outgoing={x:next.x-target.x,z:next.z-target.z};
  let cosine=(incoming.x*outgoing.x+incoming.z*outgoing.z)/(Math.hypot(incoming.x,incoming.z)*Math.hypot(outgoing.x,outgoing.z)||1);
  let distance=Math.hypot(target.x-e.x,target.z-e.z);
  const progress=((e.x-previous.x)*incoming.x+(e.z-previous.z)*incoming.z)/(incoming.x*incoming.x+incoming.z*incoming.z||1);
  const lateral=Math.abs((e.x-previous.x)*incoming.z-(e.z-previous.z)*incoming.x)/(Math.hypot(incoming.x,incoming.z)||1);
  // On city corners, pause briefly; points along a straight road are not stops.
  if(final&&distance<4&&Math.abs(e.speed)<.15){navigation!.status='arrived';e.autopilot=false;return {...neutral,brake:true};}
  if(!final&&(distance<7||(progress>=1&&lateral<10))){
    waypoint=(waypoint+1)%route.length;
    if(navigation)navigation.index=waypoint;else e.waypoint=waypoint;
    if(!e.driver&&cosine<.75)e.pauseUntil=world.time+.7;
    target=route[waypoint];
    if(e.driver){
      // Speed planning must use the same segment as steering after a turn.
      previous=route[(waypoint+route.length-1)%route.length];
      final=!!navigation&&waypoint===route.length-1;
      next=final?target:route[(waypoint+1)%route.length];
      incoming={x:target.x-previous.x,z:target.z-previous.z};
      outgoing={x:next.x-target.x,z:next.z-target.z};
      cosine=(incoming.x*outgoing.x+incoming.z*outgoing.z)/(Math.hypot(incoming.x,incoming.z)*Math.hypot(outgoing.x,outgoing.z)||1);
      distance=Math.hypot(target.x-e.x,target.z-e.z);
    }
  }
  const generalLane=generalLaneTarget(e,world,waypoint);
  if(generalLane)target=generalLane.target;
  const angle=wrap(Math.atan2(-(target.x-e.x),-(target.z-e.z))-e.yaw);
  const spec=VEHICLES[e.kind];
  const steer=Math.max(-1,Math.min(1,angle*1.8));
  if(generalLane?.blocked)return {...neutral,brake:true,steer};
  if(navigation&&e.driver){
    // Keep the reduced joining speed through the first lane turn. Leaving the
    // approach as soon as we touch it can swing wide into the next building.
    if(navigation.join){
      const joinDistance=Math.hypot(e.x-navigation.join.x,e.z-navigation.join.z);
      if(joinDistance<10)navigation.joinReached=true;
      if((joinDistance<15&&Math.abs(angle)<.35)||(navigation.joinReached&&joinDistance>15)){
        delete navigation.join;delete navigation.joinReached;
      }
    }
    let recovery=navigation.recovery;
    if(!recovery||recovery.index!==waypoint){
      recovery=navigation.recovery={index:waypoint,distance,at:world.time,attempts:0,reverseUntil:0};
    }else if(distance<recovery.distance-2){
      recovery.distance=distance;recovery.at=world.time;recovery.attempts=0;
    }
    const wall=!!navigation.join&&e.speed>=0&&wallAhead(e);
    const signalDistance=BAY_BRIDGE_SIGNAL.stopX-e.x-spec.length/2;
    const waitingAtSignal=bayBridgeSignal(world.time).state==='red'&&-Math.sin(e.yaw)>.8&&
      Math.abs(e.z-BAY_BRIDGE_SIGNAL.centerZ)<BAY_BRIDGE_SIGNAL.halfWidth&&signalDistance>=0&&signalDistance<150;
    // A red light can last longer than the recovery timeout; waiting in its
    // queue is expected and should never trigger a reverse manoeuvre.
    if(waitingAtSignal&&!wall)recovery.at=world.time;
    if(world.time>=recovery.reverseUntil&&(wall||world.time-recovery.at>12)){
      // Three bounded attempts, then return control and expose a failure to
      // the driver instead of sitting indefinitely against a wall or queue.
      if(recovery.attempts>=3){navigation.status='failed';e.autopilot=false;return {...neutral,brake:true};}
      recovery.attempts++;recovery.at=world.time;recovery.reverseUntil=world.time+4;
    }
    const reversing=world.time<recovery.reverseUntil||(!!navigation.join&&Math.abs(angle)>2.1);
    if(reversing&&clearBehind(e,world)){
      if(e.speed>1)return {...neutral,brake:true,steer};
      const recovering=world.time<recovery.reverseUntil;
      // Clear the nose from a wall before rotating, or the physics correctly
      // rejects the turn even though the straight line behind is open.
      const straight=recovering&&world.time-recovery.at<2;
      if(straight&&Math.abs(e.speed)<.3&&Math.abs(e.steering)>.1)return {...neutral,brake:true,steer:0};
      const reverseAngle=recovering?angle:wrap(angle-Math.PI);
      const reverseSteer=straight?0:-Math.max(-1,Math.min(1,reverseAngle*1.8));
      const acceleration=Math.max(-2.2,Math.min(2.2,(-2.5-e.speed)*.9));
      const throttle=Math.max(-1,Math.min(0,acceleration/(spec.acceleration*(e.upgrades.motor?1.25:1))));
      return {...neutral,throttle,steer:reverseSteer};
    }
  }
  const highway=!navigation&&HIGHWAY_ROUTE_IDS.includes(e.routeId as typeof HIGHWAY_ROUTE_IDS[number]);
  const variety=.92+(hash(e.id)%17)/100;
  // A mix of slower and faster highway cars gives drivers something to pass.
  // Only unattended highway traffic uses this tuning: a player taking one of
  // these cars, a cop, or a cab keeps its existing cruise behavior.
  const ambientCruise=e.id.startsWith('ambient-')&&!e.driver?15+hash(e.id)%9:26*variety;
  let cruise=navigation?(navigation.join?4.5:12):highway?Math.min(spec.maxSpeed*.92,ambientCruise):8;
  if(final)cruise=Math.min(cruise,Math.sqrt(3*Math.max(0,distance-3)));
  // Start braking before bends; the approach length uses real-time speed.
  if(e.driver&&!final&&cosine<.95){
    const turnSpeed=Math.max(4.5,6+8*Math.max(0,cosine));
    cruise=Math.min(cruise,Math.sqrt(turnSpeed*turnSpeed+4*Math.max(0,distance-7)));
  }else if(!e.driver&&cosine<.95&&distance<Math.max(16,Math.abs(e.speed)*2))cruise=Math.min(cruise,Math.max(4.5,6+20*Math.max(0,cosine)));
  if(Math.abs(angle)>.5)cruise=Math.min(cruise,4.5);
  const forward={x:-Math.sin(e.yaw),z:-Math.cos(e.yaw)};
  let safeSpeed=cruise,hazardGap=Infinity,hazardClosingSpeed=0;
  // The meter is a virtual stopped leader on the eastbound approach. Cars that
  // have already crossed the stop line continue, including on a phase change.
  if(bayBridgeSignal(world.time).state==='red'&&forward.x>.8&&Math.abs(e.z-BAY_BRIDGE_SIGNAL.centerZ)<BAY_BRIDGE_SIGNAL.halfWidth){
    const gap=BAY_BRIDGE_SIGNAL.stopX-e.x-spec.length/2;
    if(gap>=0&&gap<150){hazardGap=Math.min(hazardGap,gap);hazardClosingSpeed=Math.max(hazardClosingSpeed,e.speed);safeSpeed=Math.min(safeSpeed,Math.max(0,(gap-(e.driver?3:2)-Math.max(0,e.speed)*(e.driver?2.2:1.5))*.55));}
  }
  for(const other of world.entities){
    if(other===e)continue;
    const otherHeight=other.kind==='person'?1.9:VEHICLES[other.kind].height;
    if(e.y>=other.y+otherHeight||other.y>=e.y+spec.height)continue;
    const dx=other.x-e.x,dz=other.z-e.z;
    const along=dx*forward.x+dz*forward.z,side=Math.abs(dx*forward.z-dz*forward.x);
    if(along<=0)continue;
    const size=other.kind==='person'?{length:.7,width:.7}:VEHICLES[other.kind];
    if(side>(spec.width+size.width+size.length)/2+.35)continue;
    const otherForward={x:-Math.sin(other.yaw),z:-Math.cos(other.yaw)};
    // A turning vehicle's length projects across our lane; width alone can
    // incorrectly clear it while its body still occupies the driving path.
    const alignment=forward.x*otherForward.x+forward.z*otherForward.z;
    const crosswise=forward.x*otherForward.z-forward.z*otherForward.x;
    const lateralReach=(spec.width+size.width*Math.abs(alignment)+size.length*Math.abs(crosswise))/2+.35;
    if(side>lateralReach)continue;
    const gap=along-(spec.length+size.length)/2;
    const leaderSpeed=Math.max(0,other.speed*alignment);
    if(gap<hazardGap){hazardGap=gap;hazardClosingSpeed=Math.max(0,e.speed-leaderSpeed);}
    // Occupied cars start slowing earlier, leaving room to follow smoothly.
    // Ambient traffic retains its existing 1.5-second headway.
    const followingSpeed=Math.max(0,leaderSpeed+(gap-(e.driver?3:2)-Math.max(0,e.speed)*(e.driver?2.2:1.5))*.55);
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
    // Reserve full braking for an imminent collision. Normal following uses
    // the same bounded deceleration as bends, including a stopped leader.
    const emergencyDistance=1+Math.max(0,e.speed)*.35+hazardClosingSpeed**2/(2*Math.min(8,spec.brakeDecel*.7));
    if(hazardGap<emergencyDistance)return {...neutral,brake:true,steer};
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

// These routes are immutable after setup. Reuse their lengths when checking the
// bounded set of possible spawn locations rather than measuring them each time.
const highwayLengths=new Map(HIGHWAY_ROUTE_IDS.map(id=>{
  const route=ROUTES[id],lengths=route.map((a,i)=>Math.hypot(route[(i+1)%route.length].x-a.x,route[(i+1)%route.length].z-a.z));
  return [id,{lengths,total:lengths.reduce((a,b)=>a+b,0)}] as const;
}));
function routeDistancePose(routeId:number,fraction:number){
  const route=ROUTES[routeId],{lengths,total}=highwayLengths.get(routeId)!;
  let distance=((fraction%1)+1)%1*total;
  for(let i=0;i<route.length;i++){
    if(distance>lengths[i]){distance-=lengths[i];continue;}
    const a=route[i],b=route[(i+1)%route.length],t=lengths[i]?distance/lengths[i]:0;
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:(i+1)%route.length};
  }
  throw new Error('Empty highway route');
}

type EntityFactory=(id:string,kind:VehicleId,x:number,z:number)=>Entity;
const AMBIENT_MAX=4; // Alongside eight city cars and four police.
const AMBIENT_POOL_MAX=12; // Also bounds taken and abandoned optional cars.
const AMBIENT_INTERVAL=5; // Real seconds, independent of the accelerated clock.
const HIDDEN_DISTANCE=1600; // Beyond both scene fog and the ambient snapshot radius.
const NEAR_DISTANCE=3000, RECYCLE_DISTANCE=4000;
// Keep very slow models in the city and parked cohorts, where they remain
// available to drive, instead of placing them in freeway traffic.
const HIGHWAY_MIN_TOP_SPEED=20;
const highwayVehicles=VEHICLE_IDS.filter(kind=>VEHICLES[kind].maxSpeed>=HIGHWAY_MIN_TOP_SPEED);

function desiredAmbient(time:number):number{return Math.round(2+2*trafficDemand(time).intensity);}
function observers(world:World):Entity[]{
  return world.players.map(player=>world.entities.find(entity=>entity.id===player.entityId)).filter((entity):entity is Entity=>!!entity);
}
function hidden(x:number,z:number,viewers:Entity[]):boolean{
  return viewers.every(viewer=>Math.hypot(viewer.x-x,viewer.z-z)>HIDDEN_DISTANCE);
}
// Locate the opposite-moving route on the driver's current road. Rewinding
// along that route makes the approaching car follow the same highway instead
// of choosing a visually nearby but disconnected road across the Bay.
function oncomingApproach(viewer:Entity):{routeId:number;fraction:number}|null {
  if(viewer.supportId!=='ground')return null;
  const onHighway=ROADS.some(road=>{
    if(road.kind!=='highway')return false;
    const angle=road.angle??0,ux=Math.sin(angle),uz=Math.cos(angle),x=viewer.x-road.x,z=viewer.z-road.z;
    return Math.abs(x*ux+z*uz)<=road.d/2&&Math.abs(x*uz-z*ux)<=road.w/2;
  });
  if(!onHighway)return null;
  const forward={x:-Math.sin(viewer.yaw),z:-Math.cos(viewer.yaw)};
  let best=Infinity,answer:{routeId:number;fraction:number}|null=null;
  for(const routeId of HIGHWAY_ROUTE_IDS){
    const route=ROUTES[routeId],{lengths,total}=highwayLengths.get(routeId)!;
    let traveled=0;
    for(let i=0;i<route.length;i++){
      const a=route[i],b=route[(i+1)%route.length],dx=b.x-a.x,dz=b.z-a.z,length=lengths[i];
      if(!length){traveled+=length;continue;}
      const alignment=(dx*forward.x+dz*forward.z)/length;
      if(alignment<-.5){
        const t=Math.max(0,Math.min(1,((viewer.x-a.x)*dx+(viewer.z-a.z)*dz)/(length*length)));
        const distance=Math.hypot(viewer.x-a.x-t*dx,viewer.z-a.z-t*dz);
        const score=distance+4*(1+alignment);
        if(distance<24&&score<best){best=score;answer={routeId,fraction:(traveled+t*length)/total};}
      }
      traveled+=length;
    }
  }
  return answer;
}
// A hidden oncoming car can enter the simulation already moving, but only if
// two seconds of straight travel are supported and clear of buildings and of
// the current trajectories of nearby entities. Otherwise it starts at rest.
function oncomingEntrySpeed(car:Entity,world:World):number {
  if(car.kind==='person')return 0;
  const spec=VEHICLES[car.kind],speed=Math.min(15,spec.maxSpeed*.75),forward={x:-Math.sin(car.yaw),z:-Math.cos(car.yaw)};
  const target=ROUTES[car.routeId]?.[car.waypoint];
  if(!target||Math.hypot(target.x-car.x,target.z-car.z)<speed*2+15)return 0;
  for(let d=0;d<=speed*2;d+=3){
    const x=car.x+forward.x*d,z=car.z+forward.z*d;
    for(const side of [-1,1])for(const end of [-1,1]){
      const px=x+side*forward.z*spec.width/2+end*forward.x*spec.length/2;
      const pz=z-side*forward.x*spec.width/2+end*forward.z*spec.length/2;
      if(!isSurface(px,pz))return 0;
    }
    if(nearbyBuildings(x,z,spec.length+2).some(building=>contact(body({...car,x,z}),{...building,yaw:0})))return 0;
  }
  for(const other of world.entities){
    if(other===car)continue;
    const size=other.kind==='person'?{width:.7,length:.7,height:1.9}:VEHICLES[other.kind];
    if(car.y>=other.y+size.height||other.y>=car.y+spec.height)continue;
    const dx=other.x-car.x,dz=other.z-car.z;
    const vx=-Math.sin(other.yaw)*other.speed+other.pushX-forward.x*speed;
    const vz=-Math.cos(other.yaw)*other.speed+other.pushZ-forward.z*speed;
    const velocitySquared=vx*vx+vz*vz;
    const t=velocitySquared?Math.max(0,Math.min(2,-(dx*vx+dz*vz)/velocitySquared)):0;
    const clearance=(Math.hypot(spec.width,spec.length)+Math.hypot(size.width,size.length))/2+4;
    if(Math.hypot(dx+vx*t,dz+vz*t)<clearance)return 0;
  }
  return speed;
}
function ambientCandidate(world:World,id:string,clockwise:boolean,make:EntityFactory,nearOnly=false):Entity|null {
  const baseId=id;let suffix=0;
  while(world.entities.some(entity=>entity.id===id))id=`${baseId}-${++suffix}`;
  // Spread the same bounded ambient fleet among the main route and both
  // Peninsula alternatives. Preserve the incident's original main route.
  const alternative=id==='ambient-seed-0'?0:hash(`road-${id}`)%(HIGHWAY_ROUTE_IDS.length/2);
  const routeId=HIGHWAY_ROUTE_IDS[alternative*2+(clockwise?0:1)],viewers=observers(world);
  const choice=hash(id)%VEHICLE_IDS.length,preferred=VEHICLE_IDS[choice];
  const kind=VEHICLES[preferred].maxSpeed>=HIGHWAY_MIN_TOP_SPEED?preferred:highwayVehicles[choice%highwayVehicles.length];
  const nearby=viewers.map(viewer=>world.entities.filter(entity=>entity.id.startsWith('ambient-')&&!entity.driver&&entity.autopilot&&
    Math.hypot(entity.x-viewer.x,entity.z-viewer.z)<NEAR_DISTANCE).length);
  const first=viewers.length?Math.floor(world.time/(AMBIENT_INTERVAL*2))%viewers.length:0;
  const candidates:{pose:ReturnType<typeof routeDistancePose>;score:number;oncoming?:boolean}[]=[];
  // Prefer up to two spaced oncoming cars on the active road. All such
  // candidates use the same hidden-space and body checks as ordinary traffic.
  for(let i=0;i<viewers.length;i++){
    const viewer=viewers[i],forward={x:-Math.sin(viewer.yaw),z:-Math.cos(viewer.yaw)};
    const approaching=world.entities.filter(entity=>{
      if(!entity.id.startsWith('ambient-')||entity.driver||!entity.autopilot)return false;
      const x=entity.x-viewer.x,z=entity.z-viewer.z,along=x*forward.x+z*forward.z;
      const side=Math.abs(x*forward.z-z*forward.x);
      const alignment=-Math.sin(entity.yaw)*forward.x-Math.cos(entity.yaw)*forward.z;
      return along>0&&along<2200&&side<300&&alignment<-.5;
    });
    if(approaching.length>=2)continue;
    const approach=oncomingApproach(viewer);if(!approach)continue;
    const {total}=highwayLengths.get(approach.routeId)!;
    for(const setback of [1605,1625,1650,1700,1750,1850,2000,2200,2500]){
      const pose=routeDistancePose(approach.routeId,approach.fraction-setback/total);
      const distance=Math.hypot(pose.x-viewer.x,pose.z-viewer.z);
      if(distance>NEAR_DISTANCE||!isSurface(pose.x,pose.z)||!hidden(pose.x,pose.z,viewers)||
        world.entities.some(other=>{
          const gap=Math.hypot(other.x-pose.x,other.z-pose.z);
          return gap<30||(gap<150&&other.autopilot&&other.routeId===approach.routeId);
        }))continue;
      const rank=(i-first+viewers.length)%viewers.length;
      candidates.push({pose,score:nearby[i]*10000000+rank*10000+distance-2500,oncoming:true});
    }
  }
  for(let attempt=0;attempt<36;attempt++){
    const fraction=(hash(`${id}:${attempt}`)%100000)/100000;
    const pose=routeDistancePose(routeId,fraction);
    if(!isSurface(pose.x,pose.z)||!hidden(pose.x,pose.z,viewers))continue;
    if(world.entities.some(other=>Math.hypot(other.x-pose.x,other.z-pose.z)<30))continue;
    if(!viewers.length){
      const car=make(id,kind,pose.x,pose.z);Object.assign(car,pose,{npc:true,autopilot:true});
      if(!nearbyBuildings(car.x,car.z,10).some(building=>contact(body(car),{...building,yaw:0})))return car;
      continue;
    }
    // Prefer drivers with fewer nearby cars, rotating ties deterministically.
    // A candidate must remain hidden from every observer, even when another
    // driver would benefit from it. Isolated players get a fair share.
    let score=Infinity;
    for(let i=0;i<viewers.length;i++){
      const viewer=viewers[i],distance=Math.hypot(pose.x-viewer.x,pose.z-viewer.z);
      if(distance>NEAR_DISTANCE)continue;
      const rank=(i-first+viewers.length)%viewers.length;
      const ahead=(pose.x-viewer.x)*-Math.sin(viewer.yaw)+(pose.z-viewer.z)*-Math.cos(viewer.yaw)>0;
      score=Math.min(score,nearby[i]*10000000+rank*10000+distance+(ahead?0:2000));
    }
    if(Number.isFinite(score))candidates.push({pose,score});
    else if(!nearOnly)candidates.push({pose,score:1e9+attempt});
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const {pose,oncoming} of candidates){
    const car=make(id,kind,pose.x,pose.z);Object.assign(car,pose,{npc:true,autopilot:true});
    if(nearbyBuildings(car.x,car.z,10).some(building=>contact(body(car),{...building,yaw:0})))continue;
    if(oncoming){car.speed=oncomingEntrySpeed(car,world);car.vx=-Math.sin(car.yaw)*car.speed;car.vz=-Math.cos(car.yaw)*car.speed;}
    return car;
  }
  return null;
}
function addAmbient(world:World,id:string,clockwise:boolean,make:EntityFactory):boolean {
  const car=ambientCandidate(world,id,clockwise,make);
  if(!car)return false;
  world.entities.push(car);return true;
}

/** Called after the small city and parked cohorts have been created. */
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
    const removable=ambient.find(entity=>entity.id!==TRAFFIC_INCIDENT.entityId&&!entity.driver&&!entity.owner&&entity.supportId!=='ferry'&&
      (excessTraffic?entity.autopilot&&onHighway(entity)&&entity.speed>5:!entity.autopilot||(!onHighway(entity)&&entity.speed>5))&&hidden(entity.x,entity.z,viewers)&&
      !world.entities.some(other=>other!==entity&&Math.hypot(other.x-entity.x,other.z-entity.z)<35));
    if(removable)world.entities=world.entities.filter(entity=>entity!==removable);
  }else if(unattended.length===target){
    const viewers=observers(world);
    // Reclaim a free-flowing car only when it is far from *every* driver and
    // another hidden, supported slot exists closer to a driver. Both removal
    // and addition are hidden from every observer in the same snapshot.
    const far=unattended.find(entity=>entity.id!==TRAFFIC_INCIDENT.entityId&&!entity.owner&&entity.supportId==='ground'&&entity.speed>5&&
      viewers.every(viewer=>Math.hypot(viewer.x-entity.x,viewer.z-entity.z)>RECYCLE_DISTANCE)&&
      !world.entities.some(other=>other!==entity&&Math.hypot(other.x-entity.x,other.z-entity.z)<35));
    if(far){
      const demand=trafficDemand(world.time),clockwiseChance=.5+.25*demand.morning-.25*demand.evening;
      const id=`ambient-${tick+1}`,clockwise=(hash(`direction-${tick+1}`)%10000)/10000<clockwiseChance;
      const replacement=ambientCandidate(world,id,clockwise,make,true);
      if(replacement){world.entities=world.entities.filter(entity=>entity!==far);world.entities.push(replacement);}
    }
  }
}

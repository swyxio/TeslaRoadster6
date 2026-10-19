import { buildingBlocksPose } from './landmark-collision';
import type { Entity, Input, Player, World } from './game';
import { NEUTRAL } from './game';
import { HIGHWAYS, OVERPASS, ROADS, buildingRoofHeight, domeRoofHeight, isSurface, nearbyBuildings, overpassHeight, rampHeight, terrainHeight } from './map';
import { engageAutopilot, HIGHWAY_ROUTE_IDS, ROUTES } from './traffic';
import { islandProtected } from './ferry';
import { canAssignDeliveryRoof, updateLevel, type DeliveryState } from './delivery';
import { hasRockets } from './upgrades';
import { contact, dimensions } from './physics';
import { primitiveExtent, sampleLandmarkPrimitive } from './new-landmark-surfaces';

export type PoliceState = { targetId: string | null; lastSeen: number; nextPlan: number; path: Point[]; highwayPatrol?:true; airPatrol?:true; nextFlightAt?:number; cause?:'flight'|'speeding'; peakSpeedKph?:number };
type Point = { x:number; z:number };
const SIGHT=85, PURSUIT_RANGE=110, ESCAPE_SECONDS=10;
// Fictional arcade limits; normal highway NPCs and self-driving modes cruise
// below the trigger. An officer must see the actual car to start a chase.
export const HIGHWAY_SPEED_LIMIT_KPH=110;
export const HIGHWAY_SPEED_TRIGGER_KPH=125;
const PATROL_HIDDEN_DISTANCE=1600, PATROL_INTERVAL=15;
const highwayRects=ROADS.filter(road=>road.kind==='highway').map(road=>{
  const c=Math.cos(road.angle??0),s=Math.sin(road.angle??0);
  return {...road,c,s,rx:Math.abs(c)*road.w/2+Math.abs(s)*road.d/2,rz:Math.abs(s)*road.w/2+Math.abs(c)*road.d/2};
});
export function onHighway(x:number,z:number):boolean {
  for(const r of highwayRects){
    const dx=x-r.x,dz=z-r.z;if(Math.abs(dx)>r.rx||Math.abs(dz)>r.rz)continue;
    if(Math.abs(dx*r.c-dz*r.s)<=r.w/2&&Math.abs(dx*r.s+dz*r.c)<=r.d/2)return true;
  }
  return false;
}
const points:Point[]=[];
const rows=[-240,-180,-120,-60,0,60,120,180,240];
for(const x of [-360,-300,-240,-180,-120,-60,0,60,330,390,450,510,570]) for(const z of rows)
  if(isSurface(x,z)&&clear(x,z))points.push({x,z});
function clear(x:number,z:number,yaw=0){return !nearbyBuildings(x,z,5).some(b=>buildingBlocksPose(b,{kind:'model-s',x,z,y:terrainHeight(x,z)??0,yaw,pitch:0,roll:0,supportId:'ground'}));}
function lineClear(a:Point,b:Point){
  const length=Math.hypot(a.x-b.x,a.z-b.z),n=Math.ceil(length/8),yaw=Math.atan2(a.x-b.x,a.z-b.z);
  const vehicle=dimensions('model-s');
  for(let i=0;i<=n;i++){
    const t=n?i/n:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    if(!isSurface(x,z)||!clear(x,z,yaw))return false;
    if(i===0)continue;
    // Sweep the conservative police body between samples so a thin spaceport
    // channel wall cannot slip through the clearance check between poses.
    const before=(i-1)/n,px=a.x+(b.x-a.x)*before,pz=a.z+(b.z-a.z)*before;
    const midX=(px+x)/2,midZ=(pz+z)/2,sweptLength=vehicle.length+length/n;
    const swept={x:midX,z:midZ,w:vehicle.width,d:sweptLength,yaw};
    if(nearbyBuildings(midX,midZ,Math.hypot(vehicle.width,sweptLength)/2).some(building=>
      building.style==='spaceport'&&building.parts?.some(part=>{
        const e=primitiveExtent(part),base=building.landmarkBase??0;
        if(!contact(swept,{x:building.x+part.x,z:building.z+part.z,w:e.w,d:e.d,yaw:e.yaw}))return false;
        const low=Math.min(terrainHeight(px,pz)??0,terrainHeight(midX,midZ)??0,terrainHeight(x,z)??0);
        const high=Math.max(terrainHeight(px,pz)??0,terrainHeight(midX,midZ)??0,terrainHeight(x,z)??0)+vehicle.height;
        return low<base+e.top-.001&&high>base+e.bottom+.001;
      })))return false;
  }
  return true;
}
const edges=points.map((a,i)=>points.map((b,j)=>({b,j})).filter(({b,j})=>j!==i&&(a.x===b.x||a.z===b.z)&&!points.some((p,k)=>k!==i&&k!==j&&((p.x===a.x&&p.x===b.x&&p.z>Math.min(a.z,b.z)&&p.z<Math.max(a.z,b.z))||(p.z===a.z&&p.z===b.z&&p.x>Math.min(a.x,b.x)&&p.x<Math.max(a.x,b.x))))&&lineClear(a,b)).map(({j})=>j));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const separation=(a:Entity,b:Entity)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function nearest(p:Point){let best=0;for(let i=1;i<points.length;i++)if(distance(p,points[i])<distance(p,points[best]))best=i;return best;}
function route(from:Point,to:Point):Point[]{
  if(lineClear(from,to))return [{x:to.x,z:to.z}];
  const start=nearest(from),end=nearest(to),dist=points.map(()=>Infinity),prev=points.map(()=>-1),used=new Set<number>();dist[start]=0;
  while(used.size<points.length){let best=-1;for(let i=0;i<points.length;i++)if(!used.has(i)&&(best<0||dist[i]<dist[best]))best=i;if(best<0||!Number.isFinite(dist[best])||best===end)break;used.add(best);for(const next of edges[best]){const d=dist[best]+distance(points[best],points[next]);if(d<dist[next]){dist[next]=d;prev[next]=best;}}}
  if(!Number.isFinite(dist[end]))return [points[start]];
  const result:Point[]=[];for(let at=end;at!==-1;at=prev[at])result.unshift(points[at]);
  result.push({x:to.x,z:to.z});
  // Do not repeatedly steer back toward an intersection already passed on this segment.
  while(result.length>1&&lineClear(from,result[1]))result.shift();
  return result;
}
export function newPolice(highwayPatrol=false):PoliceState{return {targetId:null,lastSeen:0,nextPlan:0,path:[],...(highwayPatrol?{highwayPatrol:true as const}:{})};}
function resumePatrol(cop:Entity){
  const state=cop.police!;state.targetId=null;state.path=[];
  delete state.cause;delete state.peakSpeedKph;
  if(engageAutopilot(cop))return;
  // A pursuit may end beyond the normal patrol grid or on the upper road.
  // Return to an existing route rather than leaving a marked car stranded.
  const destinations=ROUTES.flat();
  const destination=destinations.reduce((best,p)=>distance(cop,p)<distance(cop,best)?p:best);
  cop.autopilot=true;
  if(cop.supportId==='overpass'){
    const exit=-Math.sin(cop.yaw)>=0?OVERPASS.end+10:OVERPASS.start-10;
    // Leave the ramp on the destination's side so the next leg cannot cut back through the deck.
    const side=destination.z>=OVERPASS.z?1:-1;
    state.path=[{x:exit,z:OVERPASS.z+side*(OVERPASS.width/2+20)},destination];
  }else state.path=route(cop,destination);
}
function heightAboveSurface(e:Entity){
  // Measure height above the nearest surface below the car, including the
  // upper roadway or a rooftop, instead of treating world altitude as flight.
  let floor=terrainHeight(e.x,e.z)??0;
  const deck=overpassHeight(e.x,e.z);if(deck!==null&&deck<=e.y)floor=Math.max(floor,deck);
  const ramp=rampHeight(e.x,e.z);if(ramp!==null&&ramp<=e.y)floor=Math.max(floor,ramp);
  const dome=domeRoofHeight(e.x,e.z);if(dome!==null&&dome<=e.y)floor=Math.max(floor,dome);
  for(const b of nearbyBuildings(e.x,e.z,0))if(b.parts||(Math.abs(e.x-b.x)<=b.w/2&&Math.abs(e.z-b.z)<=b.d/2)){
    if(b.parts){
      const base=b.landmarkBase??0;
      for(const part of b.parts){
        const extent=primitiveExtent(part);
        if(base+extent.top<=floor||base+extent.bottom>e.y)continue;
        const surface=sampleLandmarkPrimitive(part,e.x-b.x,e.z-b.z);
        if(surface){const roof=base+surface.top;if(roof<=e.y)floor=Math.max(floor,roof);}
      }
    }else{const roof=buildingRoofHeight(b,e.x,e.z);if(roof<=e.y)floor=Math.max(floor,roof);}
  }
  return e.y-floor;
}
function flightHeight(e:Entity){return e.kind!=='person'&&e.supportId===null?Math.max(0,heightAboveSurface(e)):0;}
/** Immutable physical proof of one police stop; the fine depends on the wallet at application time. */
export type TicketEvidence={seconds:number;peakHeight:number;at:number;x:number;z:number;canFly:boolean;roofEligible?:boolean;onFoot?:boolean;cause?:'flight'|'speeding';speedKph?:number};
/** Unknown vehicle capability on foot preserves an accessible existing roof. */
export function ticketRoofAccess(evidence:TicketEvidence):boolean|null {
  return evidence.onFoot===true?null:evidence.roofEligible===true;
}
export function applyTicketEvidence(delivery:DeliveryState,evidence:TicketEvidence):void {
  const durationFine=Math.min(120,Math.floor(evidence.seconds/2)*8),heightFine=Math.min(80,Math.floor(evidence.peakHeight/10)*10),repeatFine=delivery.tickets*35;
  const cause=evidence.cause??'flight',speedKph=cause==='speeding'?Math.round(evidence.speedKph??0):0;
  const speedFine=cause==='speeding'?Math.min(120,Math.max(0,Math.floor((speedKph-HIGHWAY_SPEED_LIMIT_KPH)/10)*10)):0;
  const amount=60+durationFine+heightFine+speedFine+repeatFine;
  delivery.tickets++;
  // The persisted ticket carries its reason and recorded speed so the client
  // can explain the same fine the authoritative wallet applied.
  const ticket={amount,offense:delivery.tickets,flightSeconds:Math.floor(evidence.seconds),peakHeight:Math.round(evidence.peakHeight),durationFine,heightFine,repeatFine,cause,speedKph,speedFine};
  delivery.lastTicket=ticket;
  delivery.cash-=amount;updateLevel(delivery);delivery.ticketGraceUntil=evidence.at+20;delivery.flight.seconds=0;delivery.flight.peakHeight=0;
}

type PatrolRoute={id:number;points:Point[];lengths:number[];starts:number[];total:number};
const patrolRoutes:PatrolRoute[]=HIGHWAY_ROUTE_IDS.map(id=>{
  const points=ROUTES[id],lengths=points.map((a,i)=>distance(a,points[(i+1)%points.length]));
  let total=0;const starts=lengths.map(length=>{const start=total;total+=length;return start;});
  return {id,points,lengths,starts,total};
});
function patrolPose(route:PatrolRoute,at:number){
  at=((at%route.total)+route.total)%route.total;
  let i=route.lengths.findIndex((length,index)=>at<route.starts[index]+length);
  if(i<0)i=route.points.length-1;
  const a=route.points[i],b=route.points[(i+1)%route.points.length],length=route.lengths[i],t=length?(at-route.starts[i])/length:0;
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId:route.id,waypoint:(i+1)%route.points.length};
}
/** Supply a checked-by-caller starting pose on the existing connected Bay loop. */
export function highwayPolicePose(index:number,attempt=0){
  const route=patrolRoutes[index%2],fraction=(.06+(index%2)*.45+attempt*.013)%1;
  return patrolPose(route,route.total*fraction);
}

// Find a lane heading toward the player, then place the patrol well ahead of
// them on that same continuous lane. It can meet an approaching player without
// teleporting into sight or spawning a new vehicle.
function approachingRoute(target:Entity):{route:PatrolRoute;at:number}|null {
  const direction=target.speed< -1?-1:1,fx=-Math.sin(target.yaw)*direction,fz=-Math.cos(target.yaw)*direction;
  let best=24,result:{route:PatrolRoute;at:number}|null=null;
  for(const route of patrolRoutes)for(let i=0;i<route.points.length;i++){
    const a=route.points[i],b=route.points[(i+1)%route.points.length],length=route.lengths[i];if(!length)continue;
    const dx=b.x-a.x,dz=b.z-a.z;if((dx*fx+dz*fz)/length>-.5)continue;
    const t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.z-a.z)*dz)/(length*length)));
    const d=Math.hypot(target.x-a.x-t*dx,target.z-a.z-t*dz);
    if(d<best){best=d;result={route,at:route.starts[i]+length*t};}
  }
  return result;
}
function patrolSpawnClear(world:World,cop:Entity,pose:ReturnType<typeof patrolPose>):boolean {
  const y=terrainHeight(pose.x,pose.z);if(y===null||!onHighway(pose.x,pose.z))return false;
  const size=dimensions(cop.kind),fx=-Math.sin(pose.yaw),fz=-Math.cos(pose.yaw),rx=Math.cos(pose.yaw),rz=-Math.sin(pose.yaw);
  for(const ahead of [-size.length/2,size.length/2])for(const side of [-size.width/2,size.width/2])
    if(!isSurface(pose.x+fx*ahead+rx*side,pose.z+fz*ahead+rz*side))return false;
  if(nearbyBuildings(pose.x,pose.z,size.length+4).some(building=>buildingBlocksPose(building,{...cop,...pose,y})))return false;
  return !world.entities.some(entity=>entity!==cop&&Math.hypot(entity.x-pose.x,entity.z-pose.z)<14);
}
function redistributePatrol(world:World,dt:number,entities:Map<string,Entity>):void {
  const tick=Math.floor((world.time+1e-7)/PATROL_INTERVAL);
  if(tick<=0||tick===Math.floor((world.time-dt+1e-7)/PATROL_INTERVAL))return;
  const viewers=world.players.map(player=>entities.get(player.entityId)).filter((entity):entity is Entity=>!!entity);
  const patrols=world.entities.filter(entity=>entity.police?.highwayPatrol);
  if(!viewers.length||!patrols.length)return;
  const hidden=(point:Point)=>viewers.every(viewer=>distance(point,viewer)>PATROL_HIDDEN_DISTANCE);
  const roadViewers=viewers.filter(viewer=>viewer.kind!=='person'&&viewer.supportId==='ground'&&!viewer.inDome&&!islandProtected(viewer)&&onHighway(viewer.x,viewer.z));
  // A hidden officer who is already the only nearby patrol for another
  // player is still serving that player; do not bounce it between drivers.
  const available=patrols.filter(cop=>!cop.police!.targetId&&!cop.driver&&cop.supportId==='ground'&&hidden(cop)&&
    !roadViewers.some(viewer=>distance(cop,viewer)<2100&&!patrols.some(other=>other!==cop&&distance(other,viewer)<2100)));
  if(!available.length)return;
  const targets=roadViewers
    .map(viewer=>({viewer,nearest:Math.min(...patrols.map(cop=>distance(viewer,cop)))}))
    .filter(item=>item.nearest>2100).sort((a,b)=>b.nearest-a.nearest);
  for(const {viewer} of targets){
    const lane=approachingRoute(viewer);if(!lane)continue;
    for(const cop of available)for(const ahead of [1750,2000,2400,2900,3500]){
      const pose=patrolPose(lane.route,lane.at-ahead);
      if(!hidden(pose)||distance(pose,viewer)>2100||!patrolSpawnClear(world,cop,pose))continue;
      Object.assign(cop,pose,{y:terrainHeight(pose.x,pose.z)!,supportId:'ground',autopilot:true,navigation:null,pauseUntil:0,
        speed:0,vx:0,vy:0,vz:0,pushX:0,pushZ:0,steering:0,pitch:0,roll:0,pitchRate:0,yawRate:0,rollRate:0});
      cop.police!.path=[];return; // At most one relocation per interval.
    }
  }
}

/** Follow shared highway vertices around curves instead of the city-only graph. */
function highwayPath(from:Point,to:Point):Point[]|null {
  let best=Infinity,result:Point[]|null=null;
  for(const highway of HIGHWAYS){
    const closest=(p:Point)=>{
      let found={index:0,distance:Infinity};
      for(let i=1;i<highway.points.length;i++){
        const a=highway.points[i-1],b=highway.points[i],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
        const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;
        const d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);if(d<found.distance)found={index:i-1,distance:d};
      }
      return found;
    };
    const a=closest(from),b=closest(to),score=a.distance+b.distance,margin=(highway.width??32)/2+6;
    if(a.distance>margin||b.distance>margin||score>=best)continue;
    const path:Point[]=[];
    if(a.index<b.index)for(let i=a.index+1;i<=b.index;i++)path.push(highway.points[i]);
    if(a.index>b.index)for(let i=a.index;i>b.index;i--)path.push(highway.points[i]);
    path.push({x:to.x,z:to.z});
    // Skip intermediate vertices only when the whole shortcut stays on the
    // shared road and avoids authoritative buildings.
    while(path.length>1){
      const end=path[1],count=Math.ceil(distance(from,end)/6);let road=true;
      for(let i=0;i<=count;i++){const t=count?i/count:0;if(!onHighway(from.x+(end.x-from.x)*t,from.z+(end.z-from.z)*t)){road=false;break;}}
      if(!road||!lineClear(from,end))break;path.shift();
    }
    best=score;result=path;
  }
  return result;
}
export function updatePolice(world:World,dt:number,onTicket?:(player:Player,apply:()=>void,evidence:TicketEvidence)=>void):void {
  const entities=new Map(world.entities.map(entity=>[entity.id,entity]));
  const players=new Map(world.players.map(player=>[player.id,player]));
  redistributePatrol(world,dt,entities);
  const pursuits=new Set(world.entities.flatMap(entity=>entity.police?.targetId?[entity.police.targetId]:[]));
  const racers=new Set(world.races.rounds.flatMap(round=>round.entrants.filter(entrant=>entrant.status==='entered').map(entrant=>entrant.playerId)));
  const suspects:{player:Player;entity:Entity;cause:'flight'|'speeding';speedKph:number}[]=[];
  for (const player of world.players) {
    const e=entities.get(player.entityId), flight=player.delivery.flight;
    // The fictional arena is a no-police playground, including its ceiling.
    const protectedArea=!!e&&(e.inDome||islandProtected(e)||racers.has(player.id));
    const height=e&&!protectedArea?flightHeight(e):0;
    if(protectedArea){flight.seconds=0;flight.peakHeight=0;}
    if(height>.05){flight.seconds+=dt;flight.peakHeight=Math.max(flight.peakHeight,height);flight.lastAirborneAt=world.time;}
    else if(world.time-flight.lastAirborneAt>3&&!pursuits.has(player.id)){flight.seconds=0;flight.peakHeight=0;}
    if(e&&!protectedArea){
      const speedKph=Math.abs(e.speed)*3.6;
      if(height>3&&height<=80)suspects.push({player,entity:e,cause:'flight',speedKph});
      else if(e.kind!=='person'&&e.supportId==='ground'&&speedKph>HIGHWAY_SPEED_TRIGGER_KPH&&onHighway(e.x,e.z))
        suspects.push({player,entity:e,cause:'speeding',speedKph});
    }
  }
  for(const cop of world.entities){
    const state=cop.police;if(!state)continue;
    let player=state.targetId?players.get(state.targetId):undefined;
    let target=player?entities.get(player.entityId):undefined;
    if(state.targetId&&(!player||!target||(target.inDome||islandProtected(target)||racers.has(player.id))||world.time<player.delivery.ticketGraceUntil)){resumePatrol(cop);player=undefined;target=undefined;}
    if(!target){
      // Select the nearest eligible suspect in player order; strict comparison
      // preserves the previous stable-sort tie break without repeated scans.
      let nearest=SIGHT,chosen:typeof suspects[number]|undefined;
      for(const candidate of suspects){
        if(world.time<candidate.player.delivery.ticketGraceUntil)continue;
        const distance=separation(cop,candidate.entity);
        if(distance<nearest){nearest=distance;chosen=candidate;player=candidate.player;target=candidate.entity;}
      }
      if(player&&target&&chosen){state.targetId=player.id;state.cause=chosen.cause;state.peakSpeedKph=chosen.cause==='speeding'?chosen.speedKph:undefined;state.lastSeen=world.time;state.nextPlan=0;cop.autopilot=true;}
    }
    if(!player||!target){
      if(state.path.length&&cop.supportId==='ground'&&engageAutopilot(cop))state.path=[];
      continue;
    }
    const d=separation(cop,target);
    // The closing distance on a highway is much larger than in a city. Keep
    // the same time and distance limits for the original airborne pursuit.
    const pursuitRange=state.cause==='speeding'?300:PURSUIT_RANGE;
    const escapeSeconds=state.cause==='speeding'?20:ESCAPE_SECONDS;
    if(d<pursuitRange)state.lastSeen=world.time;
    if(world.time-state.lastSeen>escapeSeconds){resumePatrol(cop);continue;}
    if(state.cause==='speeding'&&target.supportId==='ground'&&onHighway(target.x,target.z))state.peakSpeedKph=Math.max(state.peakSpeedKph??0,Math.abs(target.speed)*3.6);
    if(cop.supportId!==null&&target.supportId===cop.supportId&&d<12){
      target.speed*=Math.exp(-2.2*dt);
      // A pursuing car can keep nudging a suspect forward at low speed. A
      // slightly wider stop threshold prevents a permanent bumper-to-bumper
      // crawl while still requiring a physical slowdown before the ticket.
      if(d<7&&Math.abs(target.speed)<(state.cause==='speeding'?6:4)){
        const evidence:TicketEvidence={seconds:player.delivery.flight.seconds,peakHeight:player.delivery.flight.peakHeight,
          at:world.time,x:target.x,z:target.z,canFly:hasRockets(target),roofEligible:canAssignDeliveryRoof(target),onFoot:target.kind==='person',
          cause:state.cause??'flight',speedKph:state.peakSpeedKph};
        const applyTicket=()=>applyTicketEvidence(player!.delivery,evidence);
        if(onTicket)onTicket(player,applyTicket,evidence);else applyTicket();
        // The stop and patrol reset are immediate physical effects; the fine is committed separately.
        player.delivery.ticketGraceUntil=world.time+20;player.delivery.flight.seconds=0;player.delivery.flight.peakHeight=0;
        target.autopilot=false;target.navigation=null;target.speed=0;target.vx=0;target.vz=0;target.pushX=0;target.pushZ=0;
        for(const other of world.entities)if(other.police?.targetId===player.id)resumePatrol(other);
        continue;
      }
    }
    if(world.time>=state.nextPlan){state.path=onHighway(cop.x,cop.z)&&onHighway(target.x,target.z)?highwayPath(cop,target)??route(cop,target):route(cop,target);state.nextPlan=world.time+3;}
  }
}
export function policeInput(cop:Entity,world:World):Input {
  const state=cop.police,player=world.players.find(p=>p.id===state?.targetId),target=world.entities.find(e=>e.id===player?.entityId);
  if(!state||cop.supportId===null)return NEUTRAL;
  let next:Point;
  if(cop.supportId==='overpass'){
    // The pursuit graph is on ground roads. Continue off the ramp in the
    // direction the car is facing before trying to follow that graph again.
    next={x:-Math.sin(cop.yaw)>=0?OVERPASS.end+10:OVERPASS.start-10,z:OVERPASS.z};
  }else if(cop.supportId==='ground'){
    while(state.path.length>1&&distance(cop,state.path[0])<8)state.path.shift();
    // The final waypoint was sampled at the last route refresh. Following the
    // live car avoids braking for a stale point behind a moving suspect.
    const liveHighwayTarget=state.cause==='speeding'&&target&&state.path.length===1&&onHighway(cop.x,cop.z)&&onHighway(target.x,target.z);
    const destination=liveHighwayTarget?target:state.path[0]??target;if(!destination)return NEUTRAL;next=destination;
  }else return NEUTRAL;
  const angle=Math.atan2(Math.sin(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw),Math.cos(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw));
  const reversing=Math.abs(angle)>2.25&&cop.speed<1;
  const steer=Math.max(-1,Math.min(1,angle*1.6))*(reversing?-1:1);
  const chaseSpeed=state.cause==='speeding'&&onHighway(cop.x,cop.z)?42:15;
  const cruise=Math.abs(angle)>.65?6:Math.abs(angle)>.3?Math.min(18,chaseSpeed):chaseSpeed;
  const direction=reversing?-1:1,fx=-Math.sin(cop.yaw)*direction,fz=-Math.cos(cop.yaw)*direction;
  const size=dimensions(cop.kind),speed=Math.max(0,cop.speed*direction);
  let safeSpeed=reversing?3:cruise;
  for(const other of world.entities){
    // A stop deliberately approaches its suspect, but should not hit other
    // traffic while pursuing or while reversing to turn around.
    if(other===cop||other===target)continue;
    const obstacle=dimensions(other.kind);
    if(cop.y>=other.y+obstacle.height||other.y>=cop.y+size.height)continue;
    const dx=other.x-cop.x,dz=other.z-cop.z,along=dx*fx+dz*fz;
    if(along<=0||along>800)continue;
    const side=Math.abs(dx*fz-dz*fx);
    if(side>(size.width+obstacle.width+obstacle.length)/2+.5)continue;
    const ox=-Math.sin(other.yaw),oz=-Math.cos(other.yaw),alignment=ox*fx+oz*fz,cross=ox*fz-oz*fx;
    const lateralReach=(size.width+obstacle.width*Math.abs(alignment)+obstacle.length*Math.abs(cross))/2+.5;
    if(side>lateralReach)continue;
    const gap=along-(size.length+obstacle.length)/2;
    const leaderSpeed=other.speed*alignment+other.pushX*fx+other.pushZ*fz;
    const closing=Math.max(0,speed-leaderSpeed);
    // Use a conservative deceleration and reaction margin, rather than
    // assuming the patrol can stop instantly at highway speed.
    const stoppingDistance=3+speed*.5+closing*closing/12;
    if(gap<stoppingDistance)return {...NEUTRAL,steer,brake:true};
    safeSpeed=Math.min(safeSpeed,Math.max(0,leaderSpeed+(gap-3-speed*1.3)*.55));
  }
  if(speed>safeSpeed+1||safeSpeed<.1)return {...NEUTRAL,steer,brake:true};
  return {...NEUTRAL,steer,throttle:reversing?(speed<safeSpeed?-.7:0):cop.speed<safeSpeed?.8:0,brake:!reversing&&cop.speed>safeSpeed+2};
}

/** A tagged rocket officer may make a bounded, physical hop while pursuing a
 * flying driver. The caller consumes `jump` as an NPC physics pulse; neither
 * positions nor air are changed here. Ground pursuit resumes after landing. */
export function policeFlight(cop:Entity,world:World,groundInput:Input):{input:Input;jump:boolean} {
  const ground={input:groundInput,jump:false},state=cop.police;
  if(!state?.airPatrol||cop.driver||state.cause!=='flight'||!state.targetId||!hasRockets(cop))return ground;
  if(cop.supportId!==null&&groundInput.brake)return ground;
  const player=world.players.find(p=>p.id===state.targetId),target=world.entities.find(e=>e.id===player?.entityId);
  if(!player||!target||target.inDome||islandProtected(target)||world.races.rounds.some(round=>round.entrants.some(e=>e.playerId===player.id&&e.status==='entered')))return ground;
  const dx=target.x-cop.x,dz=target.z-cop.z,d=Math.hypot(dx,dz);
  const heading=Math.atan2(-dx,-dz),angle=Math.atan2(Math.sin(heading-cop.yaw),Math.cos(heading-cop.yaw));
  if(cop.supportId===null){
    const fx=-Math.sin(cop.yaw),fz=-Math.cos(cop.yaw),forward=cop.vx*fx+cop.vz*fz;
    const speed=d>15?Math.min(24,4+d*.4):0;
    const throttle=cop.air>0?Math.max(-1,Math.min(1,(speed-forward)/12)):0;
    const height=cop.y-(terrainHeight(cop.x,cop.z)??0);
    const hover=flightHeight(target)>3&&height>3&&height<18&&cop.vy< -1&&d>10&&cop.air>35&&world.time<(state.nextFlightAt??0)-7;
    return {input:{...NEUTRAL,throttle,steer:Math.max(-1,Math.min(1,angle*1.2-cop.yawRate*.3)),hover},jump:false};
  }
  if(cop.supportId!=='ground'||flightHeight(target)<=3||cop.air<50||world.time<(state.nextFlightAt??0)||
     d<12||d>85||Math.abs(angle)>.4||cop.speed<0||cop.speed>20)return ground;
  // Reject jumps across unsupported terrain or a building; the hop starts in
  // the direction the vehicle is already travelling and has a clear landing.
  const travel=Math.min(70,Math.max(d,cop.speed*3+25)),end={x:cop.x+dx/d*travel,z:cop.z+dz/d*travel};
  if(!lineClear(cop,end))return ground;
  state.nextFlightAt=world.time+12;
  return {input:{...groundInput,throttle:Math.max(.35,groundInput.throttle),brake:false},jump:true};
}

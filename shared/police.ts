import type { Entity, Input, World } from './game';
import { NEUTRAL } from './game';
import { OVERPASS, isSurface, nearbyBuildings, overpassHeight, rampHeight, terrainHeight } from './map';
import { engageAutopilot, ROUTES } from './traffic';

export type PoliceState = { targetId: string | null; lastSeen: number; nextPlan: number; path: Point[] };
type Point = { x:number; z:number };
const SIGHT=85, PURSUIT_RANGE=110, ESCAPE_SECONDS=10;
const points:Point[]=[];
const rows=[-240,-180,-120,-60,0,60,120,180,240];
for(const x of [-360,-300,-240,-180,-120,-60,0,60,330,390,450,510,570]) for(const z of rows)
  if(isSurface(x,z)&&clear(x,z))points.push({x,z});
function clear(x:number,z:number){return !nearbyBuildings(x,z,5).some(b=>Math.abs(x-b.x)<b.w/2+4&&Math.abs(z-b.z)<b.d/2+4);}
function lineClear(a:Point,b:Point){
  const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/8);
  for(let i=0;i<=n;i++){const t=n?i/n:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(!isSurface(x,z)||!clear(x,z))return false;}
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
export function newPolice():PoliceState{return {targetId:null,lastSeen:0,nextPlan:0,path:[]};}
function resumePatrol(cop:Entity){
  const state=cop.police!;state.targetId=null;state.path=[];
  if(engageAutopilot(cop))return;
  // A pursuit may end beyond the normal patrol grid or on the upper road.
  // Return to an existing route rather than leaving a marked car stranded.
  const destinations=ROUTES.flat();
  const destination=destinations.reduce((best,p)=>distance(cop,p)<distance(cop,best)?p:best);
  cop.autopilot=true;
  if(cop.supportId==='overpass'){
    const exit=-Math.sin(cop.yaw)>=0?OVERPASS.end+10:OVERPASS.start-10;
    state.path=[{x:exit,z:OVERPASS.z-OVERPASS.width/2-20},destination];
  }else state.path=route(cop,destination);
}
function heightAboveSurface(e:Entity){
  // Measure height above the nearest surface below the car, including the
  // upper roadway or a rooftop, instead of treating world altitude as flight.
  let floor=terrainHeight(e.x,e.z)??0;
  const deck=overpassHeight(e.x,e.z);if(deck!==null&&deck<=e.y)floor=Math.max(floor,deck);
  const ramp=rampHeight(e.x,e.z);if(ramp!==null&&ramp<=e.y)floor=Math.max(floor,ramp);
  for(const b of nearbyBuildings(e.x,e.z,0))if(b.h<=e.y&&Math.abs(e.x-b.x)<=b.w/2&&Math.abs(e.z-b.z)<=b.d/2)floor=Math.max(floor,b.h);
  return e.y-floor;
}
function flightHeight(e:Entity){return e.kind!=='person'&&e.supportId===null?Math.max(0,heightAboveSurface(e)):0;}
function detectableFlight(e:Entity){const height=flightHeight(e);return height>3&&height<=80;}
export function updatePolice(world:World,dt:number):void {
  for (const player of world.players) {
    const e=world.entities.find(e=>e.id===player.entityId), flight=player.delivery.flight;
    // The fictional arena is a no-police playground, including its ceiling.
    const height=e&&!e.inDome?flightHeight(e):0;
    if(e?.inDome){flight.seconds=0;flight.peakHeight=0;}
    if(height>.05){flight.seconds+=dt;flight.peakHeight=Math.max(flight.peakHeight,height);flight.lastAirborneAt=world.time;}
    else if(world.time-flight.lastAirborneAt>3&&!world.entities.some(c=>c.police?.targetId===player.id)){flight.seconds=0;flight.peakHeight=0;}
  }
  for(const cop of world.entities){
    const state=cop.police;if(!state)continue;
    let player=world.players.find(p=>p.id===state.targetId);
    let target=world.entities.find(e=>e.id===player?.entityId);
    if(state.targetId&&(!player||!target||target.inDome||world.time<player.delivery.ticketGraceUntil)){resumePatrol(cop);player=undefined;target=undefined;}
    if(!target){
      const candidate=world.players.map(p=>({p,e:world.entities.find(e=>e.id===p.entityId)})).filter(({p,e})=>e&&!e.inDome&&world.time>=p.delivery.ticketGraceUntil&&detectableFlight(e)&&separation(cop,e)<SIGHT).sort((a,b)=>separation(cop,a.e!)-separation(cop,b.e!))[0];
      if(candidate?.e){player=candidate.p;target=candidate.e;state.targetId=player.id;state.lastSeen=world.time;state.nextPlan=0;cop.autopilot=true;}
    }
    if(!player||!target){
      if(state.path.length&&cop.supportId==='ground'&&engageAutopilot(cop))state.path=[];
      continue;
    }
    const d=separation(cop,target);
    if(d<PURSUIT_RANGE)state.lastSeen=world.time;
    if(world.time-state.lastSeen>ESCAPE_SECONDS){resumePatrol(cop);continue;}
    if(cop.supportId!==null&&target.supportId===cop.supportId&&d<12){
      target.speed*=Math.exp(-2.2*dt);
      if(d<7&&Math.abs(target.speed)<4){
        const delivery=player.delivery, flight=delivery.flight;
        const durationFine=Math.min(120,Math.floor(flight.seconds/2)*8),heightFine=Math.min(80,Math.floor(flight.peakHeight/10)*10),repeatFine=delivery.tickets*35;
        const amount=60+durationFine+heightFine+repeatFine;
        delivery.tickets++;delivery.lastTicket={amount,offense:delivery.tickets,flightSeconds:Math.floor(flight.seconds),peakHeight:Math.round(flight.peakHeight),durationFine,heightFine,repeatFine};
        delivery.cash-=amount;delivery.ticketGraceUntil=world.time+20;flight.seconds=0;flight.peakHeight=0;
        target.autopilot=false;target.speed=0;target.vx=0;target.vz=0;target.pushX=0;target.pushZ=0;
        for(const other of world.entities)if(other.police?.targetId===player.id)resumePatrol(other);
        continue;
      }
    }
    if(world.time>=state.nextPlan){state.path=route(cop,target);state.nextPlan=world.time+3;}
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
    const destination=state.path[0]??target;if(!destination)return NEUTRAL;next=destination;
  }else return NEUTRAL;
  const angle=Math.atan2(Math.sin(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw),Math.cos(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw));
  const reversing=Math.abs(angle)>2.25&&cop.speed<1;
  const steer=Math.max(-1,Math.min(1,angle*1.6))*(reversing?-1:1);
  const cruise=Math.abs(angle)>.65?6:15;
  return {...NEUTRAL,steer,throttle:reversing?-.7:cop.speed<cruise?.8:0,brake:!reversing&&cop.speed>cruise+2};
}

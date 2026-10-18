import type { Entity, Input, World } from './game';
import { NEUTRAL } from './game';
import { isSurface, nearbyBuildings, rampHeight } from './map';
import { onRoof } from './achievements';
import { engageAutopilot } from './traffic';

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
function flying(e:Entity){
  if(e.y<=.05||e.kind==='person'||e.loopAngle!==null)return false;
  const ramp=rampHeight(e.x,e.z);
  if(ramp!==null&&Math.abs(e.y-ramp)<.08)return false;
  return !onRoof(e);
}
export function updatePolice(world:World,dt:number):void {
  for (const player of world.players) {
    const e=world.entities.find(e=>e.id===player.entityId), flight=player.delivery.flight;
    if(e && flying(e)){flight.seconds+=dt;flight.peakHeight=Math.max(flight.peakHeight,e.y);flight.lastAirborneAt=world.time;}
    else if(world.time-flight.lastAirborneAt>3&&!world.entities.some(c=>c.police?.targetId===player.id)){flight.seconds=0;flight.peakHeight=0;}
  }
  for(const cop of world.entities){
    const state=cop.police;if(!state)continue;
    let player=world.players.find(p=>p.id===state.targetId);
    let target=world.entities.find(e=>e.id===player?.entityId);
    if(!player||!target||world.time<player.delivery.ticketGraceUntil){state.targetId=null;player=undefined;target=undefined;}
    if(!target){
      const candidate=world.players.map(p=>({p,e:world.entities.find(e=>e.id===p.entityId)})).filter(({p,e})=>e&&world.time>=p.delivery.ticketGraceUntil&&e.y>3&&e.y<=80&&flying(e)&&distance(cop,e)<SIGHT).sort((a,b)=>distance(cop,a.e!)-distance(cop,b.e!))[0];
      if(candidate?.e){player=candidate.p;target=candidate.e;state.targetId=player.id;state.lastSeen=world.time;state.nextPlan=0;cop.autopilot=true;}
    }
    if(!player||!target)continue;
    const d=distance(cop,target);
    if(d<PURSUIT_RANGE)state.lastSeen=world.time;
    if(world.time-state.lastSeen>ESCAPE_SECONDS){state.targetId=null;state.path=[];engageAutopilot(cop);continue;}
    if(target.y<1&&d<12){
      target.speed*=Math.exp(-2.2*dt);
      if(d<7&&Math.abs(target.speed)<4){
        const delivery=player.delivery, flight=delivery.flight;
        const durationFine=Math.min(120,Math.floor(flight.seconds/2)*8),heightFine=Math.min(80,Math.floor(flight.peakHeight/10)*10),repeatFine=delivery.tickets*35;
        const amount=60+durationFine+heightFine+repeatFine;
        delivery.tickets++;delivery.lastTicket={amount,offense:delivery.tickets,flightSeconds:Math.floor(flight.seconds),peakHeight:Math.round(flight.peakHeight),durationFine,heightFine,repeatFine};
        delivery.cash-=amount;delivery.ticketGraceUntil=world.time+20;flight.seconds=0;flight.peakHeight=0;
        target.autopilot=false;target.speed=0;target.vx=0;target.vz=0;target.pushX=0;target.pushZ=0;
        for(const other of world.entities)if(other.police?.targetId===player.id){other.police.targetId=null;other.police.path=[];engageAutopilot(other);}
        continue;
      }
    }
    if(world.time>=state.nextPlan){state.path=route(cop,target);state.nextPlan=world.time+3;}
  }
}
export function policeInput(cop:Entity,world:World):Input {
  const state=cop.police,player=world.players.find(p=>p.id===state?.targetId),target=world.entities.find(e=>e.id===player?.entityId);
  if(!state||!target)return NEUTRAL;
  while(state.path.length>1&&distance(cop,state.path[0])<8)state.path.shift();
  const next=state.path[0]??target;
  const angle=Math.atan2(Math.sin(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw),Math.cos(Math.atan2(-(next.x-cop.x),-(next.z-cop.z))-cop.yaw));
  const reversing=Math.abs(angle)>2.25&&cop.speed<1;
  const steer=Math.max(-1,Math.min(1,angle*1.6))*(reversing?-1:1);
  const cruise=Math.abs(angle)>.65?6:15;
  return {...NEUTRAL,steer,throttle:reversing?-.7:cop.speed<cruise?.8:0,brake:!reversing&&cop.speed>cruise+2};
}

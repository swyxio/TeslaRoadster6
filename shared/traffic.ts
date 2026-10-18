import type { Entity, Input, World } from './game';
import { VEHICLES } from './vehicles';
export type Point = {x:number;z:number};
// Clockwise loops use the right-hand lane. The block loops cover every street;
// large district loops let NPCs tour more than a single block.
function loop(left:number,top:number,right:number,bottom:number):Point[]{return [{x:left+3,z:top+3},{x:right-3,z:top+3},{x:right-3,z:bottom-3},{x:left+3,z:bottom-3}];}
export const ROUTES:Point[][]=[loop(-240,-180,0,180),loop(-180,-120,60,120),loop(-120,-60,0,60),loop(330,-180,510,180),loop(390,-120,570,120),loop(330,-60,450,60)];
for(let x=-240;x<0;x+=60)for(let z=-180;z<180;z+=60)ROUTES.push(loop(x,z,x+60,z+60));
// Cross-Bay route includes loops on both shores; no mid-bridge U-turn.
ROUTES.push([{x:0,z:57},{x:327,z:57},{x:333,z:117},{x:387,z:117},{x:387,z:63},{x:330,z:63},{x:3,z:63},{x:3,z:117},{x:57,z:117},{x:57,z:57}]);
const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
export function routePose(index:number,count:number) {
  const routeId=index%6,route=ROUTES[routeId],side=(index*4/count)%4,segment=Math.floor(side),t=side-segment;
  const a=route[segment],b=route[(segment+1)%4];
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(-(b.x-a.x),-(b.z-a.z)),routeId,waypoint:(segment+1)%4};
}
export function engageAutopilot(e:Entity):boolean {
  if(e.kind==='person'||e.y>.5)return false;
  let best=Infinity,routeId=0,waypoint=0;
  ROUTES.forEach((route,id)=>route.forEach((a,i)=>{
    const b=route[(i+1)%4],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.z-a.z)*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(e.x-a.x-t*dx,e.z-a.z-t*dz);
    if(distance<best){best=distance;routeId=id;waypoint=(i+1)%4;}
  }));
  if(best>9)return false;
  Object.assign(e,{autopilot:true,routeId,waypoint,pauseUntil:0});return true;
}
export function trafficInput(e:Entity,world:World):Input {
  const neutral:Input={throttle:0,steer:0,boost:false,lift:false,roll:0,brake:false};
  if(e.kind==='person')return neutral;
  const route=ROUTES[e.routeId];if(!route){e.autopilot=false;return neutral;}
  let target=route[e.waypoint];
  if(Math.hypot(target.x-e.x,target.z-e.z)<7){e.waypoint=(e.waypoint+1)%route.length;e.pauseUntil=world.time+.7;target=route[e.waypoint];}
  const angle=wrap(Math.atan2(-(target.x-e.x),-(target.z-e.z))-e.yaw);
  const spec=VEHICLES[e.kind];
  const steer=Math.max(-1,Math.min(1,angle*1.8));
  const cruise=Math.abs(angle)>.5?4.5:8;
  const forward={x:-Math.sin(e.yaw),z:-Math.cos(e.yaw)};
  const blocked=world.entities.some(other=>{
    if(other===e||Math.abs(other.y-e.y)>2)return false;
    const dx=other.x-e.x,dz=other.z-e.z;
    const along=dx*forward.x+dz*forward.z,side=Math.abs(dx*forward.z-dz*forward.x);
    const size=other.kind==='person'?.7:VEHICLES[other.kind].length;
    return along>0&&along<spec.length/2+size/2+3+Math.abs(e.speed)*.6&&side<spec.width/2+.8;
  });
  // Yield to obstacles and deterministic per-intersection stops. No teleports.
  if(blocked||world.time<e.pauseUntil)return {...neutral,brake:true,steer};
  return {...neutral,throttle:e.speed<cruise?.55:0,brake:e.speed>cruise+1,steer};
}

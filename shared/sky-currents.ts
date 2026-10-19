/** Fictional, always-on arcade currents in the compressed Bay map. Meters. */
import { requiredLevelAt, type Level } from './delivery';
import { CALTRAIN_STOPS } from './caltrain';
export type JetStream={kind:'jet';id:string;name:string;start:{x:number;z:number};end:{x:number;z:number};height:number;halfWidth:number;halfHeight:number};
export type Thermal={kind:'thermal';id:string;name:string;x:number;z:number;bottom:number;top:number;radius:number};
export type SkyCurrent=JetStream|Thermal;

// Onshore wind through the Golden Gate inspires the direction, not the exact
// placement. These lanes are game features, not actual jet streams.
export const FLIGHT_CEILING=180;
// Short, separate northbound and southbound arcade breezes beside each stop.
// They are intentionally local to the station, rather than a train or a
// continuous transit line. A narrow gap keeps the directions distinct.
export const CALTRAIN_CURRENTS:JetStream[]=CALTRAIN_STOPS.flatMap((stop,i)=>{
 const previous=CALTRAIN_STOPS[Math.max(0,i-1)],next=CALTRAIN_STOPS[Math.min(CALTRAIN_STOPS.length-1,i+1)];
 const dx=next.x-previous.x,dz=next.z-previous.z,length=Math.hypot(dx,dz),x=dx/length,z=dz/length;
 const lane=(direction:1|-1):JetStream=>{
  const center={x:stop.x-z*18*direction,z:stop.z+x*18*direction};
  return {kind:'jet',id:`caltrain-${stop.id}-${direction===1?'south':'north'}`,
   name:`Caltrain · ${stop.name} · ${direction===1?'Southbound':'Northbound'}`,
   start:{x:center.x-x*90*direction,z:center.z-z*90*direction},
   end:{x:center.x+x*90*direction,z:center.z+z*90*direction},height:45,halfWidth:7,halfHeight:5};
 };
 return [lane(1),lane(-1)];
});
export const JET_STREAMS:JetStream[]=[
 {kind:'jet',id:'market',name:'City Glide',start:{x:-320,z:60},end:{x:300,z:60},height:12,halfWidth:14,halfHeight:3.5},
 {kind:'jet',id:'golden-gate',name:'Golden Gate Breeze',start:{x:-380,z:-330},end:{x:140,z:-330},height:38,halfWidth:18,halfHeight:8},
 {kind:'jet',id:'bay-bridge',name:'Bay Bridge Breeze',start:{x:-30,z:60},end:{x:520,z:60},height:30,halfWidth:18,halfHeight:8},
 {kind:'jet',id:'oakland',name:'East Bay Express',start:{x:320,z:-180},end:{x:570,z:-180},height:62,halfWidth:16,halfHeight:8},
 {kind:'jet',id:'skyline',name:'Skyline Express',start:{x:-220,z:-120},end:{x:500,z:-120},height:150,halfWidth:18,halfHeight:8},
 // Fictional two-way wind corridors above long, relatively straight sections
 // of the compressed freeways. They are separated so each direction is clear.
 {kind:'jet',id:'101-south',name:'101 Skyway · South',start:{x:-824,z:3050},end:{x:-776,z:3950},height:55,halfWidth:7,halfHeight:6},
 {kind:'jet',id:'101-north',name:'101 Skyway · North',start:{x:-756,z:3950},end:{x:-804,z:3050},height:55,halfWidth:7,halfHeight:6},
 {kind:'jet',id:'880-south',name:'880 Skyway · South',start:{x:1425,z:3600},end:{x:1438,z:4600},height:55,halfWidth:7,halfHeight:6},
 {kind:'jet',id:'880-north',name:'880 Skyway · North',start:{x:1458,z:4600},end:{x:1445,z:3600},height:55,halfWidth:7,halfHeight:6},
 ...CALTRAIN_CURRENTS,
];
// Offset from the landmark collision boxes, above streets accessible by a jump.
export const THERMALS:Thermal[]=[
 {kind:'thermal',id:'pyramid',name:'Transamerica Pyramid',x:0,z:-90,bottom:2,top:96,radius:13},
];

/** A locked region ahead or under the car stops wind pressure, not the refill. */
export function currentBlockedByProgression(lane:JetStream,position:{x:number;z:number},level:Level):boolean {
 const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,length=Math.hypot(dx,dz);
 return requiredLevelAt(position.x,position.z)>level||
  requiredLevelAt(position.x+10*dx/length,position.z+10*dz/length)>level;
}

/** Same membership rule for authoritative physics and the read-only HUD. */
export function currentAt(e:{kind:string;x:number;y:number;z:number;supportId:string|null;loopAngle:number|null;inDome:boolean}):SkyCurrent|undefined {
 if(e.kind==='person'||e.inDome||e.supportId!==null||e.loopAngle!==null)return;
 const thermal=THERMALS.find(t=>e.y>=t.bottom&&e.y<=t.top&&Math.hypot(e.x-t.x,e.z-t.z)<=t.radius);
 if(thermal)return thermal;
 return JET_STREAMS.find(l=>{
  const dx=l.end.x-l.start.x,dz=l.end.z-l.start.z,length=Math.hypot(dx,dz),x=e.x-l.start.x,z=e.z-l.start.z;
  const along=(x*dx+z*dz)/length,across=(x*dz-z*dx)/length;
  return along>=0&&along<=length&&Math.abs(across)<=l.halfWidth&&Math.abs(e.y-l.height)<=l.halfHeight;
 });
}

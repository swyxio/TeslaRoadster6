/** Fictional, always-on arcade currents in the compressed Bay map. Meters. */
export type JetStream={kind:'jet';id:string;name:string;start:{x:number;z:number};end:{x:number;z:number};height:number;halfWidth:number;halfHeight:number};
export type Thermal={kind:'thermal';id:string;name:string;x:number;z:number;bottom:number;top:number;radius:number};
export type SkyCurrent=JetStream|Thermal;

// Onshore wind through the Golden Gate inspires the direction, not the exact
// placement. These low-altitude lanes are game features, not actual jet streams.
export const JET_STREAMS:JetStream[]=[
 {kind:'jet',id:'market',name:'City Glide',start:{x:-320,z:60},end:{x:300,z:60},height:12,halfWidth:14,halfHeight:3.5},
 {kind:'jet',id:'golden-gate',name:'Golden Gate Breeze',start:{x:-380,z:-330},end:{x:140,z:-330},height:38,halfWidth:18,halfHeight:8},
 {kind:'jet',id:'bay-bridge',name:'Bay Bridge Breeze',start:{x:-30,z:60},end:{x:520,z:60},height:30,halfWidth:18,halfHeight:8},
 {kind:'jet',id:'oakland',name:'East Bay Express',start:{x:320,z:-180},end:{x:570,z:-180},height:62,halfWidth:16,halfHeight:8},
 {kind:'jet',id:'skyline',name:'Skyline Express',start:{x:-220,z:-120},end:{x:500,z:-120},height:88,halfWidth:18,halfHeight:8},
];
// Offset from the landmark collision boxes, above streets accessible by a jump.
export const THERMALS:Thermal[]=[
 {kind:'thermal',id:'coit',name:'Coit Tower',x:0,z:-210,bottom:2,top:96,radius:13},
 {kind:'thermal',id:'pyramid',name:'Transamerica Pyramid',x:0,z:-90,bottom:2,top:96,radius:13},
 {kind:'thermal',id:'salesforce',name:'Salesforce Tower',x:0,z:-30,bottom:2,top:96,radius:13},
];

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

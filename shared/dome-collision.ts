import { DOME } from './dome';
import type { Entity } from './game';
import { domeSurface, DOME_PERIMETER } from './map';
import { contact, dimensions } from './physics';

type Vector = {x:number;y:number;z:number};
type Hit = {space:'surface';nx:number;ns:number;depth:number} | {space:'world';nx:number;ny:number;nz:number;depth:number};
const dot=(a:Vector,b:Vector)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vector,b:Vector):Vector=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});

/** Arc coordinate for vehicles resting on the floor or adhered to the capsule. */
export function surfaceArc(e:Entity):number|null {
  if(e.supportId==='dome')return e.domeS;
  if(e.supportId==='ground'&&Math.abs(e.z-DOME.z)<=DOME.flatHalfWidth)return e.z-DOME.z+DOME.flatHalfWidth;
  return null;
}

function box(e:Entity) {
  const size=dimensions(e.kind),s=surfaceArc(e);
  const surface=s===null?null:domeSurface(s);
  const up={x:0,y:surface?.normalY??1,z:surface?.normalZ??0};
  const back={x:Math.sin(e.yaw),y:Math.cos(e.yaw)*(surface?.tangentY??0),z:Math.cos(e.yaw)*(surface?.tangentZ??1)};
  const right=cross(up,back);
  return {center:{x:e.x+up.x*size.height/2,y:e.y+up.y*size.height/2,z:e.z+up.z*size.height/2},
    axes:[right,up,back],half:[size.width/2,size.height/2,size.length/2]};
}

/** Contact in the unwrapped capsule for two attached cars, or in 3D for airborne impacts. */
export function domeContact(a:Entity,b:Entity):Hit|null {
  const sa=surfaceArc(a),sb=surfaceArc(b);
  if(sa!==null&&sb!==null){
    const delta=((sb-sa+DOME_PERIMETER/2)%DOME_PERIMETER+DOME_PERIMETER)%DOME_PERIMETER-DOME_PERIMETER/2;
    const ad=dimensions(a.kind),bd=dimensions(b.kind);
    const hit=contact({x:a.x,z:sa,w:ad.width,d:ad.length,yaw:a.yaw},{x:b.x,z:sa+delta,w:bd.width,d:bd.length,yaw:b.yaw});
    return hit?{space:'surface',nx:hit.nx,ns:hit.nz,depth:hit.depth}:null;
  }
  const aa=box(a),bb=box(b),offset={x:bb.center.x-aa.center.x,y:bb.center.y-aa.center.y,z:bb.center.z-aa.center.z};
  const axes=[...aa.axes,...bb.axes,...aa.axes.flatMap(x=>bb.axes.map(y=>cross(x,y)))];
  let best:Vector|null=null,depth=Infinity;
  for(const raw of axes){
    const length=Math.hypot(raw.x,raw.y,raw.z);if(length<1e-8)continue;
    const axis={x:raw.x/length,y:raw.y/length,z:raw.z/length};
    const radius=(shape:typeof aa)=>shape.axes.reduce((sum,part,i)=>sum+shape.half[i]*Math.abs(dot(part,axis)),0);
    const distance=dot(offset,axis),overlap=radius(aa)+radius(bb)-Math.abs(distance);
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;const sign=distance<0?-1:1;best={x:axis.x*sign,y:axis.y*sign,z:axis.z*sign};}
  }
  return best?{space:'world',nx:best.x,ny:best.y,nz:best.z,depth}:null;
}

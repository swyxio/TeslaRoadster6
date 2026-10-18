import type { Building } from './map';
import { body, contact, dimensions, type Pose } from './physics';
import { newLandmarkPrimitives, sampleLandmarkPrimitive, type StructuralPrimitive } from './new-landmark-surfaces';

type Point={x:number;z:number};
const polygons=new WeakMap<StructuralPrimitive,readonly Point[]>();

// The renderer uses 12-sided cylinders, 16-sided domes, and a rotated
// four-sided cone. Cache their horizontal silhouettes instead of treating the
// empty corners of their rectangular bounds as solid.
function footprint(part:StructuralPrimitive):readonly Point[] {
  const cached=polygons.get(part);if(cached)return cached;
  const points:Point[]=[];
  if(part.shape==='cylinder'||part.shape==='dome'){
    const count=part.shape==='cylinder'?12:16;
    for(let i=0;i<count;i++){
      const angle=i*2*Math.PI/count;
      points.push({x:part.x+Math.sin(angle)*part.w/2,z:part.z+Math.cos(angle)*part.d/2});
    }
  }else{
    const scale=part.shape==='roof'?Math.SQRT1_2:1;
    for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])points.push({x:part.x+x*part.w*scale/2,z:part.z+z*part.d*scale/2});
  }
  polygons.set(part,points);return points;
}
function polygonsOverlap(a:readonly Point[],b:readonly Point[]):boolean {
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const v=polygon[i],next=polygon[(i+1)%polygon.length],axisX=next.z-v.z,axisZ=v.x-next.x;
    let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
    for(const p of a){const q=p.x*axisX+p.z*axisZ;amin=Math.min(amin,q);amax=Math.max(amax,q);}
    for(const p of b){const q=p.x*axisX+p.z*axisZ;bmin=Math.min(bmin,q);bmax=Math.max(bmax,q);}
    if(amax<=bmin||bmax<=amin)return false;
  }
  return true;
}
/** Contact at the vehicle footprint, with local bottom/top for the touched part. */
export function landmarkPartContact(building:Building,part:StructuralPrimitive,e:Pose):{bottom:number;top:number}|null {
  const scale=part.shape==='roof'?Math.SQRT1_2:1;
  const obstacle={x:building.x+part.x,z:building.z+part.z,w:part.w*scale,d:part.d*scale,yaw:0};
  const vehicle=body(e);
  if(!contact(vehicle,obstacle))return null;
  if(part.shape==='cylinder'||part.shape==='dome'){
    const c=Math.cos(e.yaw),s=Math.sin(e.yaw),hw=vehicle.w/2,hd=vehicle.d/2;
    const corners=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,z])=>({x:e.x-building.x+x*c+z*s,z:e.z-building.z-x*s+z*c}));
    if(!polygonsOverlap(footprint(part),corners))return null;
  }
  let x=e.x-building.x,z=e.z-building.z;
  let surface=sampleLandmarkPrimitive(part,x,z);
  if(!surface){
    // The pivot may be outside while the body touches an edge. Sample just
    // inside the silhouette at the closest radial point for vertical contact.
    const rx=part.w*scale/2,rz=part.d*scale/2;
    let nx=Math.max(-1,Math.min(1,(x-part.x)/rx)),nz=Math.max(-1,Math.min(1,(z-part.z)/rz));
    if(part.shape==='cylinder'||part.shape==='dome'){
      // Project to the actual faceted perimeter, not its circumscribed ellipse.
      const count=part.shape==='cylinder'?12:16,step=2*Math.PI/count;
      const angle=(Math.atan2(nz,nx)+2*Math.PI)%(2*Math.PI),mid=(Math.floor(angle/step)+.5)*step;
      const radius=(nx*Math.cos(mid)+nz*Math.sin(mid))/Math.cos(step/2);
      if(radius>1){nx/=radius;nz/=radius;}
    }
    x=part.x+nx*rx*.999999;z=part.z+nz*rz*.999999;
    surface=sampleLandmarkPrimitive(part,x,z);
  }
  if(!surface)return null;
  const base=building.landmarkBase??0;
  return {bottom:base+surface.bottom,top:base+surface.top};
}
export function landmarkBlocksPose(building:Building,e:Pose):boolean {
  if(!building.landmarkId)return false;
  const height=dimensions(e.kind).height;
  for(const part of newLandmarkPrimitives(building.landmarkId)){
    const surface=landmarkPartContact(building,part,e);
    if(surface&&e.y<surface.top-.001&&e.y+height>surface.bottom+.001)return true;
  }
  return false;
}

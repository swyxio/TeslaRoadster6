import type { Building } from './map';
import { buildingBoundsOverlap } from './building-bounds';
import { body, contact, verticalBounds, type OrientedPose, type Pose } from './physics';
import { sampleLandmarkPrimitive, primitiveExtent, type StructuralPrimitive } from './new-landmark-surfaces';

type Point={x:number;z:number};
const polygons=new WeakMap<StructuralPrimitive,readonly Point[]>();

// The renderer uses 12-sided cylinders, 16-sided domes, and a rotated
// four-sided cone. Cache their horizontal silhouettes instead of treating the
// empty corners of their rectangular bounds as solid.
function footprint(part:StructuralPrimitive):readonly Point[] {
  const cached=polygons.get(part);if(cached)return cached;
  const extent=primitiveExtent(part),c=Math.cos(extent.yaw),s=Math.sin(extent.yaw);
  const points:Point[]=[];
  if((part.shape==='cylinder'&&!part.rotationX)||part.shape==='dome'){
    const count=part.segments??(part.shape==='cylinder'?12:16);
    for(let i=0;i<count;i++){
      const angle=i*2*Math.PI/count;
      const x=(part.shape==='dome'?Math.cos(angle):Math.sin(angle))*extent.w/2,z=(part.shape==='dome'?Math.sin(angle):Math.cos(angle))*extent.d/2;
      points.push({x:part.x+x*c+z*s,z:part.z-x*s+z*c});
    }
  }else{
    const vertices=part.roofDiamond?[[0,-1],[1,0],[0,1],[-1,0]]:[[-1,-1],[1,-1],[1,1],[-1,1]];
    for(const [nx,nz] of vertices){const x=nx*extent.w/2,z=nz*extent.d/2;points.push({x:part.x+x*c+z*s,z:part.z-x*s+z*c});}
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
/** Clip a four-corner vehicle footprint to a cached convex part silhouette.
 * Only variable-height parts need this; ordinary walls/slabs keep their fast path. */
function overlapPolygon(subject:readonly Point[],clip:readonly Point[]):Point[] {
  let polygon=[...subject];
  const area=clip.reduce((a,p,i)=>a+p.x*clip[(i+1)%clip.length].z-p.z*clip[(i+1)%clip.length].x,0),sign=area<0?-1:1;
  for(let i=0;i<clip.length&&polygon.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length];
    const side=(p:Point)=>sign*((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x));
    const output:Point[]=[];
    let previous=polygon[polygon.length-1],before=side(previous);
    for(const current of polygon){
      const after=side(current);
      if((before>=0)!==(after>=0)){
        const t=before/(before-after);
        output.push({x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t});
      }
      if(after>=0)output.push(current);
      previous=current;before=after;
    }
    polygon=output;
  }
  return polygon;
}
function contains(polygon:readonly Point[],point:Point):boolean {
  let positive=false,negative=false;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b.x-a.x)*(point.z-a.z)-(b.z-a.z)*(point.x-a.x);
    positive ||= cross>1e-9;negative ||= cross< -1e-9;
  }
  return !(positive&&negative);
}
/** Occupied-height extrema over the overlapping footprint. All supported roofs
 * are piecewise linear. Their extrema occur at overlap vertices, the center,
 * or an overlap edge crossing a facet ridge. No rendered triangles are queried. */
function overlapHeights(part:StructuralPrimitive,overlap:readonly Point[]) {
  const points=[...overlap],center={x:part.x,z:part.z};
  if(contains(overlap,center))points.push(center);
  const addCrossings=(distance:(p:Point)=>number)=>{
    for(let i=0;i<overlap.length;i++){
      const a=overlap[i],b=overlap[(i+1)%overlap.length],da=distance(a),db=distance(b);
      if(da*db<0){const t=da/(da-db);points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
    }
  };
  if(part.rotationX||part.shape==='box'){
    const yaw=part.rotationY??0,c=Math.cos(yaw),s=Math.sin(yaw);
    const angle=part.rotationZ??0,ca=Math.cos(angle),sa=Math.sin(angle);
    const peak=part.shape==='box'?ca*Math.sign(sa)*part.w/2-sa*Math.sign(ca)*part.h/2:0;
    for(const ridge of [peak,-peak])addCrossings(p=>(p.x-part.x)*c-(p.z-part.z)*s-ridge);
  }else{
    for(const v of footprint(part)){
      const dx=v.x-part.x,dz=v.z-part.z;
      addCrossings(p=>(p.x-part.x)*dz-(p.z-part.z)*dx);
    }
  }
  const centroid=overlap.reduce((c,p)=>({x:c.x+p.x/overlap.length,z:c.z+p.z/overlap.length}),{x:0,z:0});
  let bottom=Infinity,top=-Infinity;
  for(const p of points){
    // Clip intersections can be a few ulps outside an exact edge. Move a
    // nanometre-scale fraction inward; do not widen the physical footprint.
    const sample=sampleLandmarkPrimitive(part,p.x+(centroid.x-p.x)*1e-9,p.z+(centroid.z-p.z)*1e-9);
    if(sample){bottom=Math.min(bottom,sample.bottom);top=Math.max(top,sample.top);}
  }
  return Number.isFinite(bottom)?{bottom,top}:null;
}
/** Contact across the whole upright vehicle footprint, including roof/underside extrema. */
export function landmarkPartContact(building:Building,part:StructuralPrimitive,e:Pose):{bottom:number;top:number}|null {
  const extent=primitiveExtent(part),base=building.landmarkBase??0;
  const obstacle={x:building.x+part.x,z:building.z+part.z,...extent},vehicle=body(e);
  if(!contact(vehicle,obstacle))return null;
  if(part.shape==='box'&&!part.rotationZ)return {bottom:base+extent.bottom,top:base+extent.top};
  const c=Math.cos(e.yaw),s=Math.sin(e.yaw),hw=vehicle.w/2,hd=vehicle.d/2;
  const corners=[[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([x,z])=>({x:e.x-building.x+x*c+z*s,z:e.z-building.z-x*s+z*c}));
  const outline=footprint(part);
  if(part.shape==='cylinder'&&!part.rotationX&&(part.topScale??1)===1){
    return polygonsOverlap(outline,corners)?{bottom:base+extent.bottom,top:base+extent.top}:null;
  }
  const overlap=overlapPolygon(corners,outline);
  if(overlap.length<3)return null;
  const heights=overlapHeights(part,overlap);
  return heights?{bottom:base+heights.bottom,top:base+heights.top}:null;
}
export function landmarkBlocksPose(building:Building,e:OrientedPose):boolean {
  if(!building.parts)return false;
  const vehicle=body(e),radius=Math.hypot(vehicle.w,vehicle.d)/2;
  if(!buildingBoundsOverlap(building,e.x-radius,e.x+radius,e.z-radius,e.z+radius))return false;
  const vertical=verticalBounds(e),base=building.landmarkBase??0;
  for(const part of building.parts){
    const envelope=primitiveExtent(part);
    if(vertical.min>=base+envelope.top-.001||vertical.max<=base+envelope.bottom+.001)continue;
    const surface=landmarkPartContact(building,part,e);
    if(!surface)continue;
    if(vertical.min<surface.top-.001&&vertical.max>surface.bottom+.001)return true;
  }
  return false;
}

/** Common physical clearance for driving, recovery and route planning. */
export function buildingBlocksPose(building:Building,e:OrientedPose):boolean {
 if(building.parts)return landmarkBlocksPose(building,e);
 const vertical=verticalBounds(e);
 const vehicle=body(e);
 return vertical.min<building.h-.001&&vertical.max>0&&!!contact(vehicle,{...building,yaw:0});
}

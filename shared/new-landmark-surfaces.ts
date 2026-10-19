import { NEW_LANDMARKS } from './new-landmarks';
import type { LandmarkParts } from './landmark-model-types';
import { buildSfNorthLandmark } from './new-landmarks-sf-north-models';
import { buildPeninsulaSouthLandmark } from './new-landmarks-peninsula-south-models';
import { buildEastBayLandmark } from './new-landmarks-east-bay-models';

/** The same authored parts are rendered regardless of their collision tag.
 * Only marked structural masses, decks, roofs and fields become volumes;
 * windows, markings, miniature vehicles, trim and other details remain visual.
 * Coordinates are local to the landmark. Rendering adds terrainHeight at the
 * landmark center; physics must add that same base to sampled heights. Dome y
 * denotes its base; the other shapes use a centered y, just as in the renderer. */
export type StructuralPrimitive = Readonly<{
  shape:'box'|'cylinder'|'roof'|'dome';
  x:number;y:number;z:number;w:number;h:number;d:number;
  segments?:number; rings?:number; topScale?:number;
  rotationX?:number; rotationY?:number; rotationZ?:number; inverted?:boolean;
  /** Unrotated cone vertices scaled before yaw, used by the original house/mission roofs. */
  roofDiamond?:boolean;
}>;
export type PrimitiveHeights = {bottom:number;top:number};

const profiles=new Map<string,readonly StructuralPrimitive[]>();
for(const place of NEW_LANDMARKS){
  if(!place.solid)continue;
  const result:StructuralPrimitive[]=[];
  const collect=(shape:StructuralPrimitive['shape'])=>
    (x:number,y:number,z:number,w:number,h:number,d:number,_color:number,structural=false)=>{
      if(structural)result.push(Object.freeze({shape,x,y,z,w,h,d}));
    };
  const parts:LandmarkParts={box:collect('box'),cyl:collect('cylinder'),roof:collect('roof'),dome:collect('dome')};
  const found=buildSfNorthLandmark(place,parts)||buildPeninsulaSouthLandmark(place,parts)||buildEastBayLandmark(place,parts);
  if(!found||result.length===0||result.length>8)throw new Error(`Invalid structural profile for ${place.id}: ${result.length} parts`);
  if(result.some(part=>![part.x,part.y,part.z,part.w,part.h,part.d].every(Number.isFinite)||part.w<=0||part.h<=0||part.d<=0))
    throw new Error(`Invalid structural dimensions for ${place.id}`);
  profiles.set(place.id,Object.freeze(result));
}

const empty:readonly StructuralPrimitive[]=Object.freeze([]);
/** Precomputed, stable ordered collision volumes; decorative places have none. */
export function newLandmarkPrimitives(id:string):readonly StructuralPrimitive[]{return profiles.get(id)??empty;}

/** Horizontal broad-phase extent, in the part's yaw-aligned frame. */
const extentCache=new WeakMap<StructuralPrimitive,{w:number;d:number;yaw:number;bottom:number;top:number}>();
export function primitiveExtent(part:StructuralPrimitive){
 let value=extentCache.get(part);if(value)return value;
 const scale=part.shape==='roof'&&!part.roofDiamond?Math.SQRT1_2:Math.max(1,part.topScale??1);
 const angle=part.shape==='box'?(part.rotationZ??0):0;
 const vertical=part.rotationX?part.d:part.h*Math.abs(Math.cos(angle))+part.w*Math.abs(Math.sin(angle));
 const bottom=part.shape==='dome'?(part.inverted?part.y-part.h-.2:part.y):part.y-vertical/2;
 const top=part.shape==='dome'?(part.inverted?part.y:part.y+part.h):part.y+vertical/2;
 value={w:part.w*scale*Math.abs(Math.cos(angle))+part.h*Math.abs(Math.sin(angle)),d:part.rotationX?part.h:part.d*scale,yaw:part.rotationY??0,bottom,top};
 extentCache.set(part,value);return value;
}

/** Relative radial coordinate within the regular-polygon cross section used
 * by the rendered cylinder and dome. One is exactly the polygon boundary. */
function polygonRadius(x:number,z:number,segments:number,phase=0):number {
  const step=2*Math.PI/segments;
  const angle=(Math.atan2(z,x)-phase+2*Math.PI)%(2*Math.PI);
  const mid=(Math.floor(angle/step)+.5)*step;
  return (x*Math.cos(mid+phase)+z*Math.sin(mid+phase))/Math.cos(step/2);
}
const ringCache=new Map<number,readonly {radius:number;height:number}[]>();
function ringsFor(count:number){let rings=ringCache.get(count);if(!rings){rings=Array.from({length:count+1},(_,i)=>({radius:Math.sin(i*Math.PI/(2*count)),height:Math.cos(i*Math.PI/(2*count))}));ringCache.set(count,rings);}return rings;}

/** Sample the occupied vertical interval at a local x/z. This matches the
 * renderer's 12-sided cylinders, rotated four-sided pyramid roofs, and
 * 16-by-8 faceted hemispheres, without constructing Three.js meshes. */
export function sampleLandmarkPrimitive(part:StructuralPrimitive,x:number,z:number):PrimitiveHeights|null {
  const yaw=part.rotationY??0,c=Math.cos(yaw),s=Math.sin(yaw);
  const dx=(x-part.x)*c-(z-part.z)*s,dz=(x-part.x)*s+(z-part.z)*c;
  let top=part.y+part.h/2,bottom=part.y-part.h/2;
  if(part.shape==='box'){
    if(Math.abs(dz)>part.d/2)return null;
    if(part.rotationZ){
      const c=Math.cos(part.rotationZ),s=Math.sin(part.rotationZ);
      let lo=-Infinity,hi=Infinity;
      // Clip a vertical ray against both local X/Y slabs of the tilted box.
      for(const [a,b,r] of [[s,c*dx,part.w/2],[c,-s*dx,part.h/2]]){
        if(Math.abs(a)<1e-10){if(Math.abs(b)>r)return null;continue;}
        const t0=(-r-b)/a,t1=(r-b)/a;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
      }
      if(lo>hi)return null;bottom=part.y+lo;top=part.y+hi;
    }else if(Math.abs(dx)>part.w/2)return null;
  }else if(part.shape==='roof'){
    // ConeGeometry(.5,1,4).rotateY(π/4) has axis-aligned square base corners
    // at (±1/√8, ±1/√8); scaling w/d makes that base rectangular.
    const extent=part.roofDiamond?Math.abs(dx)/(part.w/2)+Math.abs(dz)/(part.d/2):Math.max(Math.abs(dx)/(part.w/Math.SQRT2/2),Math.abs(dz)/(part.d/Math.SQRT2/2));
    if(extent>1)return null;
    top=part.y+part.h*(.5-extent);
  }else if(part.shape==='cylinder'&&part.rotationX){
    // Existing NASA test section: a 16-sided cylinder lies along Z.
    if(Math.abs(dz)>part.h/2||Math.abs(dx)>part.w/2)return null;
    let low=Infinity,high=-Infinity;
    const count=part.segments??12;
    for(let i=0;i<count;i++){
      const a=i*2*Math.PI/count,b=(i+1)*2*Math.PI/count;
      const ax=Math.sin(a)*part.w/2,bx=Math.sin(b)*part.w/2;
      if(Math.abs(bx-ax)<1e-10||dx<Math.min(ax,bx)-1e-10||dx>Math.max(ax,bx)+1e-10)continue;
      const t=(dx-ax)/(bx-ax),height=(Math.cos(a)+(Math.cos(b)-Math.cos(a))*t)*part.d/2;
      low=Math.min(low,height);high=Math.max(high,height);
    }
    if(!Number.isFinite(low))return null;bottom=part.y+low;top=part.y+high;
  }else{
    const radial=polygonRadius(dx/(part.w/2),dz/(part.d/2),part.segments??(part.shape==='cylinder'?12:16),part.shape==='cylinder'?Math.PI/2:0);
    const topScale=part.topScale??1;
    if(radial>Math.max(1,topScale)+1e-12)return null;
    if(part.shape==='cylinder'&&topScale!==1){
      if(topScale<1&&radial>topScale)top=bottom+part.h*(1-radial)/(1-topScale);
      if(topScale>1&&radial>1)bottom+=part.h*(radial-1)/(topScale-1);
    }
    if(part.shape==='dome'){
      const value=Math.max(0,Math.min(1,radial)),domeRings=ringsFor(part.rings??8);
      let lower=0,upper=domeRings.length-1;
      while(upper-lower>1){const mid=(lower+upper)>>1;if(domeRings[mid].radius<=value)lower=mid;else upper=mid;}
      const a=domeRings[lower],b=domeRings[upper],t=(value-a.radius)/(b.radius-a.radius);
      const rise=part.h*(a.height+(b.height-a.height)*t);
      if(part.inverted){top=part.y-rise;bottom=top-.2;}else{bottom=part.y;top=part.y+rise;}
    }
  }
  return {bottom,top};
}

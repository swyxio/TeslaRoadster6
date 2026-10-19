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

/** Relative radial coordinate within the regular-polygon cross section used
 * by the rendered cylinder and dome. One is exactly the polygon boundary. */
function polygonRadius(x:number,z:number,segments:number):number {
  const step=2*Math.PI/segments;
  const angle=(Math.atan2(z,x)+2*Math.PI)%(2*Math.PI);
  const mid=(Math.floor(angle/step)+.5)*step;
  return (x*Math.cos(mid)+z*Math.sin(mid))/Math.cos(step/2);
}
const domeRings=Array.from({length:9},(_,i)=>({radius:Math.sin(i*Math.PI/16),height:Math.cos(i*Math.PI/16)}));

/** Sample the occupied vertical interval at a local x/z. This matches the
 * renderer's 12-sided cylinders, rotated four-sided pyramid roofs, and
 * 16-by-8 faceted hemispheres, without constructing Three.js meshes. */
export function sampleLandmarkPrimitive(part:StructuralPrimitive,x:number,z:number):PrimitiveHeights|null {
  const dx=x-part.x,dz=z-part.z;
  let top=part.y+part.h/2,bottom=part.y-part.h/2;
  if(part.shape==='box'){
    if(Math.abs(dx)>part.w/2||Math.abs(dz)>part.d/2)return null;
  }else if(part.shape==='roof'){
    // ConeGeometry(.5,1,4).rotateY(π/4) has axis-aligned square base corners
    // at (±1/√8, ±1/√8); scaling w/d makes that base rectangular.
    const extent=Math.max(Math.abs(dx)/(part.w/Math.SQRT2/2),Math.abs(dz)/(part.d/Math.SQRT2/2));
    if(extent>1)return null;
    top=part.y+part.h*(.5-extent);
  }else{
    const radial=polygonRadius(dx/(part.w/2),dz/(part.d/2),part.shape==='cylinder'?12:16);
    if(radial>1+1e-12)return null;
    if(part.shape==='dome'){
      const value=Math.max(0,Math.min(1,radial));
      let lower=0,upper=8;
      while(upper-lower>1){const mid=(lower+upper)>>1;if(domeRings[mid].radius<=value)lower=mid;else upper=mid;}
      const a=domeRings[lower],b=domeRings[upper],t=(value-a.radius)/(b.radius-a.radius);
      bottom=part.y;top=part.y+part.h*(a.height+(b.height-a.height)*t);
    }
  }
  return {bottom,top};
}

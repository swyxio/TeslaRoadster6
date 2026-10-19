import { EAST_SOUTH_ADDITIONS } from './east-south-additions';
import type { StructuralPrimitive } from './new-landmark-surfaces';
// Matching existing compact models; tests compare these to their actual meshes.
const profiles=new Map<string,readonly StructuralPrimitive[]>();
for(const p of EAST_SOUTH_ADDITIONS){
 const {w,d,h}=p,parts:StructuralPrimitive[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({shape:'box',x,y,z,w,h,d});
 if(p.id==='chabot-space'){
  box(0,h*.2,0,w,h*.4,d);box(0,h*.41,0,w,h*.03,d);
  for(const [x,r] of [[-w*.22,6],[w*.2,5]]){
   parts.push({shape:'cylinder',x,y:h*.6,z:0,w:r*2,h:h*.35,d:r*2,segments:16});
   parts.push({shape:'dome',x,y:h*.775,z:0,w:r*2,h:h*.21,d:r*2,segments:16,rings:8});
  }
 }else if(p.id==='oakland-zoo'){
  box(0,h*.24,0,w,h*.48,d);box(0,h*.5,0,w,h*.04,d);
  for(const x of [-.38,.38]){box(x*w,h*.58,d*.25,w*.12,h*.25,d*.16);box(x*w,h*.72,d*.25,w*.14,h*.05,d*.19);}
  box(w*.12,h*.8,0,5,h*.15,4);
 }else if(p.id==='nasa-ames'){
  box(0,h*.23,0,w,h*.46,d);box(0,h*.5,0,w,h*.05,d);
  parts.push({shape:'cylinder',x:0,y:h*.7,z:0,w:12,h:d*.74,d:12,segments:16,rotationX:Math.PI/2});
 }else{
  box(0,h*.24,0,w,h*.48,d);box(0,h*.5,0,w,h*.08,d);
  box(0,h*.58,0,w*.92,h*.08,d*.9);box(0,h*.66,0,w*.8,h*.08,d*.78);box(0,h*.73,0,w*.65,h*.06,d*.62);
  box(0,h*.87,-d*.36,w*.45,h*.14,1);
  for(const x of [-.4,.4])box(x*w,h*.79,-d*.35,.5,h*.38,.5);
 }
 profiles.set(`${p.x},${p.z}`,Object.freeze(parts));
}
export function eastSouthBuildingParts(x:number,z:number){return profiles.get(`${x},${z}`);}

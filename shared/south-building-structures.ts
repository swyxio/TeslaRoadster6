import { SOUTH_LANDMARKS } from './south-landmarks';
import { buildSouthLandmarkModel } from './south-landmark-models';
import type { StructuralPrimitive } from './new-landmark-surfaces';

// Build once, independently of Three.js. Array ordering is stable because part
// indices identify individual roofs and stacked supports in the wire state.
const profiles=new Map<string,readonly StructuralPrimitive[]>();
for(const place of SOUTH_LANDMARKS){
 if(place.style==='peak')continue; // Mission Peak is shared terrain, not a building.
 const parts:StructuralPrimitive[]=[];
 for(const piece of buildSouthLandmarkModel(place)){
  if(!piece.structural)continue;
  if(piece.geometry==='cone'||piece.rotationX)throw new Error(`Unsupported South structure: ${place.id}`);
  const shape=piece.geometry;
  const radiusScale=shape==='box'?1:2;
  const inverted=shape==='dome'&&piece.rotationZ===Math.PI;
  const part:StructuralPrimitive={
   shape,x:piece.x,y:piece.y,z:piece.z,w:piece.w*radiusScale,h:piece.h,d:piece.d*radiusScale,
   ...(shape==='cylinder'?{segments:16}:{}),
   ...(shape==='dome'?{segments:18,rings:10}:{}),
   ...(piece.rotationY?{rotationY:piece.rotationY}:{}),
   ...(inverted?{inverted:true}:piece.rotationZ?{rotationZ:piece.rotationZ}:{}),
  };
  parts.push(Object.freeze(part));
 }
 if(parts.length===0||parts.length>16)throw new Error(`Invalid South structural budget for ${place.id}: ${parts.length}`);
 profiles.set(`${place.x},${place.z}`,Object.freeze(parts));
}

/** Same coordinates as the existing shared building broad-phase envelope. */
export function southBuildingParts(x:number,z:number):readonly StructuralPrimitive[]|undefined {
 return profiles.get(`${x},${z}`);
}

import type { Building } from './map';
import { primitiveExtent } from './new-landmark-surfaces';

type Bounds = {minX:number;maxX:number;minZ:number;maxZ:number};
const bounds = new WeakMap<Building, Bounds>();

/** Buildings and their authored parts are immutable after map construction.
 * Include eaves/tilted overhangs, not just the main facade's dimensions. The
 * spatial index and cheap collision rejection must use the same enclosure. */
export function buildingBounds(building:Building):Bounds {
  const cached=bounds.get(building);if(cached)return cached;
  let minX=building.x-building.w/2,maxX=building.x+building.w/2;
  let minZ=building.z-building.d/2,maxZ=building.z+building.d/2;
  for(const part of building.parts??[]){
    const e=primitiveExtent(part),c=Math.abs(Math.cos(e.yaw)),s=Math.abs(Math.sin(e.yaw));
    const rx=(e.w*c+e.d*s)/2,rz=(e.w*s+e.d*c)/2;
    minX=Math.min(minX,building.x+part.x-rx);maxX=Math.max(maxX,building.x+part.x+rx);
    minZ=Math.min(minZ,building.z+part.z-rz);maxZ=Math.max(maxZ,building.z+part.z+rz);
  }
  const result={minX,maxX,minZ,maxZ};bounds.set(building,result);return result;
}

export function buildingBoundsOverlap(building:Building,minX:number,maxX:number,minZ:number,maxZ:number):boolean {
  const b=buildingBounds(building);
  return b.maxX>=minX&&b.minX<=maxX&&b.maxZ>=minZ&&b.minZ<=maxZ;
}

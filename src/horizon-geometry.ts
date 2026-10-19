import { MAP_BOUNDS } from '../shared/map';

// A decorative enclosure outside the entire playable map. These values are
// game-space art direction, not surveyed elevation or physical terrain.
export const HORIZON_BOUNDS = {
  minX: MAP_BOUNDS.minX - 2200, maxX: MAP_BOUNDS.maxX + 2200,
  minZ: MAP_BOUNDS.minZ - 2200, maxZ: MAP_BOUNDS.maxZ + 2200,
};

const BASE_HEIGHT = -140;
const PROJECTION_DISTANCE = 1500; // Behind the fog, inside the normal camera far plane.

export function createHorizonGeometryData() {
  const { minX, maxX, minZ, maxZ } = HORIZON_BOUNDS;
  const world: number[] = [], uv: number[] = [], indices: number[] = [];
  // Marin, Diablo/East Bay, South Bay and the Santa Cruz/Peninsula ranges.
  // Subdivision preserves the bearing of nearby points when projected.
  const edges = [
    [minX,minZ,maxX,minZ,460,550], [maxX,minZ,maxX,maxZ,550,520],
    [maxX,maxZ,minX,maxZ,520,450], [minX,maxZ,minX,minZ,450,460],
  ];
  const perimeter=2*((maxX-minX)+(maxZ-minZ));
  // An even number of mirrored repeats makes both the tile seams and the final
  // closure continuous, even when the original image edges are not identical.
  const repeats=Math.max(2,Math.round(perimeter/12000)*2);
  let distance=0;
  for (const [x0,z0,x1,z1,height0,height1] of edges) {
    const length = Math.hypot(x1-x0,z1-z0);
    const segments = Math.ceil(length/700);
    const start = world.length/3;
    for (let i=0;i<=segments;i++) {
      const t=i/segments, x=x0+(x1-x0)*t, z=z0+(z1-z0)*t;
      world.push(x,BASE_HEIGHT,z,x,BASE_HEIGHT+height0+(height1-height0)*t,z);
      const u=(distance+t*length)*repeats/perimeter;
      uv.push(u,0,u,1);
      if (i<segments) {
        const v=start+i*2;
        indices.push(v,v+1,v+2,v+1,v+3,v+2);
      }
    }
    distance+=length;
  }
  return { world: new Float32Array(world), uv: new Float32Array(uv), indices };
}

// Preserve each point's direction from the camera while bringing the distant
// enclosure inside the existing camera clip range. No player/world state moves.
export function projectHorizon(world: Float32Array, out: Float32Array, x: number, y: number, z: number) {
  for (let i=0;i<world.length;i+=3) {
    const dx=world[i]-x, dy=world[i+1]-y, dz=world[i+2]-z;
    const scale=PROJECTION_DISTANCE/Math.hypot(dx,dy,dz);
    out[i]=x+dx*scale; out[i+1]=y+dy*scale; out[i+2]=z+dz*scale;
  }
}

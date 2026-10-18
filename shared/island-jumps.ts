/** Two eastbound launch ramps in the fictional island's infield, in game meters. */
export const ISLAND_JUMPS = [
  { id:'west', start:-230, end:-190, z:-1650, width:18, height:4 },
  { id:'east', start:350, end:390, z:-1450, width:18, height:4 },
] as const;

export type IslandJump = typeof ISLAND_JUMPS[number];
type Point = { x:number; y:number; z:number };

export function islandJumpAt(x:number,z:number):IslandJump|undefined {
  return ISLAND_JUMPS.find(jump=>x>=jump.start&&x<=jump.end&&Math.abs(z-jump.z)<=jump.width/2);
}

export function islandJumpHeight(x:number,z:number):number|null {
  const jump=islandJumpAt(x,z);
  return jump?jump.height*(x-jump.start)/(jump.end-jump.start):null;
}

export function islandJumpSlope(jump:IslandJump):number {
  return jump.height/(jump.end-jump.start);
}

/** Earliest crossing of a ramp top, for fast or steep airborne approaches. */
export function sweepIslandJump(a:Point,b:Point):({x:number;y:number;z:number;t:number;jump:IslandJump})|null {
  let hit:ReturnType<typeof sweepIslandJump>=null;
  for(const jump of ISLAND_JUMPS){
    const slope=islandJumpSlope(jump);
    const before=a.y-(a.x-jump.start)*slope,after=b.y-(b.x-jump.start)*slope;
    if(before<0||after>0||before===after)continue;
    const t=before/(before-after),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
    if(t<0||t>1||x<jump.start||x>jump.end||Math.abs(z-jump.z)>jump.width/2||(hit&&hit.t<=t))continue;
    hit={x,y:(x-jump.start)*slope,z,t,jump};
  }
  return hit;
}

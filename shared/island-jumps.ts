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

/** Sweep the car's horizontal footprint against the bounded triangular side
 * faces and vertical end face. Vertical offsets are relative to its pivot. */
export function sweepIslandJumpWall(a:Point,b:Point,extent:{halfX:number;halfZ:number;minY:number;maxY:number}) {
  type Hit = Point & {t:number;normal:{x:number;z:number}};
  let best:Hit|null=null;
  for(const jump of ISLAND_JUMPS){
    const sides=[
      {axis:'x' as const, normal:1, face:jump.end, expanded:jump.end+extent.halfX},
      {axis:'z' as const, normal:-1, face:jump.z-jump.width/2, expanded:jump.z-jump.width/2-extent.halfZ},
      {axis:'z' as const, normal:1, face:jump.z+jump.width/2, expanded:jump.z+jump.width/2+extent.halfZ},
    ];
    for(const side of sides){
      const from=(a[side.axis]-side.expanded)*side.normal,to=(b[side.axis]-side.expanded)*side.normal;
      // Only inward movement is a collision. A pivot already overlapping the
      // footprint but still outside the visible face is resolved at t=0.
      if(to>=from||to>=0)continue;
      const outsideFace=(a[side.axis]-side.face)*side.normal>=0;
      if(from<0&&!outsideFace)continue;
      const t=from>=0?from/(from-to):0;
      const point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
      if(side.axis==='x'&&Math.abs(point.z-jump.z)>jump.width/2+extent.halfZ)continue;
      if(side.axis==='z'&&(point.x+extent.halfX<jump.start||point.x-extent.halfX>jump.end))continue;
      const top=side.axis==='x'?jump.height:Math.max(0,Math.min(jump.height,(point.x+extent.halfX-jump.start)*islandJumpSlope(jump)));
      if(point.y+extent.minY>=top||point.y+extent.maxY<=0)continue;
      if(best&&best.t<=t)continue;
      point[side.axis]=side.expanded+side.normal*.01;
      best={...point,t,normal:{x:side.axis==='x'?side.normal:0,z:side.axis==='z'?side.normal:0}};
    }
  }
  return best;
}

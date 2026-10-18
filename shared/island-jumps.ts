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

/** Sweep an oriented upright body against the actual bounded wedge faces.
 * Vertical offsets include the car's current pitch/roll bounds. */
export function sweepIslandJumpWall(a:Point,b:Point,extent:{halfWidth:number;halfLength:number;yaw:number;minY:number;maxY:number}) {
  type Hit = Point & {t:number;normal:Point;faceNormal:{x:number;z:number}};
  const c=Math.cos(extent.yaw),s=Math.sin(extent.yaw);
  const right={x:c,y:0,z:-s},forward={x:-s,y:0,z:-c};
  const halfX=Math.abs(c)*extent.halfWidth+Math.abs(s)*extent.halfLength;
  const halfZ=Math.abs(s)*extent.halfWidth+Math.abs(c)*extent.halfLength;
  const up={x:0,y:1,z:0},delta={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  const dot=(u:Point,v:Point)=>u.x*v.x+u.y*v.y+u.z*v.z;
  const cross=(u:Point,v:Point):Point=>({x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x});
  let best:Hit|null=null;
  for(const jump of ISLAND_JUMPS){
    // Cheap broad phase before the oriented box/face separating-axis sweep.
    if(Math.max(a.x,b.x)+halfX<jump.start||Math.min(a.x,b.x)-halfX>jump.end||
      Math.max(a.z,b.z)+halfZ<jump.z-jump.width/2||Math.min(a.z,b.z)-halfZ>jump.z+jump.width/2||
      Math.max(a.y,b.y)+extent.maxY<0||Math.min(a.y,b.y)+extent.minY>jump.height)continue;
    const near=jump.z-jump.width/2,far=jump.z+jump.width/2;
    const faces=[
      {axis:'x' as const, sign:1, coordinate:jump.end, vertices:[
        {x:jump.end,y:0,z:near},{x:jump.end,y:0,z:far},{x:jump.end,y:jump.height,z:far},{x:jump.end,y:jump.height,z:near}]},
      ...([-1,1] as const).map(sign=>{const z=sign<0?near:far;return {axis:'z' as const,sign,coordinate:z,vertices:[
        {x:jump.start,y:0,z},{x:jump.end,y:0,z},{x:jump.end,y:jump.height,z}]};}),
    ];
    for(const face of faces){
      if((a[face.axis]-face.coordinate)*face.sign<0)continue;
      const movingIn=delta[face.axis]*face.sign<0;
      const faceNormal={x:face.axis==='x'?face.sign:0,z:face.axis==='z'?face.sign:0};
      const axes=[right,forward,up,{x:faceNormal.x,y:0,z:faceNormal.z}];
      if(face.axis==='z'){
        const incline={x:1,y:islandJumpSlope(jump),z:0};
        axes.push(cross(incline,right),cross(incline,forward));
      }
      let enter=-Infinity,exit=Infinity,normal:Point={x:faceNormal.x,y:0,z:faceNormal.z};
      let penetration=Infinity,penetrationNormal=normal;
      let finalOverlap=true,finalPenetration=Infinity,finalNormal=normal;
      const center={x:a.x,y:a.y+(extent.minY+extent.maxY)/2,z:a.z};
      for(const raw of axes){
        const length=Math.hypot(raw.x,raw.y,raw.z);if(length<1e-10)continue;
        const axis={x:raw.x/length,y:raw.y/length,z:raw.z/length};
        const projections=face.vertices.map(vertex=>dot(vertex,axis));
        const faceMin=Math.min(...projections),faceMax=Math.max(...projections);
        const radius=Math.abs(dot(axis,right))*extent.halfWidth+Math.abs(dot(axis,forward))*extent.halfLength+
          Math.abs(axis.y)*(extent.maxY-extent.minY)/2;
        const origin=dot(center,axis),low=origin-radius,high=origin+radius,velocity=dot(delta,axis);
        const finalLow=low+velocity,finalHigh=high+velocity;
        if(finalHigh<=faceMin||finalLow>=faceMax)finalOverlap=false;
        else if(Math.abs(axis.y)<1e-8){
          const negative=finalHigh-faceMin,positive=faceMax-finalLow,depth=Math.min(negative,positive);
          if(depth<finalPenetration){const sign=negative<positive?-1:1;finalPenetration=depth;finalNormal={x:axis.x*sign,y:0,z:axis.z*sign};}
        }
        if(Math.abs(velocity)<1e-10){if(high<faceMin||low>faceMax){enter=Infinity;break;}}
        else{
          const t0=(faceMin-high)/velocity,t1=(faceMax-low)/velocity;
          const first=Math.min(t0,t1),last=Math.max(t0,t1);
          if(first>enter){enter=first;const sign=velocity>0?-1:1;normal={x:axis.x*sign,y:axis.y*sign,z:axis.z*sign};}
          exit=Math.min(exit,last);
        }
        // For an initially intersecting face, choose the smallest horizontal
        // separation so the car cannot remain embedded in its wedge.
        if(Math.abs(axis.y)<1e-8&&high>=faceMin&&low<=faceMax){
          const negative=high-faceMin,positive=faceMax-low,depth=Math.min(negative,positive);
          if(depth<penetration){const sign=negative<positive?-1:1;penetration=depth;penetrationNormal={x:axis.x*sign,y:axis.y*sign,z:axis.z*sign};}
        }
      }
      // Steering can rotate a body into a face even while its center is
      // stationary or moving away. Resolve the actual final footprint too.
      if(!movingIn){
        if(finalOverlap&&Number.isFinite(finalPenetration)&&(!best||best.t>1)){
          const offset=finalPenetration+.01;
          best={x:b.x+finalNormal.x*offset,y:b.y,z:b.z+finalNormal.z*offset,t:1,normal:finalNormal,faceNormal};
        }
        continue;
      }
      if(enter>exit||exit<0||enter>1)continue;
      const t=Math.max(0,enter);if(best&&best.t<=t)continue;
      const separating=enter<0&&Number.isFinite(penetration)?penetrationNormal:normal;
      const offset=enter<0&&Number.isFinite(penetration)?penetration+.01:.01;
      best={x:a.x+delta.x*t+separating.x*offset,y:a.y+delta.y*t+separating.y*offset,
        z:a.z+delta.z*t+separating.z*offset,t,normal:separating,faceNormal};
    }
  }
  return best;
}

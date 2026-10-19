import { DOME } from './dome';
import { dimensions, type OrientedPose } from './physics';

type Point={x:number;y:number;z:number};
/** The renderer's yaw → pitch → roll box, around its underside pivot. */
export function domeBodyCorners(e:OrientedPose):Point[] {
  const d=dimensions(e.kind),cy=Math.cos(e.yaw),sy=Math.sin(e.yaw);
  const cp=Math.cos(e.pitch),sp=Math.sin(e.pitch),cr=Math.cos(e.roll),sr=Math.sin(e.roll);
  const corners:Point[]=[];
  for(const x of [-d.width/2,d.width/2])for(const y of [0,d.height])for(const z of [-d.length/2,d.length/2]){
    const rx=cr*x-sr*y,ry=sr*x+cr*y,py=cp*ry-sp*z,pz=sp*ry+cp*z;
    corners.push({x:cy*rx+sy*pz,y:py,z:-sy*rx+cy*pz});
  }
  return corners;
}

/** Bounded projection of an airborne box into the arena's convex cross-section.
 * Attached vehicles use the separate surface basis and never enter this path. */
export function domeBodyContact(e:OrientedPose) {
  const corners=domeBodyCorners(e),r=DOME.radius,w=DOME.flatHalfWidth;
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
  const x=Math.max(DOME.x-DOME.halfLength-minX,Math.min(DOME.x+DOME.halfLength-maxX,e.x));
  let y=e.y,z=e.z,first:{normalY:number;normalZ:number}|null=null;
  // Eight corners and a fixed iteration cap: no mesh or world scan.
  for(let iteration=0;iteration<8;iteration++){
    let depth=1e-9,normalY=0,normalZ=0;
    for(const p of corners){
      const pz=z+p.z-DOME.z,side=pz-Math.max(-w,Math.min(w,pz)),py=y+p.y-r;
      const length=Math.hypot(side,py),overlap=length-r;
      if(overlap>depth){depth=overlap;normalY=-py/length;normalZ=-side/length;}
    }
    if(depth<=1e-9)break;
    first??={normalY,normalZ};
    y+=normalY*(depth+1e-7);z+=normalZ*(depth+1e-7);
  }
  return {x,y,z,contact:first};
}

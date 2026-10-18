import { SHORT_TRACK } from './race-courses';

/** Banked speed oval. Rendering and physics share these exact triangles. */
export const OVAL_BANK = {
  centerX: 200, centerZ: -1650, radiusX: 510, radiusZ: 350,
  trackSegments: 48, segments: 192, rows: 30, halfWidth: 30, laneHalfWidth: 14,
} as const;

type Point = { x:number; y:number; z:number };
export type OvalSurface = { height:number; dx:number; dz:number; normal:Point };
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const smooth=(n:number)=>{const t=clamp(n,0,1);return t*t*(3-2*t);};
function distanceToSegment(x:number,z:number,a:{x:number;z:number},b:{x:number;z:number}):number {
  const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}

/** The original 48-sided painted track remains the race and minimap route. */
export function ovalTrackPoint(index:number):{x:number;z:number} {
  const a=index/OVAL_BANK.trackSegments*Math.PI*2;
  return {x:OVAL_BANK.centerX+OVAL_BANK.radiusX*Math.cos(a),z:OVAL_BANK.centerZ+OVAL_BANK.radiusZ*Math.sin(a)};
}

/** Row 0 is the inner shoulder, rows 8–22 the lane, and row 30 the outer shoulder. */
export function ovalBankVertex(segment:number,row:number):Point {
  const b=OVAL_BANK,wrap=((segment%b.segments)+b.segments)%b.segments;
  const position=wrap*b.trackSegments/b.segments,i=Math.floor(position),t=position-i;
  const a=ovalTrackPoint(i),next=ovalTrackPoint(i+1);
  const centerX=a.x+(next.x-a.x)*t,centerZ=a.z+(next.z-a.z)*t;
  const angle=wrap/b.segments*Math.PI*2,nx=Math.cos(angle)/b.radiusX,nz=Math.sin(angle)/b.radiusZ,length=Math.hypot(nx,nz);
  const across=-b.halfWidth+2*b.halfWidth*row/b.rows;
  const low=.25,high=3.89;
  const height=across< -b.laneHalfWidth?low*smooth((across+b.halfWidth)/(b.halfWidth-b.laneHalfWidth)):
    across>b.laneHalfWidth?high*smooth((b.halfWidth-across)/(b.halfWidth-b.laneHalfWidth)):
      low+(high-low)*(across+b.laneHalfWidth)/(2*b.laneHalfWidth);
  // Flatten the full oval/short-course overlap, not just its centerline
  // intersections; the dock crossing is inside this same flat junction.
  // The start and grid also remain ground-supported. Blend over 70 m.
  let blend=smooth((Math.hypot(centerX-240,centerZ+1301)-65)/70);
  for(let k=0;k<SHORT_TRACK.length;k++){
    const distance=distanceToSegment(centerX,centerZ,SHORT_TRACK[k],SHORT_TRACK[(k+1)%SHORT_TRACK.length]);
    blend=Math.min(blend,smooth((distance-50)/70));
  }
  return {x:centerX+nx/length*across,y:height*blend,z:centerZ+nz/length*across};
}

type Triangle = {a:Point;b:Point;c:Point;dx:number;dz:number;den:number};
const cells=new Map<string,Triangle[]>(),CELL=32;
const vertices=Array.from({length:OVAL_BANK.segments+1},(_,i)=>
  Array.from({length:OVAL_BANK.rows+1},(_,j)=>ovalBankVertex(i,j)));
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
function addTriangle(a:Point,b:Point,c:Point):void {
  if(a.y===0&&b.y===0&&c.y===0)return;
  const den=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const dx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/den;
  const dz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/den;
  const tri={a,b,c,dx,dz,den};
  const x0=Math.min(a.x,b.x,c.x),x1=Math.max(a.x,b.x,c.x),z0=Math.min(a.z,b.z,c.z),z1=Math.max(a.z,b.z,c.z);
  minX=Math.min(minX,x0);maxX=Math.max(maxX,x1);minZ=Math.min(minZ,z0);maxZ=Math.max(maxZ,z1);
  for(let x=Math.floor(x0/CELL);x<=Math.floor(x1/CELL);x++)for(let z=Math.floor(z0/CELL);z<=Math.floor(z1/CELL);z++){
    const key=`${x},${z}`,bucket=cells.get(key);
    if(bucket)bucket.push(tri);else cells.set(key,[tri]);
  }
}
for(let i=0;i<OVAL_BANK.segments;i++)for(let j=0;j<OVAL_BANK.rows;j++){
  const a=vertices[i][j],b=vertices[i][j+1],c=vertices[i+1][j],d=vertices[i+1][j+1];
  addTriangle(a,c,b);addTriangle(b,c,d);
}

/** Triangle lookup is bounded to one local spatial bucket, including the seam. */
export function ovalBankSurface(x:number,z:number):OvalSurface|null {
  if(x<minX||x>maxX||z<minZ||z>maxZ)return null;
  const bucket=cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`);
  if(!bucket)return null;
  for(const {a,b,c,dx,dz,den} of bucket){
    const u=((x-a.x)*(c.z-a.z)-(z-a.z)*(c.x-a.x))/den;
    const v=((b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x))/den;
    if(u< -1e-9||v< -1e-9||u+v>1+1e-9)continue;
    const height=a.y+dx*(x-a.x)+dz*(z-a.z);
    if(height<=1e-8)return null;
    const length=Math.hypot(dx,1,dz);
    return {height,dx,dz,normal:{x:-dx/length,y:1/length,z:-dz/length}};
  }
  return null;
}

export function ovalBankVerticalVelocity(x:number,z:number,vx:number,vz:number):number {
  const surface=ovalBankSurface(x,z);return surface?surface.dx*vx+surface.dz*vz:0;
}

/** First swept downward hit, including an approach across either shoulder. */
export function sweepOvalBank(a:Point,b:Point):({x:number;y:number;z:number;t:number;normal:Point})|null {
  if(Math.max(a.x,b.x)<minX||Math.min(a.x,b.x)>maxX||Math.max(a.z,b.z)<minZ||Math.min(a.z,b.z)>maxZ)return null;
  const steps=Math.min(1024,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.5)));
  const at=(t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  let previous=a,previousSurface=ovalBankSurface(a.x,a.z);
  for(let i=1;i<=steps;i++){
    const t=i/steps,current=at(t),surface=ovalBankSurface(current.x,current.z);
    if(surface&&previous.y-(previousSurface?.height??0)>=0&&current.y<=surface.height){
      let lo=(i-1)/steps,hi=t;
      for(let j=0;j<24;j++){
        const mid=(lo+hi)/2,p=at(mid),s=ovalBankSurface(p.x,p.z);
        if(p.y>(s?.height??0))lo=mid;else hi=mid;
      }
      const p=at(hi),hit=ovalBankSurface(p.x,p.z);
      if(hit)return {...p,y:hit.height,t:hi,normal:hit.normal};
    }
    previous=current;previousSurface=surface;
  }
  return null;
}

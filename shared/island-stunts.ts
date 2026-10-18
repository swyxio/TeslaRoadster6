/** Bounded island surfaces shared by simulation and renderer. Coordinates are game meters. */
export const ISLAND_BANK = { startX:-20, endX:180, z:-1750, halfWidth:30, laneHalfWidth:14, transition:30, columns:40, rows:30 } as const;
export const ISLAND_CLIFF = { x:420, z:-1850, radius:20, width:24, maxAngle:Math.PI*1.25, segments:240 } as const;

export type Point3 = {x:number;y:number;z:number};
type Surface = {height:number;dx:number;dz:number;normal:Point3};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const smooth=(n:number)=>{const t=clamp(n,0,1);return t*t*(3-2*t);};

/** Mesh and height queries use the same lattice and diagonal in each cell. */
export function bankVertex(column:number,row:number):Point3 {
  const b=ISLAND_BANK;
  const x=b.startX+(b.endX-b.startX)*column/b.columns;
  const z=b.z-b.halfWidth+2*b.halfWidth*row/b.rows, across=z-b.z;
  const edge=smooth(Math.min((x-b.startX)/b.transition,(b.endX-x)/b.transition));
  // A 28 m banked lane with sloping shoulders to meet the surrounding ground.
  const laneLow=.25, laneHigh=3.89;
  const acrossHeight=across < -b.laneHalfWidth
    ? laneLow*smooth((across+b.halfWidth)/(b.halfWidth-b.laneHalfWidth))
    : across > b.laneHalfWidth
      ? laneHigh*smooth((b.halfWidth-across)/(b.halfWidth-b.laneHalfWidth))
      : laneLow+(laneHigh-laneLow)*(across+b.laneHalfWidth)/(2*b.laneHalfWidth);
  return {x,y:edge*acrossHeight,z};
}

export function bankSurface(x:number,z:number):Surface|null {
  const b=ISLAND_BANK;
  if(x<b.startX||x>b.endX||z<b.z-b.halfWidth||z>b.z+b.halfWidth)return null;
  const sx=(b.endX-b.startX)/b.columns,sz=2*b.halfWidth/b.rows;
  const gx=(x-b.startX)/sx,gz=(z-(b.z-b.halfWidth))/sz;
  const i=Math.min(b.columns-1,Math.floor(gx)),j=Math.min(b.rows-1,Math.floor(gz));
  const u=gx-i,v=gz-j;
  const h00=bankVertex(i,j).y,h10=bankVertex(i+1,j).y,h01=bankVertex(i,j+1).y,h11=bankVertex(i+1,j+1).y;
  const height=u+v<=1?h00+u*(h10-h00)+v*(h01-h00):h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);
  const dx=u+v<=1?(h10-h00)/sx:(h11-h01)/sx,dz=u+v<=1?(h01-h00)/sz:(h11-h10)/sz;
  const length=Math.hypot(dx,1,dz);
  return {height,dx,dz,normal:{x:-dx/length,y:1/length,z:-dz/length}};
}

/** Preserve tangent velocity while the car follows the bank's actual plane. */
export function bankVerticalVelocity(x:number,z:number,vx:number,vz:number):number {
  const surface=bankSurface(x,z);return surface?surface.dx*vx+surface.dz*vz:0;
}

export type SurfaceHit = Point3 & {t:number;normal:Point3};
const interpolate=(a:Point3,b:Point3,t:number):Point3=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
/** First downward swept intersection, including fast paths crossing a bank edge. */
export function sweepBank(a:Point3,b:Point3):SurfaceHit|null {
  const steps=Math.min(1024,Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.5)));
  let previous=a, previousSurface=bankSurface(a.x,a.z);
  for(let i=1;i<=steps;i++){
    const time=i/steps,current=interpolate(a,b,time),surface=bankSurface(current.x,current.z);
    const before=previous.y-(previousSurface?.height??0),after=current.y-(surface?.height??0);
    if(surface&&before>=0&&after<=0){
      let lo=(i-1)/steps,hi=time;
      for(let j=0;j<24;j++){
        const mid=(lo+hi)/2,p=interpolate(a,b,mid),s=bankSurface(p.x,p.z);
        if(p.y>(s?.height??0))lo=mid;else hi=mid;
      }
      const point=interpolate(a,b,hi),hit=bankSurface(point.x,point.z);
      if(hit)return {...point,y:hit.height,t:hi,normal:hit.normal};
    }
    previous=current;previousSurface=surface;
  }
  return null;
}

/** Piecewise-linear arc; collision and render use these exact segment endpoints. */
export function cliffVertex(index:number):Point3 {
  const c=ISLAND_CLIFF,angle=c.maxAngle*index/c.segments;
  return {x:c.x+c.radius*Math.sin(angle),y:c.radius*(1-Math.cos(angle)),z:c.z};
}
export function cliffPose(angle:number):{point:Point3;tangent:Point3;normal:Point3} {
  const c=ISLAND_CLIFF,t=clamp(angle,0,c.maxAngle)/c.maxAngle*c.segments;
  const i=Math.min(c.segments-1,Math.floor(t)),fraction=t-i,a=cliffVertex(i),b=cliffVertex(i+1);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  return {point:interpolate(a,b,fraction),tangent:{x:dx/length,y:dy/length,z:0},normal:{x:-dy/length,y:dx/length,z:0}};
}

export type CliffHit = SurfaceHit & {angle:number;inside:boolean};
const cross=(ax:number,ay:number,bx:number,by:number)=>ax*by-ay*bx;
/** Earliest 3D segment/ribbon hit; rejects hits outside its 24 m width. */
export function sweepCliff(a:Point3,b:Point3,margin=1.3):CliffHit|null {
  const c=ISLAND_CLIFF,rx=b.x-a.x,ry=b.y-a.y;
  if(Math.max(a.x,b.x)<c.x-c.radius||Math.min(a.x,b.x)>c.x+c.radius||
    Math.max(a.y,b.y)<0||Math.min(a.y,b.y)>2*c.radius)return null;
  let best:CliffHit|null=null;
  for(let i=0;i<c.segments;i++){
    const p=cliffVertex(i),q=cliffVertex(i+1),sx=q.x-p.x,sy=q.y-p.y,den=cross(rx,ry,sx,sy);
    if(Math.abs(den)<1e-10)continue;
    const px=p.x-a.x,py=p.y-a.y,t=cross(px,py,sx,sy)/den,u=cross(px,py,rx,ry)/den;
    if(t<=1e-7||t>1||u<0||u>1||(best&&t>=best.t))continue;
    const point=interpolate(a,b,t);if(Math.abs(point.z-c.z)>c.width/2-margin)continue;
    const angle=(i+u)*c.maxAngle/c.segments,pose=cliffPose(angle);
    best={...point,t,angle,normal:pose.normal,inside:rx*pose.normal.x+ry*pose.normal.y<0};
  }
  return best;
}

type CliffCar = Point3 & {
  supportId:string|null;loopAngle:number|null;loopDirection:number;
  vx:number;vy:number;vz:number;speed:number;yaw:number;pitch:number;roll:number;
  pitchRate:number;yawRate:number;rollRate:number;pushX:number;pushZ:number;flipRemaining:number;
};
/** Snap to a swept contact and project world velocity onto the true tangent. */
export function enterCliff(car:CliffCar,angle:number):void {
  const pose=cliffPose(angle),speed=car.vx*pose.tangent.x+car.vy*pose.tangent.y;
  Object.assign(car,{x:pose.point.x,y:pose.point.y,loopAngle:angle,loopDirection:1,supportId:'island-cliff',
    speed,yaw:-Math.PI/2,pitch:angle,roll:0,pushX:0,pushZ:0,flipRemaining:0,
    vx:pose.tangent.x*speed,vy:pose.tangent.y*speed,vz:0});
}
/** Ground entry is the level tangent at the bottom, approached eastward. */
export function enterCliffFromGround(car:CliffCar,old:Point3,margin=1.3):boolean {
  const c=ISLAND_CLIFF;
  if(old.x>c.x||car.x<c.x||car.vx<=3||Math.abs(car.z-c.z)>c.width/2-margin||Math.abs(car.y)>.1)return false;
  const angle=clamp((car.x-c.x)/c.radius,0,c.maxAngle);
  enterCliff(car,angle);return true;
}
/** Fans attach only from the playable inner face; all other hits bounce. */
export function resolveCliffHit(car:CliffCar,hit:CliffHit,rocket:boolean):'attached'|'bounce' {
  if(rocket&&hit.inside){enterCliff(car,hit.angle);car.z=hit.z;return 'attached';}
  const n=hit.normal,dot=car.vx*n.x+car.vy*n.y,side=hit.inside?1:-1;
  car.x=hit.x+n.x*.01*side;car.y=hit.y+n.y*.01*side;car.z=hit.z;
  car.vx-=1.2*dot*n.x;car.vy-=1.2*dot*n.y;
  return 'bounce';
}
/** Expiry or a jump keeps the actual world velocity, not a reconstructed heading. */
export function detachCliff(car:CliffCar):void {
  if(car.supportId!=='island-cliff')return;
  car.supportId=null;car.loopAngle=null;car.pitchRate=0;car.flipRemaining=0;
}
/** Integrate along the authored arc, with gravity projected onto its tangent. */
export function advanceCliff(car:CliffCar,controls:{throttle:number;brake:boolean;acceleration:number;brakeDecel:number},dt:number,rocket:boolean):'supported'|'airborne'|'ground' {
  const c=ISLAND_CLIFF,angle=car.loopAngle;
  if(car.supportId!=='island-cliff'||angle===null)return 'airborne';
  if(!rocket&&angle>Math.PI/2){detachCliff(car);return 'airborne';}
  car.speed+=(controls.throttle*controls.acceleration-9.81*Math.sin(angle))*dt;
  if(controls.brake)car.speed=Math.sign(car.speed)*Math.max(0,Math.abs(car.speed)-controls.brakeDecel*dt);
  if(!controls.throttle)car.speed*=Math.exp(-.2*dt);
  car.speed=clamp(car.speed,-12,72);
  const next=angle+car.speed/c.radius*dt;
  const limit=rocket?c.maxAngle:Math.PI/2;
  const finalAngle=clamp(next,0,limit),pose=cliffPose(finalAngle);
  car.x=pose.point.x;car.y=pose.point.y;car.loopAngle=finalAngle;
  car.vx=pose.tangent.x*car.speed;car.vy=pose.tangent.y*car.speed;car.vz=0;
  car.yaw=-Math.PI/2;car.pitch=finalAngle;car.roll=0;car.pitchRate=car.speed/c.radius;car.yawRate=0;car.rollRate=0;
  if(next<=0){car.x+=next*c.radius;car.y=0;car.vy=0;car.pitch=0;car.pitchRate=0;car.loopAngle=null;car.supportId='ground';return 'ground';}
  if(next>=limit){detachCliff(car);return 'airborne';}
  return 'supported';
}

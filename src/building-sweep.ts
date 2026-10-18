import type { Entity } from '../shared/game';
import type { Building } from '../shared/map';
import { contact, dimensions } from '../shared/physics';

type Pose=Pick<Entity,'kind'|'x'|'z'|'yaw'|'pitch'|'roll'|'supportId'>;

// Returns true unless a vehicle's entire horizontal sweep is proved clear.
// Upright ground vehicles use shared rectangular bodies; other poses keep a
// conservative circle because pitch, roll and support can change the envelope.
export function buildingSweepBlocked(a:Pose,b:Pose,building:Building):boolean {
  const spec=dimensions(a.kind),halfDiagonal=Math.hypot(spec.width,spec.length)/2,radius=halfDiagonal+.5;
  const upright=a.supportId==='ground'&&b.supportId==='ground'&&Number.isFinite(a.yaw)&&Number.isFinite(b.yaw)&&
    a.pitch===0&&a.roll===0&&b.pitch===0&&b.roll===0;
  const delta=upright?Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw)):0;
  let extentX=radius,extentZ=radius;
  if(upright){
    const bound=halfDiagonal*Math.abs(delta)/2+.01;
    const x=(yaw:number)=>Math.abs(Math.cos(yaw))*spec.width/2+Math.abs(Math.sin(yaw))*spec.length/2;
    const z=(yaw:number)=>Math.abs(Math.sin(yaw))*spec.width/2+Math.abs(Math.cos(yaw))*spec.length/2;
    extentX=Math.min(radius,Math.max(x(a.yaw),x(b.yaw))+bound);
    extentZ=Math.min(radius,Math.max(z(a.yaw),z(b.yaw))+bound);
  }
  if(building.x+building.w/2<Math.min(a.x,b.x)-extentX||building.x-building.w/2>Math.max(a.x,b.x)+extentX||
    building.z+building.d/2<Math.min(a.z,b.z)-extentZ||building.z-building.d/2>Math.max(a.z,b.z)+extentZ)return false;
  if(!upright)return true;
  const distance=Math.hypot(b.x-a.x,b.z-a.z),obstacle={...building,yaw:0};
  // Each interval is enclosed by its midpoint body expanded by the maximum
  // translation and angular displacement of any corner. A disjoint shared
  // physics body proves the whole interval clear; uncertain leaves are blocked.
  const clear=(start:number,end:number,depth:number):boolean=>{
    const mid=(start+end)/2,span=(end-start)/2;
    const padding=span*(distance+halfDiagonal*Math.abs(delta))+.001;
    const enclosing={x:a.x+(b.x-a.x)*mid,z:a.z+(b.z-a.z)*mid,
      yaw:a.yaw+delta*mid,w:spec.width+2*padding,d:spec.length+2*padding};
    if(!contact(enclosing,obstacle))return true;
    return depth<8&&clear(start,mid,depth+1)&&clear(mid,end,depth+1);
  };
  return !clear(0,1,0);
}

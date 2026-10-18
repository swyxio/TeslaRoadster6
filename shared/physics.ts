import { VEHICLES, type VehicleId } from './vehicles';
export type Pose = {kind: VehicleId | 'person'; x:number;z:number;y:number;yaw:number};
export type Body = {x:number;z:number;w:number;d:number;yaw:number};
export function dimensions(kind: Pose['kind']) { return kind === 'person' ? {width:.7,length:.7,height:1.9,massKg:80} : VEHICLES[kind]; }
export function body(e:Pose):Body { const s=dimensions(e.kind);return {x:e.x,z:e.z,w:s.width,d:s.length,yaw:e.yaw}; }
/** Separating-axis test: normal points from A toward B; overlap in meters. */
export function contact(a:Body,b:Body):{nx:number;nz:number;depth:number}|null {
  if(Math.hypot(b.x-a.x,b.z-a.z)>(a.w+a.d+b.w+b.d)/2)return null;
  const axes=(q:Body)=>[[Math.cos(q.yaw),-Math.sin(q.yaw)],[-Math.sin(q.yaw),-Math.cos(q.yaw)]];
  const aa=axes(a),bb=axes(b);let depth=Infinity,nx=0,nz=0;
  for(const [x,z] of [...aa,...bb]) {
    const radius=(q:Body,axes:number[][])=>Math.abs(x*axes[0][0]+z*axes[0][1])*q.w/2+Math.abs(x*axes[1][0]+z*axes[1][1])*q.d/2;
    const distance=(b.x-a.x)*x+(b.z-a.z)*z;
    const overlap=radius(a,aa)+radius(b,bb)-Math.abs(distance);
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;const sign=distance<0?-1:1;nx=x*sign;nz=z*sign;}
  }
  return {nx,nz,depth};
}

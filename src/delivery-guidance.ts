import type { Entity } from '../shared/game';
import type { Level } from '../shared/delivery';
import type { Point } from '../shared/traffic';

type Vehicle = Pick<Entity, 'x' | 'z' | 'yaw' | 'kind' | 'supportId' | 'inDome'>;
export type GuidanceRequest = { id:number; car:Vehicle; destination:Point; level:Level };
export type GuidanceResponse = { id:number; path:Point[] | null };
export type Guidance = { waypoint:Point | null; status:'ready' | 'routing' | 'unavailable' | 'flight' };

const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.z-b.z);
function segmentDistance(p:Point,a:Point,b:Point):number {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}

/** Follow the current road route, replanning after a missed turn or target change. */
export class DeliveryGuidance {
  private key='';
  private requestId=0;
  private pending=false;
  private requestedAt=-Infinity;
  private requestedFrom:Point={x:0,z:0};
  private requestedYaw=0;
  private path:Point[]=[];
  private origin:Point={x:0,z:0};
  private headingAnchor:(Point & {yaw:number})|null=null;
  private index=0;
  private failed=false;
  private workerUnavailable=false;
  constructor(private readonly request:(request:GuidanceRequest)=>void) {}

  workerFailed():void {
    this.workerUnavailable=true;this.requestId++;this.pending=false;this.path=[];
  }

  receive(result:GuidanceResponse):void {
    if(result.id!==this.requestId)return;
    this.pending=false;
    this.failed=!result.path?.length;
    this.path=result.path??[];
    this.origin=this.requestedFrom;
    this.headingAnchor={...this.requestedFrom,yaw:this.requestedYaw};
    this.index=0;
  }

  update(car:Vehicle,destination:Point & {rooftop?:boolean},level:Level,now:number):Guidance {
    if(destination.rooftop||car.supportId===null){
      this.key='';this.requestId++;this.pending=false;this.path=[];
      return {waypoint:destination,status:'flight'};
    }
    if(car.supportId!=='ground'||this.workerUnavailable){
      this.key='';this.requestId++;this.pending=false;this.path=[];
      return {waypoint:null,status:'unavailable'};
    }
    const key=`${destination.x}:${destination.z}:${level}:${car.kind}`;
    if(key!==this.key){
      this.key=key;this.requestId++;this.pending=false;this.requestedAt=-Infinity;this.path=[];this.failed=false;
    }
    if(this.path.length&&this.headingAnchor){
      if(distance(car,this.headingAnchor)>8)this.headingAnchor={x:car.x,z:car.z,yaw:car.yaw};
      else if(Math.cos(car.yaw-this.headingAnchor.yaw)<-.7){
        this.path=[];this.failed=false;this.requestedAt=-Infinity;
      }
    }
    while(this.index<this.path.length-1){
      const waypoint=this.path[this.index],next=this.path[this.index+1];
      if(distance(car,waypoint)>8&&segmentDistance(car,waypoint,next)>7)break;
      this.index++;
    }
    if(this.path.length){
      const start=this.index?this.path[this.index-1]:this.origin,waypoint=this.path[this.index],next=this.path[this.index+1];
      if(segmentDistance(car,start,waypoint)>25&&(!next||segmentDistance(car,waypoint,next)>12)){
        this.path=[];this.failed=false;this.requestedAt=-Infinity;
      }
    }
    if(!this.path.length&&!this.pending&&now-this.requestedAt>=3000){
      this.pending=true;this.requestedAt=now;this.requestedFrom={x:car.x,z:car.z};this.requestedYaw=car.yaw;
      const vehicle=car.kind==='person'?{...car,kind:'model-3' as const}:car;
      this.request({id:++this.requestId,car:vehicle,destination:{x:destination.x,z:destination.z},level});
    }
    const waypoint=this.path[this.index];
    return waypoint?{waypoint:this.index===this.path.length-1&&distance(car,destination)<10?destination:waypoint,status:'ready'}:
      {waypoint:null,status:this.failed&&!this.pending?'unavailable':'routing'};
  }
}

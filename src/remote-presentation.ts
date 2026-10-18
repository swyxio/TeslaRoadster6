import type { Entity, World } from '../shared/game';
import { DOME } from '../shared/dome';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';
import { DOME_PERIMETER, MAP_BOUNDS, OVERPASS, STUNT_LOOP, STUNT_RAMP, nearbyBuildings, terrainHeight } from '../shared/map';
import { ovalBankSurface } from '../shared/oval-bank';
import { contact, dimensions } from '../shared/physics';

// Snapshots normally arrive every two 50 ms room ticks. Keep enough history
// for a delayed playback clock without retaining an unbounded room history.
const HISTORY=8;
const MAX_GAP_TICKS=10;
const MAX_DELAY_TICKS=4;
const MAX_EXTRAPOLATION_TICKS=2;
const TICK_SECONDS=.05;

type Pose=Pick<Entity,'kind'|'driver'|'owner'|'supportId'|'inDome'|'health'|
  'x'|'y'|'z'|'yaw'|'pitch'|'roll'|'steering'|'vx'|'vy'|'vz'|
  'yawRate'|'pitchRate'|'rollRate'|'loopAngle'|'domeS'> & {since:number};
type Frame={tick:number;poses:Map<string,Pose>};

function sameEntity(a:Pose,e:Entity):boolean {
  return a.kind===e.kind&&a.driver===e.driver&&a.owner===e.owner&&
    a.supportId===e.supportId&&a.inDome===e.inDome;
}
function angle(a:number,b:number,t:number):number {
  return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
}
function perimeter(a:number,b:number,t:number):number {
  const delta=((b-a+DOME_PERIMETER/2)%DOME_PERIMETER+DOME_PERIMETER)%DOME_PERIMETER-DOME_PERIMETER/2;
  return ((a+delta*t)%DOME_PERIMETER+DOME_PERIMETER)%DOME_PERIMETER;
}

// Each interval is enclosed by the midpoint body expanded by the greatest
// possible centre translation and rotation of any corner. A disjoint shared
// physics body proves the entire interval clear, not just the sample itself.
// Subdivision can only reduce false positives; uncertain intervals stay blocked.
function buildingSweepClear(a:Pose,b:Pick<Entity,'x'|'z'|'yaw'>,building:ReturnType<typeof nearbyBuildings>[number]):boolean {
  const spec=dimensions(a.kind),delta=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));
  const distance=Math.hypot(b.x-a.x,b.z-a.z),halfDiagonal=Math.hypot(spec.width,spec.length)/2;
  const obstacle={...building,yaw:0};
  const clear=(start:number,end:number,depth:number):boolean=>{
    const mid=(start+end)/2,span=(end-start)/2;
    const padding=span*(distance+halfDiagonal*Math.abs(delta))+.001;
    const enclosing={x:a.x+(b.x-a.x)*mid,z:a.z+(b.z-a.z)*mid,
      yaw:a.yaw+delta*mid,w:spec.width+2*padding,d:spec.length+2*padding};
    if(!contact(enclosing,obstacle))return true;
    return depth<8&&clear(start,mid,depth+1)&&clear(mid,end,depth+1);
  };
  return clear(0,1,0);
}

// Interpolated or extrapolated remote poses must not pass through a solid or
// cross a ground-to-water boundary. Conservative bounds deliberately cut to
// the latest authoritative pose near complex surfaces.
function clearPath(a:Pose,b:Pick<Entity,'x'|'y'|'z'>&Partial<Pick<Entity,'yaw'|'pitch'|'roll'>>):boolean {
  const distance=Math.hypot(b.x-a.x,b.z-a.z);
  // A corrupt coordinate or a teleport must cut, never turn the sample loop
  // into an unbounded per-frame traversal.
  if(!Number.isFinite(distance)||distance>100||!Number.isFinite(a.y)||!Number.isFinite(b.y))return false;
  const spec=dimensions(a.kind),radius=Math.hypot(spec.width,spec.length)/2+.5;
  const minX=Math.min(a.x,b.x)-radius,maxX=Math.max(a.x,b.x)+radius;
  const minZ=Math.min(a.z,b.z)-radius,maxZ=Math.max(a.z,b.z)+radius;
  // Allow for a rotated vehicle extending below its pivot or above its roof.
  const minY=Math.min(a.y,b.y)-radius,maxY=Math.max(a.y,b.y)+spec.height+radius;
  if(minX<MAP_BOUNDS.minX||maxX>MAP_BOUNDS.maxX||minZ<MAP_BOUNDS.minZ||maxZ>MAP_BOUNDS.maxZ)return false;
  const overlaps=(left:number,right:number,near:number,far:number)=>right>=minX&&left<=maxX&&far>=minZ&&near<=maxZ;
  const midX=(a.x+b.x)/2,midZ=(a.z+b.z)/2;
  // A ground car's yaw-swept rectangle is narrower than its circumcircle
  // beside a parallel wall. Each intermediate angle is at most half the
  // yaw interval from one endpoint; the half diagonal bounds how fast each
  // projected extent can change. Keep the circle for tilted or unknown poses.
  let buildingX=radius,buildingZ=radius;
  if(a.supportId==='ground'&&Number.isFinite(b.yaw)&&a.pitch===0&&a.roll===0&&b.pitch===0&&b.roll===0){
    const yaw=b.yaw!,delta=Math.abs(Math.atan2(Math.sin(yaw-a.yaw),Math.cos(yaw-a.yaw)));
    const halfDiagonal=Math.hypot(spec.width,spec.length)/2;
    const bound=halfDiagonal*delta/2+.01;
    const extentX=(heading:number)=>Math.abs(Math.cos(heading))*spec.width/2+Math.abs(Math.sin(heading))*spec.length/2;
    const extentZ=(heading:number)=>Math.abs(Math.sin(heading))*spec.width/2+Math.abs(Math.cos(heading))*spec.length/2;
    buildingX=Math.min(radius,Math.max(extentX(a.yaw),extentX(yaw))+bound);
    buildingZ=Math.min(radius,Math.max(extentZ(a.yaw),extentZ(yaw))+bound);
  }
  const overlapsBuilding=(left:number,right:number,near:number,far:number)=>
    right>=Math.min(a.x,b.x)-buildingX&&left<=Math.max(a.x,b.x)+buildingX&&
    far>=Math.min(a.z,b.z)-buildingZ&&near<=Math.max(a.z,b.z)+buildingZ;
  if(nearbyBuildings(midX,midZ,Math.hypot(maxX-minX,maxZ-minZ)/2).some(building=>{
    const roof=building.style==='rotunda'?Math.max(building.h,23):
      building.style==='salesforce'||building.style==='coit'?building.h+building.w*.46*.38:building.h;
    if(minY>=roof||maxY<=0||!overlapsBuilding(building.x-building.w/2,building.x+building.w/2,building.z-building.d/2,building.z+building.d/2))return false;
    return a.supportId!=='ground'||!Number.isFinite(b.yaw)||a.pitch!==0||a.roll!==0||b.pitch!==0||b.roll!==0||
      !buildingSweepClear(a,{x:b.x,z:b.z,yaw:b.yaw!},building);
  }))return false;
  if(maxY>=0&&(
    minY<=OVERPASS.height&&overlaps(OVERPASS.start,OVERPASS.end,OVERPASS.z-OVERPASS.width/2,OVERPASS.z+OVERPASS.width/2)||
    minY<=STUNT_RAMP.height&&overlaps(STUNT_RAMP.start,STUNT_RAMP.end,STUNT_RAMP.z-STUNT_RAMP.width/2,STUNT_RAMP.z+STUNT_RAMP.width/2)||
    ISLAND_JUMPS.some(jump=>minY<=jump.height&&overlaps(jump.start,jump.end,jump.z-jump.width/2,jump.z+jump.width/2))||
    minY<=5&&overlaps(ISLAND_BANK.startX,ISLAND_BANK.endX,ISLAND_BANK.z-ISLAND_BANK.halfWidth,ISLAND_BANK.z+ISLAND_BANK.halfWidth)||
    minY<=2*ISLAND_CLIFF.radius&&overlaps(ISLAND_CLIFF.x-ISLAND_CLIFF.radius,ISLAND_CLIFF.x+ISLAND_CLIFF.radius,ISLAND_CLIFF.z-ISLAND_CLIFF.width/2,ISLAND_CLIFF.z+ISLAND_CLIFF.width/2)||
    minY<=2*STUNT_LOOP.radius&&overlaps(STUNT_LOOP.x-STUNT_LOOP.radius,STUNT_LOOP.x+STUNT_LOOP.radius,STUNT_LOOP.z-STUNT_LOOP.width/2,STUNT_LOOP.z+STUNT_LOOP.width/2)||
    minY<=2*DOME.radius&&overlaps(DOME.x-DOME.halfLength,DOME.x+DOME.halfLength,DOME.z-DOME.flatHalfWidth-DOME.radius,DOME.z+DOME.flatHalfWidth+DOME.radius)
  ))return false;
  const count=Math.max(1,Math.ceil(distance));
  for(let i=0;i<=count;i++){
    const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    const terrain=terrainHeight(x,z);
    if(terrain===null?(a.supportId==='ground'||y<=0):y<terrain-.001)return false;
    if(minY<=5&&ovalBankSurface(x,z))return false;
  }
  return true;
}
function continuous(previous:Pose,e:Entity,dtTicks:number):boolean {
  if(dtTicks<=0||dtTicks>MAX_GAP_TICKS||!sameEntity(previous,e)||previous.health!==e.health)return false;
  const speed=Math.max(Math.hypot(previous.vx,previous.vy,previous.vz),Math.hypot(e.vx,e.vy,e.vz));
  // Allow the game's 80 m/s flight and modest acceleration, but do not draw
  // a car along a recovery, room action or other implausible relocation.
  return Math.hypot(e.x-previous.x,e.y-previous.y,e.z-previous.z)<=Math.max(8,speed*dtTicks*TICK_SECONDS+6)&&clearPath(previous,e);
}
function capture(e:Entity,since:number):Pose {
  return {kind:e.kind,driver:e.driver,owner:e.owner,supportId:e.supportId,inDome:e.inDome,health:e.health,
    x:e.x,y:e.y,z:e.z,yaw:e.yaw,pitch:e.pitch,roll:e.roll,steering:e.steering,
    vx:e.vx,vy:e.vy,vz:e.vz,yawRate:e.yawRate,pitchRate:e.pitchRate,rollRate:e.rollRate,
    loopAngle:e.loopAngle,domeS:e.domeS,since};
}
function blend(e:Entity,a:Pose,b:Pose,t:number):Entity {
  const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
  const yaw=angle(a.yaw,b.yaw,t),pitch=angle(a.pitch,b.pitch,t),roll=angle(a.roll,b.roll,t);
  const steering=a.steering+(b.steering-a.steering)*t;
  const loopAngle=a.loopAngle===null||b.loopAngle===null?e.loopAngle:angle(a.loopAngle,b.loopAngle,t);
  const domeS=a.domeS===null||b.domeS===null?e.domeS:perimeter(a.domeS,b.domeS,t);
  if(x===e.x&&y===e.y&&z===e.z&&yaw===e.yaw&&pitch===e.pitch&&roll===e.roll&&
    steering===e.steering&&loopAngle===e.loopAngle&&domeS===e.domeS)return e;
  return {...e,x,y,z,yaw,pitch,roll,steering,loopAngle,domeS};
}
function extrapolate(e:Entity,pose:Pose,ticks:number):Entity {
  // Special moving surfaces need their own support coordinates. Hold them
  // after the latest sample instead of guessing a path off the surface.
  if(pose.supportId!==null&&pose.supportId!=='ground')return e;
  const seconds=Math.min(MAX_EXTRAPOLATION_TICKS,Math.max(0,ticks))*TICK_SECONDS;
  const x=pose.x+pose.vx*seconds,y=pose.y+pose.vy*seconds,z=pose.z+pose.vz*seconds;
  const yaw=pose.yaw+pose.yawRate*seconds,pitch=pose.pitch+pose.pitchRate*seconds,roll=pose.roll+pose.rollRate*seconds;
  if(!clearPath(pose,{x,y,z,yaw,pitch,roll}))return e;
  if(x===e.x&&y===e.y&&z===e.z&&yaw===e.yaw&&pitch===e.pitch&&roll===e.roll)return e;
  return {...e,x,y,z,yaw,pitch,roll};
}

/** Validate a forecast against the same static geometry as remote playback. */
export function remotePathClear(from:Entity,to:Entity):boolean {
  return sameEntity(capture(from,0),to)&&from.health===to.health&&clearPath(capture(from,0),to);
}

/** Snapshot interpolation for presentation only. It never mutates room state. */
export class RemotePresentation {
  private frames:Frame[]=[];
  private localPlayerId='';
  get ready():boolean {return this.frames.length>=2;}

  reset():void {this.frames=[];this.localPlayerId='';}

  snapshot(world:World,localPlayerId:string,tick:number):void {
    if(!Number.isSafeInteger(tick)||tick<0)return;
    if(this.localPlayerId!==localPlayerId){this.reset();this.localPlayerId=localPlayerId;}
    const last=this.frames.at(-1);
    if(last&&tick<last.tick)return;
    // Replace duplicate ticks without creating a zero-length interval.
    if(last&&tick===last.tick)this.frames.pop();
    const previous=this.frames.at(-1);
    const localEntity=world.players.find(player=>player.id===localPlayerId)?.entityId;
    const poses=new Map<string,Pose>();
    for(const entity of world.entities){
      if(entity.id===localEntity||entity.driver===localPlayerId)continue;
      const old=previous?.poses.get(entity.id);
      const since=old&&continuous(old,entity,tick-previous!.tick)?old.since:tick;
      poses.set(entity.id,capture(entity,since));
    }
    this.frames.push({tick,poses});
    if(this.frames.length>HISTORY)this.frames.shift();
  }

  render(world:World,localPlayerId:string,playbackTick:number|null):World {
    const frames=this.frames,last=frames.at(-1);
    if(!last||this.localPlayerId!==localPlayerId||playbackTick===null||!Number.isFinite(playbackTick))return world;
    const localEntity=world.players.find(player=>player.id===localPlayerId)?.entityId;
    // A stalled playback clock must not leave visible cars arbitrarily far
    // behind snapshots that continue to arrive.
    const at=Math.max(playbackTick,last.tick-MAX_DELAY_TICKS);
    let before=frames[0],after=frames[0];
    if(at>=last.tick)before=after=last;
    else for(let i=1;i<frames.length;i++){
      after=frames[i];
      if(at<=after.tick)break;
      before=after;
    }
    const t=before===after?0:Math.max(0,Math.min(1,(at-before.tick)/(after.tick-before.tick)));
    let presented:Entity[]|undefined;
    for(let i=0;i<world.entities.length;i++){
      const entity=world.entities[i];
      // The local prediction and ferry hull each own their presentation frame.
      if(entity.id===localEntity||entity.driver===localPlayerId||entity.supportId==='ferry')continue;
      const latest=last.poses.get(entity.id);
      if(!latest||!sameEntity(latest,entity))continue;
      let shown=entity;
      if(at>last.tick){
        // Do not extrapolate a newly appeared or discontinuous entity.
        if(latest.since<last.tick)shown=extrapolate(entity,latest,at-last.tick);
      }else{
        const a=before.poses.get(entity.id),b=after.poses.get(entity.id);
        if(a&&b&&a.since===latest.since&&b.since===latest.since)shown=blend(entity,a,b,t);
      }
      if(shown!==entity){presented??=world.entities.slice();presented[i]=shown;}
    }
    return presented?{...world,entities:presented}:world;
  }
}

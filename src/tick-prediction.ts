import { NEUTRAL, THRUSTER_REAR, THRUSTER_DOWN_LEFT, THRUSTER_DOWN_RIGHT, simulationSubsteps, step, type Entity, type Input, type World } from '../shared/game';
import { ScheduledInput, type ControlSnapshot, type InputCommand } from '../shared/tick-input';
import { dimensions } from '../shared/physics';
import { DOME } from '../shared/dome';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';
import { OVERPASS, STUNT_LOOP, STUNT_RAMP, isSurface, nearbyBuildings, terrainHeight } from '../shared/map';
import { sweepIslandJumpWall } from '../shared/island-jumps';
import { requiredLevelAt } from '../shared/delivery';
import { hasRockets } from '../shared/upgrades';
import { VEHICLES } from '../shared/vehicles';
import { presentationTransitionPathClear, projectGroundOval, projectedGroundOvalPathClear, remotePathClear } from './remote-presentation';
import { buildingSweepBlocked } from './building-sweep';

const TICK=.05;
const MAX_HISTORY=64;
const MAX_SNAPSHOT_AGE_MS=500;

function driven(world:World,id:string):Entity|undefined {
  const player=world.players.find(item=>item.id===id);
  return world.entities.find(item=>item.id===player?.entityId&&item.driver===id);
}

function angle(a:number,b:number,alpha:number):number {
  return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*alpha;
}

function interpolate(a:Entity,b:Entity,alpha:number):Entity {
  return {...b,
    x:a.x+(b.x-a.x)*alpha,y:a.y+(b.y-a.y)*alpha,z:a.z+(b.z-a.z)*alpha,
    yaw:angle(a.yaw,b.yaw,alpha),pitch:angle(a.pitch,b.pitch,alpha),roll:angle(a.roll,b.roll,alpha),
    steering:a.steering+(b.steering-a.steering)*alpha,
  };
}

// Shared physics supplies the endpoints; render each supported intermediate
// pose on the same terrain used by the simulation.
function sampleSupported(entity:Entity):Entity {
  return projectGroundOval(entity)??entity;
}
function isGroundSupported(entity:Entity):boolean {
  return entity.supportId==='ground'||entity.supportId==='island-oval';
}
function sampleBetween(a:Entity,b:Entity,alpha:number):Entity {
  const sampled=interpolate(a,b,alpha);
  if(isGroundSupported(a)&&isGroundSupported(b))return sampleSupported(sampled);
  if(a.supportId===null&&isGroundSupported(b)||isGroundSupported(a)&&b.supportId===null)
    return {...sampled,supportId:alpha<=0?a.supportId:alpha>=1?b.supportId:null};
  return sampled;
}
function presentationPathClear(from:Entity,to:Entity):boolean {
  if(isGroundSupported(from)&&isGroundSupported(to))return projectedGroundOvalPathClear(from,to);
  if(from.supportId===null||to.supportId===null)return presentationTransitionPathClear(from,to);
  return remotePathClear(from,to);
}

// Static safety for a render-only correction. Dynamic contacts remain
// authoritative and do not suppress presentation.
function correctionClear(from:Entity,to:Entity):boolean {
  if(from.id!==to.id||from.health!==to.health)return false;
  const projected=isGroundSupported(from)&&isGroundSupported(to);
  if(projected&&!projectedGroundOvalPathClear(from,to))return false;
  const distance=Math.hypot(from.x-to.x,from.y-to.y,from.z-to.z);
  if(distance>12)return false;
  const spec=dimensions(to.kind),radius=Math.hypot(spec.width,spec.length)/2+.5;
  const midX=(from.x+to.x)/2,midZ=(from.z+to.z)/2;
  const minX=Math.min(from.x,to.x)-radius,maxX=Math.max(from.x,to.x)+radius;
  const minZ=Math.min(from.z,to.z)-radius,maxZ=Math.max(from.z,to.z)+radius;
  const overlaps=(left:number,right:number,near:number,far:number)=>right>=minX&&left<=maxX&&far>=minZ&&near<=maxZ;
  const crossesRampEnd=(from.x-STUNT_RAMP.end)*(to.x-STUNT_RAMP.end)<=0&&Math.min(from.y,to.y)<STUNT_RAMP.height;
  if(overlaps(STUNT_RAMP.start,STUNT_RAMP.end,STUNT_RAMP.z-STUNT_RAMP.width/2,STUNT_RAMP.z+STUNT_RAMP.width/2)&&
    (crossesRampEnd||from.supportId!==to.supportId))return false;
  if(overlaps(OVERPASS.start,OVERPASS.end,OVERPASS.z-OVERPASS.width/2,OVERPASS.z+OVERPASS.width/2)&&
    Math.min(from.y,to.y)<OVERPASS.height+radius&&Math.max(from.y,to.y)+spec.height>-radius)return false;
  if(from.supportId!==to.supportId&&(
    overlaps(OVERPASS.start,OVERPASS.end,OVERPASS.z-OVERPASS.width/2,OVERPASS.z+OVERPASS.width/2)||
    overlaps(ISLAND_BANK.startX,ISLAND_BANK.endX,ISLAND_BANK.z-ISLAND_BANK.halfWidth,ISLAND_BANK.z+ISLAND_BANK.halfWidth)||
    overlaps(ISLAND_CLIFF.x-ISLAND_CLIFF.radius,ISLAND_CLIFF.x+ISLAND_CLIFF.radius,ISLAND_CLIFF.z-ISLAND_CLIFF.width/2,ISLAND_CLIFF.z+ISLAND_CLIFF.width/2)||
    overlaps(STUNT_LOOP.x-STUNT_LOOP.radius,STUNT_LOOP.x+STUNT_LOOP.radius,STUNT_LOOP.z-STUNT_LOOP.width/2,STUNT_LOOP.z+STUNT_LOOP.width/2)||
    overlaps(DOME.x-DOME.halfLength,DOME.x+DOME.halfLength,DOME.z-DOME.flatHalfWidth-DOME.radius,DOME.z+DOME.flatHalfWidth+DOME.radius)))return false;
  if(nearbyBuildings(midX,midZ,Math.hypot(maxX-minX,maxZ-minZ)/2).some(b=>{
    const roof=b.style==='rotunda'?Math.max(b.h,23):b.style==='salesforce'||b.style==='coit'?b.h+b.w*.46*.38:b.h;
    return Math.min(from.y,to.y)<roof&&buildingSweepBlocked(from,to,b);
  }))return false;
  const extent={halfWidth:spec.width/2,halfLength:spec.length/2,yaw:to.yaw,
    minY:-radius,maxY:spec.height+radius};
  if(sweepIslandJumpWall(from,to,extent)||sweepIslandJumpWall(to,from,extent))return false;
  const count=Math.max(1,Math.ceil(distance));
  const level=requiredLevelAt(from.x,from.z);
  for(let i=0;i<=count;i++){
    const x=from.x+(to.x-from.x)*i/count,z=from.z+(to.z-from.z)*i/count,y=from.y+(to.y-from.y)*i/count;
    const terrain=terrainHeight(x,z);
    if(!projected&&terrain!==null&&y<terrain-.001)return false;
    if((from.supportId==='ground'||to.supportId==='ground')&&(!isSurface(x,z)||requiredLevelAt(x,z)!==level))return false;
  }
  return true;
}

type Offset={x:number;y:number;z:number;yaw:number;pitch:number;roll:number};
type RescheduledEdge={kind:'jump'|'flip';id:number;targetTick:number;actionSeq:number;controlRevision:number};
type Segment={target:number;previous:Entity;next:Entity;peersBefore:Map<string,Entity>;peersAfter:Map<string,Entity>;unsafePeers:Set<string>};
type PeerObservation={tick:number;kind:Entity['kind'];driver:string|null;supportId:Entity['supportId'];health:number;speed:number};

// Infer a short-lived visual proxy input from consecutive confirmed speeds.
// It is never sent to the room and is discarded at each fresh snapshot.
function peerInput(entity:Entity,previous:PeerObservation,tick:number):Input|null {
  const dt=(tick-previous.tick)*TICK;
  if(!entity.driver||entity.autopilot||entity.kind==='person'||
    previous.kind!==entity.kind||previous.driver!==entity.driver||previous.supportId!==entity.supportId||
    previous.health!==entity.health||dt<=0||dt>.5)return null;
  if(entity.supportId===null&&hasRockets(entity)){
    // The snapshot exposes thruster activity, allowing a bounded estimate of
    // sustained powered flight without inventing an authoritative input.
    const down=THRUSTER_DOWN_LEFT|THRUSTER_DOWN_RIGHT;
    return {...NEUTRAL,throttle:entity.thrusters&THRUSTER_REAR?1:0,
      hover:(entity.thrusters&down)===down,steer:Math.max(-1,Math.min(1,entity.yawRate/1.6)),
      jump:entity.lastJump,flip:entity.lastFlip};
  }
  if(entity.supportId!=='ground')return null;
  const spec=VEHICLES[entity.kind],motor=entity.upgrades.motor?1.25:1;
  const acceleration=(entity.speed-previous.speed)/dt;
  let throttle:number,boost=false;
  if(acceleration*entity.speed<-.01)throttle=Math.sign(acceleration)*Math.min(1,Math.abs(acceleration)/spec.brakeDecel);
  else {
    boost=hasRockets(entity)&&Math.abs(acceleration)>spec.acceleration*motor+1;
    const thrust=(boost?45.46:spec.acceleration)*motor;
    const drag=hasRockets(entity)?0:.12*entity.speed;
    throttle=Math.max(-1,Math.min(1,(acceleration+drag)/thrust));
    if(throttle===0&&Math.abs(entity.speed)>.01)throttle=Math.sign(entity.speed)*Number.EPSILON;
  }
  return {...NEUTRAL,throttle,boost,steer:entity.steering,jump:entity.lastJump,flip:entity.lastFlip};
}
function newer(id:number,previous:number):boolean {
  const delta=(id-previous+2**31)%2**31;
  return delta>0&&delta<2**30;
}

/** Presentation-only fixed-tick replay. The supplied world is never mutated. */
export class TickPrediction {
  private world:World|null=null;
  private playerId='';
  private tick=0;
  private control:ControlSnapshot|null=null;
  private poseRevision=0;
  private substeps=1;
  private snapshotAt=0;
  private pending:InputCommand[]=[];
  private suppressed={jump:new Set<number>(),flip:new Set<number>()};
  private rescheduled:RescheduledEdge[]=[];
  private peerObservations=new Map<string,PeerObservation>();
  private peerInputs=new Map<string,Input>();
  private overflow=false;
  private unsafeReplay=false;
  private snap=false;
  private cameraSnap=false;
  private invalidated=true;
  private segment:Segment|null=null;
  private cache:{target:number;simulation:World;scheduler:ScheduledInput;pendingCount:number;next:Entity;unsafePeers:Set<string>}|null=null;
  private rebase=false;
  private presented:Entity|null=null;
  private presentedWorld:World|null=null;
  private presentedAt=0;
  private presentedTick:number|null=null;
  private presentationHeld=false;
  private peerOffsets=new Map<string,Offset>();
  private peerRebase=false;
  private offset:Offset={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};

  reset():void {
    this.world=null;this.playerId='';this.tick=0;this.control=null;this.substeps=1;this.snapshotAt=0;
    this.pending=[];this.suppressed={jump:new Set(),flip:new Set()};this.rescheduled=[];this.peerObservations.clear();this.peerInputs.clear();this.poseRevision=0;this.overflow=false;this.unsafeReplay=false;this.snap=false;this.cameraSnap=false;this.invalidated=true;
    this.segment=null;this.cache=null;this.rebase=false;this.presented=null;this.presentedWorld=null;this.presentedAt=0;this.presentedTick=null;this.presentationHeld=false;this.peerOffsets.clear();this.peerRebase=false;
    this.offset={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};
  }

  takeSnap():boolean {const value=this.snap;this.snap=false;return value;}
  takeCameraSnap():boolean {const value=this.cameraSnap;this.cameraSnap=false;return value;}

  snapshot(world:World,id:string,tick:number,control:ControlSnapshot,poseRevision:number,substeps:number,now:number):void {
    // A backgrounded tab may not render during a stall at all. Its last
    // visible pose was still held, even if renderWorld never observed it.
    if(this.presented&&now-this.presentedAt>MAX_SNAPSHOT_AGE_MS)this.presentationHeld=true;
    const prior=this.world&&driven(this.world,this.playerId),current=driven(world,id);
    const revisionChanged=!!this.control&&control.revision!==this.control.revision;
    const relocated=!!this.control&&poseRevision!==this.poseRevision;
    const identityChanged=!!this.playerId&&(!prior||!current||prior.id!==current.id||prior.kind!==current.kind);
    if(identityChanged||relocated){this.snap=true;this.cameraSnap=true;this.presented=null;this.presentedWorld=null;this.presentedTick=null;this.peerOffsets.clear();this.offset={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};}
    // A control revision invalidates old queued input. It may also represent
    // an autopilot change, so it is not by itself proof of a teleport.
    if(revisionChanged)this.invalidated=true;
    this.pending=this.pending.filter(command=>command.seq>control.receivedSeq&&
      command.actionSeq>=control.actionSeq&&command.controlRevision>=control.edgeFloorRevision);
    for(const kind of ['jump','flip'] as const)for(const id of this.suppressed[kind]){
      const delta=(control[kind].seen-id+2**31)%2**31;
      if(delta<2**30)this.suppressed[kind].delete(id);
    }
    this.rescheduled=this.rescheduled.filter(edge=>edge.actionSeq===control.actionSeq&&
      edge.controlRevision>=control.edgeFloorRevision&&newer(edge.id,control[edge.kind].seen));
    const observations=new Map<string,PeerObservation>(),inputs=new Map<string,Input>();
    for(const entity of world.entities){
      if(entity.driver===id)continue;
      const previous=this.peerObservations.get(entity.id),input=previous&&peerInput(entity,previous,tick);
      if(input&&entity.driver)inputs.set(entity.driver,input);
      observations.set(entity.id,{tick,kind:entity.kind,driver:entity.driver,supportId:entity.supportId,health:entity.health,speed:entity.speed});
    }
    this.peerObservations=observations;this.peerInputs=inputs;
    this.world=world;this.playerId=id;this.tick=tick;this.control=control;this.poseRevision=poseRevision;this.overflow=false;this.unsafeReplay=false;
    this.substeps=Math.max(1,Math.min(8,substeps));this.snapshotAt=now;
    this.segment=null;this.cache=null;this.rebase=!!this.presented&&!identityChanged&&!relocated;this.peerRebase=true;
  }

  input(command:InputCommand):void {
    if(!this.control||command.controlRevision<this.control.edgeFloorRevision||
      command.actionSeq<this.control.actionSeq||this.overflow)return;
    this.pending.push({...command,input:{...command.input}});
    if(this.pending.length>MAX_HISTORY){this.pending=[];this.segment=null;this.overflow=true;return;}
    this.invalidated=true;
  }

  reject(seq:number):void {
    const command=this.pending.find(item=>item.seq===seq);
    if(!command||!this.control)return;
    for(const kind of ['jump','flip'] as const){
      const id=command.input[kind];
      if(id!==this.control[kind].seen&&!this.pending.some(item=>item.seq<seq&&item.input[kind]===id))this.suppressed[kind].add(id);
    }
    this.pending=this.pending.filter(item=>item.seq!==seq);this.cache=null;this.invalidated=true;
  }

  edgeOutcome(kind:'jump'|'flip',id:number,status:'accepted'|'rescheduled'|'processed'|'expired'|'superseded',targetTick:number):void {
    if(!this.control)return;
    if((status==='accepted'||status==='rescheduled')&&newer(id,this.control[kind].seen)){
      this.suppressed[kind].add(id);
      this.rescheduled=this.rescheduled.filter(edge=>edge.kind!==kind||edge.id!==id);
      const command=[...this.pending].reverse().find(item=>item.input[kind]===id);
      this.rescheduled.push({kind,id,targetTick,actionSeq:command?.actionSeq??this.control.actionSeq,
        controlRevision:command?.controlRevision??this.control.revision});
    }else if(status==='expired'||status==='superseded'){
      if(newer(id,this.control[kind].seen))this.suppressed[kind].add(id);
      this.rescheduled=this.rescheduled.filter(edge=>edge.kind!==kind||edge.id!==id);
    }
    this.cache=null;this.invalidated=true;
  }

  renderWorld(now:number,target:number|null,estimate:number|null,phase?:number|null,display?:World,coTimedPeers=true):World|null {
    const world=this.world;
    if(!world||!this.control)return null;
    const shown=display??world;
    // Ferry motion is drawn with the deck itself in GameScene. Predicting the
    // passenger independently would place it ahead of the displayed hull.
    if(driven(world,this.playerId)?.supportId==='ferry')return null;
    // Freeze the last rendered pose during a stall instead of rewinding to a
    // stale snapshot. Resume from fresh authority when the connection recovers.
    if(this.unsafeReplay){this.presentationHeld=!!this.presented;return this.heldWorld(shown);}
    if(this.overflow||target===null||estimate===null||now-this.snapshotAt>MAX_SNAPSHOT_AGE_MS){
      this.presentationHeld=!!this.presented;
      return this.heldWorld(shown);
    }
    if(this.invalidated||!this.segment||this.segment.target!==target){
      const hadSegment=!!this.segment;
      this.replay(target,now);
      // A new command or clock target may change the replayed path before the
      // next snapshot. Preserve continuity at that boundary as well.
      if(hadSegment&&this.presented)this.rebase=true;
    }
    if(!this.segment){
      if(this.unsafeReplay){this.presentationHeld=!!this.presented;return this.heldWorld(shown);}
      this.presentationHeld=!!this.presented;
      return this.heldWorld(shown);
    }
    const alpha=Math.max(0,Math.min(1,phase??estimate-Math.floor(estimate)));
    const onGround=isGroundSupported(this.segment.previous)&&isGroundSupported(this.segment.next);
    const goal=sampleBetween(this.segment.previous,this.segment.next,alpha);
    const presentationTick=target-1+alpha;
    // Match the clock used to interpolate the replay; bound abrupt clock
    // jumps to the clock's normal 1.5x slew and never advance a held pose.
    const elapsed=this.presentationHeld||this.presentedTick===null?0:
      Math.min(.05,1.5*Math.max(0,(now-this.presentedAt)/1000),Math.max(0,(presentationTick-this.presentedTick)*TICK));
    let rebased=false,cut=false,cutCamera=false;
    if(this.rebase&&this.presented){
      // A held pose did not travel while frozen. Extrapolating its old
      // velocity over the outage creates a large kick on reconnection.
      const dt=elapsed;
      const extrapolated={...this.presented,x:this.presented.x+this.presented.vx*dt,y:this.presented.y+this.presented.vy*dt,z:this.presented.z+this.presented.vz*dt,
        yaw:this.presented.yaw+this.presented.yawRate*dt,pitch:this.presented.pitch+this.presented.pitchRate*dt,roll:this.presented.roll+this.presented.rollRate*dt};
      const expected=onGround&&isGroundSupported(extrapolated)?sampleSupported(extrapolated):extrapolated;
      // A confirmed impact changes health, but does not itself require a
      // positional cut. Static geometry still decides whether this
      // correction can be shown safely.
      if(correctionClear({...expected,health:goal.health},goal)){
        this.offset={x:expected.x-goal.x,y:expected.y-goal.y,z:expected.z-goal.z,
          yaw:Math.atan2(Math.sin(expected.yaw-goal.yaw),Math.cos(expected.yaw-goal.yaw)),
          pitch:Math.atan2(Math.sin(expected.pitch-goal.pitch),Math.cos(expected.pitch-goal.pitch)),
          roll:Math.atan2(Math.sin(expected.roll-goal.roll),Math.cos(expected.roll-goal.roll))};
      }else {
        this.offset={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};cut=true;
        // Keep the chase camera with a large unavoidable recovery cut.
        if(Math.hypot(expected.x-goal.x,expected.y-goal.y,expected.z-goal.z)>20)cutCamera=true;
      }
      this.rebase=false;rebased=true;
    }
    const dt=this.presented?Math.min(.1,Math.max(0,(now-this.presentedAt)/1000)):0;
    const correctionDistance=Math.hypot(this.offset.x,this.offset.y,this.offset.z);
    // Larger safe corrections converge more slowly, rather than turning a
    // packet burst into an implausibly high catch-up velocity.
    const correctionRate=Math.min(10,20/Math.max(.001,correctionDistance));
    const decay=rebased?1:Math.exp(-correctionRate*dt);
    for(const key of ['x','y','z','yaw','pitch','roll'] as const)this.offset[key]*=decay;
    let car={...goal,x:goal.x+this.offset.x,y:goal.y+this.offset.y,z:goal.z+this.offset.z,
      yaw:goal.yaw+this.offset.yaw,pitch:goal.pitch+this.offset.pitch,roll:goal.roll+this.offset.roll};
    if(onGround)car=sampleSupported(car);
    // The path proved clear when the offset was created can become unsafe as
    // the replayed car turns or moves. Recheck the current correction and the
    // displayed frame transition before using the remaining offset.
    if((this.offset.x!==0||this.offset.y!==0||this.offset.z!==0||this.offset.yaw!==0||this.offset.pitch!==0||this.offset.roll!==0)&&
      (!correctionClear(goal,car)||(this.presented&&!correctionClear({...this.presented,health:car.health},car)))){
      this.offset={x:0,y:0,z:0,yaw:0,pitch:0,roll:0};car=goal;cut=true;
      if(this.presented&&Math.hypot(this.presented.x-goal.x,this.presented.y-goal.y,this.presented.z-goal.z)>20)cutCamera=true;
    }
    let peers=shown;
    if(coTimedPeers){
      const {peersBefore,peersAfter,unsafePeers}=this.segment;
      const authoritative=new Map(world.entities.map(entity=>[entity.id,entity]));
      const prior=this.presentedWorld&&new Map(this.presentedWorld.entities.map(entity=>[entity.id,entity]));
      const result=shown.entities.slice(),peerElapsed=this.presented?Math.min(.05,Math.max(0,(now-this.presentedAt)/1000)):0;
      for(let i=0;i<result.length;i++){
        const entity=result[i];if(entity.id===car.id)continue;
        const actual=authoritative.get(entity.id),a=peersBefore.get(entity.id),b=peersAfter.get(entity.id);
        if(!actual||!a||!b||actual.supportId==='ferry'||unsafePeers.has(entity.id))continue;
        const distance=Math.min(Math.hypot(entity.x-car.x,entity.z-car.z),Math.hypot(actual.x-car.x,actual.z-car.z));
        if(distance>=35){this.peerOffsets.delete(entity.id);continue;}
        const forecast=sampleBetween(a,b,alpha);
        // Health can change in speculative contact; it is not geometry and
        // must not leave the displayed peer on a different time base.
        if(!presentationPathClear({...actual,health:forecast.health},forecast)||!presentationPathClear({...entity,health:forecast.health},forecast)){
          this.peerOffsets.delete(entity.id);continue;
        }
        // Fade onto the common replay timeline near the controlled vehicle.
        // Unknown peer controls may still create a temporary visual overlap.
        const amount=Math.max(0,Math.min(1,(35-distance)/15));
        const pose=sampleBetween(entity,forecast,amount);
        // Peer replay is presentation only. Keep damage, fuel, ownership and
        // other gameplay state from the latest confirmed snapshot.
        const goal={...actual,x:pose.x,y:pose.y,z:pose.z,yaw:pose.yaw,pitch:pose.pitch,roll:pose.roll,steering:pose.steering,supportId:pose.supportId};
        const old=prior?.get(entity.id);
        if(this.peerRebase&&old){
          const dt=amount===1?elapsed:peerElapsed;
          const extrapolated={...old,x:old.x+old.vx*dt,y:old.y+old.vy*dt,z:old.z+old.vz*dt,health:goal.health};
          const expected=isGroundSupported(old)?sampleSupported(extrapolated):extrapolated;
          if(Math.hypot(expected.x-goal.x,expected.y-goal.y,expected.z-goal.z)<12&&presentationPathClear(expected,goal)){
            this.peerOffsets.set(entity.id,{x:expected.x-goal.x,y:expected.y-goal.y,z:expected.z-goal.z,
              yaw:Math.atan2(Math.sin(expected.yaw-goal.yaw),Math.cos(expected.yaw-goal.yaw)),
              pitch:Math.atan2(Math.sin(expected.pitch-goal.pitch),Math.cos(expected.pitch-goal.pitch)),
              roll:Math.atan2(Math.sin(expected.roll-goal.roll),Math.cos(expected.roll-goal.roll))});
          }else this.peerOffsets.delete(entity.id);
        }
        const offset=this.peerOffsets.get(entity.id);
        if(offset){
          if(!this.peerRebase){const decay=Math.exp(-6*peerElapsed);for(const key of ['x','y','z','yaw','pitch','roll'] as const)offset[key]*=decay;}
          let corrected={...goal,x:goal.x+offset.x,y:goal.y+offset.y,z:goal.z+offset.z,
            yaw:goal.yaw+offset.yaw,pitch:goal.pitch+offset.pitch,roll:goal.roll+offset.roll};
          if(isGroundSupported(goal))corrected=sampleSupported(corrected);
          if(presentationPathClear(goal,corrected)&&(!old||presentationPathClear({...old,health:corrected.health},corrected)))result[i]=corrected;
          else {this.peerOffsets.delete(entity.id);result[i]=goal;}
        }else result[i]=goal;
      }
      peers={...shown,entities:result};
    }
    this.peerRebase=false;
    if(cut)this.snap=true;
    if(cutCamera)this.cameraSnap=true;
    this.presented=car;this.presentedAt=now;this.presentedTick=presentationTick;this.presentationHeld=false;
    const result={...peers,entities:peers.entities.map(entity=>entity.id===car.id?car:entity)};
    this.presentedWorld=result;return result;
  }

  private heldWorld(shown:World):World|null {
    if(!this.presented)return null;
    return {...shown,entities:shown.entities.map(entity=>entity.id===this.presented!.id?this.presented!:entity)};
  }

  private replay(target:number,now:number):void {
    this.invalidated=false;this.segment=null;
    const world=this.world,control=this.control,car=world&&driven(world,this.playerId);
    const player=world?.players.find(item=>item.id===this.playerId);
    if(!world||!control||!car||!player||!Number.isSafeInteger(target)||target<=this.tick||target>this.tick+12){this.cache=null;return;}
    const cached=this.cache;
    const reusable=cached&&target>cached.target&&this.pending.length>=cached.pendingCount&&
      this.pending.slice(cached.pendingCount).every(command=>command.targetTick>cached.target);
    let simulation:World,scheduler:ScheduledInput,previous:Entity,next:Entity,start:number,commands:InputCommand[],unsafePeers:Set<string>;
    if(reusable){
      simulation=cached.simulation;scheduler=ScheduledInput.fromSnapshot(cached.scheduler.snapshot(),now);
      previous=cached.next;next=previous;start=cached.target+1;commands=this.pending.slice(cached.pendingCount);unsafePeers=new Set(cached.unsafePeers);
    }else{
      // Reuse shared physics for the controlled car, parked cars, NPCs and
      // nearby human proxies. Proxy inputs are estimates until confirmed.
      const base=()=>({...world,pickups:[],ferry:structuredClone(world.ferry),parking:{rounds:[]},races:{rounds:[]},soccer:structuredClone(world.soccer)});
      const entities=world.entities.filter(item=>item.id===car.id||Math.hypot(item.x-car.x,item.z-car.z)<160).map(item=>structuredClone(item));
      const drivers=new Set(entities.map(entity=>entity.driver));
      simulation={...base(),entities,players:world.players.filter(item=>drivers.has(item.id)).map(item=>structuredClone(item))};
      scheduler=ScheduledInput.fromSnapshot(control,now);
      previous=structuredClone(car);next=previous;start=this.tick+1;commands=this.pending;unsafePeers=new Set();
    }
    for(const command of commands)if(command.seq>control.receivedSeq){
      const input={...command.input};
      for(const kind of ['jump','flip'] as const)if(this.suppressed[kind].has(input[kind]))input[kind]=control[kind].seen;
      scheduler.receive({...command,input},this.tick,now);
    }
    let peersBefore=new Map<string,Entity>(),peersAfter=new Map<string,Entity>();
    for(let t=start;t<=target;t++){
      const input:Input=scheduler.advance(t,now).input;
      // A late level can be rejected while its one-shot edge is accepted for
      // a later tick. Replay that explicit outcome without inventing a level.
      for(const edge of this.rescheduled)if(t>=edge.targetTick&&newer(edge.id,input[edge.kind]))input[edge.kind]=edge.id;
      const count=Math.max(this.substeps,simulationSubsteps(simulation,TICK));
      let relocated=false;
      const before=new Map(simulation.entities.map(entity=>[entity.id,{...entity}]));
      const inputs=new Map(this.peerInputs);inputs.set(this.playerId,input);
      step(simulation,inputs,TICK,{substeps:count,economy:{update:()=>{},pickup:()=>{},canCollect:()=>false},onRelocation:id=>{
        if(id===this.playerId)relocated=true;
        else for(const entity of simulation.entities)if(entity.driver===id)unsafePeers.add(entity.id);
      }});
      // Recovery and ferry-apron moves are authoritative discontinuities, not
      // positions that may be interpolated across the map speculatively.
      if(relocated){this.unsafeReplay=true;this.cache=null;return;}
      const entity=driven(simulation,this.playerId);if(!entity){this.cache=null;return;}
      if(t===target){
        peersBefore=before;
        peersAfter=new Map(simulation.entities.map(item=>[item.id,{...item}]));
      }
      previous=next;next=structuredClone(entity);
    }
    this.cache={target,simulation,scheduler,pendingCount:this.pending.length,next,unsafePeers};
    this.segment={target,previous,next,peersBefore,peersAfter,unsafePeers};
  }
}

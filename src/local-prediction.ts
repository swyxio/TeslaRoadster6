import { step, type Entity, type Input, type World } from '../shared/game';
import { dimensions } from '../shared/physics';
import { OVERPASS, STUNT_LOOP, STUNT_RAMP, isSurface, nearbyBuildings } from '../shared/map';
import { ISLAND_JUMPS } from '../shared/island-jumps';
import { ISLAND_BANK, ISLAND_CLIFF } from '../shared/island-stunts';
import { ovalBankSurface } from '../shared/oval-bank';
import { requiredLevelAt } from '../shared/delivery';
import { DOME } from '../shared/dome';

// Presentation only: a short, conservative preview of the local driver's
// inputs. Server snapshots remain the source of gameplay state and HUD values.
const TICK = .05;
const MAX_PENDING = 3;
const MAX_SNAPSHOT_AGE_MS = 250;
type Pending = { seq:number; input:Input };

function driven(world:World,id:string):Entity|undefined {
  const player=world.players.find(p=>p.id===id);
  return world.entities.find(e=>e.id===player?.entityId&&e.driver===id);
}

function safe(world:World,car:Entity,input:Input,ageMs:number):boolean {
  if(ageMs>MAX_SNAPSHOT_AGE_MS||car.kind==='person'||car.supportId!=='ground'||car.inDome||car.autopilot||
     car.loopAngle!==null||input.jump!==car.lastJump||input.flip!==car.lastFlip||input.boost||input.hover||input.roll)return false;
  // The ferry can change support or secure passengers independently.
  if(Math.hypot(car.x-world.ferry.x,car.z-world.ferry.z)<80)return false;
  const radius=(e:Entity)=>{const d=dimensions(e.kind);return Math.hypot(d.width,d.length)/2;};
  const localSpeed=Math.hypot(car.vx,car.vz);
  // Avoid predicting dynamic collisions. This grows with both bodies' observed
  // speed and includes room for acceleration during stale snapshot + replay.
  return world.entities.every(other=>other.id===car.id||
    Math.hypot(other.x-car.x,other.z-car.z)>radius(car)+radius(other)+4+
      (localSpeed+Math.hypot(other.vx,other.vz)+35)*.4);
}

// A correction may be close in distance but still cross a wall or shoreline.
// Refuse smoothing if the car's conservative swept bounds touch a building.
function safeCorrection(from:Entity,to:Entity):boolean {
  if(from.health!==to.health)return false;
  const spec=dimensions(to.kind),radius=Math.hypot(spec.width,spec.length)/2+2+Math.hypot(to.vx,to.vz)*.2;
  const minX=Math.min(from.x,to.x)-radius,maxX=Math.max(from.x,to.x)+radius;
  const minZ=Math.min(from.z,to.z)-radius,maxZ=Math.max(from.z,to.z)+radius;
  const x=(from.x+to.x)/2,z=(from.z+to.z)/2;
  const overlaps=(left:number,right:number,near:number,far:number)=>right>=minX&&left<=maxX&&far>=minZ&&near<=maxZ;
  for(const ramp of [...ISLAND_JUMPS,STUNT_RAMP,OVERPASS])if(overlaps(ramp.start,ramp.end,ramp.z-ramp.width/2,ramp.z+ramp.width/2))return false;
  if(overlaps(ISLAND_BANK.startX,ISLAND_BANK.endX,ISLAND_BANK.z-ISLAND_BANK.halfWidth,ISLAND_BANK.z+ISLAND_BANK.halfWidth)||
    overlaps(ISLAND_CLIFF.x-ISLAND_CLIFF.radius,ISLAND_CLIFF.x+ISLAND_CLIFF.radius,ISLAND_CLIFF.z-ISLAND_CLIFF.width/2,ISLAND_CLIFF.z+ISLAND_CLIFF.width/2)||
    overlaps(STUNT_LOOP.x-STUNT_LOOP.radius,STUNT_LOOP.x+STUNT_LOOP.radius,STUNT_LOOP.z-STUNT_LOOP.width/2,STUNT_LOOP.z+STUNT_LOOP.width/2)||
    overlaps(DOME.x-DOME.halfLength,DOME.x+DOME.halfLength,DOME.z-DOME.flatHalfWidth-DOME.radius,DOME.z+DOME.flatHalfWidth+DOME.radius))return false;
  if(nearbyBuildings(x,z,Math.hypot(maxX-minX,maxZ-minZ)/2).some(b=>
    b.x+b.w/2>=minX&&b.x-b.w/2<=maxX&&b.z+b.d/2>=minZ&&b.z-b.d/2<=maxZ))return false;
  const count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)));
  const level=requiredLevelAt(from.x,from.z);
  for(let i=0;i<=count;i++){
    const px=from.x+(to.x-from.x)*i/count,pz=from.z+(to.z-from.z)*i/count;
    if(!isSurface(px,pz)||requiredLevelAt(px,pz)!==level||ovalBankSurface(px,pz))return false;
  }
  return true;
}

export class LocalPrediction {
  private pending:Pending[]=[];
  private world:World|null=null;
  private id='';
  private snapshotAt=0;
  private ack=0;
  private blocked=false;
  private predicted:Entity|null=null;
  private lastInput:Input|null=null;
  private snap=false;
  private cameraSnap=false;
  private resetPending=false;

  reset():void {this.pending=[];this.world=null;this.id='';this.snapshotAt=0;this.ack=0;this.blocked=false;this.predicted=null;this.lastInput=null;this.snap=false;this.cameraSnap=false;this.resetPending=false;}
  // A post-action server barrier is required before any new prediction.
  suspend(reset=false):void {this.pending=[];this.blocked=true;this.predicted=null;this.snap=true;this.resetPending||=reset;}
  takeSnap():boolean {const snap=this.snap;if(!this.blocked)this.snap=false;return snap;}
  takeCameraSnap():boolean {const snap=this.cameraSnap;this.cameraSnap=false;return snap;}

  snapshot(world:World,id:string,ack:number,now:number,barrierPassed=false):void {
    if(!Number.isSafeInteger(ack)||ack<this.ack){this.reset();return;}
    const prior=driven(this.world??world,this.id||id),current=driven(world,id),previousPreview=now-this.snapshotAt<=MAX_SNAPSHOT_AGE_MS?this.predicted:null;
    const relocation=!!this.id&&(!prior||!current||prior.id!==current.id||prior.kind!==current.kind||
      prior.inDome!==current.inDome||
      Math.hypot(prior.x-current.x,prior.y-current.y,prior.z-current.z)>Math.max(10,Math.hypot(prior.vx,prior.vy,prior.vz)*.2+2));
    const discontinuity=relocation||!!prior&&!!current&&prior.supportId!==current.supportId;
    // Support and Dome boundaries may be crossed continuously. Only cut the
    // camera for a different driven body or movement too large for the time
    // between server snapshots; the vehicle still uses the stricter barrier.
    const snapshotSeconds=Math.max(0,world.time-(this.world?.time??world.time));
    const elapsed=Math.max(.2,snapshotSeconds);
    const cameraRelocation=!!this.id&&(!prior||!current||prior.id!==current.id||prior.kind!==current.kind||
      Math.hypot(prior.x-current.x,prior.y-current.y,prior.z-current.z)>
      Math.max(10,Math.max(Math.hypot(prior.vx,prior.vy,prior.vz),Math.hypot(current.vx,current.vy,current.vz))*elapsed+2));
    // Resets can move only a few metres or turn the car in place. The server
    // has no action-result message, so use the reset intent and its observed
    // stopped pose, never the barrier alone, as evidence for a camera cut.
    const resetSpeed=Math.max(2,Math.min(10,50*snapshotSeconds+1));
    const distance=prior&&current?Math.hypot(prior.x-current.x,prior.y-current.y,prior.z-current.z):0;
    const travel=prior&&current?Math.max(Math.hypot(prior.vx,prior.vy,prior.vz),Math.hypot(current.vx,current.vy,current.vz))*snapshotSeconds:0;
    const turn=prior&&current?Math.abs(Math.atan2(Math.sin(prior.yaw-current.yaw),Math.cos(prior.yaw-current.yaw))):0;
    const naturalTurn=prior&&current?Math.max(Math.abs(prior.yawRate),Math.abs(current.yawRate))*snapshotSeconds:0;
    const resetPose=!!prior&&!!current&&this.resetPending&&Math.hypot(current.vx,current.vy,current.vz)<resetSpeed&&
      (distance>Math.max(2,travel+1)||turn>Math.max(1,naturalTurn+.3));
    if(cameraRelocation||resetPose)this.cameraSnap=true;
    if(discontinuity){this.pending=[];this.predicted=null;this.snap=true;}
    if(this.predicted&&!previousPreview)this.snap=true;
    this.world=world;this.id=id;this.snapshotAt=now;this.ack=ack;
    this.pending=this.pending.filter(item=>item.seq>ack);
    if(barrierPassed){this.blocked=false;this.resetPending=false;}
    this.replay(now);
    // An ordinary ACK can consume every pending input. Keep blending toward
    // the authoritative car when the same preview is still safe; true
    // discontinuities and action barriers still snap back to authority.
    const safeReturn=!!previousPreview&&!discontinuity&&!this.blocked&&!!current&&!!this.lastInput&&safe(world,current,this.lastInput,0)&&safeCorrection(previousPreview,current);
    if(!this.predicted&&!this.pending.length&&safeReturn)this.predicted=current!;
    // A new input can resume prediction before the next animation frame. Keep
    // the snap signal even if replay succeeds across an unsafe correction.
    if(previousPreview&&(!this.predicted||!safeReturn))this.snap=true;
  }

  input(seq:number,input:Input,now:number):void {
    if(!Number.isSafeInteger(seq)||seq<=this.ack)return;
    this.lastInput={...input};
    this.pending.push({seq,input:{...input}});
    // Never grow or extrapolate indefinitely during lost/stalled connections.
    if(this.pending.length>MAX_PENDING)this.pending=this.pending.slice(-MAX_PENDING-1);
    this.replay(now);
  }

  renderWorld(now:number):World|null {
    if(!this.world||!this.predicted||this.blocked||now-this.snapshotAt>MAX_SNAPSHOT_AGE_MS)return null;
    const car=this.predicted;
    return {...this.world,entities:this.world.entities.map(e=>e.id===car.id?car:e)};
  }

  private replay(now:number):void {
    this.predicted=null;
    const world=this.world,car=world&&driven(world,this.id),player=world?.players.find(p=>p.id===this.id);
    if(!world||!car||!player||this.blocked||!this.pending.length||this.pending.length>MAX_PENDING)return;
    const simulation:World={...world,entities:[structuredClone(car)],players:[structuredClone(player)],pickups:[],
      ferry:structuredClone(world.ferry),parking:{rounds:[]},races:{rounds:[]},soccer:structuredClone(world.soccer)};
    const predicted=simulation.entities[0];
    for(const item of this.pending){
      if(!safe(world,predicted,item.input,now-this.snapshotAt))return;
      step(simulation,new Map([[this.id,item.input]]),TICK);
      // A supported surface change, crash or unexpected transition is left to
      // the server; do not carry predicted momentum across it.
      if(predicted.supportId!=='ground'||predicted.inDome||predicted.health!==car.health)return;
    }
    this.predicted=predicted;
  }
}

import { step, type Entity, type Input, type World } from '../shared/game';
import { dimensions } from '../shared/physics';

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

export class LocalPrediction {
  private pending:Pending[]=[];
  private world:World|null=null;
  private id='';
  private snapshotAt=0;
  private ack=0;
  private blocked=false;
  private predicted:Entity|null=null;

  reset():void {this.pending=[];this.world=null;this.id='';this.snapshotAt=0;this.ack=0;this.blocked=false;this.predicted=null;}
  // A post-action server barrier is required before any new prediction.
  suspend():void {this.pending=[];this.blocked=true;this.predicted=null;}

  snapshot(world:World,id:string,ack:number,now:number,barrierPassed=false):void {
    if(!Number.isSafeInteger(ack)||ack<this.ack){this.reset();return;}
    const prior=driven(this.world??world,this.id||id),current=driven(world,id);
    if(this.id&&(!prior||!current||prior.id!==current.id||prior.kind!==current.kind||
      prior.supportId!==current.supportId||prior.inDome!==current.inDome||
      Math.hypot(prior.x-current.x,prior.y-current.y,prior.z-current.z)>Math.max(10,Math.hypot(prior.vx,prior.vy,prior.vz)*.2+2))){
      this.pending=[];this.predicted=null;
    }
    this.world=world;this.id=id;this.snapshotAt=now;this.ack=ack;
    this.pending=this.pending.filter(item=>item.seq>ack);
    if(barrierPassed)this.blocked=false;
    this.replay(now);
  }

  input(seq:number,input:Input,now:number):void {
    if(!Number.isSafeInteger(seq)||seq<=this.ack)return;
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

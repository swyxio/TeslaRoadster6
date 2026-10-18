import { onRoof } from '../shared/achievements';
import { nearbyBuildings, rampHeight } from '../shared/map';
import { VEHICLES } from '../shared/vehicles';
import type { Entity, World } from '../shared/game';

export type SoundCue = 'jump' | 'land' | 'crash' | 'pickup' | 'delivery' | 'repair' | 'air' | 'refill' | 'pursuit' | 'ticket' | 'achievement';
export type SoundEvent = { cue: SoundCue; strength?: number };

type Sample = {
  playerId: string; entityId: string; time: number; x: number; z: number; y: number; vy: number;
  speed: number; health: number; grounded: boolean; jumpBurstUntil: number; stage: 'pickup' | 'dropoff';
  completed: number; tickets: number; awards: number; pursued: boolean; refilling: boolean;
  pickups: Map<string, boolean>;
};

function grounded(e: Entity): boolean {
  if(e.loopAngle!==null)return true;
  const ramp=rampHeight(e.x,e.z);
  return e.y<=.05 || (ramp!==null&&Math.abs(e.y-ramp)<.08) || onRoof(e);
}

/** Derives local presentation cues from authoritative snapshots; never mutates the world. */
export class SoundEventTracker {
  private previous?: Sample;
  private lastCrash = -Infinity;
  reset(): void { this.previous=undefined; this.lastCrash=-Infinity; }

  update(world: World, playerId: string, refilling: boolean): SoundEvent[] {
    const p=world.players.find(player=>player.id===playerId);
    const e=world.entities.find(entity=>entity.id===p?.entityId);
    if(!p||!e){this.reset();return [];}
    const sample:Sample={playerId,entityId:e.id,time:world.time,x:e.x,z:e.z,y:e.y,vy:e.vy,speed:e.speed,health:e.health,
      grounded:grounded(e),jumpBurstUntil:e.jumpBurstUntil,stage:p.delivery.order.stage,completed:p.delivery.completed,
      tickets:p.delivery.tickets,awards:p.achievements.unlocked.length,pursued:world.entities.some(car=>car.police?.targetId===playerId),
      refilling,pickups:new Map(world.pickups.map(pickup=>[pickup.id,pickup.active]))};
    const previous=this.previous;this.previous=sample;
    if(!previous||previous.playerId!==playerId||sample.time<previous.time){this.lastCrash=-Infinity;return [];}
    if(sample.time===previous.time)return [];
    const events:SoundEvent[]=[];
    if(sample.completed>previous.completed)events.push({cue:'delivery'});
    else if(previous.stage==='pickup'&&sample.stage==='dropoff')events.push({cue:'pickup'});
    if(sample.tickets>previous.tickets)events.push({cue:'ticket'});
    if(sample.awards>previous.awards)events.push({cue:'achievement'});
    if(sample.pursued&&!previous.pursued)events.push({cue:'pursuit'});
    if(sample.refilling&&!previous.refilling)events.push({cue:'refill'});
    if(sample.entityId!==previous.entityId)return events;
    const elapsed=sample.time-previous.time;
    const teleported=Math.hypot(sample.x-previous.x,sample.z-previous.z)>Math.max(15,Math.abs(previous.speed)*elapsed*2+5);
    if(teleported)return events;
    if(sample.jumpBurstUntil>previous.jumpBurstUntil)events.push({cue:'jump'});
    if(!previous.grounded&&sample.grounded&&previous.vy< -1.5)events.push({cue:'land',strength:Math.min(1,Math.max(.25,-previous.vy/14))});
    // At the damage floor, a sharp speed loss beside an obstacle can still signal a crash.
    const damage=previous.health-sample.health;
    const abrupt=elapsed<=.25&&Math.abs(previous.speed)-Math.abs(sample.speed)>8&&sample.tickets===previous.tickets;
    const nearBuilding=abrupt&&nearbyBuildings(e.x,e.z,8).some(b=>e.y<b.h&&Math.abs(e.x-b.x)<b.w/2+5&&Math.abs(e.z-b.z)<b.d/2+5);
    const nearCar=abrupt&&world.entities.some(other=>other.id!==e.id&&Math.abs(other.y-e.y)<3&&Math.hypot(other.x-e.x,other.z-e.z)<(e.kind==='person'?2:VEHICLES[e.kind].length/2)+(other.kind==='person'?2:VEHICLES[other.kind].length/2)+3);
    if((damage>.05||nearBuilding||nearCar)&&sample.time-this.lastCrash>.3){events.push({cue:'crash',strength:Math.min(1,Math.max(.3,damage/5,(Math.abs(previous.speed)-Math.abs(sample.speed))/20))});this.lastCrash=sample.time;}
    for(const pickup of world.pickups){
      if(previous.pickups.get(pickup.id)&&!pickup.active&&e.y<2&&Math.hypot(e.x-pickup.x,e.z-pickup.z)<7)events.push({cue:pickup.kind});
    }
    return events;
  }
}

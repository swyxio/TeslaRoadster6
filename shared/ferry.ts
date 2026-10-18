import { FERRY_DOCKS, isRocketIsland } from './map';
import { body, contact, dimensions } from './physics';
import type { Entity, World } from './game';

// A single, server-owned ferry. Times are simulation seconds, not wall time.
export const FERRY_DECK = { width: 14, length: 38, vehicleCapacity: 6 } as const;
const BOARDING_SECONDS = 30;
const DISEMBARK_SECONDS = 18;
const SPEED = 20, ACCELERATION = 3;
const DISTANCE = FERRY_DOCKS.sf.deckZ - FERRY_DOCKS.island.deckZ;
const RAMP_TIME = SPEED / ACCELERATION;
export const FERRY_TRAVEL_SECONDS = DISTANCE / SPEED + RAMP_TIME;
export type FerrySide = 'sf' | 'island';
export type FerryPassenger = { entityId: string; x: number; z: number };
export type Ferry = {
  phase: FerrySide | 'to-island' | 'to-sf';
  x: number; z: number; velocity: number; remaining: number;
  passengers: FerryPassenger[]; arrivals: string[];
  blocked: 'ramp' | 'capacity' | 'apron' | null;
};

export function createFerry(): Ferry {
  return { phase:'sf', x:FERRY_DOCKS.sf.x, z:FERRY_DOCKS.sf.deckZ, velocity:0,
    remaining:BOARDING_SECONDS, passengers:[], arrivals:[], blocked:null };
}
export const ferryDocked = (ferry:Ferry) => ferry.phase === 'sf' || ferry.phase === 'island';
export function onFerryDeck(ferry:Ferry,x:number,z:number):boolean {
  return Math.abs(x-ferry.x) <= FERRY_DECK.width/2 && Math.abs(z-ferry.z) <= FERRY_DECK.length/2;
}
export function whollyOnFerry(ferry:Ferry,e:Entity):boolean {
  const d=dimensions(e.kind), c=Math.abs(Math.cos(e.yaw)), s=Math.abs(Math.sin(e.yaw));
  const halfX=(c*d.width+s*d.length)/2, halfZ=(s*d.width+c*d.length)/2;
  return Math.abs(e.x-ferry.x)+halfX <= FERRY_DECK.width/2 &&
    Math.abs(e.z-ferry.z)+halfZ <= FERRY_DECK.length/2;
}
export function islandProtected(e:Entity):boolean {
  return e.supportId === 'ferry' || isRocketIsland(e.x,e.z);
}
export function ferrySecured(ferry:Ferry,e:Entity):boolean {
  return !ferryDocked(ferry) && ferry.passengers.some(p=>p.entityId===e.id);
}
export function removeFerryPassenger(ferry:Ferry,id:string):void {
  ferry.passengers=ferry.passengers.filter(p=>p.entityId!==id);
  ferry.arrivals=ferry.arrivals.filter(p=>p!==id);
}

/** Relocation returns false when no collision-checked dock space is available. */
export function updateFerry(world:World,dt:number,relocate:(entity:Entity,side:FerrySide)=>boolean):void {
  const f=world.ferry;
  if(ferryDocked(f)){
    const side=f.phase as FerrySide;
    f.arrivals=f.arrivals.filter(id=>world.entities.some(e=>e.id===id&&e.supportId==='ferry'));
    // Give arrivals time to drive off before placing remaining bodies on a clear apron.
    if(f.remaining<=BOARDING_SECONDS-DISEMBARK_SECONDS&&f.arrivals.length){
      for(const id of [...f.arrivals]){
        const entity=world.entities.find(e=>e.id===id);
        if(!entity||relocate(entity,side))removeFerryPassenger(f,id);
      }
      if(f.arrivals.length){f.blocked='apron';f.velocity=0;return;}
    }
    f.blocked=null;f.remaining=Math.max(0,f.remaining-dt);
    if(f.remaining>0)return;
    const occupants=world.entities.filter(e=>e.supportId==='ferry').sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    // A shore-supported body may overlap the deck before its center crosses
    // the seam. Hold departure until it clears or is fully on the ferry.
    const deck={x:f.x,z:f.z,w:FERRY_DECK.width,d:FERRY_DECK.length,yaw:0};
    const shoreObstruction=world.entities.some(e=>e.supportId==='ground'&&Math.abs(e.y)<.05&&contact(body(e),deck));
    if(shoreObstruction||occupants.some(e=>!whollyOnFerry(f,e)||Math.abs(e.speed)>1||Math.hypot(e.pushX,e.pushZ)>1)){
      f.blocked='ramp';return;
    }
    if(occupants.filter(e=>e.kind!=='person').length>FERRY_DECK.vehicleCapacity){f.blocked='capacity';return;}
    f.passengers=occupants.map(e=>({entityId:e.id,x:e.x-f.x,z:e.z-f.z}));
    for(const e of occupants){e.speed=0;e.pushX=0;e.pushZ=0;e.autopilot=false;e.thrusters=0;}
    f.phase=side==='sf'?'to-island':'to-sf';f.remaining=FERRY_TRAVEL_SECONDS;
    return;
  }
  const start=f.phase==='to-island'?FERRY_DOCKS.sf.deckZ:FERRY_DOCKS.island.deckZ;
  const direction=f.phase==='to-island'?-1:1;
  const previous=f.z;f.remaining=Math.max(0,f.remaining-dt);
  const elapsed=FERRY_TRAVEL_SECONDS-f.remaining;
  let distance:number;
  if(elapsed<RAMP_TIME)distance=.5*ACCELERATION*elapsed**2;
  else if(f.remaining<RAMP_TIME)distance=DISTANCE-.5*ACCELERATION*f.remaining**2;
  else distance=SPEED*(elapsed-RAMP_TIME/2);
  f.z=start+direction*distance;f.velocity=(f.z-previous)/dt;
  for(const passenger of f.passengers){
    const e=world.entities.find(entity=>entity.id===passenger.entityId);if(!e)continue;
    e.x=f.x+passenger.x;e.z=f.z+passenger.z;e.y=0;e.vx=0;e.vy=0;e.vz=f.velocity;e.supportId='ferry';
  }
  if(f.remaining===0){
    f.phase=direction<0?'island':'sf';f.z=direction<0?FERRY_DOCKS.island.deckZ:FERRY_DOCKS.sf.deckZ;
    f.velocity=0;f.remaining=BOARDING_SECONDS;f.arrivals=f.passengers.map(p=>p.entityId);f.passengers=[];
  }
}

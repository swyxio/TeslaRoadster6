import { terrainHeight } from './map';
import type { Entity } from './game';
import { hasRockets } from './upgrades';

export const ROCKET_PAD_COOLDOWN = 20;

type RocketPad = { x: number; z: number; active: boolean; readyAt?: number };

/**
 * Resolve one pad after movement. Eligible driven cars must be on its ground
 * surface; an on-foot player or a car flying above it cannot claim it. Entity
 * IDs break simultaneous claims independently of array or connection order.
 * Returns the winning entity ID, or null when no claim was made.
 */
export function updateRocketPickup(pad: RocketPad, entities: Entity[], time: number, canCollect?: (driverId:string)=>boolean): string | null {
  if (!pad.active && time >= (pad.readyAt ?? Infinity)) pad.active = true;
  if (!pad.active) return null;
  let ground:number|null|undefined, winner:Entity|undefined;
  for(const e of entities){
    if(e.kind==='person'||!e.driver||e.supportId!=='ground')continue;
    const dx=e.x-pad.x,dz=e.z-pad.z;
    // Most cars are far from a given pad. Keep hypot for nearby and non-finite
    // coordinates so the exact distance and exceptional-number behavior remain unchanged.
    if((Math.abs(dx)>=4||Math.abs(dz)>=4)&&Number.isFinite(dx)&&Number.isFinite(dz))continue;
    if(Math.hypot(dx,dz)>=4||(canCollect&&!canCollect(e.driver)))continue;
    if(ground===undefined)ground=terrainHeight(pad.x,pad.z);
    if(ground===null)return null;
    if(Math.abs(e.y-ground)>=2||(hasRockets(e)&&e.air>=99.99))continue;
    if(!winner||e.id<winner.id)winner=e;
  }
  if (!winner) return null;
  winner.air = 100;
  winner.upgrades.rocket = true;
  pad.active = false;
  pad.readyAt = time + ROCKET_PAD_COOLDOWN;
  return winner.id;
}

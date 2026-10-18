/** Fictional Alcatraz Rocket Dome, in game meters; shared by physics and rendering. */
import type { Entity } from './game';
import { hasRockets } from './upgrades';

export const DOME = {
  x: 300, z: -850,
  halfLength: 75,
  flatHalfWidth: 20,
  radius: 25,
  goalHalfWidth: 12,
  goalHeight: 10,
  ballRadius: 2.5,
} as const;

// Recharge is percentage points of the installed tank per second, as at stations.
// Keep the bright wall markings, HUD and authoritative recharge in agreement.
export const DOME_CHARGE_HEIGHT=8, DOME_CHARGE_SPEED=5, DOME_CHARGE_RATE=24;
export function chargingDomeWall(e:Entity):boolean {
  return e.inDome && e.supportId==='dome' && e.domeS!==null && e.y>=DOME_CHARGE_HEIGHT &&
    Math.abs(e.speed)>=DOME_CHARGE_SPEED && hasRockets(e);
}

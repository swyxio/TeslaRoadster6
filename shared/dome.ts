import type { Entity } from './game';

/** Fictional China Basin Rocket Dome, in game meters; shared by physics and rendering. */
export const DOME = {
  x: -50, z: 205,
  halfLength: 75,
  flatHalfWidth: 20,
  radius: 25,
  goalHalfWidth: 12,
  goalHeight: 10,
  ballRadius: 2.5,
  gateHalfWidth: 14,
  gateHeight: 10,
} as const;

// Recharge uses percentage points of the installed tank per simulation second.
export const DOME_CHARGE_HEIGHT=8, DOME_CHARGE_SPEED=5, DOME_CHARGE_RATE=24;
export function chargingDomeWall(e:Entity,rocket:boolean):boolean {
  return e.inDome && e.supportId==='dome' && e.domeS!==null && e.y>=DOME_CHARGE_HEIGHT &&
    Math.abs(e.speed)>=DOME_CHARGE_SPEED && rocket;
}

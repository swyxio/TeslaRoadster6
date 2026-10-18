import { terrainHeight } from './map';
import type { Entity } from './game';
import { VEHICLES } from './vehicles';

/** Fictional arcade upgrade; all durations use simulation seconds. */
export const ROCKET_DURATION = 90;
export const ROCKET_PAD_COOLDOWN = 20;

type RocketPad = { x: number; z: number; active: boolean; readyAt?: number };

/** Capability belongs to the vehicle, never the driver or fleet registry. */
export function hasRocket(entity: Pick<Entity, 'kind' | 'rocketUntil' | 'upgrades'>, time: number): boolean {
  return entity.kind !== 'person' && (VEHICLES[entity.kind].airThrusters || entity.upgrades.rocket || time < entity.rocketUntil);
}

/**
 * Resolve one pad after movement. Eligible driven cars must be on its ground
 * surface; an on-foot player or a car flying above it cannot claim it. Entity
 * IDs break simultaneous claims independently of array or connection order.
 * Returns the winning entity ID, or null when no claim was made.
 */
export function updateRocketPickup(pad: RocketPad, entities: Entity[], time: number): string | null {
  if (!pad.active && time >= (pad.readyAt ?? Infinity)) pad.active = true;
  if (!pad.active) return null;
  const ground = terrainHeight(pad.x, pad.z);
  if (ground === null) return null;
  const winner = entities.filter(e => e.kind !== 'person' && e.driver && e.supportId === 'ground' &&
    Math.abs(e.y - ground) < 2 && Math.hypot(e.x - pad.x, e.z - pad.z) < 4)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (!winner || winner.kind === 'person') return null;
  winner.air = 100;
  // The stock Rocket and purchased kits are permanent; pickups only refill them.
  winner.rocketUntil = VEHICLES[winner.kind].airThrusters || winner.upgrades.rocket ? 0 : time + ROCKET_DURATION;
  pad.active = false;
  pad.readyAt = time + ROCKET_PAD_COOLDOWN;
  return winner.id;
}

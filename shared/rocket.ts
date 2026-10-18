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
export function updateRocketPickup(pad: RocketPad, entities: Entity[], time: number): string | null {
  if (!pad.active && time >= (pad.readyAt ?? Infinity)) pad.active = true;
  if (!pad.active) return null;
  const ground = terrainHeight(pad.x, pad.z);
  if (ground === null) return null;
  const winner = entities.filter(e => e.kind !== 'person' && e.driver && e.supportId === 'ground' &&
    Math.abs(e.y - ground) < 2 && Math.hypot(e.x - pad.x, e.z - pad.z) < 4 &&
    (!hasRockets(e) || e.air < 99.99))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (!winner || winner.kind === 'person') return null;
  winner.air = 100;
  winner.upgrades.rocket = true;
  pad.active = false;
  pad.readyAt = time + ROCKET_PAD_COOLDOWN;
  return winner.id;
}

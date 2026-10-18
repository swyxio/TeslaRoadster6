import { terrainHeight } from './map';
import { VEHICLES, type VehicleId } from './vehicles';

/** Fictional arcade upgrade; all durations use simulation seconds. */
export const ROCKET_DURATION = 90;
export const ROCKET_PAD_COOLDOWN = 20;

type RocketEntity = {
  id: string;
  kind: VehicleId | 'person';
  x: number; y: number; z: number;
  driver: string | null;
  supportId: string | null;
  air: number;
  /** Absolute simulation time; zero means no temporary upgrade. */
  rocketUntil: number;
  upgrades?: { rocket: boolean };
};
type RocketPad = { x: number; z: number; active: boolean; readyAt?: number };

/** Capability belongs to the vehicle, never the driver or fleet registry. */
export function hasRocket(entity: Pick<RocketEntity, 'kind' | 'rocketUntil' | 'upgrades'>, time: number): boolean {
  return entity.kind !== 'person' && (VEHICLES[entity.kind].airThrusters || entity.upgrades?.rocket === true || time < entity.rocketUntil);
}

/**
 * Resolve one pad after movement. Eligible driven cars must be on its ground
 * surface; an on-foot player or a car flying above it cannot claim it. Entity
 * IDs break simultaneous claims independently of array or connection order.
 * Returns the winning entity ID, or null when no claim was made.
 */
export function updateRocketPickup(pad: RocketPad, entities: RocketEntity[], time: number): string | null {
  if (!pad.active && time >= (pad.readyAt ?? Infinity)) pad.active = true;
  if (!pad.active) return null;
  const ground = terrainHeight(pad.x, pad.z);
  if (ground === null) return null;
  const winner = entities.filter(e => e.kind !== 'person' && e.driver && e.supportId === 'ground' &&
    Math.abs(e.y - ground) < 2 && Math.hypot(e.x - pad.x, e.z - pad.z) < 4 &&
    (!(VEHICLES[e.kind as VehicleId].airThrusters || e.upgrades?.rocket) || e.air < 99.99))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (!winner || winner.kind === 'person') return null;
  winner.air = 100;
  // Stock Rocket capability is permanent; pickups only refill its tank.
  winner.rocketUntil = VEHICLES[winner.kind].airThrusters || winner.upgrades?.rocket ? 0 : time + ROCKET_DURATION;
  pad.active = false;
  pad.readyAt = time + ROCKET_PAD_COOLDOWN;
  return winner.id;
}

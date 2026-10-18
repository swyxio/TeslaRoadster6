import type { World } from '../shared/game';

// Keep other drivers visible on the whole-Bay map; only ambient cars are local.
// This exceeds the renderer's fog distance and includes owned/unoccupied cars.
export const AMBIENT_INTEREST_METERS = 1400;

export function snapshotFor(world: World, playerId: string): World {
  const player = world.players.find(p => p.id === playerId);
  const current = world.entities.find(e => e.id === player?.entityId);
  if (!current) return world;
  const playerEntities = new Set(world.players.map(p => p.entityId));
  const rangeSquared = AMBIENT_INTEREST_METERS ** 2;
  return {
    ...world,
    entities: world.entities.filter(e => e.supportId==='ferry' || playerEntities.has(e.id) || e.driver !== null || e.owner === playerId ||
      (e.x - current.x) ** 2 + (e.z - current.z) ** 2 <= rangeSquared),
  };
}

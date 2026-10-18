import type { Entity, World } from '../shared/game';

// Keep other drivers visible on the whole-Bay map; only ambient cars are local.
// This exceeds the renderer's fog distance and includes owned/unoccupied cars.
export const AMBIENT_INTEREST_METERS = 1400;

function visible(e: Entity, current: Entity, playerId: string, playerEntities: Set<string>): boolean {
  return e.supportId==='ferry' || playerEntities.has(e.id) || e.driver !== null || e.owner === playerId ||
    (e.x-current.x)**2+(e.z-current.z)**2 <= AMBIENT_INTEREST_METERS**2;
}

export function snapshotFor(world: World, playerId: string): World {
  const player = world.players.find(p => p.id === playerId);
  const current = world.entities.find(e => e.id === player?.entityId);
  if (!current) return world;
  const playerEntities = new Set(world.players.map(p => p.entityId));
  return {
    ...world,
    entities: world.entities.filter(e => visible(e,current,playerId,playerEntities)),
  };
}

// Serialize common data and each entity once per tick, then assemble a complete
// recipient-filtered snapshot. This avoids re-stringifying every player and car
// for every socket while preserving the normal JSON wire shape.
export function prepareSnapshots(world: World): (playerId: string, inputAck: number, sync?: number) => string {
  const playerEntities = new Set(world.players.map(player=>player.entityId));
  const entities = world.entities.map(entity=>({entity,json:JSON.stringify(entity)}));
  const byId = new Map(world.entities.map(entity=>[entity.id,entity]));
  const controlled = new Map(world.players.map(player=>[player.id,byId.get(player.entityId)]));
  const common = Object.entries(world).filter(([key,value])=>key!=='entities'&&value!==undefined)
    .map(([key,value])=>`${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',');
  return (playerId,inputAck,sync) => {
    const current=controlled.get(playerId);
    const selected=current?entities.filter(({entity})=>visible(entity,current,playerId,playerEntities)):entities;
    return `{"type":"state","world":{${common},"entities":[${selected.map(item=>item.json).join(',')}]},"inputAck":${inputAck}${sync===undefined?'':`,"sync":${sync}`}}`;
  };
}

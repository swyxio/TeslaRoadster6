import type { Entity, World } from '../shared/game';
import type { ControlSnapshot } from '../shared/tick-input';
import { isVehicleCollectionAward } from '../shared/vehicle-collections';

// Keep other drivers visible on the whole-Bay map; only ambient cars are local.
// This exceeds the renderer's fog distance and includes owned/unoccupied cars.
export const AMBIENT_INTEREST_METERS = 1400;

// Flight rearm is transient authority state; clients do not need the running
// samples. Keep the schema's neutral value without broadcasting the tracker.
function snapshotPlayer(player:World['players'][number],own:boolean):World['players'][number] {
  const achievements={...player.achievements,roofFlight:null};
  if(!own){
    achievements.unlocked=achievements.unlocked.filter(id=>!isVehicleCollectionAward(id));
    if(achievements.lastUnlock&&isVehicleCollectionAward(achievements.lastUnlock.achievement))achievements.lastUnlock=null;
  }
  return {...player,achievements};
}

function snapshotPlayers(world:World,playerId:string):World['players'] {
  return world.players.map(player=>snapshotPlayer(player,player.id===playerId));
}

function visible(e: Entity, current: Entity, playerId: string, playerEntities: Set<string>): boolean {
  return e.supportId==='ferry' || playerEntities.has(e.id) || e.driver !== null || e.owner === playerId ||
    (e.x-current.x)**2+(e.z-current.z)**2 <= AMBIENT_INTEREST_METERS**2;
}

export function snapshotFor(world: World, playerId: string): World {
  const player = world.players.find(p => p.id === playerId);
  const current = world.entities.find(e => e.id === player?.entityId);
  if (!current) return {...world,players:snapshotPlayers(world,playerId)};
  const playerEntities = new Set(world.players.map(p => p.entityId));
  return {
    ...world,
    players:snapshotPlayers(world,playerId),
    entities: world.entities.filter(e => visible(e,current,playerId,playerEntities)),
  };
}

// Serialize common data and each entity once per tick, then assemble a complete
// recipient-filtered snapshot. This avoids re-stringifying every player and car
// for every socket while preserving the normal JSON wire shape.
export function prepareSnapshots(world: World, tick:number, roomEpoch:string, substeps:number): (playerId: string, control:ControlSnapshot, poseRevision:number, sync?: number) => string {
  const playerEntities = new Set(world.players.map(player=>player.entityId));
  const entities = world.entities.map(entity=>({entity,json:JSON.stringify(entity)}));
  const byId = new Map(world.entities.map(entity=>[entity.id,entity]));
  const controlled = new Map(world.players.map(player=>[player.id,byId.get(player.entityId)]));
  // Each recipient sees their own collection awards; remote players do not.
  // Serialize both projections once per player and splice only the recipient's
  // own JSON into the shared remote-player array for each snapshot.
  let offset=1;
  const players=world.players.map(player=>{
    const own=JSON.stringify(snapshotPlayer(player,true));
    const hasPrivateAwards=player.achievements.unlocked.some(isVehicleCollectionAward)||
      !!(player.achievements.lastUnlock&&isVehicleCollectionAward(player.achievements.lastUnlock.achievement));
    const remote=hasPrivateAwards?JSON.stringify(snapshotPlayer(player,false)):own;
    const start=offset;offset+=remote.length+1;
    return {id:player.id,own,remote,start,end:start+remote.length};
  });
  const remotePlayers=`[${players.map(player=>player.remote).join(',')}]`;
  const playerById=new Map(players.map(player=>[player.id,player]));
  const common = Object.entries(world).filter(([key,value])=>key!=='entities'&&key!=='players'&&value!==undefined)
    .map(([key,value])=>`${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',');
  const metadata=`"tick":${tick},"roomEpoch":${JSON.stringify(roomEpoch)},"substeps":${substeps}`;
  return (playerId,control,poseRevision,sync) => {
    const current=controlled.get(playerId);
    const selected=current?entities.filter(({entity})=>visible(entity,current,playerId,playerEntities)):entities;
    const player=playerById.get(playerId);
    const visiblePlayers=player&&player.own!==player.remote
      ?remotePlayers.slice(0,player.start)+player.own+remotePlayers.slice(player.end):remotePlayers;
    return `{"type":"state","world":{"players":${visiblePlayers}${common?`,${common}`:''},"entities":[${selected.map(item=>item.json).join(',')}]},${metadata},"poseRevision":${poseRevision},"control":${JSON.stringify(control)}${sync===undefined?'':`,"sync":${sync}`}}`;
  };
}

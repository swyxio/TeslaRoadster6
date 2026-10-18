import type { Entity } from './game';
import { terrainHeight } from './map';
import { chargingStationAt } from './stations';

/** The same stopped, supported condition drives refill, status and sound. */
export function refillStationFor(entity:Entity) {
  if(entity.kind==='person'||entity.supportId!=='ground'||Math.abs(entity.speed)>=1)return undefined;
  const station=chargingStationAt(entity.x,entity.z);
  return station&&Math.abs(entity.y-(terrainHeight(station.x,station.z)??0))<1?station:undefined;
}

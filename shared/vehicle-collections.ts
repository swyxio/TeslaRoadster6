import { LUXURY_CATALOG } from './luxury';
import { VEHICLE_IDS, VEHICLES, type VehicleId } from './vehicles';
import type { AchievementAward } from './achievement-evidence';

/** These fixed catalogs are built once, never scanned by the simulation tick. */
export const TESLA_COLLECTION_IDS = VEHICLE_IDS.filter(id=>VEHICLES[id].brand==='Tesla');
export const VAULT_COLLECTION_IDS = LUXURY_CATALOG.map(vehicle=>vehicle.id);
const teslas=new Set<string>(TESLA_COLLECTION_IDS);
const drivenVehicles=new Set<string>([...TESLA_COLLECTION_IDS,...VAULT_COLLECTION_IDS]);
const ambientVehicles=new Set<string>(VEHICLE_IDS);
export const isCollectionDriveVehicle=(id:string):id is VehicleId=>drivenVehicles.has(id);
export const isAmbientCollectionVehicle=(id:string):id is VehicleId=>ambientVehicles.has(id);

export type VehicleCollections = {driven:VehicleId[];stolen:VehicleId[]};
export type VehicleCollectionEvidence = {kind:'vehicle-driven';vehicle:VehicleId}|{kind:'npc-stolen';vehicle:VehicleId};
export const emptyVehicleCollections=():VehicleCollections=>({driven:[],stolen:[]});

export function isVehicleCollections(value:unknown):value is VehicleCollections {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  if(Object.keys(record).length!==2||!Array.isArray(record.driven)||!Array.isArray(record.stolen))return false;
  return record.driven.length<=drivenVehicles.size&&record.stolen.length<=ambientVehicles.size&&
    record.driven.every(id=>typeof id==='string'&&drivenVehicles.has(id))&&new Set(record.driven).size===record.driven.length&&
    record.stolen.every(id=>typeof id==='string'&&ambientVehicles.has(id))&&new Set(record.stolen).size===record.stolen.length;
}
/** Existing profiles have no evidence of previous drives or thefts. */
export function normalizeVehicleCollections(value:unknown):VehicleCollections {
  if(value===undefined)return emptyVehicleCollections();
  if(!isVehicleCollections(value))throw new TypeError('Invalid vehicle collection progress');
  return structuredClone(value);
}

const teslaMilestones=[{count:1,id:'tesla-drive-1',reward:100},{count:5,id:'tesla-drive-5',reward:500},{count:11,id:'tesla-drive-11',reward:2_000}] as const;
const stolenMilestones=[{count:1,id:'npc-theft-1',reward:100},{count:5,id:'npc-theft-5',reward:500},{count:10,id:'npc-theft-10',reward:2_000},{count:26,id:'npc-theft-26',reward:5_000}] as const;
const vaultAwards={
  'ducati-panigale-v4':'vault-drive-panigale',
  'kawasaki-ninja-h2-carbon':'vault-drive-ninja',
  'lamborghini-temerario':'vault-drive-temerario',
  'lamborghini-revuelto':'vault-drive-revuelto',
  'bugatti-chiron':'vault-drive-chiron',
  'bugatti-tourbillon':'vault-drive-tourbillon',
} as const;

export function isVehicleCollectionEvidence(evidence:{kind:string;vehicle?:unknown}):evidence is VehicleCollectionEvidence {
  return typeof evidence.vehicle==='string'&&(
    evidence.kind==='vehicle-driven'&&isCollectionDriveVehicle(evidence.vehicle)||
    evidence.kind==='npc-stolen'&&isAmbientCollectionVehicle(evidence.vehicle));
}

/** Apply one unique observed model. Rewards are independent of purchase badges. */
export function applyVehicleCollection(progress:VehicleCollections,evidence:{kind:string;vehicle?:unknown}):{progress:VehicleCollections;awards:AchievementAward[]} {
  if(!isVehicleCollectionEvidence(evidence))return {progress,awards:[]};
  const key=evidence.kind==='vehicle-driven'?'driven':'stolen';
  if(progress[key].includes(evidence.vehicle))return {progress,awards:[]};
  const next={...progress,[key]:[...progress[key],evidence.vehicle]};
  const awards:AchievementAward[]=[];
  if(evidence.kind==='vehicle-driven'){
    if(teslas.has(evidence.vehicle)){
      const count=next.driven.filter(id=>teslas.has(id)).length;
      for(const milestone of teslaMilestones)if(count===milestone.count)awards.push({id:milestone.id,reward:milestone.reward});
    }else if(Object.hasOwn(vaultAwards,evidence.vehicle)){
      awards.push({id:vaultAwards[evidence.vehicle as keyof typeof vaultAwards],reward:1_000});
    }
  }else{
    for(const milestone of stolenMilestones)if(next.stolen.length===milestone.count)awards.push({id:milestone.id,reward:milestone.reward});
  }
  return {progress:next,awards};
}

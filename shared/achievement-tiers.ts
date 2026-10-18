import type { AchievementId } from './achievements';

/** The five durable ranks, shared by every repeatable family. */
export const ACHIEVEMENT_TIER_LADDER = [1, 10, 100, 1_000, 10_000] as const;
export const ACHIEVEMENT_TIER_CAP = 10_000;

export const ACHIEVEMENT_TIER_NAMES = {
  deliveries: 'Deliveries',
  pickups: 'Order pickups',
  'early-pickups': 'Early pickups',
  'early-deliveries': 'Early deliveries',
  'rooftop-deliveries': 'Rooftop deliveries',
  'roof-landings': 'Rooftop landings',
  'bay-crossings': 'Bay crossings',
  'parking-successes': 'Perfect parks',
  'queue-successes': 'Queue successes',
  'races-finished': 'Races finished',
  'races-won': 'Contested races won',
  'dome-matches': 'Dome matches',
  'dome-wins': 'Dome wins',
  'supply-pickups': 'Supply pickups',
} as const;

export type AchievementTierId = keyof typeof ACHIEVEMENT_TIER_NAMES;
export const ACHIEVEMENT_TIER_IDS = Object.keys(ACHIEVEMENT_TIER_NAMES) as AchievementTierId[];
export type AchievementTierRank = 0 | 1 | 2 | 3 | 4 | 5;
export type AchievementTierProgress = Record<AchievementTierId, {count:number; claimed:AchievementTierRank}>;
export type AchievementTierAward = {id:AchievementTierId; rank:AchievementTierRank; target:number; cash:number};
export type AchievementTierRow = {
  id:AchievementTierId;
  name:string;
  count:number;
  rank:AchievementTierRank;
  nextTarget:number|null;
  /** Extra tier cash; existing one-off awards can pay on the same event. */
  nextCash:number|null;
};

const commonRewards = [0, 350, 1_500, 5_000, 20_000] as const;
const newFamilyRewards = [100, 350, 1_500, 5_000, 20_000] as const;
const deliveryRewards = [0, 0, 0, 50_000, 200_000] as const;
// These families have no guaranteed cash-bearing legacy award for their first
// event (a stock-car Dome touch, for example, has no old badge).
const newFamilies = new Set<AchievementTierId>(['pickups','early-pickups','early-deliveries','supply-pickups',
  'parking-successes','queue-successes','races-finished','races-won','dome-matches','dome-wins']);

function rewards(id:AchievementTierId):readonly number[] {
  return id==='deliveries'?deliveryRewards:newFamilies.has(id)?newFamilyRewards:commonRewards;
}

function rankAt(count:number):AchievementTierRank {
  return ACHIEVEMENT_TIER_LADDER.filter(target=>count>=target).length as AchievementTierRank;
}

/** Reject corrupted or partial saved state rather than resetting it to zero. */
export function isAchievementTierProgress(value:unknown):value is AchievementTierProgress {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const obj=value as Record<string,unknown>,keys=Object.keys(obj);
  if(keys.length!==ACHIEVEMENT_TIER_IDS.length||ACHIEVEMENT_TIER_IDS.some(id=>!Object.hasOwn(obj,id)))return false;
  for(const id of ACHIEVEMENT_TIER_IDS){
    const item=obj[id];
    if(!item||typeof item!=='object'||Array.isArray(item))return false;
    const entry=item as Record<string,unknown>;
    if(Object.keys(entry).length!==2||!Object.hasOwn(entry,'count')||!Object.hasOwn(entry,'claimed')||
      !Number.isSafeInteger(entry.count)||Number(entry.count)<0||Number(entry.count)>ACHIEVEMENT_TIER_CAP||
      !Number.isSafeInteger(entry.claimed)||entry.claimed!==rankAt(Number(entry.count)))return false;
  }
  return true;
}

/**
 * Missing legacy fields start from evidence that survives in the profile.
 * All ranks already reached are marked claimed, without issuing back pay.
 * Pass `undefined` only when the whole tier field is absent, not malformed.
 */
export function normalizeAchievementTiers(stored:unknown,completed:number,unlocked:readonly AchievementId[]):AchievementTierProgress {
  if(!Number.isSafeInteger(completed)||completed<0||!Array.isArray(unlocked))throw new TypeError('Invalid legacy achievement state');
  if(stored!==undefined){
    if(!isAchievementTierProgress(stored))throw new TypeError('Invalid achievement tier progress');
    return Object.fromEntries(ACHIEVEMENT_TIER_IDS.map(id=>[id,{...stored[id]}])) as AchievementTierProgress;
  }
  const ids=new Set(unlocked);
  const has=(...badges:AchievementId[])=>badges.some(badge=>ids.has(badge));
  const values:Partial<Record<AchievementTierId,number>>={
    deliveries:Math.min(completed,ACHIEVEMENT_TIER_CAP),
    'rooftop-deliveries':Number(has('sky-delivery')),
    'roof-landings':Number(has('roof-rider','coit-landing','salesforce-landing')),
    'bay-crossings':Number(has('bay-hopper')),
    'parking-successes':Number(has('park-it')),
    'queue-successes':Number(has('queue-cutter')),
    'races-finished':Number(has('race-finisher','race-winner')),
    'races-won':Number(has('race-winner')),
    'dome-matches':Number(has('rocket-rookie','built-to-fly','roadster-champion','garage-champion','no-rockets-needed')),
    'dome-wins':Number(has('roadster-champion','garage-champion','no-rockets-needed')),
  };
  return Object.fromEntries(ACHIEVEMENT_TIER_IDS.map(id=>{
    const count=values[id]??0;
    return [id,{count,claimed:rankAt(count)}];
  })) as AchievementTierProgress;
}

/** Read-only rows suitable for an owner wallet or UI; never scans world entities. */
export function selectAchievementTiers(progress:AchievementTierProgress):AchievementTierRow[] {
  if(!isAchievementTierProgress(progress))throw new TypeError('Invalid achievement tier progress');
  return ACHIEVEMENT_TIER_IDS.map(id=>{
    const {count,claimed}=progress[id];
    return {id,name:ACHIEVEMENT_TIER_NAMES[id],count,rank:claimed,
      nextTarget:(ACHIEVEMENT_TIER_LADDER as readonly number[])[claimed]??null,nextCash:rewards(id)[claimed]??null};
  });
}

/**
 * Compute one authoritative event's increments and awards as one value.
 * This function has no event ledger; the caller must deduplicate the event ID
 * and commit both progress and cash within the same fenced transaction.
 */
export function applyAchievementTierEvent(progress:AchievementTierProgress,ids:readonly AchievementTierId[]):{
  progress:AchievementTierProgress;awards:AchievementTierAward[];cash:number;
} {
  if(!isAchievementTierProgress(progress)||!Array.isArray(ids))throw new TypeError('Invalid achievement tier event');
  const eventIds:readonly AchievementTierId[]=ids;
  const seen=new Set<AchievementTierId>();
  for(const id of eventIds){
    if(!Object.hasOwn(ACHIEVEMENT_TIER_NAMES,id)||seen.has(id))throw new TypeError('Invalid achievement tier event family');
    seen.add(id);
  }
  const next=Object.fromEntries(ACHIEVEMENT_TIER_IDS.map(id=>[id,{...progress[id]}])) as AchievementTierProgress;
  const awards:AchievementTierAward[]=[];
  let cash=0;
  for(const id of eventIds){
    const current=next[id];
    if(current.count===ACHIEVEMENT_TIER_CAP)continue;
    current.count++;
    const rank=rankAt(current.count);
    if(rank>current.claimed){
      const reward=rewards(id)[rank-1];
      current.claimed=rank;
      awards.push({id,rank,target:ACHIEVEMENT_TIER_LADDER[rank-1],cash:reward});
      cash+=reward;
    }
  }
  return {progress:next,awards,cash};
}

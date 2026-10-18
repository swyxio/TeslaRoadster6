import type { AchievementId } from './achievements';
import { LUXURY_DISCOVERY } from './luxury';
import { RESEARCH_SITES } from './research';
import type { DomeParticipant } from './soccer';
import { isVehicleCollectionEvidence, type VehicleCollectionEvidence } from './vehicle-collections';

/**
 * Facts captured by the authoritative room when the event occurs. These are
 * internal journal records, not claims accepted from a client. In particular,
 * the room must verify the physical contact or completed result before capture.
 */
export type AchievementEvidence =
  | {kind:'roof';roof:'ordinary'|'coit'|'salesforce'}
  | {kind:'site';site:'mission-san-jose'|'san-jose-city-hall'|'ucsf'|'berkeley'|'stanford'|'sfo'|'luxury-showroom'}
  | {kind:'crossing';origin:'sf'|'oakland';destination:'sf'|'oakland';crossedWater:boolean}
  | {kind:'parking';mode:'park'|'queue';finished:boolean}
  | {kind:'race';status:'entered'|'finished'|'dnf';phase:'lobby'|'countdown'|'active'|'results';rank:number|null;starterCount:number}
  | {kind:'dome';touches:DomeParticipant['touches'];goals:DomeParticipant['goals'];won:boolean}
  | VehicleCollectionEvidence;

export type AchievementAward = {id:AchievementId;reward:number};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const oneOf=(value:unknown,values:readonly string[])=>typeof value==='string'&&values.includes(value);
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const carClasses=['roadster','retrofit','stock'] as const;

/** Validate stored evidence before applying it; validation alone does not establish its provenance. */
export function isAchievementEvidence(value:unknown):value is AchievementEvidence {
  if(!record(value))return false;
  switch(value.kind){
    case 'roof':return oneOf(value.roof,['ordinary','coit','salesforce']);
    case 'site':return oneOf(value.site,['mission-san-jose','san-jose-city-hall','ucsf','berkeley','stanford','sfo','luxury-showroom']);
    case 'crossing':return oneOf(value.origin,['sf','oakland'])&&oneOf(value.destination,['sf','oakland'])&&typeof value.crossedWater==='boolean';
    case 'parking':return oneOf(value.mode,['park','queue'])&&typeof value.finished==='boolean';
    case 'race':return oneOf(value.status,['entered','finished','dnf'])&&oneOf(value.phase,['lobby','countdown','active','results'])&&
      (value.rank===null||(count(value.rank)&&value.rank!==0))&&count(value.starterCount);
    case 'dome':return record(value.touches)&&record(value.goals)&&typeof value.won==='boolean'&&
      carClasses.every(key=>typeof (value.touches as Record<string,unknown>)[key]==='boolean'&&count((value.goals as Record<string,unknown>)[key]));
    case 'vehicle-driven':case 'npc-stolen':return isVehicleCollectionEvidence({kind:value.kind,vehicle:value.vehicle});
    default:return false;
  }
}

/**
 * Apply one immutable observation against committed unlocks. Rewards come
 * from fixed game rules, not an amount in the observation. Delivery, purchase,
 * Mars boarding and balance-dependent milestones have separate prerequisites.
 */
export function evaluateAchievementEvidence(unlocked:readonly AchievementId[],evidence:AchievementEvidence):AchievementAward[] {
  if(!isAchievementEvidence(evidence))return [];
  const seen=new Set<AchievementId>(unlocked),awards:AchievementAward[]=[];
  const award=(id:AchievementId,reward:number)=>{if(!seen.has(id)){seen.add(id);awards.push({id,reward});}};
  switch(evidence.kind){
    case 'roof':
      award('roof-rider',500);
      if(evidence.roof==='coit')award('coit-landing',1_000);
      if(evidence.roof==='salesforce')award('salesforce-landing',1_000);
      break;
    case 'site': {
      if(evidence.site==='mission-san-jose')award('fremont-mission',500);
      else if(evidence.site==='san-jose-city-hall')award('san-jose-city-hall',500);
      else if(evidence.site==='luxury-showroom')award(LUXURY_DISCOVERY.id,LUXURY_DISCOVERY.reward);
      else {
        const site=RESEARCH_SITES.find(item=>item.landmark===evidence.site);
        if(site)award(site.achievement,site.cash);
      }
      break;
    }
    case 'crossing':
      if(evidence.crossedWater&&evidence.origin!==evidence.destination)award('bay-hopper',500);
      break;
    case 'parking':
      if(evidence.finished)award(evidence.mode==='park'?'park-it':'queue-cutter',0);
      break;
    case 'race':
      if(evidence.status==='finished'){
        award('race-finisher',0);
        if((evidence.phase==='active'||evidence.phase==='results')&&evidence.rank===1&&evidence.starterCount>=2)award('race-winner',0);
      }
      break;
    case 'dome': {
      const {touches,goals,won}=evidence;
      if(touches.roadster)award('rocket-rookie',500);
      if(touches.retrofit)award('built-to-fly',500);
      if(won&&touches.roadster&&goals.roadster>0)award('roadster-champion',500);
      if(won&&touches.retrofit&&goals.retrofit>0)award('garage-champion',500);
      if(won&&touches.stock&&goals.stock>0&&!touches.roadster&&!touches.retrofit)award('no-rockets-needed',500);
      break;
    }
  }
  return awards;
}

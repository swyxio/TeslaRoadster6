import type { Entity, Player } from './game';
import { REGIONS, insidePolygon, isLand, terrainHeight } from './map';
import { RESEARCH_SITES, researchArrival } from './research';
import type { DomeParticipant } from './soccer';

export const ACHIEVEMENTS = {
  'bay-hopper': { name:'Bay Hopper', description:'Fly from San Francisco to Oakland, or back, without landing on a bridge or island.' },
  'roof-rider': { name:'Roof Rider', description:'Land a car on a building rooftop.' },
  'sky-delivery': { name:'Sky Delivery', description:'Complete a rooftop delivery.' },
  'regular': { name:'Neighborhood Regular', description:'Complete three deliveries.' },
  'ucsf-research': { name:'UCSF · Homes Lab', description:'Stop at UCSF Parnassus. Earn $20 and start home research.' },
  'berkeley-research': { name:'Berkeley · Energy Lab', description:'Stop at the Campanile. Earn $35 and 20% off efficient nozzles this drive.' },
  'stanford-research': { name:'Stanford · Speed Lab', description:'Stop at Hoover Tower. Earn $50 and 20% off sport motors this drive.' },
  'sfo-ground-crew': { name:'SFO · Flight Lab', description:'Stop at the SFO tower. Earn $40 and 20% off air tank upgrades this drive.' },
  'sfo-express': { name:'SFO Express', description:'Complete a delivery to SFO for an extra $80.' },
  'rocket-rookie': { name:'Rocket Rookie', description:'Touch the ball in Roadster · Rocket and finish a Rocket Dome match.' },
  'roadster-champion': { name:'Roadster Champion', description:'Win a Rocket Dome match with a goal credited to your Roadster · Rocket.' },
  'built-to-fly': { name:'Built to Fly', description:'Touch the ball in a rocket-retrofitted car and finish a Rocket Dome match.' },
  'garage-champion': { name:'Garage Champion', description:'Win a Rocket Dome match with a goal credited to your rocket-retrofitted car.' },
  'no-rockets-needed': { name:'No Rockets Needed', description:'Win with a goal, touching the ball only in cars without rockets.' },
  'to-mars': { name:'To Mars', description:'Fund the room’s $1 billion mission together and board at the Fremont spaceport.' },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;
type Shore = 'sf' | 'oakland';
export type AchievementState = { unlocked:AchievementId[]; lastUnlock:{id:number; achievement:AchievementId}|null; groundShore:Shore|null; crossing:{origin:Shore; entityId:string; crossedWater:boolean}|null; lastPosition:{x:number; z:number}|null };
export function initialAchievements():AchievementState { return {unlocked:[],lastUnlock:null,groundShore:null,crossing:null,lastPosition:null}; }
export function resetAchievementFlight(player:Player):void {player.achievements.groundShore=null;player.achievements.crossing=null;player.achievements.lastPosition=null;}
function unlock(state:AchievementState,achievement:AchievementId):void {
  if(state.unlocked.includes(achievement))return;
  state.unlocked.push(achievement);state.lastUnlock={id:(state.lastUnlock?.id??0)+1,achievement};
}
export function awardMarsAchievement(player:Player):void { unlock(player.achievements,'to-mars'); }
/** Award completed Dome matches from server-owned touches and goal credits. */
export function awardDomeMatchAchievements(player:Player,participant:DomeParticipant,won:boolean):void {
  const state=player.achievements;
  if(participant.touches.roadster)unlock(state,'rocket-rookie');
  if(participant.touches.retrofit)unlock(state,'built-to-fly');
  if(!won)return;
  if(participant.touches.roadster&&participant.goals.roadster>0)unlock(state,'roadster-champion');
  if(participant.touches.retrofit&&participant.goals.retrofit>0)unlock(state,'garage-champion');
  if(participant.touches.stock&&participant.goals.stock>0&&!participant.touches.roadster&&!participant.touches.retrofit)unlock(state,'no-rockets-needed');
}
// Region polygons also contain the Peninsula and East Bay; the achievement's
// endpoints are the SF and Oakland city grids, not the full Bay corridor.
function shore(e:Entity):Shore|null {
  if(e.z < -300 || e.z > 300)return null;
  for(const region of REGIONS){
    if(region.id==='sf'&&e.x>=-410&&e.x<=105&&insidePolygon(e.x,e.z,region.points))return 'sf';
    if(region.id==='oakland'&&e.x>=270&&e.x<=610&&insidePolygon(e.x,e.z,region.points))return 'oakland';
  }
  return null;
}
export function onRoof(e:Entity):boolean {
  return e.kind!=='person' && e.supportId?.startsWith('roof:')===true;
}
export function updateAchievements(player:Player,e:Entity,rooftopDelivered:boolean,deliveredCustomerId?:string,sameTickReward=false):void {
  const state=player.achievements, region=shore(e), roof=onRoof(e);
  const grounded=e.supportId!==null;
  // A recovery or a vehicle switch is not a flight across the Bay.
  if(state.lastPosition&&Math.hypot(e.x-state.lastPosition.x,e.z-state.lastPosition.z)>15)resetAchievementFlight(player);
  if(state.crossing&&state.crossing.entityId!==e.id)resetAchievementFlight(player);
  if(e.kind==='person'){state.groundShore=null;state.crossing=null;}
  else if(grounded){
    if(roof)unlock(state,'roof-rider');
    if(state.crossing?.crossedWater&&region&&region!==state.crossing.origin)unlock(state,'bay-hopper');
    state.crossing=null;state.groundShore=region;
  } else {
    if(!state.crossing&&state.groundShore)state.crossing={origin:state.groundShore,entityId:e.id,crossedWater:false};
    if(state.crossing){
      if(!isLand(e.x,e.z))state.crossing.crossedWater=true;
      if(state.crossing.crossedWater&&region&&region!==state.crossing.origin){unlock(state,'bay-hopper');state.crossing=null;state.groundShore=null;}
    }
  }
  if(rooftopDelivered)unlock(state,'sky-delivery');
  if(player.delivery.completed>=3)unlock(state,'regular');
  let researchCash=0;
  if(e.kind!=='person'&&!e.inDome&&e.supportId==='ground'&&Math.abs(e.speed)<=4&&Math.abs(e.vy)<.1){
    for(const site of RESEARCH_SITES){
      const target=researchArrival(site),height=terrainHeight(target.x,target.z);
      if(height!==null&&Math.hypot(e.x-target.x,e.y-height,e.z-target.z)<=9&&!state.unlocked.includes(site.achievement)){
        unlock(state,site.achievement);researchCash+=site.cash;
      }
    }
  }
  if(deliveredCustomerId==='landmark-sfo'&&!state.unlocked.includes('sfo-express')){
    unlock(state,'sfo-express');researchCash+=80;
  }
  if(researchCash){
    // Research cash is a one-off award; session delivery earnings remain delivery-only.
    player.delivery.cash+=researchCash;
    const reward=player.delivery.lastReward;
    if(sameTickReward&&reward&&(reward.kind==='pickup'||reward.kind==='delivery')){
      player.delivery.lastReward={id:reward.id,kind:reward.kind==='pickup'?'pickup-research':'delivery-research',amount:reward.amount+researchCash};
    }else player.delivery.lastReward={id:(reward?.id??0)+1,kind:'research',amount:researchCash};
  }
  state.lastPosition={x:e.x,z:e.z};
}

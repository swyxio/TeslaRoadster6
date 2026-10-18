import type { Entity, Player } from './game';
import { updateLevel } from './delivery';
import { LUXURY_DISCOVERY, atLuxuryShowroom } from './luxury';
import { BUILDINGS, LANDMARKS, REGIONS, insidePolygon, isLand, terrainHeight } from './map';
import { RESEARCH_SITES, researchArrival } from './research';
import type { DomeParticipant } from './soccer';

export const ACHIEVEMENTS = {
  'bay-hopper': { name:'Bay Hopper', description:'Fly from San Francisco to Oakland, or back, without landing on a bridge or island. Reward: $1,000.' },
  'roof-rider': { name:'Roof Rider', description:'Land a car on a building rooftop. Reward: $1,000.' },
  'sky-delivery': { name:'Sky Delivery', description:'Complete a rooftop delivery. Reward: $2,000.' },
  'regular': { name:'Neighborhood Regular', description:'Complete three deliveries. Reward: $1,000.' },
  'deliveries-1': { name:'First Delivery', description:'Complete your first delivery. Reward: $2,500.' },
  'deliveries-5': { name:'Five on the Road', description:'Complete 5 deliveries. Reward: $1,500.' },
  'deliveries-10': { name:'Delivery Driver · Level 2', description:'Complete 10 deliveries. Reward: $5,000.' },
  'deliveries-20': { name:'Twenty on the Road', description:'Complete 20 deliveries. Reward: $2,000.' },
  'deliveries-25': { name:'Delivery Driver · Level 3', description:'Complete 25 deliveries. Reward: $7,500.' },
  'deliveries-30': { name:'Thirty on the Road', description:'Complete 30 deliveries. Reward: $2,500.' },
  'deliveries-40': { name:'Forty on the Road', description:'Complete 40 deliveries. Reward: $3,000.' },
  'deliveries-50': { name:'Delivery Driver · Level 4', description:'Complete 50 deliveries. Reward: $10,000.' },
  'deliveries-75': { name:'Seventy-five on the Road', description:'Complete 75 deliveries. Reward: $5,000.' },
  'deliveries-100': { name:'Delivery Driver · Level 5', description:'Complete 100 deliveries. Reward: $20,000.' },
  'deliveries-150': { name:'One Hundred Fifty on the Road', description:'Complete 150 deliveries. Reward: $10,000.' },
  'deliveries-200': { name:'Two Hundred on the Road', description:'Complete 200 deliveries. Reward: $15,000.' },
  'deliveries-250': { name:'Two Hundred Fifty on the Road', description:'Complete 250 deliveries. Reward: $40,000.' },
  'region-oakland': { name:'Oakland and Berkeley', description:'Reach $10,000 to open Oakland and Berkeley. Reward: $1,000.' },
  'region-peninsula': { name:'The Peninsula and East Bay', description:'Reach $50,000 to open the Peninsula and East Bay. Reward: $2,000.' },
  'region-san-jose': { name:'San Jose', description:'Reach $250,000 to open San Jose. Reward: $5,000.' },
  'fremont-mission': { name:'Fremont · Mission San José', description:'Visit Mission San José. Reward: $1,000.' },
  'san-jose-city-hall': { name:'San José · City Hall', description:'Visit San José City Hall. Reward: $1,000.' },
  'coit-landing': { name:'Coit Tower Landing', description:'Land on Coit Tower. Reward: $2,000.' },
  'salesforce-landing': { name:'Salesforce Tower Landing', description:'Land on Salesforce Tower. Reward: $2,000.' },
  'ucsf-research': { name:'UCSF · Homes Lab', description:'Visit UCSF Parnassus. Reward: $1,000.' },
  'berkeley-research': { name:'Berkeley · Energy Lab', description:'Visit the Campanile. Earn $1,500 and 20% off efficient nozzles.' },
  'stanford-research': { name:'Stanford · Speed Lab', description:'Visit Hoover Tower. Earn $2,000 and 20% off sport motors.' },
  'sfo-ground-crew': { name:'SFO · Flight Lab', description:'Visit the SFO tower. Earn $2,000 and 20% off air tank upgrades.' },
  'sfo-express': { name:'SFO Express', description:'Complete a delivery to SFO. Reward: $2,500.' },
  'luxury-visit': { name:'The Vault', description:'Discover the luxury showroom in Palo Alto. Reward: $5,000.' },
  'luxury-first': { name:'Keys to the Vault', description:'Buy your first luxury vehicle. Reward: $25,000.' },
  'luxury-panigale': { name:'Ducati Panigale V4', description:'Buy the Panigale V4 at the Vault. Reward: $20,000.' },
  'luxury-ninja': { name:'Kawasaki Ninja H2 Carbon', description:'Buy the Ninja H2 Carbon at the Vault. Reward: $25,000.' },
  'luxury-temerario': { name:'Lamborghini Temerario', description:'Buy the Temerario at the Vault. Reward: $40,000.' },
  'luxury-revuelto': { name:'Lamborghini Revuelto', description:'Buy the Revuelto at the Vault. Reward: $60,000.' },
  'luxury-chiron': { name:'Bugatti Chiron', description:'Buy the Chiron at the Vault. Reward: $100,000.' },
  'luxury-tourbillon': { name:'Bugatti Tourbillon', description:'Buy the Tourbillon at the Vault. Reward: $150,000.' },
  'luxury-collection-2': { name:'The Collection · 2', description:'Own two different Vault vehicles. Reward: $50,000.' },
  'luxury-collection-4': { name:'The Collection · 4', description:'Own four different Vault vehicles. Reward: $100,000.' },
  'luxury-collection-6': { name:'The Collection · 6', description:'Own all six Vault vehicles. Reward: $250,000.' },
  'rocket-rookie': { name:'Rocket Rookie', description:'Touch the ball in Roadster · Rocket and finish a Rocket Dome match. Reward: $2,000.' },
  'roadster-champion': { name:'Roadster Champion', description:'Win a Rocket Dome match with a goal credited to your Roadster · Rocket. Reward: $2,000.' },
  'built-to-fly': { name:'Built to Fly', description:'Touch the ball in a rocket-retrofitted car and finish a Rocket Dome match. Reward: $2,000.' },
  'garage-champion': { name:'Garage Champion', description:'Win a Rocket Dome match with a goal credited to your rocket-retrofitted car. Reward: $2,000.' },
  'no-rockets-needed': { name:'No Rockets Needed', description:'Win with a goal, touching the ball only in cars without rockets. Reward: $2,000.' },
  'to-mars': { name:'To Mars', description:'Join the $1 billion global mission and board at the Fremont spaceport. Reward: $10,000.' },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;
const DELIVERY_MILESTONES=[
  {count:1,id:'deliveries-1',reward:2_500}, {count:3,id:'regular',reward:1_000},
  {count:5,id:'deliveries-5',reward:1_500}, {count:10,id:'deliveries-10',reward:5_000},
  {count:20,id:'deliveries-20',reward:2_000}, {count:25,id:'deliveries-25',reward:7_500},
  {count:30,id:'deliveries-30',reward:2_500}, {count:40,id:'deliveries-40',reward:3_000},
  {count:50,id:'deliveries-50',reward:10_000}, {count:75,id:'deliveries-75',reward:5_000},
  {count:100,id:'deliveries-100',reward:20_000}, {count:150,id:'deliveries-150',reward:10_000},
  {count:200,id:'deliveries-200',reward:15_000}, {count:250,id:'deliveries-250',reward:40_000},
] as const;
const REGION_MILESTONES=[
  {cash:10_000,id:'region-oakland',reward:1_000},
  {cash:50_000,id:'region-peninsula',reward:2_000},
  {cash:250_000,id:'region-san-jose',reward:5_000},
] as const;
const LANDMARK_VISITS=([
  {landmark:'mission-san-jose',id:'fremont-mission'},
  {landmark:'san-jose-city-hall',id:'san-jose-city-hall'},
] as const).map(visit=>({...visit,arrival:LANDMARKS.find(landmark=>landmark.id===visit.landmark)!.arrival}));
type Shore = 'sf' | 'oakland';
export type AchievementState = { unlocked:AchievementId[]; lastUnlock:{id:number; achievement:AchievementId}|null; groundShore:Shore|null; crossing:{origin:Shore; entityId:string; crossedWater:boolean}|null; lastPosition:{x:number; z:number}|null };
export function initialAchievements():AchievementState { return {unlocked:[],lastUnlock:null,groundShore:null,crossing:null,lastPosition:null}; }
export function resetAchievementFlight(player:Player):void {player.achievements.groundShore=null;player.achievements.crossing=null;player.achievements.lastPosition=null;}
function unlock(state:AchievementState,achievement:AchievementId):boolean {
  if(state.unlocked.includes(achievement))return false;
  state.unlocked.push(achievement);state.lastUnlock={id:(state.lastUnlock?.id??0)+1,achievement};
  return true;
}
function creditAwards(player:Player,amount:number,sameTickReward=false):void {
  if(!amount)return;
  player.delivery.cash+=amount;
  player.delivery.lifetimeIncome+=amount;
  updateLevel(player.delivery);
  const reward=player.delivery.lastReward;
  if(sameTickReward&&reward&&(reward.kind==='pickup'||reward.kind==='delivery')){
    player.delivery.lastReward={id:reward.id,kind:reward.kind==='pickup'?'pickup-research':'delivery-research',amount:reward.amount+amount};
  }else player.delivery.lastReward={id:(reward?.id??0)+1,kind:'research',amount};
}
export function awardMarsAchievement(player:Player):void { if(unlock(player.achievements,'to-mars'))creditAwards(player,10_000); }
/** Award completed Dome matches from server-owned touches and goal credits. */
export function awardDomeMatchAchievements(player:Player,participant:DomeParticipant,won:boolean):void {
  const state=player.achievements;
  let cash=0;
  if(participant.touches.roadster&&unlock(state,'rocket-rookie'))cash+=2_000;
  if(participant.touches.retrofit&&unlock(state,'built-to-fly'))cash+=2_000;
  if(won&&participant.touches.roadster&&participant.goals.roadster>0&&unlock(state,'roadster-champion'))cash+=2_000;
  if(won&&participant.touches.retrofit&&participant.goals.retrofit>0&&unlock(state,'garage-champion'))cash+=2_000;
  if(won&&participant.touches.stock&&participant.goals.stock>0&&!participant.touches.roadster&&!participant.touches.retrofit&&unlock(state,'no-rockets-needed'))cash+=2_000;
  creditAwards(player,cash);
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
  let researchCash=0;
  const grounded=e.supportId!==null;
  // A recovery or a vehicle switch is not a flight across the Bay.
  if(state.lastPosition&&Math.hypot(e.x-state.lastPosition.x,e.z-state.lastPosition.z)>15)resetAchievementFlight(player);
  if(state.crossing&&state.crossing.entityId!==e.id)resetAchievementFlight(player);
  if(e.kind==='person'){state.groundShore=null;state.crossing=null;}
  else if(grounded){
    if(roof&&unlock(state,'roof-rider'))researchCash+=1_000;
    if(roof){
      const style=BUILDINGS[Number(e.supportId!.slice('roof:'.length))]?.style;
      if(style==='coit'&&unlock(state,'coit-landing'))researchCash+=2_000;
      if(style==='salesforce'&&unlock(state,'salesforce-landing'))researchCash+=2_000;
    }
    if(state.crossing?.crossedWater&&region&&region!==state.crossing.origin&&unlock(state,'bay-hopper'))researchCash+=1_000;
    state.crossing=null;state.groundShore=region;
  } else {
    if(!state.crossing&&state.groundShore)state.crossing={origin:state.groundShore,entityId:e.id,crossedWater:false};
    if(state.crossing){
      if(!isLand(e.x,e.z))state.crossing.crossedWater=true;
      if(state.crossing.crossedWater&&region&&region!==state.crossing.origin){if(unlock(state,'bay-hopper'))researchCash+=1_000;state.crossing=null;state.groundShore=null;}
    }
  }
  if(rooftopDelivered&&unlock(state,'sky-delivery'))researchCash+=2_000;
  for(const milestone of DELIVERY_MILESTONES){
    if(player.delivery.completed>=milestone.count&&!state.unlocked.includes(milestone.id)){
      unlock(state,milestone.id);researchCash+=milestone.reward;
    }
  }
  if(e.kind!=='person'&&!e.inDome&&e.supportId==='ground'&&Math.abs(e.speed)<=4&&Math.abs(e.vy)<.1){
    for(const visit of LANDMARK_VISITS){
      if(state.unlocked.includes(visit.id))continue;
      const height=terrainHeight(visit.arrival.x,visit.arrival.z);
      if(height!==null&&Math.hypot(e.x-visit.arrival.x,e.y-height,e.z-visit.arrival.z)<=9&&unlock(state,visit.id))researchCash+=1_000;
    }
    for(const site of RESEARCH_SITES){
      const target=researchArrival(site),height=terrainHeight(target.x,target.z);
      if(height!==null&&Math.hypot(e.x-target.x,e.y-height,e.z-target.z)<=9&&!state.unlocked.includes(site.achievement)){
        unlock(state,site.achievement);researchCash+=site.cash;
      }
    }
  }
  if(deliveredCustomerId==='landmark-sfo'&&!state.unlocked.includes('sfo-express')){
    unlock(state,'sfo-express');researchCash+=2_500;
  }
  if(atLuxuryShowroom(e)&&!state.unlocked.includes(LUXURY_DISCOVERY.id)){
    unlock(state,LUXURY_DISCOVERY.id);researchCash+=LUXURY_DISCOVERY.reward;
  }
  // Evaluate awards in ascending order so one award can open the next region.
  for(const milestone of REGION_MILESTONES){
    if(player.delivery.cash+researchCash>=milestone.cash&&!state.unlocked.includes(milestone.id)){
      unlock(state,milestone.id);researchCash+=milestone.reward;
    }
  }
  creditAwards(player,researchCash,sameTickReward);
  state.lastPosition={x:e.x,z:e.z};
}

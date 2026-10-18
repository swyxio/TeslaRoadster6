import type { Entity, Player, World } from './game';
import { updateLevel, type DeliveryState } from './delivery';
import { LUXURY_DISCOVERY, atLuxuryShowroom } from './luxury';
import { BUILDINGS, LANDMARKS, REGIONS, insidePolygon, isLand, terrainHeight } from './map';
import { RESEARCH_SITES, researchArrival } from './research';
import type { DomeParticipant } from './soccer';
import type { AchievementAward, AchievementEvidence } from './achievement-evidence';

export const ACHIEVEMENTS = {
  'bay-hopper': { name:'Bay Hopper', description:'Fly from San Francisco to Oakland, or back, without landing on a bridge or island. Reward: $500.' },
  'roof-rider': { name:'Roof Rider', description:'Land a car on a building rooftop. Reward: $500.' },
  'sky-delivery': { name:'Sky Delivery', description:'Complete a rooftop delivery. Reward: $1,000.' },
  'regular': { name:'Neighborhood Regular', description:'Complete three deliveries. Reward: $400.' },
  'deliveries-1': { name:'First Delivery', description:'Complete your first delivery. Reward: $500.' },
  'deliveries-5': { name:'Five on the Road', description:'Complete 5 deliveries. Reward: $600.' },
  'deliveries-10': { name:'Delivery Driver · Level 2', description:'Complete 10 deliveries. Reward: $1,200.' },
  'deliveries-20': { name:'Twenty on the Road', description:'Complete 20 deliveries. Reward: $1,500.' },
  'deliveries-25': { name:'Delivery Driver · Level 3', description:'Complete 25 deliveries. Reward: $2,000.' },
  'deliveries-30': { name:'Thirty on the Road', description:'Complete 30 deliveries. Reward: $2,000.' },
  'deliveries-40': { name:'Forty on the Road', description:'Complete 40 deliveries. Reward: $2,500.' },
  'deliveries-50': { name:'Delivery Driver · Level 4', description:'Complete 50 deliveries. Reward: $5,000.' },
  'deliveries-75': { name:'Seventy-five on the Road', description:'Complete 75 deliveries. Reward: $4,000.' },
  'deliveries-100': { name:'Delivery Driver · Level 5', description:'Complete 100 deliveries. Reward: $10,000.' },
  'deliveries-150': { name:'One Hundred Fifty on the Road', description:'Complete 150 deliveries. Reward: $7,500.' },
  'deliveries-200': { name:'Two Hundred on the Road', description:'Complete 200 deliveries. Reward: $12,000.' },
  'deliveries-250': { name:'Two Hundred Fifty on the Road', description:'Complete 250 deliveries. Reward: $20,000.' },
  'region-oakland': { name:'Oakland and Berkeley', description:'Reach $10,000 to open Oakland and Berkeley. Reward: $500.' },
  'region-peninsula': { name:'The Peninsula and East Bay', description:'Reach $50,000 to open the Peninsula and East Bay. Reward: $1,000.' },
  'region-san-jose': { name:'San Jose', description:'Reach $250,000 to open San Jose. Reward: $2,500.' },
  'fremont-mission': { name:'Fremont · Mission San José', description:'Visit Mission San José. Reward: $500.' },
  'san-jose-city-hall': { name:'San José · City Hall', description:'Visit San José City Hall. Reward: $500.' },
  'coit-landing': { name:'Coit Tower Landing', description:'Land on Coit Tower. Reward: $1,000.' },
  'salesforce-landing': { name:'Salesforce Tower Landing', description:'Land on Salesforce Tower. Reward: $1,000.' },
  'ucsf-research': { name:'UCSF · Homes Lab', description:'Visit UCSF Parnassus. Reward: $250.' },
  'berkeley-research': { name:'Berkeley · Energy Lab', description:'Visit the Campanile. Earn $400 and 20% off efficient nozzles.' },
  'stanford-research': { name:'Stanford · Speed Lab', description:'Visit Hoover Tower. Earn $600 and 20% off sport motors.' },
  'sfo-ground-crew': { name:'SFO · Flight Lab', description:'Visit the SFO tower. Earn $600 and 20% off air tank upgrades.' },
  'sfo-express': { name:'SFO Express', description:'Complete a delivery to SFO. Reward: $1,000.' },
  'luxury-visit': { name:'The Vault', description:'Discover the luxury showroom in Palo Alto. Reward: $1,000.' },
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
  'rocket-rookie': { name:'Rocket Rookie', description:'Touch the ball in Roadster · Rocket and finish a Rocket Dome match. Reward: $500.' },
  'roadster-champion': { name:'Roadster Champion', description:'Win a Rocket Dome match with a goal credited to your Roadster · Rocket. Reward: $500.' },
  'built-to-fly': { name:'Built to Fly', description:'Touch the ball in a rocket-retrofitted car and finish a Rocket Dome match. Reward: $500.' },
  'garage-champion': { name:'Garage Champion', description:'Win a Rocket Dome match with a goal credited to your rocket-retrofitted car. Reward: $500.' },
  'no-rockets-needed': { name:'No Rockets Needed', description:'Win with a goal, touching the ball only in cars without rockets. Reward: $500.' },
  'park-it': { name:'Perfect Park', description:'Complete a Park It challenge.' },
  'queue-cutter': { name:'Queue Cutter', description:'Claim a space in Cut the Queue.' },
  'race-finisher': { name:'Checkered Flag', description:'Finish a race course.' },
  'race-winner': { name:'First Across', description:'Finish first in a race that started with at least two drivers.' },
  'to-mars': { name:'To Mars', description:'Join the $1 billion global mission and board at the Fremont spaceport. Reward: $10,000.' },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;
const DELIVERY_MILESTONES=[
  {count:1,id:'deliveries-1',reward:500}, {count:3,id:'regular',reward:400},
  {count:5,id:'deliveries-5',reward:600}, {count:10,id:'deliveries-10',reward:1_200},
  {count:20,id:'deliveries-20',reward:1_500}, {count:25,id:'deliveries-25',reward:2_000},
  {count:30,id:'deliveries-30',reward:2_000}, {count:40,id:'deliveries-40',reward:2_500},
  {count:50,id:'deliveries-50',reward:5_000}, {count:75,id:'deliveries-75',reward:4_000},
  {count:100,id:'deliveries-100',reward:10_000}, {count:150,id:'deliveries-150',reward:7_500},
  {count:200,id:'deliveries-200',reward:12_000}, {count:250,id:'deliveries-250',reward:20_000},
] as const;
const REGION_MILESTONES=[
  {cash:10_000,id:'region-oakland',reward:500},
  {cash:50_000,id:'region-peninsula',reward:1_000},
  {cash:250_000,id:'region-san-jose',reward:2_500},
] as const;
const LANDMARK_VISITS=([
  {landmark:'mission-san-jose',id:'fremont-mission'},
  {landmark:'san-jose-city-hall',id:'san-jose-city-hall'},
] as const).map(visit=>({...visit,arrival:LANDMARKS.find(landmark=>landmark.id===visit.landmark)!.arrival}));
type Shore = 'sf' | 'oakland';
type RoofFlight = {entityId:string;x:number;y:number;z:number;supported:boolean;
  flight:{seconds:number;startY:number;rise:number;travel:number}|null};
export type AchievementState = { unlocked:AchievementId[]; lastUnlock:{id:number; achievement:AchievementId}|null; groundShore:Shore|null; crossing:{origin:Shore; entityId:string; crossedWater:boolean}|null; lastPosition:{x:number; z:number}|null; roofFlight:RoofFlight|null };
export function initialAchievements():AchievementState { return {unlocked:[],lastUnlock:null,groundShore:null,crossing:null,lastPosition:null,roofFlight:null}; }
export function resetAchievementFlight(player:Player):void {player.achievements.groundShore=null;player.achievements.crossing=null;player.achievements.lastPosition=null;player.achievements.roofFlight=null;}
function unlock(state:AchievementState,achievement:AchievementId):boolean {
  if(state.unlocked.includes(achievement))return false;
  state.unlocked.push(achievement);state.lastUnlock={id:(state.lastUnlock?.id??0)+1,achievement};
  return true;
}
function creditAwards(player:Pick<Player,'delivery'>,amount:number,sameTickReward=false):void {
  if(!amount)return;
  player.delivery.cash+=amount;
  player.delivery.lifetimeIncome+=amount;
  updateLevel(player.delivery);
  const reward=player.delivery.lastReward;
  if(sameTickReward&&reward&&(reward.kind==='pickup'||reward.kind==='delivery'||reward.kind==='pickup-research'||reward.kind==='delivery-research')){
    player.delivery.lastReward={id:reward.id,kind:reward.kind==='pickup'||reward.kind==='pickup-research'?'pickup-research':'delivery-research',amount:reward.amount+amount};
  }else player.delivery.lastReward={id:(reward?.id??0)+1,kind:'research',amount};
}
function deliveryAwards(state:AchievementState,completed:number,rooftopDelivered:boolean):number {
  let cash=0;
  if(rooftopDelivered&&unlock(state,'sky-delivery'))cash+=1_000;
  for(const milestone of DELIVERY_MILESTONES)
    if(completed>=milestone.count&&unlock(state,milestone.id))cash+=milestone.reward;
  return cash;
}
function sfoDeliveryAward(state:AchievementState,deliveredCustomerId:string|undefined):number {
  return deliveredCustomerId==='landmark-sfo'&&unlock(state,'sfo-express')?1_000:0;
}
function regionAwards(state:AchievementState,cash:number,pending:number):number {
  let awarded=0;
  for(const milestone of REGION_MILESTONES)
    if(cash+pending+awarded>=milestone.cash&&unlock(state,milestone.id))awarded+=milestone.reward;
  return awarded;
}
/** Apply only awards whose prerequisites are a committed delivery and balance. */
export function applyDeliveryAwards(delivery:DeliveryState,state:AchievementState,rooftopDelivered:boolean,
  deliveredCustomerId:string|undefined,sameTickReward:boolean):AchievementId[] {
  const before=state.unlocked.length;
  let cash=deliveryAwards(state,delivery.completed,rooftopDelivered)+sfoDeliveryAward(state,deliveredCustomerId);
  cash+=regionAwards(state,delivery.cash,cash);
  creditAwards({delivery},cash,sameTickReward);
  return state.unlocked.slice(before);
}
/** Apply validated physical or match awards against the committed balance. */
export function applyAchievementAwards(delivery:DeliveryState,state:AchievementState,awards:readonly AchievementAward[]):AchievementId[] {
  const before=state.unlocked.length;
  let cash=0;
  for(const award of awards)if(unlock(state,award.id))cash+=award.reward;
  cash+=regionAwards(state,delivery.cash,cash);
  creditAwards({delivery},cash);
  return state.unlocked.slice(before);
}
export function awardMarsAchievement(player:Player):void { if(unlock(player.achievements,'to-mars'))creditAwards(player,10_000); }
/** Award completed Dome matches from server-owned touches and goal credits. */
export function awardDomeMatchAchievements(player:Player,participant:DomeParticipant,won:boolean):void {
  const state=player.achievements;
  let cash=0;
  if(participant.touches.roadster&&unlock(state,'rocket-rookie'))cash+=500;
  if(participant.touches.retrofit&&unlock(state,'built-to-fly'))cash+=500;
  if(won&&participant.touches.roadster&&participant.goals.roadster>0&&unlock(state,'roadster-champion'))cash+=500;
  if(won&&participant.touches.retrofit&&participant.goals.retrofit>0&&unlock(state,'garage-champion'))cash+=500;
  if(won&&participant.touches.stock&&participant.goals.stock>0&&!participant.touches.roadster&&!participant.touches.retrofit&&unlock(state,'no-rockets-needed'))cash+=500;
  creditAwards(player,cash);
}

/** Mini-game achievements use only the simulation's completed results. */
export function updateGameAchievements(world:World,player:Player):void {
  for(const round of world.parking.rounds)for(const entrant of round.entrants){
    if(entrant.playerId===player.id&&entrant.finishedAt!==null)
      unlock(player.achievements,round.mode==='park'?'park-it':'queue-cutter');
  }
  for(const round of world.races.rounds)for(const entrant of round.entrants){
    if(entrant.playerId!==player.id||entrant.status!=='finished')continue;
    unlock(player.achievements,'race-finisher');
    if((round.phase==='active'||round.phase==='results')&&entrant.rank===1&&round.starterCount>=2)
      unlock(player.achievements,'race-winner');
  }
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
/** A supported departure and meaningful flight must precede each roof contact. */
function roofLanding(state:AchievementState,e:Entity,dt:number):boolean {
  const previous=state.roofFlight;
  if(e.kind==='person'||e.inDome){state.roofFlight=null;return false;}
  const supported=e.supportId!==null;
  let flight=previous?.flight??null;
  if(!supported&&previous){
    if(previous.supported)flight={seconds:0,startY:previous.y,rise:0,travel:0};
    if(flight){
      flight.seconds+=Math.max(0,Number.isFinite(dt)?dt:0);
      flight.rise=Math.max(flight.rise,e.y-flight.startY);
      flight.travel=Math.min(6,flight.travel+Math.hypot(e.x-previous.x,e.z-previous.z));
    }
  }
  const landed=supported&&onRoof(e)&&!!flight&&flight.seconds>=.35&&(flight.rise>=2||flight.travel>=6);
  state.roofFlight={entityId:e.id,x:e.x,y:e.y,z:e.z,supported,flight:supported?null:flight};
  return landed;
}
export function updateAchievements(player:Player,e:Entity,rooftopDelivered:boolean,deliveredCustomerId?:string,sameTickReward=false,
  evidence?:AchievementEvidence[],physicalOnly=false,dt=0):void {
  const state=player.achievements, region=shore(e), roof=onRoof(e);
  let researchCash=0;
  const grounded=e.supportId!==null;
  // A recovery or a vehicle switch is not a flight across the Bay.
  if(state.lastPosition&&Math.hypot(e.x-state.lastPosition.x,e.z-state.lastPosition.z)>15)resetAchievementFlight(player);
  if(state.roofFlight&&(state.roofFlight.entityId!==e.id||Math.hypot(e.x-state.roofFlight.x,e.y-state.roofFlight.y,e.z-state.roofFlight.z)>15)){
    if(evidence)resetAchievementFlight(player);
    else state.roofFlight=null;
  }
  if(state.crossing&&state.crossing.entityId!==e.id)resetAchievementFlight(player);
  const landed=roofLanding(state,e,dt);
  if(e.kind==='person'){state.groundShore=null;state.crossing=null;}
  else if(grounded){
    if(landed&&evidence){
      const style=BUILDINGS[Number(e.supportId!.slice('roof:'.length))]?.style;
      evidence.push({kind:'roof',roof:style==='coit'?'coit':style==='salesforce'?'salesforce':'ordinary'});
    }else if(roof&&!evidence&&unlock(state,'roof-rider'))researchCash+=500;
    if(roof&&!evidence){
      const style=BUILDINGS[Number(e.supportId!.slice('roof:'.length))]?.style;
      if(style==='coit'&&unlock(state,'coit-landing'))researchCash+=1_000;
      if(style==='salesforce'&&unlock(state,'salesforce-landing'))researchCash+=1_000;
    }
    if(state.crossing?.crossedWater&&region&&region!==state.crossing.origin){
      if(evidence)evidence.push({kind:'crossing',origin:state.crossing.origin,destination:region,crossedWater:true});
      else if(unlock(state,'bay-hopper'))researchCash+=500;
    }
    state.crossing=null;state.groundShore=region;
  } else {
    if(!state.crossing&&state.groundShore)state.crossing={origin:state.groundShore,entityId:e.id,crossedWater:false};
    if(state.crossing){
      if(!isLand(e.x,e.z))state.crossing.crossedWater=true;
      if(state.crossing.crossedWater&&region&&region!==state.crossing.origin){
        if(evidence)evidence.push({kind:'crossing',origin:state.crossing.origin,destination:region,crossedWater:true});
        else if(unlock(state,'bay-hopper'))researchCash+=500;
        state.crossing=null;state.groundShore=null;
      }
    }
  }
  if(!physicalOnly)researchCash+=deliveryAwards(state,player.delivery.completed,rooftopDelivered);
  if(e.kind!=='person'&&!e.inDome&&e.supportId==='ground'&&Math.abs(e.speed)<=4&&Math.abs(e.vy)<.1){
    for(const visit of LANDMARK_VISITS){
      if(!evidence&&state.unlocked.includes(visit.id))continue;
      const height=terrainHeight(visit.arrival.x,visit.arrival.z);
      if(height!==null&&Math.hypot(e.x-visit.arrival.x,e.y-height,e.z-visit.arrival.z)<=9){
        if(evidence)evidence.push({kind:'site',site:visit.landmark});
        else if(unlock(state,visit.id))researchCash+=500;
      }
    }
    for(const site of RESEARCH_SITES){
      const target=researchArrival(site),height=terrainHeight(target.x,target.z);
      if(height!==null&&Math.hypot(e.x-target.x,e.y-height,e.z-target.z)<=9&&(evidence||!state.unlocked.includes(site.achievement))){
        if(evidence)evidence.push({kind:'site',site:site.landmark});
        else {unlock(state,site.achievement);researchCash+=site.cash;}
      }
    }
  }
  if(!physicalOnly)researchCash+=sfoDeliveryAward(state,deliveredCustomerId);
  if(atLuxuryShowroom(e)&&(evidence||!state.unlocked.includes(LUXURY_DISCOVERY.id))){
    if(evidence)evidence.push({kind:'site',site:'luxury-showroom'});
    else {unlock(state,LUXURY_DISCOVERY.id);researchCash+=LUXURY_DISCOVERY.reward;}
  }
  // Evaluate awards in ascending order so one award can open the next region.
  if(!physicalOnly)researchCash+=regionAwards(state,player.delivery.cash,researchCash);
  creditAwards(player,researchCash,sameTickReward);
  state.lastPosition={x:e.x,z:e.z};
}

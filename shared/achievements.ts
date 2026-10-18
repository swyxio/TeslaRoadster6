import type { Entity, Player } from './game';
import { REGIONS, insidePolygon, isLand } from './map';

export const ACHIEVEMENTS = {
  'bay-hopper': { name:'Bay Hopper', description:'Fly from San Francisco to Oakland, or back, without landing on a bridge or island.' },
  'roof-rider': { name:'Roof Rider', description:'Land a car on a building rooftop.' },
  'sky-delivery': { name:'Sky Delivery', description:'Complete a rooftop delivery.' },
  'regular': { name:'Neighborhood Regular', description:'Complete three deliveries.' },
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
export function updateAchievements(player:Player,e:Entity,rooftopDelivered:boolean):void {
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
  state.lastPosition={x:e.x,z:e.z};
}

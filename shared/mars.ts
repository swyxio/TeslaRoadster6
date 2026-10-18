import type { Entity, World } from './game';
import { FREMONT_SPACEPORT } from './map';
import { awardMarsAchievement } from './achievements';

export const MARS_GOAL = 1_000_000_000;
export const BOARDING_RADIUS = 14;
export const MARS_LAUNCH_SECONDS = 12;

export function atMarsBoarding(e:Entity):boolean {
  const p=FREMONT_SPACEPORT.entrance;
  return e.supportId==='ground' && Math.abs(e.speed)<1 && Math.hypot(e.pushX,e.pushZ)<1 && Math.hypot(e.x-p.x,e.z-p.z)<=BOARDING_RADIUS;
}

export function boardMars(world:World,playerId:string):boolean {
  const player=world.players.find(p=>p.id===playerId);
  const entity=world.entities.find(e=>e.id===player?.entityId);
  if(world.mars.fund<MARS_GOAL || !player || !entity || player.achievements.unlocked.includes('to-mars') || !atMarsBoarding(entity)) return false;
  awardMarsAchievement(player);
  if(world.mars.launchAt===null || world.time-world.mars.launchAt>=MARS_LAUNCH_SECONDS) world.mars.launchAt=world.time;
  return true;
}

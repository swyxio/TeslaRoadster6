import type { Entity, World } from './game';
import { FREMONT_SPACEPORT } from './map';
import { awardMarsAchievement } from './achievements';

export const MARS_GOAL = 1_000_000_000;
export const BOARDING_RADIUS = 14;

/** A contribution is real session cash, capped at the remaining goal. */
export function marsContribution(world:World, playerId:string, amount:number):number {
  const player=world.players.find(p=>p.id===playerId);
  if(!player || !Number.isSafeInteger(amount) || amount<=0 || amount>player.delivery.cash) return 0;
  return Math.min(amount,MARS_GOAL-world.mars.fund);
}

/** Called only after the authoritative fund write succeeds. */
export function applyMarsContribution(world:World,playerId:string,amount:number):void {
  const player=world.players.find(p=>p.id===playerId)!;
  player.delivery.cash-=amount;
  world.mars.fund+=amount;
}

export function atMarsBoarding(e:Entity):boolean {
  const p=FREMONT_SPACEPORT.entrance;
  return e.supportId==='ground' && Math.abs(e.speed)<1 && Math.hypot(e.x-p.x,e.z-p.z)<=BOARDING_RADIUS;
}

export function boardMars(world:World,playerId:string):boolean {
  const player=world.players.find(p=>p.id===playerId);
  const entity=world.entities.find(e=>e.id===player?.entityId);
  if(world.mars.fund<MARS_GOAL || !player || !entity || !atMarsBoarding(entity)) return false;
  awardMarsAchievement(player);
  world.mars.launchAt=world.time;
  return true;
}

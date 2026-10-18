import { resetPlayer, type Entity, type Player, type World } from '../shared/game';
import { body, contact, dimensions } from '../shared/physics';
import type { MarketPaint } from '../shared/market-protocol';

export type MarketHold={transactionId:string;oldFence:string;newFence?:string;marketPaint?:MarketPaint|null;resume?:Promise<void>;player:Player;car:Entity;playerIndex:number;carIndex:number};

/** Only an idle personal car outside shared activities can leave simulation. */
export function canHoldMarketPlayer(world:World,id:string):boolean {
  const player=world.players.find(item=>item.id===id),car=world.entities.find(item=>item.id===player?.entityId);
  if(!player||!car||car.kind==='person'||car.owner!==id||car.driver!==id||car.cab||car.retiredCab||car.supportId!=='ground'||car.inDome||car.autopilot||car.navigation)return false;
  if(![car.speed,car.vx,car.vy,car.vz,car.pushX,car.pushZ].every(value=>Number.isFinite(value)&&Math.abs(value)<.05))return false;
  if(world.ferry.passengers.some(item=>item.entityId===car.id)||world.ferry.arrivals.includes(car.id))return false;
  if(world.parking.rounds.some(round=>round.entrants.some(item=>item.playerId===id))||world.races.rounds.some(round=>round.entrants.some(item=>item.playerId===id)))return false;
  if(world.soccer.participants.some(item=>item.playerId===id)||world.entities.some(item=>item.police?.targetId===id))return false;
  return true;
}

export function captureMarketHold(world:World,id:string,transactionId:string,fence:string):MarketHold|null {
  if(!canHoldMarketPlayer(world,id))return null;
  const playerIndex=world.players.findIndex(item=>item.id===id),player=world.players[playerIndex];
  const carIndex=world.entities.findIndex(item=>item.id===player.entityId);
  return {transactionId,oldFence:fence,player,car:world.entities[carIndex],playerIndex,carIndex};
}

function clear(world:World,hold:MarketHold){
  world.players=world.players.filter(item=>item!==hold.player);
  world.entities=world.entities.filter(item=>item!==hold.car);
}
function overlaps(world:World,car:Entity):boolean {
  return world.entities.some(other=>other!==car&&car.y<other.y+dimensions(other.kind).height&&other.y<car.y+dimensions(car.kind).height&&!!contact(body(car),body(other)));
}
/** Return a held car only where it cannot overlap traffic that arrived meanwhile. */
export function restoreMarketHold(world:World,hold:MarketHold):{ok:boolean;relocated:boolean} {
  if(!world.players.includes(hold.player))world.players.splice(Math.min(hold.playerIndex,world.players.length),0,hold.player);
  if(!world.entities.includes(hold.car))world.entities.splice(Math.min(hold.carIndex,world.entities.length),0,hold.car);
  if(!overlaps(world,hold.car))return {ok:true,relocated:false};
  const before={x:hold.car.x,z:hold.car.z,yaw:hold.car.yaw};
  resetPlayer(world,hold.player.id);
  if(overlaps(world,hold.car)){clear(world,hold);return {ok:false,relocated:false};}
  return {ok:true,relocated:before.x!==hold.car.x||before.z!==hold.car.z||before.yaw!==hold.car.yaw};
}

/** Synchronous: no player, physics, ticket, delivery or award can advance while held. */
export function withMarketHolds(world:World,holds:readonly MarketHold[],advance:()=>void):Set<string> {
  for(const hold of holds)clear(world,hold);
  const relocated=new Set<string>();
  try{advance();}finally{
    for(const hold of holds){const restored=restoreMarketHold(world,hold);if(restored.relocated)relocated.add(hold.player.id);}
  }
  return relocated;
}

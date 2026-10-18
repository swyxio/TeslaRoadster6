import type { StarshipStatus } from '../shared/starship';

/** The public endpoint has no room identity, so personal income is unknown. */
export type StarshipViewStatus = Omit<StarshipStatus,'personal'> & { personal:number|null };
export type StarshipRoomStatus = {status:StarshipViewStatus;publicName:string|null;privacyPending:boolean;serverTime:number;receivedAt:number};

const amount=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=0;
const optionalAmount=(value:unknown)=>value===null||amount(value);
export function validStarshipStatus(value:unknown):value is StarshipViewStatus {
  if(!value||typeof value!=='object')return false;
  const s=value as Record<string,unknown>;
  return amount(s.total)&&optionalAmount(s.personal)&&(s.personal===null||(s.personal as number)<=s.total)&&
    (s.crossing==='pending'||s.crossing==='recorded'||s.crossing==='unknown')&&
    optionalAmount(s.launchTotal)&&optionalAmount(s.completedAt)&&optionalAmount(s.launchAt)&&
    optionalAmount(s.cutoverTotal)&&optionalAmount(s.cutoverAt)&&
    (s.launchId===null||typeof s.launchId==='string');
}
export function validStarshipTime(value:unknown):value is number {return amount(value);}

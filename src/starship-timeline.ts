import { MARS_LAUNCH_SECONDS } from '../shared/mars';

/** Room-supplied server time anchors animation without trusting the client wall clock. */
export type StarshipClock = { launchAt:number|null; serverTime:number; receivedAt:number };
export type StarshipAnimation = { source:'global'|'replay'; elapsed:number };

/** A replay is local presentation. A live global launch takes precedence. */
export function starshipAnimation(clock:StarshipClock|null,replayStartedAt:number|null,now:number):StarshipAnimation|null {
  if(!Number.isFinite(now))return null;
  if(clock && clock.launchAt!==null && Number.isSafeInteger(clock.launchAt) && Number.isSafeInteger(clock.serverTime) &&
     Number.isFinite(clock.receivedAt) && now>=clock.receivedAt){
    const elapsed=(clock.serverTime+now-clock.receivedAt-clock.launchAt)/1000;
    if(elapsed>=0 && elapsed<MARS_LAUNCH_SECONDS)return {source:'global',elapsed};
  }
  if(replayStartedAt!==null && Number.isFinite(replayStartedAt)){
    const elapsed=(now-replayStartedAt)/1000;
    if(elapsed>=0 && elapsed<MARS_LAUNCH_SECONDS)return {source:'replay',elapsed};
  }
  return null;
}

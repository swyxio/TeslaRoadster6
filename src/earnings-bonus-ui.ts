import { earningsMultiplier, type EarningsEvents } from '../shared/earnings-events';

/** Server UTC plus a monotonic receipt clock; validity ends with the room's event lease. */
export type EarningsBonusView={events:EarningsEvents;serverTime:number;receivedAt:number;validForMs:number};
function remaining(until:number,now:number):string {
  const seconds=Math.max(0,Math.ceil((until-now)/1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export function earningsBonusText(view:EarningsBonusView|null,now:number):string {
  if(!view||!Number.isSafeInteger(view.serverTime)||!Number.isFinite(view.receivedAt)||!Number.isFinite(view.validForMs)||
    view.validForMs<=0||!Number.isFinite(now)||now<view.receivedAt||now-view.receivedAt>=view.validForMs)return 'Earnings bonus status unavailable';
  const serverNow=Math.floor(view.serverTime+now-view.receivedAt);
  let active:ReturnType<typeof earningsMultiplier>;
  try{active=earningsMultiplier(view.events,serverNow);}catch{return 'Earnings bonus status unavailable';}
  const parts:string[]=[];
  if(active.roomEndsAtMs!==null)parts.push(`room ${remaining(active.roomEndsAtMs,serverNow)}`);
  if(active.globalEndsAtMs!==null)parts.push(`global ${remaining(active.globalEndsAtMs,serverNow)}`);
  return parts.length?`${active.multiplier}× earnings · ${parts.join(' · ')}`:'';
}

/** The host imports earnings-bonus-ui.css and mounts the badge in the HUD. */
export function createEarningsBonusBadge(){
  const element=document.createElement('span');element.className='earnings-bonus';element.setAttribute('role','status');
  return {element,update(view:EarningsBonusView|null,now=performance.now()){
    const label=earningsBonusText(view,now);element.hidden=!label;if(element.textContent!==label)element.textContent=label;
  }};
}

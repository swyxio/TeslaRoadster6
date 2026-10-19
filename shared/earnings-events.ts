/** All event and settlement times are UTC Unix timestamps in whole milliseconds. */
export type EarningsWindow = { startsAtMs:number; endsAtMs:number };
export type EarningsEvents = { room:readonly EarningsWindow[]; global:readonly EarningsWindow[] };
export type GlobalEventLease = { issuedAtMs:number; validUntilMs:number; windows:EarningsWindow[] };

export const ROOM_WIN_DURATION_MS = 10 * 60 * 1000;
export const GLOBAL_EVENT_DURATION_MS = 30 * 60 * 1000;
export const DOME_MATCH_CASH = 250;
export const DOME_WIN_CASH = 500;
export const CAB_REMAINDER_DENOMINATOR = 2 * 60 * 60 * 1000;
const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

export type EarningsSource =
  | 'pickup' | 'delivery' | 'dome-match' | 'race' | 'parking' | 'scenic' | 'cab'
  | 'achievement' | 'check-in' | 'checkpoint' | 'transfer' | 'sale' | 'gift' | 'loan' | 'refund' | 'supply';

function timestamp(value:number):void {
  if(!Number.isSafeInteger(value)||value<0||value>MAX_DATE_MS)throw new RangeError('Expected a valid UTC millisecond timestamp');
}
function money(value:number):void {
  if(!Number.isSafeInteger(value)||value<0)throw new RangeError('Expected nonnegative whole-dollar safe integer');
}
function windowFrom(startsAtMs:number,duration:number):EarningsWindow {
  timestamp(startsAtMs);
  const endsAtMs=startsAtMs+duration;
  timestamp(endsAtMs);
  return {startsAtMs,endsAtMs};
}
function validateEvents(events:EarningsEvents):void {
  for(const [scope,windows] of [['room',events.room],['global',events.global]] as const){
    for(const window of windows){
      timestamp(window.startsAtMs);timestamp(window.endsAtMs);
      const duration=window.endsAtMs-window.startsAtMs;
      if(scope==='room' ? duration<ROOM_WIN_DURATION_MS : duration!==GLOBAL_EVENT_DURATION_MS)
        throw new RangeError(`Invalid ${scope} earnings event duration`);
    }
  }
}

/** A fresh lease cannot establish the rate for an earlier earned timestamp. */
export function globalWindowsForInstant(lease:GlobalEventLease,atMs:number):readonly EarningsWindow[] {
  timestamp(atMs);timestamp(lease.issuedAtMs);timestamp(lease.validUntilMs);
  if(lease.issuedAtMs>=lease.validUntilMs||atMs<lease.issuedAtMs||atMs>=lease.validUntilMs)
    throw new RangeError('Global event lease does not cover payout time');
  validateEvents({room:[],global:lease.windows});
  return lease.windows;
}

/** For older or longer cab intervals consume complete paginated history instead. */
export function globalWindowsForInterval(lease:GlobalEventLease,fromMs:number,toMs:number):readonly EarningsWindow[] {
  timestamp(fromMs);timestamp(toMs);timestamp(lease.issuedAtMs);timestamp(lease.validUntilMs);
  if(lease.issuedAtMs>=lease.validUntilMs||fromMs>toMs||fromMs<lease.issuedAtMs||toMs>lease.validUntilMs)
    throw new RangeError('Global event lease does not cover earnings interval');
  validateEvents({room:[],global:lease.windows});
  return lease.windows;
}

/** Schedule a 30-minute developer event. Overlapping global events still pay only 2x. */
export function globalEarningsEvent(startsAtMs:number):EarningsWindow {
  return windowFrom(startsAtMs,GLOBAL_EVENT_DURATION_MS);
}

/** Record a verified win after paying the match. Retain prior windows until cab accruals are settled. */
export function recordRoomWin(windows:readonly EarningsWindow[],wonAtMs:number):EarningsWindow[] {
  timestamp(wonAtMs);
  validateEvents({room:windows,global:[]});
  const result=windows.map(window=>({...window}));
  for(let i=1;i<result.length;i++)if(result[i].startsAtMs<=result[i-1].endsAtMs)
    throw new RangeError('Room event history must be ordered and disjoint');
  const last=result.at(-1);
  const next=windowFrom(wonAtMs,ROOM_WIN_DURATION_MS);
  if(!last)return [next];
  // A merged window's final expiry identifies its most recent winning time.
  if(wonAtMs<last.endsAtMs-ROOM_WIN_DURATION_MS)throw new RangeError('Room wins must be recorded in time order');
  if(wonAtMs<=last.endsAtMs)last.endsAtMs=next.endsAtMs;
  else result.push(next);
  return result;
}

/** Fail closed for unknown sources; in particular supply pickups are not restaurant pickup pay. */
export function bonusEligible(source:EarningsSource):boolean {
  switch(source){
    case 'pickup':case 'delivery':case 'dome-match':case 'race':case 'parking':case 'scenic':case 'cab':return true;
    case 'achievement':case 'check-in':case 'checkpoint':case 'transfer':case 'sale':case 'gift':case 'loan':case 'refund':case 'supply':return false;
    default:throw new RangeError('Unknown earnings source');
  }
}

function activeUntil(windows:readonly EarningsWindow[],atMs:number):number|null {
  let until:number|null=null;
  for(const {startsAtMs,endsAtMs} of windows)if(startsAtMs<=atMs&&atMs<endsAtMs)until=Math.max(until??0,endsAtMs);
  return until;
}
export type EarningsMultiplier = { multiplier:1|1.5|2|3; roomEndsAtMs:number|null; globalEndsAtMs:number|null };
/** A server-derived delivery component committed with the driver's progress. */
export type SettledDeliveryEarning = {
  sourceId:string; kind:'pickup'|'delivery'|'checkpoint'; base:number; amount:number;
  atMs:number; multiplier:1|1.5|2|3;
};
/** The interval is inclusive at its start and exclusive at its end. */
export function earningsMultiplier(events:EarningsEvents,atMs:number):EarningsMultiplier {
  timestamp(atMs);validateEvents(events);
  const roomEndsAtMs=activeUntil(events.room,atMs),globalEndsAtMs=activeUntil(events.global,atMs);
  return {multiplier:roomEndsAtMs!==null?(globalEndsAtMs!==null?3:1.5):(globalEndsAtMs!==null?2:1),roomEndsAtMs,globalEndsAtMs};
}

function safeAmount(value:bigint):number {
  if(value>MAX_MONEY)throw new RangeError('Earnings exceed the safe integer range');
  return Number(value);
}
/** Round each discrete payment to the nearest whole dollar; exact halves round up. */
export function activityPayout(base:number,source:EarningsSource,atMs:number,events:EarningsEvents):number {
  money(base);
  const multiplier=earningsMultiplier(events,atMs).multiplier;
  if(!bonusEligible(source))return base;
  const halfUnits=BigInt(multiplier*2);
  return safeAmount((BigInt(base)*halfUnits+1n)/2n);
}

type Span={start:number;end:number};
function mergedSpans(windows:readonly EarningsWindow[],startMs:number,endMs:number):Span[] {
  const spans=windows.map(window=>({start:Math.max(startMs,window.startsAtMs),end:Math.min(endMs,window.endsAtMs)}))
    .filter(span=>span.start<span.end).sort((a,b)=>a.start-b.start||a.end-b.end);
  const merged:Span[]=[];
  for(const span of spans){
    const last=merged.at(-1);
    if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);
    else merged.push({...span});
  }
  return merged;
}
function spanDuration(spans:readonly Span[]):bigint {
  return spans.reduce((sum,span)=>sum+BigInt(span.end-span.start),0n);
}
function overlapDuration(a:readonly Span[],b:readonly Span[]):bigint {
  let i=0,j=0,total=0n;
  while(i<a.length&&j<b.length){
    const start=Math.max(a[i].start,b[j].start),end=Math.min(a[i].end,b[j].end);
    if(start<end)total+=BigInt(end-start);
    if(a[i].end<b[j].end)i++;else j++;
  }
  return total;
}

/**
 * Accrue a dispatched cab's whole-dollar hourly rate over [startMs,endMs).
 * Carry the returned remainder durably into the next non-overlapping settlement;
 * flooring only after adding it makes the total independent of settlement splits.
 */
export function cabAccrual(hourlyRate:number,startMs:number,endMs:number,events:EarningsEvents,remainder=0):{amount:number;remainder:number} {
  money(hourlyRate);timestamp(startMs);timestamp(endMs);validateEvents(events);
  if(endMs<startMs)throw new RangeError('Cab interval ends before it starts');
  if(!Number.isSafeInteger(remainder)||remainder<0||remainder>=CAB_REMAINDER_DENOMINATOR)throw new RangeError('Invalid cab accrual remainder');
  const room=mergedSpans(events.room,startMs,endMs),global=mergedSpans(events.global,startMs,endMs);
  // Half-multiplier units: base 2, room adds 1, global adds 2, both add 1 more.
  const weightedMs=2n*BigInt(endMs-startMs)+spanDuration(room)+2n*spanDuration(global)+overlapDuration(room,global);
  const numerator=BigInt(hourlyRate)*weightedMs+BigInt(remainder),denominator=BigInt(CAB_REMAINDER_DENOMINATOR);
  return {amount:safeAmount(numerator/denominator),remainder:Number(numerator%denominator)};
}

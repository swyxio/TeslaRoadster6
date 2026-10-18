import { DurableObject } from 'cloudflare:workers';
import { GLOBAL_EVENT_DURATION_MS, globalEarningsEvent, type EarningsWindow, type GlobalEventLease } from '../shared/earnings-events';

export const GLOBAL_EVENT_LEAD_MS = 60_000;
export const GLOBAL_EVENT_LEASE_MS = 15_000;
const HISTORY_PAGE_SIZE = 100;
const MAX_DATE_MS = 8_640_000_000_000_000;
type EventRow = { request_id:string; starts_at:number; ends_at:number };

export type GlobalEventHistory = { windows:EarningsWindow[]; next:number|null };

function validTime(value:number):void {
  if(!Number.isSafeInteger(value)||value<0||value>MAX_DATE_MS)throw new RangeError('Invalid UTC timestamp');
}
function eventFromRow(row:EventRow):EarningsWindow { return {startsAtMs:row.starts_at,endsAtMs:row.ends_at}; }

/**
 * Internal RPC only: production must bind the single object by a fixed name and
 * authenticate a separate operator before exposing schedule(). No client may
 * choose the clock or submit an earnings event.
 */
export class GlobalEarningsEvent extends DurableObject<Record<string, never>> {
  constructor(ctx:DurableObjectState,env:Record<string, never>) {
    super(ctx,env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS global_events (
      request_id TEXT NOT NULL UNIQUE, starts_at INTEGER NOT NULL PRIMARY KEY, ends_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS global_event_lease (
      singleton INTEGER PRIMARY KEY CHECK (singleton=1), lease_until INTEGER NOT NULL, observed_at INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO global_event_lease (singleton,lease_until,observed_at) VALUES (1,0,0);`);
  }

  /** Only the test fixture overrides this clock; the production RPC does not accept one. */
  protected nowMs():number { return Date.now(); }

  /** A backwards wall clock must never allow an event to alter observed history. */
  private advanceClock():number {
    const now=this.nowMs();validTime(now);
    const state=this.ctx.storage.sql.exec<{observed_at:number}>('SELECT observed_at FROM global_event_lease WHERE singleton=1').one();
    if(now<state.observed_at)throw new Error('Global event clock moved backwards');
    this.ctx.storage.sql.exec('UPDATE global_event_lease SET observed_at=? WHERE singleton=1',now);
    return now;
  }

  /** Append once; the request ID makes a lost response safely retryable. */
  schedule(requestId:string,startsAtMs:number):EarningsWindow {
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,128}$/.test(requestId))throw new RangeError('Invalid event request ID');
    const event=globalEarningsEvent(startsAtMs);
    return this.ctx.storage.transactionSync(()=>{
      const sql=this.ctx.storage.sql;
      const prior=sql.exec<EventRow>('SELECT request_id,starts_at,ends_at FROM global_events WHERE request_id=?',requestId).toArray()[0];
      if(prior){
        if(prior.starts_at!==startsAtMs)throw new Error('Event request ID already used for another start');
        return eventFromRow(prior);
      }
      const now=this.advanceClock();
      if(startsAtMs-now<GLOBAL_EVENT_LEAD_MS)throw new Error('Event must start at least 60 seconds in the future');
      const latestLease=sql.exec<{lease_until:number}>('SELECT lease_until FROM global_event_lease WHERE singleton=1').one().lease_until;
      if(startsAtMs<latestLease)throw new Error('Event would start before an existing lease expires');
      const overlap=sql.exec<{found:number}>('SELECT 1 AS found FROM global_events WHERE starts_at<? AND starts_at>? AND ends_at>? LIMIT 1',event.endsAtMs,event.startsAtMs-GLOBAL_EVENT_DURATION_MS,event.startsAtMs).toArray();
      if(overlap.length)throw new Error('Event overlaps an existing event');
      sql.exec('INSERT INTO global_events (request_id,starts_at,ends_at) VALUES (?,?,?)',requestId,event.startsAtMs,event.endsAtMs);
      return event;
    });
  }

  /**
   * Include every known event intersecting this half-open lease and atomically
   * fence later schedules. A caller must fail closed on expiry or RPC failure.
   */
  lease():GlobalEventLease {
    return this.ctx.storage.transactionSync(()=>{
      const now=this.advanceClock();
      const validUntilMs=now+GLOBAL_EVENT_LEASE_MS;validTime(validUntilMs);
      const sql=this.ctx.storage.sql;
      sql.exec('UPDATE global_event_lease SET lease_until=MAX(lease_until,?) WHERE singleton=1',validUntilMs);
      const rows=sql.exec<EventRow>('SELECT request_id,starts_at,ends_at FROM global_events WHERE starts_at<? AND starts_at>? AND ends_at>? ORDER BY starts_at',validUntilMs,now-GLOBAL_EVENT_DURATION_MS,now).toArray();
      return {issuedAtMs:now,validUntilMs,windows:rows.map(eventFromRow)};
    });
  }

  /**
   * Immutable past events intersecting [fromMs,toMs), in bounded pages. Callers
   * must consume every page before settling a delayed interval.
   */
  history(fromMs:number,toMs:number,afterStartMs?:number):GlobalEventHistory {
    validTime(fromMs);validTime(toMs);
    if(afterStartMs!==undefined){validTime(afterStartMs);if(afterStartMs>=toMs)throw new RangeError('Invalid history cursor');}
    return this.ctx.storage.transactionSync(()=>{
      const now=this.advanceClock();
      if(toMs<fromMs||toMs>now)throw new RangeError('History must be a past interval');
      if(fromMs===toMs)return {windows:[],next:null};
      const rows=this.ctx.storage.sql.exec<EventRow>(`SELECT request_id,starts_at,ends_at FROM global_events
        WHERE starts_at<? AND starts_at>? AND ends_at>? AND starts_at>? ORDER BY starts_at LIMIT ?`,toMs,fromMs-GLOBAL_EVENT_DURATION_MS,fromMs,afterStartMs??-1,HISTORY_PAGE_SIZE+1).toArray();
      const page=rows.slice(0,HISTORY_PAGE_SIZE);
      return {windows:page.map(eventFromRow),next:rows.length>HISTORY_PAGE_SIZE?page[page.length-1].starts_at:null};
    });
  }
}

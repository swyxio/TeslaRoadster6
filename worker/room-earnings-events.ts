import { ROOM_WIN_DURATION_MS, type EarningsWindow } from '../shared/earnings-events';

type WinRow={event_id:string;requested_at:number;won_at:number;ends_at:number;prior_until:number|null};
export type RoomEventCursor={wonAtMs:number;eventId:string};
export type RoomEventHistory={windows:EarningsWindow[];next:RoomEventCursor|null};
export type PreparedRoomWin={eventId:string;requestedAtMs:number;startsAtMs:number;endsAtMs:number;priorActiveUntilMs:number|null};
const PAGE_SIZE=100,MAX_DATE_MS=8_640_000_000_000_000;
function validTime(value:number):void {
  if(!Number.isSafeInteger(value)||value<0||value>MAX_DATE_MS-ROOM_WIN_DURATION_MS)throw new RangeError('Invalid room event time');
}
function validId(value:string):void {
  if(typeof value!=='string'||!/^[a-zA-Z0-9._:-]{1,128}$/.test(value))throw new RangeError('Invalid room win ID');
}
function prepared(row:WinRow):PreparedRoomWin {
  return {eventId:row.event_id,requestedAtMs:row.requested_at,startsAtMs:row.won_at,endsAtMs:row.ends_at,priorActiveUntilMs:row.prior_until};
}

/** Composable storage inside the room economy; callers submit server-verified wins only. */
export class RoomEarningsEvents {
  constructor(private storage:DurableObjectStorage){
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS room_earnings_wins (
      event_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, won_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL, prior_until INTEGER
    );
    CREATE INDEX IF NOT EXISTS room_earnings_wins_time ON room_earnings_wins (won_at,event_id);
    CREATE TABLE IF NOT EXISTS room_earnings_pending (
      event_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, won_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL, prior_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS room_earnings_fence (
      singleton INTEGER PRIMARY KEY CHECK (singleton=1), before_ms INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO room_earnings_fence (singleton,before_ms) VALUES (1,0);`);
  }

  /**
   * Reserve the ordering of a verified match before its payout. While pending,
   * observations at or after its event time fail closed. The prior room rate is
   * persisted with the reservation, so payout retries never use the new bonus.
   * The host must recover and settle an interrupted reservation before releasing it.
   */
  prepareWin(eventId:string,requestedAtMs:number):PreparedRoomWin {
    validId(eventId);validTime(requestedAtMs);
    if(requestedAtMs>Date.now())throw new RangeError('A room win cannot be in the future');
    return this.storage.transactionSync(()=>{
      const sql=this.storage.sql;
      const existing=sql.exec<WinRow>(`SELECT * FROM room_earnings_wins WHERE event_id=?
        UNION ALL SELECT * FROM room_earnings_pending WHERE event_id=?`,eventId,eventId).toArray()[0];
      if(existing){
        if(existing.requested_at!==requestedAtMs)throw new Error('Room win ID already used for another time');
        return prepared(existing);
      }
      if(sql.exec<WinRow>('SELECT * FROM room_earnings_pending LIMIT 1').toArray().length)
        throw new Error('Another room win is awaiting settlement');
      const fence=sql.exec<{before_ms:number}>('SELECT before_ms FROM room_earnings_fence WHERE singleton=1').one().before_ms;
      // A same-millisecond observation precedes this win; older unprepared
      // wins are an ordering failure and must not silently move into the future.
      if(requestedAtMs<fence-1)throw new Error('Room win is older than observed earnings');
      const startsAtMs=Math.max(requestedAtMs,fence);validTime(startsAtMs);
      const previous=sql.exec<{ends_at:number}>('SELECT ends_at FROM room_earnings_wins WHERE won_at<=? AND ends_at>? ORDER BY won_at DESC LIMIT 1',startsAtMs,startsAtMs).toArray()[0];
      const row={event_id:eventId,requested_at:requestedAtMs,won_at:startsAtMs,ends_at:startsAtMs+ROOM_WIN_DURATION_MS,prior_until:previous?.ends_at??null};
      sql.exec('INSERT INTO room_earnings_pending (event_id,requested_at,won_at,ends_at,prior_until) VALUES (?,?,?,?,?)',row.event_id,row.requested_at,row.won_at,row.ends_at,row.prior_until);
      return prepared(row);
    });
  }

  /** Publish only after the match's resolved payout is durably committed. */
  commitWin(eventId:string):PreparedRoomWin {
    validId(eventId);
    return this.storage.transactionSync(()=>{
      const sql=this.storage.sql;
      const existing=sql.exec<WinRow>('SELECT * FROM room_earnings_wins WHERE event_id=?',eventId).toArray()[0];
      if(existing)return prepared(existing);
      const row=sql.exec<WinRow>('SELECT * FROM room_earnings_pending WHERE event_id=?',eventId).toArray()[0];
      if(!row)throw new Error('Room win has not been prepared');
      sql.exec('INSERT INTO room_earnings_wins (event_id,requested_at,won_at,ends_at,prior_until) VALUES (?,?,?,?,?)',row.event_id,row.requested_at,row.won_at,row.ends_at,row.prior_until);
      sql.exec('DELETE FROM room_earnings_pending WHERE event_id=?',eventId);
      return prepared(row);
    });
  }

  pendingWin():PreparedRoomWin|null {
    const row=this.storage.sql.exec<WinRow>('SELECT * FROM room_earnings_pending LIMIT 1').toArray()[0];
    return row?prepared(row):null;
  }

  private requireNoPendingBefore(toExclusiveMs:number):void {
    const pending=this.storage.sql.exec<{won_at:number}>('SELECT won_at FROM room_earnings_pending LIMIT 1').toArray()[0];
    if(pending&&pending.won_at<toExclusiveMs)throw new Error('Room win is awaiting settlement');
  }

  /** The most recent active win refreshes the expiry; starts are inclusive. */
  activeUntil(atMs:number):number|null {
    validTime(atMs);
    if(atMs>Date.now())throw new RangeError('Room event observation must not be in the future');
    return this.storage.transactionSync(()=>{
      const sql=this.storage.sql;
      this.requireNoPendingBefore(atMs+1);
      sql.exec('UPDATE room_earnings_fence SET before_ms=MAX(before_ms,?) WHERE singleton=1',atMs+1);
      const row=sql.exec<{ends_at:number}>('SELECT ends_at FROM room_earnings_wins WHERE won_at<=? AND ends_at>? ORDER BY won_at DESC LIMIT 1',atMs,atMs).toArray()[0];
      return row?.ends_at??null;
    });
  }

  /** Preserve all overlapping windows for delayed, split-safe cab settlement. */
  history(fromMs:number,toMs:number,cursor?:RoomEventCursor):RoomEventHistory {
    validTime(fromMs);validTime(toMs);
    if(toMs<fromMs||toMs>Date.now())throw new RangeError('Room event history must be a past interval');
    if(cursor){validTime(cursor.wonAtMs);validId(cursor.eventId);if(cursor.wonAtMs>=toMs)throw new RangeError('Invalid room event cursor');}
    if(fromMs===toMs)return {windows:[],next:null};
    return this.storage.transactionSync(()=>{
      const sql=this.storage.sql;
      this.requireNoPendingBefore(toMs);
      // No subsequently prepared win can alter this half-open interval or
      // slip behind a cursor already returned to a settlement.
      sql.exec('UPDATE room_earnings_fence SET before_ms=MAX(before_ms,?) WHERE singleton=1',toMs);
      const rows=sql.exec<WinRow>(`SELECT event_id,requested_at,won_at,ends_at,prior_until FROM room_earnings_wins
        WHERE won_at<? AND ends_at>? AND (won_at>? OR (won_at=? AND event_id>?))
        ORDER BY won_at,event_id LIMIT ?`,toMs,fromMs,cursor?.wonAtMs??-1,cursor?.wonAtMs??-1,cursor?.eventId??'',PAGE_SIZE+1).toArray();
      const page=rows.slice(0,PAGE_SIZE),last=page.at(-1);
      return {windows:page.map(row=>({startsAtMs:row.won_at,endsAtMs:row.ends_at})),
        next:rows.length>PAGE_SIZE&&last?{wonAtMs:last.won_at,eventId:last.event_id}:null};
    });
  }
}

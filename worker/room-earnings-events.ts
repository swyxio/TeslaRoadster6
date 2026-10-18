import { ROOM_WIN_DURATION_MS, type EarningsWindow } from '../shared/earnings-events';

type WinRow={event_id:string;won_at:number;ends_at:number};
export type RoomEventCursor={wonAtMs:number;eventId:string};
export type RoomEventHistory={windows:EarningsWindow[];next:RoomEventCursor|null};
const PAGE_SIZE=100,MAX_DATE_MS=8_640_000_000_000_000;
function validTime(value:number):void {
  if(!Number.isSafeInteger(value)||value<0||value>MAX_DATE_MS-ROOM_WIN_DURATION_MS)throw new RangeError('Invalid room event time');
}
function validId(value:string):void {
  if(typeof value!=='string'||!/^[a-zA-Z0-9._:-]{1,128}$/.test(value))throw new RangeError('Invalid room win ID');
}

/** Composable storage inside the room economy; callers submit server-verified wins only. */
export class RoomEarningsEvents {
  constructor(private storage:DurableObjectStorage){
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS room_earnings_wins (
      event_id TEXT PRIMARY KEY, won_at INTEGER NOT NULL, ends_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_earnings_wins_time ON room_earnings_wins (won_at,event_id);`);
  }

  /** A win is persisted before room payouts may observe its bonus window. */
  recordWin(eventId:string,wonAtMs:number):EarningsWindow {
    validId(eventId);validTime(wonAtMs);
    return this.storage.transactionSync(()=>{
      const sql=this.storage.sql,existing=sql.exec<WinRow>('SELECT event_id,won_at,ends_at FROM room_earnings_wins WHERE event_id=?',eventId).toArray()[0];
      if(existing){
        if(existing.won_at!==wonAtMs)throw new Error('Room win ID already used for another time');
        return {startsAtMs:existing.won_at,endsAtMs:existing.ends_at};
      }
      const endsAtMs=wonAtMs+ROOM_WIN_DURATION_MS;
      sql.exec('INSERT INTO room_earnings_wins (event_id,won_at,ends_at) VALUES (?,?,?)',eventId,wonAtMs,endsAtMs);
      return {startsAtMs:wonAtMs,endsAtMs};
    });
  }

  /** The most recent active win refreshes the expiry; starts are inclusive. */
  activeUntil(atMs:number):number|null {
    validTime(atMs);
    const row=this.storage.sql.exec<{ends_at:number}>('SELECT ends_at FROM room_earnings_wins WHERE won_at<=? AND ends_at>? ORDER BY won_at DESC LIMIT 1',atMs,atMs).toArray()[0];
    return row?.ends_at??null;
  }

  /** Preserve all overlapping windows for delayed, split-safe cab settlement. */
  history(fromMs:number,toMs:number,cursor?:RoomEventCursor):RoomEventHistory {
    validTime(fromMs);validTime(toMs);
    if(toMs<fromMs)throw new RangeError('Invalid room event interval');
    if(cursor){validTime(cursor.wonAtMs);validId(cursor.eventId);if(cursor.wonAtMs>=toMs)throw new RangeError('Invalid room event cursor');}
    if(fromMs===toMs)return {windows:[],next:null};
    const rows=this.storage.sql.exec<WinRow>(`SELECT event_id,won_at,ends_at FROM room_earnings_wins
      WHERE won_at<? AND ends_at>? AND (won_at>? OR (won_at=? AND event_id>?))
      ORDER BY won_at,event_id LIMIT ?`,toMs,fromMs,cursor?.wonAtMs??-1,cursor?.wonAtMs??-1,cursor?.eventId??'',PAGE_SIZE+1).toArray();
    const page=rows.slice(0,PAGE_SIZE),last=page.at(-1);
    return {windows:page.map(row=>({startsAtMs:row.won_at,endsAtMs:row.ends_at})),
      next:rows.length>PAGE_SIZE&&last?{wonAtMs:last.won_at,eventId:last.event_id}:null};
  }
}

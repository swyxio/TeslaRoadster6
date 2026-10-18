import { DurableObject } from 'cloudflare:workers';
import { STARSHIP_GOAL, STARSHIP_LAUNCH_DELAY_MS, type StarshipContributors, type StarshipStatus } from '../shared/starship';
import { normalizeName } from './global-chat-core';

/** A durable identity sends its committed lifetime total, never a wallet delta. */
export type StarshipReconciliation = { driverId:string; sequence:number; total:number; name:string };
type MissionRow = { total:number; completed_at:number|null; launch_at:number|null; launch_id:string|null };
type DriverRow = { sequence:number; total:number };
type ContributorRow = { row_id:number; launch_total:number; launch_name:string };

function validId(id:unknown): id is string {
  return typeof id==='string' && /^[a-zA-Z0-9-]{1,128}$/.test(id);
}

/**
 * One deliberately serialized object owns the global total and launch epoch.
 * Only internal Workers may address this object; clients cannot submit income.
 * Its input is an absolute, committed per-identity total, allowing the driver's
 * durable outbox to retry or coalesce updates after a lost response.
 */
export class Starship extends DurableObject {
  constructor(ctx:DurableObjectState, env:Cloudflare.Env) {
    super(ctx,env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS mission (
      singleton INTEGER PRIMARY KEY CHECK (singleton=1),
      total INTEGER NOT NULL, completed_at INTEGER, launch_at INTEGER, launch_id TEXT
    );
    INSERT OR IGNORE INTO mission (singleton,total) VALUES (1,0);
    CREATE TABLE IF NOT EXISTS contributors (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT, driver_id TEXT NOT NULL UNIQUE,
      sequence INTEGER NOT NULL, total INTEGER NOT NULL,
      launch_total INTEGER NOT NULL, launch_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS launch_contributors ON contributors (launch_total DESC,row_id ASC);`);
  }

  reconcile(input:StarshipReconciliation):StarshipStatus {
    if(!input || !validId(input.driverId) || !Number.isSafeInteger(input.sequence) || input.sequence<1 ||
       !Number.isSafeInteger(input.total) || input.total<=0 || typeof input.name!=='string' || input.name.length>256) {
      throw new Error('Invalid Starship reconciliation');
    }
    const {driverId,sequence,total}=input;
    const name=normalizeName(input.name);
    return this.ctx.storage.transactionSync(()=>{
      const sql=this.ctx.storage.sql;
      const old=sql.exec<DriverRow>('SELECT sequence,total FROM contributors WHERE driver_id=?',driverId).toArray()[0];
      const mission=sql.exec<MissionRow>('SELECT total,completed_at,launch_at,launch_id FROM mission WHERE singleton=1').one();
      if(old && sequence===old.sequence && total!==old.total) throw new Error('Conflicting Starship sequence');
      if(old && sequence<old.sequence) return this.statusFrom(mission,old.total);
      if(old && sequence===old.sequence) return this.statusFrom(mission,old.total);
      if(old && total<old.total) throw new Error('Starship lifetime total regressed');
      const next=mission.total+total-(old?.total??0);
      if(!Number.isSafeInteger(next)) throw new Error('Starship total exceeds safe integer range');
      const beforeLaunch=mission.completed_at===null;
      if(old){
        sql.exec(`UPDATE contributors SET sequence=?,total=?,
          launch_total=CASE WHEN ? THEN ? ELSE launch_total END,
          launch_name=CASE WHEN ? THEN ? ELSE launch_name END WHERE driver_id=?`,
          sequence,total,beforeLaunch?1:0,total,beforeLaunch?1:0,name,driverId);
      }else{
        sql.exec('INSERT INTO contributors (driver_id,sequence,total,launch_total,launch_name) VALUES (?,?,?,?,?)',
          driverId,sequence,total,beforeLaunch?total:0,name);
      }
      if(beforeLaunch && next>=STARSHIP_GOAL){
        const completedAt=Date.now(),launchAt=completedAt+STARSHIP_LAUNCH_DELAY_MS,launchId=crypto.randomUUID();
        sql.exec('UPDATE mission SET total=?,completed_at=?,launch_at=?,launch_id=? WHERE singleton=1',next,completedAt,launchAt,launchId);
        return {total:next,personal:total,completedAt,launchAt,launchId};
      }
      sql.exec('UPDATE mission SET total=? WHERE singleton=1',next);
      return this.statusFrom({...mission,total:next},total);
    });
  }

  status(driverId?:string):StarshipStatus {
    if(driverId!==undefined && !validId(driverId)) throw new Error('Invalid driver identity');
    const mission=this.ctx.storage.sql.exec<MissionRow>('SELECT total,completed_at,launch_at,launch_id FROM mission WHERE singleton=1').one();
    const driver=driverId===undefined?undefined:this.ctx.storage.sql.exec<DriverRow>('SELECT sequence,total FROM contributors WHERE driver_id=?',driverId).toArray()[0];
    return this.statusFrom(mission,driver?.total??0);
  }

  /** Keyset pagination keeps the frozen launch roll independent of later income. */
  contributors(cursor?:string):StarshipContributors {
    const mission=this.ctx.storage.sql.exec<MissionRow>('SELECT total,completed_at,launch_at,launch_id FROM mission WHERE singleton=1').one();
    if(mission.completed_at===null) return {contributors:[],next:null};
    let amount=Number.MAX_SAFE_INTEGER,rowId=0;
    if(cursor!==undefined){
      const match=/^(\d+):(\d+)$/.exec(cursor);
      if(!match) throw new Error('Invalid contributor cursor');
      amount=Number(match[1]);rowId=Number(match[2]);
      if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(rowId)||amount<1||rowId<1) throw new Error('Invalid contributor cursor');
    }
    const rows=this.ctx.storage.sql.exec<ContributorRow>(`SELECT row_id,launch_total,launch_name FROM contributors
      WHERE launch_total>0 AND (launch_total<? OR (launch_total=? AND row_id>?))
      ORDER BY launch_total DESC,row_id ASC LIMIT 21`,amount,amount,rowId).toArray();
    const page=rows.slice(0,20),last=page.at(-1);
    return {contributors:page.map(row=>({name:row.launch_name,amount:row.launch_total})),
      next:rows.length>20&&last?`${last.launch_total}:${last.row_id}`:null};
  }

  private statusFrom(mission:MissionRow, personal:number):StarshipStatus {
    return {total:mission.total,personal,completedAt:mission.completed_at,launchAt:mission.launch_at,launchId:mission.launch_id};
  }
}

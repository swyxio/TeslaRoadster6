/**
 * A saved driver's eligible income journal. The caller owns the driver's
 * SQLite-backed Durable Object and must verify each source before recording it.
 * This helper does not accept messages directly from a browser.
 */
export type IncomeKind = 'pickup' | 'delivery' | 'activity' | 'cab' | 'achievement' | 'check-in' | 'checkpoint';
export type IncomeCredit = { driverId:string; sourceId:string; kind:IncomeKind; amount:number; name:string };
export type IncomeSnapshot = { driverId:string; sequence:number; total:number; name:string };
export type IncomeState = IncomeSnapshot & { acknowledgedSequence:number; acknowledgedTotal:number };
export type CreditResult = { applied:boolean; sourceSequence:number; state:IncomeState };

type JournalRow = {
  driver_id:string; sequence:number; total:number; name:string;
  acknowledged_sequence:number; acknowledged_total:number;
};
type ReceiptRow = { kind:string; amount:number; sequence:number; lifetime_total:number };
const INCOME_KINDS = new Set<IncomeKind>(['pickup','delivery','activity','cab','achievement','check-in','checkpoint']);

/**
 * One instance per driver object. Initialize the schema during object startup.
 * All wallet/progress changes passed to credit() must use the supplied SQLite
 * SQL or synchronous KV storage; do not perform network calls or other async
 * work in the callback. Source IDs are stable and scoped to this driver,
 * including across reconnects and retries. Guest IDs must also be server-issued.
 *
 * Cloudflare permits one alarm per object. This helper only brings that alarm
 * forward; it never postpones an earlier deadline. The owner must dispatch
 * reconcile() and every other due job from the shared alarm handler, then arm
 * the earliest remaining deadline, including unrelated jobs whose later alarm
 * was brought forward. Integrating this helper without that dispatcher can
 * silently lose another feature's scheduled work.
 */
export class IncomeJournal {
  constructor(private readonly storage:DurableObjectStorage, private readonly retryMs=1_000) {
    if(!Number.isSafeInteger(retryMs) || retryMs<1) throw new Error('Invalid income retry interval');
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS income_journal (
      singleton INTEGER PRIMARY KEY CHECK (singleton=1),
      driver_id TEXT NOT NULL, sequence INTEGER NOT NULL, total INTEGER NOT NULL,
      name TEXT NOT NULL, acknowledged_sequence INTEGER NOT NULL, acknowledged_total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS income_receipts (
      source_id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount INTEGER NOT NULL,
      sequence INTEGER NOT NULL UNIQUE, lifetime_total INTEGER NOT NULL
    );`);
  }

  state():IncomeState|null {
    const row=this.storage.sql.exec<JournalRow>('SELECT * FROM income_journal WHERE singleton=1').toArray()[0];
    return row ? this.stateFrom(row) : null;
  }

  /**
   * Receipt, cumulative outbox, retry alarm and wallet/progress update commit or
   * roll back together. A replay with the same ID, kind and amount does not run
   * mutate again; a conflicting replay throws. The callback is deliberately
   * inside the transaction after the journal and alarm writes.
   */
  async credit(input:IncomeCredit, mutate:(sql:SqlStorage,kv:SyncKvStorage)=>void):Promise<CreditResult> {
    if(!input || typeof input.driverId!=='string' || !/^[a-zA-Z0-9-]{1,128}$/.test(input.driverId) ||
       typeof input.sourceId!=='string' || input.sourceId.length<1 || input.sourceId.length>256 ||
       !INCOME_KINDS.has(input.kind) || !Number.isSafeInteger(input.amount) || input.amount<=0 ||
       typeof input.name!=='string' || input.name.length>256) throw new Error('Invalid income credit');
    return this.storage.transaction(async txn=>{
      const sql=this.storage.sql;
      const row=sql.exec<JournalRow>('SELECT * FROM income_journal WHERE singleton=1').toArray()[0];
      if(row && row.driver_id!==input.driverId) throw new Error('Income journal identity mismatch');
      const existing=sql.exec<ReceiptRow>('SELECT kind,amount,sequence,lifetime_total FROM income_receipts WHERE source_id=?',input.sourceId).toArray()[0];
      if(existing){
        if(!row) throw new Error('Income journal is missing its state');
        if(existing.kind!==input.kind || existing.amount!==input.amount) throw new Error('Conflicting income source');
        return {applied:false,sourceSequence:existing.sequence,state:this.stateFrom(row)};
      }
      const sequence=(row?.sequence??0)+1, total=(row?.total??0)+input.amount;
      if(!Number.isSafeInteger(sequence) || !Number.isSafeInteger(total)) throw new Error('Income journal exceeds safe integer range');
      if(!row){
        sql.exec('INSERT INTO income_journal VALUES (1,?,?,?,?,0,0)',input.driverId,sequence,total,input.name);
      }else{
        sql.exec('UPDATE income_journal SET sequence=?,total=?,name=? WHERE singleton=1',sequence,total,input.name);
      }
      sql.exec('INSERT INTO income_receipts (source_id,kind,amount,sequence,lifetime_total) VALUES (?,?,?,?,?)',input.sourceId,input.kind,input.amount,sequence,total);
      await this.schedule(txn);
      const result=(mutate as (sql:SqlStorage,kv:SyncKvStorage)=>unknown)(sql,this.storage.kv);
      if(result && typeof (result as {then?:unknown}).then==='function') throw new Error('Income mutation must be synchronous');
      const updated=sql.exec<JournalRow>('SELECT * FROM income_journal WHERE singleton=1').one();
      return {applied:true,sourceSequence:sequence,state:this.stateFrom(updated)};
    });
  }

  /**
   * Call from the Durable Object alarm. A durable watchdog is scheduled BEFORE
   * the external call, so lost responses, exceptions and restarts are retried
   * without relying on Cloudflare's finite automatic alarm retries. The remote
   * sink must deduplicate absolute snapshots, as Starship.reconcile does.
   */
  async reconcile(send:(snapshot:IncomeSnapshot)=>Promise<unknown>):Promise<{attempted:boolean; ok:boolean}> {
    const snapshot=await this.storage.transaction(async txn=>{
      const row=this.storage.sql.exec<JournalRow>('SELECT * FROM income_journal WHERE singleton=1').toArray()[0];
      if(!row || row.sequence<=row.acknowledged_sequence) return null;
      await this.schedule(txn);
      return {driverId:row.driver_id,sequence:row.sequence,total:row.total,name:row.name};
    });
    if(!snapshot) return {attempted:false,ok:true};
    try { await send(snapshot); }
    catch { return {attempted:true,ok:false}; }
    await this.acknowledge(snapshot);
    return {attempted:true,ok:true};
  }

  private async acknowledge(snapshot:IncomeSnapshot):Promise<void> {
    await this.storage.transaction(async txn=>{
      const sql=this.storage.sql;
      const row=sql.exec<JournalRow>('SELECT * FROM income_journal WHERE singleton=1').one();
      const receipt=sql.exec<ReceiptRow>('SELECT kind,amount,sequence,lifetime_total FROM income_receipts WHERE sequence=?',snapshot.sequence).toArray()[0];
      if(row.driver_id!==snapshot.driverId || !receipt || receipt.lifetime_total!==snapshot.total) throw new Error('Income acknowledgement mismatch');
      if(snapshot.sequence>row.acknowledged_sequence){
        sql.exec('UPDATE income_journal SET acknowledged_sequence=?,acknowledged_total=? WHERE singleton=1',snapshot.sequence,snapshot.total);
      }
      if(row.sequence>Math.max(row.acknowledged_sequence,snapshot.sequence)) await this.schedule(txn);
    });
  }

  private async schedule(txn:DurableObjectTransaction):Promise<void> {
    const due=Date.now()+this.retryMs, existing=await txn.getAlarm();
    if(existing===null || existing>due) await txn.setAlarm(due);
  }

  private stateFrom(row:JournalRow):IncomeState {
    return {driverId:row.driver_id,sequence:row.sequence,total:row.total,name:row.name,
      acknowledgedSequence:row.acknowledged_sequence,acknowledgedTotal:row.acknowledged_total};
  }
}

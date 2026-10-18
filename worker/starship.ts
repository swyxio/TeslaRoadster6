import { STARSHIP_GOAL, STARSHIP_LAUNCH_DELAY_MS, type StarshipContributors, type StarshipStatus } from '../shared/starship';
import { normalizeName } from './global-chat-core';

type Completion = { completedAt:number; launchAt:number; launchId:string; total:number };
const incomeKey=(driverId:string)=>`income:${driverId}`;
const launchKey=(driverId:string)=>`launch-income:${driverId}`;
const nameKey=(driverId:string)=>`launch-name:${driverId}`;
const PAGE_SIZE=20, SCAN_SIZE=50;

function validId(driverId:string):void {
  if(typeof driverId!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(driverId))throw new Error('Invalid driver identity');
}
function validIncome(amount:number):void {
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Invalid income credit');
}
function complete(total:number):Completion {
  const completedAt=Date.now();
  return {completedAt,launchAt:completedAt+STARSHIP_LAUNCH_DELAY_MS,launchId:crypto.randomUUID(),total};
}
function status(total:number,personal:number,completion:Completion|undefined):StarshipStatus {
  return {total,personal,launchTotal:completion?.total??null,completedAt:completion?.completedAt??null,launchAt:completion?.launchAt??null,launchId:completion?.launchId??null};
}

/**
 * Methods for the existing GlobalIncome object's storage. The `income:*` and
 * `total` keys remain the canonical high-water marks; no second ledger is used.
 * Call only from trusted worker RPCs. A client never chooses its driver ID.
 */
export class StarshipLedger {
  constructor(private storage:DurableObjectStorage) {}

  async credit(driverId:string,cumulative:number):Promise<number> {
    validId(driverId);validIncome(cumulative);
    return this.storage.transaction(async txn=>{
      const key=incomeKey(driverId),previous=await txn.get<number>(key)??0,total=await txn.get<number>('total')??0;
      validIncome(previous);validIncome(total);
      let completion=await txn.get<Completion>('launch-completion');
      const next=total+Math.max(0,cumulative-previous);
      validIncome(next);
      if(cumulative>previous){
        // Lazy copy-on-write freezes the entire existing income:* keyspace at
        // crossing without an unbounded transaction or a migration. A zero
        // snapshot excludes identities whose first credit arrives later.
        if(completion && await txn.get<number>(launchKey(driverId))===undefined)
          await txn.put(launchKey(driverId),previous);
        await txn.put({[key]:cumulative,total:next});
      }
      if(!completion && next>=STARSHIP_GOAL){
        completion=complete(next);
        await txn.put('launch-completion',completion);
      }
      return next;
    });
  }

  async status(driverId?:string):Promise<StarshipStatus> {
    if(driverId!==undefined)validId(driverId);
    return this.storage.transaction(async txn=>{
      const total=await txn.get<number>('total')??0;
      const personal=driverId===undefined?0:await txn.get<number>(incomeKey(driverId))??0;
      let completion=await txn.get<Completion>('launch-completion');
      // If the pre-existing counter already reached the goal before this code
      // was installed, record the launch once on first observation. The prior
      // crossing time cannot be reconstructed from a cumulative counter.
      if(!completion && total>=STARSHIP_GOAL){completion=complete(total);await txn.put('launch-completion',completion);}
      return status(total,personal,completion);
    });
  }

  /** Names are private by default and can be hidden again after the launch. */
  async publicName(driverId:string):Promise<string|null> {
    validId(driverId);
    return await this.storage.get<string>(nameKey(driverId))??null;
  }

  async setPublicName(driverId:string,name:string|null):Promise<string|null> {
    validId(driverId);
    if(name!==null && (typeof name!=='string'||name.length>256))throw new Error('Invalid public name');
    const normalized=name===null?null:normalizeName(name);
    if(normalized===null)await this.storage.delete(nameKey(driverId));
    else await this.storage.put(nameKey(driverId),normalized);
    return normalized;
  }

  /** Bounded scan over the frozen launch amounts. Cursors contain no plain driver ID. */
  async contributors(cursor?:string):Promise<StarshipContributors> {
    const startAfter=cursor===undefined?undefined:await this.decodeCursor(cursor);
    const page=await this.storage.transaction(async txn=>{
      if(!await txn.get<Completion>('launch-completion'))return {contributors:[],after:undefined as string|undefined};
      const rows=await txn.list<number>({prefix:'income:',...(startAfter?{startAfter}:{}),limit:SCAN_SIZE});
      const ids=[...rows.keys()].map(key=>key.slice('income:'.length));
      const details=ids.length?await txn.get<unknown>(ids.flatMap(id=>[launchKey(id),nameKey(id)])):new Map<string,unknown>();
      const entries:StarshipContributors['contributors']=[];
      let last:string|undefined,seen=0;
      for(const [key,current] of rows){
        seen++;last=key;
        const id=key.slice('income:'.length),frozen=details.get(launchKey(id));
        const amount=typeof frozen==='number'?frozen:current;
        if(amount>0){
          const publicName=details.get(nameKey(id));
          entries.push({name:typeof publicName==='string'?publicName:'Anonymous driver',amount});
        }
        if(entries.length===PAGE_SIZE)break;
      }
      const more=seen<rows.size||rows.size===SCAN_SIZE;
      return {contributors:entries,after:more?last:undefined};
    });
    return {contributors:page.contributors,next:page.after?await this.encodeCursor(page.after):null};
  }

  private async cursorKey():Promise<CryptoKey> {
    const fresh=Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const stored=await this.storage.transaction(async txn=>{
      const old=await txn.get<number[]>('launch-cursor-key');
      if(old)return old;
      await txn.put('launch-cursor-key',fresh);return fresh;
    });
    return crypto.subtle.importKey('raw',new Uint8Array(stored),'AES-GCM',false,['encrypt','decrypt']);
  }
  private async encodeCursor(key:string):Promise<string> {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await this.cursorKey(),new TextEncoder().encode(key)));
    const bytes=new Uint8Array(iv.length+encrypted.length);bytes.set(iv);bytes.set(encrypted,iv.length);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  }
  private async decodeCursor(cursor:string):Promise<string> {
    if(typeof cursor!=='string'||cursor.length>512||!/^[a-zA-Z0-9_-]+$/.test(cursor))throw new Error('Invalid contributor cursor');
    try{
      const raw=atob(cursor.replaceAll('-','+').replaceAll('_','/'));
      const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
      if(bytes.length<29)throw new Error('Invalid cursor');
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await this.cursorKey(),bytes.slice(12));
      const key=new TextDecoder().decode(plaintext);
      if(!key.startsWith('income:'))throw new Error('Invalid cursor');
      validId(key.slice('income:'.length));
      return key;
    }catch{throw new Error('Invalid contributor cursor');}
  }
}

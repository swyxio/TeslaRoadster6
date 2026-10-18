import { STARSHIP_GOAL, STARSHIP_LAUNCH_DELAY_MS, type StarshipContributorGroup, type StarshipContributors, type StarshipStatus } from '../shared/starship';
import { normalizeName } from './global-chat-core';

type Completion =
  | {kind:'recorded';completedAt:number;launchAt:number;launchId:string;total:number}
  | {kind:'unknown';observedAt:number;total:number};
type ContributorIndex = {upper:string|null;after:string|null;done:boolean};
const incomeKey=(driverId:string)=>`income:${driverId}`;
const launchKey=(driverId:string)=>`launch-income:${driverId}`;
const nameKey=(driverId:string)=>`launch-name:${driverId}`;
const indexKey=(driverId:string)=>`launch-index:${driverId}`;
const PAGE_SIZE=20, SCAN_SIZE=50;

function validId(driverId:string):void {
  if(typeof driverId!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(driverId))throw new Error('Invalid driver identity');
}
function validIncome(amount:number):void {
  if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Invalid income credit');
}
function complete(total:number):Completion {
  const completedAt=Date.now();
  return {kind:'recorded',completedAt,launchAt:completedAt+STARSHIP_LAUNCH_DELAY_MS,launchId:crypto.randomUUID(),total};
}
function status(total:number,personal:number|null,completion:Completion|undefined):StarshipStatus {
  const recorded=completion?.kind==='recorded'?completion:null;
  const cutover=completion?.kind==='unknown'?completion:null;
  return {total,personal,crossing:completion?.kind??'pending',launchTotal:recorded?.total??null,
    completedAt:recorded?.completedAt??null,launchAt:recorded?.launchAt??null,launchId:recorded?.launchId??null,
    cutoverTotal:cutover?.total??null,cutoverAt:cutover?.observedAt??null};
}

/** The upper bound and completion marker must describe the same transaction. */
async function saveCompletion(txn:DurableObjectTransaction,completion:Completion,crossingKey?:string):Promise<void> {
  const last=await txn.list<number>({prefix:'income:',reverse:true,limit:1});
  let upper=[...last.keys()][0]??null;
  if(crossingKey && (upper===null||crossingKey>upper))upper=crossingKey;
  const index:ContributorIndex={upper,after:null,done:upper===null};
  await txn.put({'launch-completion':completion,'launch-index-state':index});
}

/** Freeze the cutover state before a new credit can change a legacy counter. */
async function captureExisting(txn:DurableObjectTransaction,total:number):Promise<Completion|undefined> {
  let completion=await txn.get<Completion>('launch-completion');
  if(!completion && total>=STARSHIP_GOAL){
    completion={kind:'unknown',observedAt:Date.now(),total};
    await saveCompletion(txn,completion);
  }
  return completion;
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
      let completion=await captureExisting(txn,total);
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
        await saveCompletion(txn,completion,key);
      }
      return next;
    });
  }

  async status(driverId?:string):Promise<StarshipStatus> {
    if(driverId!==undefined)validId(driverId);
    return this.storage.transaction(async txn=>{
      const total=await txn.get<number>('total')??0;validIncome(total);
      const personal=driverId===undefined?null:await txn.get<number>(incomeKey(driverId))??0;
      const completion=await captureExisting(txn,total);
      return status(total,personal,completion);
    });
  }

  /** Names are private by default and can be hidden again after the launch. */
  async publicName(driverId:string):Promise<string|null> {
    validId(driverId);
    return await this.storage.get<string>(nameKey(driverId))??null;
  }

  async setPublicName(driverId:string,name:string|null,revision:number):Promise<string|null> {
    validId(driverId);
    if(!Number.isSafeInteger(revision)||revision<1)throw new Error('Invalid privacy revision');
    if(name!==null && (typeof name!=='string'||name.length>256))throw new Error('Invalid public name');
    const normalized=name===null?null:normalizeName(name);
    return this.storage.transaction(async txn=>{
      const key=nameKey(driverId),versionKey=`launch-name-version:${driverId}`;
      const previous=await txn.get<number>(versionKey)??0;
      if(revision<previous)return await txn.get<string>(key)??null;
      if(revision===previous){
        const current=await txn.get<string>(key)??null;
        if(current!==normalized)throw new Error('Privacy revision conflict');
        return current;
      }
      await txn.put(versionKey,revision);
      if(normalized===null)await txn.delete(key);else await txn.put(key,normalized);
      return normalized;
    });
  }

  /** The goal index is frozen. Later confirmations page the live copy-on-write keys. */
  async contributors(group:StarshipContributorGroup,cursor?:string):Promise<StarshipContributors> {
    if(group!=='at-goal'&&group!=='later')throw new Error('Invalid contributor group');
    const prefix=group==='at-goal'?'launch-index:':'launch-income:';
    const startAfter=cursor===undefined?undefined:await this.decodeCursor(cursor,prefix);
    const page=await this.storage.transaction(async txn=>{
      const total=await txn.get<number>('total')??0;validIncome(total);
      if(!await captureExisting(txn,total))return {state:'pending' as const,contributors:[],after:undefined as string|undefined};
      if(group==='later'){
        const rows=await txn.list<number>({prefix,...(startAfter?{startAfter}:{}),limit:PAGE_SIZE+1});
        const selected=[...rows].slice(0,PAGE_SIZE);
        const ids=selected.map(([key])=>key.slice(prefix.length));
        const details=ids.length?await txn.get<unknown>(ids.flatMap(id=>[incomeKey(id),nameKey(id)])):new Map<string,unknown>();
        const entries:StarshipContributors['contributors']=[];
        for(const [key,frozen] of selected){
          const id=key.slice(prefix.length),current=details.get(incomeKey(id)),publicName=details.get(nameKey(id));
          validIncome(frozen);
          if(typeof current!=='number')throw new Error('Missing contributor income');
          validIncome(current);
          if(current<=frozen)throw new Error('Invalid contributor snapshot');
          entries.push({name:typeof publicName==='string'?publicName:'Anonymous driver',amount:typeof publicName==='string'?current-frozen:null});
        }
        return {state:'ready' as const,contributors:entries,after:rows.size>PAGE_SIZE?selected.at(-1)?.[0]:undefined};
      }
      const index=await txn.get<ContributorIndex>('launch-index-state');
      if(!index)throw new Error('Missing contributor index snapshot');
      if(!index.done){
        const rows=await txn.list<number>({prefix:'income:',...(index.after?{startAfter:index.after}:{}),limit:SCAN_SIZE});
        const frozenRows=[...rows].filter(([key])=>index.upper!==null&&key<=index.upper);
        const ids=frozenRows.map(([key])=>key.slice('income:'.length));
        const snapshots=ids.length?await txn.get<number>(ids.map(launchKey)):new Map<string,number>();
        const writes:Record<string,number|ContributorIndex>={};
        for(const [key,current] of frozenRows){
          const id=key.slice('income:'.length),amount=snapshots.get(launchKey(id))??current;
          validIncome(amount);
          if(amount>0)writes[indexKey(id)]=amount;
        }
        const last=frozenRows.at(-1)?.[0]??index.after;
        const done=frozenRows.length<rows.size||rows.size<SCAN_SIZE||last===index.upper;
        writes['launch-index-state']={...index,after:last,done};
        await txn.put(writes);
        // The next request observes the committed index, including the final batch.
        return {state:'building' as const,contributors:[],after:undefined as string|undefined};
      }
      const rows=await txn.list<number>({prefix,...(startAfter?{startAfter}:{}),limit:PAGE_SIZE+1});
      const selected=[...rows].slice(0,PAGE_SIZE);
      const ids=selected.map(([key])=>key.slice(prefix.length));
      const names=ids.length?await txn.get<string>(ids.map(nameKey)):new Map<string,string>();
      const entries:StarshipContributors['contributors']=[];
      for(const [key,amount] of selected){
        validIncome(amount);
        const id=key.slice(prefix.length),publicName=names.get(nameKey(id));
        entries.push({name:typeof publicName==='string'?publicName:'Anonymous driver',amount:typeof publicName==='string'?amount:null});
      }
      return {state:'ready' as const,contributors:entries,after:rows.size>PAGE_SIZE?selected.at(-1)?.[0]:undefined};
    });
    return {group,state:page.state,contributors:page.contributors,next:page.after?await this.encodeCursor(page.after):null};
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
  private async decodeCursor(cursor:string,prefix:string):Promise<string> {
    if(typeof cursor!=='string'||cursor.length>512||!/^[a-zA-Z0-9_-]+$/.test(cursor))throw new Error('Invalid contributor cursor');
    try{
      const raw=atob(cursor.replaceAll('-','+').replaceAll('_','/'));
      const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0));
      if(bytes.length<29)throw new Error('Invalid cursor');
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await this.cursorKey(),bytes.slice(12));
      const key=new TextDecoder().decode(plaintext);
      if(!key.startsWith(prefix))throw new Error('Invalid cursor');
      validId(key.slice(prefix.length));
      return key;
    }catch{throw new Error('Invalid contributor cursor');}
  }
}

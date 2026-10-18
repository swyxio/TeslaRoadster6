import { levelForCash } from '../shared/delivery';
import type { DriverProgress } from './driver-profile';
import { marketCatalogItem } from '../shared/market-catalog';
import type { MarketPaint } from '../shared/market-protocol';

/** Internal RPCs: the room authenticates the actor, and the market owns decisions. */
export type MarketWalletIntent = {transactionId:string;driverId:string;delta:number;propertyGate:boolean;paint?:MarketPaint|null;expectedPaint?:MarketPaint|null};
export type MarketWalletPrepared =
  | {ok:true;cash:number;earned:number;eligibleIncome:number}
  | {ok:false;reason:'busy'|'invalid'|'missing'|'insufficient-funds'|'property-gate'|'balance-overflow'|'conflict'};
type DriverRecord = {driverId:string;fence:string;roomId:string;revision:number;sequence:number;sealed:boolean;progress:DriverProgress;incomeActivated:boolean;marketPaint?:MarketPaint|null};
type Lock = {intent:MarketWalletIntent;phase:'pausing'|'prepared'|'applied'|'releasing';prepared?:MarketWalletPrepared;newFence?:string;decision?:'commit'|'abort'};
type Receipt = {intent:MarketWalletIntent;prepared:MarketWalletPrepared;decision:'commit'|'abort';fence:string;roomId:string;resumed:boolean};
export const MARKET_LOCK_KEY='market:lock';
const receiptKey=(id:string)=>`market:receipt:${id}`;
const same=(a:MarketWalletIntent,b:MarketWalletIntent)=>a.transactionId===b.transactionId&&a.driverId===b.driverId&&a.delta===b.delta&&a.propertyGate===b.propertyGate&&JSON.stringify(a.paint)===JSON.stringify(b.paint)&&JSON.stringify(a.expectedPaint)===JSON.stringify(b.expectedPaint);
const validPaint=(paint:MarketPaint|null)=>paint===null||(typeof paint.assetId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(paint.assetId)&&marketCatalogItem(paint.catalogId)?.kind==='cosmetic');
const valid=(intent:MarketWalletIntent)=>!!intent&&typeof intent.transactionId==='string'&&intent.transactionId.length>0&&intent.transactionId.length<=256&&
  typeof intent.driverId==='string'&&intent.driverId.length>0&&intent.driverId.length<=128&&Number.isSafeInteger(intent.delta)&&typeof intent.propertyGate==='boolean'&&
  ((intent.paint===undefined&&intent.expectedPaint===undefined)||(intent.paint!==undefined&&intent.expectedPaint!==undefined&&validPaint(intent.paint)&&validPaint(intent.expectedPaint)));

/** Implemented by the room; all three callbacks are idempotent and never hold a storage transaction. */
export type MarketRoomHandoff = {
  pause(driverId:string,fence:string,transactionId:string,roomId:string):Promise<boolean>;
  drain(driverId:string,fence:string,roomId:string):Promise<void>;
  install(driverId:string,oldFence:string,newFence:string,transactionId:string,roomId:string,revision:number,sequence:number,progress:DriverProgress,marketPaint:MarketPaint|null):Promise<void>;
  resume(driverId:string,fence:string,transactionId:string,roomId:string):Promise<void>;
};

/** Profile-local participant of a durable, externally coordinated transaction. */
export class MarketWallet {
  private preparing=new Map<string,{intent:MarketWalletIntent;promise:Promise<MarketWalletPrepared>}>();
  constructor(private storage:DurableObjectStorage,private room:MarketRoomHandoff){}

  prepare(intent:MarketWalletIntent):Promise<MarketWalletPrepared>{
    if(!valid(intent))return Promise.resolve({ok:false,reason:'invalid'});
    const existing=this.preparing.get(intent.transactionId);
    if(existing)return same(existing.intent,intent)?existing.promise:Promise.resolve({ok:false,reason:'conflict'});
    const promise=this.prepareOnce(intent).finally(()=>{if(this.preparing.get(intent.transactionId)?.promise===promise)this.preparing.delete(intent.transactionId);});
    this.preparing.set(intent.transactionId,{intent,promise});return promise;
  }

  private async prepareOnce(intent:MarketWalletIntent):Promise<MarketWalletPrepared>{
    const initial=await this.storage.transaction(async txn=>{
      const receipt=await txn.get<Receipt>(receiptKey(intent.transactionId));
      if(receipt)return {done:same(receipt.intent,intent)?receipt.prepared:{ok:false,reason:'conflict'} as MarketWalletPrepared};
      const existing=await txn.get<Lock>(MARKET_LOCK_KEY);
      if(existing){
        if(!same(existing.intent,intent))return {done:{ok:false,reason:existing.intent.transactionId===intent.transactionId?'conflict':'busy'} as MarketWalletPrepared};
        if(existing.prepared)return {done:existing.prepared};
      }
      const driver=await txn.get<DriverRecord>('driver');
      if(!driver||driver.driverId!==intent.driverId)return {done:{ok:false,reason:'missing'} as MarketWalletPrepared};
      if(!existing)await txn.put(MARKET_LOCK_KEY,{intent,phase:'pausing'} satisfies Lock);
      return {driver};
    });
    if('done' in initial)return initial.done!;
    const driver=initial.driver!;
    // Pausing permits the old fence to drain; acquire must refuse while the
    // lock exists. freeze() reconciles the durable journal and seals the fence.
    if(!await this.room.pause(driver.driverId,driver.fence,intent.transactionId,driver.roomId)){
      return this.storage.transaction(async txn=>{
        const prior=await txn.get<Receipt>(receiptKey(intent.transactionId));
        if(prior)return same(prior.intent,intent)?prior.prepared:{ok:false,reason:'conflict'};
        const lock=await txn.get<Lock>(MARKET_LOCK_KEY),current=await txn.get<DriverRecord>('driver');
        if(!lock||!same(lock.intent,intent)||!current||current.fence!==driver.fence)return {ok:false,reason:'conflict'};
        const prepared:MarketWalletPrepared={ok:false,reason:'busy'};
        await txn.put(receiptKey(intent.transactionId),{intent,prepared,decision:'abort',fence:current.fence,roomId:current.roomId,resumed:true} satisfies Receipt);
        await txn.delete(MARKET_LOCK_KEY);return prepared;
      });
    }
    await this.room.drain(driver.driverId,driver.fence,driver.roomId);
    return this.storage.transaction(async txn=>{
      const receipt=await txn.get<Receipt>(receiptKey(intent.transactionId));
      if(receipt)return same(receipt.intent,intent)?receipt.prepared:{ok:false,reason:'conflict'};
      const lock=await txn.get<Lock>(MARKET_LOCK_KEY),current=await txn.get<DriverRecord>('driver');
      if(!lock||!same(lock.intent,intent))return {ok:false,reason:'conflict'};
      if(lock.prepared)return lock.prepared;
      if(!current||current.driverId!==intent.driverId||current.fence!==driver.fence||!current.sealed)throw new Error('Market wallet handoff not sealed');
      const cash=current.progress.cash,next=cash+intent.delta;
      let prepared:MarketWalletPrepared;
      if(intent.expectedPaint!==undefined&&JSON.stringify(current.marketPaint??null)!==JSON.stringify(intent.expectedPaint))prepared={ok:false,reason:'conflict'};
      else if(intent.delta<0&&cash< -intent.delta)prepared={ok:false,reason:'insufficient-funds'};
      else if(intent.propertyGate&&cash<2_000_000)prepared={ok:false,reason:'property-gate'};
      else if(!Number.isSafeInteger(cash)||!Number.isSafeInteger(next))prepared={ok:false,reason:'balance-overflow'};
      else prepared={ok:true,cash,earned:current.progress.earned,eligibleIncome:current.progress.eligibleIncome};
      await txn.put(MARKET_LOCK_KEY,{...lock,phase:'prepared',prepared} satisfies Lock);
      return prepared;
    });
  }

  async apply(transactionId:string):Promise<boolean>{
    return this.storage.transaction(async txn=>{
      const receipt=await txn.get<Receipt>(receiptKey(transactionId));
      if(receipt)return receipt.decision==='commit';
      const lock=await txn.get<Lock>(MARKET_LOCK_KEY),driver=await txn.get<DriverRecord>('driver');
      if(!lock||lock.intent.transactionId!==transactionId||!lock.prepared?.ok||!driver||!driver.sealed)return false;
      if(lock.phase==='applied'||(lock.phase==='releasing'&&lock.decision==='commit'))return true;
      if(lock.phase!=='prepared')return false;
      const cash=driver.progress.cash+lock.intent.delta,revision=driver.revision+1;
      if(driver.progress.cash!==lock.prepared.cash||!Number.isSafeInteger(cash)||!Number.isSafeInteger(revision))throw new Error('Market wallet changed while locked');
      await txn.put('driver',{...driver,revision,progress:{...driver.progress,cash,level:levelForCash(cash)},...(lock.intent.paint!==undefined?{marketPaint:lock.intent.paint}:{})} satisfies DriverRecord);
      await txn.put(MARKET_LOCK_KEY,{...lock,phase:'applied'} satisfies Lock);
      return true;
    });
  }

  async release(transactionId:string,decision:'commit'|'abort'):Promise<boolean>{
    const state=await this.storage.transaction(async txn=>{
      const key=receiptKey(transactionId),receipt=await txn.get<Receipt>(key);
      if(receipt)return receipt.decision===decision?{receipt}:{error:true};
      const lock=await txn.get<Lock>(MARKET_LOCK_KEY),driver=await txn.get<DriverRecord>('driver');
      if(!lock||lock.intent.transactionId!==transactionId)return {absent:true};
      if(!driver||!lock.prepared||(decision==='commit'&&lock.phase!=='applied'&&!(lock.phase==='releasing'&&lock.decision==='commit'))||
         (decision==='abort'&&(lock.phase==='applied'||(lock.phase==='releasing'&&lock.decision==='commit'))))return {error:true};
      if(lock.phase==='releasing'&&lock.decision!==decision)return {error:true};
      const next:Lock={...lock,phase:'releasing',decision,newFence:lock.newFence??crypto.randomUUID()};
      await txn.put(MARKET_LOCK_KEY,next);
      return {lock:next,driver};
    });
    if('error' in state)return false;
    if('absent' in state)return true;
    if('receipt' in state){
      const receipt=state.receipt!;
      if(!receipt.resumed){
        await this.room.resume(receipt.intent.driverId,receipt.fence,transactionId,receipt.roomId);
        await this.storage.transaction(async txn=>{const latest=await txn.get<Receipt>(receiptKey(transactionId));if(latest&&!latest.resumed)await txn.put(receiptKey(transactionId),{...latest,resumed:true} satisfies Receipt);});
      }
      return true;
    }
    const lock=state.lock!,driver=state.driver!,newFence=lock.newFence!;
    // The room stays paused after installing; activation follows durable unseal.
    await this.room.install(driver.driverId,driver.fence,newFence,transactionId,driver.roomId,driver.revision,driver.sequence,driver.progress,driver.marketPaint??null);
    const receipt=await this.storage.transaction(async txn=>{
      const prior=await txn.get<Receipt>(receiptKey(transactionId));
      if(prior)return prior;
      const current=await txn.get<DriverRecord>('driver'),live=await txn.get<Lock>(MARKET_LOCK_KEY);
      if(!current||!live||live.intent.transactionId!==transactionId||live.phase!=='releasing'||live.newFence!==newFence||live.decision!==decision||current.fence!==driver.fence||!current.sealed)throw new Error('Market wallet release changed');
      const result:Receipt={intent:live.intent,prepared:live.prepared!,decision,fence:newFence,roomId:current.roomId,resumed:false};
      await txn.put('driver',{...current,fence:newFence,sealed:false} satisfies DriverRecord);
      await txn.put(receiptKey(transactionId),result);await txn.delete(MARKET_LOCK_KEY);
      return result;
    });
    await this.room.resume(receipt.intent.driverId,receipt.fence,transactionId,receipt.roomId);
    await this.storage.transaction(async txn=>{const latest=await txn.get<Receipt>(receiptKey(transactionId));if(latest&&!latest.resumed)await txn.put(receiptKey(transactionId),{...latest,resumed:true} satisfies Receipt);});
    return true;
  }
}

import { decideMarket, type MarketAccount, type MarketAsset, type MarketCommand, type MarketListing } from '../shared/market';
import { MARKET_CATALOG, marketCatalogItem } from '../shared/market-catalog';
import type { MarketAssetView, MarketKind, MarketListingView, MarketOperationAction, MarketPaint, MarketRequest, MarketResultView, MarketShopView, MarketState } from '../shared/market-protocol';
import { normalizeName } from './global-chat-core';
import type { MarketWalletIntent, MarketWalletPrepared } from './market-wallet';

type OperationRequest=Exclude<MarketRequest,{action:'browse'|'status'}>;
type RequestBody=OperationRequest extends infer T ? T extends OperationRequest ? Omit<T,'requestId'> : never : never;
type AssetRecord={asset:MarketAsset;name:string;description:string;ownerName:string};
type Participant={driverId:string;delta:number;propertyGate:boolean;paint?:MarketPaint|null;expectedPaint?:MarketPaint|null;prepared?:MarketWalletPrepared};
type Pending={actorId:string;transactionId:string;body:RequestBody;action:MarketOperationAction;
  status:'pending'|'completed'|'rejected';reason?:string;phase:'prepare'|'apply'|'release'|'abort'|'done';
  assetId?:string;listingId?:string;price?:number;actorName?:string;participants?:Participant[];
  asset?:AssetRecord;listing?:MarketListing;sellerSlot?:string|null;buyerSlot?:string|null;published?:boolean;paintAssets?:AssetRecord[];lockAssetIds?:string[]};
type Wallet={marketPrepare(intent:MarketWalletIntent):Promise<MarketWalletPrepared>;marketApply(id:string):Promise<boolean>;marketRelease(id:string,decision:'commit'|'abort'):Promise<boolean>};
export type MarketPropertyLookup={status:'available';property:{assetId:string;ownerName:string;completedHome:boolean;revision:number}}|{status:'not-found'|'unavailable'};
const opKey=(actor:string,id:string)=>`market:op:${actor}:${id}`;
const assetKey=(id:string)=>`market:asset:${id}`;
const listingKey=(id:string)=>`market:listing:${id}`;
const assetLock=(id:string)=>`market:asset-lock:${id}`;
const equippedKey=(id:string)=>`market:equipped:${id}`;
const paintLock=(id:string)=>`market:paint-lock:${id}`;
const slotKey=(id:string)=>`market:home-slot:${id}`;
const ownerKey=(owner:string,id:string)=>`market:owner:${owner}:${id}`;
const openKey=(id:string)=>`market:open:${id}`;
const pendingKey=(id:string)=>`market:pending:${id}`;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const positive=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
const nonnegative=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const shortId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
async function bounded<T>(promise:Promise<T>):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Market wallet RPC timed out')),3000);})]);}
  finally{
    if(timer!==undefined)clearTimeout(timer);
    const dispose=Reflect.get(promise,Reflect.get(Symbol,'dispose') as symbol);
    if(typeof dispose==='function')Reflect.apply(dispose,promise,[]);
  }
}
function body(request:OperationRequest):RequestBody {
  const common={type:'market' as const,operationId:request.operationId};
  if(request.action==='acquire')return {...common,action:request.action,catalogId:request.catalogId};
  if(!('listingId' in request)&&request.action!=='list')return {...common,action:request.action,assetId:request.assetId};
  if(request.action==='list')return {...common,action:request.action,assetId:request.assetId,price:request.price};
  if(request.action==='reprice')return {...common,action:request.action,assetId:request.assetId,listingId:request.listingId,expectedRevision:request.expectedRevision,price:request.price};
  return {...common,action:request.action,assetId:request.assetId,listingId:request.listingId,expectedRevision:request.expectedRevision};
}
const same=(a:RequestBody,b:RequestBody)=>JSON.stringify(a)===JSON.stringify(b);
const result=(op:Pending,requestId:number):MarketResultView=>({type:'marketResult',requestId,operationId:op.body.operationId,action:op.action,status:op.status,...(op.reason?{reason:op.reason}:{})});
const starterHome={id:'starter-home',kind:'property' as const,name:'Starter home',description:'A ready-built house in its own visitable room. No extra improvements are included.',price:1_000_000};
const shop:MarketShopView[]=[...MARKET_CATALOG.map(item=>({catalogId:item.id,kind:item.kind,name:item.name,description:item.description,price:item.price})),{catalogId:starterHome.id,kind:starterHome.kind,name:starterHome.name,description:starterHome.description,price:starterHome.price}];

/**
 * One registry serializes asset custody and decisions. Wallets remain in their
 * DriverProfile objects; durable prepare/apply/release is the only bridge.
 * The caller must authenticate actorId before invoking this class. Nothing here
 * is a public HTTP endpoint or a second copy of a spendable wallet.
 */
export class MarketCoordinator {
  private flights=new Map<string,Promise<void>>();
  constructor(private storage:DurableObjectStorage,private wallet:(driverId:string)=>Wallet){}
  private async arm(txn:DurableObjectTransaction){const next=Date.now()+1000,alarm=await txn.getAlarm();if(alarm===null||alarm>next)await txn.setAlarm(next);}

  async status(actorId:string,operationId:string,requestId:number):Promise<MarketResultView>{
    if(!uuid(actorId)||!uuid(operationId))return {type:'marketResult',requestId,operationId,action:null,status:'not-found'};
    const op=await this.storage.get<Pending>(opKey(actorId,operationId));
    return op?result(op,requestId):{type:'marketResult',requestId,operationId,action:null,status:'not-found'};
  }

  async execute(actorId:string,actorName:string,request:OperationRequest):Promise<MarketResultView>{
    const command=body(request),id=request.operationId;
    if(!uuid(actorId)||!uuid(id))return {type:'marketResult',requestId:request.requestId,operationId:id,action:request.action,status:'rejected',reason:'invalid'};
    const key=opKey(actorId,id),transactionId=`${actorId}:${id}`;
    const created=await this.storage.transaction(async txn=>{
      const existing=await txn.get<Pending>(key);
      if(existing)return same(existing.body,command)?existing:{...existing,status:'rejected' as const,reason:'operation-conflict'};
      const record:Pending={actorId,transactionId,body:command,action:request.action,status:'pending',phase:'prepare',actorName:normalizeName(actorName)};
      const reject=async(reason:string)=>{const rejected:Pending={...record,status:'rejected',reason,phase:'done'};await txn.put(key,rejected);return rejected;};
      if(request.action==='acquire'){
        if(!shortId(request.catalogId))return reject('invalid');
        const item=request.catalogId===starterHome.id?starterHome:marketCatalogItem(request.catalogId);if(!item)return reject('unavailable');
        if(item.kind==='property'&&await txn.get(slotKey(actorId)))return reject('home-slot-occupied');
        const id=crypto.randomUUID();
        const asset:MarketAsset=item.kind==='property'
            ?{id,ownerId:actorId,listingId:null,tradable:true,revision:1,kind:'property',completedHome:true}
            :item.kind==='cosmetic'
            ?{id,ownerId:actorId,listingId:null,tradable:true,revision:1,kind:'cosmetic',catalogId:item.id,equipped:false}
            :{id,ownerId:actorId,listingId:null,tradable:true,revision:1,kind:'collectible',catalogId:item.id};
        record.assetId=id;record.price=item.price;record.asset={asset,name:item.name,description:item.description,ownerName:record.actorName!};
        record.participants=[{driverId:actorId,delta:-item.price,propertyGate:item.kind==='property'}];
        await txn.put(assetLock(id),transactionId);
        if(item.kind==='property')await txn.put(slotKey(actorId),`pending:${transactionId}`);
      }else if(request.action==='equip'||request.action==='unequip'){
        if(!uuid(request.assetId))return reject('invalid');
        if(await txn.get(paintLock(actorId))||await txn.get(assetLock(request.assetId)))return reject('asset-locked');
        const selected=await txn.get<AssetRecord>(assetKey(request.assetId));
        if(!selected||selected.asset.ownerId!==actorId||selected.asset.kind!=='cosmetic')return reject('not-owner');
        if(selected.asset.listingId)return reject('asset-locked');
        const old=await txn.get<MarketPaint>(equippedKey(actorId))??null;
        if(selected.asset.equipped!==(old?.assetId===request.assetId))return reject('conflict');
        if(request.action==='unequip'&&old?.assetId!==request.assetId)return reject('not-equipped');
        if(request.action==='equip'&&old?.assetId===request.assetId){
          const done:Pending={...record,status:'completed',phase:'done',assetId:request.assetId};await txn.put(key,done);return done;
        }
        const previous=old?await txn.get<AssetRecord>(assetKey(old.assetId)):undefined;
        if(old&&(!previous||previous.asset.kind!=='cosmetic'||previous.asset.ownerId!==actorId||!previous.asset.equipped||previous.asset.catalogId!==old.catalogId))return reject('conflict');
        if(old&&await txn.get(assetLock(old.assetId)))return reject('asset-locked');
        const records=[...(previous?[previous]:[]),...(request.action==='equip'?[selected]:[])];
        if(records.some(item=>!Number.isSafeInteger(item.asset.revision+1)))return reject('revision-overflow');
        record.paintAssets=records.map(item=>({...item,asset:{...item.asset,revision:item.asset.revision+1,equipped:item.asset.id===request.assetId&&request.action==='equip'} as MarketAsset}));
        record.lockAssetIds=records.map(item=>item.asset.id);
        const paint=request.action==='equip'?{assetId:selected.asset.id,catalogId:selected.asset.catalogId}:null;
        record.participants=[{driverId:actorId,delta:0,propertyGate:false,expectedPaint:old,paint}];
        await txn.put(paintLock(actorId),transactionId);
        for(const id of record.lockAssetIds)await txn.put(assetLock(id),transactionId);
      }else if(request.action==='list'||request.action==='reprice'||request.action==='cancel'){
        if(!uuid(request.assetId)||(request.action==='list'&&!nonnegative(request.price))||
          (request.action==='reprice'&&(!nonnegative(request.price)||!uuid(request.listingId)||!positive(request.expectedRevision)))||
          (request.action==='cancel'&&(!uuid(request.listingId)||!positive(request.expectedRevision))))return reject('invalid');
        if(await txn.get(assetLock(request.assetId)))return reject('asset-locked');
        const stored=await txn.get<AssetRecord>(assetKey(request.assetId));
        const listingId=request.action==='list'?crypto.randomUUID():request.listingId;
        const listing=await txn.get<MarketListing>(listingKey(listingId));
        const input:MarketCommand=request.action==='list'
          ?{type:'create',actorId,operationId:id,assetId:request.assetId,listingId,price:request.price}
          :request.action==='reprice'
            ?{type:'reprice',actorId,operationId:id,assetId:request.assetId,listingId,expectedRevision:request.expectedRevision,price:request.price}
            :{type:'cancel',actorId,operationId:id,assetId:request.assetId,listingId,expectedRevision:request.expectedRevision};
        const decision=decideMarket(input,{asset:stored?.asset??null,listing:listing??null,buyer:null,seller:null,receipt:null});
        if(!decision.result.ok)return reject(decision.result.reason);
        if(decision.writes?.asset&&stored)await txn.put(assetKey(stored.asset.id),{...stored,asset:decision.writes.asset} satisfies AssetRecord);
        if(decision.writes?.listing){
          await txn.put(listingKey(listingId),decision.writes.listing);
          if(decision.writes.listing.status==='open')await txn.put(openKey(listingId),true);else await txn.delete(openKey(listingId));
        }
        const done:Pending={...record,status:'completed',phase:'done',assetId:request.assetId,listingId};await txn.put(key,done);return done;
      }else if(request.action==='buy'){
        if(!uuid(request.assetId)||!uuid(request.listingId)||!positive(request.expectedRevision))return reject('invalid');
        if(await txn.get(assetLock(request.assetId)))return reject('asset-locked');
        const stored=await txn.get<AssetRecord>(assetKey(request.assetId)),listing=await txn.get<MarketListing>(listingKey(request.listingId));
        const buyerSlot=await txn.get<string>(slotKey(actorId))??null,sellerSlot=listing?await txn.get<string>(slotKey(listing.sellerId))??null:null;
        const buyer:MarketAccount={id:actorId,cash:Number.MAX_SAFE_INTEGER,earned:0,purchasedHomeAssetId:buyerSlot};
        const seller:MarketAccount={id:listing?.sellerId??'missing',cash:0,earned:0,purchasedHomeAssetId:sellerSlot};
        const input:MarketCommand={type:'buy',actorId,operationId:id,assetId:request.assetId,listingId:request.listingId,expectedRevision:request.expectedRevision};
        const check=decideMarket(input,{asset:stored?.asset??null,listing:listing??null,buyer,seller,receipt:null});
        if(!check.result.ok)return reject(check.result.reason);
        if(!stored||!listing||check.result.type!=='buy')return reject('invalid');
        record.assetId=request.assetId;record.listingId=request.listingId;record.price=listing.price;record.asset=stored;record.listing=listing;
        record.buyerSlot=buyerSlot;record.sellerSlot=sellerSlot;
        record.participants=[{driverId:actorId,delta:-listing.price,propertyGate:stored.asset.kind==='property'},
          {driverId:listing.sellerId,delta:check.result.sellerCredit,propertyGate:false}].sort((a,b)=>a.driverId.localeCompare(b.driverId));
        await txn.put(assetLock(request.assetId),transactionId);
        if(stored.asset.kind==='property'&&stored.asset.completedHome)await txn.put(slotKey(actorId),`pending:${transactionId}`);
      }else return reject('unavailable');
      await txn.put(key,record);await txn.put(pendingKey(transactionId),key);await this.arm(txn);return record;
    });
    if(created.status==='pending')await this.drive(key);
    const current=created.reason==='operation-conflict'?created:await this.storage.get<Pending>(key)??created;
    return result(current,request.requestId);
  }

  private drive(key:string):Promise<void>{
    const prior=this.flights.get(key);if(prior)return prior;
    const flight=this.advance(key).finally(()=>{if(this.flights.get(key)===flight)this.flights.delete(key);});
    this.flights.set(key,flight);return flight;
  }

  private async advance(key:string):Promise<void>{
    try{
      for(;;){
        const op=await this.storage.get<Pending>(key);if(!op||op.phase==='done')return;
        const participants=op.participants??[];
        if(op.phase==='prepare'){
          const next=participants.find(p=>!p.prepared);
          if(next){
            const prepared=await bounded(this.wallet(next.driverId).marketPrepare({transactionId:op.transactionId,driverId:next.driverId,delta:next.delta,propertyGate:next.propertyGate,...(next.paint!==undefined?{paint:next.paint,expectedPaint:next.expectedPaint}: {})}));
            await this.storage.transaction(async txn=>{
              const current=await txn.get<Pending>(key);if(!current||current.phase!=='prepare')return;
              const updated=current.participants!.map(p=>p.driverId===next.driverId?{...p,prepared}:p);
              await txn.put(key,{...current,participants:updated,...(!prepared.ok?{phase:'abort' as const,reason:prepared.reason}:{} )} satisfies Pending);await this.arm(txn);
            });
            continue;
          }
          await this.storage.transaction(async txn=>{
            const current=await txn.get<Pending>(key);if(!current||current.phase!=='prepare')return;
            if(current.action==='buy'){
              const buyer=current.participants!.find(p=>p.driverId===current.actorId)!,seller=current.participants!.find(p=>p.driverId===current.listing!.sellerId)!;
              if(!buyer.prepared?.ok||!seller.prepared?.ok)throw new Error('Market participants not prepared');
              const command=current.body as {operationId:string;assetId:string;listingId:string;expectedRevision:number};
              const decision=decideMarket({type:'buy',actorId:current.actorId,operationId:command.operationId,assetId:command.assetId,listingId:command.listingId,expectedRevision:command.expectedRevision},
                {asset:current.asset!.asset,listing:current.listing!,buyer:{id:buyer.driverId,cash:buyer.prepared.cash,earned:buyer.prepared.earned,purchasedHomeAssetId:current.buyerSlot??null},
                  seller:{id:seller.driverId,cash:seller.prepared.cash,earned:seller.prepared.earned,purchasedHomeAssetId:current.sellerSlot??null},receipt:null});
              if(!decision.result.ok||!decision.writes?.asset||!decision.writes.listing){
                await txn.put(key,{...current,phase:'abort',reason:decision.result.ok?'invalid':decision.result.reason} satisfies Pending);await this.arm(txn);return;
              }
              current.asset={...current.asset!,asset:decision.writes.asset,ownerName:current.actorName!};current.listing=decision.writes.listing;
            }
            await txn.put(key,{...current,phase:'apply'} satisfies Pending);await this.arm(txn);
          });
          continue;
        }
        if(op.phase==='apply'){
          for(const part of participants)if(!await bounded(this.wallet(part.driverId).marketApply(op.transactionId)))throw new Error('Market wallet apply pending');
          await this.storage.transaction(async txn=>{
            const current=await txn.get<Pending>(key);if(!current||current.phase!=='apply')return;
            if(current.action==='equip'||current.action==='unequip'){
              for(const entry of current.paintAssets??[])await txn.put(assetKey(entry.asset.id),entry);
              const paint=current.participants![0].paint;
              if(paint)await txn.put(equippedKey(current.actorId),paint);else await txn.delete(equippedKey(current.actorId));
              await txn.put(key,{...current,phase:'release',published:true} satisfies Pending);await this.arm(txn);return;
            }
            const asset=current.asset!;
            await txn.put(assetKey(asset.asset.id),asset);await txn.put(ownerKey(current.actorId,asset.asset.id),true);
            if(current.action==='buy'){
              await txn.put(listingKey(current.listingId!),current.listing!);await txn.delete(openKey(current.listingId!));
              await txn.delete(ownerKey(current.listing!.sellerId,asset.asset.id));
              if(current.sellerSlot===asset.asset.id)await txn.delete(slotKey(current.listing!.sellerId));
            }
            if(asset.asset.kind==='property'&&asset.asset.completedHome)await txn.put(slotKey(current.actorId),asset.asset.id);
            await txn.put(key,{...current,phase:'release',published:true} satisfies Pending);await this.arm(txn);
          });
          continue;
        }
        if(op.phase==='release'||op.phase==='abort'){
          const decision=op.phase==='release'?'commit':'abort';
          for(const part of participants)if(!await bounded(this.wallet(part.driverId).marketRelease(op.transactionId,decision)))throw new Error('Market wallet release pending');
          await this.storage.transaction(async txn=>{
            const current=await txn.get<Pending>(key);if(!current||current.phase!==op.phase)return;
            if(current.assetId)await txn.delete(assetLock(current.assetId));
            for(const id of current.lockAssetIds??[])await txn.delete(assetLock(id));
            if(current.action==='equip'||current.action==='unequip')await txn.delete(paintLock(current.actorId));
            if(decision==='abort'&&await txn.get(slotKey(current.actorId))===`pending:${current.transactionId}`)await txn.delete(slotKey(current.actorId));
            await txn.delete(pendingKey(current.transactionId));
            await txn.put(key,{...current,phase:'done',status:decision==='commit'?'completed':'rejected'} satisfies Pending);
          });
          continue;
        }
      }
    }catch{
      await this.storage.transaction(txn=>this.arm(txn));
    }
  }

  async recover():Promise<void>{
    // Visit every page even when an earlier participant remains unavailable.
    let startAfter:string|undefined;
    do{
      const pending=await this.storage.list<string>({prefix:'market:pending:',limit:100,...(startAfter?{startAfter}:{})});
      for(const key of pending.values())await this.drive(key);
      startAfter=pending.size===100?[...pending.keys()].at(-1):undefined;
    }while(startAfter);
    if((await this.storage.list({prefix:'market:pending:',limit:1})).size)await this.storage.transaction(txn=>this.arm(txn));
  }

  async property(assetId:string):Promise<MarketPropertyLookup>{
    if(!uuid(assetId))return {status:'not-found'};
    return this.storage.transaction(async txn=>{
      const entry=await txn.get<AssetRecord>(assetKey(assetId));
      if(!entry||entry.asset.kind!=='property')return {status:'not-found'};
      if(await txn.get(assetLock(assetId)))return {status:'unavailable'};
      return {status:'available',property:{assetId,ownerName:entry.ownerName,completedHome:entry.asset.completedHome,revision:entry.asset.revision}};
    });
  }

  async browse(actorId:string,requestId:number,cursor?:string,ownedCursor?:string):Promise<MarketState>{
    if(!uuid(actorId))throw new Error('Invalid market identity');
    const prefix=`market:owner:${actorId}:`,ownedStart=ownedCursor&&uuid(ownedCursor)?ownerKey(actorId,ownedCursor):undefined;
    const ownedKeys=await this.storage.list({prefix,...(ownedStart?{startAfter:ownedStart}:{}),limit:51});
    const owned:MarketAssetView[]=[];
    const ownIds=[...ownedKeys.keys()].map(key=>key.slice(prefix.length));
    for(const id of ownIds.slice(0,50)){
      const entry=await this.storage.get<AssetRecord>(assetKey(id));
      if(!entry||await this.storage.get(assetLock(id)))continue;
      const a=entry.asset,listing=a.listingId?await this.storage.get<MarketListing>(listingKey(a.listingId)):undefined;
      owned.push({assetId:id,kind:a.kind,name:entry.name,description:entry.description,listingId:a.listingId,
        ...(a.kind==='cosmetic'?{equipped:a.equipped}:{}),...(a.kind==='property'?{completedHome:a.completedHome}:{}),
        ...(listing?.status==='open'?{listing:{listingId:listing.id,revision:listing.revision,price:listing.price}}:{})});
    }
    const start=cursor&&uuid(cursor)?openKey(cursor):undefined;
    const rows=await this.storage.list({prefix:'market:open:',...(start?{startAfter:start}:{}),limit:51});
    const listings:MarketListingView[]=[];const ids=[...rows.keys()].map(key=>key.slice('market:open:'.length));
    for(const id of ids.slice(0,50)){
      const listing=await this.storage.get<MarketListing>(listingKey(id));if(!listing||listing.status!=='open'||await this.storage.get(assetLock(listing.assetId)))continue;
      const asset=await this.storage.get<AssetRecord>(assetKey(listing.assetId));if(!asset)continue;
      listings.push({listingId:id,assetId:listing.assetId,revision:listing.revision,price:listing.price,kind:asset.asset.kind as MarketKind,
        name:asset.name,description:asset.description,sellerName:asset.ownerName,mine:listing.sellerId===actorId,...(asset.asset.kind==='property'?{completedHome:asset.asset.completedHome}:{})});
    }
    return {type:'marketState',requestId,listings,owned,shop,...(ids.length>50?{nextCursor:ids[49]}:{}),...(ownIds.length>50?{nextOwnedCursor:ownIds[49]}:{})};
  }
}

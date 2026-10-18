/** Resale rules for use inside one authoritative durable transaction. */
export const PROPERTY_MARKET_GATE = 2_000_000;

type AssetBase = {
  id:string; ownerId:string; listingId:string|null; tradable:boolean; revision:number;
};
export type MarketAsset = AssetBase & (
  | {kind:'property'; completedHome:boolean}
  | {kind:'cosmetic'; catalogId:string; equipped:boolean}
  | {kind:'collectible'; catalogId:string}
);
export type MarketAccount = { id:string; cash:number; earned:number; purchasedHomeAssetId:string|null };
export type MarketListing = {
  id:string; assetId:string; sellerId:string; price:number; revision:number;
  assetRevision:number; kind:MarketAsset['kind']; catalogId:string|null; completedHome:boolean;
  status:'open'|'cancelled'|'sold'; buyerId:string|null;
};

type CommandBase = { operationId:string; actorId:string; listingId:string; assetId:string };
export type MarketCommand = CommandBase & (
  | { type:'create'; price:number }
  | { type:'reprice'; expectedRevision:number; price:number }
  | { type:'cancel'|'buy'; expectedRevision:number }
);
type Failure = 'invalid'|'not-owner'|'not-tradable'|'equipped'|'asset-locked'|'listing-exists'|'listing-unavailable'|
  'stale-listing'|'asset-changed'|'self-purchase'|'insufficient-funds'|'property-gate'|'home-slot-occupied'|'balance-overflow'|'operation-conflict';
export type MarketResult =
  | { ok:true; type:'create'|'cancel'|'reprice'; listingId:string }
  | { ok:true; type:'buy'; listingId:string; buyerId:string; sellerId:string; price:number; sellerCredit:number; fee:number }
  | { ok:false; reason:Failure };
export type MarketReceipt = { command:MarketCommand; result:MarketResult };
export type MarketRecords = {
  asset:MarketAsset|null; listing:MarketListing|null;
  seller:MarketAccount|null; buyer:MarketAccount|null; receipt:MarketReceipt|null;
};
export type MarketWrites = { asset?:MarketAsset; listing?:MarketListing; seller?:MarketAccount; buyer?:MarketAccount };
export type MarketDecision = { result:MarketResult; receipt:MarketReceipt|null; writes:MarketWrites|null; replayed:boolean };

const id = (value:unknown):value is string => typeof value==='string' && value.length>0 && value.length<=128;
const price = (value:number) => Number.isSafeInteger(value) && value>=0;
const revision = (value:number) => Number.isSafeInteger(value) && value>=1 && value<Number.MAX_SAFE_INTEGER;
const assetRevision = (value:number) => Number.isSafeInteger(value) && value>=1;
const account = (value:MarketAccount|null):value is MarketAccount => !!value && id(value.id) && Number.isSafeInteger(value.cash) &&
  Number.isSafeInteger(value.earned) && (value.purchasedHomeAssetId===null || id(value.purchasedHomeAssetId));
const completedHome = (asset:MarketAsset) => asset.kind==='property' && asset.completedHome;
const catalogId = (asset:MarketAsset) => asset.kind==='property'?null:asset.catalogId;
const validAsset = (asset:MarketAsset) => asset.kind==='property'?typeof asset.completedHome==='boolean':
  asset.kind==='cosmetic'?id(asset.catalogId)&&typeof asset.equipped==='boolean':
  asset.kind==='collectible'?id(asset.catalogId):false;
const matchesTerms = (asset:MarketAsset,listing:MarketListing) => asset.revision===listing.assetRevision &&
  asset.kind===listing.kind && catalogId(asset)===listing.catalogId && completedHome(asset)===listing.completedHome &&
  (asset.kind!=='cosmetic'||!asset.equipped);

function sameCommand(a:MarketCommand,b:MarketCommand):boolean {
  if(a.operationId!==b.operationId||a.actorId!==b.actorId||a.listingId!==b.listingId||a.assetId!==b.assetId||a.type!==b.type)return false;
  if(a.type==='create'&&b.type==='create')return a.price===b.price||(Number.isNaN(a.price)&&Number.isNaN(b.price));
  if(a.type==='reprice'&&b.type==='reprice')return a.expectedRevision===b.expectedRevision&&
    (a.price===b.price||(Number.isNaN(a.price)&&Number.isNaN(b.price)));
  if((a.type==='buy'||a.type==='cancel')&&(b.type==='buy'||b.type==='cancel'))return a.expectedRevision===b.expectedRevision;
  return false;
}

/**
 * The caller authenticates actorId and loads these records, including the prior
 * receipt keyed by actorId + operationId, within the same durable transaction.
 * Persist the returned receipt with all writes, even for a rejected request.
 * A non-null asset.listingId is custody: other operations must not transfer,
 * consume or change sale-relevant state until cancellation or sale. Every
 * sale-relevant change must advance asset.revision. Never expose a result
 * before the transaction commits; a replay returns no writes.
 */
export function decideMarket(command:MarketCommand,records:MarketRecords):MarketDecision {
  if(records.receipt){
    if(sameCommand(records.receipt.command,command))return {result:records.receipt.result,receipt:records.receipt,writes:null,replayed:true};
    return {result:{ok:false,reason:'operation-conflict'},receipt:null,writes:null,replayed:false};
  }
  const finish=(result:MarketResult,writes:MarketWrites|null=null):MarketDecision =>
    ({result,receipt:{command:{...command},result},writes,replayed:false});
  const reject=(reason:Failure)=>finish({ok:false,reason});
  if(!id(command.operationId)||!id(command.actorId)||!id(command.listingId)||!id(command.assetId))return reject('invalid');
  if((command.type==='create'||command.type==='reprice')&&!price(command.price))return reject('invalid');
  if(command.type!=='create'&&!revision(command.expectedRevision))return reject('invalid');
  const asset=records.asset, listing=records.listing;
  if(!asset||asset.id!==command.assetId||!id(asset.ownerId)||!assetRevision(asset.revision)||typeof asset.tradable!=='boolean'||
    !validAsset(asset))return reject('invalid');

  if(command.type==='create'){
    if(asset.ownerId!==command.actorId)return reject('not-owner');
    if(!asset.tradable)return reject('not-tradable');
    if(asset.kind==='cosmetic'&&asset.equipped)return reject('equipped');
    if(asset.listingId!==null)return reject('asset-locked');
    if(listing!==null)return reject('listing-exists');
    const next:MarketListing={id:command.listingId,assetId:asset.id,sellerId:asset.ownerId,price:command.price,revision:1,
      assetRevision:asset.revision,kind:asset.kind,catalogId:catalogId(asset),completedHome:completedHome(asset),status:'open',buyerId:null};
    return finish({ok:true,type:'create',listingId:next.id},{asset:{...asset,listingId:next.id},listing:next});
  }
  if(!listing||listing.id!==command.listingId||listing.assetId!==asset.id||listing.status!=='open'||
    listing.sellerId!==asset.ownerId||asset.listingId!==listing.id||!price(listing.price)||!revision(listing.revision))return reject('listing-unavailable');
  if(command.expectedRevision!==listing.revision)return reject('stale-listing');
  if(command.type==='cancel'||command.type==='reprice'){
    if(command.actorId!==listing.sellerId)return reject('not-owner');
    if(command.type==='cancel')return finish({ok:true,type:'cancel',listingId:listing.id},
      {asset:{...asset,listingId:null},listing:{...listing,status:'cancelled',revision:listing.revision+1}});
    if(!matchesTerms(asset,listing))return reject('asset-changed');
    if(command.type==='reprice'){
      // Leave one safe revision available to cancel or sell the open listing.
      if(listing.revision===Number.MAX_SAFE_INTEGER-1)return reject('invalid');
      return finish({ok:true,type:'reprice',listingId:listing.id},
        {listing:{...listing,price:command.price,revision:listing.revision+1}});
    }
  }
  if(command.type!=='buy')return reject('invalid');
  if(!matchesTerms(asset,listing))return reject('asset-changed');
  if(asset.revision===Number.MAX_SAFE_INTEGER)return reject('invalid');
  if(!asset.tradable)return reject('not-tradable');
  if(command.actorId===listing.sellerId)return reject('self-purchase');
  const buyer=records.buyer,seller=records.seller;
  if(!account(buyer)||!account(seller)||buyer.id!==command.actorId||seller.id!==listing.sellerId)return reject('invalid');
  if(buyer.cash<listing.price)return reject('insufficient-funds');
  if(asset.kind==='property'&&buyer.cash<PROPERTY_MARKET_GATE)return reject('property-gate');
  if(completedHome(asset)&&buyer.purchasedHomeAssetId!==null)return reject('home-slot-occupied');
  // BigInt avoids precision loss when computing 95% near MAX_SAFE_INTEGER.
  const sellerCredit=Number(BigInt(listing.price)*95n/100n),fee=listing.price-sellerCredit;
  const sellerCash=seller.cash+sellerCredit;
  if(!Number.isSafeInteger(sellerCash))return reject('balance-overflow');
  const isHome=completedHome(asset);
  return finish({ok:true,type:'buy',listingId:listing.id,buyerId:buyer.id,sellerId:seller.id,price:listing.price,sellerCredit,fee},{
    asset:{...asset,ownerId:buyer.id,listingId:null,revision:asset.revision+1},
    listing:{...listing,status:'sold',buyerId:buyer.id,revision:listing.revision+1},
    buyer:{...buyer,cash:buyer.cash-listing.price,purchasedHomeAssetId:isHome?asset.id:buyer.purchasedHomeAssetId},
    seller:{...seller,cash:sellerCash,purchasedHomeAssetId:isHome&&seller.purchasedHomeAssetId===asset.id?null:seller.purchasedHomeAssetId},
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideMarket, type MarketAccount, type MarketAsset, type MarketCommand, type MarketListing, type MarketReceipt } from '../shared/market';

const account=(id:string,cash:number,purchasedHomeAssetId:string|null=null):MarketAccount => ({id,cash,earned:100,purchasedHomeAssetId});
const property=(completedHome:boolean,id='property'):MarketAsset => ({id,kind:'property',ownerId:'seller',listingId:null,tradable:true,revision:1,completedHome});

// The real authority must provide this same read/decide/write isolation durably.
class Fixture {
  assets=new Map<string,MarketAsset>(); listings=new Map<string,MarketListing>();
  accounts=new Map<string,MarketAccount>(); receipts=new Map<string,MarketReceipt>();
  constructor(asset:MarketAsset,buyerCash=2_000_000,sellerCash=0){
    this.assets.set(asset.id,asset);this.accounts.set('seller',account('seller',sellerCash));
    this.accounts.set('buyer',account('buyer',buyerCash));this.accounts.set('buyer2',account('buyer2',buyerCash));
  }
  run(command:MarketCommand){
    const key=JSON.stringify([command.actorId,command.operationId]),asset=this.assets.get(command.assetId)??null;
    const listing=this.listings.get(command.listingId)??null;
    const records={asset,listing,seller:this.accounts.get(listing?.sellerId??asset?.ownerId??'')??null,
      buyer:this.accounts.get(command.actorId)??null,receipt:this.receipts.get(key)??null};
    const before=structuredClone(records), decision=decideMarket(command,records);
    assert.deepEqual(records,before,'the decision never mutates its inputs');
    if(decision.receipt&&!decision.replayed)this.receipts.set(key,decision.receipt);
    const w=decision.writes;
    if(w?.asset)this.assets.set(w.asset.id,w.asset);
    if(w?.listing)this.listings.set(w.listing.id,w.listing);
    if(w?.buyer)this.accounts.set(w.buyer.id,w.buyer);
    if(w?.seller)this.accounts.set(w.seller.id,w.seller);
    return decision;
  }
}
const create=(assetId:string,listingId='listing',amount=100,operationId='create'):MarketCommand =>
  ({type:'create',assetId,listingId,price:amount,operationId,actorId:'seller'});
const buy=(assetId:string,actorId='buyer',operationId='buy',expectedRevision=1,listingId='listing'):MarketCommand =>
  ({type:'buy',assetId,listingId,actorId,operationId,expectedRevision});
const reason=(result:ReturnType<Fixture['run']>) => result.result.ok?null:result.result.reason;

test('server-owned cosmetic and collectible instances trade without the property gate',()=>{
  for(const kind of ['cosmetic','collectible'] as const){
    const common={id:'item',ownerId:'seller',listingId:null,tradable:true,revision:1,catalogId:'starter'};
    const asset:MarketAsset=kind==='cosmetic'?{...common,kind,equipped:false}:{...common,kind};
    const f=new Fixture(asset,100);
    f.accounts.set('buyer',account('buyer',100,'existing-home'));
    assert.equal(f.run(create('item','listing',99)).result.ok,true);
    assert.equal(f.run(buy('item')).result.ok,true);
    assert.equal(f.accounts.get('buyer')?.cash,1);
    assert.equal(f.accounts.get('buyer')?.purchasedHomeAssetId,'existing-home');
    assert.equal(f.assets.get('item')?.ownerId,'buyer');
    assert.equal(f.accounts.get('seller')?.cash,94);
  }
});

test('equipped cosmetics cannot enter custody, and altered listed items cannot sell',()=>{
  const asset:MarketAsset={id:'item',ownerId:'seller',listingId:null,tradable:true,revision:1,kind:'cosmetic',catalogId:'paint',equipped:true};
  const f=new Fixture(asset,100);
  assert.equal(reason(f.run(create('item'))),'equipped');
  f.assets.set('item',{...asset,equipped:false});
  assert.equal(f.run(create('item','listing',50,'retry')).result.ok,true);
  f.assets.set('item',{...asset,listingId:'listing'});
  assert.equal(reason(f.run(buy('item'))),'asset-changed');
  f.assets.set('item',{...asset,listingId:'listing',equipped:false,catalogId:'different'});
  assert.equal(reason(f.run(buy('item','buyer','changed-catalog'))),'asset-changed');
  assert.equal(f.run({type:'cancel',assetId:'item',listingId:'listing',actorId:'seller',operationId:'cancel',expectedRevision:1}).result.ok,true);
});

test('listing locks an owned eligible asset, supports repricing and cancellation, and rejects stale or unauthorized changes',()=>{
  const f=new Fixture(property(false,'plot'));
  assert.equal(reason(f.run({...create('plot'),actorId:'buyer'})),'not-owner');
  const creation=create('plot');assert.equal(f.run(creation).result.ok,true);
  assert.equal(f.run(creation).replayed,true);assert.equal(f.listings.get('listing')?.revision,1);
  assert.equal(f.assets.get('plot')?.ownerId,'seller');
  assert.equal(f.assets.get('plot')?.listingId,'listing');
  assert.equal(reason(f.run(create('plot','listing-2',100,'duplicate'))),'asset-locked');
  assert.equal(reason(f.run({type:'cancel',assetId:'plot',listingId:'listing',actorId:'buyer',operationId:'cancel',expectedRevision:1})),'not-owner');
  const reprice:MarketCommand={type:'reprice',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'reprice',expectedRevision:1,price:140};
  assert.equal(f.run(reprice).result.ok,true);assert.equal(f.run(reprice).replayed,true);assert.equal(f.listings.get('listing')?.revision,2);
  assert.equal(reason(f.run(buy('plot','buyer','old-price'))),'stale-listing');
  assert.equal(f.listings.get('listing')?.price,140);
  const cancel:MarketCommand={type:'cancel',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'cancel',expectedRevision:2};
  assert.equal(f.run(cancel).result.ok,true);assert.equal(f.run(cancel).replayed,true);assert.equal(f.listings.get('listing')?.revision,3);
  assert.equal(f.assets.get('plot')?.listingId,null);
  assert.equal(reason(f.run(buy('plot','buyer','cancelled',3))),'listing-unavailable');
  assert.equal(f.run(create('plot','listing-2',0,'relist')).result.ok,true);
});

test('a sale transfers custody and funds once; competing or replayed operations cannot pay twice',()=>{
  const f=new Fixture(property(false,'plot'),2_000_000,80);
  f.run(create('plot','listing',101));
  const command=buy('plot'),first=f.run(command);
  assert.deepEqual(first.result,{ok:true,type:'buy',listingId:'listing',buyerId:'buyer',sellerId:'seller',price:101,sellerCredit:95,fee:6});
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',1_999_899));
  assert.deepEqual(f.accounts.get('seller'),account('seller',175));
  assert.equal(f.assets.get('plot')?.ownerId,'buyer');assert.equal(f.assets.get('plot')?.listingId,null);
  assert.equal(f.assets.get('plot')?.revision,2,'transferring ownership invalidates prior asset revisions');
  assert.equal(f.listings.get('listing')?.status,'sold');
  assert.equal(reason(f.run(buy('plot','buyer2','competing'))),'listing-unavailable');
  const retry=f.run(command);assert.equal(retry.replayed,true);assert.equal(retry.writes,null);assert.deepEqual(retry.result,first.result);
  assert.equal(reason(f.run({...command,expectedRevision:2})),'operation-conflict');
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',1_999_899));assert.deepEqual(f.accounts.get('seller'),account('seller',175));
});

test('property transfers require the pre-purchase balance and a free purchased-home slot',()=>{
  const f=new Fixture(property(true),1_999_999);
  f.accounts.set('seller',account('seller',0,'property'));
  f.run(create('property','listing',0));
  assert.equal(reason(f.run(buy('property','buyer','under-gate'))),'property-gate');
  f.accounts.set('buyer',account('buyer',2_000_000,'other-home'));
  assert.equal(reason(f.run(buy('property','buyer','occupied'))),'home-slot-occupied');
  f.accounts.set('buyer',account('buyer',2_000_000));
  assert.equal(f.run(buy('property','buyer','allowed')).result.ok,true);
  assert.equal(f.accounts.get('buyer')?.cash,2_000_000);
  assert.equal(f.accounts.get('buyer')?.purchasedHomeAssetId,'property');
  assert.equal(f.accounts.get('seller')?.purchasedHomeAssetId,null);

  const plot=new Fixture(property(false),2_000_000);
  plot.accounts.set('buyer',account('buyer',2_000_000,'home'));
  plot.accounts.set('seller',account('seller',0,'other-home'));
  plot.run(create('property','listing',1));
  assert.equal(plot.run(buy('property')).result.ok,true);
  assert.equal(plot.accounts.get('buyer')?.purchasedHomeAssetId,'home');
  assert.equal(plot.accounts.get('seller')?.purchasedHomeAssetId,'other-home');
});

test('a buyer cannot receive changed property terms, even if an external mutation forgot to advance the asset revision',()=>{
  const f=new Fixture(property(false),2_000_000);
  f.run(create('property','listing',1));
  f.assets.set('property',{...property(true),listingId:'listing'});
  assert.equal(reason(f.run(buy('property'))),'asset-changed');
  assert.equal(f.accounts.get('buyer')?.purchasedHomeAssetId,null);
  assert.equal(f.run({type:'cancel',assetId:'property',listingId:'listing',actorId:'seller',operationId:'cancel-changed',expectedRevision:1}).result.ok,true);
  assert.equal(f.assets.get('property')?.listingId,null);
});

test('a revision change invalidates the offer, while the owner can release custody',()=>{
  const f=new Fixture(property(false,'plot'));
  f.run(create('plot'));
  f.assets.set('plot',{...f.assets.get('plot')!,revision:2});
  assert.equal(reason(f.run(buy('plot'))),'asset-changed');
  assert.equal(reason(f.run({type:'reprice',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'reprice-changed',expectedRevision:1,price:10})),'asset-changed');
  assert.equal(f.run({type:'cancel',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'cancel-changed',expectedRevision:1}).result.ok,true);
});

test('safe-integer prices round the seller payment down exactly, including at the maximum',()=>{
  for(const amount of [0,1,19,20,21,101,Number.MAX_SAFE_INTEGER]){
    const f=new Fixture(property(false,'plot'),Number.MAX_SAFE_INTEGER);
    f.run(create('plot','listing',amount));
    const result=f.run(buy('plot')).result;
    assert.equal(result.ok,true);
    if(!result.ok||result.type!=='buy')throw new Error('sale failed');
    const expected=Number(BigInt(amount)*95n/100n);
    assert.equal(result.sellerCredit,expected);assert.equal(result.fee,amount-expected);
    assert.equal(f.accounts.get('buyer')?.cash,Number.MAX_SAFE_INTEGER-amount);
    assert.equal(f.accounts.get('seller')?.cash,expected);
  }
});

test('invalid prices, ineligible assets, self-purchase, insufficient funds, and overflow leave business records unchanged',()=>{
  for(const amount of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const f=new Fixture(property(false,'plot'));assert.equal(reason(f.run(create('plot','listing',amount))),'invalid');
    assert.equal(f.assets.get('plot')?.listingId,null);assert.equal(f.listings.size,0);
  }
  const unavailable=new Fixture({...property(false,'plot'),tradable:false});
  assert.equal(reason(unavailable.run(create('plot'))),'not-tradable');
  const f=new Fixture(property(false,'plot'),99,Number.MAX_SAFE_INTEGER);
  f.run(create('plot'));
  assert.equal(reason(f.run(buy('plot','seller','own'))),'self-purchase');
  assert.equal(reason(f.run(buy('plot','buyer','poor'))),'insufficient-funds');
  f.accounts.set('buyer',account('buyer',2_000_000));
  assert.equal(reason(f.run(buy('plot','buyer','overflow'))),'balance-overflow');
  assert.equal(f.assets.get('plot')?.ownerId,'seller');assert.equal(f.listings.get('listing')?.status,'open');
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',2_000_000));assert.deepEqual(f.accounts.get('seller'),account('seller',Number.MAX_SAFE_INTEGER));
  assert.equal(reason(f.run(buy('plot','buyer','poor'))),'insufficient-funds','a rejected operation also replays its original result');
});

test('the listing must still hold custody of the seller-owned asset and cannot be reused',()=>{
  const f=new Fixture(property(false,'plot'));
  f.run(create('plot'));
  f.assets.set('plot',{...f.assets.get('plot')!,ownerId:'someone-else'});
  assert.equal(reason(f.run(buy('plot'))),'listing-unavailable');
  const next=property(false,'other');f.assets.set(next.id,next);
  assert.equal(reason(f.run(create('other','listing',100,'collision'))),'listing-exists');
});

test('revision exhaustion cannot leave an open listing permanently locked',()=>{
  const f=new Fixture(property(false,'plot'));
  f.run(create('plot'));
  f.listings.set('listing',{...f.listings.get('listing')!,revision:Number.MAX_SAFE_INTEGER-1});
  const expectedRevision=Number.MAX_SAFE_INTEGER-1;
  assert.equal(reason(f.run({type:'reprice',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'exhaust',expectedRevision,price:5})),'invalid');
  assert.equal(f.run({type:'cancel',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'cancel-last',expectedRevision}).result.ok,true);
  assert.equal(f.assets.get('plot')?.listingId,null);
});

test('an exhausted asset revision prevents transfer but still permits cancellation',()=>{
  const asset={...property(false,'plot'),revision:Number.MAX_SAFE_INTEGER};
  const f=new Fixture(asset);
  assert.equal(f.run(create('plot')).result.ok,true);
  assert.equal(reason(f.run(buy('plot'))),'invalid');
  assert.equal(f.run({type:'cancel',assetId:'plot',listingId:'listing',actorId:'seller',operationId:'cancel-max-asset',expectedRevision:1}).result.ok,true);
  assert.equal(f.assets.get('plot')?.listingId,null);
});

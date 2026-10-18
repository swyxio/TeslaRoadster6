import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideMarket, type MarketAccount, type MarketAsset, type MarketCommand, type MarketListing, type MarketReceipt } from '../shared/market';

const account=(id:string,cash:number,purchasedHomeAssetId:string|null=null):MarketAccount => ({id,cash,earned:100,purchasedHomeAssetId});
const item=(id:string,kind:'cosmetic'|'collectible'='cosmetic'):MarketAsset => ({id,kind,ownerId:'seller',listingId:null,tradable:true});
const property=(completedHome:boolean):MarketAsset => ({id:'property',kind:'property',ownerId:'seller',listingId:null,tradable:true,completedHome});

// The real authority must provide this same read/decide/write isolation durably.
class Fixture {
  assets=new Map<string,MarketAsset>(); listings=new Map<string,MarketListing>();
  accounts=new Map<string,MarketAccount>(); receipts=new Map<string,MarketReceipt>();
  constructor(asset:MarketAsset,buyerCash=1000,sellerCash=0){
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

test('listing locks an owned eligible asset, supports repricing and cancellation, and rejects stale or unauthorized changes',()=>{
  const f=new Fixture(item('paint'));
  assert.equal(reason(f.run({...create('paint'),actorId:'buyer'})),'not-owner');
  const creation=create('paint');assert.equal(f.run(creation).result.ok,true);
  assert.equal(f.run(creation).replayed,true);assert.equal(f.listings.get('listing')?.revision,1);
  assert.equal(f.assets.get('paint')?.ownerId,'seller');
  assert.equal(f.assets.get('paint')?.listingId,'listing');
  assert.equal(reason(f.run(create('paint','listing-2',100,'duplicate'))),'asset-locked');
  assert.equal(reason(f.run({type:'cancel',assetId:'paint',listingId:'listing',actorId:'buyer',operationId:'cancel',expectedRevision:1})),'not-owner');
  const reprice:MarketCommand={type:'reprice',assetId:'paint',listingId:'listing',actorId:'seller',operationId:'reprice',expectedRevision:1,price:140};
  assert.equal(f.run(reprice).result.ok,true);assert.equal(f.run(reprice).replayed,true);assert.equal(f.listings.get('listing')?.revision,2);
  assert.equal(reason(f.run(buy('paint','buyer','old-price'))),'stale-listing');
  assert.equal(f.listings.get('listing')?.price,140);
  const cancel:MarketCommand={type:'cancel',assetId:'paint',listingId:'listing',actorId:'seller',operationId:'cancel',expectedRevision:2};
  assert.equal(f.run(cancel).result.ok,true);assert.equal(f.run(cancel).replayed,true);assert.equal(f.listings.get('listing')?.revision,3);
  assert.equal(f.assets.get('paint')?.listingId,null);
  assert.equal(reason(f.run(buy('paint','buyer','cancelled',3))),'listing-unavailable');
  assert.equal(f.run(create('paint','listing-2',0,'relist')).result.ok,true);
});

test('a sale transfers custody and funds once; competing or replayed operations cannot pay twice',()=>{
  const f=new Fixture(item('decal','collectible'),1000,80);
  f.run(create('decal','listing',101));
  const command=buy('decal'),first=f.run(command);
  assert.deepEqual(first.result,{ok:true,type:'buy',listingId:'listing',buyerId:'buyer',sellerId:'seller',price:101,sellerCredit:95,fee:6});
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',899));
  assert.deepEqual(f.accounts.get('seller'),account('seller',175));
  assert.equal(f.assets.get('decal')?.ownerId,'buyer');assert.equal(f.assets.get('decal')?.listingId,null);
  assert.equal(f.listings.get('listing')?.status,'sold');
  assert.equal(reason(f.run(buy('decal','buyer2','competing'))),'listing-unavailable');
  const retry=f.run(command);assert.equal(retry.replayed,true);assert.equal(retry.writes,null);assert.deepEqual(retry.result,first.result);
  assert.equal(reason(f.run({...command,expectedRevision:2})),'operation-conflict');
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',899));assert.deepEqual(f.accounts.get('seller'),account('seller',175));
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

test('safe-integer prices round the seller payment down exactly, including at the maximum',()=>{
  for(const amount of [0,1,19,20,21,101,Number.MAX_SAFE_INTEGER]){
    const f=new Fixture(item('paint'),Number.MAX_SAFE_INTEGER);
    f.run(create('paint','listing',amount));
    const result=f.run(buy('paint')).result;
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
    const f=new Fixture(item('paint'));assert.equal(reason(f.run(create('paint','listing',amount))),'invalid');
    assert.equal(f.assets.get('paint')?.listingId,null);assert.equal(f.listings.size,0);
  }
  const unavailable=new Fixture({...item('paint'),tradable:false});
  assert.equal(reason(unavailable.run(create('paint'))),'not-tradable');
  const f=new Fixture(item('paint'),99,Number.MAX_SAFE_INTEGER);
  f.run(create('paint'));
  assert.equal(reason(f.run(buy('paint','seller','own'))),'self-purchase');
  assert.equal(reason(f.run(buy('paint','buyer','poor'))),'insufficient-funds');
  f.accounts.set('buyer',account('buyer',100));
  assert.equal(reason(f.run(buy('paint','buyer','overflow'))),'balance-overflow');
  assert.equal(f.assets.get('paint')?.ownerId,'seller');assert.equal(f.listings.get('listing')?.status,'open');
  assert.deepEqual(f.accounts.get('buyer'),account('buyer',100));assert.deepEqual(f.accounts.get('seller'),account('seller',Number.MAX_SAFE_INTEGER));
  assert.equal(reason(f.run(buy('paint','buyer','poor'))),'insufficient-funds','a rejected operation also replays its original result');
});

test('the listing must still hold custody of the seller-owned asset and cannot be reused',()=>{
  const f=new Fixture(item('paint'));
  f.run(create('paint'));
  f.assets.set('paint',{...f.assets.get('paint')!,ownerId:'someone-else'});
  assert.equal(reason(f.run(buy('paint'))),'listing-unavailable');
  const next=item('other');f.assets.set(next.id,next);
  assert.equal(reason(f.run(create('other','listing',100,'collision'))),'listing-exists');
});

test('revision exhaustion cannot leave an open listing permanently locked',()=>{
  const f=new Fixture(item('paint'));
  f.run(create('paint'));
  f.listings.set('listing',{...f.listings.get('listing')!,revision:Number.MAX_SAFE_INTEGER-1});
  const expectedRevision=Number.MAX_SAFE_INTEGER-1;
  assert.equal(reason(f.run({type:'reprice',assetId:'paint',listingId:'listing',actorId:'seller',operationId:'exhaust',expectedRevision,price:5})),'invalid');
  assert.equal(f.run({type:'cancel',assetId:'paint',listingId:'listing',actorId:'seller',operationId:'cancel-last',expectedRevision}).result.ok,true);
  assert.equal(f.assets.get('paint')?.listingId,null);
});

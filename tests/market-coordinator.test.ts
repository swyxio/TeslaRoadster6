import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MarketCoordinator } from '../worker/market-coordinator';
import { MARKET_LOCK_KEY, MarketWallet, type MarketWalletIntent } from '../worker/market-wallet';

// The production object uses the same transactional storage API. This fixture
// persists its maps across reconstructed coordinators and wallet participants.
class Storage {
  private values=new Map<string,unknown>();private alarmAt:number|null=null;private tail=Promise.resolve();
  async get<T>(key:string):Promise<T|undefined>{const v=this.values.get(key);return v===undefined?undefined:structuredClone(v) as T;}
  async put(key:string,value:unknown){this.values.set(key,structuredClone(value));}
  async delete(key:string){return this.values.delete(key);}
  async list<T>(options:{prefix?:string;startAfter?:string;limit?:number}={}):Promise<Map<string,T>>{
    const keys=[...this.values.keys()].sort().filter(k=>(!options.prefix||k.startsWith(options.prefix))&&(!options.startAfter||k>options.startAfter)).slice(0,options.limit??1000);
    return new Map(keys.map(k=>[k,structuredClone(this.values.get(k)) as T]));
  }
  async getAlarm(){return this.alarmAt;}
  async setAlarm(value:number){this.alarmAt=value;}
  async transaction<T>(fn:(txn:any)=>Promise<T>):Promise<T>{
    let unlock!:()=>void;const preceding=this.tail;this.tail=new Promise<void>(resolve=>{unlock=resolve;});await preceding;
    const data=structuredClone(this.values),self=this;let alarm=this.alarmAt;
    const txn={
      async get(key:string){const value=data.get(key);return value===undefined?undefined:structuredClone(value);},
      async put(key:string,value:unknown){data.set(key,structuredClone(value));},
      async delete(key:string){return data.delete(key);},
      async getAlarm(){return alarm;},async setAlarm(value:number){alarm=value;},
    };
    try{const answer=await fn(txn);self.values=data;self.alarmAt=alarm;return answer;}finally{unlock();}
  }
}
const cf=(storage:Storage)=>storage as unknown as DurableObjectStorage;
type Driver={driverId:string;fence:string;roomId:string;revision:number;sequence:number;sealed:boolean;incomeActivated:boolean;progress:{cash:number;earned:number;eligibleIncome:number;level:number}};
function createDriver(cash:number){
  const id=randomUUID(),storage=new Storage();
  const driver:Driver={driverId:id,fence:randomUUID(),roomId:'bay',revision:0,sequence:0,sealed:false,incomeActivated:true,progress:{cash,earned:23,eligibleIncome:47,level:1}};
  const events:string[]=[];let failApply=false,failResume=false;
  const room={
    async pause(){events.push('pause');return true;},
    async drain(){events.push('drain');await storage.transaction(async txn=>{const current=await txn.get('driver');await txn.put('driver',{...current,sealed:true});});},
    async install(){events.push('install');},
    async resume(){events.push('resume');if(failResume){failResume=false;throw new Error('lost resume reply');}},
  };
  const participant=()=>new MarketWallet(cf(storage),room);
  const wallet={
    marketPrepare:(intent:MarketWalletIntent)=>participant().prepare(intent),
    async marketApply(tx:string){const ok=await participant().apply(tx);if(failApply){failApply=false;throw new Error('lost apply reply');}return ok;},
    marketRelease:(tx:string,decision:'commit'|'abort')=>participant().release(tx,decision),
  };
  return {id,storage,driver,wallet,events,seed:()=>storage.put('driver',driver),failApply:()=>{failApply=true;},failResume:()=>{failResume=true;}};
}
const acquire=(catalogId:string,operationId=randomUUID())=>({type:'market' as const,action:'acquire' as const,catalogId,operationId,requestId:1});

test('market settlement recovers a lost wallet reply, transfers once, and resumes before completion',async()=>{
  const seller=createDriver(100_000),buyer=createDriver(100_000),third=createDriver(100_000);
  await Promise.all([seller.seed(),buyer.seed(),third.seed()]);
  const stores=new Map([seller,buyer,third].map(driver=>[driver.id,driver]));
  const state=new Storage(),coordinator=()=>new MarketCoordinator(cf(state),id=>stores.get(id)!.wallet);
  const market=coordinator(),item=acquire('pacific-blue-paint');
  assert.equal((await market.execute(seller.id,'Seller',item)).status,'completed');
  assert.equal((await seller.storage.get<Driver>('driver'))!.progress.cash,98_000);
  const owned=(await market.browse(seller.id,1)).owned;assert.equal(owned.length,1);
  const assetId=owned[0].assetId;
  const list={type:'market' as const,action:'list' as const,requestId:2,operationId:randomUUID(),assetId,price:101};
  assert.equal((await market.execute(seller.id,'Seller',list)).status,'completed');
  const listing=(await market.browse(buyer.id,3)).listings[0];assert.equal(listing.revision,1);assert.equal(listing.mine,false);
  assert.equal((await market.browse(seller.id,3)).listings[0].mine,true);
  const buy={type:'market' as const,action:'buy' as const,requestId:4,operationId:randomUUID(),assetId,listingId:listing.listingId,expectedRevision:1};
  // The debit commits, but its response is lost before the coordinator advances.
  buyer.failApply();
  assert.equal((await market.execute(buyer.id,'Buyer',buy)).status,'pending');
  assert.equal((await buyer.storage.get<Driver>('driver'))!.progress.cash,99_899);
  assert.ok(await buyer.storage.get(MARKET_LOCK_KEY));
  assert.equal((await market.browse(third.id,5)).listings.length,0,'in-flight custody is not offered twice');
  const competing={...buy,operationId:randomUUID(),requestId:5};
  assert.equal((await market.execute(third.id,'Third',competing)).status,'rejected');
  buyer.failResume();
  const restarted=coordinator();await restarted.recover();
  assert.equal((await restarted.status(buyer.id,buy.operationId,6)).status,'pending','a lost resume reply keeps the result pending');
  await coordinator().recover();
  assert.equal((await coordinator().status(buyer.id,buy.operationId,7)).status,'completed');
  assert.equal((await buyer.storage.get<Driver>('driver'))!.progress.cash,99_899);
  assert.equal((await seller.storage.get<Driver>('driver'))!.progress.cash,98_095);
  assert.deepEqual([(await buyer.storage.get<Driver>('driver'))!.progress.earned,(await seller.storage.get<Driver>('driver'))!.progress.eligibleIncome],[23,47]);
  assert.equal(await buyer.storage.get(MARKET_LOCK_KEY),undefined);
  assert.equal((await coordinator().browse(buyer.id,8)).owned[0].assetId,assetId);
  assert.equal((await coordinator().execute(buyer.id,'Buyer',buy)).status,'completed');
  assert.equal((await coordinator().execute(buyer.id,'Buyer',{...buy,expectedRevision:2})).reason,'operation-conflict');
  assert.ok(buyer.events.indexOf('install')<buyer.events.lastIndexOf('resume'));
});

test('zero-price property transfer still enforces the gate and retains rejected outcomes',async()=>{
  const owner=createDriver(1_999_999),seller=createDriver(1_000);await Promise.all([owner.seed(),seller.seed()]);const registry=new Storage();
  const wallets=new Map([owner,seller].map(driver=>[driver.id,driver.wallet]));
  const market=new MarketCoordinator(cf(registry),id=>wallets.get(id)!);
  // A fixture supplies property custody; no public API can mint undeveloped
  // property until the corresponding playable property system exists.
  const assetId=randomUUID(),asset={id:assetId,ownerId:seller.id,listingId:null,tradable:true,revision:1,kind:'property',completedHome:true};
  await registry.put(`market:asset:${assetId}`,{asset,name:'Home',description:'A test home.',ownerName:'Seller'});
  await registry.put(`market:owner:${seller.id}:${assetId}`,true);await registry.put(`market:home-slot:${seller.id}`,assetId);
  assert.deepEqual(await market.property(randomUUID()),{status:'not-found'});
  assert.deepEqual(await market.property(assetId),{status:'available',property:{assetId,ownerName:'Seller',completedHome:true,revision:1}});
  await registry.put(`market:asset-lock:${assetId}`,'pending');assert.deepEqual(await market.property(assetId),{status:'unavailable'});
  await registry.delete(`market:asset-lock:${assetId}`);
  const list={type:'market' as const,action:'list' as const,requestId:1,operationId:randomUUID(),assetId,price:0};
  assert.equal((await market.execute(seller.id,'Seller',list)).status,'completed');
  const listing=(await market.browse(owner.id,2)).listings[0];assert.equal(listing.price,0);
  const request={type:'market' as const,action:'buy' as const,requestId:3,operationId:randomUUID(),assetId,listingId:listing.listingId,expectedRevision:1};
  const denied=await market.execute(owner.id,'Owner',request);
  assert.equal(denied.status,'rejected');assert.equal(denied.reason,'property-gate');
  assert.equal(await owner.storage.get(MARKET_LOCK_KEY),undefined);
  assert.equal((await owner.storage.get<Driver>('driver'))!.progress.cash,1_999_999);
  const loaded=(await owner.storage.get<Driver>('driver'))!;loaded.progress.cash=3_000_000;await owner.storage.put('driver',loaded);
  assert.equal((await market.execute(owner.id,'Owner',request)).reason,'property-gate');
  assert.equal((await market.execute(owner.id,'Owner',{...request,operationId:randomUUID()})).status,'completed');
  assert.equal((await owner.storage.get<Driver>('driver'))!.progress.cash,3_000_000);
  assert.equal((await seller.storage.get<Driver>('driver'))!.progress.cash,1_000);
  assert.equal(await registry.get(`market:home-slot:${owner.id}`),assetId);
  assert.equal(await registry.get(`market:home-slot:${seller.id}`),undefined);
  assert.equal((await market.property(assetId)).status,'available');
  const property=await market.property(assetId);assert.equal(property.status==='available'&&property.property.ownerName,'Owner');
  assert.equal((await market.execute(owner.id,'Owner',acquire('starter-home'))).reason,'home-slot-occupied');
  assert.equal((await market.status(owner.id,randomUUID(),10)).status,'not-found');
});

test('city starter home charges once, enforces the gate and one purchased-home slot',async()=>{
  const owner=createDriver(1_999_999);await owner.seed();const registry=new Storage(),market=new MarketCoordinator(cf(registry),()=>owner.wallet);
  assert.equal((await market.execute(owner.id,'Owner',acquire('starter-home'))).reason,'property-gate');
  const account=(await owner.storage.get<Driver>('driver'))!;account.progress.cash=2_000_000;await owner.storage.put('driver',account);
  const command=acquire('starter-home');assert.equal((await market.execute(owner.id,'Owner',command)).status,'completed');
  assert.equal((await market.execute(owner.id,'Owner',command)).status,'completed');
  assert.equal((await owner.storage.get<Driver>('driver'))!.progress.cash,1_000_000);
  const home=(await market.browse(owner.id,1)).owned[0];assert.equal(home.kind,'property');assert.equal(home.completedHome,true);
  assert.equal((await market.property(home.assetId)).status,'available');
  assert.equal((await market.execute(owner.id,'Owner',acquire('starter-home'))).reason,'home-slot-occupied');
});

test('equipping persists the overlay, locks equipped custody, replaces and clears it exactly once',async()=>{
  const owner=createDriver(20_000);await owner.seed();const registry=new Storage();
  const market=new MarketCoordinator(cf(registry),()=>owner.wallet);
  await market.execute(owner.id,'Owner',acquire('pacific-blue-paint'));
  await market.execute(owner.id,'Owner',acquire('sunrise-gold-paint'));
  const assets=(await market.browse(owner.id,1)).owned,blue=assets.find(a=>a.name==='Pacific Blue')!,gold=assets.find(a=>a.name==='Sunrise Gold')!;
  const action=(action:'equip'|'unequip',assetId:string)=>({type:'market' as const,action,assetId,operationId:randomUUID(),requestId:2});
  const equip=action('equip',blue.assetId);
  owner.failResume();assert.equal((await market.execute(owner.id,'Owner',equip)).status,'pending');
  assert.equal((await market.browse(owner.id,3)).owned.some(a=>a.assetId===blue.assetId),false);
  await new MarketCoordinator(cf(registry),()=>owner.wallet).recover();
  assert.equal((await market.execute(owner.id,'Owner',equip)).status,'completed');
  assert.deepEqual((await owner.storage.get<any>('driver'))!.marketPaint,{assetId:blue.assetId,catalogId:'pacific-blue-paint'});
  const list={type:'market' as const,action:'list' as const,requestId:4,operationId:randomUUID(),assetId:blue.assetId,price:0};
  assert.equal((await market.execute(owner.id,'Owner',list)).reason,'equipped');
  assert.equal((await market.execute(owner.id,'Owner',action('equip',gold.assetId))).status,'completed');
  const refreshed=(await market.browse(owner.id,5)).owned;
  assert.equal(refreshed.find(a=>a.assetId===blue.assetId)?.equipped,false);
  assert.equal(refreshed.find(a=>a.assetId===gold.assetId)?.equipped,true);
  assert.deepEqual((await owner.storage.get<any>('driver'))!.marketPaint,{assetId:gold.assetId,catalogId:'sunrise-gold-paint'});
  assert.equal((await market.execute(owner.id,'Owner',action('unequip',gold.assetId))).status,'completed');
  assert.equal((await owner.storage.get<any>('driver'))!.marketPaint,null);
  assert.equal((await market.execute(owner.id,'Owner',{...list,operationId:randomUUID()})).status,'completed');
});

test('new items remain unavailable until their charged wallet resumes',async()=>{
  const owner=createDriver(20_000);await owner.seed();const registry=new Storage(),market=new MarketCoordinator(cf(registry),()=>owner.wallet);
  owner.failResume();const command=acquire('pacific-blue-paint');
  assert.equal((await market.execute(owner.id,'Owner',command)).status,'pending');
  assert.deepEqual((await market.browse(owner.id,1)).owned,[]);
  const entries=await registry.list({prefix:'market:asset:'});assert.equal(entries.size,1);
  const assetId=[...entries.keys()][0].slice('market:asset:'.length);
  assert.equal((await market.execute(owner.id,'Owner',{type:'market',action:'list',requestId:2,operationId:randomUUID(),assetId,price:0})).reason,'asset-locked');
  await new MarketCoordinator(cf(registry),()=>owner.wallet).recover();
  assert.equal((await market.browse(owner.id,3)).owned.length,1);
  assert.equal((await owner.storage.get<Driver>('driver'))!.progress.cash,18_000);
});

test('concurrent duplicate prepare pauses once and an unsafe hold fails without sealing',async()=>{
  const owner=createDriver(10_000);await owner.seed();let pauses=0,drains=0,releasePause!:()=>void;
  const waiting=new Promise<void>(resolve=>{releasePause=resolve;});
  const wallet=new MarketWallet(cf(owner.storage),{
    async pause(){pauses++;await waiting;return true;},
    async drain(){drains++;const driver=(await owner.storage.get<Driver>('driver'))!;driver.sealed=true;await owner.storage.put('driver',driver);},
    async install(){},async resume(){},
  });
  const intent={transactionId:'one',driverId:owner.id,delta:-100,propertyGate:false};
  const first=wallet.prepare(intent),second=wallet.prepare({...intent});
  while(!pauses)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(pauses,1);releasePause();
  assert.deepEqual(await first,await second);assert.equal(drains,1);
  assert.equal(await wallet.release('one','abort'),true);
  const unsafe=new MarketWallet(cf(owner.storage),{async pause(){return false;},async drain(){throw new Error('must not drain');},async install(){},async resume(){}});
  const denied={transactionId:'unsafe',driverId:owner.id,delta:-100,propertyGate:false};
  assert.deepEqual(await unsafe.prepare(denied),{ok:false,reason:'busy'});
  assert.deepEqual(await unsafe.prepare(denied),{ok:false,reason:'busy'});
  assert.equal(await owner.storage.get(MARKET_LOCK_KEY),undefined);
  assert.equal((await owner.storage.get<Driver>('driver'))!.sealed,false);
  assert.equal(await unsafe.release('unsafe','abort'),true);
});

test('owned and public listing pages advance independently without hiding later assets',async()=>{
  const owner=createDriver(10_000);await owner.seed();const registry=new Storage(),market=new MarketCoordinator(cf(registry),()=>owner.wallet);
  for(let i=0;i<55;i++){
    const assetId=randomUUID(),listingId=randomUUID();
    const asset={id:assetId,ownerId:owner.id,listingId,tradable:true,revision:1,kind:'collectible',catalogId:'bay-bridge-postcard'};
    await registry.put(`market:asset:${assetId}`,{asset,name:`Item ${i}`,description:'An item.',ownerName:'Owner'});
    await registry.put(`market:owner:${owner.id}:${assetId}`,true);
    await registry.put(`market:listing:${listingId}`,{id:listingId,assetId,sellerId:owner.id,price:0,revision:1,assetRevision:1,kind:'collectible',catalogId:'bay-bridge-postcard',completedHome:false,status:'open',buyerId:null});
    await registry.put(`market:open:${listingId}`,true);
  }
  const first=await market.browse(owner.id,1);assert.equal(first.owned.length,50);assert.equal(first.listings.length,50);
  assert.ok(first.nextCursor);assert.ok(first.nextOwnedCursor);
  const nextOwned=await market.browse(owner.id,2,undefined,first.nextOwnedCursor);
  assert.equal(nextOwned.owned.length,5);assert.equal(nextOwned.listings.length,50);assert.equal(nextOwned.nextOwnedCursor,undefined);
  const nextPublic=await market.browse(owner.id,3,first.nextCursor);
  assert.equal(nextPublic.listings.length,5);assert.equal(nextPublic.owned.length,50);assert.equal(nextPublic.nextCursor,undefined);
  assert.equal(new Set([...first.owned,...nextOwned.owned].map(asset=>asset.assetId)).size,55);
  assert.equal(new Set([...first.listings,...nextPublic.listings].map(item=>item.listingId)).size,55);
  assert.ok(nextOwned.owned.every(asset=>asset.listing?.price===0));
  const laterAssets=new Set(nextOwned.owned.map(asset=>asset.assetId));
  assert.equal([...first.listings,...nextPublic.listings].filter(item=>laterAssets.has(item.assetId)&&item.mine).length,5);
});

test('a seller balance overflow aborts without debit or custody transfer',async()=>{
  const seller=createDriver(Number.MAX_SAFE_INTEGER-1),buyer=createDriver(100_000);await Promise.all([seller.seed(),buyer.seed()]);
  const registry=new Storage(),wallets=new Map([seller,buyer].map(driver=>[driver.id,driver.wallet])),market=new MarketCoordinator(cf(registry),id=>wallets.get(id)!);
  const assetId=randomUUID(),asset={id:assetId,ownerId:seller.id,listingId:null,tradable:true,revision:1,kind:'collectible',catalogId:'bay-bridge-postcard'};
  await registry.put(`market:asset:${assetId}`,{asset,name:'Postcard',description:'A postcard.',ownerName:'Seller'});
  await registry.put(`market:owner:${seller.id}:${assetId}`,true);
  assert.equal((await market.execute(seller.id,'Seller',{type:'market',action:'list',requestId:1,operationId:randomUUID(),assetId,price:101})).status,'completed');
  const listing=(await market.browse(buyer.id,2)).listings[0];
  const sale={type:'market' as const,action:'buy' as const,requestId:3,operationId:randomUUID(),assetId,listingId:listing.listingId,expectedRevision:listing.revision};
  const result=await market.execute(buyer.id,'Buyer',sale);assert.equal(result.status,'rejected');assert.equal(result.reason,'balance-overflow');
  assert.equal((await buyer.storage.get<Driver>('driver'))!.progress.cash,100_000);
  assert.equal((await seller.storage.get<Driver>('driver'))!.progress.cash,Number.MAX_SAFE_INTEGER-1);
  assert.equal((await market.browse(seller.id,4)).owned[0].assetId,assetId);
  assert.equal((await market.browse(buyer.id,5)).listings.length,1);
});
